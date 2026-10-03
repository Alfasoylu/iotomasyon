import { Client } from "pg";
import { writeFile } from "node:fs/promises";
import { buildCfoAgentSnapshot } from "../lib/cfo-agent/snapshot";
import { getCfoConfig } from "../lib/cfo-agent/config";
import { evaluateCfoAcceptance } from "../lib/cfo-agent/acceptance";
import { hashSnapshot } from "../lib/cfo-agent/evidence";
import { cfoReaderOptions, checkCfoReaderAccess, cfoAccessFailure } from "../lib/cfo-agent/access-check";
import { assertReviewedCfoDefinitions, cfoAcceptanceContext, REVIEWED_CFO_SOURCE_BINDINGS } from "../lib/cfo-agent/acceptance-profile";
import { cfoAcceptanceDiagnostics } from "../lib/cfo-agent/acceptance-diagnostics";
import type { ReadSource,Row } from "../lib/cfo-agent/sources";

async function main() {
  const {mode,asOf,profile,isCurrentComparison}=cfoAcceptanceContext(process.env);
  const client=new Client({...cfoReaderOptions(process.env.AI_CFO_READ_DATABASE_URL),query_timeout:30000});
  try {
    await client.connect();
    const db:ReadSource={async query<T extends Row>(sql:string,...params:unknown[]){return (await client.query(sql,params)).rows as T[];}};
    const access=await checkCfoReaderAccess(db);
    if(access.productRowsVisible!==true || access.missingOrUnreadable.length)throw new Error("business_sources_not_visible");
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout='30s'");
    if(profile) {
      const definitions=await db.query(`select c.relname::text as source,pg_get_viewdef(c.oid,true) as definition
        from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
        and c.relkind in ('v','m') and c.relname=any($1::text[])`,["cfo_satis_birim_duz","cfo_satis_siparis"]);
      assertReviewedCfoDefinitions(definitions);
    }
    const config=getCfoConfig({...process.env,AI_CFO_ENABLED:"false",AI_CFO_MONITOR_ENABLED:"false",AI_CFO_PROVIDER:"disabled",
      ...(profile?{AI_CFO_CANONICAL_SALES_VALIDATED:"true"}:{})});
    const snapshot=await buildCfoAgentSnapshot({db,now:new Date(asOf),config,compact:false,
      ...(profile?{bindings:REVIEWED_CFO_SOURCE_BINDINGS}:{})});
    const checks=evaluateCfoAcceptance(snapshot),passed=checks.filter(c=>c.passed).length;
    const diagnostics=isCurrentComparison?await cfoAcceptanceDiagnostics(db,asOf):undefined;
    const report={mode,reference:"ALFAS-2026-10-03",testedAt:new Date().toISOString(),asOf,snapshotHash:hashSnapshot(snapshot),calculationVersion:snapshot.calculationVersion,passed,total:12,checks,
      productionApproval:false,
      ...(diagnostics?{diagnostics}:{}),
      dataQuality:snapshot.dataQuality,limitations:"Current mutable balances/inventory cannot reconstruct a historical ledger. Run against the reference database snapshot."};
    const output=process.env.AI_CFO_ACCEPTANCE_REPORT_PATH??"/tmp/ai-cfo-acceptance.json";
    await writeFile(output,JSON.stringify(report,null,2),{mode:0o600});
    console.log(`${isCurrentComparison?"Current ledger comparison (NOT release acceptance)":"Live acceptance"}: ${passed}/12. No migration, flag, AI or business data changed.`);
    for(const c of checks)console.log(`${c.passed?"MATCH":"DIFFERENCE"} ${JSON.stringify(c)}`);
    if(diagnostics)console.log(`AGGREGATE_DIAGNOSTICS ${JSON.stringify(diagnostics)}`);
    if(!isCurrentComparison&&passed!==12)process.exitCode=1;
    await client.query("ROLLBACK");
  } finally {await client.end();}
}
main().catch(error=>{
  const safeCodes=["reference_as_of_required_2026_10_03","invalid_acceptance_mode","invalid_acceptance_source_profile",
    "reviewed_canonical_definition_changed","business_sources_not_visible"];
  const failure=error instanceof Error&&safeCodes.includes(error.message)?error.message:cfoAccessFailure(error);
  console.error(JSON.stringify({completed:false,failure,secretsLogged:false}));process.exitCode=1;
});
