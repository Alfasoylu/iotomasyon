import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readImportPlanner,importPolicy,IMPORT_PLANNER_PATH } from '../lib/cfo-agent/import-planner';
import { planCfoWork,type WorkingContext,workflowId } from '../lib/cfo-agent/workflow-plan';
import { saveWorkPlan,transitionWork,readWork,WORK_SOURCE,type WriteSource } from '../lib/cfo-agent/workflow-store';
import type { Row } from '../lib/cfo-agent/sources';

const asOf='2026-01-10T12:00:00.000Z';
const metric=(value:number|null)=>({value,estimated:false,basis:'gross_incl_vat'});
const context={asOf,financialGoals:{totalDebtTry:6000000,balancesFresh:true},notebook:{available:true,truncated:false,notes:[]},catalogCosts:{available:true,truncated:false},
  operating:{questions:[],recordedCostReconciliation:[],summary:{skusWithKnownCost:1,skuChannelsWithContributionProfit:0},products:[{
    sku:'SYNTH-A',resolvedSku:'SYNTH-A',channel:'TRENDYOL',excluded:false,virtual:false,noReorder:false,trusted:true,financialSourceFresh:false,inventorySourceFresh:true,
    costTry:10,stockQty:3,stockDays:3,velocity:1,inboundQty:0,openPurchaseOrders:0,contributionProfitTry:null,unitProfitTry:null,salesUnits30:5,
  }]},cash:{cash:metric(100),totalCardDebt:metric(1),minimumProjectedPosition:metric(0),banksFresh:true,summaries:[]},
  importPipeline:{coveragePct:metric(100)},sales:{last30Days:{grossRevenue:metric(null),complete:false}},dataQuality:{sourceWatermarks:[]}} as unknown as WorkingContext;

async function main(){
  const pg=new PGlite();
  try{
    await pg.exec(`create table cfo_urun_karar(sku text primary key,karar text,sebep text,gecerli_bitis date,updated_at timestamptz);
      create table cfo_order_batch(id text primary key,transport_mode text,status text,cash_gate text,decision text,note text);
      create table cfo_order_line(id int primary key,batch_id text references cfo_order_batch(id),sku text,status text,qty int,reason text,note text);
      create table cfo_ithalat_oneri_ozet(mod text,durum text,tavsiye_siparis_tarihi date,nakit_kapisi_tarihi date,maliyet_eksik_satir int);
      create table cfo_note(id text primary key,title text,body text,category text,"dataTag" text,source text,pinned boolean,"createdAt" timestamptz,"updatedAt" timestamptz,"archivedAt" timestamptz);
      create table cfo_question(id text primary key,question text,why text,area text,priority int,status text,answer text,"askedAt" timestamptz default now(),scope text,entity_key text,code text);
      create table cfo_change_log(id text primary key,area text,item text,"oldValue" text,"newValue" text,source text,kind text,note text);
      insert into cfo_order_batch values('SYNTH-BATCH','DENIZ','PLANLANIYOR','KAPALI','BEKLE','Synthetic batch note');
      insert into cfo_order_line values(1,'SYNTH-BATCH','SYNTH-B','BEKLIYOR',40,'Synthetic reason','Synthetic row note'),(2,'SYNTH-BATCH','SYNTH-REJECTED','REDDEDILDI',20,'Owner rejected','Owner note');
      insert into cfo_ithalat_oneri_ozet values('DENIZ','KAPI_KAPALI',null,null,1);`);
    const db:WriteSource={async query<T extends Row>(sql:string,...params:unknown[]):Promise<T[]>{return(await pg.query<T>(sql,params)).rows;},execute:(sql,...params)=>pg.query(sql,params)};
    let planner=await readImportPlanner(db);
    assert(planner.available&&!planner.truncated);
    assert(planner.lines[0].notes.includes('Synthetic row note')&&planner.lines[0].notes.includes('Synthetic batch note'));
    assert.equal(planner.summaries[0].durum,'KAPI_KAPALI');
    assert(!importPolicy(planner,'synth-b',asOf).mayAdd,'pending native line prevents a second candidate across aliases');
    assert(!importPolicy(planner,'SYNTH-REJECTED',asOf).mayAdd,'rejected rows absent from proposal views remain authoritative');
    let plan=planCfoWork({...context,importPlanner:planner},{});
    const candidate=plan.items.find(i=>i.key==='stock:SYNTH-A')!;
    assert(candidate.futureOrder&&candidate.plannerPath===IMPORT_PLANNER_PATH);
    assert(!plan.orderGate.open&&!candidate.requiresApproval);
    await saveWorkPlan(db,plan,'synthetic-import');
    const [saved]=await db.query('select body from cfo_note where id=$1 and source=$2',workflowId(candidate.key),WORK_SOURCE);
    const persisted=readWork(String(saved.body))!;
    assert(persisted.item.futureOrder,'candidate remains durable for the existing planner page');
    assert.equal((await db.query('select count(*)::int as n from cfo_order_line'))[0].n,2,'uncertain candidate does not change a native batch quantity');
    await db.execute("insert into cfo_urun_karar values('synth-a','ALMA','Synthetic owner rejection',null,$1)",asOf);
    planner=await readImportPlanner(db);
    plan=planCfoWork({...context,importPlanner:planner},{});
    assert.equal(plan.items.find(i=>i.key===candidate.key)?.futureOrder,false);
    assert(plan.items.find(i=>i.key===candidate.key)?.evidence.some(e=>e.includes('Synthetic owner rejection')));
    assert(!plan.questions.some(q=>q.area==='siparis'),'rejected product produces no supplier question');
    await saveWorkPlan(db,plan,'synthetic-owner-reject');
    assert.equal((await db.query("select sebep from cfo_urun_karar where sku='synth-a'"))[0].sebep,'Synthetic owner rejection','cycle cannot overwrite owner decisions');
    await db.execute("update cfo_urun_karar set karar='BEKLE',gecerli_bitis='2026-01-11' where sku='synth-a'");
    planner=await readImportPlanner(db);
    assert(importPolicy(planner,'SYNTH-A',asOf).waiting&&!importPolicy(planner,'SYNTH-A',asOf).mayAdd);
    assert(importPolicy(planner,'SYNTH-A','2026-01-12T00:00:00Z').mayAdd,'dated owner decision expires without being erased');
    await db.execute("update cfo_urun_karar set karar='AL',gecerli_bitis=null where sku='synth-a'");
    planner=await readImportPlanner(db);
    plan=planCfoWork({...context,importPlanner:planner},{});
    assert(plan.items.find(i=>i.key===candidate.key)?.futureOrder&&!plan.orderGate.open,'AL does not bypass total-debt gate');
    const note={id:'synthetic-row-answer',scope:'ITHALAT_SATIRI',entity_key:'DENIZ|synth-a',question:'Plan notu',answer:'Synthetic supplier explanation; no numeric application',status:'CEVAPLANDI',answerChanged:true};
    const withAnswer=planCfoWork({...context,importPlanner:planner},{},[note]);
    assert(withAnswer.items.find(i=>i.key===candidate.key)?.evidence.some(e=>e.includes(note.answer)));
    assert(withAnswer.items.some(i=>i.key==='answer:'+note.id));
    const costAnswer={...note,code:'MALIYET_YOK',question:'Birim alış fiyatı nedir?'};
    const costContext={...context,importPlanner:planner,operating:{...context.operating,questions:[{sku:'SYNTH-A',channels:['TRENDYOL'],salesUnits30:5,reason:'cost'}]}};
    assert(!planCfoWork(costContext,{},[costAnswer]).questions.some(q=>q.key==='cost:SYNTH-A'),'row code and identity prevent a duplicate cost question when wording omits SKU/cost');
    assert.notEqual(withAnswer.agenda.fingerprint,plan.agenda.fingerprint,'notes alter continuation context');
    const closed=planCfoWork({...context,importPlanner:planner},{},[],{closedKeys:[candidate.key]});
    assert.equal(closed.items.find(i=>i.key===candidate.key)?.futureOrder,false,'reported completion cannot create another future candidate');
    await saveWorkPlan(db,plan,'synthetic-restore');
    const [restored]=await db.query('select body from cfo_note where id=$1',workflowId(candidate.key));
    const work=readWork(String(restored.body))!;
    await transitionWork(db,workflowId(candidate.key),work.revision,'reject','Synthetic owner','Synthetic rejection',new Date(asOf));
    const escalated={...plan,items:plan.items.map(i=>i.key===candidate.key?{...i,priority:1}:i)};
    await saveWorkPlan(db,escalated,'synthetic-escalation');
    assert.equal(readWork(String((await db.query('select body from cfo_note where id=$1',workflowId(candidate.key)))[0].body))?.status,'rejected','stock urgency cannot reopen owner rejection');
    const unavailable=await readImportPlanner({async query(){throw new Error('Synthetic missing source');}});
    assert(!unavailable.available);
    assert(!planCfoWork({...context,importPlanner:unavailable},{}).items.find(i=>i.key===candidate.key)?.futureOrder);
    const truncated={...planner,truncated:true};
    assert(!importPolicy(truncated,'SYNTH-A',asOf).mayAdd);
    assert(!importPolicy({...planner,decisions:[...planner.decisions,{sku:'SYNTH-A',decision:'ALMA',reason:'Conflicting alias',expiresAt:null,updatedAt:asOf}]},'SYNTH-A',asOf).mayAdd,'conflicting aliases honor the stricter owner decision');
  }finally{await pg.close();}
  console.log('CFO import planner: native notes/statuses, alias-safe owner decisions, durable deduplicated candidates, expiry, debt lock, answers and rejection preservation passed');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
