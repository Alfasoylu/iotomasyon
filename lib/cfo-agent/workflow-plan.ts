import { createHash } from 'node:crypto';
import { skuKey } from './sku';
import type { buildOperatingContext } from './operating-context';
import type { Row } from './sources';
import { buildAgenda, type CycleMemory } from './workflow-memory';
import { debtGate } from './debt-policy';
import { forecastDebt } from './debt-forecast';
import { importPolicy,IMPORT_PLANNER_PATH } from './import-planner';
import type { ResearchResult } from './research';
export type WorkingContext=Awaited<ReturnType<typeof buildOperatingContext>>&{research?:ResearchResult};
export type WorkItem={key:string;kind:'research'|'pricing'|'procurement'|'cash'|'liquidation';title:string;priority:number;
  sku?:string;proposal:string;evidence:string[];blockers:string[];cashRequiredTry:number|null;expectedGainTry:number|null;
  suggestedUnits:number|null;requiresApproval:boolean;futureOrder?:boolean;estimatedOrderDate?:string|null;plannerPath?:string;plannerState?:string};
export type PlannedQuestion={key:string;sku:string;question:string;why:string;priority:number;area:string;scope?:string;entityKey?:string;code?:string};
export type Knowledge={id:string;question:string;answer:string|null;status:string;area?:string;priority?:number;answerChanged?:boolean;answerReviewPending?:boolean;answerVersion?:string;scope?:string|null;entity_key?:string|null;code?:string|null};
export const workflowId=(key:string)=>'cfo-work-'+createHash('sha256').update(key).digest('hex').slice(0,32);
const number=(v:unknown)=>v!=null&&Number.isFinite(Number(v))?Number(v):null;
function knownAnswer(sku:string,context:WorkingContext,knowledge:Knowledge[]) {
  const costWords=/(MALIYET|COST|FATURA)/;
  const folded=(text:string)=>skuKey(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const contains=(text:string)=>{const t=folded(text),key=folded(sku),index=t.indexOf(key);return index>=0&&!/[A-Z0-9_-]/.test(t[index-1]??'')&&!/[A-Z0-9_-]/.test(t[index+key.length]??'');};
  // Matches are context to investigate, never silently converted into financial facts.
  const note=context.notebook?.notes.find(n=>n.source!=='cfo-workflow-v1'&&contains(n.title+' '+n.body)&&costWords.test(folded(n.title+' '+n.body)));
  const question=knowledge.find(q=>(contains(q.question)||q.scope==='ITHALAT_SATIRI'&&skuKey(q.entity_key?.split('|').slice(1).join('|')??'')===skuKey(sku))&&(q.code==='MALIYET_YOK'||costWords.test(folded(q.question))) );
  return note?`not:${note.id}`:question?`soru:${question.id}`:null;
}
export function planCfoWork(context:WorkingContext,settings:Row,knowledge:Knowledge[]=[],memory:CycleMemory={},priorRead=false){
  const items:WorkItem[]=[];const questions:PlannedQuestion[]=[];
  const add=(item:WorkItem)=>items.push(item);
  const gate=context.orderGate??debtGate(context.financialGoals?.totalDebtTry??null,context.financialGoals?.balancesFresh??false);
  const debtForecast=forecastDebt(context);
  const budgetQuestionKey='debt:forecast-budget';
  if(context.forecastInputs?.interestMonthlyTry==null&&context.notebook?.available!==false&&!context.notebook?.truncated&&
    !knowledge.some(q=>q.id===workflowId('question:'+budgetQuestionKey)||q.status!=='IPTAL'&&/(FAIZ|FAİZ)/.test(skuKey(q.question))&&/(BUTCE|BÜTÇE|AYLIK)/.test(skuKey(q.question)))){
    questions.push({key:budgetQuestionKey,sku:'',area:'nakit',priority:1,question:'Borç hedefi için vergi/ücret dahil aylık faiz, takvim dışında kalan aylık çıkış, korunacak nakit tamponu ve ihtiyatlı tahsilat süresi nedir? Mevcut stok bedeli tamamen ödendi mi?',
      why:'Bu birleşik soru borcun 5 milyon TL altına ineceği tarih hesabını açar. Çalışan CFO sayfasındaki bütçe formuna girilen beyanla yeniden hesaplanır; bilinmeyen gider sıfır sayılmaz.'});
  }
  const bySku=new Map<string,WorkingContext['operating']['products']>();
  for(const p of context.operating.products){const key=p.resolvedSku;bySku.set(key,[...(bySku.get(key)??[]),p]);}
  for(const q of context.operating.questions){
    const found=knownAnswer(q.sku,context,knowledge);
    add({key:`cost:${skuKey(q.sku)}`,sku:q.sku,kind:'research',title:`${q.sku}: maliyet araştırması`,priority:2,
      proposal:found?'Bulunan not veya cevabı, maliyetin para birimi ve ait olduğu partiyle karşılaştır.':'Katalog, maliyet alanları, notlar ve önceki sorular tarandı; eksik maliyet bilgisi isteniyor.',
      evidence:found?[found]:['Product maliyet alanları',`Son dönem kayıtlı satış adedi: ${q.salesUnits30}`],blockers:['Doğrulanmış ürün maliyeti'],cashRequiredTry:null,expectedGainTry:null,suggestedUnits:null,requiresApproval:false});
    if(!found&&context.notebook?.available!==false&&!context.notebook?.truncated&&!context.catalogCosts?.truncated&&context.catalogCosts?.available!==false)questions.push({key:`cost:${skuKey(q.sku)}`,sku:q.sku,question:`${q.sku} ürününün mevcut stok partisine ait birim maliyeti, para birimi ve fatura/parti tarihi nedir?`,why:'Kayıtlı maliyet, not ve önceki cevap bulunamadı. Kâr hesabı bu bilgiye bağlı.',priority:2,area:'marj',scope:'ITHALAT_SATIRI',entityKey:'GELECEK|'+q.sku,code:'MALIYET_YOK'});
  }
  for(const p of context.operating.recordedCostReconciliation)add({key:`reconcile:${skuKey(p.sku)}`,sku:p.sku,kind:'research',title:`${p.sku}: kayıtlı maliyeti eşleştir`,priority:2,proposal:'Mevcut maliyetin ürün eşleşmesini ve tarihli kur dönüşümünü doğrula; yeniden maliyet isteme.',evidence:['Product TRY/USD/ithalat maliyet kaydı'],blockers:['Maliyet eşleşmesi veya tarihli dönüşüm'],cashRequiredTry:null,expectedGainTry:null,suggestedUnits:null,requiresApproval:false});
  for(const [sku,rows] of bySku){
    const p=rows[0];if(p.excluded||p.virtual)continue;
    const policy=importPolicy(context.importPlanner,sku,context.asOf);
    const closed=memory.closedKeys?.includes(`stock:${skuKey(sku)}`)??false;
    const rowAnswers=knowledge.filter(q=>q.scope==='ITHALAT_SATIRI'&&skuKey(q.entity_key?.split('|').slice(1).join('|')??'')===skuKey(sku)&&q.status==='CEVAPLANDI');
    const plannerEvidence=[...policy.evidence,...rowAnswers.map(q=>`Planlayıcı not/cevap ${q.id}: ${q.answer??'Belge cevabı; doğrulama gerekli'}`)];
    const best=rows.find(r=>r.trusted&&r.financialSourceFresh&&r.contributionProfitTry!=null&&r.unitProfitTry!=null&&r.unitProfitTry>0);
    if(p.stockDays!=null&&p.stockDays<=21&&p.inventorySourceFresh){
      const blockers:string[]=[];
      if(p.noReorder)blockers.push('Yeniden sipariş verilmeyecek; mevcut stok eritilir');
      if(!policy.complete)blockers.push(...(context.importPlanner?.missing??['Planlayıcı kapsamı doğrulanmalı']));
      if(policy.rejected)blockers.push('Planlayıcıdaki ret/iptal kararı korunuyor; yeni aday oluşturulmaz');
      if(policy.waiting)blockers.push('Planlayıcıdaki BEKLE kararı korunuyor');
      if(policy.existing.length)blockers.push('Ürün mevcut plan/partide; ikinci aday oluşturulmaz');
      if(closed)blockers.push('Önceki çalışma kararı korunuyor; yeniden aday açılmaz');
      if(!gate.open)blockers.push(gate.reason);
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
      if(!p.noReorder&&policy.mayAdd&&!closed&&p.stockDays<=7&&!(p.openPurchaseOrders??0)&&p.inboundQty===0){
        const prior=knowledge.find(q=>q.status!=='IPTAL'&&skuKey(q.question).includes(skuKey(sku))&&/(TEDARIK|TERMİN|TERMIN|SIPARIS|SİPARİŞ)/.test(skuKey(q.question)));
        const note=context.notebook?.notes.find(n=>n.source!=='cfo-workflow-v1'&&skuKey(n.title+' '+n.body).includes(skuKey(sku))&&/(TEDARIK|TERMİN|TERMIN|SIPARIS|SİPARİŞ)/.test(skuKey(n.title+' '+n.body)));
        if(gate.open&&!prior&&!note&&context.notebook?.available!==false&&!context.notebook?.truncated)questions.push({key:`supplier:${skuKey(sku)}`,sku,question:`${sku} için bekleyen tedarik planı var mı; güncel tedarikçi fiyatı, para birimi ve teslim süresi nedir?`,why:`XML ihtiyatlı stok örtüsü ${p.stockDays} gün. Yeni taahhüt öncesinde kâr, öz nakit ve parti şartları ayrıca doğrulanacak.`,priority:2,area:'siparis'});
      }
      add({key:`stock:${skuKey(sku)}`,sku,kind:'research',title:`${sku}: ${p.stockDays} günlük stok`,priority:!gate.open?3:p.stockDays<=7?1:2,
        proposal:policy.rejected?'Planlayıcıdaki ret kararını ve gerekçesini koru; yeni sipariş adayı oluşturma.':policy.waiting?'Planlayıcıdaki bekletme kararını koru; koşulları ve notları incele.':policy.existing.length?'Mevcut ithalat plan satırını incele; adet, not, yoldaki mal ve parti durumunu doğrula. Aynı ürün için ikinci aday oluşturma.':!policy.complete?'Planlayıcı kayıtları tamamlanmadan yeni aday ekleme; diğer hedef işlerine ilerle.':closed?'Önceki ret veya tamamlanma sonucunu koru; yeni aday oluşturma.':p.noReorder?'Yeni sipariş oluşturma; stok bitişini ve kategori çıkışını izle.':!gate.open?'Gelecek sipariş listesine aday olarak ekle. Toplam borç 5 milyon TL altına inmeden yeni sipariş açma. Yoldaki malı ve örnek miktarı kontrol et.':'Tedarik araştırmasını başlat. 60 günlük örnek stok senaryosunu, yoldaki malı ve parti şartlarını kontrol et; kesin sipariş kararı için eksikleri tamamla.',
        evidence:[`XML ihtiyatlı stok örtüsü: ${p.stockDays} gün`,'XML hareketi satışın kendisi değildir',...(p.policySource?[p.policySource]:[]),...plannerEvidence],blockers,cashRequiredTry:required,expectedGainTry:best?.unitProfitTry!=null&&quantity!=null?Math.round(best.unitProfitTry*quantity*100)/100:null,suggestedUnits:quantity,requiresApproval:false,futureOrder:!p.noReorder&&policy.mayAdd&&!closed,estimatedOrderDate:debtForecast.estimatedOrderDate,plannerPath:IMPORT_PLANNER_PATH,plannerState:policy.rejected?'rejected':policy.waiting?'waiting':policy.existing.length?'existing':!policy.complete?'unavailable':closed?'closed':'candidate'});
    }
    for(const r of rows)if(r.trusted&&r.financialSourceFresh&&r.priceFloorTry!=null&&r.avgPriceTry!=null&&r.avgPriceTry<r.priceFloorTry){
      add({key:`floor:${skuKey(sku)}:${r.channel}`,sku,kind:'pricing',title:`${sku} · ${r.channel}: taban altında satış`,priority:1,
        proposal:`Son gerçekleşen ortalama ${r.avgPriceTry} TL; hesaplanan taban ${r.priceFloorTry} TL. İlan fiyatını ve tüm maliyetleri kontrol ederek fiyat düzeltmesini değerlendir.`,evidence:['SKU/kanal taban hesabı','Güncel kanonik satış kaynağı'],blockers:['Canlı ilan fiyatı ve fiyat değişikliği sonrası talep etkisi kontrol edilmeli'],cashRequiredTry:0,expectedGainTry:null,suggestedUnits:null,requiresApproval:true});
    }
    if(p.stockDays!=null&&p.stockDays>=180&&p.inventorySourceFresh)add({key:`excess:${skuKey(sku)}`,sku,kind:'liquidation',title:`${sku}: fazla stok araştırması`,priority:3,
      proposal:'Yeni sipariş verme. Mevcut satış kanallarını ve toptan teklifleri araştır; tasfiye fiyatını marjinal nakit geri kazanımıyla karşılaştır.',evidence:[`İhtiyatlı stok örtüsü ${p.stockDays} gün`],blockers:['Alıcı teklifi ve satışın değişken giderleri gerekli'],cashRequiredTry:0,expectedGainTry:null,suggestedUnits:null,requiresApproval:false});
  }
  if(context.importPlanner)add({key:'imports:planner',kind:'research',title:'İthalat planlayıcısını ve kararları incele',priority:2,proposal:'Mevcut parti durumlarını, ret/bekletme gerekçelerini ve satır notlarını önce oku; yeni adayları aynı planlayıcıya kaydet. Retleri kaldırma veya miktarları serbest metinden değiştirme.',
    evidence:[`Planlayıcı: ${IMPORT_PLANNER_PATH}`,`Okunan satır: ${context.importPlanner.lines.length}; ürün kararı: ${context.importPlanner.decisions.length}`,...context.importPlanner.summaries.map(s=>`${s.mod}: ${s.durum}`)],blockers:context.importPlanner.missing,cashRequiredTry:null,expectedGainTry:null,suggestedUnits:null,requiresApproval:false,plannerPath:IMPORT_PLANNER_PATH});
  const floor=number(settings.netPositionFloorTry),dip=context.cash.minimumProjectedPosition.value;
  add({key:'debt:order-gate',kind:'cash',title:'Borç hedefi ve gelecek sipariş tarihi',priority:1,proposal:gate.open?'Borç eşiği geçildi; kâr, öz nakit ve tedarik şartlarını ayrıca doğrula.':gate.reason,
    evidence:[`Toplam borç kaynağı: cfo_servet.borc`,`Sipariş eşiği: kesin olarak 5 milyon TL altı`,
      `Geçmiş kayıtlı 30 günlük ciro: ${debtForecast.historicalMonthlyRevenueTry??'bilinmiyor'}; ${debtForecast.historicalComplete?'tam pencere':'eksik pencere'}`,
      `Tahmini sipariş tarihi: ${debtForecast.estimatedOrderDate??'veri yetersiz veya mevcut stokla ufuk içinde ulaşılamıyor'}`],blockers:debtForecast.missing,cashRequiredTry:null,expectedGainTry:null,suggestedUnits:null,requiresApproval:false});
  for(const q of knowledge.filter(q=>q.status==='CEVAPLANDI'&&(q.answerChanged||q.answerReviewPending)))add({key:`answer:${q.id}`,kind:'research',title:`Cevabı doğrula: ${q.question.slice(0,100)}`,priority:1,
    proposal:'Yeni veya değişmiş cevabı mevcut kaynak, parti ve tarih ile karşılaştır. Dosya varsa içeriğini incele; finansal uygulamayı kanıt olmadan tamamlandı sayma.',evidence:[`soru:${q.id}`,`Cevap revizyonu: ${q.answerVersion??'bilinmiyor'}`,q.answer?'Yazılı cevap bağlamda okunuyor':'Dosya cevabı; içerik doğrulaması gerekiyor'],blockers:['Cevabın belge/kayıt ile doğrulanması'],cashRequiredTry:null,expectedGainTry:null,suggestedUnits:null,requiresApproval:false});
  if(dip!=null&&floor!=null&&dip<floor)add({key:'cash:floor',kind:'cash',title:'Nakit projeksiyonu tabanın altında',priority:1,proposal:'Gümrük dilimi, stok tasfiyesi, tahsilat zamanlaması ve borç seçeneklerini araştır. Kesin kaynak planını onaya getir.',evidence:[`Tahmini dip: ${dip} TL`,`Ayarlardaki taban: ${floor} TL`],blockers:[...(!context.cash.banksFresh?['Banka kaynakları eski']:[]),'Dip tarihi ve yakın/uzak tahsilat kapsamı ayrılmalı','Kullanılmamış limit nakit değildir'],cashRequiredTry:null,expectedGainTry:null,suggestedUnits:null,requiresApproval:false});
  const rate=number(settings.usdTryRate),targetUsd=number(settings.monthlyRevenueTargetUsd),revenue=context.sales.last30Days.grossRevenue.value;
  add({key:'sales:coverage',kind:'research',title:'Satış ortalaması ve kanal kapsamı',priority:2,
    proposal:context.sales.last30Days.complete?'Tam dönem satış ortalamasını kanal ve stok kapsamıyla karşılaştır; kârlı büyüme adaylarına aktar.':'Eksik satış dönemini sıfır veya düşüş sayma. Son tamamlanmış geçmiş pencereyi, XML hızını ve kanal kapsamını ayrı kontrol et.',
    evidence:[`Gözlenen son 30 gün cirosu: ${revenue??'bilinmiyor'}`,`Tam geçmiş pencere: ${debtForecast.historicalComplete?'evet':'hayır'}`],blockers:context.sales.last30Days.complete?[]:['Güncel tüm-kanal satış kapsamı'],cashRequiredTry:null,expectedGainTry:null,suggestedUnits:null,requiresApproval:false});
  const goals={monthlyRevenueTargetUsd:targetUsd,targetTry:rate!=null&&targetUsd!=null?rate*targetUsd:null,rateAsOf:settings.updatedAt??null,
    observedRevenueTry:revenue,revenueComplete:context.sales.last30Days.complete,progressPct:context.sales.last30Days.complete&&revenue!=null&&rate!=null&&targetUsd!=null?revenue/(rate*targetUsd)*100:null,
    capitalTry:context.cash.summaries.find(s=>s.source==='cfo_servet'&&s.query==='servet_try')?.value??null,cardDebtTry:context.cash.totalCardDebt.value,
    totalDebtTry:number(context.financialGoals?.totalDebtTry),profitTry:null};
  if(!context.sales.last30Days.complete||context.operating.summary.skuChannelsWithContributionProfit===0)add({key:'growth:coverage',kind:'research',title:'Kârlı büyüme planının veri eksiklerini tamamla',priority:2,proposal:'Bilinen maliyetlerden ilerle; satılan ürünleri, stokta olmayan kanıtlanmış talebi ve kanal kapsamını araştır. Ciro hedefini kâr ve nakit dönüşümüyle birlikte değerlendir.',evidence:[`Maliyeti bilinen ürün: ${context.operating.summary.skusWithKnownCost}`,`Katkı kârı hesaplanabilen ürün/kanal: ${context.operating.summary.skuChannelsWithContributionProfit}`],blockers:['Eksik dönem ciro düşüşü veya hedef başarısızlığı diye yorumlanamaz','Komisyon, KDV, iadeler ve değişken giderler tamamlanmalı'],cashRequiredTry:null,expectedGainTry:null,suggestedUnits:null,requiresApproval:false});
  if(context.research){
    items.push(...context.research.items);
    if(context.research.missing.length)add({key:'research:access',kind:'research',title:'Araştırmanın okunamayan kaynaklarını tamamla',priority:2,proposal:'Okunamayan kaynağı tamamlandı sayma; diğer kaynaklarda araştırmaya devam et.',evidence:context.research.summaries,blockers:context.research.missing,cashRequiredTry:null,expectedGainTry:null,suggestedUnits:null,requiresApproval:false});
  }
  for(const q of context.importPlanner?.questions??[]){
    if(!q.scope||!q.entityKey||!q.code)continue;
    const existing=knowledge.some(k=>k.scope===q.scope&&k.code===q.code&&(skuKey(k.entity_key??'')===skuKey(q.entityKey!)||q.code==='MALIYET_YOK'&&skuKey(k.entity_key?.split('|').slice(1).join('|')??'')===skuKey(q.sku)));
    if(!existing&&!questions.some(k=>k.code==='MALIYET_YOK'&&q.code===k.code&&skuKey(k.sku)===skuKey(q.sku)))questions.push(q);
  }
  items.sort((a,b)=>a.priority-b.priority||a.key.localeCompare(b.key));
  const agenda=buildAgenda(items,knowledge,memory,{goals,watermarks:context.dataQuality?.sourceWatermarks,importPlanner:context.importPlanner,research:context.research?.progress},priorRead);
  // Previously generated questions remain a backlog, not an obligation to answer 100 at once.
  const open=knowledge.filter(q=>q.status==='ACIK');
  const score=(q:{question:string;priority?:number;area?:string;id?:string;sku?:string})=>{
    if(!q.id?.startsWith('cfo-work-')&&!q.id?.startsWith('cfo-row-')&&q.id)return (q.priority??3)*1000;
    if(q.area==='nakit'||q.area==='banka')return 1000;
    if(q.area==='siparis'&&!gate.open)return 9000;
    const product=context.operating.questions.find(p=>skuKey(q.question).includes(skuKey(p.sku)));
    return 2000-Math.min(499,product?.salesUnits30??0);
  };
  const candidates=[...open,...questions.map(q=>({...q,id:workflowId('question:'+q.key),status:'ACIK'}))]
    .sort((a,b)=>score(a)-score(b)||a.id.localeCompare(b.id));
  const top=new Set(candidates.slice(0,5).map(q=>q.id));
  agenda.questionRanks=open.filter(q=>q.id.startsWith('cfo-work-')||q.id.startsWith('cfo-row-')).map(q=>({id:q.id,priority:q.area==='siparis'&&!gate.open?4:top.has(q.id)?(q.area==='nakit'||q.area==='banka'?1:2):4}));
  const pending=questions.filter(q=>top.has(workflowId('question:'+q.key))&&!knowledge.some(k=>k.id===workflowId('question:'+q.key))).slice(0,5);
  return {asOf:context.asOf,goals,items,questions:pending,agenda,orderGate:gate,debtForecast,research:context.research};
}
