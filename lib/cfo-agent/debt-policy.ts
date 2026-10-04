import type { ReadSource, Row } from './sources';
export const NEW_ORDER_DEBT_LIMIT_TRY=5_000_000;
export function debtGate(debt:number|null,fresh:boolean){
  return {limitTry:NEW_ORDER_DEBT_LIMIT_TRY,totalDebtTry:debt,balancesFresh:fresh,open:debt!==null&&Number.isFinite(debt)&&debt>=0&&debt<NEW_ORDER_DEBT_LIMIT_TRY&&fresh,
    reason:debt==null?'Toplam borç doğrulanamadı':debt>=NEW_ORDER_DEBT_LIMIT_TRY?'Toplam borç 5 milyon TL altına düşene kadar yalnız gelecek sipariş listesi':'Borç ve kaynak tazeliği doğrulanmalı'};
}
/** One authoritative aggregate; never substitute card debt or a projected date. */
export async function readOrderDebtGate(db:ReadSource,now=new Date()){
  try{
    const [row]=await db.query<Row>(`select w.borc::numeric as debt,
      (select bool_and("remainingTry" is not null and "lastUpdatedAt">=$1::timestamp-interval '7 days') from cfo_loan where status::text<>'KAPANDI') as loans_ok,
      (select bool_and("totalDebtTry" is not null and "lastUpdatedAt">=$1::timestamp-interval '7 days') from cfo_credit_card where "isActive") as cards_ok,
      (select bool_and("balanceTry" is not null and "lastUpdatedAt">=$1::timestamp-interval '2 days') from cfo_bank_account where "isActive") as banks_ok
      from cfo_servet w`,now.toISOString());
    const debt=row?.debt==null?null:Number(row.debt);
    return debtGate(debt,row?.loans_ok===true&&row?.cards_ok===true&&row?.banks_ok===true);
  }catch{return debtGate(null,false);}
}
