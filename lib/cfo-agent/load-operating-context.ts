import "server-only";
import { researchCfoSources,type ResearchState } from "./research";
import { skuKey } from "./sku";
import { prisma } from "@/lib/prisma";
import { buildCfoAgentSnapshot } from "./snapshot";
import { buildOperatingContext } from "./operating-context";
import { getCfoConfig } from "./config";
import type { ReadSource } from "./sources";
import { savepointSource } from "./savepoint-source";

export async function loadOperatingContext(researchMemory?:ResearchState) {
  return prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout='15s'");
    // Her sorgu kendi savepoint'inde ve SIRAYLA (eşzamanlı çağrılar 3B001 üretiyordu — savepoint-source.ts)
    const db: ReadSource = savepointSource(tx);
    const config=getCfoConfig({...process.env,AI_CFO_ENABLED:'false',AI_CFO_MONITOR_ENABLED:'false',AI_CFO_PROVIDER:'disabled',AI_CFO_CANONICAL_SALES_VALIDATED:'true'});
    // Snapshot independently verifies the reviewed profile and invalidates trust on definition changes.
    const snapshot=await buildCfoAgentSnapshot({db,config,compact:false,sourceProfile:'alfas_2026_10_04'});
    const context=await buildOperatingContext(db,snapshot);
    const research=researchMemory?await researchCfoSources(db,researchMemory,context.asOf,new Map(context.catalogCosts.records.map(p=>[skuKey(String((p as Record<string,unknown>).sku)),{virtual:p.virtual,noReorder:p.noReorder}]))):undefined;
    return {...context,research};
  },{maxWait:5000,timeout:105000});
}
