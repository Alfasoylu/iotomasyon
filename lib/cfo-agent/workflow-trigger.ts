import 'server-only';
import { after } from 'next/server';
import { safeCfoCycle } from './workflow';
import { safeAiCfoRun } from './ai-trigger';
/** Best effort after-response work; the independent daily cron retries missed events.
 *  `aiMonitor`: daily crons also run the AI CFO monitor after the cycle (goals fresh); it is a no-op while its flags are off. */
export function scheduleCfoCycle(trigger:string,opts:{aiMonitor?:boolean}={}){after(async()=>{await safeCfoCycle(trigger);if(opts.aiMonitor)await safeAiCfoRun('monitor');});}
