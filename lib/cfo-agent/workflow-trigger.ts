import 'server-only';
import { after } from 'next/server';
import { safeCfoCycle } from './workflow';
import { safeCfoEngineRun } from './ai-trigger';
import type { EngineTrigger } from './store';
/** Best effort after-response work; the independent daily cron retries missed events.
 *  `engine`: daily syncs also run the deterministic CFO engine after the cycle (goals fresh); no-op while AI_CFO_MONITOR_ENABLED is off. */
export function scheduleCfoCycle(trigger:string,opts:{engine?:EngineTrigger}={}){after(async()=>{await safeCfoCycle(trigger);if(opts.engine)await safeCfoEngineRun(opts.engine);});}
