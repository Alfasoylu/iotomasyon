import 'server-only';
import { prisma } from '@/lib/prisma';
import { loadOperatingContext } from './load-operating-context';
import { planCfoWork } from './workflow-plan';
import { saveWorkPlan,saveAnswerContext, transitionWork, WORK_SOURCE } from './workflow-store';
import type { WriteSource } from './workflow-store';
import type { Prisma } from '@prisma/client';
import { CycleFailure,cycleDiagnostic,type CycleStage } from './workflow-diagnostics';
function writer(tx:Prisma.TransactionClient):WriteSource{return {query: (sql,...params)=>tx.$queryRawUnsafe(sql,...params),execute:(sql,...params)=>tx.$executeRawUnsafe(sql,...params)};}
export async function runCfoCycle(trigger:string){
  if(process.env.VERCEL_ENV&&process.env.VERCEL_ENV!=='production')return {completed:false as const,reason:'production_only'};
  // Lock across reading and persistence, released on disconnect even if the process dies.
  // The transaction advisory lock prevents overlapping cycles without migrations.
  let stage:CycleStage='lock';
  try{return await prisma.$transaction(async lockTx=>{
    const [lock]=await lockTx.$queryRawUnsafe<{locked:boolean}[]>('select pg_try_advisory_xact_lock(712004,24) as locked');
    if(!lock?.locked)return {completed:false as const,reason:'already_running'};
    stage='context';const context=await loadOperatingContext();
    // Separate stages retain an actionable diagnosis without persisting query data.
    stage='settings';const settings=await prisma.cfoSettings.findFirst({orderBy:{updatedAt:'desc'}});
    stage='questions';const knowledge=await prisma.cfoQuestion.findMany({select:{id:true,question:true,answer:true,status:true},where:{status:{not:'IPTAL'}}});
    stage='answers';const answers=await prisma.cfoQuestion.findMany({where:{status:'CEVAPLANDI',processedAt:null},include:{attachments:{select:{id:true}}}});
    stage='planning';
    const plan=planCfoWork(context,settings?{...settings}: {},knowledge);
    stage='persist';const result=await prisma.$transaction(async tx=>{
      const db=writer(tx);
      const answersRead=await saveAnswerContext(db,answers);
      const output=await saveWorkPlan(db,plan,trigger);
      return {...output,answersRead};
    },{timeout:20000});
    stage='commit';return result;
  },{maxWait:5000,timeout:150000});}catch(error){throw new CycleFailure(stage,error);}
}
export async function safeCfoCycle(trigger:string){
  try{return await runCfoCycle(trigger);}catch(error){
    const diagnostic=cycleDiagnostic(error);
    // Fixed diagnostic only: never log SQL, credentials, bank amounts or notebook contents.
    try{await prisma.cfoChangeLog.create({data:{area:'erisim',item:'CFO çalışma döngüsü',source:WORK_SOURCE,kind:'arastirma',note:'cycle_unavailable',newValue:JSON.stringify(diagnostic)}});}catch{}
    return {completed:false as const,reason:'cycle_unavailable',diagnostic,message:`Döngü tamamlanamadı (${diagnostic.stage} · ${diagnostic.code}${diagnostic.databaseCode?' · '+diagnostic.databaseCode:''}). Son başarı kaydı değişmedi.`};
  }
}
export async function decideCfoWork(id:string,rev:string,action:'approve'|'reject'|'complete',actor:string,result:string){
  if(process.env.VERCEL_ENV&&process.env.VERCEL_ENV!=='production')throw new Error('production_only');
  // Re-read current sources before approving an old proposal. Save resets materially changed decisions.
  if(action==='approve'){const check=await runCfoCycle('approval_review');if(!check.completed)throw new Error('review_unavailable');}
  return prisma.$transaction(tx=>transitionWork(writer(tx),id,rev,action,actor,result,new Date()));
}
