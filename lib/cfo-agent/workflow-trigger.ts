import 'server-only';
import { after } from 'next/server';
import { safeCfoCycle } from './workflow';
import { safeCfoEngineRun } from './ai-trigger';
import type { EngineTrigger } from './store';
import { engineBudgetOk } from './engine-budget';
import { prisma } from '@/lib/prisma';
/** Best effort after-response work; the independent daily cron retries missed events.
 *  `engine`: daily syncs also run the deterministic CFO engine after the cycle (goals fresh); no-op while AI_CFO_MONITOR_ENABLED is off. */
// maxDurationSec: çağıran route'un süre sınırı. Motor yalnız yeterli süre kaldıysa başlar (engine-budget.ts); atlanırsa defterde iz kalır.
export function scheduleCfoCycle(trigger:string,opts:{engine?:EngineTrigger;maxDurationSec?:number}={}){
  const startedAt=Date.now();
  after(async()=>{
    await safeCfoCycle(trigger);
    if(!opts.engine)return;
    if(engineBudgetOk(startedAt,Date.now(),opts.maxDurationSec??300)){await safeCfoEngineRun(opts.engine);return;}
    try{await prisma.cfoChangeLog.create({data:{area:'erisim',item:'CFO motoru atlandı (süre bütçesi)',source:'cfo-engine-budget',kind:'arastirma',
      note:`${opts.engine}: senkron ${Math.round((Date.now()-startedAt)/1000)} sn sürdü; motor ~150 sn ister, fonksiyon sınırı ${opts.maxDurationSec??300} sn. Sıradaki zamanlanmış koşu çalıştırır.`}});}catch{}
  });
}
