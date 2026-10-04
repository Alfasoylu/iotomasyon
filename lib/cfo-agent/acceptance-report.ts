import { buildCfoAgentSnapshot } from "./snapshot";
import { getCfoConfig } from "./config";
import { evaluateCfoAcceptance } from "./acceptance";
import { hashSnapshot } from "./evidence";
import { assertReviewedCfoDefinitions, cfoAcceptanceContext, REVIEWED_CFO_SOURCE_BINDINGS } from "./acceptance-profile";
import { cfoAcceptanceDiagnostics } from "./acceptance-diagnostics";
import type { ReadSource } from "./sources";


/** Shared CLI/admin report. Caller owns the read-only, consistent transaction. */
export async function buildCfoAcceptanceReport(db:ReadSource,env:Record<string,string|undefined>) {
  const {mode,asOf,profile,isCurrentComparison}=cfoAcceptanceContext(env);
    if(profile) {
      const definitions=await db.query(`select c.relname::text as source,pg_get_viewdef(c.oid,true) as definition
        from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
        and c.relkind in ('v','m') and c.relname=any($1::text[])`,["cfo_satis_birim_duz","cfo_satis_siparis"]);
      assertReviewedCfoDefinitions(definitions);
    }
    const config=getCfoConfig({...env,AI_CFO_ENABLED:"false",AI_CFO_MONITOR_ENABLED:"false",AI_CFO_PROVIDER:"disabled",
      ...(profile?{AI_CFO_CANONICAL_SALES_VALIDATED:"true"}:{})});
    const snapshot=await buildCfoAgentSnapshot({db,now:new Date(asOf),config,compact:false,sourceProfile:env.AI_CFO_SOURCE_PROFILE,
      ...(profile&&!env.AI_CFO_SOURCE_PROFILE?{bindings:REVIEWED_CFO_SOURCE_BINDINGS}:{})});
    const checks=evaluateCfoAcceptance(snapshot),passed=checks.filter(c=>c.passed).length;
    const diagnostics=isCurrentComparison?await cfoAcceptanceDiagnostics(db,asOf):undefined;
    const nativeProjection=snapshot.cash.minimumProjectedPosition.value!=null&&env.AI_CFO_SOURCE_PROFILE==='alfas_2026_10_04'
      ?await db.query(`select min(pozisyon) as minimum_position,count(*)::int as days from public.cfo_nakit_projeksiyon(120)`):null;
    const adapterVerification={sourceProfile:env.AI_CFO_SOURCE_PROFILE??null,
      reviewedSourceChanged:snapshot.dataQuality.missingFields.filter(f=>f.startsWith('reviewed_source_changed:')),
      minimumProjectedPosition:snapshot.cash.minimumProjectedPosition,nativeProjection,
      banksFresh:snapshot.cash.banksFresh,priceFloorsKnown:snapshot.products.filter(p=>p.priceFloor.value!=null).length,
      priceFloorsUnknown:snapshot.products.filter(p=>p.priceFloor.value==null).length,
      setsWithUnknownComponents:snapshot.dataQuality.missingFields.filter(f=>f.startsWith('set_component_unknown:')).length};
    const report={mode,reference:"ALFAS-2026-10-03",testedAt:new Date().toISOString(),asOf,snapshotHash:hashSnapshot(snapshot),calculationVersion:snapshot.calculationVersion,passed,total:12,checks,
      productionApproval:false,
      ...(diagnostics?{diagnostics}:{}),
      adapterVerification,
      dataQuality:snapshot.dataQuality,limitations:"Current mutable balances/inventory cannot reconstruct a historical ledger. Run against the reference database snapshot."};
  return report;
}
