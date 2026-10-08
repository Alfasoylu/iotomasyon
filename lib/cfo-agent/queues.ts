import "server-only";
import type { Anomaly } from "./types";
import { businessSource, type ReadSource } from "./sources";

/** Anomaliye karşılık zaten açık iş kaydı (ölü stok bulgusu, stok sıçraması, açık soru) — bulgu satırı onu "Açık iş" diye gösterir. */
export async function existingQueueRecords(anomalies:Anomaly[],db:ReadSource=businessSource):Promise<Map<string,string[]>> {
  const result=new Map<string,string[]>();
  const present=await db.query<{name:string}>(`select table_name as name from information_schema.tables where table_schema='public'
    and table_name=any($1::text[])`,["cfo_dead_stock_finding","cfo_stok_sicrama_durum","cfo_question"]);
  const sources=new Set(present.map(r=>r.name));
  for(const a of anomalies) {
    const sku=a.entityId.split(":").at(-1)!; const ids:string[]=[];
    for(const required of ["cfo_dead_stock_finding","cfo_stok_sicrama_durum","cfo_question"])if(!sources.has(required))ids.push(`queue_check_unavailable:${required}`);
    if(a.rule==="DEAD_STOCK"&&sources.has("cfo_dead_stock_finding")) {
      const rows=await db.query(`select id::text as id from cfo_dead_stock_finding where sku=$1 and status not in ('kapandi','gecersiz') limit 5`,sku);
      ids.push(...rows.map(r=>`cfo_dead_stock_finding:${r.id}`));
    }
    if(["STOCKOUT","PROCUREMENT","DEAD_STOCK"].includes(a.rule)&&sources.has("cfo_stok_sicrama_durum")) {
      const rows=await db.query(`select id::text as id from cfo_stok_sicrama_durum where sku=$1 and durum='ACIK' limit 5`,sku);
      ids.push(...rows.map(r=>`cfo_stok_sicrama_durum:${r.id}`));
    }
    if(sources.has("cfo_question")) {
      // Match structured entity/code when available. General priority-one cash
      // questions also block redundant company-cash insights.
      const rows=await db.query(`select id::text as id from cfo_question q where status='ACIK' and
        ((to_jsonb(q)->>'entity_key' in ($1,$2) and (to_jsonb(q)->>'code'=$3 or to_jsonb(q)->>'code' is null))
          or ($4::boolean and area='nakit' and priority=1)) limit 5`,sku,a.entityId,a.rule,a.rule==="CASH_CRITICAL");
      ids.push(...rows.map(r=>`cfo_question:${r.id}`));
    }
    result.set(a.id,ids);
  }
  return result;
}
