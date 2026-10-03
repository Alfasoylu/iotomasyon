import { Client } from "pg";
import { readFile,writeFile } from "node:fs/promises";
import { getCfoConfig } from "../lib/cfo-agent/config";
import { evaluateShadowWeek, type ShadowRun, type ShadowReview } from "../lib/cfo-agent/shadow";
async function main(){
  if(getCfoConfig().enabled)throw new Error("ai_must_remain_disabled");
  const url=process.env.AI_CFO_READ_DATABASE_URL,start=process.env.AI_CFO_SHADOW_START;
  if(!url||!start||!/^\d{4}-\d{2}-\d{2}$/.test(start))throw new Error("read_credential_and_start_required");
  const reviewPath=process.env.AI_CFO_SHADOW_REVIEWS_PATH;
  const reviews:ShadowReview[]=reviewPath?JSON.parse(await readFile(reviewPath,"utf8")):[];
  const db=new Client({connectionString:url,query_timeout:30000,connectionTimeoutMillis:10000});
  try{
    await db.connect();await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const runs=(await db.query(`select period_key as "periodKey",status,trigger_reasons as reasons from cfo_run
      where type='monitor' and generated_at>=($1::date::timestamp at time zone 'Europe/Istanbul')
      and generated_at<(($1::date+7)::timestamp at time zone 'Europe/Istanbul') order by generated_at`,[start])).rows as ShadowRun[];
    const usage=(await db.query(`select count(*)::int as calls from cfo_usage
      where status in ('reserved','completed','failed') and created_at>=($1::date::timestamp at time zone 'Europe/Istanbul')
      and created_at<(($1::date+7)::timestamp at time zone 'Europe/Istanbul')`,[start])).rows[0].calls as number;
    const report=evaluateShadowWeek(start,runs,reviews,usage,new Date());
    const path=process.env.AI_CFO_SHADOW_REPORT_PATH??"/tmp/ai-cfo-shadow.json";
    await writeFile(path,JSON.stringify(report,null,2),{mode:0o600});
    console.log(`Shadow gate: ${report.passed?"PASS":"PENDING/FAIL"}. ${runs.length} monitor runs, ${usage} billable/reserved AI calls. Report saved. Flags unchanged.`);
    if(!report.passed)process.exitCode=1;
    await db.query("ROLLBACK");
  }finally{await db.end();}
}
main().catch(()=>{console.error("Shadow report could not complete; check config, read-only connection and review file. No secrets logged.");process.exitCode=1;});
