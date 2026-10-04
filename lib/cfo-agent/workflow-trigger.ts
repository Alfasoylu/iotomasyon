import 'server-only';
import { after } from 'next/server';
import { safeCfoCycle } from './workflow';
/** Best effort after-response work; the independent daily cron retries missed events. */
export function scheduleCfoCycle(trigger:string){after(async()=>{await safeCfoCycle(trigger);});}
