import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readCfoNotebook } from "../lib/cfo-agent/notebook";
import { operatingCapabilities, buildOperatingContext } from "../lib/cfo-agent/operating-context";
import type { CfoAgentSnapshot, ProductSignal } from "../lib/cfo-agent/types";
import type { ReadSource, Row } from "../lib/cfo-agent/sources";
const signal=(sku:string,cost:number|null,units:number,channel='EXAMPLE'):ProductSignal=>({sku,channel,trusted:true,sourceFresh:true,
  cost:{value:cost},priceFloor:{value:cost===null?null:40},contribution:{value:null},salesUnits30:{value:units},xmlUnits30:{value:30},stockDays:{value:10}} as ProductSignal);
async function main(){
  const snapshot={generatedAt:'2026-10-04T10:00:00Z',dataQuality:{costCoveragePct:1},products:[
    signal('known',20,100),signal('missing',null,50),signal('missing',null,50,'SECOND'),signal('unsold',null,0),signal('inactive',null,500)
  ]} as CfoAgentSnapshot;
  const scope=operatingCapabilities(snapshot,new Set(['inactive']));
  assert.equal(scope.globalCostCoverageBlocksAnalysis,false);
  assert.equal(scope.summary.skusWithKnownCost,1);
  assert.equal(scope.summary.skuChannelsWithPriceFloor,1);
  assert.equal(scope.summary.skuChannelsWithContributionProfit,0,'cost alone cannot establish profit');
  assert.equal(scope.questions.length,1,'one cost question per selling SKU, not per channel');
  assert.deepEqual(scope.questions[0].channels,['EXAMPLE','SECOND']);
  assert.equal(scope.questions[0].salesUnits30,50,'SKU-wide units are not added across channels');
  const db=new PGlite();
  const source:ReadSource={async query<T extends Row>(sql:string,...params:unknown[]):Promise<T[]>{return(await db.query<T>(sql,params)).rows;}};
  try{
    assert.equal((await readCfoNotebook(source,new Date(snapshot.generatedAt))).available,false);
    await db.exec(`create table cfo_note(id text,title text,body text,category text,"dataTag" text,source text,pinned boolean,"updatedAt" timestamptz,"reviewBy" timestamptz,"archivedAt" timestamptz);
      insert into cfo_note values
      ('current','Current rule','Synthetic business context','kural','Kesin',null,true,'2026-10-03',null,null),
      ('expired','Expired','Synthetic context','urun','KESIN',null,false,'2026-10-03','2026-10-01',null),
      ('estimate','Estimate','Synthetic context','nakit','TAHMINI',null,false,'2026-10-03',null,null),
      ('archived','Archived','PRIVATE_ARCHIVED','kural','KESIN',null,true,'2026-10-03',null,'2026-10-03');
      create table "MarketplaceSalesRecord"("importedAt" timestamptz);
      insert into "MarketplaceSalesRecord" values ('2026-10-03'),('2026-10-04');
      create table "Product"(sku text,"isActive" boolean,"unitCostTry" numeric,"unitCostUsd" numeric,"importUnitCostUsd" numeric,"privateNote" text,"productKind" text,"stockQuantity" integer);
      insert into "Product" values('inactive',false,null,null,null,null,'MAIN_STOCK',0),('usd',true,null,10,null,null,'MAIN_STOCK',5);`);
    const notebook=await db.transaction(async tx=>{
      await tx.exec('SET TRANSACTION READ ONLY');
      const source:ReadSource={async query<T extends Row>(sql:string,...params:unknown[]):Promise<T[]>{return(await tx.query<T>(sql,params)).rows;}};
      return readCfoNotebook(source,new Date(snapshot.generatedAt));
    });
    assert.equal(notebook.activeCount,3);
    assert.equal(notebook.notes[0].id,'current');
    assert.equal(notebook.notes[0].needsReview,false);
    assert.equal(notebook.notes.find(n=>n.id==='expired')?.needsReview,true);
    assert.equal(notebook.notes.find(n=>n.id==='estimate')?.needsReview,true);
    assert(!JSON.stringify(notebook).includes('PRIVATE_ARCHIVED'));
    const context=await buildOperatingContext(source,{...snapshot,products:[...snapshot.products,signal("usd",null,200)],notebook});
    assert.equal(context.operating.questions.some(q=>q.sku==='usd'),false,'recorded USD cost must not trigger a repeat cost-entry question');
    assert.equal(context.operating.recordedCostReconciliation[0].sku,'usd');
    assert.equal(context.sources[0].records,2);
    assert.equal(context.sources[1].available,false);
    assert.equal(context.sources[1].records,null,'unreadable source must not be financial zero');
    assert.equal(context.operating.summary.skusWithKnownCost,1,'one absent source does not disable independent cost scope');
    await db.exec(`insert into cfo_note select 'bulk-'||n,'Title',repeat('x',5000),'diger','KESIN',null,false,'2026-10-02',null,null from generate_series(1,501) n;`);
    const large=await readCfoNotebook(source,new Date(snapshot.generatedAt));
    assert.equal(large.activeCount,504);
    assert.equal(large.notes.length,500);
    assert.equal(large.truncated,true);
    assert.equal(large.notes.find(n=>n.id.startsWith('bulk-'))?.bodyTruncated,true);
    console.log('CFO operating context: partial SKU scope, inactive exclusion, consolidated questions, actual read-only notebook SQL, confidence/expiry/archive, source isolation and bounded context passed');
  }finally{await db.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
