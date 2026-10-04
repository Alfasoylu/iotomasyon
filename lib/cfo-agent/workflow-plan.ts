import { createHash } from 'node:crypto';
import { skuKey } from './sku';
import type { buildOperatingContext } from './operating-context';
import type { Row } from './sources';
export type WorkingContext=Awaited<ReturnType<typeof buildOperatingContext>>;
export type WorkItem={key:string;kind:'research'|'pricing'|'procurement'|'cash'|'liquidation';title:string;priority:number;
  sku?:string;proposal:string;evidence:string[];blockers:string[];cashRequiredTry:number|null;expectedGainTry:number|null;
  suggestedUnits:number|null;requiresApproval:boolean};
export type PlannedQuestion={key:string;sku:string;question:string;why:string;priority:number;area:string};
export type Knowledge={id:string;question:string;answer:string|null;status:string};
export const workflowId=(key:string)=>'cfo-work-'+createHash('sha256').update(key).digest('hex').slice(0,32);
const number=(v:unknown)=>v!=null&&Number.isFinite(Number(v))?Number(v):null;
function knownAnswer(sku:string,context:WorkingContext,knowledge:Knowledge[]) {
  const costWords=/(MALIYET|COST|FATURA)/;
  const folded=(text:string)=>skuKey(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const contains=(text:string)=>{const t=folded(text),key=folded(sku),index=t.indexOf(key);return index>=0&&!/[A-Z0-9_-]/.test(t[index-1]??'')&&!/[A-Z0-9_-]/.test(t[index+key.length]??'');};
  // Matches are context to investigate, never silently converted into financial facts.
  const note=context.notebook?.notes.find(n=>n.source!=='cfo-workflow-v1'&&contains(n.title+' '+n.body)&&costWords.test(folded(n.title+' '+n.body)));
  const question=knowledge.find(q=>contains(q.question)&&costWords.test(folded(q.question))&&q.status!=='IPTAL');
  return note?`not:${note.id}`:question?`soru:${question.id}`:null;
}
export function planCfoWork(context:WorkingContext,settings:Row,knowledge:Knowledge[]=[]){
  const items:WorkItem[]=[];const questions:PlannedQuestion[]=[];
  const add=(item:WorkItem)=>items.push(item);
  const bySku=new Map<string,WorkingContext['operating']['products']>();
  for(const p of context.operating.products){const key=p.resolvedSku;bySku.set(key,[...(bySku.get(key)??[]),p]);}
  for(const q of context.operating.questions){
    const found=knownAnswer(q.sku,context,knowledge);
    add({key:`cost:${skuKey(q.sku)}`,sku:q.sku,kind:'research',title:`${q.sku}: maliyet araştırması`,priority:2,
      proposal:found?'Bulunan not veya cevabı, maliyetin para birimi ve ait olduğu partiyle karşılaştır.':'Katalog, maliyet alanları, notlar ve önceki sorular tarandı; eksik maliyet bilgisi isteniyor.',
      evidence:found?[found]:['Product maliyet alanları',`Son dönem kayıtlı satış adedi: ${q.salesUnits30}`],blockers:['Doğrulanmış ürün maliyeti'],cashRequiredTry:null,expectedGainTry:null,suggestedUnits:null,requiresApproval:false});
    if(!found&&context.notebook?.available!==false&&!context.notebook?.truncated&&!context.catalogCosts?.truncated&&context.catalogCosts?.available!==false)questions.push({key:`cost:${skuKey(q.sku)}`,sku:q.sku,question:`${q.sku} ürününün mevcut stok partisine ait birim maliyeti, para birimi ve fatura/parti tarihi nedir?`,why:'Kayıtlı maliyet, not ve önceki cevap bulunamadı. Kâr hesabı bu bilgiye bağlı.',priority:2,area:'marj'});
  }
  for(const p of context.operating.recordedCostReconciliation)add({key:`reconcile:${skuKey(p.sku)}`,sku:p.sku,kind:'research',title:`${p.sku}: kayıtlı maliyeti eşleştir`,priority:2,proposal:'Mevcut maliyetin ürün eşleşmesini ve tarihli kur dönüşümünü doğrula; yeniden maliyet isteme.',evidence:['Product TRY/USD/ithalat maliyet kaydı'],blockers:['Maliyet eşleşmesi veya tarihli dönüşüm'],cashRequiredTry:null,expectedGainTry:null,suggestedUnits:null,requiresApproval:false});
  for(const [sku,rows] of bySku){
    const p=rows[0];if(p.excluded||p.virtual)continue;
    const best=rows.find(r=>r.trusted&&r.financialSourceFresh&&r.contributionProfitTry!=null&&r.unitProfitTry!=null&&r.unitProfitTry>0);
    if(p.stockDays!=null&&p.stockDays<=21&&p.inventorySourceFresh){
      const blockers:string[]=[];
      if(p.noReorder)blockers.push('Yeniden sipariş verilmeyecek; mevcut stok eritilir');
      if(!best)blockers.push('Güncel ve tam birim kâr hesabı gerekli');
      const inboundComplete=context.importPipeline?.coveragePct?.value===100;
      if(p.inboundQty==null||!inboundComplete)blockers.push('Yoldaki stok kapsamı eksik; sıfır eşleşme yolda mal olmadığını kanıtlamaz');
      if(p.inboundBeforeStockout||(p.openPurchaseOrders??0)>0)blockers.push('Mevcut sipariş veya yoldaki parti önce kontrol edilmeli');
      if(!context.cash.banksFresh)blockers.push('Nakit kaynaklarının tarihli doğrulaması gerekli');
      const cash=context.cash.cash.value;
      const velocity=p.velocity;
      const quantity=inboundComplete&&velocity!=null&&velocity>0&&p.stockQty!=null&&p.inboundQty!=null?Math.max(0,Math.ceil(velocity*60-p.stockQty-p.inboundQty)):null;
      const required=quantity!=null&&p.costTry!=null?Math.round(quantity*p.costTry*100)/100:null;
      if(required==null||cash==null||required>cash)blockers.push('Öz nakit yeterliliği veya sipariş maliyeti eksik');
      blockers.push('Tedarikçi fiyatı, termin, navlun ve parti şartları doğrulanmalı');
      const seaLead=number(settings.importSeaLeadDays),airLead=number(settings.importAirLeadDays),minOrder=number(settings.importMinOrderUsd),minLine=number(settings.importMinLineQty);
      blockers.push(`İthalat ise yalnız öz nakit kullanılır; kayıtlı deniz/hava terminleri ${seaLead??'bilinmiyor'}/${airLead??'bilinmiyor'} gün, parti alt sınırı ${minOrder??'bilinmiyor'} USD, satır alt sınırı ${minLine??'bilinmiyor'} adet. 60 günlük örnek miktar kesin sipariş değildir.`);
      if(!p.noReorder&&p.stockDays<=7&&!(p.openPurchaseOrders??0)&&p.inboundQty===0){
        const prior=knowledge.find(q=>q.status!=='IPTAL'&&skuKey(q.question).includes(skuKey(sku))&&/(TEDARIK|TERMİN|TERMIN|SIPARIS|SİPARİŞ)/.test(skuKey(q.question)));
        const note=context.notebook?.notes.find(n=>n.source!=='cfo-workflow-v1'&&skuKey(n.title+' '+n.body).includes(skuKey(sku))&&/(TEDARIK|TERMİN|TERMIN|SIPARIS|SİPARİŞ)/.test(skuKey(n.title+' '+n.body)));
        if(!prior&&!note&&context.notebook?.available!==false&&!context.notebook?.truncated)questions.push({key:`supplier:${skuKey(sku)}`,sku,question:`${sku} için bekleyen tedarik planı var mı; güncel tedarikçi fiyatı, para birimi ve teslim süresi nedir?`,why:`XML ihtiyatlı stok örtüsü ${p.stockDays} gün. Yeni taahhüt öncesinde kâr, öz nakit ve parti şartları ayrıca doğrulanacak.`,priority:1,area:'siparis'});
      }
      add({key:`stock:${skuKey(sku)}`,sku,kind:'research',title:`${sku}: ${p.stockDays} günlük stok`,priority:p.stockDays<=7?1:2,
        proposal:p.noReorder?'Yeni sipariş oluşturma; stok bitişini ve kategori çıkışını izle.':'Tedarik araştırmasını başlat. 60 günlük örnek stok senaryosunu, yoldaki malı ve parti şartlarını kontrol et; kesin sipariş kararı için eksikleri tamamla.',
        evidence:[`XML ihtiyatlı stok örtüsü: ${p.stockDays} gün`,'XML hareketi satışın kendisi değildir',...(p.policySource?[p.policySource]:[])],blockers,cashRequiredTry:required,expectedGainTry:best?.unitProfitTry!=null&&quantity!=null?Math.round(best.unitProfitTry*quantity*100)/100:null,suggestedUnits:quantity,requiresApproval:false});
    }
    for(const r of rows)if(r.trusted&&r.financialSourceFresh&&r.priceFloorTry!=null&&r.avgPriceTry!=null&&r.avgPriceTry<r.priceFloorTry){
      add({key:`floor:${skuKey(sku)}:${r.channel}`,sku,kind:'pricing',title:`${sku} · ${r.channel}: taban altında satış`,priority:1,
        proposal:`Son gerçekleşen ortalama ${r.avgPriceTry} TL; hesaplanan taban ${r.priceFloorTry} TL. İlan fiyatını ve tüm maliyetleri kontrol ederek fiyat düzeltmesini değerlendir.`,evidence:['SKU/kanal taban hesabı','Güncel kanonik satış kaynağı'],blockers:['Canlı ilan fiyatı ve fiyat değişikliği sonrası talep etkisi kontrol edilmeli'],cashRequiredTry:0,expectedGainTry:null,suggestedUnits:null,requiresApproval:true});
    }
    if(p.stockDays!=null&&p.stockDays>=180&&p.inventorySourceFresh)add({key:`excess:${skuKey(sku)}`,sku,kind:'liquidation',title:`${sku}: fazla stok araştırması`,priority:3,
      proposal:'Yeni sipariş verme. Mevcut satış kanallarını ve toptan teklifleri araştır; tasfiye fiyatını marjinal nakit geri kazanımıyla karşılaştır.',evidence:[`İhtiyatlı stok örtüsü ${p.stockDays} gün`],blockers:['Alıcı teklifi ve satışın değişken giderleri gerekli'],cashRequiredTry:0,expectedGainTry:null,suggestedUnits:null,requiresApproval:false});
  }
  const floor=number(settings.netPositionFloorTry),dip=context.cash.minimumProjectedPosition.value;
  if(dip!=null&&floor!=null&&dip<floor)add({key:'cash:floor',kind:'cash',title:'Nakit projeksiyonu tabanın altında',priority:1,proposal:'Gümrük dilimi, stok tasfiyesi, tahsilat zamanlaması ve borç seçeneklerini araştır. Kesin kaynak planını onaya getir.',evidence:[`Tahmini dip: ${dip} TL`,`Ayarlardaki taban: ${floor} TL`],blockers:[...(!context.cash.banksFresh?['Banka kaynakları eski']:[]),'Dip tarihi ve yakın/uzak tahsilat kapsamı ayrılmalı','Kullanılmamış limit nakit değildir'],cashRequiredTry:null,expectedGainTry:null,suggestedUnits:null,requiresApproval:false});
  const rate=number(settings.usdTryRate),targetUsd=number(settings.monthlyRevenueTargetUsd),revenue=context.sales.last30Days.grossRevenue.value;
  const goals={monthlyRevenueTargetUsd:targetUsd,targetTry:rate!=null&&targetUsd!=null?rate*targetUsd:null,rateAsOf:settings.updatedAt??null,
    observedRevenueTry:revenue,revenueComplete:context.sales.last30Days.complete,progressPct:context.sales.last30Days.complete&&revenue!=null&&rate!=null&&targetUsd!=null?revenue/(rate*targetUsd)*100:null,
    capitalTry:context.cash.summaries.find(s=>s.source==='cfo_servet'&&s.query==='servet_try')?.value??null,cardDebtTry:context.cash.totalCardDebt.value,
    totalDebtTry:number(context.financialGoals?.totalDebtTry),profitTry:null};
  if(!context.sales.last30Days.complete||context.operating.summary.skuChannelsWithContributionProfit===0)add({key:'growth:coverage',kind:'research',title:'Kârlı büyüme planının veri eksiklerini tamamla',priority:2,proposal:'Bilinen maliyetlerden ilerle; satılan ürünleri, stokta olmayan kanıtlanmış talebi ve kanal kapsamını araştır. Ciro hedefini kâr ve nakit dönüşümüyle birlikte değerlendir.',evidence:[`Maliyeti bilinen ürün: ${context.operating.summary.skusWithKnownCost}`,`Katkı kârı hesaplanabilen ürün/kanal: ${context.operating.summary.skuChannelsWithContributionProfit}`],blockers:['Eksik dönem ciro düşüşü veya hedef başarısızlığı diye yorumlanamaz','Komisyon, KDV, iadeler ve değişken giderler tamamlanmalı'],cashRequiredTry:null,expectedGainTry:null,suggestedUnits:null,requiresApproval:false});
  return {asOf:context.asOf,goals,items:items.sort((a,b)=>a.priority-b.priority||a.key.localeCompare(b.key)),questions};
}
