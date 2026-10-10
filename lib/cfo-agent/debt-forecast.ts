import { lastCompleteDays } from '../cfo/revenue';
import type { SqlQuery } from '../cfo/capital-efficiency-data';
import { debtGate } from './debt-policy';
import type { ReadSource, Row } from './sources';
import type { CfoAgentSnapshot } from './types';
import type { WorkingContext } from './workflow-plan';
export type ForecastInputs={historicalRevenueTry:number|null;historicalDays:number;historicalEnd:string|null;fixedMonthlyTry:number|null;
  interestMonthlyTry:number|null;otherMonthlyTry:number|null;cashReserveTry:number|null;settlementDays:number|null;
  importsPaid:boolean;extraOutflows:{date:string;amount:number;debtSettlement:boolean}[];horizonDays:number;missing:string[]};
export async function readForecastInputs(db:ReadSource,snapshot:CfoAgentSnapshot):Promise<ForecastInputs>{
  const result:ForecastInputs={historicalRevenueTry:null,historicalDays:0,historicalEnd:null,fixedMonthlyTry:null,interestMonthlyTry:null,otherMonthlyTry:null,cashReserveTry:null,settlementDays:null,importsPaid:false,extraOutflows:[],horizonDays:0,missing:[]};
  // CFO-008 (2026-10-10): geçmiş ciro penceresi TEK kaynaktan (lib/cfo/revenue.ts — Goal Engine satırları, KDV dahil): tüm satış
  // kaynaklarının tam olduğu son 30 gün. Önceden cfo_satis_siparis (yalnız Entegra, Alfashome yok, İadesi Onaylanan sayılıyordu) Entegra
  // damgasına göre — pencere bugünden bir haftaya kadar gerideydi.
  try{const q=(<T,>(sql:string)=>db.query(sql) as Promise<T[]>) as SqlQuery;
    const r=await lastCompleteDays(q,30,new Date(snapshot.generatedAt));
    if(r){result.historicalRevenueTry=r.inclTry;result.historicalDays=30;result.historicalEnd=r.to;}else result.missing.push('Geçmiş satış penceresi: tam gün yok');
  }catch{result.missing.push('Geçmiş satış penceresi okunamadı');}
  try{const [r]=await db.query<Row>('select sum("monthlyTry")::numeric as total from cfo_fixed_expense where "isActive"');result.fixedMonthlyTry=r?.total==null?null:Number(r.total);}catch{result.missing.push('Aylık sabit giderler');}
  // Nominal rates alone omit taxes/fees. Use an explicitly verified effective budget,
  // stored in a structured owner note; ordinary answer text is never parsed as money.
  try{const [r]=await db.query<Row>(`select body,"updatedAt" from cfo_note where id='cfo-debt-budget-v1' and "archivedAt" is null and upper("dataTag")='KESIN'`);
    if(r&&Date.parse(String(r.updatedAt))>=Date.parse(snapshot.generatedAt)-7*86400000){const v=JSON.parse(String(r.body));
      if(v.version===1&&v.verified===true&&v.inventoryPaid===true&&Number.isSafeInteger(v.settlementDays)&&v.settlementDays<=90&&[v.interestMonthlyTry,v.otherMonthlyTry,v.cashReserveTry,v.settlementDays].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1e9)){
        result.interestMonthlyTry=v.interestMonthlyTry;result.otherMonthlyTry=v.otherMonthlyTry;result.cashReserveTry=v.cashReserveTry;result.settlementDays=v.settlementDays;
      }
    }
  }catch{ /* Missing verified finance budget remains unknown. */ }
  let projects:Row[]=[];
  try{const rows=await db.query<Row>(`select id,code,"totalCostUsd","paidUsd","customsEstimateTry" from cfo_import_project where status::text in ('YOLDA','GUMRUKTE')`);
    projects=rows;
    result.importsPaid=rows.every(r=>r.totalCostUsd!=null&&r.paidUsd!=null&&Number(r.paidUsd)>=Number(r.totalCostUsd));
  }catch{result.missing.push('Gelecek partilerin ödenmemiş tedarik bedeli');}
  let customsIncluded=false;
  try{const rows=await db.query<Row>(`select tutar,kaynak,kalem,tur from cfo_servet_kalem`);
    const recorded=rows.filter(r=>/bor[cç]/i.test(String(r.tur))&&/cfo_yoldaki_mal|cfo_import_project/.test(String(r.kaynak))&&/g[uü]mr[uü]k/i.test(String(r.kalem)));
    const total=projects.reduce((sum,r)=>sum+(r.customsEstimateTry==null?NaN:Number(r.customsEstimateTry)),0);
    customsIncluded=total>0&&Number.isFinite(total)&&Math.abs(recorded.reduce((sum,r)=>sum+Number(r.tutar),0)-total)<0.01;
  }catch{ /* Classification must be proven, not guessed from an event label. */ }
  try{const rows=await db.query<Row>(`select id,"eventDate", "outflowTry", kind::text,"relatedImport" from cfo_cash_event
    where not "isSettled" and "eventDate">=$1::timestamp order by "eventDate"`,snapshot.generatedAt);
    const max=rows.reduce((v,r)=>Math.max(v,Date.parse(String(r.eventDate))),0);
    result.horizonDays=Math.max(0,Math.min(365,Math.floor((max-Date.parse(snapshot.generatedAt))/86400000)));
    result.extraOutflows=rows.filter(r=>!['KREDI_TAKSITI','KART_ODEMESI','SABIT_GIDER','TAHSILAT'].includes(String(r.kind))).map(r=>{
      const project=projects.find(p=>p.id===r.relatedImport||p.code===r.relatedImport);
      const amount=r.outflowTry==null?NaN:Number(r.outflowTry);
      const debtSettlement=customsIncluded&&r.kind==='VERGI_GUMRUK'&&!!project&&project.customsEstimateTry!=null&&Number(project.customsEstimateTry)===amount&&rows.filter(e=>e.relatedImport===r.relatedImport&&e.kind==='VERGI_GUMRUK').length===1;
      if(r.kind==='VERGI_GUMRUK'&&!debtSettlement)result.missing.push('Gümrük/vergi çıkışının toplam borçta zaten sayılıp sayılmadığı eşleştirilmeli');
      return {date:new Date(String(r.eventDate)).toISOString(),amount,debtSettlement};
    });
    if(result.extraOutflows.some(r=>!Number.isFinite(r.amount)||r.amount<0))result.missing.push('Takvimde tutarı bilinmeyen çıkış');
  }catch{result.missing.push('Gelecek ödeme takvimi');}
  return result;
}
export type DebtForecast={estimatedThresholdDate:string|null;estimatedOrderDate:string|null;status:'scenario'|'insufficient_data'|'not_reached'|'below_threshold';
  historicalMonthlyRevenueTry:number|null;historicalEnd:string|null;historicalComplete:boolean;stockSkus:number;inboundUnits:number|null;
  monthlyStockCashTry:number|null;horizonDays:number;missing:string[];assumptions:string[]};
export function forecastDebt(context:WorkingContext):DebtForecast{
  const input=context.forecastInputs;const debt=context.financialGoals?.totalDebtTry??null;
  const missing=[...(input?.missing??[])];
  const base:DebtForecast={estimatedThresholdDate:null,estimatedOrderDate:null,status:'insufficient_data',
    historicalMonthlyRevenueTry:input?.historicalRevenueTry??null,historicalEnd:input?.historicalEnd??null,historicalComplete:input?.historicalDays===30,
    stockSkus:0,inboundUnits:null,monthlyStockCashTry:null,horizonDays:input?.horizonDays??0,missing,assumptions:[
      'TAHMİNİ: yeni sipariş ve yeni borç yok; serbest nakdin tamamı borç azaltmaya ayrılır.',
      'Mevcut ve bedeli ödenmiş gelecek stokla sınırlı satış; bugünkü ihtiyatlı hız ve tam maliyet hesabı sabit kabul edilir.',
      'Aylık sabit gider, kullanıcı beyanıyla vergi dahil faiz ve diğer giderler günlere eşit pay edilir; takvim çıkışları ayrıca düşülür. Bilinmeyen gider sıfır sayılmaz.',
      'Kredi/kart taksiti yeniden gider sayılmaz; borç anaparası serbest nakitten ödenir. Tarih sipariş izni değildir.']};
  // Eşik kapıyla aynı kaynaktan (CFO-002: borç hedefi USD × TCMB kuru; kapı yoksa eşik bilinmiyor)
  const limit=(context.orderGate??debtGate(debt,context.financialGoals?.balancesFresh??false)).limitTry;
  if(debt==null)missing.push('Toplam borç');
  if(limit==null)missing.push('Borç hedefinin TL karşılığı');
  if(!context.financialGoals?.balancesFresh)missing.push('Güncel borç ve banka kaynakları');
  if(debt!=null&&limit!=null&&debt<limit&&context.financialGoals?.balancesFresh)return {...base,status:'below_threshold',estimatedThresholdDate:context.asOf.slice(0,10),estimatedOrderDate:context.asOf.slice(0,10)};
  if(input?.historicalDays!==30||input.historicalRevenueTry==null)missing.push('Tam 30 günlük geçmiş satış ortalaması');
  if(context.importPipeline?.coveragePct?.value!==100)missing.push('Gelecek ürünlerin SKU, adet ve tarih kapsamı');
  if(!input?.importsPaid)missing.push('Gelecek partilerin ödenmiş tedarik bedeli');
  if(input?.fixedMonthlyTry==null)missing.push('Aylık sabit giderler');
  if(input?.interestMonthlyTry==null)missing.push('Vergi ve ücret dahil doğrulanmış aylık faiz bütçesi');
  if(input?.otherMonthlyTry==null||input.cashReserveTry==null||input.settlementDays==null)missing.push('Diğer aylık çıkışlar, nakit tamponu, tahsilat süresi ve ödenmiş mevcut stok teyidi');
  if(context.cash.cash.value==null)missing.push('Doğrulanmış nakit bakiyesi');
  if(!input||input.horizonDays<30)missing.push('En az 30 günlük ödeme takvimi');
  const groups=new Map<string,WorkingContext['operating']['products']>();
  for(const p of context.operating.products)if(!p.excluded&&!p.virtual)groups.set(p.resolvedSku,[...(groups.get(p.resolvedSku)??[]),p]);
  const stocks:{quantity:number;inbound:number;eta:number;velocity:number;cashPerUnit:number}[]=[];
  let inbound=0;
  for(const rows of groups.values()){
    const p=rows[0];if((p.stockQty??0)<=0&&(p.inboundQty??0)<=0)continue;
    base.stockSkus++;
    const financial=rows.filter(r=>r.trusted&&r.financialSourceFresh&&r.unitProfitTry!=null&&r.costTry!=null);
    if(!financial.length||!p.inventorySourceFresh||p.velocity==null||p.stockQty==null||p.inboundQty==null||(p.inboundQty>0&&!p.inboundEta)){
      missing.push('Stok ve gelecek ürünlerde güncel satış hızı ve tam değişken gider hesabı');continue;
    }
    // Conservative channel choice; paid inventory cost is released as cash, not profit.
    const cashPerUnit=Math.min(...financial.map(r=>r.unitProfitTry!+r.costTry!));
    inbound+=p.inboundQty;stocks.push({quantity:p.stockQty,inbound:p.inboundQty,eta:p.inboundEta?Date.parse(p.inboundEta):Infinity,velocity:p.velocity,cashPerUnit});
  }
  base.inboundUnits=context.importPipeline?.coveragePct?.value===100?inbound:null;
  base.missing=[...new Set(missing)];
  if(base.missing.length||debt==null||limit==null||!input)return base;
  let remaining=debt,monthCash=0,liquid=Math.max(0,context.cash.cash.value!-input.cashReserveTry!);
  let thresholdDate:string|null=null;
  const receipts=new Map<number,number>();
  const start=Date.parse(context.asOf);
  for(let day=1;day<=input.horizonDays;day++){
    const at=start+day*86400000;
    let cash=0;
    for(const stock of stocks){if(stock.inbound>0&&stock.eta<=at){stock.quantity+=stock.inbound;stock.inbound=0;}
      const units=Math.min(stock.quantity,Math.max(0,stock.velocity));stock.quantity-=units;cash+=units*stock.cashPerUnit;}
    const due=day+input.settlementDays!;receipts.set(due,(receipts.get(due)??0)+cash);
    cash=receipts.get(day)??0;
    if(day<=30)monthCash+=cash;
    const extra=input.extraOutflows.filter(e=>Date.parse(e.date)>at-86400000&&Date.parse(e.date)<=at);
    liquid+=cash-(input.fixedMonthlyTry!+input.interestMonthlyTry!+input.otherMonthlyTry!)/30-extra.reduce((sum,e)=>sum+e.amount,0);
    remaining-=extra.filter(e=>e.debtSettlement).reduce((sum,e)=>sum+e.amount,0);
    if(liquid<0)return {...base,status:'not_reached',monthlyStockCashTry:null,missing:['Senaryoda nakit açığı var; yeni borç almadan bu ödeme akışı sürdürülemiyor']};
    // Keep one month's operating costs before paying additional principal.
    const buffer=input.fixedMonthlyTry!+input.interestMonthlyTry!+input.otherMonthlyTry!;
    const paydown=Math.max(0,liquid-buffer);remaining-=paydown;liquid-=paydown;
    if(remaining<limit&&!thresholdDate)thresholdDate=new Date(at).toISOString().slice(0,10);
  }
  return {...base,status:thresholdDate?'scenario':'not_reached',monthlyStockCashTry:monthCash,estimatedThresholdDate:thresholdDate,estimatedOrderDate:thresholdDate};
}
