import { Client } from "pg";
import { writeFile } from "node:fs/promises";
import { cfoReaderOptions, checkCfoReaderAccess, cfoAccessFailure } from "../lib/cfo-agent/access-check";
import { buildCfoAgentSnapshot } from "../lib/cfo-agent/snapshot";
import { buildOperatingContext } from "../lib/cfo-agent/operating-context";
import { getCfoConfig } from "../lib/cfo-agent/config";
import type { ReadSource, Row } from "../lib/cfo-agent/sources";

async function main() {
  // Only an explicitly configured, restricted reader credential is accepted.
  const client=new Client(cfoReaderOptions(process.env.CFO_READER_DATABASE_URL));
  try {
    await client.connect();
    const access:ReadSource={async query<T extends Row>(sql:string,...params:unknown[]):Promise<T[]>{return(await client.query(sql,params)).rows;}};
    await checkCfoReaderAccess(access);
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout='15s'");
    let id=0;
    const source:ReadSource={async query<T extends Row>(sql:string,...params:unknown[]):Promise<T[]>{
      const point=`cfo_reader_${++id}`;
      await client.query(`SAVEPOINT ${point}`);
      try {const rows=(await client.query(sql,params)).rows;await client.query(`RELEASE SAVEPOINT ${point}`);return rows;}
      catch(error){await client.query(`ROLLBACK TO SAVEPOINT ${point}`);await client.query(`RELEASE SAVEPOINT ${point}`);throw error;}
    }};
    const config=getCfoConfig({...process.env,AI_CFO_ENABLED:'false',AI_CFO_MONITOR_ENABLED:'false',AI_CFO_PROVIDER:'disabled',AI_CFO_CANONICAL_SALES_VALIDATED:'true'});
    const snapshot=await buildCfoAgentSnapshot({db:source,config,compact:false,sourceProfile:'alfas_2026_10_04'});
    const context=await buildOperatingContext(source,snapshot);
    await client.query('ROLLBACK');
    const path=`/tmp/iotomasyon-cfo-context-${Date.now()}.json`;
    await writeFile(path,JSON.stringify(context,null,2),{mode:0o600,flag:'wx'});
    console.log(JSON.stringify({completed:true,readOnly:true,privateReportPath:path}));
  } finally {await client.end();}
}
main().catch(error=>{console.error(JSON.stringify({completed:false,failure:cfoAccessFailure(error)}));process.exitCode=1;});
