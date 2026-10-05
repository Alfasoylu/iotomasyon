import type { PlannedQuestion } from './workflow-plan';
import { skuKey } from './sku';
import type { ReadSource, Row } from './sources';

export const IMPORT_PLANNER_PATH='/cfo/kazananlar#ithalat';
export type ImportDecision={sku:string;decision:string;reason:string;expiresAt:string|null;updatedAt:string|null};
export type ImportLine={sku:string;batchId:string;mode:string;status:string;batchStatus:string;qty:number|null;notes:string;batchDecision:string;cashGate:string};
export type ImportPlanner={available:boolean;truncated:boolean;decisions:ImportDecision[];lines:ImportLine[];summaries:Row[];missing:string[];questions?:PlannedQuestion[]};
const string=(v:unknown)=>v==null?'':String(v);
const date=(v:unknown)=>v==null?null:new Date(String(v)).toISOString();
const object=(v:unknown):Row=>v&&typeof v==='object'?v as Row:{};
const notes=(r:Row)=>['reason','note','notes','decision'].flatMap(k=>r[k]==null?[]:[`${k}: ${string(r[k])}`]).join(' · ').slice(0,4000);

/** Existing planner is authoritative. Missing source coverage prevents new candidates. */
export async function readImportPlanner(db:ReadSource):Promise<ImportPlanner>{
  const result:ImportPlanner={available:true,truncated:false,decisions:[],lines:[],summaries:[],missing:[]};
  try{
    const rows=await db.query<Row>('select sku,karar,sebep,gecerli_bitis,updated_at from cfo_urun_karar order by sku limit 10001');
    result.truncated ||= rows.length>10000;
    result.decisions=rows.slice(0,10000).map(r=>({sku:string(r.sku),decision:string(r.karar),reason:string(r.sebep),expiresAt:date(r.gecerli_bitis),updatedAt:date(r.updated_at)}));
  }catch{result.available=false;result.missing.push('Planlayıcının ürün kararları okunamadı');}
  try{
    // JSON keeps optional legacy note fields compatible; status filters must not
    // hide cancelled/rejected lines or already placed batches from the cycle.
    const rows=await db.query<Row>(`select to_jsonb(l) as line,to_jsonb(b) as batch
      from cfo_order_line l join cfo_order_batch b on b.id=l.batch_id order by l.sku,l.id limit 10001`);
    result.truncated ||= rows.length>10000;
    result.lines=rows.slice(0,10000).map(r=>{const l=object(r.line),b=object(r.batch);return {
      sku:string(l.sku),batchId:string(l.batch_id),mode:string(b.transport_mode),status:string(l.status),batchStatus:string(b.status),
      qty:l.qty!=null&&Number.isFinite(Number(l.qty))?Number(l.qty):null,
      notes:[notes(l),notes(b)].filter(Boolean).join(' · ').slice(0,6000),batchDecision:string(b.decision),cashGate:string(b.cash_gate),
    };});
  }catch{result.available=false;result.missing.push('Planlayıcının parti satırları ve durumları okunamadı');}
  try{result.summaries=await db.query<Row>('select mod,durum,tavsiye_siparis_tarihi,nakit_kapisi_tarihi,maliyet_eksik_satir from cfo_ithalat_oneri_ozet order by mod');}
  catch{result.available=false;result.missing.push('Planlayıcının nakit, maliyet ve tarih durumları okunamadı');}
  try{
    const rows=await db.query<Row>('select sku,mod,product_name,maliyet_eksik,kapsam_ay,onerilen_adet from cfo_ithalat_oneri order by mod,sira limit 10001');
    result.questions=[];
    for(const r of rows.slice(0,10000)){
      const sku=string(r.sku),entityKey=string(r.mod)+'|'+sku,policy=importPolicy(result,sku,new Date().toISOString());
      if(policy.rejected||policy.waiting)continue;
      if(r.maliyet_eksik===true)result.questions.push({key:'row-cost:'+skuKey(sku),sku,scope:'ITHALAT_SATIRI',entityKey,code:'MALIYET_YOK',area:'marj',priority:2,question:`${sku} için mevcut parti ve yeni ithalat alış fiyatı, para birimi, fatura/parti tarihi ve birim ağırlık (kg) nedir?`,why:'İthalat planındaki satır maliyeti eksik. Kayıtlı maliyet ve önceki cevap kontrol edilir; doğrulanmadan miktar veya maliyet değiştirilmez.'});
      if(Number(r.kapsam_ay)>=6)result.questions.push({key:'row-cover:'+skuKey(entityKey),sku,scope:'ITHALAT_SATIRI',entityKey,code:'KAPSAM_UZUN',area:'siparis',priority:3,question:`${sku} için ${r.onerilen_adet} adet öneri ${r.kapsam_ay} aylık stok oluşturuyor. Bunu destekleyen kampanya/toptan beklentisi var mı?`,why:'Uzun stok örtüsü sermayeyi bağlar. Yeni sipariş borç eşiğine ve öz nakde bağlı kalır.'});
    }
  }catch{result.missing.push('Planlayıcıdaki türetilmiş soruların kaynağı okunamadı');}
  if(result.truncated)result.missing.push('Planlayıcı kayıt kapsamı kesildi; yeni aday ekleme durduruldu');
  return result;
}

/** Only structured owner statuses restrict orders; free text stays review evidence. */
export function importPolicy(planner:ImportPlanner|undefined,sku:string,asOf:string){
  const key=skuKey(sku),today=asOf.slice(0,10);
  const decisions=planner?.decisions.filter(d=>skuKey(d.sku)===key&&(!d.expiresAt||d.expiresAt.slice(0,10)>=today))??[];
  const lines=planner?.lines.filter(l=>skuKey(l.sku)===key)??[];
  const rejected=decisions.some(d=>d.decision==='ALMA')||lines.some(l=>/^(REDDEDILDI|REDDEDİLDİ|RED|ALMA|IPTAL|CANCELLED)$/.test(skuKey(l.status))||/^(REDDEDILDI|IPTAL|CANCELLED)$/.test(skuKey(l.batchStatus))||skuKey(l.batchDecision)==='ALMA');
  const waiting=decisions.some(d=>d.decision==='BEKLE')||lines.some(l=>/^(ERTELENDI|ERTELENDİ|BEKLETILDI|BEKLETİLDİ)$/.test(skuKey(l.status))||skuKey(l.batchDecision)==='BEKLE');
  const existing=lines.filter(l=>!/(TESLIM|TESLİM|TAMAMLANDI|KAPANDI|IPTAL|İPTAL|CANCEL|REDDED|ALMA)/.test(skuKey(l.status+' '+l.batchStatus)));
  const complete=planner===undefined||planner.available&&!planner.truncated;
  const evidence=[...decisions.map(d=>`Planlayıcı kararı ${d.decision}: ${d.reason}${d.expiresAt?' · geçerli '+d.expiresAt.slice(0,10):' · süresiz'}`),
    ...lines.map(l=>`Plan ${l.batchId} · ${l.mode} · satır ${l.status} · parti ${l.batchStatus} · miktar ${l.qty??'bilinmiyor'} · nakit ${l.cashGate} · ${l.notes}`)];
  return {decisions,rejected,waiting,existing,complete,evidence,mayAdd:complete&&!rejected&&!waiting&&existing.length===0};
}
