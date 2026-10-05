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
    // Legacy planner tables are outside the generated Prisma model. Only
    // isolated synthetic fixtures are installed in this localhost test DB.
    await prisma.$executeRawUnsafe(`create table cfo_urun_karar(sku text primary key,karar text,sebep text,gecerli_bitis date,karar_veren text,updated_at timestamptz)`);
    await prisma.$executeRawUnsafe(`create table cfo_order_batch(id text primary key,transport_mode text,status text,cash_gate text,decision text)`);
    await prisma.$executeRawUnsafe(`create table cfo_order_line(id int primary key,batch_id text,sku text,status text,qty int,note text)`);
    await prisma.$executeRawUnsafe(`create table cfo_ithalat_oneri_ozet(mod text,durum text,tavsiye_siparis_tarihi date,nakit_kapisi_tarihi date,maliyet_eksik_satir int)`);
    await prisma.$executeRawUnsafe(`alter table cfo_question add column scope text,add column entity_key text,add column code text`);
    await prisma.cfoSettings.create({data:{id:'synthetic-settings',usdTryRate:10,monthlyRevenueTargetUsd:123456}});
    await prisma.cfoQuestion.create({data:{id:'synthetic-answer',question:'Synthetic fixture cost?',answer:'Unverified synthetic answer',area:'marj',status:'CEVAPLANDI',answeredAt:new Date()}});
    await prisma.$executeRawUnsafe(`update cfo_question set scope='ITHALAT_SATIRI',entity_key='DENIZ|SYNTHETIC' where id='synthetic-answer'`);
    process.env.VERCEL_ENV='preview';
    assert.deepEqual(await runCfoCycle('test-preview'),{completed:false,reason:'production_only'});
    assert.equal(await prisma.cfoNote.count(),0);
    process.env.VERCEL_ENV='production';
    const first=await runCfoCycle('test-postgres');
    assert.equal(first.completed,true);
    assert('answersRead' in first&&first.answersRead===1);
    const heartbeat=await prisma.cfoNote.findUniqueOrThrow({where:{id:HEARTBEAT_ID}});
    assert.equal(JSON.parse(heartbeat.body).agenda.topic,'cash');
    const plannerWork=await prisma.cfoNote.findFirst({where:{source:WORK_SOURCE,title:'İthalat planlayıcısını ve kararları incele'}});
    assert(plannerWork,'real cycle reads legacy planner source and persists review context');
    assert.equal(await prisma.cfoNote.count({where:{source:'cfo-workflow-journal'}}),1);
    const question=await prisma.cfoQuestion.findUniqueOrThrow({where:{id:'synthetic-answer'}});
    assert.equal(question.processedAt,null,'reading an answer does not financially apply it');
    assert(question.processNote?.startsWith('workflow_read:'));
    const second=await runCfoCycle('test-repeat');
    assert(second.completed&&second.newQuestions===0&&second.answersRead===0);
    assert.equal(JSON.parse((await prisma.cfoNote.findUniqueOrThrow({where:{id:HEARTBEAT_ID}})).body).agenda.topic,'sales','next cycle follows saved topic');
    assert.equal(await prisma.cfoNote.count({where:{source:'cfo-workflow-journal'}}),2);
    await prisma.$transaction(async tx=>{
      await tx.$queryRawUnsafe('select pg_try_advisory_xact_lock(712004,24) as locked');
      assert.deepEqual(await runCfoCycle('test-locked'),{completed:false,reason:'already_running'});
    });
    // Use the actual Prisma parameter encoding for INSERT ... RETURNING too.
    await prisma.$transaction(tx=>saveWorkPlan({query:(sql,...params)=>tx.$queryRawUnsafe(sql,...params),execute:(sql,...params)=>tx.$executeRawUnsafe(sql,...params)},
      {asOf:new Date().toISOString(),items:[],goals:JSON.parse(heartbeat.body).goals,questions:[{key:'synthetic:question',sku:'SYNTH',question:'Synthetic order fixture?',why:'Test parameter encoding',priority:1,area:'siparis'}]},'test-returning'));
    assert.equal(await prisma.cfoQuestion.count({where:{question:'Synthetic order fixture?'}}),1);
    const {ensureRowQuestion}=await import('../lib/cfo/question-record');
    const {loadRowQa}=await import('../lib/cfo/row-qa');
    const rowInput={scope:'ITHALAT_SATIRI',entityKey:'DENIZ|SYNTH-LINK',code:'MALIYET_YOK',question:'Synthetic planner cost?',why:'Synthetic row identity',area:'marj'};
    const register=(entityKey:string)=>prisma.$transaction(tx=>ensureRowQuestion({query:(sql,...p)=>tx.$queryRawUnsafe(sql,...p),execute:(sql,...p)=>tx.$executeRawUnsafe(sql,...p)},{...rowInput,entityKey}));
    const linked=await Promise.all([register(rowInput.entityKey),register('HAVA|synth-link')]);
    assert.equal(linked[0].id,linked[1].id,'concurrent planner registrations cannot fork the question');
    await prisma.cfoQuestion.update({where:{id:linked[0].id},data:{answer:'Synthetic central-page answer',answeredAt:new Date(),status:'CEVAPLANDI',processedAt:null,processNote:null}});
    const rowQa=await loadRowQa('ITHALAT_SATIRI',['DENIZ|SYNTH-LINK','HAVA|synth-link']);
    assert.equal(rowQa.kayitli.get('HAVA|synth-link')?.[0]?.answer,'Synthetic central-page answer','planner reads the canonical answer immediately');
    assert.equal(rowQa.kayitli.get('DENIZ|SYNTH-LINK')?.[0]?.id,linked[0].id);
    const centralCycle=await runCfoCycle('test-central-answer');
    assert(centralCycle.completed&&centralCycle.answersRead===1,'cycle reads the answer from the shared question record');
    assert((await prisma.cfoQuestion.findUniqueOrThrow({where:{id:linked[0].id}})).processNote?.startsWith('workflow_read:'));
    await prisma.cfoQuestion.update({where:{id:linked[0].id},data:{status:'IPTAL'}});
    assert.equal((await register(rowInput.entityKey)).status,'IPTAL');
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
