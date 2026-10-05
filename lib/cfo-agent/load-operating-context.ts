import "server-only";
import { researchCfoSources,type ResearchState } from "./research";
import { skuKey } from "./sku";
import { prisma } from "@/lib/prisma";
import { buildCfoAgentSnapshot } from "./snapshot";
import { buildOperatingContext } from "./operating-context";
import { getCfoConfig } from "./config";
import type { ReadSource, Row } from "./sources";

export async function loadOperatingContext(researchMemory?:ResearchState) {
  return prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout='15s'");
    let queryId=0;
    const db: ReadSource = { async query<T extends Row>(sql:string,...params:unknown[]):Promise<T[]> {
      const point=`cfo_context_${++queryId}`;
      await tx.$executeRawUnsafe(`SAVEPOINT ${point}`);
      try {
        const rows=await tx.$queryRawUnsafe<T[]>(sql,...params);
        await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${point}`);return rows;
      } catch(error) {
        await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${point}`);
        await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${point}`);throw error;
      }
    }};
    const config=getCfoConfig({...process.env,AI_CFO_ENABLED:'false',AI_CFO_MONITOR_ENABLED:'false',AI_CFO_PROVIDER:'disabled',AI_CFO_CANONICAL_SALES_VALIDATED:'true'});
    // Snapshot independently verifies the reviewed profile and invalidates trust on definition changes.
    const snapshot=await buildCfoAgentSnapshot({db,config,compact:false,sourceProfile:'alfas_2026_10_04'});
    const context=await buildOperatingContext(db,snapshot);
    const research=researchMemory?await researchCfoSources(db,researchMemory,context.asOf,new Map(context.catalogCosts.records.map(p=>[skuKey(String((p as Record<string,unknown>).sku)),{virtual:p.virtual,noReorder:p.noReorder}]))):undefined;
    return {...context,research};
  },{maxWait:5000,timeout:105000});
}
