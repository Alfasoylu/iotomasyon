/** İstanbul takvimi: gün, saat dilimi anahtarı, günün dakikası, gün/ay başı (motor idempotency'si ve "dünden beri" bayrağı). */
export function istanbulPeriod(now:Date):{date:string;hour:string;minutes:number;dayStart:Date;monthStart:Date} {
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now).map(p=>[p.type,p.value]));
  const date=`${parts.year}-${parts.month}-${parts.day}`;
  return {date,hour:`${date}T${parts.hour}`,minutes:Number(parts.hour)*60+Number(parts.minute),dayStart:new Date(`${date}T00:00:00+03:00`),monthStart:new Date(`${parts.year}-${parts.month}-01T00:00:00+03:00`)};
}
