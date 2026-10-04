import { skuIndex } from "./sku";
import { productPolicy } from "./product-policy";
import type { CfoAgentSnapshot } from "./types";
import type { ReadSource, Row } from "./sources";

/** Missing cost limits that SKU's calculations; it never disables all observations. */
export function operatingCapabilities(snapshot: CfoAgentSnapshot, inactiveSkus: Set<string> = new Set(), recordedCosts: Map<string, Row> = new Map()) {
  const costLookup=skuIndex([...recordedCosts.values()],row=>String(row.sku));
  const products = snapshot.products.map(p => {
    const recorded = costLookup.get(p.catalogSku??p.sku);
    const resolvedSku=recorded?String(recorded.sku):p.catalogSku??p.sku;
    const excluded = inactiveSkus.has(resolvedSku);
    const policy=productPolicy(recorded);
    const known = (value: number | null) => value !== null && Number.isFinite(value);

    const recordedCostAvailable = Boolean(recorded && [recorded.costTry,recorded.costUsd,recorded.importCostUsd].some(v=>v!==null && v!==undefined && Number.isFinite(Number(v)) && Number(v)>=0));
    const recordedTry=recorded?.costTry==null?null:Number(recorded.costTry);
    const costTry=p.cost.value??(!p.isSet&&recordedTry!==null&&Number.isFinite(recordedTry)&&recordedTry>=0?recordedTry:null);
    const costKnown = known(costTry) && costTry! >= 0;
    return { sku: p.sku, channel: p.channel, resolvedSku, excluded, ...policy, costKnown, recordedCostAvailable, costTry,
      sourceFresh: p.sourceFresh, financialSourceFresh:p.financialSourceFresh??p.sourceFresh, inventorySourceFresh:p.inventorySourceFresh??p.sourceFresh, trusted: p.trusted,
      priceFloorTry: !excluded && p.trusted ? p.priceFloor.value : null,
      contributionProfitTry: !excluded && p.trusted ? p.contribution.value : null,
      salesUnits30: p.salesUnits30.value, xmlUnits30: p.xmlUnits30.value,
      stockDays: p.stockDays.value, stockQty:p.stockQty, velocity:p.velocity?.value??null,
      unitProfitTry:p.unitProfit?.value??null, avgPriceTry:p.avgPrice?.value??null,
      inboundQty:p.inboundQty,inboundEta:p.inboundEta,inboundBeforeStockout:p.inboundBeforeStockout,openPurchaseOrders:p.openPurchaseOrders,
      missing: excluded ? [] : [...(!costKnown ? ['product_cost'] : []),
        ...(p.priceFloor.value === null ? ['price_floor_inputs'] : []),
        ...(p.contribution.value === null ? ['profitability_inputs'] : [])],
      costReconciliationNeeded: !excluded && !costKnown && recordedCostAvailable,
      costQuestionNeeded: !excluded && !costKnown && !recordedCostAvailable && policy.procurementAllowed && p.trusted && (p.salesUnits30.value ?? 0) > 0 };
  });
  const active = products.filter(p => !p.excluded);
  const unique = (rows: typeof products) => new Set(rows.map(p=>p.resolvedSku)).size;
  const questions = new Map<string,{sku:string;channels:string[];reason:string;salesUnits30:number|null}>();
  for (const p of active.filter(p=>p.costQuestionNeeded)) {
    const previous=questions.get(p.resolvedSku);
    if(previous) { previous.channels.push(p.channel); previous.salesUnits30=Math.max(previous.salesUnits30??0,p.salesUnits30??0); }
    else questions.set(p.resolvedSku,{sku:p.resolvedSku,channels:[p.channel],reason:'cost_unavailable_or_unmatched_for_selling_product',salesUnits30:p.salesUnits30});
  }
  return { mode: 'partial_read_only' as const, globalCostCoverageBlocksAnalysis: false,
    summary: { observedSkus: unique(products), excludedSkus: unique(products.filter(p=>p.excluded)),
      skusWithKnownCost: unique(active.filter(p=>p.costKnown)),
      skuChannelsWithPriceFloor: active.filter(p=>p.priceFloorTry !== null).length,
      skuChannelsWithContributionProfit: active.filter(p=>p.contributionProfitTry !== null).length },
    products,
    recordedCostReconciliation: active.filter(p=>p.costReconciliationNeeded).map(p=>({sku:p.sku,channel:p.channel,reason:"recorded_cost_requires_matching_or_dated_conversion"})),
    questions: [...questions.values()].sort((a,b)=>(b.salesUnits30??0)-(a.salesUnits30??0)),
    limitations: ["Known product cost alone does not establish profit: VAT, fees, returns and other relevant costs must also be known.",
      "Missing cost is not evidence that a product is unwanted. Inactive entries are excluded; explicit no-reorder and virtual-stock policy restricts procurement separately.",
      "Questions are suggestions only; no questions or business records are written. No autonomous execution or release approval is enabled."] };
}

export async function buildOperatingContext(db: ReadSource, snapshot: CfoAgentSnapshot) {
  const sources: {name:string;available:boolean;records:number|null;latest:string|null}[]=[];
  const queries = [
    ['Entegra', 'select count(*)::int as records, max("importedAt") as latest from "MarketplaceSalesRecord"'],
    ['XML', 'select count(*)::int as records, max("syncedAt") as latest from "XmlStockChangeLog"'],
  ] as const;
  for(const [name,sql] of queries) {
    try { const [row]=await db.query(sql); sources.push({name,available:true,records:Number(row.records),latest:row.latest==null?null:new Date(String(row.latest)).toISOString()}); }
    catch { sources.push({name,available:false,records:null,latest:null}); }
  }
  let recordedCosts: Row[]=[];
  let catalogCostsAvailable=false;
  try { recordedCosts=await db.query<Row>(`select sku, "isActive" as active, "privateNote", "productKind"::text as kind, "stockQuantity" as stock, "unitCostTry"::text as "costTry",
    "unitCostUsd"::text as "costUsd", "importUnitCostUsd"::text as "importCostUsd" from "Product" order by sku limit 10001`);catalogCostsAvailable=true; }
  catch { /* Existing cost fields may be unavailable; never pretend they are zero. */ }
  let totalDebtTry:number|null=null;
  try{const [wealth]=await db.query<Row>('select borc::text as debt from cfo_servet');
    if(wealth?.debt!=null&&Number.isFinite(Number(wealth.debt)))totalDebtTry=Number(wealth.debt);
  }catch{ /* Total debt remains unknown; card debt is not a substitute. */ }
  const inactive = await db.query<Row>('select sku from "Product" where not "isActive"');
  return { asOf:snapshot.generatedAt, readOnly:true, execution:'existing_application_connection',
    sources, notebook:snapshot.notebook,
    catalogCosts: {available:catalogCostsAvailable,truncated:recordedCosts.length>10000,records:recordedCosts.slice(0,10000).map(({privateNote,...row})=>({...row,...productPolicy({...row,privateNote})}))},
    operating:operatingCapabilities(snapshot,new Set(inactive.map(row=>String(row.sku))),new Map(recordedCosts.slice(0,10000).map(row=>[String(row.sku),row]))),
    financialGoals:{totalDebtTry,debtSource:"cfo_servet.borc",balancesFresh:snapshot.cash.banksFresh},
    sales:snapshot.sales, cash:snapshot.cash, dataQuality:snapshot.dataQuality };
}
