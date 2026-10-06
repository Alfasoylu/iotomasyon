import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { skuIndex,skuKey,foldedSkuSql } from '../lib/cfo-agent/sku';
import { productPolicy } from '../lib/cfo-agent/product-policy';
import { operatingCapabilities } from '../lib/cfo-agent/operating-context';
import { planCfoWork,workflowId,type WorkingContext } from '../lib/cfo-agent/workflow-plan';
import { readWork,saveWorkPlan,transitionWork,WORK_SOURCE,HEARTBEAT_ID,type WriteSource } from '../lib/cfo-agent/workflow-store';
import type { CfoAgentSnapshot,ProductSignal } from '../lib/cfo-agent/types';
import type { Row } from '../lib/cfo-agent/sources';
const m=(value:number|null)=>({value,estimated:true,basis:'gross_incl_vat' as const});
const signal=(sku:string):ProductSignal=>({sku,channel:'TRENDYOL',trusted:true,sourceFresh:true,financialSourceFresh:false,inventorySourceFresh:true,cost:m(null),priceFloor:m(null),contribution:m(null),salesUnits30:m(8),xmlUnits30:m(12),stockDays:m(4),stockQty:2,inboundQty:0,velocity:m(1),openPurchaseOrders:0} as ProductSignal);
async function main(){
  const lookup=skuIndex([{sku:'SYNTH-ITEM',cost:50},{sku:'SYNTHITEM',cost:null},{sku:'CASE',cost:5},{sku:'case',cost:6}],r=>r.sku);
  assert.equal(lookup.get('synth-item')?.cost,50);assert.equal(lookup.get('synthitem')?.cost,null);assert.equal(lookup.get('Case'),undefined);assert.equal(lookup.get('CASE')?.cost,5);
  assert.equal(skuKey('ıtem-İ'),'ITEM-I');assert.equal(lookup.get('SYNTH-ITEM0'),undefined,'no digit trimming');
  assert.equal(productPolicy({privateNote:'Yeniden sipariş verilmez',active:true}).procurementAllowed,false);
  assert.equal(productPolicy({stock:999}).virtual,true);assert.equal(productPolicy({privateNote:'Maliyet eksik'}).noReorder,false);
  const snap={products:[signal('synth-item'),signal('STOP'),signal('VIRTUAL'),signal('MISSING')]} as CfoAgentSnapshot;
  const costs=new Map<string,Row>([['SYNTH-ITEM',{sku:'SYNTH-ITEM',costTry:50,stock:2}],['STOP',{sku:'STOP',privateNote:'Yeniden sipariş verilmez',stock:2}],['VIRTUAL',{sku:'VIRTUAL',kind:'LISTING_PACKAGE',stock:999}]]);
  const operating=operatingCapabilities(snap,new Set(),costs);
  assert.equal(operating.products[0].costKnown,true);assert.equal(operating.products[0].priceFloorTry,null,'matching cost cannot invent other profitability inputs');
  assert.deepEqual(operating.questions.map(q=>q.sku),['MISSING']);
  const context={asOf:'2026-10-04T10:00:00.000Z',operating,cash:{cash:m(5000),banksFresh:false,totalCardDebt:m(1000),minimumProjectedPosition:m(-500),summaries:[]},sales:{last30Days:{complete:false,grossRevenue:m(200)}},notebook:{notes:[]}} as unknown as WorkingContext;
  const plan=planCfoWork(context,{usdTryRate:10,monthlyRevenueTargetUsd:100000,netPositionFloorTry:-400});
  // Goals come only from the Goal Engine; without an engine result nothing is inferred from settings or partial sales.
  assert.deepEqual(plan.goals,{engine:'fm_goal_engine',available:false,asOf:null,memoryRefresh:null,unavailable:'not_run',items:[]});
  assert.deepEqual(planCfoWork({...context,goalEngine:{ok:false,stage:'evaluate',code:'P2010'}},{}).goals.unavailable,'evaluate:P2010');
  const engineRow={goal_key:'revenue_month_usd',goal_version:1,kind:'revenue_month',title:'Aylık ciro hedefi',target_value:'100000.00',target_currency:'USD',deadline:null,
    as_of:new Date('2026-10-11'),period_start:new Date('2026-10-01'),period_end:'2026-10-31',state:'ON_TRACK',observed_value_try:'1500000.00',observed_on:'2026-10-10',
    target_value_try:'4200000.00',fx_usd_try:'42.0000',fx_month:'2026-09-01',progress_pct:'35.71',gap_try:'2700000.00',current_rate_try_per_day:'150000.00',
    required_rate_try_per_day:'128571.43',projected_value_try:'4650000.00',projected_on:'2026-10-31',grade:'B',flags:['goal_fx_prior_month']};
  const engineGoals=planCfoWork({...context,goalEngine:{ok:true,asOf:'2026-10-11',refresh:'recent',rows:[engineRow,{...engineRow,goal_key:'debt_below_5m_try',state:'BOGUS',grade:'X',flags:null}]}},{}).goals;
  assert.equal(engineGoals.available,true);assert.deepEqual(engineGoals.items.map(g=>g.key),['debt_below_5m_try','revenue_month_usd']);
  assert.equal(engineGoals.items[1].targetTry,4200000);assert.equal(engineGoals.items[1].periodStart,'2026-10-01');assert.equal(engineGoals.items[1].state,'ON_TRACK');
  assert.equal(engineGoals.items[0].state,'UNKNOWN','unknown engine state is never promoted');assert.equal(engineGoals.items[0].grade,'U');
  assert(!JSON.stringify(engineGoals).includes('evaluated_at'),'goal observation must stay deterministic across unchanged cycles');
  assert(plan.questions.some(q=>q.sku==='MISSING'));
  assert(!plan.items.some(i=>i.sku==='VIRTUAL'));
  assert(plan.items.find(i=>i.sku==='STOP')?.proposal.includes('Yeni sipariş oluşturma'));
  assert(plan.items.find(i=>i.sku==='SYNTH-ITEM')?.blockers.includes('Güncel ve tam birim kâr hesabı gerekli'));
  assert.equal(plan.items.find(i=>i.sku==='SYNTH-ITEM')?.suggestedUnits,null,'incomplete inbound mapping cannot justify an order quantity');
  assert(!plan.items.some(i=>i.kind==='procurement'),'unknown terms cannot become a firm order');
  const known=planCfoWork(context,{},[{id:'existing',question:'MISSING birim maliyeti nedir?',answer:'Beyan',status:'CEVAPLANDI'}]);
  assert(!known.questions.some(q=>q.key==='cost:MISSING'),'answered question is investigated instead of asked again');
  const withNote=planCfoWork({...context,notebook:{notes:[{id:'n',title:'MISSING maliyet',body:'Synthetic statement',source:'human',bodyTruncated:false}]} as WorkingContext['notebook']},{},[]);
  assert(!withNote.questions.some(q=>q.key==='cost:MISSING'));
  const db=new PGlite();
  try{
    await db.exec(`create table cfo_note(id text primary key,title text,body text,category text,"dataTag" text,source text,pinned boolean,"createdAt" timestamptz,"updatedAt" timestamptz,"archivedAt" timestamptz);
      create table cfo_question(id text primary key,question text,why text,area text,priority int,status text,answer text,"askedAt" timestamptz default now(),scope text,entity_key text,code text);
      create table cfo_change_log(id text primary key,area text,item text,"oldValue" text,"newValue" text,source text,kind text,note text);`);
    const source:WriteSource={async query<T extends Row>(sql:string,...params:unknown[]):Promise<T[]>{return(await db.query<T>(sql,params)).rows;},async execute(sql,...params){return db.query(sql,params);}};
    const first=await saveWorkPlan(source,plan,'test');assert(first.newQuestions>0);
    const second=await saveWorkPlan(source,plan,'repeat');assert.equal(second.newQuestions,0);assert.equal(second.changedItems,0);
    const researchId=workflowId(plan.items[0].key),research=readWork(String((await source.query('select body from cfo_note where id=$1',researchId))[0].body))!;
    await assert.rejects(()=>transitionWork(source,researchId,research.revision,'approve','owner','',new Date(plan.asOf)),/approval_unavailable/);
    await transitionWork(source,researchId,research.revision,'complete','owner','Research result recorded, not financially applied',new Date(plan.asOf));
    const proposal={...plan.items[0],key:'approval:example',requiresApproval:true};const approvedPlan={...plan,items:[...plan.items,proposal]};
    await saveWorkPlan(source,approvedPlan,'proposal');const id=workflowId(proposal.key);
    const read=async()=>readWork(String((await source.query('select body from cfo_note where id=$1',id))[0].body))!;
    const initial=await read();
    await assert.rejects(()=>transitionWork(source,id,initial.revision,'approve','owner','',new Date('2026-10-06')),/decision_expired/);
    await assert.rejects(()=>transitionWork(source,id,initial.revision,'complete','owner','result',new Date(plan.asOf)),/approval_required/);
    await transitionWork(source,id,initial.revision,'approve','owner','',new Date(plan.asOf));assert.equal((await read()).status,'approved');
    await saveWorkPlan(source,{...approvedPlan,items:[...plan.items,{...proposal,proposal:'Changed evidence and proposal'}]},'changed');
    assert.equal((await read()).status,'needs_review');
    await assert.rejects(()=>transitionWork(source,id,initial.revision,'approve','owner','',new Date(plan.asOf)),/decision_changed/);
    const changed=await read();await transitionWork(source,id,changed.revision,'approve','owner','',new Date(plan.asOf));
    await assert.rejects(()=>transitionWork(source,id,changed.revision,'complete','owner','',new Date(plan.asOf)),/result_required/);
    await transitionWork(source,id,changed.revision,'complete','owner','Measured result pending external verification',new Date(plan.asOf));
    assert.equal((await read()).status,'completed');
    const disappearing={...proposal,key:'approval:withdraw'};await saveWorkPlan(source,{...plan,items:[disappearing]},'withdraw-test');
    const wid=workflowId(disappearing.key),ww=readWork(String((await source.query('select body from cfo_note where id=$1',wid))[0].body))!;
    await transitionWork(source,wid,ww.revision,'approve','owner','',new Date(plan.asOf));
    await saveWorkPlan(source,{...plan,items:[]},'gone');
    const gone=readWork(String((await source.query('select body from cfo_note where id=$1',wid))[0].body))!;
    assert.equal(gone.status,'withdrawn');
    await assert.rejects(()=>transitionWork(source,wid,gone.revision,'complete','owner','No proof',new Date(plan.asOf)),/approval_required/);
    assert.equal((await source.query('select count(*)::int as n from cfo_note where id=$1 and source=$2',HEARTBEAT_ID,WORK_SOURCE))[0].n,1);
    const folded=await source.query(`select ${foldedSkuSql("'ıtem-İ'")} as key`);assert.equal(folded[0].key,skuKey('ıtem-İ'));
    assert((await source.query('select count(*)::int as n from cfo_change_log'))[0].n as number>0);
  }finally{await db.close();}
  console.log('CFO workflow: unique matching, narrow procurement policies, missing-cost scope, answer/notebook search, null financials, actual persistence/idempotence, approval revisions/expiry and result guards passed');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
