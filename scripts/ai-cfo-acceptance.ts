import { cfoAcceptanceContext } from "../lib/cfo-agent/acceptance-profile";
import { buildCfoAcceptanceReport } from "../lib/cfo-agent/acceptance-report";
import { Client } from "pg";
import { writeCfoDiagnostic } from "../lib/cfo-agent/diagnostic-report";
import { cfoReaderOptions, checkCfoReaderAccess, cfoAccessFailure } from "../lib/cfo-agent/access-check";
import type { ReadSource,Row } from "../lib/cfo-agent/sources";

async function main() {
  const {isCurrentComparison}=cfoAcceptanceContext(process.env);
  const client=new Client({...cfoReaderOptions(process.env.AI_CFO_READ_DATABASE_URL),query_timeout:30000});
  try {
    await client.connect();
    const db:ReadSource={async query<T extends Row>(sql:string,...params:unknown[]){return (await client.query(sql,params)).rows as T[];}};
    const access=await checkCfoReaderAccess(db);
    if(access.productRowsVisible!==true || access.missingOrUnreadable.length)throw new Error("business_sources_not_visible");
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout='30s'");
    const report=await buildCfoAcceptanceReport(db,process.env);
    const {checks,passed}=report;
    const output=process.env.AI_CFO_ACCEPTANCE_REPORT_PATH??"/tmp/ai-cfo-acceptance.json";
    await writeCfoDiagnostic(output,report);
    console.log(`${isCurrentComparison?"Current ledger comparison (NOT release acceptance)":"Live acceptance"}: ${passed}/12. No migration, flag, AI or business data changed.`);
    // Actual/expected amounts and private source diagnostics are in the report
    // only, never public Actions logs. IDs reveal no financial values.
    for(const c of checks)console.log(`${c.passed?"MATCH":"DIFFERENCE"} ${c.id}`);
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
