import "server-only";
import { prisma } from "@/lib/prisma";
import type { Anomaly, MemoryItem } from "./types";
import { businessSource, type ReadSource } from "./sources";

/** Deterministik hafıza (2026-10-07): yalnız bu anomalilerle (cooldownKey / SKU) ilgili EN ÇOK 2 önceki karar; yoksa []. */
export const MAX_MEMORY_ITEMS=2;
export async function retrieveRelevantMemory(anomalies:Anomaly[],db:ReadSource=businessSource):Promise<MemoryItem[]> {
  const skus=[...new Set(anomalies.filter(a=>a.entityType==="sku").map(a=>a.entityId.split(":").at(-1)!))].slice(0,8);
  const memory:MemoryItem[]=[];
  // Önce aynı anomali için verilmiş son AI kararı, sonra SKU'nun yürürlükteki ürün kararı.
  const previous=await prisma.cfoInsight.findMany({where:{cooldownKey:{in:anomalies.map(a=>a.cooldownKey)}},orderBy:{createdAt:"desc"},take:MAX_MEMORY_ITEMS,select:{entityId:true,recommendation:true,createdAt:true}});
  for(const r of previous)memory.push({source:"cfo_insight",entityId:r.entityId,text:r.recommendation.slice(0,200),asOf:r.createdAt.toISOString()});
  if(skus.length&&memory.length<MAX_MEMORY_ITEMS) {
    // ::text — Prisma raw queries cannot deserialize a regclass value ("Failed to deserialize column of type 'regclass'").
    const present=await db.query(`select to_regclass('public.cfo_urun_karar')::text as source`);
    if(present[0]?.source) {
      const rows=await db.query(`select sku,karar,left(sebep,200) as sebep,updated_at from cfo_urun_karar where sku=any($1::text[])
        and (gecerli_bitis is null or gecerli_bitis>=current_date) order by updated_at desc limit 2`,skus);
      for(const r of rows)memory.push({source:"cfo_urun_karar",entityId:String(r.sku),text:`${r.karar}: ${r.sebep??""}`.slice(0,200),asOf:new Date(String(r.updated_at)).toISOString()});
    }
  }
  return memory.slice(0,MAX_MEMORY_ITEMS);
}

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
