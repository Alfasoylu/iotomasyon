import "server-only";
import { Client } from "pg";

export interface MonitorLock { acquire():Promise<boolean>; release():Promise<void> }
export function createMonitorLock(env:Record<string,string|undefined>=process.env):MonitorLock {
  let client:Client|undefined,held=false;
  return {
    async acquire(){
      // A session advisory lock must use the SAME physical connection through
      // finally. Transaction-pooler Prisma queries cannot safely hold it.
      const url=env.AI_CFO_LOCK_DATABASE_URL;
      if(!url||env.AI_CFO_LOCK_SESSION_MODE!=="true")throw new Error("session_lock_not_configured");
      if(new URL(url).port==="6543")throw new Error("transaction_pooler_not_allowed");
      client=new Client({connectionString:url,connectionTimeoutMillis:5000,query_timeout:10000,application_name:"cfo-agent-lock"});
      await client.connect();
      const result=await client.query<{locked:boolean}>("select pg_try_advisory_lock(hashtext('cfo_agent_monitor')) as locked");held=result.rows[0].locked;return held;
    },
    async release(){if(client){try{if(held)await client.query("select pg_advisory_unlock(hashtext('cfo_agent_monitor'))");}finally{await client.end();client=undefined;held=false;}}},
  };
}
