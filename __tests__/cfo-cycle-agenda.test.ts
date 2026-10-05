import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { forecastDebt,type ForecastInputs } from '../lib/cfo-agent/debt-forecast';
import { debtGate,readOrderDebtGate } from '../lib/cfo-agent/debt-policy';
import { planCfoWork,workflowId,type WorkingContext } from '../lib/cfo-agent/workflow-plan';
import { readMemory } from '../lib/cfo-agent/workflow-memory';
import { saveWorkPlan,WORK_SOURCE,type WriteSource,HEARTBEAT_ID } from '../lib/cfo-agent/workflow-store';
import type { Row } from '../lib/cfo-agent/sources';

const metric=(value:number|null)=>({value,estimated:false,basis:'gross_incl_vat' as const});
const asOf='2026-01-01T00:00:00.000Z';
const inputs:ForecastInputs={historicalRevenueTry:300000,historicalDays:30,historicalEnd:asOf,fixedMonthlyTry:0,interestMonthlyTry:0,otherMonthlyTry:0,cashReserveTry:0,settlementDays:2,importsPaid:true,extraOutflows:[],horizonDays:90,missing:[]};
const product={sku:'SYNTHETIC',resolvedSku:'SYNTHETIC',channel:'TRENDYOL',excluded:false,virtual:false,noReorder:false,trusted:true,financialSourceFresh:true,inventorySourceFresh:true,
  unitProfitTry:50,costTry:50,stockQty:100,stockDays:100,velocity:1,inboundQty:0,inboundEta:null,salesUnits30:30};
const context={asOf,forecastInputs:inputs,financialGoals:{totalDebtTry:5000900,balancesFresh:true},importPipeline:{coveragePct:metric(100)},
  operating:{products:[product],questions:[],recordedCostReconciliation:[],summary:{skusWithKnownCost:1,skuChannelsWithContributionProfit:1}},
  cash:{cash:metric(0),banksFresh:true,totalCardDebt:metric(100),minimumProjectedPosition:metric(0),summaries:[]},sales:{last30Days:{grossRevenue:metric(300000),complete:true}},
  dataQuality:{sourceWatermarks:[]},notebook:{available:true,truncated:false,notes:[]}} as unknown as WorkingContext;

async function main(){
  assert(!debtGate(5000000,true).open,'threshold is strictly below, not equal');
  assert(debtGate(4999999,true).open);
  assert(!debtGate(4999999,false).open,'stale debt cannot authorize an order');
  assert(!debtGate(null,true).open);
  const forecast=forecastDebt(context);
  assert.equal(forecast.status,'scenario');
  assert.equal(forecast.estimatedOrderDate,'2026-01-13','strict threshold and settlement lag are honored');
  assert.equal(forecast.monthlyStockCashTry,2800,'stock cost release is cash, not reported profit');
  assert.equal(forecastDebt({...context,financialGoals:{...context.financialGoals,totalDebtTry:5100000}}).status,'not_reached','stock is finite, not perpetual revenue');
  const partial=forecastDebt({...context,importPipeline:{...context.importPipeline,coveragePct:metric(50)}});
  assert.equal(partial.estimatedOrderDate,null);assert(partial.missing.some(s=>s.includes('Gelecek ürün')));
  assert.equal(forecastDebt({...context,forecastInputs:{...inputs,interestMonthlyTry:null}}).estimatedOrderDate,null,'unknown interest is not zero');
  assert.equal(forecastDebt({...context,operating:{...context.operating,products:[{...context.operating.products[0],unitProfitTry:null}]}}).estimatedOrderDate,null,'missing costs do not become a repayment forecast');
  const inbound=forecastDebt({...context,operating:{...context.operating,products:[{...context.operating.products[0],stockQty:0,inboundQty:100,inboundEta:'2026-01-20T00:00:00Z'}]}});
  assert.equal(inbound.estimatedOrderDate,'2026-01-31','future stock cannot sell before arrival');
  assert.equal(forecastDebt({...context,forecastInputs:{...inputs,fixedMonthlyTry:3000}}).estimatedOrderDate,null,'unfunded cash flow cannot pretend to repay debt');
  const many=Array.from({length:110},(_,i)=>({sku:`SYNTH-${String(i).padStart(3,'0')}`,channels:['TRENDYOL'],reason:'cost',salesUnits30:i+1}));
  const manyContext={...context,operating:{...context.operating,questions:many}};
  const first=planCfoWork(manyContext,{});
  assert.equal(first.questions.length,5);
  assert(first.questions.some(q=>q.sku==='SYNTH-109'),'highest-selling missing costs first');
  const manual={id:'owner-priority',question:'Synthetic urgent cash decision?',answer:null,status:'ACIK',area:'nakit',priority:1};
  const limited=planCfoWork(manyContext,{},[manual]);assert.equal(limited.questions.length,4,'existing urgent question uses the active budget');
  const legacy=many.map(q=>({id:workflowId('question:cost:'+q.sku),question:`${q.sku} maliyeti nedir?`,answer:null,status:'ACIK',area:'marj',priority:2}));
  const backlog=planCfoWork(manyContext,{},legacy);
  assert.equal(backlog.questions.length,0,'100 existing questions are not duplicated');
  assert.equal(backlog.agenda.questionRanks.filter(q=>q.priority===2).length,5);
  const answered=[{...legacy.at(-1)!,status:'CEVAPLANDI',answer:'Synthetic evidence',answerChanged:true,answerVersion:asOf}];
  const next=planCfoWork(manyContext,{},answered,first.agenda,true);
  assert.equal(next.agenda.topic,'sales');assert.equal(next.agenda.nextTopic,'costs');
  assert.deepEqual(next.agenda.answersReviewed,[answered[0].id]);assert(next.items.some(i=>i.key==='answer:'+answered[0].id));
  let rotated=first;
  for(let i=0;i<5;i++)rotated=planCfoWork(manyContext,{},[],rotated.agenda,true);
  assert.equal(rotated.agenda.topic,'cash');assert(rotated.agenda.unchangedCycles>=4,'same data rotates topics instead of multiplying questions');
  const closedStock=planCfoWork({...context,operating:{...context.operating,products:[{...context.operating.products[0],stockDays:4}]}},{});
  assert(closedStock.items.find(i=>i.key==='stock:SYNTHETIC')?.futureOrder);
  assert(closedStock.items.find(i=>i.key==='stock:SYNTHETIC')?.proposal.includes('yeni sipariş açma'));
  assert(!closedStock.questions.some(q=>q.area==='siparis'),'locked debt does not flood supplier questions');

  const db=new PGlite();
  try{
    await db.exec(`create table cfo_note(id text primary key,title text,body text,category text,"dataTag" text,source text,pinned boolean,"createdAt" timestamptz,"updatedAt" timestamptz,"archivedAt" timestamptz);
      create table cfo_question(id text primary key,question text,why text,area text,priority int,status text,answer text,"askedAt" timestamptz default now(),scope text,entity_key text,code text);
      create table cfo_change_log(id text primary key,area text,item text,"oldValue" text,"newValue" text,source text,kind text,note text);`);
    const source:WriteSource={async query<T extends Row>(sql:string,...params:unknown[]):Promise<T[]>{return(await db.query<T>(sql,params)).rows;},execute:(sql,...params)=>db.query(sql,params)};
    await saveWorkPlan(source,first,'synthetic');
    await saveWorkPlan(source,planCfoWork(manyContext,{},[],first.agenda,true),'synthetic-repeat');
    assert.equal((await source.query(`select count(*)::int as n from cfo_note where source='cfo-workflow-journal'`))[0].n,2,'one append-only journal for every successful cycle');
    const [heartbeat]=await source.query('select body from cfo_note where id=$1 and source=$2',HEARTBEAT_ID,WORK_SOURCE);
    assert.equal(readMemory(String(heartbeat.body)).nextTopic,'costs');
    const [journal]=await source.query(`select body from cfo_note where source='cfo-workflow-journal' limit 1`);
    for(const heading of ['Çalışma özeti','Yapılanlar','Tespitler','Aksiyonlar','Eksikler / beklenenler','Sonraki çalışma'])assert(String(journal.body).includes(heading));
    await db.exec(`create table cfo_servet(borc numeric);insert into cfo_servet values(4999999);
      create table cfo_loan("remainingTry" numeric,"lastUpdatedAt" timestamp,status text);insert into cfo_loan values(1,'2026-01-01','AKTIF');
      create table cfo_credit_card("totalDebtTry" numeric,"lastUpdatedAt" timestamp,"isActive" boolean);insert into cfo_credit_card values(1,'2026-01-01',true);
      create table cfo_bank_account("balanceTry" numeric,"lastUpdatedAt" timestamp,"isActive" boolean);insert into cfo_bank_account values(0,'2026-01-01',true);`);
    assert((await readOrderDebtGate(source,new Date(asOf))).open,'actual SQL gate validates complete balances');
    await db.exec('update cfo_servet set borc=5000000');assert(!(await readOrderDebtGate(source,new Date(asOf))).open);
  }finally{await db.close();}
  console.log('CFO agenda: bounded priority queue, backlog, journal, rotation, answers, strict debt gate, stock/inbound limited cash forecast and unknown-data guards passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
