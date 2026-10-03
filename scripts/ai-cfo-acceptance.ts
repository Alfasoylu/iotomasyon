import { Client } from "pg";
import { writeFile } from "node:fs/promises";
import { buildCfoAgentSnapshot } from "../lib/cfo-agent/snapshot";
import { getCfoConfig } from "../lib/cfo-agent/config";
import { evaluateCfoAcceptance } from "../lib/cfo-agent/acceptance";
import { hashSnapshot } from "../lib/cfo-agent/evidence";
import type { ReadSource,Row } from "../lib/cfo-agent/sources";

async function main() {
  const url=process.env.AI_CFO_READ_DATABASE_URL;
  if(!url)throw new Error("read_only_database_credential_missing");
  const asOf=process.env.AI_CFO_ACCEPTANCE_AS_OF;
  if(!asOf||!Number.isFinite(Date.parse(asOf))||!asOf.startsWith("2026-10-03T"))throw new Error("reference_as_of_required_2026_10_03");
  const client=new Client({connectionString:url,connectionTimeoutMillis:10000,query_timeout:30000});
  try {
    await client.connect();await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout='30s'");
    const db:ReadSource={async query<T extends Row>(sql:string,...params:unknown[]){return (await client.query(sql,params)).rows as T[];}};
    const snapshot=await buildCfoAgentSnapshot({db,now:new Date(asOf),config:getCfoConfig(),compact:false});
    const checks=evaluateCfoAcceptance(snapshot),passed=checks.filter(c=>c.passed).length;
    const report={reference:"ALFAS-2026-10-03",testedAt:new Date().toISOString(),asOf,snapshotHash:hashSnapshot(snapshot),calculationVersion:snapshot.calculationVersion,passed,total:12,checks,
      dataQuality:snapshot.dataQuality,limitations:"Current mutable balances/inventory cannot reconstruct a historical ledger. Run against the reference database snapshot."};
    const output=process.env.AI_CFO_ACCEPTANCE_REPORT_PATH??"/tmp/ai-cfo-acceptance.json";
    await writeFile(output,JSON.stringify(report,null,2),{mode:0o600});
    console.log(`Live acceptance: ${passed}/12. Report saved. No migration, flag or business data changed.`);
    for(const c of checks)console.log(`${c.passed?"PASS":"FAIL"} ${c.id}`);
    if(passed!==12)process.exitCode=1;
    await client.query("ROLLBACK");
  } finally {await client.end();}
}
main().catch(()=>{console.error("Live acceptance could not complete. Check read-only credential, source bindings and reference timestamp. No secrets logged.");process.exitCode=1;});
