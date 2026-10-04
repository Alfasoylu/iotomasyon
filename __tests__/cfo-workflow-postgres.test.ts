import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma';
import { runCfoCycle,safeCfoCycle } from '../lib/cfo-agent/workflow';
import { HEARTBEAT_ID,WORK_SOURCE,saveWorkPlan } from '../lib/cfo-agent/workflow-store';
import { CycleFailure,cycleDiagnostic,readCycleDiagnostic } from '../lib/cfo-agent/workflow-diagnostics';

async function main(){
  // This test deliberately exercises the real Prisma adapter, not a SQL mock.
  // Only the isolated localhost synthetic test database is permitted.
  const url=new URL(process.env.CFO_WORKFLOW_TEST_DATABASE_URL??'');
  assert(['127.0.0.1','localhost'].includes(url.hostname)&&/^\/cfo_workflow_test_[a-z]+$/.test(url.pathname));
  process.env.DATABASE_URL=url.toString();
  try{
    await prisma.cfoSettings.create({data:{id:'synthetic-settings',usdTryRate:10,monthlyRevenueTargetUsd:123456}});
    await prisma.cfoQuestion.create({data:{id:'synthetic-answer',question:'Synthetic fixture cost?',answer:'Unverified synthetic answer',area:'marj',status:'CEVAPLANDI',answeredAt:new Date()}});
    process.env.VERCEL_ENV='preview';
    assert.deepEqual(await runCfoCycle('test-preview'),{completed:false,reason:'production_only'});
    assert.equal(await prisma.cfoNote.count(),0);
    process.env.VERCEL_ENV='production';
    const first=await runCfoCycle('test-postgres');
    assert.equal(first.completed,true);
    assert('answersRead' in first&&first.answersRead===1);
    const heartbeat=await prisma.cfoNote.findUniqueOrThrow({where:{id:HEARTBEAT_ID}});
    const question=await prisma.cfoQuestion.findUniqueOrThrow({where:{id:'synthetic-answer'}});
    assert.equal(question.processedAt,null,'reading an answer does not financially apply it');
    assert(question.processNote?.startsWith('workflow_read:'));
    const second=await runCfoCycle('test-repeat');
    assert(second.completed&&second.newQuestions===0&&second.changedItems===0&&second.answersRead===0);
    await prisma.$transaction(async tx=>{
      await tx.$queryRawUnsafe('select pg_try_advisory_xact_lock(712004,24) as locked');
      assert.deepEqual(await runCfoCycle('test-locked'),{completed:false,reason:'already_running'});
    });
    // Use the actual Prisma parameter encoding for INSERT ... RETURNING too.
    await prisma.$transaction(tx=>saveWorkPlan({query:(sql,...params)=>tx.$queryRawUnsafe(sql,...params),execute:(sql,...params)=>tx.$executeRawUnsafe(sql,...params)},
      {asOf:new Date().toISOString(),items:[],goals:JSON.parse(heartbeat.body).goals,questions:[{key:'synthetic:question',sku:'SYNTH',question:'Synthetic order fixture?',why:'Test parameter encoding',priority:1,area:'siparis'}]},'test-returning'));
    assert.equal(await prisma.cfoQuestion.count({where:{question:'Synthetic order fixture?'}}),1);
    // Model remote round-trip latency. The old row-by-row writer exceeded the
    // transaction budget; the batch writer uses a bounded number of requests.
    let requests=0;
    const delay=async()=>{requests++;await new Promise(resolve=>setTimeout(resolve,100));};
    const many=Array.from({length:80},(_,i)=>({key:`synthetic-batch:${i}`,kind:'research' as const,title:`Synthetic work ${i}`,priority:2,proposal:'Synthetic research',evidence:[],blockers:['Synthetic fixture'],cashRequiredTry:null,expectedGainTry:null,suggestedUnits:null,requiresApproval:false}));
    const batch=await prisma.$transaction(tx=>saveWorkPlan({async query(sql,...params){await delay();return tx.$queryRawUnsafe(sql,...params);},async execute(sql,...params){await delay();return tx.$executeRawUnsafe(sql,...params);}},
      {asOf:new Date().toISOString(),items:[...many,many[0]],goals:JSON.parse(heartbeat.body).goals,questions:[]},'test-latency'),{timeout:2000});
    assert.equal(batch.items,80,'duplicate stable keys are consolidated');
    assert(requests<=6,'remote requests cannot grow with work-item count');
    const before=await prisma.cfoNote.findUniqueOrThrow({where:{id:HEARTBEAT_ID}});
    await prisma.$executeRawUnsafe(`alter table cfo_note add constraint synthetic_fail_heartbeat check (id <> '${HEARTBEAT_ID}') not valid`);
    await prisma.cfoQuestion.update({where:{id:question.id},data:{answeredAt:new Date(Date.now()+1000),answer:'Synthetic changed response'}});
    const failed=await safeCfoCycle('test-rollback');
    assert(!failed.completed&&failed.reason==='cycle_unavailable');
    assert('diagnostic' in failed&&failed.diagnostic.stage==='persist');
    assert.equal((await prisma.cfoNote.findUniqueOrThrow({where:{id:HEARTBEAT_ID}})).body,before.body,'failed writes must not advance success');
    assert.equal((await prisma.cfoQuestion.findUniqueOrThrow({where:{id:question.id}})).processNote,question.processNote,'answer marker rolls back with the plan');
    const failure=await prisma.cfoChangeLog.findFirstOrThrow({where:{source:WORK_SOURCE,note:'cycle_unavailable'},orderBy:{changedAt:'desc'}});
    assert.equal(readCycleDiagnostic(failure.newValue)?.stage,'persist');
    await prisma.$executeRawUnsafe('alter table cfo_note drop constraint synthetic_fail_heartbeat');
    assert.equal((await runCfoCycle('test-recovery')).completed,true);
    const safe=cycleDiagnostic(new CycleFailure('context',{code:'P2010',message:'PRIVATE CONNECTION AND SQL',meta:{code:'57014',message:'PRIVATE FINANCIAL VALUE'}}));
    assert.deepEqual(safe,{version:1,stage:'context',code:'P2010',databaseCode:'57014'});
    assert(!JSON.stringify(safe).includes('PRIVATE'));
    assert.equal(readCycleDiagnostic('legacy-trigger'),null);
    console.log('CFO real PostgreSQL/Prisma: complete cycle, lock exclusion, parameters, repeat runs, answer rollback, safe diagnostics and recovery passed');
  }finally{await prisma.$disconnect();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
