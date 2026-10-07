import "server-only";
import { skuIndex, foldedSkuSql } from "./sku";
import { readCfoNotebook } from "./notebook";
import type { CfoConfig } from "./config";
import { getCfoConfig } from "./config";
import { CALCULATION_VERSION, SCHEMA_VERSION, type CfoAgentSnapshot, type Metric, type ProductSignal, type SalesPeriod, type SourceWatermark } from "./types";
import { contribution, cautiousDemand, D, divide, emptyProfitability, isDummyStock, measuredCommission, metric, numeric, orderAllocationSql, percentage, priceFloor, stale, unknown } from "./calculations";
const DIRECT_API_SOURCES=new Set(["Trendyol","Hepsiburada"]);
/** Entegra Excel and bank balances are uploaded by hand once a week (2026-10-07 decision): 7 days + 1 day grace.
 *  Periods the upload has not reached yet stay incomplete through the day-coverage check, so no false revenue drop. */
export const WEEKLY_UPLOAD_MAX_AGE_HOURS=8*24;
const maxAgeHours=(source:string)=>source==="Entegra"?WEEKLY_UPLOAD_MAX_AGE_HOURS:48;
import { evidence } from "./evidence";
import { businessSource, cashFunctions, SourceCatalog, sourceBindings, type ReadSource, type Row } from "./sources";
import { resolveCfoSourceProfile, reviewedCfoSources } from "./reviewed-sources";
import { assumedShippingChannel, shippingBandsFor, shippingChannelFor, shippingTariffSql, type ShippingOptions } from "./shipping";
import { istanbulPeriod } from "./budget";

const iso = (v:unknown) => v == null || !Number.isFinite(Date.parse(String(v))) ? null : new Date(String(v)).toISOString();
const n = (r:Row, key:string) => numeric(r[key]);
const periodKeys = ["lastHour","today","yesterday","last7Days","last30Days","monthToDate","previousDay","previous7","previous30"] as const;
// All boundaries are Istanbul-local and all comparisons align weekdays.
export const PERIOD_CTE = `with clock as (select $1::timestamptz at time zone 'Europe/Istanbul' as local_now), periods as (
  select 'lastHour' as period, date_trunc('hour',local_now)-interval '1 hour' as start_at,date_trunc('hour',local_now) as end_at from clock union all
  select 'today',date_trunc('day',local_now),local_now from clock union all
  select 'yesterday',date_trunc('day',local_now)-interval '1 day',date_trunc('day',local_now) from clock union all
  select 'last7Days',date_trunc('day',local_now)-interval '7 days',date_trunc('day',local_now) from clock union all
  select 'last30Days',date_trunc('day',local_now)-interval '30 days',date_trunc('day',local_now) from clock union all
  select 'monthToDate',date_trunc('month',local_now),local_now from clock union all
  select 'previousDay',date_trunc('day',local_now)-interval '8 days',date_trunc('day',local_now)-interval '7 days' from clock union all
  select 'previous7',date_trunc('day',local_now)-interval '14 days',date_trunc('day',local_now)-interval '7 days' from clock union all
  select 'previous30',date_trunc('day',local_now)-interval '65 days',date_trunc('day',local_now)-interval '35 days' from clock
)`;
function optionalSum(col:string|null, alias:string, table="s") {return col ? `case when count(${table}.${col})=count(*) then sum(${table}.${col}::numeric) end as "${alias}"` : `null::numeric as "${alias}"`;}

export async function buildCfoAgentSnapshot(options: {now?:Date;config?:CfoConfig;db?:ReadSource;bindings?:Record<string,Record<string,string>>;compact?:boolean;sourceProfile?:string} = {}): Promise<CfoAgentSnapshot> {
  const now=options.now??new Date(), config={...(options.config??getCfoConfig())}, db=options.db??businessSource;
  const reviewed=await reviewedCfoSources(db,options.sourceProfile??resolveCfoSourceProfile());
  const asOf=now.toISOString(), catalog=new SourceCatalog(db,options.bindings??(reviewed?.valid?reviewed.bindings:sourceBindings())); await catalog.load();
  const blankPeriod=():SalesPeriod=>({grossRevenue:unknown("source_unavailable"),orders:null,aov:unknown("source_unavailable"),complete:false});
  const snapshot:CfoAgentSnapshot={schemaVersion:SCHEMA_VERSION,calculationVersion:CALCULATION_VERSION,generatedAt:asOf,timezone:"Europe/Istanbul",currency:"TRY",accountingBasis:"gross_incl_vat",
    dataQuality:{staleSources:[],missingFields:[],costCoveragePct:null,matchingCoveragePct:null,sourceWatermarks:[],excludedDummyStock:0,zeroStockSkuCount:0,commissionCoverage:[],fbaInventoryUnknown:true,duplicateCanonicalRows:0,excludedUntrustedRows:0},
    sales:{lastHour:blankPeriod(),today:blankPeriod(),yesterday:blankPeriod(),last7Days:blankPeriod(),last30Days:blankPeriod(),monthToDate:blankPeriod(),comparisons:[]},
    profitability:emptyProfitability(),profitabilityByPeriod:{},channels:[],inventory:{costValue:unknown("incomplete_inventory_cost"),knownCostValue:unknown("source_unavailable"),retailValue:unknown("price_unavailable"),stockoutRiskValue:unknown("source_unavailable"),deadStockValue:unknown("source_unavailable")},products:[],deadStock:[],
    cash:{generalUnusedOverdraft:unknown("general_kmh_unavailable"),totalCardDebt:unknown("card_debt_unavailable"),activeCards:0,cash:unknown("cash_source_unavailable"),minimumProjectedPosition:unknown("projection_unavailable"),purposeLimit:unknown("purpose_limit_unavailable"),banksFresh:false,summaries:[]},
    procurement:{riskySkuCount:0,openOrders:null},importPipeline:{inboundSkuCount:null,coveragePct:unknown("inbound_coverage_unknown")},
    returns:{currentRate:unknown("returns_unavailable"),previousRate:unknown("returns_unavailable"),sample:0,complete:false},evidence:[]};
  snapshot.notebook = await readCfoNotebook(db, now);
  const missing=snapshot.dataQuality.missingFields;
  if(reviewed&&!reviewed.valid){missing.push(reviewed.reason);config.canonicalValidated=false;}
  if(!config.canonicalValidated) missing.push("canonical_sales_semantics_not_validated");
  const localTime=(source:string,field:string)=>catalog.localTime(source,field)??"null::timestamp";
  // Independent source event/ingestion watermarks. No raw orders are loaded.
  const watermarks=await db.query(`select 'Entegra' as source,max("orderDate") as event_at,max("importedAt") as ingest_at,
    count(distinct date_trunc('minute',"importedAt")) filter(where "importedAt">=$1::timestamptz-interval '7 days')::int as batches,
    count(distinct (${localTime("MarketplaceSalesRecord","orderDate")})::date) filter(where "orderDate">=$1::timestamptz-interval '30 days')::int as coverage_days,
    count(distinct (${localTime("MarketplaceSalesRecord","importedAt")})::date) filter(where "importedAt">=$1::timestamptz-interval '7 days')::int as batch_days
    from "MarketplaceSalesRecord" union all
    select 'Trendyol',max("orderDate"),max("syncedAt"),count(distinct date_trunc('minute',"syncedAt")) filter(where "syncedAt">=$1::timestamptz-interval '7 days')::int,
    count(distinct (${localTime("TrendyolSalesRecord","orderDate")})::date) filter(where "orderDate">=$1::timestamptz-interval '30 days')::int,
    count(distinct (${localTime("TrendyolSalesRecord","syncedAt")})::date) filter(where "syncedAt">=$1::timestamptz-interval '7 days')::int from "TrendyolSalesRecord" union all
    select 'Hepsiburada',max("orderDate"),max("syncedAt"),count(distinct date_trunc('minute',"syncedAt")) filter(where "syncedAt">=$1::timestamptz-interval '7 days')::int,
    count(distinct (${localTime("HepsiburadaSalesRecord","orderDate")})::date) filter(where "orderDate">=$1::timestamptz-interval '30 days')::int,
    count(distinct (${localTime("HepsiburadaSalesRecord","syncedAt")})::date) filter(where "syncedAt">=$1::timestamptz-interval '7 days')::int from "HepsiburadaSalesRecord" union all
    select 'XML',null,max("syncedAt"),count(distinct date_trunc('minute',"syncedAt")) filter(where "syncedAt">=$1::timestamptz-interval '7 days')::int,0,
    count(distinct (${localTime("XmlStockChangeLog","syncedAt")})::date) filter(where "syncedAt">=$1::timestamptz-interval '7 days')::int from "XmlStockChangeLog"`,asOf);
  // A direct marketplace API table that has never received a row is "not configured", not stale: its channel's sales
  // still arrive through Entegra (Hepsiburada: 0 direct rows, Entegra HEPSIBURADA rows present), so it is left out.
  snapshot.dataQuality.sourceWatermarks=watermarks.filter(r=>!(DIRECT_API_SOURCES.has(String(r.source))&&r.event_at==null&&r.ingest_at==null)).map(r=>({source:String(r.source),orderDate:iso(r.event_at),syncedAt:iso(r.ingest_at),batchDays:n(r,"batch_days")??0,coverageDays:n(r,"coverage_days")??0,
    stale:stale(iso(r.source==="XML"?r.ingest_at:r.event_at),now,maxAgeHours(String(r.source)))||stale(iso(r.ingest_at),now,maxAgeHours(String(r.source)))} satisfies SourceWatermark));
  snapshot.dataQuality.staleSources=snapshot.dataQuality.sourceWatermarks.filter(w=>w.stale).map(w=>w.source);
  const financialFresh=snapshot.dataQuality.sourceWatermarks.find(w=>w.source==="Entegra")?.stale===false && config.canonicalValidated;

  const orders=catalog.require("cfo_satis_siparis",["channel","orderNumber","orderDate","totalAmountTry"]);
  const orderLocalTime=catalog.localTime("cfo_satis_siparis","orderDate","s");
  if(orders&&orderLocalTime) {
    const rows=await db.query(`${PERIOD_CTE}, canonical as (select s.*,row_number() over(partition by ${orders.channel},${orders.orderNumber} order by ${orders.orderDate} desc) as rn,
      count(*) over(partition by ${orders.channel},${orders.orderNumber}) as copies from cfo_satis_siparis s)
      select p.period,count(distinct (s.${orders.channel},s.${orders.orderNumber})) filter(where s.rn=1)::int as orders,
      sum(s.${orders.totalAmountTry}::numeric) filter(where s.rn=1) as revenue,
      count(distinct (${orderLocalTime})::date)::int as days,
      count(*) filter(where s.copies>1)::int as duplicates
      from periods p left join canonical s on ${orderLocalTime}>=p.start_at and ${orderLocalTime}<p.end_at
      group by p.period`,asOf);
    for(const r of rows) {
      const key=String(r.period) as typeof periodKeys[number];
      if(!periodKeys.includes(key))continue;
      const count=n(r,"orders"), revenue=count===0?null:n(r,"revenue");
      const dup=n(r,"duplicates")??0; snapshot.dataQuality.duplicateCanonicalRows=Math.max(snapshot.dataQuality.duplicateCanonicalRows,dup);
      const expected=key==="last7Days"||key==="previous7"?7:key==="last30Days"||key==="previous30"?30:1;
      const complete=financialFresh && dup===0 && (n(r,"days")??0)>=expected;
      const period:SalesPeriod={grossRevenue:metric(config.canonicalValidated&&dup===0?revenue:null,false,!config.canonicalValidated?"canonical_unvalidated":dup?"duplicate_canonical_orders":revenue==null?"no_observations":undefined),orders:count,aov:metric(divide(revenue,count)),complete};
      if(key in snapshot.sales && !key.startsWith("previous")) (snapshot.sales as unknown as Record<string,unknown>)[key]=period;
    }
    for(const [current,previous] of [["yesterday","previousDay"],["last7Days","previous7"],["last30Days","previous30"]]) {
      const a=rows.find(r=>r.period===current),b=rows.find(r=>r.period===previous),days=current==="yesterday"?1:current==="last7Days"?7:30;
      snapshot.sales.comparisons.push({entity:"company",current:metric(config.canonicalValidated?n(a??{},"revenue"):null),previous:metric(config.canonicalValidated?n(b??{},"revenue"):null),
        complete:!!a&&!!b&&(n(a,"days")??0)>=days&&(n(b,"days")??0)>=days&&snapshot.dataQuality.duplicateCanonicalRows===0,sourceFresh:financialFresh,period:`${current}:${asOf.slice(0,10)}`});
    }
  }

  // Runtime-verified adapters for the live-only sources. Missing contracts yield
  // null and a precise data-quality item, never an invented fallback table.
  const shippingChannel=catalog.column("cfo_kargo_tarife","channel")??catalog.column("cfo_kargo_tarife","channel","pazaryeri"),shippingDate=catalog.column("cfo_kargo_tarife","effective_from")??catalog.column("cfo_kargo_tarife","effective_from","gecerli_tarih");
  let bandsRows=await catalog.rows("cfo_kargo_tarife",["min_try","max_try","kargo_try",...(shippingChannel?["channel"]:[]),...(shippingDate?["effective_from"]:[])],1000);
  if(bandsRows?.length===1000){bandsRows=null;missing.push("shipping_tariff_limit_unverified");}
  // Channel assumption (cfo_kargo_kanal_varsayim '*') and reviewed date corrections; unknown basis → no assumption.
  const shippingOptions:ShippingOptions={fallbackChannel:assumedShippingChannel(await catalog.rows("cfo_kargo_kanal_varsayim",["channel","cost_basis"],50)),
    effectiveRemap:reviewed?.valid?reviewed.shipping.effectiveRemap:undefined};
  const processingInShipping=!!reviewed?.valid&&reviewed.shipping.processingInShipping;
  const day=istanbulPeriod(now).date;
  const velocityRows=await catalog.rows("cfo_stok_hareket_hiz",["sku","gunluk_30g_ihtiyatli","tukenme_gun_ihtiyatli","hizlanma_katsayi"],10000);
  const velocityUnitCol=catalog.column("cfo_stok_hareket_hiz","adet30");
  const velocitySkuCol=catalog.column("cfo_stok_hareket_hiz","sku");
  const velocityUnits=velocityUnitCol&&velocitySkuCol?await db.query(`select ${velocitySkuCol} as sku,${velocityUnitCol} as units from cfo_stok_hareket_hiz`):[];
  const xmlUnits=new Map(velocityUnits.map(r=>[String(r.sku),metric(r.units,true,"xml_movement_not_confirmed_sales")]));
  if(!velocityUnitCol)missing.push("cfo_stok_hareket_hiz.adet30");
  const netRows=await catalog.rows("cfo_kanal_net_oran",["channel","net_oran","guven"],100);
  const netRatios=new Map((netRows??[]).map(r=>[String(r.channel),String(r.guven).normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toUpperCase()==="YUKSEK"&&n(r,"net_oran")!=null&&n(r,"net_oran")!>0&&n(r,"net_oran")!<1?metric(r.net_oran,true,"bank_statement_net_ratio"):unknown("settlement_ratio_low_confidence")]));
  const velocities=new Map((velocityRows??[]).map(r=>[String(r.sku),r]));
  const inboundRows=await catalog.rows("cfo_yolda_sku",["sku","yolda_adet","en_yakin_eta"],10000);
  const inbound=new Map((inboundRows??[]).map(r=>[String(r.sku),r]));
  snapshot.importPipeline.inboundSkuCount=inboundRows?.length??null;
  const pipeline=await catalog.rows("cfo_yoldaki_kapsam",["kapsam_pct"],100);
  if(pipeline?.length) snapshot.importPipeline.coveragePct=metric(Math.min(...pipeline.map(r=>n(r,"kapsam_pct")??0)));
  const exceptionRows=await catalog.rows("cfo_stok_istisna",["sku"],10000);
  const exceptions=new Set((exceptionRows??[]).map(r=>String(r.sku)));
  const components=await catalog.rows("cfo_set_bilesen_maliyet",["set_sku","maliyet_try"],10000);
  const sets=new Map<string,Metric>();
  for(const r of components??[]) {
    const sku=String(r.set_sku),old=sets.get(sku),cost=n(r,"maliyet_try");
    sets.set(sku,old?.value===null||cost==null?unknown("set_component_unknown"):metric(D(old?.value??0).add(cost).toNumber(),true));
  }
  // No component→set relation (BOM) exists: the set SKU's own computed cost in cfo_set_fiyat is used (reviewed binding only).
  if(!components&&catalog.column("cfo_set_fiyat","set_maliyet_try"))for(const r of await catalog.rows("cfo_set_fiyat",["sku","set_maliyet_try"],10000)??[]) {
    const sku=String(r.sku),cost=n(r,"set_maliyet_try");
    sets.set(sku,sets.has(sku)?unknown("ambiguous_set_cost_rows"):cost==null||cost<=0?unknown("set_cost_missing"):metric(cost,true,"set_price_view_cost"));
  }
  const setScopeColumn=catalog.column("cfo_set_fiyat","pazaryeri");
  const setPrices=await catalog.rows("cfo_set_fiyat",["sku","birim_kar_try",...(setScopeColumn?["pazaryeri"]:[])],10000);
  const setSkuRows=await catalog.rows("cfo_set_fiyat",["sku"],10000);
  const setSkus=new Set((setSkuRows??[]).map(r=>String(r.sku)));
  const setProfits=new Map<string,Metric>();
  const setScopes=new Map<string,Set<string>>();
  for(const r of setPrices??[]) {
    const sku=String(r.sku);
    setProfits.set(sku,setProfits.has(sku)?unknown("ambiguous_set_profit_rows"):metric(r.birim_kar_try,true,"set_price_view_estimate"));
    if(setScopeColumn)setScopes.set(sku,new Set(typeof r.pazaryeri==='string'?r.pazaryeri.split('+').map(s=>s.trim()):[]));
  }

  const po=await db.query(`select i."productId" as product_id,count(*)::int as open_orders,sum(i.qty)::numeric as qty,min(p."estimatedArrival") as eta
    from "PurchaseOrderItem" i join "PurchaseOrder" p on p.id=i."orderId"
    where p.status::text in ('DRAFT','CONFIRMED','ORDERED','SHIPPED') group by i."productId"`);
  const pos=new Map(po.map(r=>[String(r.product_id),r])); snapshot.procurement.openOrders=po.reduce((s,r)=>s+(n(r,"open_orders")??0),0);
  const catalogProducts=await db.query(`select id,sku,"isActive" as active,"stockQuantity" as stock,"unitCostTry" as cost,"weightKg" as weight,"productKind"::text as kind,"mainProductId" as parent,"sellingPriceTry" as price from "Product"`);
  const products=catalogProducts.filter(p=>p.active!==false);
  const bySku=new Map(products.map(r=>[String(r.sku),r]));
  const productLookup=skuIndex(catalogProducts,r=>String(r.sku));
  const velocityLookup=skuIndex(velocityRows??[],r=>String(r.sku));
  const xmlLookup=skuIndex(velocityUnits,r=>String(r.sku));
  const inboundLookup=skuIndex(inboundRows??[],r=>String(r.sku));
  const xmlFresh=snapshot.dataQuality.sourceWatermarks.find(w=>w.source==="XML")?.stale===false;
  // Channel freshness uses the channel's direct source when it is configured, otherwise Entegra (where that channel's sales come from).
  const channelFresh=(channel:string)=>{const wm=snapshot.dataQuality.sourceWatermarks,direct=({TRENDYOL:"Trendyol",HEPSIBURADA:"Hepsiburada",INVENTORY:"XML"} as Record<string,string>)[channel];
    return (wm.find(w=>w.source===direct)??wm.find(w=>w.source==="Entegra"))?.stale===false;};
  let knownValue=D(0),retailValue=D(0),unknownCost=0,unknownRetail=0;
  for(const p of products) {
    const stock=n(p,"stock");if(stock==null)continue;
    if(stock===0)snapshot.dataQuality.zeroStockSkuCount++;
    if(isDummyStock(stock)){snapshot.dataQuality.excludedDummyStock++;continue;}
    if(exceptions.has(String(p.sku))||p.kind==="LISTING_PACKAGE")continue;
    const cost=setSkus.has(String(p.sku))||sets.has(String(p.sku))?(sets.get(String(p.sku))?.value??null):n(p,"cost");
    if(stock>0&&cost==null)unknownCost++;else if(cost!=null)knownValue=knownValue.add(D(stock).mul(cost));
    if(stock>0&&n(p,"price")==null)unknownRetail++;else if(n(p,"price")!=null)retailValue=retailValue.add(D(stock).mul(n(p,"price")!));
  }
  snapshot.inventory.knownCostValue=metric(knownValue.toNumber(),true);
  snapshot.inventory.costValue=unknownCost?unknown("inventory_cost_incomplete"):metric(knownValue.toNumber(),true);
  snapshot.inventory.retailValue=unknownRetail?unknown("inventory_price_incomplete"):metric(retailValue.toNumber(),true);
  if(unknownCost)missing.push(`inventory_cost_unknown:${unknownCost}`);
  if(!exceptionRows) {snapshot.inventory.costValue=unknown("stock_exceptions_unavailable");missing.push("inventory_exclusions_unverified");}

  const sales=catalog.require("cfo_satis_birim_duz",["channel","modelNumber","orderNumber","orderDate","adet_duz","tutar_duz","guven","commissionTry","totalAmountTry"]);
  const salesLocalTime=catalog.localTime("cfo_satis_birim_duz","orderDate","s");
  if(sales&&salesLocalTime) {
    const vat=catalog.column("cfo_satis_birim_duz","vatAmountTry"),refund=catalog.column("cfo_satis_birim_duz","refundTry"),ads=catalog.column("cfo_satis_birim_duz","advertisingTry");
    const actualShipping=catalog.column("cfo_satis_birim_duz","allocatedShippingTry"),other=catalog.column("cfo_satis_birim_duz","allocatedOtherVariableTry");
    const returned=catalog.column("cfo_satis_birim_duz","returnedUnits");
    const bandCols=bandsRows?catalog.require("cfo_kargo_tarife",["min_try","max_try","kargo_try"]):null;
    const orderTotal=orders?`(select case when count(*)=1 then max(o.${orders.totalAmountTry}::numeric) end from cfo_satis_siparis o where o.${orders.channel}=s.${sales.channel} and o.${orders.orderNumber}=s.${sales.orderNumber})`:"null::numeric";
    const tariff=bandCols?shippingTariffSql(bandCols,orderTotal,`s.${sales.channel}`,salesLocalTime,{channel:shippingChannel,effectiveFrom:shippingDate},shippingOptions):"null::numeric";
    const shippingAllocation=orderAllocationSql(tariff,`s.${sales.tutar_duz}`,"s.order_line_gross","s.order_complete");
    const packaging=`case when s.order_weight_known then case when s.order_weight<=0.5 then 10.00 else 18.74 end${processingInShipping?"":" + 12.29"} + 10.00 end`;
    const otherAllocation=orderAllocationSql(packaging,`s.${sales.tutar_duz}`,"s.order_line_gross","s.order_complete");
    const rows=await db.query(`${PERIOD_CTE}, product_keys as (select pr.*, count(*) over(partition by ${foldedSkuSql("pr.sku")}) as key_count from "Product" pr), canonical_base as (select s.*,count(*) over(partition by ${sales.channel},${sales.orderNumber},${sales.modelNumber}) as copies,
      sum(s.${sales.tutar_duz}::numeric) over(partition by s.${sales.channel},s.${sales.orderNumber}) as order_line_gross,
      bool_and(s.${sales.guven} is not null and s.${sales.guven}::text not in ('KARMA','BILINMIYOR')) over(partition by s.${sales.channel},s.${sales.orderNumber}) as order_complete,
      bool_and(pr."weightKg" is not null) over(partition by s.${sales.channel},s.${sales.orderNumber}) as order_weight_known,
      sum(pr."weightKg"*s.${sales.adet_duz}) over(partition by s.${sales.channel},s.${sales.orderNumber}) as order_weight
      from cfo_satis_birim_duz s left join product_keys pr on pr.sku=s.${sales.modelNumber} or (pr.key_count=1 and ${foldedSkuSql("pr.sku")}= ${foldedSkuSql("s."+sales.modelNumber)} and not exists(select 1 from "Product" exact where exact.sku=s.${sales.modelNumber}))
      where ${salesLocalTime}>=date_trunc('day',$1::timestamptz at time zone 'Europe/Istanbul')-interval '65 days' and ${sales.adet_duz}>0),
      commission_samples as (select s.${sales.channel} as channel,s.${sales.modelNumber} as sku,percentile_cont(0.5) within group(order by s.${sales.commissionTry}::numeric/nullif(s.${sales.totalAmountTry}::numeric,0)) as median_rate
      from canonical_base s where s.${sales.commissionTry}>0 and s.${sales.totalAmountTry}>0 group by 1,2),
      commission_deviation as (select s.${sales.channel} as channel,s.${sales.modelNumber} as sku,c.median_rate,percentile_cont(0.5) within group(order by abs(s.${sales.commissionTry}::numeric/nullif(s.${sales.totalAmountTry}::numeric,0)-c.median_rate)) as mad
      from canonical_base s join commission_samples c on c.channel=s.${sales.channel} and c.sku=s.${sales.modelNumber} where s.${sales.commissionTry}>0 and s.${sales.totalAmountTry}>0 group by 1,2,3),
      canonical as (select s.*,s.${sales.commissionTry}>0 and s.${sales.totalAmountTry}>0 and abs(s.${sales.commissionTry}::numeric/nullif(s.${sales.totalAmountTry}::numeric,0)-d.median_rate)<=greatest(0.05,3*d.mad) as commission_valid,${actualShipping?`s.${actualShipping}`:shippingAllocation} as agent_shipping,
        ${other?`s.${other}`:otherAllocation} as agent_other from canonical_base s left join commission_deviation d on d.channel=s.${sales.channel} and d.sku=s.${sales.modelNumber}), grouped as (
      select ${sales.channel} as channel,${sales.modelNumber} as sku,
      case when p.period='last30Days' then 'current' when p.period='previous30' then 'previous' else p.period end as period,
      count(*)::int as records,sum(${sales.adet_duz}::numeric) as units,sum(${sales.tutar_duz}::numeric) as revenue,
      sum(${sales.commissionTry}::numeric) filter(where commission_valid) as commission,sum(${sales.totalAmountTry}::numeric) filter(where commission_valid) as commission_gross,
      count(*) filter(where commission_valid)::int as commission_records,
      count(*) filter(where ${sales.commissionTry} is not null)::int as commission_present,
      count(*) filter(where ${sales.commissionTry}>0 and not commission_valid)::int as commission_outliers,
      count(*) filter(where ${sales.guven} is null or ${sales.guven}::text in ('KARMA','BILINMIYOR'))::int as untrusted,
      count(*) filter(where copies>1)::int as duplicates,
      ${optionalSum(vat,"vat")},${optionalSum(refund,"refund")},${optionalSum(ads,"ads")},
      case when count(agent_shipping)=count(*) then sum(agent_shipping::numeric) end as shipping,
      case when count(agent_other)=count(*) then sum(agent_other::numeric) end as other,${optionalSum(returned,"returned")}
      from canonical s join periods p on ${salesLocalTime}>=p.start_at and ${salesLocalTime}<p.end_at
      where p.period in ('last30Days','previous30','today','yesterday','last7Days','monthToDate')
      group by 1,2,3) select * from grouped`,asOf);
    // Commission measurements use the audited 120-day window independently
    // of the sales periods. Revenue/quantity still use corrected canonical rows.
    // Sample rule (user-confirmed 2026-10-06): only single-unit lines (adet_duz=1) with guven='YUKSEK', no duplicate copies,
    // window [asOf-120 days, asOf] fixed to the snapshot's asOf ($1, never now()), and >=10 accepted records per SKU
    // (measuredCommission). Multi-unit, set-corrected (SET_DUZELTILDI), KARMA and BILINMIYOR lines never set the rate.
    const commissionRows=await db.query(`with base as (
      select s.*,count(*) over(partition by ${sales.channel},${sales.orderNumber},${sales.modelNumber}) as copies
      from cfo_satis_birim_duz s where ${salesLocalTime}>=date_trunc('day',$1::timestamptz at time zone 'Europe/Istanbul')-interval '120 days' and ${salesLocalTime}<=($1::timestamptz at time zone 'Europe/Istanbul') and ${sales.adet_duz}>0),
      valid as(select * from base where copies=1 and ${sales.adet_duz}=1 and ${sales.guven}::text='YUKSEK'),
      med as(select ${sales.channel} as channel,${sales.modelNumber} as sku,percentile_cont(0.5) within group(order by ${sales.commissionTry}::numeric/nullif(${sales.totalAmountTry}::numeric,0)) as mid
        from valid where ${sales.commissionTry}>0 and ${sales.totalAmountTry}>0 group by 1,2),
      deviation as(select v.${sales.channel} as channel,v.${sales.modelNumber} as sku,m.mid,percentile_cont(0.5) within group(order by abs(v.${sales.commissionTry}::numeric/nullif(v.${sales.totalAmountTry}::numeric,0)-m.mid)) as mad
        from valid v join med m on m.channel=v.${sales.channel} and m.sku=v.${sales.modelNumber} where v.${sales.commissionTry}>0 and v.${sales.totalAmountTry}>0 group by 1,2,3),
      checked as(select v.*,v.copies=1 and v.${sales.adet_duz}=1 and v.${sales.guven}::text='YUKSEK' as eligible,v.copies=1 and v.${sales.adet_duz}=1 and v.${sales.guven}::text='YUKSEK' and v.${sales.commissionTry}>0 and v.${sales.totalAmountTry}>0 and abs(v.${sales.commissionTry}::numeric/nullif(v.${sales.totalAmountTry}::numeric,0)-d.mid)<=greatest(0.05,3*d.mad) as ok
        from base v left join deviation d on d.channel=v.${sales.channel} and d.sku=v.${sales.modelNumber})
      select ${sales.channel} as channel,${sales.modelNumber} as sku,count(*)::int as records,count(${sales.commissionTry})::int as present,
        count(*) filter(where ok)::int as accepted,sum(${sales.commissionTry}::numeric) filter(where ok) as commission,
        sum(${sales.totalAmountTry}::numeric) filter(where ok) as gross,count(*) filter(where eligible and ${sales.commissionTry}>0 and ${sales.totalAmountTry}>0 and not ok)::int as outliers
      from checked group by grouping sets((${sales.channel},${sales.modelNumber}),(${sales.channel}))`,asOf);
    const channelMeasurements=new Map(commissionRows.filter(r=>r.sku==null).map(r=>[String(r.channel),r]));
    const skuMeasurements=new Map(commissionRows.filter(r=>r.sku!=null).map(r=>[`${r.channel}:${r.sku}`,r]));
    for(const [channel,c] of channelMeasurements)snapshot.dataQuality.commissionCoverage.push({channel,coveragePct:percentage(n(c,"present"),n(c,"records")),outliers:n(c,"outliers")??0});
    const unitsBySku=new Map<string,number>();for(const r of rows)if(r.period==="current"&&(n(r,"untrusted")??0)===0&&(n(r,"duplicates")??0)===0)unitsBySku.set(String(r.sku),D(unitsBySku.get(String(r.sku))??0).add(n(r,"units")??0).toNumber());
    let costRows=0,matchedRows=0,totalRows=0;
    const profits:{channel:string;sku:string;period:string;profit:ReturnType<typeof contribution>}[]=[];
    // Previous rows must be evaluated first; association is by SKU AND channel.
    for(const r of [...rows].sort((a,b)=>a.period==="previous"?-1:b.period==="previous"?1:0)) {
      const sku=String(r.sku),p=productLookup.get(sku),channel=String(r.channel),units=n(r,"units"),revenue=n(r,"revenue"),ch=channelMeasurements.get(channel),cm=skuMeasurements.get(`${channel}:${sku}`);
      const trusted=(n(r,"untrusted")??0)===0&&(n(r,"duplicates")??0)===0&&config.canonicalValidated;
      const isSet=sets.has(sku)||p?.kind==="LISTING_PACKAGE"||setSkus.has(sku);
      const cost=isSet?(sets.get(sku)??unknown("set_components_unavailable")):metric(p?.cost,true,"current_cost_estimate");
      const commission=measuredCommission(channel,n(cm??{},"accepted")??0,n(cm??{},"commission"),n(cm??{},"gross"),null,null,percentage(n(ch??{},"present"),n(ch??{},"records"))??0);
      const avgPrice=metric(trusted?divide(revenue,units):null,false,trusted?undefined:"untrusted_sku_grain");
      const profit=contribution({grossRevenue:metric(trusted?revenue:null),vat:metric(r.vat),refunds:metric(r.refund),advertising:metric(r.ads),
        productCost:metric(!isSet&&trusted&&cost.value!=null&&units!=null?D(cost.value).mul(units).toNumber():null,true),
        commission:metric(trusted&&commission.value!=null&&revenue!=null?D(revenue).mul(commission.value).toNumber():null,commission.estimated,commission.reason),
        shipping:metric(r.shipping,!actualShipping),otherVariableCosts:metric(r.other,!other)},config.grossIncludesRefunds);
      profits.push({channel,sku,period:String(r.period),profit});
      if(r.period!=="current")continue;
      const records=n(r,"records")??0;totalRows+=records;if(p)matchedRows+=records;if(cost.value!=null&&trusted)costRows+=records;
      snapshot.dataQuality.excludedUntrustedRows+=n(r,"untrusted")??0;
      snapshot.dataQuality.duplicateCanonicalRows+=n(r,"duplicates")??0;
      if(isSet&&cost.value==null)missing.push(`set_component_unknown:${sku}`);
      const v=velocityLookup.get(sku),inb=inboundLookup.get(sku),open=p?pos.get(String(p.id)):undefined;
      const excluded=!p||p.active===false||(p&&isDummyStock(n(p,"stock")??0))||exceptions.has(sku)||!exceptionRows;
      // FBA units sit in Amazon warehouses: our XML stock/velocity says nothing about them while FBA inventory is unknown.
      const fbaUnknown=channel==="AMAZON_FBA"&&snapshot.dataQuality.fbaInventoryUnknown;
      const stockDays=excluded?unknown("dummy_or_unverified_inventory"):fbaUnknown?unknown("fba_inventory_unknown"):metric(v?.tukenme_gun_ihtiyatli,true,"cautious_stock_movement_estimate");
      const xmlVelocity=excluded?unknown("dummy_or_unverified_inventory"):metric(v?.gunluk_30g_ihtiyatli,true,"cautious_stock_movement_estimate");
      const salesUnits30=trusted?metric(unitsBySku.get(sku)):unknown("untrusted_sku_grain"),xmlUnits30=xmlLookup.get(sku)?metric(xmlLookup.get(sku)!.units,true,"xml_movement_not_confirmed_sales"):unknown("xml_units_unavailable");
      const demand=cautiousDemand(salesUnits30,xmlUnits30,xmlVelocity,snapshot.sales.last30Days.complete);
      const velocity=demand.velocity;
      const prev=rows.find(x=>x.period==="previous"&&x.sku===r.sku&&x.channel===r.channel);
      const prevProfit=profits.find(x=>x.period==="previous"&&x.channel===channel&&x.sku===sku)?.profit;
      const priced=shippingChannelFor(bandsRows??[],channel,shippingOptions),bands=shippingBandsFor(bandsRows??[],priced.channel,day,shippingOptions);
      const assumed=(m:Metric)=>priced.assumed&&m.value!=null?metric(m.value,true,`shipping_channel_assumption:${priced.channel}`):m;
      const floor=channel==="MIRAKL_KOCTAS"?unknown("commission_unavailable"):assumed(priceFloor(cost.value,commission.value,n(p??{},"weight"),bands,processingInShipping));
      const signal:ProductSignal={sku,channel,isSet,trusted,sourceFresh:channelFresh(channel),financialSourceFresh:financialFresh,inventorySourceFresh:xmlFresh,catalogSku:p?String(p.sku):undefined,cost,avgPrice,commissionRate:commission,commissionSamples:n(cm??{},"accepted")??0,priceFloor:floor,
        zeroCommissionFloor:assumed(priceFloor(cost.value,0,n(p??{},"weight"),bands,processingInShipping)),
        unitProfit:isSet?(cost.value==null?unknown("set_component_unknown"):setScopes.has(sku)&&!setScopes.get(sku)!.has(channel)?unknown("set_profit_channel_unavailable"):setProfits.get(sku)??unknown("set_profit_unavailable")):metric(divide(profit.contributionProfit.value,units),profit.contributionProfit.estimated),
        previousUnitProfit:isSet?unknown("set_historical_profit_unavailable"):metric(divide(prevProfit?.contributionProfit.value??null,n(prev??{},"units"))),contribution:isSet?unknown("set_profit_use_price_view"):profit.contributionProfit,
        previousMargin:prevProfit?.contributionMargin??unknown("previous_contribution_unavailable"),margin:profit.contributionMargin,
        salesUnits30,xmlUnits30,salesVelocity:demand.salesVelocity,xmlVelocity,velocityGapPct:demand.gap,velocity,stockDays,stockQty:excluded?null:n(p??{},"stock"),inboundQty:inb?n(inb,"yolda_adet"):inboundRows?0:null,inboundEta:iso(inb?.en_yakin_eta),
        inboundBeforeStockout:stockDays.value!=null&&inb?.en_yakin_eta!=null&&Date.parse(String(inb.en_yakin_eta))<=now.getTime()+stockDays.value*86400000,
        openPurchaseOrders:open?n(open,"open_orders"):0,momentum:metric(numeric(v?.hizlanma_katsayi),true),pricePeriod:asOf.slice(0,7)};
      snapshot.products.push(signal);
    }
    snapshot.dataQuality.costCoveragePct=percentage(costRows,totalRows);snapshot.dataQuality.matchingCoveragePct=percentage(matchedRows,totalRows);
    const aggregate=(entries:typeof profits)=>{
      const keys=["grossRevenue","vat","refunds","productCost","commission","shipping","advertising","otherVariableCosts"] as const;
      const data=Object.fromEntries(keys.map(k=>{const ms=entries.map(e=>e.profit[k]);return [k,metric(ms.length&&ms.every(m=>m.value!=null)?ms.reduce((s,m)=>s.add(m.value!),D(0)).toNumber():null,ms.some(m=>m.estimated))];}));
      return contribution(data as Parameters<typeof contribution>[0],config.grossIncludesRefunds);
    };
    snapshot.profitability=aggregate(profits.filter(p=>p.period==="current"));
    for(const period of ["today","yesterday","last7Days","monthToDate"])snapshot.profitabilityByPeriod[period]=aggregate(profits.filter(p=>p.period===period));
    for(const channel of new Set(profits.map(p=>p.channel)))snapshot.channels.push({channel,profitability:aggregate(profits.filter(p=>p.period==="current"&&p.channel===channel)),previousMargin:aggregate(profits.filter(p=>p.period==="previous"&&p.channel===channel)).contributionMargin,sourceFresh:financialFresh,netSettlementRatio:netRatios.get(channel)??unknown("settlement_ratio_unavailable"),estimatedNetReceipts:metric(netRatios.get(channel)?.value!=null&&aggregate(profits.filter(p=>p.period==="current"&&p.channel===channel)).grossRevenue.value!=null?D(aggregate(profits.filter(p=>p.period==="current"&&p.channel===channel)).grossRevenue.value!).mul(netRatios.get(channel)!.value!).toNumber():null,true,"bank_statement_net_ratio_not_commission")});
    const currentReturns=rows.filter(r=>r.period==="current"),previousReturns=rows.filter(r=>r.period==="previous");
    if(currentReturns.length&&previousReturns.length&&[...currentReturns,...previousReturns].every(r=>n(r,"returned")!=null&&n(r,"units")!=null&&(n(r,"untrusted")??0)===0&&(n(r,"duplicates")??0)===0)) {
      const total=(rs:Row[],key:string)=>rs.reduce((s,r)=>s.add(n(r,key)!),D(0)).toNumber();
      snapshot.returns={currentRate:metric(percentage(total(currentReturns,"returned"),total(currentReturns,"units"))),previousRate:metric(percentage(total(previousReturns,"returned"),total(previousReturns,"units"))),sample:total(currentReturns,"units"),complete:financialFresh&&snapshot.sales.comparisons.find(c=>c.period.startsWith("last30Days"))?.complete===true};
    }
  }
  // Inventory-only SKUs also need cautious stock coverage; a missing Entegra
  // row must never make a stockout disappear from the deterministic monitor.
  const represented=new Set(snapshot.products.map(p=>p.catalogSku??p.sku));
  for(const [sku,p] of bySku)if(!represented.has(sku)) {
    const v=velocities.get(sku),inb=inbound.get(sku),open=pos.get(String(p.id));
    if(!v||isDummyStock(n(p,"stock")??0)||exceptions.has(sku)||!exceptionRows||p.kind==="LISTING_PACKAGE"||setSkus.has(sku))continue;
    const xmlVelocity=metric(v.gunluk_30g_ihtiyatli,true,"cautious_stock_movement_estimate"),xmlUnits30=xmlUnits.get(sku)??unknown("xml_units_unavailable"),u=unknown("canonical_sku_sales_unavailable");
    snapshot.products.push({sku,channel:"INVENTORY",isSet:false,trusted:true,sourceFresh:xmlFresh,financialSourceFresh:false,inventorySourceFresh:xmlFresh,catalogSku:sku,cost:metric(p.cost,true),avgPrice:u,commissionRate:u,commissionSamples:0,priceFloor:u,zeroCommissionFloor:u,
      unitProfit:u,previousUnitProfit:u,contribution:u,previousMargin:u,margin:u,salesUnits30:u,xmlUnits30,salesVelocity:u,xmlVelocity,velocityGapPct:u,velocity:xmlVelocity,
      stockDays:metric(v.tukenme_gun_ihtiyatli,true),stockQty:n(p,"stock"),inboundQty:inb?n(inb,"yolda_adet"):inboundRows?0:null,inboundEta:iso(inb?.en_yakin_eta),
      inboundBeforeStockout:n(v,"tukenme_gun_ihtiyatli")!=null&&inb?.en_yakin_eta!=null&&Date.parse(String(inb.en_yakin_eta))<=now.getTime()+n(v,"tukenme_gun_ihtiyatli")!*86400000,
      openPurchaseOrders:open?n(open,"open_orders"):0,momentum:metric(v.hizlanma_katsayi,true),pricePeriod:asOf.slice(0,7)});
  }
  const dead=await catalog.rows("cfo_olu_stok",["sku","bagli_sermaye","deger_kaynagi","alarm","bulgu_id"],10000);
  snapshot.deadStock=(dead??[]).filter(r=>!exceptions.has(String(r.sku))&&!isDummyStock(n(bySku.get(String(r.sku))??{},"stock")??0)).map(r=>({sku:String(r.sku),value:r.deger_kaynagi==="MALIYET"?metric(r.bagli_sermaye,true):unknown("dead_stock_cost_unavailable"),alarm:String(r.alarm),findingId:r.bulgu_id==null?null:String(r.bulgu_id)}));
  snapshot.inventory.deadStockValue=metric(dead&&snapshot.deadStock.every(r=>r.value.value!=null)?snapshot.deadStock.reduce((s,r)=>s.add(r.value.value!),D(0)).toNumber():null,true);
  const risks=snapshot.products.filter(p=>p.stockDays.value!=null&&p.stockDays.value<config.stockoutDays);
  const uniqueRisks=[...new Map(risks.map(p=>[p.sku,p])).values()];
  snapshot.inventory.stockoutRiskValue=metric(velocityRows&&sales&&exceptionRows&&uniqueRisks.every(p=>p.cost.value!=null&&p.stockQty!=null)?uniqueRisks.reduce((s,p)=>s.add(D(p.cost.value!).mul(p.stockQty!)),D(0)).toNumber():null,true);
  snapshot.procurement.riskySkuCount=new Set(risks.map(p=>p.sku)).size;

  const banks=await db.query(`select count(*)::int as accounts,count("balanceTry")::int as balances,count("lastUpdatedAt")::int as timestamps,min("lastUpdatedAt") as oldest,max("lastUpdatedAt") as latest from cfo_bank_account where "isActive"`);
  snapshot.cash.banksFresh=(n(banks[0]??{},"accounts")??0)>0&&n(banks[0],"accounts")===n(banks[0],"balances")&&n(banks[0],"accounts")===n(banks[0],"timestamps")&&!stale(iso(banks[0]?.oldest),now,WEEKLY_UPLOAD_MAX_AGE_HOURS);
  snapshot.dataQuality.sourceWatermarks.push({source:"banks",orderDate:null,syncedAt:iso(banks[0]?.latest),batchDays:0,coverageDays:0,stale:!snapshot.cash.banksFresh});
  if(!snapshot.cash.banksFresh)snapshot.dataQuality.staleSources.push("banks");
  const gate=await catalog.rows("cfo_nakit_kapisi",["nakit_try","bos_kmh_try"],1);
  const purpose=await catalog.rows("cfo_nakit_kapisi",["amac_kmh"],1);
  const cards=await db.query(`select count(*)::int as count,case when count("totalDebtTry")=count(*) then sum("totalDebtTry") end as debt from cfo_credit_card where "isActive"`);
  snapshot.cash.totalCardDebt=metric(cards[0]?.debt);snapshot.cash.activeCards=n(cards[0]??{},"count")??0;
  snapshot.cash.cash=metric(gate?.[0]?.nakit_try);snapshot.cash.generalUnusedOverdraft=metric(gate?.[0]?.bos_kmh_try);snapshot.cash.purposeLimit=metric(purpose?.[0]?.amac_kmh);
  const functions=await cashFunctions(db,missing);
  // Cash output fields are explicitly configured by name; no guessed balance
  // column can silently turn borrowing capacity into cash.
  const positionKey=reviewed?(reviewed.valid?reviewed.projectionPositionColumn:undefined):process.env.AI_CFO_PROJECTION_POSITION_COLUMN;
  if(positionKey&&functions.cfo_nakit_projeksiyon?.length) {
    const values=functions.cfo_nakit_projeksiyon.map(r=>numeric(r[positionKey]));
    snapshot.cash.minimumProjectedPosition=values.every(v=>v!=null)?metric(Math.min(...values as number[]),true,"projection_bank_cash_plus_receivables_and_estimated_collections_excludes_overdraft"):unknown("projection_column_unavailable");
  } else missing.push("projection_position_column_unvalidated");
  // Read existing payment/wealth sources; only numeric aggregates reach snapshot.
  const payments=await catalog.rows("cfo_odeme_gunluk",["kalan_gun","cikacak","girecek"],200);
  const wealth=await catalog.rows("cfo_servet",["servet_try","servet_usd"],1);
  await catalog.rows("cfo_servet_kalem",["tutar"],50); await catalog.rows("cfo_servet_likidite",["net_deger"],10);
  if(payments)for(const field of ["cikacak","girecek"]) {
    const due=payments.filter(r=>(n(r,"kalan_gun")??-1)>=0&&(n(r,"kalan_gun")??99)<=10);
    const value=due.length&&due.every(r=>n(r,field)!=null)?due.reduce((s,r)=>s.add(n(r,field)!),D(0)).toNumber():null;
    snapshot.cash.summaries.push(evidence("cfo_odeme_gunluk",`next10.${field}`,value,"TRY",asOf,false));
  }
  if(wealth?.length)snapshot.cash.summaries.push(evidence("cfo_servet","servet_try",n(wealth[0],"servet_try"),"TRY",asOf,false));
  for(const [source,rows] of Object.entries(functions))if(source!=="cfo_nakit_projeksiyon") {
    // Audit counts are safe; free text/notes/account identifiers are excluded.
    snapshot.cash.summaries.push(evidence(source,"row_count",rows.length,"count",asOf,true));
  }
  if(!snapshot.channels.length)missing.push("sku_profitability_unavailable");
  for(const [key,m] of Object.entries(snapshot.profitability))if(m.value==null)missing.push(`profitability.${key}`);
  missing.push(...catalog.missing);snapshot.dataQuality.missingFields=[...new Set(missing)].sort();
  // Keep snapshot compact while prioritizing cash and actionable SKU risks.
  snapshot.products.sort((a,b)=>(a.priceFloor.value!=null&&a.avgPrice.value!=null&&a.avgPrice.value<a.priceFloor.value?-100:0)+(a.stockDays.value??9999)-((b.priceFloor.value!=null&&b.avgPrice.value!=null&&b.avgPrice.value<b.priceFloor.value?-100:0)+(b.stockDays.value??9999)));
  if(options.compact!==false)snapshot.products=snapshot.products.slice(0,12);snapshot.deadStock=snapshot.deadStock.sort((a,b)=>(b.value.value??0)-(a.value.value??0)).slice(0,5);
  return snapshot;
}
