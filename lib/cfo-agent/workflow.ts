import 'server-only';
import { prisma } from '@/lib/prisma';
import { loadOperatingContext } from './load-operating-context';
import { planCfoWork } from './workflow-plan';
import { saveWorkPlan, transitionWork, WORK_SOURCE } from './workflow-store';
import type { WriteSource } from './workflow-store';
import type { Prisma } from '@prisma/client';
function writer(tx:Prisma.TransactionClient):WriteSource{return {query: (sql,...params)=>tx.$queryRawUnsafe(sql,...params),execute:(sql,...params)=>tx.$executeRawUnsafe(sql,...params)};}
export async function runCfoCycle(trigger:string){
  if(process.env.VERCEL_ENV&&process.env.VERCEL_ENV!=='production')return {completed:false as const,reason:'production_only'};
  // Lock across reading and persistence, released on disconnect even if the process dies.
  // The transaction advisory lock prevents overlapping cycles without migrations.
  return prisma.$transaction(async lockTx=>{
    const [lock]=await lockTx.$queryRawUnsafe<{locked:boolean}[]>('select pg_try_advisory_xact_lock(712004,24) as locked');
    if(!lock?.locked)return {completed:false as const,reason:'already_running'};
    const context=await loadOperatingContext();
    const [settings,knowledge,answers]=await Promise.all([
      prisma.cfoSettings.findFirst({orderBy:{updatedAt:'desc'}}),
      prisma.cfoQuestion.findMany({select:{id:true,question:true,answer:true,status:true},where:{status:{not:'IPTAL'}}}),
      prisma.cfoQuestion.findMany({where:{status:'CEVAPLANDI',processedAt:null},include:{attachments:{select:{id:true}}}}),
    ]);
    const plan=planCfoWork(context,settings?{...settings}: {},knowledge);
    const result=await prisma.$transaction(async tx=>{
      const db=writer(tx);
      let answersRead=0;
      for(const answer of answers){
        const readMarker=`workflow_read:${answer.answeredAt?.toISOString()}`;
        if(answer.processNote?.startsWith(readMarker))continue;
        const noteId='cfo-answer-'+answer.id;
        // A user statement is retained as a statement. Attachments need separate inspection.
        await tx.cfoNote.upsert({where:{id:noteId},create:{id:noteId,title:answer.question.slice(0,250),body:answer.answer||'Dosya cevabı; içeriği henüz doğrulanmadı.',category:answer.area,dataTag:'TEYIT_EDILMELI',source:'cfo-workflow-answer',sourceQuestionId:answer.id},update:{body:answer.answer||'Dosya cevabı; içeriği henüz doğrulanmadı.',dataTag:'TEYIT_EDILMELI'}});
        // Never mark a response as financially applied just because it has been read.
        await tx.cfoQuestion.updateMany({where:{id:answer.id,answeredAt:answer.answeredAt},data:{processNote:readMarker+' · Cevap bağlama alındı; finansal doğrulama/uygulama bekleniyor.'}});
        answersRead++;
        await tx.cfoChangeLog.create({data:{area:"soru",item:answer.question.slice(0,120),source:WORK_SOURCE,kind:"arastirma",note:"Cevap bağlama alındı; maliyet ve finansal tablolar değiştirilmedi.",newValue:noteId}});
      }
      const output=await saveWorkPlan(db,plan,trigger);
      return {...output,answersRead};
    },{timeout:20000});
    return result;
  },{maxWait:5000,timeout:150000});
}
export async function safeCfoCycle(trigger:string){
  try{return await runCfoCycle(trigger);}catch{
    // Fixed diagnostic only: never log SQL, credentials, bank amounts or notebook contents.
    try{await prisma.cfoChangeLog.create({data:{area:'erisim',item:'CFO çalışma döngüsü',source:WORK_SOURCE,kind:'arastirma',note:'cycle_unavailable',newValue:trigger}});}catch{}
    return {completed:false as const,reason:'cycle_unavailable'};
  }
}
export async function decideCfoWork(id:string,rev:string,action:'approve'|'reject'|'complete',actor:string,result:string){
  if(process.env.VERCEL_ENV&&process.env.VERCEL_ENV!=='production')throw new Error('production_only');
  // Re-read current sources before approving an old proposal. Save resets materially changed decisions.
  if(action==='approve'){const check=await runCfoCycle('approval_review');if(!check.completed)throw new Error('review_unavailable');}
  return prisma.$transaction(tx=>transitionWork(writer(tx),id,rev,action,actor,result,new Date()));
}
