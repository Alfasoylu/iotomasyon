import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { getCfoConfig } from "../lib/cfo-agent/config";
import { allocateOrderCost, cautiousDemand, contribution, financialImpact, isDummyStock, measuredCommission, metric, priceFloor, unknown } from "../lib/cfo-agent/calculations";
import { evaluateCfoAcceptance } from "../lib/cfo-agent/acceptance";
import { cfoAcceptanceDiagnostics } from "../lib/cfo-agent/acceptance-diagnostics";
import { evaluateShadowWeek } from "../lib/cfo-agent/shadow";
import { detectCfoAnomalies, shouldReopen } from "../lib/cfo-agent/anomalies";
import { budgetBlock, istanbulPeriod } from "../lib/cfo-agent/budget";
import { createCfoProvider, ProviderError, reasoningPayload } from "../lib/cfo-agent/provider";
import { validateAiOutput } from "../lib/cfo-agent/validate-ai-output";
import { buildCfoAgentSnapshot, PERIOD_CTE } from "../lib/cfo-agent/snapshot";
import { runCfoMonitor, runCfoMorningBrief } from "../lib/cfo-agent/runner";
import { existingQueueRecords } from "../lib/cfo-agent/memory";
import { createMonitorLock } from "../lib/cfo-agent/lock";
import type { CfoStore, UsageWrite } from "../lib/cfo-agent/store";
import type { Anomaly, CfoAgentSnapshot } from "../lib/cfo-agent/types";
import type { ReadSource, Row } from "../lib/cfo-agent/sources";

let passed=0;
async function check(name:string,fn:()=>void|Promise<void>){await fn();passed++;console.log(`OK ${name}`);}
const now=new Date("2026-10-03T08:00:00Z");
const config=getCfoConfig({AI_CFO_CI_BUILD_VERIFIED:"true",AI_CFO_LIVE_ACCEPTANCE_VERIFIED:"true",AI_CFO_SHADOW_WEEK_APPROVED:"true",AI_CFO_ENABLED:"true",AI_CFO_MONITOR_ENABLED:"true",AI_CFO_PROVIDER:"anthropic",AI_CFO_CANONICAL_SALES_VALIDATED:"true",AI_CFO_GROSS_INCLUDES_REFUNDS:"true",AI_CFO_INPUT_PRICE_USD_PER_MILLION:"3",AI_CFO_OUTPUT_PRICE_USD_PER_MILLION:"15",AI_CFO_BILLING_USD_TRY:"45"});
const db=new PGlite();
const sqlCalls:string[]=[];
const source:ReadSource={async query<T extends Row>(sql:string,...params:unknown[]):Promise<T[]>{sqlCalls.push(sql);return (await db.query<T>(sql,params)).rows;}};

async function fixture(){
  await db.exec(`
    create table "MarketplaceSalesRecord" ("orderDate" timestamptz,"importedAt" timestamptz,quantity int,"totalAmountTry" numeric);
    create table "TrendyolSalesRecord" ("orderDate" timestamptz,"syncedAt" timestamptz);
    create table "HepsiburadaSalesRecord" ("orderDate" timestamptz,"syncedAt" timestamptz);
    create table "XmlStockChangeLog" ("syncedAt" timestamptz,delta int);
    create table "Product" (id text,sku text,"stockQuantity" int,"unitCostTry" numeric,"weightKg" numeric,"productKind" text,"mainProductId" text,"sellingPriceTry" numeric,"isActive" boolean);
    create table "PurchaseOrder" (id text,status text,"estimatedArrival" timestamptz);
    create table "PurchaseOrderItem" ("productId" text,qty int,"orderId" text);
    create table cfo_bank_account ("balanceTry" numeric,"lastUpdatedAt" timestamptz,"isActive" boolean);
    create table cfo_satis_siparis(channel text,"orderNumber" text,"orderDate" timestamptz,"totalAmountTry" numeric);
    create table cfo_satis_birim_duz(channel text,"modelNumber" text,"orderNumber" text,"orderDate" timestamptz,adet_duz numeric,tutar_duz numeric,guven text,"commissionTry" numeric,"totalAmountTry" numeric,"vatAmountTry" numeric,"refundTry" numeric,"advertisingTry" numeric,"returnedUnits" numeric);
    create table cfo_kargo_tarife(min_try numeric,max_try numeric,kargo_try numeric);
    create table cfo_stok_hareket_hiz(sku text,gunluk_30g_ihtiyatli numeric,tukenme_gun_ihtiyatli numeric,hizlanma_katsayi numeric,adet30 numeric);
    create table cfo_set_bilesen_maliyet(set_sku text,maliyet_try numeric);
    create table cfo_set_fiyat(sku text,birim_kar_try numeric);
    create table cfo_stok_istisna(sku text);
    create table cfo_olu_stok(sku text,bagli_sermaye numeric,deger_kaynagi text,alarm text,bulgu_id text);
    create table cfo_yolda_sku(sku text,yolda_adet numeric,en_yakin_eta timestamptz);
    create table cfo_yoldaki_kapsam(kapsam_pct numeric);
    create table cfo_nakit_kapisi(nakit_try numeric,bos_kmh_try numeric,amac_kmh numeric);
    create table cfo_credit_card("totalDebtTry" numeric,"isActive" boolean);
    create table cfo_kanal_net_oran(channel text,net_oran numeric,guven text);
    create table cfo_odeme_gunluk(kalan_gun int,cikacak numeric,girecek numeric);
    create table cfo_servet(servet_try numeric,servet_usd numeric);
    create table cfo_servet_kalem(tutar numeric);
    create table cfo_servet_likidite(net_deger numeric);
    create table cfo_dead_stock_finding(id int,sku text,status text);
    create table cfo_stok_sicrama_durum(id int,sku text,durum text);
    create table cfo_question(id text,status text,area text,priority int,entity_key text,code text);
    insert into "MarketplaceSalesRecord" values ('2026-10-03','2026-10-03',99999,99999999);
    insert into "TrendyolSalesRecord" values ('2026-10-03','2026-10-03');
    insert into "HepsiburadaSalesRecord" values ('2026-10-03','2026-10-03');
    insert into "XmlStockChangeLog" values ('2026-10-03',-900);
    insert into "Product" values ('a','SKU-A',10,100,0.1,'MAIN_STOCK',null,500,true),('b','SKU-B',5,50,0.2,'MAIN_STOCK',null,250,true),('dummy','DUMMY',999,100,0.1,'MAIN_STOCK',null,500,true);
    insert into cfo_kargo_tarife values (0,200,53.61),(200,350,92),(350,750,106.25),(750,1500,113.41),(1500,null,154.91);
    insert into cfo_stok_hareket_hiz values ('SKU-A',1,10,1.2,60),('SKU-B',0,null,null,0),('DUMMY',100,1,2,3000);
    insert into cfo_bank_account values (100,'2026-10-03',true);
    insert into cfo_nakit_kapisi values (100,1809300,750000);
    insert into cfo_credit_card values(2366017.30,true);
    insert into cfo_kanal_net_oran values('EPTT',0.752,'YÜKSEK');
    insert into cfo_yoldaki_kapsam values(100);
    insert into cfo_satis_birim_duz select 'TRENDYOL','SKU-A','o'||i,'2026-10-01',1,500,'KESIN',90,500,83.33,0,0,0 from generate_series(1,20)i;
    insert into cfo_satis_siparis select 'TRENDYOL','o'||i,'2026-10-01',500 from generate_series(1,20)i;
    insert into cfo_satis_birim_duz select 'TRENDYOL','SKU-A','p'||i,'2026-08-24',1,600,'KESIN',108,600,100,0,0,0 from generate_series(1,20)i;
    insert into cfo_satis_siparis select 'TRENDYOL','p'||i,'2026-08-24',600 from generate_series(1,20)i;
    create function cfo_nakit_projeksiyon(integer) returns table(net_pozisyon numeric) language sql stable as 'select -4000000::numeric';
    create function cfo_kaynak_yeterliligi() returns table(acik numeric) language sql stable as 'select -100::numeric';
    create function cfo_kart_karari() returns table(tutar numeric) language sql stable as 'select 100::numeric';
    create function cfo_gumruk_dilim() returns table(oran numeric) language sql stable as 'select 0.5::numeric';
    create function cfo_defter_denetim() returns table(kod text) language sql stable as $$select 'OK'::text$$;
    create function cfo_onucus() returns table(kod text) language sql stable as $$select 'OK'::text$$;
  `);
}
const snapshot=()=>buildCfoAgentSnapshot({now,config,db:source,bindings:{}});
const clone=(s:CfoAgentSnapshot)=>structuredClone(s);
const product=(s:CfoAgentSnapshot)=>s.products.find(p=>p.sku==="SKU-A"&&p.channel==="TRENDYOL")!;
function aiFor(a:Anomaly,extras:Record<string,unknown>={}){return JSON.stringify({insights:[{anomalyId:a.id,severity:a.severity,category:a.category,title:"Nakit planını gözden geçirin",observation:"Ölçüm kritik risk gösteriyor.",recommendation:"Ödeme takvimini inceleyin.",riskIfIgnored:"Likidite baskısı sürer.",confidence:"high",evidenceIds:a.evidenceIds.slice(0,1),...extras}]});}
function fakeStore(){
  const usage:UsageWrite[]=[],statuses:string[]=[],runs=new Set<string>(),insights:unknown[]=[],saved:Anomaly[][]=[];
  let recent:{createdAt:Date;impact:number|null}|null=null,totals={callsToday:0,spentThisMonth:0};
  const store:CfoStore={async begin(type,period){const k=`${type}:${period}`;if(runs.has(k))return null;runs.add(k);return k;},async snapshot(_id,_s,_h,_a,sent){saved.push(sent);},async recent(){return recent;},async totals(){return totals;},async usage(_id,d){usage.push(d);return String(usage.length-1);},async updateUsage(id,d){usage[Number(id)]=d;},async insights(_id,i){insights.push(...i);},async finish(_id,s){statuses.push(s);}};
  return {store,usage,statuses,insights,saved,setRecent:(v:typeof recent)=>{recent=v;},setTotals:(v:typeof totals)=>{totals=v;}};
}
const freeLock=()=>({async acquire(){return true;},async release(){}});
async function main(){
  process.env.AI_CFO_PROJECTION_POSITION_COLUMN="net_pozisyon";
  await fixture();
  let s=await snapshot();
  await check("PostgreSQL snapshot aggregates canonical SKU view, never raw order quantities",()=>{
    assert.equal(product(s).avgPrice.value,500);assert.equal(product(s).unitProfit.value,171.46);
    assert.equal(s.sales.last30Days.grossRevenue.value,10000);assert.equal(s.sales.last30Days.orders,20);
    assert(!JSON.stringify(s).includes("99999999"));
    assert(!sqlCalls.some(q=>q.includes('sum("quantity")')||q.includes('UNION ALL\n      SELECT')));
  });
  await check("all mandated cash functions reused; purpose limit remains separate",()=>{
    assert.equal(s.cash.cash.value,100);assert.equal(s.cash.purposeLimit.value,750000);assert.equal(s.cash.minimumProjectedPosition.value,-4000000);
    assert(sqlCalls.some(q=>q.includes("cfo_onucus()")));assert(detectCfoAnomalies(clone(s),config).some(a=>a.rule==="CASH_CRITICAL"));
  });
  await check("dummy stock 999 is excluded from capital and stock risk",()=>{assert.equal(s.dataQuality.excludedDummyStock,1);assert.equal(s.inventory.costValue.value,1250);});
  await check("XML FBA shipment drop cannot become sales velocity or revenue",()=>{assert.equal(product(s).velocity.value,1);assert.equal(s.dataQuality.fbaInventoryUnknown,true);});
  await check("SKU commission under 10 samples rejects small sample, Koctas stays unknown",()=>{
    assert.equal(measuredCommission("TRENDYOL",2,12,100,180,1000,100).value,null);
    assert.equal(measuredCommission("MIRAKL_KOCTAS",20,20,100,20,100).value,null);
    assert.equal(measuredCommission("HEPSIBURADA",20,180,1000,null,null,100).value,.18);
  });
  await check("missing cost remains null and emits quality, never fabricated financial profit",async()=>{
    await db.exec(`update "Product" set "unitCostTry"=null where sku='SKU-A'`);const missing=await snapshot();
    assert.equal(product(missing).unitProfit.value,null);assert.equal(missing.profitability.contributionProfit.value,null);
    assert(detectCfoAnomalies(missing,config).some(a=>a.rule==="COST_COVERAGE"));
    await db.exec(`update "Product" set "unitCostTry"=100 where sku='SKU-A'`);
  });
  await check("multi-item order costs allocate ONCE by corrected SKU revenue shares",async()=>{
    await db.exec(`insert into cfo_satis_siparis values ('TRENDYOL','multi','2026-10-02',300);
      insert into cfo_satis_birim_duz values ('TRENDYOL','SKU-A','multi','2026-10-02',1,100,'KESIN',18,300,16.67,0,0,0),('TRENDYOL','SKU-B','multi','2026-10-02',1,200,'KESIN',36,300,33.33,0,0,0);`);
    const multi=await snapshot();assert.equal(multi.sales.last30Days.orders,21);assert.equal(multi.sales.last30Days.grossRevenue.value,10300);
    assert(Math.abs(multi.profitability.shipping.value!-(20*106.25+92))<.00001);
    assert(Math.abs(allocateOrderCost(92,100,300,true)!+allocateOrderCost(92,200,300,true)!-92)<.00001);
    assert.equal(allocateOrderCost(92,100,300,false),null);
  });
  await check("duplicate canonical marketplace order blocks financial result without double revenue",async()=>{
    await db.exec(`insert into cfo_satis_siparis values('TRENDYOL','multi','2026-10-02',300)`);const duplicate=await snapshot();
    assert.equal(duplicate.sales.last30Days.grossRevenue.value,null);assert(duplicate.dataQuality.duplicateCanonicalRows>0);
    assert(!detectCfoAnomalies(duplicate,config).some(a=>a.rule==="MARGIN_DROP"));
    await db.exec(`delete from cfo_satis_siparis where "orderNumber"='multi'; insert into cfo_satis_siparis values('TRENDYOL','multi','2026-10-02',300);`);
  });
  await check("unknown SKU trust KARMA excludes SKU profitability",async()=>{
    await db.exec(`update cfo_satis_birim_duz set guven='KARMA' where "modelNumber"='SKU-B'`);const mixed=await snapshot();
    assert.equal(mixed.products.find(p=>p.sku==="SKU-B")?.unitProfit.value,null);
    await db.exec(`update cfo_satis_birim_duz set guven='KESIN' where "modelNumber"='SKU-B'`);
  });
  await check("VAT reporting cannot alter gross-basis margin and refund cannot double count",()=>{
    const inputs={grossRevenue:metric(120),vat:metric(20),refunds:metric(10),productCost:metric(40),commission:metric(18),shipping:metric(5),advertising:metric(0),otherVariableCosts:metric(2)};
    const included=contribution(inputs,true),separate=contribution(inputs,false);
    assert.equal(included.revenueExVat.value,100);assert.equal(included.contributionProfit.value,55);assert.equal(separate.contributionProfit.value,45);
    assert.equal(included.contributionMargin.basis,"gross_incl_vat");assert.equal(contribution({...inputs,advertising:unknown("attribution_unknown")},true).contributionProfit.value,null);
  });
  await check("SET missing component cannot fall back to Product cost or trigger financial alarm",async()=>{
    await db.exec(`insert into "Product" values('set','SET-X',5,999,0.5,'LISTING_PACKAGE','a',500,true);
      insert into cfo_set_bilesen_maliyet values('SET-X',100),('SET-X',null);
      insert into cfo_set_fiyat values('SET-X',300);
      insert into cfo_satis_siparis values('TRENDYOL','set-order','2026-10-02',500);
      insert into cfo_satis_birim_duz values('TRENDYOL','SET-X','set-order','2026-10-02',1,500,'KESIN',90,500,80,0,0,0);`);
    const set=await snapshot();const p=set.products.find(p=>p.sku==="SET-X")!;
    assert.equal(p.cost.value,null);assert.equal(p.unitProfit.value,null);assert(set.dataQuality.missingFields.includes("set_component_unknown:SET-X"));
    assert(!detectCfoAnomalies(set,config).some(a=>a.entityId.includes("SET-X")&&a.category==="margin"));
  });
  await check("AMAZON_FBA canonical records are included without FBA assets",async()=>{
    await db.exec(`insert into cfo_satis_siparis values('AMAZON_FBA','fba','2026-10-02',500);
      insert into cfo_satis_birim_duz values('AMAZON_FBA','SKU-A','fba','2026-10-02',1,500,'KESIN',90,500,80,0,0,0);`);
    const fba=await snapshot();assert(fba.products.some(p=>p.channel==="AMAZON_FBA"));assert.equal(fba.inventory.costValue.value,1250);
  });
  await check("nine-day stale sales source cannot fire financial deviation",async()=>{
    await db.exec(`update "MarketplaceSalesRecord" set "orderDate"='2026-09-24',"importedAt"='2026-09-24'`);const old=await snapshot();
    assert(old.dataQuality.staleSources.includes("Entegra"));assert(!detectCfoAnomalies(old,config).some(a=>a.rule==="REVENUE_DEVIATION"||a.rule==="PRICE_BELOW_FLOOR"));
    await db.exec(`update "MarketplaceSalesRecord" set "orderDate"='2026-10-03',"importedAt"='2026-10-03'`);
  });
  await check("twenty-day stale manual bank balance suppresses cash diagnosis",async()=>{
    await db.exec(`update cfo_bank_account set "lastUpdatedAt"='2026-09-13'`);const old=await snapshot();assert(!detectCfoAnomalies(old,config).some(a=>a.rule==="CASH_CRITICAL"));
    assert(detectCfoAnomalies(old,config).some(a=>a.rule==="DATA_STALE"&&a.entityId==="banks"));await db.exec(`update cfo_bank_account set "lastUpdatedAt"='2026-10-03'`);
  });
  await check("weekday-matched equal periods require complete coverage",()=>{
    assert(PERIOD_CTE.includes("interval '8 days'"));assert(PERIOD_CTE.includes("interval '35 days'"));
    const weekends=clone(s);weekends.sales.comparisons=[{entity:"company",current:metric(100),previous:metric(100000),complete:false,sourceFresh:true,period:"test"}];
    assert(!detectCfoAnomalies(weekends,config).some(a=>a.rule==="REVENUE_DEVIATION"));
  });
  await check("price floor crosses shipping boundary using new band's actual tariff",()=>{
    const bands=[{min:0,max:200,shipping:53.61},{min:200,max:350,shipping:92},{min:350,max:null,shipping:106.25}];
    const floor=priceFloor(130,.18,.1,bands);assert.equal(floor.value,326.41);assert(floor.estimated);
    assert.equal(priceFloor(null,.18,.1,bands).value,null);assert(isDummyStock(500));assert(!isDummyStock(1001));
  });
  await check("zero inventory and unknown demand are distinct; inbound prevents redundant procurement",()=>{
    const risk=clone(s);const p=product(risk);p.stockQty=0;p.stockDays=metric(0,true);p.inboundQty=30;p.inboundBeforeStockout=true;
    const a=detectCfoAnomalies(risk,config);assert(a.some(a=>a.rule==="STOCKOUT"));assert(!a.some(a=>a.rule==="PROCUREMENT"));
    p.stockDays=unknown("unknown_demand");assert(!detectCfoAnomalies(risk,config).some(a=>a.rule==="STOCKOUT"));
  });
  await check("returns spike requires sufficient sample; impact stores formula and inputs",()=>{
    const r=clone(s);r.returns={currentRate:metric(20),previousRate:metric(1),sample:5,complete:true};assert(!detectCfoAnomalies(r,config).some(a=>a.rule==="RETURNS_SPIKE"));
    r.returns.sample=100;assert(detectCfoAnomalies(r,config).some(a=>a.rule==="RETURNS_SPIKE"));
    assert.deepEqual(financialImpact(metric(10),metric(2,true),3)?.inputs,{unit_profit_try:10,daily_velocity:2,affected_days:3});
  });
  s=await snapshot();
  const anomalies=detectCfoAnomalies(s,config),cash=anomalies.find(a=>a.rule==="CASH_CRITICAL")!;
  await check("AI rejects invented evidence, numbers, extra financialImpact and malformed JSON",()=>{
    assert.equal(validateAiOutput(aiFor(cash,{evidenceIds:["invented"]}),s,anomalies).insights.length,0);
    assert.equal(validateAiOutput(aiFor(cash,{observation:"Kazanç 123456789 TL."}),s,anomalies).insights.length,0);
    assert.equal(validateAiOutput(aiFor(cash,{financialImpact:100}),s,anomalies).insights.length,0);
    assert.equal(validateAiOutput("{invalid",s,anomalies).insights.length,0);
    assert.equal(validateAiOutput(aiFor(cash),s,anomalies).insights.length,1);
    assert(validateAiOutput(aiFor(cash),s,anomalies).insights[0].observation.startsWith("TAHMİNİ"));
  });
  await check("72-hour cooldown only reopens if financial impact worsens at least 50 percent",()=>{
    const a={...cash,impact:financialImpact(metric(10),metric(1),10)};
    assert(!shouldReopen(a,{createdAt:now,impact:100},now));a.impact!.value=149;assert(!shouldReopen(a,{createdAt:now,impact:100},now));a.impact!.value=150;assert(shouldReopen(a,{createdAt:now,impact:100},now));
  });
  await check("existing dead-stock queue links evidence and blocks duplicate insight",async()=>{
    await db.exec(`insert into cfo_dead_stock_finding values(7,'SKU-A','acik')`);
    const a={...cash,id:"dead",rule:"DEAD_STOCK",entityType:"sku",entityId:"SKU-A"};
    const queues=await existingQueueRecords([a],source);assert.deepEqual(queues.get("dead"),["cfo_dead_stock_finding:7"]);
  });
  const provider={async countInput(){return 1000;},async generate(){return {text:aiFor(cash),inputTokens:1000,outputTokens:200,cacheReadTokens:0,cacheWriteTokens:0,requestId:"test"};}};
  const base={now,config,snapshot:async()=>clone(s),queues:async()=>new Map<string,string[]>(),memory:async()=>[],lock:freeLock(),provider};
  await check("no actionable anomaly means no AI network call",async()=>{
    const store=fakeStore(),quiet=clone(s);quiet.products=[];quiet.cash.minimumProjectedPosition=metric(0);quiet.deadStock=[];quiet.channels=[];quiet.sales.comparisons=[];
    const result=await runCfoMonitor({...base,store:store.store,snapshot:async()=>quiet,provider:{...provider,async generate(){throw new Error("MUST NOT CALL");}}});assert.equal(result.status,"no_actionable_anomaly");assert.equal(store.usage.length,0);
  });
  await check("monthly budget blocks AI but persists deterministic run",async()=>{
    const store=fakeStore();store.setTotals({callsToday:0,spentThisMonth:3000});
    const r=await runCfoMonitor({...base,store:store.store});assert.equal(r.status,"blocked_by_budget");assert.equal(store.usage[0].status,"blocked_by_budget");assert.equal(store.saved.length,1);
    assert.equal(budgetBlock(config,{callsToday:6,spentThisMonth:0},1),"blocked_by_daily_limit");
  });
  await check("provider unavailable/missing credential preserves deterministic results",async()=>{
    const store=fakeStore();assert.equal((await runCfoMonitor({...base,store:store.store,provider:null})).status,"provider_unavailable");
    assert.equal(createCfoProvider(config,{}),null);assert.equal(getCfoConfig({}).enabled,false);
  });
  await check("provider timeout retains worst-case budget reservation and releases lock",async()=>{
    const store=fakeStore();let released=false;
    const r=await runCfoMonitor({...base,store:store.store,lock:{async acquire(){return true;},async release(){released=true;}},provider:{...provider,async generate(){throw new ProviderError("provider_timeout");}}});
    assert.equal(r.status,"failed");assert.equal(store.usage[0].status,"failed");assert(store.usage[0].reservedCostTry!>0);assert(released);
  });
  await check("token gate stops billable call before usage reservation",async()=>{
    const store=fakeStore();const r=await runCfoMonitor({...base,store:store.store,provider:{...provider,async countInput(){return 8000;}}});assert.equal(r.status,"blocked_by_input_tokens");assert.equal(store.usage.length,0);
  });
  await check("concurrent cron is excluded; period retry is idempotent",async()=>{
    const store=fakeStore();let held=false;const lock=()=>{let mine=false;return {async acquire(){if(held)return false;held=true;mine=true;return true;},async release(){if(mine)held=false;}};};
    const [a,b]=await Promise.all([runCfoMonitor({...base,store:store.store,lock:lock()}),runCfoMonitor({...base,store:store.store,lock:lock()})]);
    assert([a.status,b.status].includes("locked"));assert.equal((await runCfoMonitor({...base,store:store.store,lock:lock()})).status,"duplicate");
    await assert.rejects(createMonitorLock({}).acquire(),/session_lock_not_configured/);
  });
  await check("repeated anomaly cooldown avoids another provider call",async()=>{
    const store=fakeStore();store.setRecent({createdAt:now,impact:null});
    assert.equal((await runCfoMonitor({...base,store:store.store})).status,"no_actionable_anomaly");
  });
  await check("morning earliest 09:30 TR; successful AI is metered and bounded to three insights",async()=>{
    const store=fakeStore();assert.equal((await runCfoMorningBrief({...base,now:new Date("2026-10-03T06:29:00Z"),store:store.store})).status,"too_early");
    assert.equal(istanbulPeriod(new Date("2026-10-02T22:00:00Z")).date,"2026-10-03");
    const r=await runCfoMonitor({...base,store:store.store});assert.equal(r.status,"completed");assert.equal(store.usage[0].inputTokens,1000);assert.equal(store.usage[0].status,"completed");assert(store.insights.length<=3);
    assert(!JSON.stringify(reasoningPayload({snapshot:s,anomalies:[cash],memory:[]})).includes("customer"));
  });
  await check("all three release gates block AI despite AI_CFO_ENABLED=true",async()=>{
    const gated=getCfoConfig({AI_CFO_ENABLED:"true"});assert.equal(gated.releaseApproved,false);
    for(const key of ["AI_CFO_CI_BUILD_VERIFIED","AI_CFO_LIVE_ACCEPTANCE_VERIFIED","AI_CFO_SHADOW_WEEK_APPROVED"]) {
      const env:Record<string,string>={AI_CFO_CI_BUILD_VERIFIED:"true",AI_CFO_LIVE_ACCEPTANCE_VERIFIED:"true",AI_CFO_SHADOW_WEEK_APPROVED:"true"};delete env[key];assert.equal(getCfoConfig(env).releaseApproved,false);
    }
    const store=fakeStore();assert.equal((await runCfoMonitor({...base,config:{...config,releaseApproved:false},store:store.store})).status,"release_gates_pending");assert.equal(store.usage.length,0);
  });
  await check("incomplete Entegra 81 vs XML 222 retains cautious 5.33, not raw max or partial velocity",()=>{
    const d=cautiousDemand(metric(81),metric(222,true),metric(5.33,true),false);
    assert.equal(d.velocity.value,5.33);assert.equal(d.salesVelocity.value,null);assert(d.gap.value!>30);
    assert.equal(cautiousDemand(metric(81),metric(222,true),metric(5.33,true),true).velocity.value,2.7);
    const x=clone(s),p=product(x);p.salesUnits30=metric(81);p.xmlUnits30=metric(222,true);p.velocityGapPct=d.gap;p.xmlVelocity=metric(5.33,true);
    assert(detectCfoAnomalies(x,config).some(a=>a.rule==="DEMAND_SOURCE_DIVERGENCE"&&a.category==="data_quality"&&!a.actionable));
  });
  await check("low commission coverage and zero-filled channels cannot imply high profit",async()=>{
    assert.equal(measuredCommission("TRENDYOL",100,10,100,null,null,89.99).value,null);
    for(const channel of ["EPTT","N11","AMAZON","PAZARAMA","TEMU","IDEFIX","AMAZON_FBA","MIRAKL_KOCTAS"])assert.equal(measuredCommission(channel,100,0,100,null,null,100).value,null);
    await db.exec(`insert into cfo_satis_siparis values('EPTT','eptt','2026-10-02',1000);
      insert into cfo_satis_birim_duz values('EPTT','SKU-A','eptt','2026-10-02',1,1000,'KESIN',null,1000,100,0,0,0);`);
    const x=await snapshot(),c=x.channels.find(c=>c.channel==="EPTT")!;
    assert.equal(c.profitability.contributionProfit.value,null);assert.equal(c.netSettlementRatio.value,.752);assert(c.netSettlementRatio.estimated);assert.equal(c.estimatedNetReceipts.value,752);
    await db.exec(`delete from cfo_satis_siparis where channel='EPTT';delete from cfo_satis_birim_duz where channel='EPTT'`);
  });
  await check("SQL commission uses 120-day weighted mean after median/MAD outlier filtering",async()=>{
    await db.exec(`insert into cfo_satis_birim_duz values('TRENDYOL','SKU-A','outlier','2026-10-02',1,1000,'KESIN',348,1000,100,0,0,0);`);
    const x=await snapshot();assert.equal(product(x).commissionRate.value,.18);assert(x.dataQuality.commissionCoverage.find(c=>c.channel==="TRENDYOL")!.outliers>=1);
    assert(sqlCalls.some(q=>q.includes("interval '120 days'")&&q.includes("grouping sets")));
    await db.exec(`delete from cfo_satis_birim_duz where "orderNumber"='outlier'`);
  });
  await check("legitimate SKU rates survive a different channel median; outliers stay SKU-local",async()=>{
    const low=Array.from({length:43},(_,i)=>`('TRENDYOL','SKU-LOW','low-${i}','2026-10-02',1,1000,'KESIN',128.8,1000,100,0,0,0)`);
    const high=Array.from({length:100},(_,i)=>`('TRENDYOL','SKU-MIX','mix-${i}','2026-10-02',1,1000,'KESIN',200.4,1000,100,0,0,0)`);
    await db.exec(`insert into cfo_satis_birim_duz values ${[...low,...high,"('TRENDYOL','SKU-LOW','low-bad','2026-10-02',1,1000,'KESIN',348,1000,100,0,0,0)"].join(",")}`);
    const x=await snapshot(),a=x.products.find(p=>p.sku==="SKU-LOW")!,b=x.products.find(p=>p.sku==="SKU-MIX")!;
    assert.equal(a.commissionRate.value,.1288);assert.equal(a.commissionSamples,43);
    assert.equal(b.commissionRate.value,.2004);assert.equal(b.commissionSamples,100);
    await db.exec(`delete from cfo_satis_birim_duz where "modelNumber" in ('SKU-LOW','SKU-MIX')`);
  });
  await check("timestamp-without-zone UTC dates retain Istanbul 30-day boundary sales",async()=>{
    const before=await snapshot(),oldUnits=product(before).salesUnits30.value!;
    await db.exec(`alter table cfo_satis_siparis alter column "orderDate" type timestamp without time zone using "orderDate" at time zone 'UTC';
      alter table cfo_satis_birim_duz alter column "orderDate" type timestamp without time zone using "orderDate" at time zone 'UTC';
      insert into cfo_satis_siparis values('TRENDYOL','boundary','2026-09-03 00:00:00',1000);
      insert into cfo_satis_birim_duz values('TRENDYOL','SKU-A','boundary','2026-09-03 00:00:00',1,1000,'KESIN',180,1000,100,0,0,0)`);
    const x=await snapshot();assert.equal(x.sales.last30Days.orders,before.sales.last30Days.orders!+1);
    assert.equal(product(x).salesUnits30.value,oldUnits+1);
    await db.exec(`delete from cfo_satis_siparis where "orderNumber"='boundary';delete from cfo_satis_birim_duz where "orderNumber"='boundary';
      alter table cfo_satis_siparis alter column "orderDate" type timestamptz using "orderDate" at time zone 'UTC';
      alter table cfo_satis_birim_duz alter column "orderDate" type timestamptz using "orderDate" at time zone 'UTC'`);
  });
  await check("acceptance commission diagnostics separate native/trusted means and expose no order IDs",async()=>{
    await db.exec(`insert into cfo_satis_birim_duz values
      ('TRENDYOL','MD-3003B1','diagnostic-1','2026-10-02',1,1000,'KESIN',100,1000,100,0,0,0),
      ('TRENDYOL','MD-3003B1','diagnostic-2','2026-10-02',1,1000,'KARMA',200,1000,100,0,0,0)`);
    const d=await cfoAcceptanceDiagnostics(source,now.toISOString());assert.equal(d.available,true);
    assert.equal(d.summary![0].records,2);assert.equal(d.summary![0].untrusted,1);
    assert.equal(Number(d.summary![0].native_weighted_pct),15);assert.equal(Number(d.summary![0].trusted_weighted_pct),10);
    assert(!JSON.stringify(d).includes('diagnostic-1'));assert(!JSON.stringify(d).includes('orderNumber'));
    await db.exec(`delete from cfo_satis_birim_duz where "orderNumber" in ('diagnostic-1','diagnostic-2')`);
  });
  await check("frozen 12-check acceptance evaluator detects wrong values and missing Koctas",()=>{
    const x=clone(s);x.cash.cash=metric(72483.62);x.cash.generalUnusedOverdraft=metric(1809300);x.cash.purposeLimit=metric(750000);x.cash.totalCardDebt=metric(2366017.3);x.cash.activeCards=6;
    x.dataQuality.excludedDummyStock=47;x.dataQuality.zeroStockSkuCount=1086;
    x.products=[{...product(x),sku:"MD-3003B1",salesUnits30:metric(81),xmlUnits30:metric(222),velocity:metric(5.33,true),commissionRate:metric(.1288),commissionSamples:43},
      {...product(x),sku:"ANUNNAKI-POINTER",stockDays:metric(124,true),stockQty:170}];
    x.channels=[{channel:"MIRAKL_KOCTAS",profitability:{...x.profitability,contributionProfit:unknown("commission_unavailable")},previousMargin:unknown("missing"),sourceFresh:true,netSettlementRatio:metric(.747,true),estimatedNetReceipts:unknown("missing")}];
    assert.equal(evaluateCfoAcceptance(x).filter(c=>c.passed).length,12);
    x.products[1].stockQty=169;
    const conditional=evaluateCfoAcceptance(x)[10];assert.equal(conditional.passed,false);
    assert.equal(conditional.criteria?.stockQty.actual,169);x.products[1].stockQty=170;
    x.products[0].salesUnits30=metric(222);assert.equal(evaluateCfoAcceptance(x).filter(c=>c.passed).length,11);
    x.channels=[];assert(!evaluateCfoAcceptance(x)[11].passed);
  });
  await check("shadow gate requires seven full reviewed days, zero AI and at most three false alarms/day",()=>{
    const runs=Array.from({length:168},(_,i)=>({periodKey:`2026-10-${String(3+Math.floor(i/24)).padStart(2,"0")}T${String(i%24).padStart(2,"0")}`,status:"ai_disabled",reasons:{anomalies:[] as Anomaly[]}}));
    const end=new Date("2026-10-10T00:00:00Z");assert(evaluateShadowWeek("2026-10-03",runs,[],0,end).passed);
    assert(!evaluateShadowWeek("2026-10-03",runs.slice(1),[],0,end).passed);assert(!evaluateShadowWeek("2026-10-03",runs,[],1,end).passed);
    assert(!evaluateShadowWeek("2026-10-03",runs,[],0,now).passed);
    runs[0].reasons.anomalies=[{...cash,fingerprint:"test"}];assert(!evaluateShadowWeek("2026-10-03",runs,[],0,end).passed);
    assert(evaluateShadowWeek("2026-10-03",runs,[{date:"2026-10-03",fingerprint:"test",verdict:"real"}],0,end).passed);
    runs[0].reasons.anomalies=Array.from({length:4},(_,i)=>({...cash,fingerprint:`alarm${i}`}));
    assert(!evaluateShadowWeek("2026-10-03",runs,runs[0].reasons.anomalies.map(a=>({date:"2026-10-03",fingerprint:a.fingerprint,verdict:"false_alarm"})),0,end).passed);
  });
  await check("additive migration creates snake-case tables and enables deny-all RLS",async()=>{
    const migration=readFileSync(new URL("../prisma/migrations/20261003000000_ai_cfo_v1/migration.sql",import.meta.url),"utf8");
    assert(!/drop\s|truncate\s|delete\s+from|update\s+cfo_/i.test(migration));
    await db.exec(migration);const r=await db.query<{relname:string;relrowsecurity:boolean}>("select relname,relrowsecurity from pg_class where relname in ('cfo_run','cfo_insight','cfo_usage')");assert.equal(r.rows.length,3);assert(r.rows.every(r=>r.relrowsecurity));
  });
  console.log(`\n${passed} AI CFO checks passed`);await db.close();
}
main().catch(async e=>{console.error(e);await db.close();process.exitCode=1;});
