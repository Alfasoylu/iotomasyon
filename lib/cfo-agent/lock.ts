import "server-only";
import { Client } from "pg";
import { cfoAccessFailure } from "./access-check";

/** Fixed, credential-free diagnostic tag for a monitor-lock failure (returned to /admin/ai-cfo; never the URI or a raw driver error). */
export class LockError extends Error {
  constructor(readonly code: string) { super(code); this.name = "LockError"; }
}

export interface MonitorLock { acquire():Promise<boolean>; release():Promise<void> }
export function createMonitorLock(env:Record<string,string|undefined>=process.env):MonitorLock {
  let client:Client|undefined,held=false;
  return {
    async acquire(){
      // A session advisory lock must use the SAME physical connection through
      // finally. Transaction-pooler Prisma queries cannot safely hold it.
      const url=env.AI_CFO_LOCK_DATABASE_URL;
      if(!url||env.AI_CFO_LOCK_SESSION_MODE!=="true")throw new LockError("session_lock_not_configured");
      let parsed:URL;
      try{parsed=new URL(url);}catch{throw new LockError("lock_invalid_database_uri");}
      if(parsed.port==="6543")throw new LockError("transaction_pooler_not_allowed");
      // The direct host (db.<ref>.supabase.co) is IPv6-only and unreachable from Vercel functions: use the session pooler.
      if(/^db\.[a-z0-9]+\.supabase\.co$/i.test(parsed.hostname))throw new LockError("lock_direct_host_not_reachable_use_session_pooler");
      try{
        client=new Client({connectionString:url,connectionTimeoutMillis:5000,query_timeout:10000,application_name:"cfo-agent-lock"});
        await client.connect();
        const result=await client.query<{locked:boolean}>("select pg_try_advisory_lock(hashtext('cfo_agent_monitor')) as locked");held=result.rows[0].locked;return held;
      }catch(error){
        try{await client?.end();}catch{/* closing a failed connection must not mask the cause */}
        client=undefined;held=false;
        throw new LockError(`lock_${cfoAccessFailure(error)}`);
      }
    },
    async release(){if(client){try{if(held)await client.query("select pg_advisory_unlock(hashtext('cfo_agent_monitor'))");}finally{await client.end();client=undefined;held=false;}}},
  };
}
