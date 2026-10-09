import type { ReadSource, Row } from './sources';
import { STRATEGIC_FX_SQL } from '../fx/strategic';
/**
 * Sipariş borç kapısı (CFO-002, migration 20261009180000 üretimde 2026-10-09): borç = cfo_metrik_borc() toplamı (kredi kalan + kart
 * toplam + kullanılan KMH), eşik = cfo_settings."debtTargetUsd" × TCMB aylık döviz alış (Goal Engine `debt_below_usd` ile aynı ayar ve kur).
 * Sabit TL eşiği yok: hedef, kur ya da sözleşme fonksiyonu yoksa eşik BİLİNMİYOR ve kapı kapalı.
 */
export type DebtGate={limitTry:number|null;limitUsd:number|null;totalDebtTry:number|null;balancesFresh:boolean;open:boolean;reason:string;
  debtSource:'cfo_metrik_borc'|null};
const tl=(v:number)=>Math.round(v).toLocaleString('tr-TR');
export function debtGate(debt:number|null,fresh:boolean,limitTry:number|null=null,limitUsd:number|null=null,
  debtSource:DebtGate['debtSource']=null):DebtGate{
  const ok=debt!==null&&Number.isFinite(debt)&&debt>=0;
  return {limitTry,limitUsd,totalDebtTry:debt,balancesFresh:fresh,debtSource,open:ok&&limitTry!=null&&debt!<limitTry&&fresh,
    reason:debt==null?'Toplam borç doğrulanamadı':limitTry==null?'Borç hedefinin TL karşılığı bilinmiyor (hedef ya da TCMB kuru yok)':
      debt>=limitTry?`Finansal borç ${limitUsd!=null?`${tl(limitUsd)} USD (${tl(limitTry)} TL)`:`${tl(limitTry)} TL`} hedefinin altına düşene kadar yalnız gelecek sipariş listesi`
        :'Borç ve kaynak tazeliği doğrulanmalı'};
}
const FRESH=`(select bool_and("remainingTry" is not null and "lastUpdatedAt">=$1::timestamp-interval '7 days') from cfo_loan where status::text<>'KAPANDI') as loans_ok,
      (select bool_and("totalDebtTry" is not null and "lastUpdatedAt">=$1::timestamp-interval '7 days') from cfo_credit_card where "isActive") as cards_ok,
      (select bool_and("balanceTry" is not null and "lastUpdatedAt">=$1::timestamp-interval '2 days') from cfo_bank_account where "isActive") as banks_ok`;
/** One authoritative aggregate; never substitute card debt or a projected date. */
export async function readOrderDebtGate(db:ReadSource,now=new Date()):Promise<DebtGate>{
  try{
    // Varlık kontrolü hata üretmez: satın alma işlemi transaction içinde çağırır, başarısız sorgu transaction'ı bozardı.
    const [has]=await db.query<Row>(`select to_regprocedure('public.cfo_metrik_borc()') is not null as contract`);
    if(has?.contract===true){
      const [row]=await db.query<Row>(`select (select tutar from cfo_metrik_borc() where sira=100)::numeric as debt,
        (select "debtTargetUsd" from cfo_settings order by "updatedAt" desc limit 1)::numeric as target_usd,
        (select s.rate from (${STRATEGIC_FX_SQL}) s)::numeric as fx,
        ${FRESH}`,now.toISOString());
      const debt=row?.debt==null?null:Number(row.debt),usd=row?.target_usd==null?null:Number(row.target_usd),fx=row?.fx==null?null:Number(row.fx);
      const limit=usd!=null&&fx!=null&&usd>0&&fx>0?Math.round(usd*fx*100)/100:null;
      return debtGate(debt,row?.loans_ok===true&&row?.cards_ok===true&&row?.banks_ok===true,limit,usd,'cfo_metrik_borc');
    }
    // Sözleşme fonksiyonu yok (migration'sız şema): eski "cfo_servet.borc < 5M TL" yoluna düşülmez, kapı kapalı.
    return {...debtGate(null,false),reason:'Borç sözleşmesi (cfo_metrik_borc) bulunamadı; sipariş kapısı kapalı'};
  }catch{return debtGate(null,false);}
}
