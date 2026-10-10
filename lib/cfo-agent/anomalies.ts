import { createHash } from "node:crypto";
import { getCfoConfig, type CfoConfig } from "./config";
import { capitalCostImpact, D, financialImpact, priceGapImpact, revenueAtRisk } from "./calculations";
import { evidence } from "./evidence";
import { fmtClosers } from "./cost-coverage";
import type { Anomaly, Category, CfoAgentSnapshot, Evidence, Impact, Metric, Severity } from "./types";

export function detectCfoAnomalies(snapshot:CfoAgentSnapshot,config:CfoConfig=getCfoConfig()):Anomaly[] {
  const result:Anomaly[]=[], at=snapshot.generatedAt, month=at.slice(0,7);
  const add=(rule:string,category:Category,severity:Severity,entity:string,period:string,proof:Evidence[],impact:Impact|null=null,actionable=true,existing:string[]=[])=>{
    const key=`${rule}|${entity}`, fingerprint=`${key}|${period}`;
    for(const e of proof)if(!snapshot.evidence.some(p=>p.id===e.id))snapshot.evidence.push(e);
    result.push({id:`a_${createHash("sha256").update(fingerprint).digest("hex").slice(0,16)}`,rule,category,severity,entityType:entity==="company"?"company":category==="sales"?"channel":"sku",entityId:entity,
      period,fingerprint,cooldownKey:key,evidenceIds:proof.map(e=>e.id),impact,actionable,weight:Math.abs(impact?.value??0),existingRecordIds:existing});
  };
  const m=(source:string,key:string,metric:Metric,unit:string)=>evidence(source,key,metric.value,unit,at,!metric.estimated);
  for(const source of snapshot.dataQuality.staleSources)add("DATA_STALE","data_quality","warning",source,month,[evidence(source,"freshness","stale","state",at,true)],null,false);
  if(snapshot.dataQuality.missingFields.length)add("DATA_QUALITY","data_quality","warning","company",month,[evidence("snapshot","missing_fields",snapshot.dataQuality.missingFields.join(",").slice(0,1200),"fields",at,true)],null,false);
  const coverage=snapshot.dataQuality.costCoveragePct;
  // Mükerrer kanonik satış satırı şirket çapında kapı DEĞİL (Alperen kararı 2026-10-08, "A"; Cowork CFO sonuçta hemfikir):
  // ilgili SKU-kanal grubu zaten güvenilmez sayılıp marj hesabından çıkar. Asıl kök neden Cowork'ün ölçümüyle düzeltildi:
  // mükerrer anahtarı artık platform satır kimliğini (externalLineId) içerir → gerçek mükerrer 0 (snapshot.ts). Kalan
  // (satır kimliği boş) tekrarlar DUPLICATE_SALES_ROWS bilgi bulgusu üretir.
  const financialAllowed=coverage!=null&&coverage>=config.minCostCoveragePct;
  if(snapshot.dataQuality.duplicateCanonicalRows>0)add("DUPLICATE_SALES_ROWS","data_quality","warning","company",month,[evidence("cfo_satis_birim_duz","duplicate_rows",snapshot.dataQuality.duplicateCanonicalRows,"rows",at,true)],null,false);
  const gap=snapshot.dataQuality.costCoverageGap;
  if(!financialAllowed)add("COST_COVERAGE","data_quality","warning","company",month,[evidence("cfo_maliyet_kapsami","cost_coverage",coverage,"pct",at,true),
    ...(gap?[evidence("cfo_maliyet_kapsami_satir","kapsam_acigi_try",gap.gapTry,"TRY",at,true),
      evidence("cfo_maliyet_kapsami_satir","kapatan_kalemler",fmtClosers(gap.items),"text",at,true),
      evidence("cfo_maliyet_kapsami_satir","kalem_sayisi",gap.items.length,"items",at,true),
      evidence("cfo_maliyet_kapsami_satir","acigi_kapatir",gap.closesGap?"evet":"hayir","state",at,true)]:[])],null,false);
  // Cash comes first. Stale manual bank balances block financial diagnosis.
  // Tetik (Cowork sırası 3/3, 2026-10-08): projeksiyon dibi YA DA KMH faizi dahil dip (kademeli faiz, yalnız ölçülmüş oranlar →
  // faiz alt sınır) tabanın altındaysa. Faizli dip hiçbir zaman projeksiyondan iyi değildir; bağlama yalnız tetiği öne çeker.
  // Projeksiyon dibi bilinmiyorsa kural susar (faizli dip tek başına tetiklemez — aynı akıştan türer).
  const projMin=snapshot.cash.minimumProjectedPosition.value,withInterest=snapshot.cash.minimumWithInterestTry??null;
  const cashTrigger=projMin==null?null:projMin<config.cashFloorTry?"projection":withInterest!=null&&withInterest<config.cashFloorTry?"kmh_interest":null;
  if(snapshot.cash.banksFresh&&cashTrigger) {
    add("CASH_CRITICAL","cash","critical","company",month,[m("cfo_nakit_projeksiyon","minimum_position",snapshot.cash.minimumProjectedPosition,"TRY"),m("cfo_nakit_kapisi","cash",snapshot.cash.cash,"TRY"),m("cfo_nakit_kapisi","purpose_limit_not_general_cash",snapshot.cash.purposeLimit,"TRY"),evidence("cfo_nakit_projeksiyon","trigger",cashTrigger,"text",at,true),...snapshot.cash.summaries]);
  }
  for(const c of snapshot.sales.comparisons) {
    if(!c.complete||!c.sourceFresh||c.current.value==null||c.previous.value==null||c.previous.value<=0)continue;
    const difference=D(c.current.value).sub(c.previous.value),pct=difference.div(c.previous.value).mul(100).abs();
    if(pct.gt(config.revenueDeviationPct)&&difference.abs().gte(config.minRevenueDifferenceTry))add("REVENUE_DEVIATION","sales","warning",c.entity,c.period,[m("fm_sales_canonical_snapshot",`${c.period}.current`,c.current,"TRY"),m("fm_sales_canonical_snapshot",`${c.period}.same_weekdays`,c.previous,"TRY")]);
  }
  for(const c of snapshot.channels) {
    if(!financialAllowed||!c.sourceFresh||c.profitability.contributionMargin.value==null||c.previousMargin.value==null)continue;
    const current=c.profitability.contributionMargin;
    if(D(c.previousMargin.value).sub(current.value!).gte(config.marginDropPoints))add("MARGIN_DROP","margin","warning",c.channel,month,[m("cfo_satis_birim_duz",`${c.channel}.margin`,current,"pct"),m("cfo_satis_birim_duz",`${c.channel}.previous_margin`,c.previousMargin,"pct")]);
    if(current.value!<0&&c.previousMargin.value>=0)add("NEGATIVE_PROFIT","margin","critical",c.channel,month,[m("cfo_satis_birim_duz",`${c.channel}.contribution`,c.profitability.contributionProfit,"TRY"),m("cfo_satis_birim_duz",`${c.channel}.previous_margin`,c.previousMargin,"pct")]);
  }
  const xmlFresh=!snapshot.dataQuality.staleSources.includes("XML");
  for(const p of snapshot.products) {
    const entity=`${p.channel}:${p.sku}`;
    if(!p.trusted)continue;
    if(p.velocityGapPct?.value!=null&&p.velocityGapPct.value>30)add("DEMAND_SOURCE_DIVERGENCE","data_quality","warning",entity,month,[m("cfo_satis_birim_duz",`${entity}.sales_units_30`,p.salesUnits30,"units"),m("cfo_stok_hareket_hiz",`${entity}.xml_units_30`,p.xmlUnits30,"units"),m("cfo_stok_hareket_hiz",`${entity}.cautious_velocity`,p.xmlVelocity,"units/day"),m("snapshot",`${entity}.source_gap`,p.velocityGapPct,"pct")],null,false);
    // financialSourceFresh (Entegra cost + canonical sales) and sourceFresh (bu
    // kanalın satış verisi) ARTIK AYRI alanlar — snapshot.ts bunları kasten
    // ayırdı (bkz. channelFresh/financialFresh). Maliyet/kâr içeren kural
    // financialSourceFresh'e bakar; yalnız avgPrice kullanan kural (kanal
    // satış fiyatı) sourceFresh'e bakar. İkisini karıştırmak eski (tek alanlı)
    // davranışı yanlış sinyalle taklit eder.
    if(p.sourceFresh&&p.financialSourceFresh&&p.cost.value!=null&&p.avgPrice.value!=null&&p.priceFloor.value!=null&&p.avgPrice.value<p.priceFloor.value) {
      add("PRICE_BELOW_FLOOR","pricing","critical",entity,p.pricePeriod,[m("cfo_satis_birim_duz",`${entity}.avg_price`,p.avgPrice,"TRY"),m("cfo_kargo_tarife",`${entity}.floor_single_unit_order`,p.priceFloor,"TRY"),m("cfo_satis_birim_duz",`${entity}.commission`,p.commissionRate,"ratio"),m("cfo_stok_hareket_hiz",`${entity}.cautious_velocity`,p.velocity,"units/day")],
        priceGapImpact(p.priceFloor,p.avgPrice,p.velocity));
    }
    const price=p.avgPrice.value;
    if(p.sourceFresh&&price!=null&&((price>=200&&price<=243.70)||(price>=350&&price<=365.50)))add("PRICE_DEAD_BAND","pricing","warning",entity,p.pricePeriod,[m("cfo_satis_birim_duz",`${entity}.avg_price`,p.avgPrice,"TRY")]);
    if(p.sourceFresh&&p.financialSourceFresh&&price!=null&&price<200&&p.zeroCommissionFloor.value!=null&&price<p.zeroCommissionFloor.value)add("LOW_PRICE_STRUCTURAL_LOSS","pricing","critical",entity,p.pricePeriod,[m("cfo_satis_birim_duz",`${entity}.avg_price`,p.avgPrice,"TRY"),m("cfo_kargo_tarife",`${entity}.zero_commission_sensitivity_floor`,p.zeroCommissionFloor,"TRY")]);
    if(p.financialSourceFresh&&p.priceFloor.value==null)add("FLOOR_DATA_QUALITY","data_quality","warning",entity,month,[evidence("pricing",`${entity}.floor`,p.priceFloor.reason??"unavailable","reason",at,true)],null,false);
    if(xmlFresh&&p.stockQty!=null&&p.stockDays.value!=null&&p.stockDays.value<config.stockoutDays) {
      const proof=[m("cfo_stok_hareket_hiz",`${entity}.stock_days`,p.stockDays,"days"),evidence("Product",`${entity}.stock_qty`,p.stockQty,"units",at,true),m("cfo_stok_hareket_hiz",`${entity}.cautious_velocity`,p.velocity,"units/day"),
        evidence("cfo_yolda_sku",`${entity}.inbound_quantity`,p.inboundQty,"units",at,true),evidence("cfo_yolda_sku",`${entity}.inbound_eta`,p.inboundEta,"date",at,true),evidence("PurchaseOrder",`${entity}.open_orders`,p.openPurchaseOrders,"count",at,true)];
      const affected=config.stockoutDays-p.stockDays.value;
      if(p.unitProfit.value==null&&p.avgPrice.value!=null)proof.push(m("cfo_satis_birim_duz",`${entity}.avg_price`,p.avgPrice,"TRY"));
      add("STOCKOUT","inventory",p.stockDays.value<7?"critical":"warning",entity,month,proof,financialImpact(p.unitProfit,p.velocity,affected)??revenueAtRisk(p.avgPrice,p.velocity,affected));
      if(financialAllowed&&p.financialSourceFresh&&p.unitProfit.value!=null&&p.unitProfit.value>0&&p.velocity.value!=null&&p.velocity.value>0&&!p.inboundBeforeStockout&&(p.openPurchaseOrders??0)===0)
        add("PROCUREMENT","procurement","warning",entity,month,proof,financialImpact(p.unitProfit,p.velocity,config.stockoutDays-p.stockDays.value));
    }
    if(financialAllowed&&p.financialSourceFresh&&p.unitProfit.value!=null&&p.previousUnitProfit.value!=null&&p.unitProfit.value<0&&p.previousUnitProfit.value>=0)add("NEGATIVE_PROFIT","margin","critical",entity,month,[m("cfo_satis_birim_duz",`${entity}.unit_profit`,p.unitProfit,"TRY"),m("cfo_satis_birim_duz",`${entity}.previous_unit_profit`,p.previousUnitProfit,"TRY")]);
  }
  for(const p of snapshot.deadStock)if(xmlFresh&&!snapshot.dataQuality.staleSources.includes("Entegra")&&(p.alarm==="KIRMIZI"||p.alarm==="SARI"))add("DEAD_STOCK","inventory",p.alarm==="KIRMIZI"?"critical":"warning",p.sku,month,[m("cfo_olu_stok",`${p.sku}.cost_value`,p.value,"TRY")],capitalCostImpact(p.value,config.moneyCostMonthlyPct),true,p.findingId?[`cfo_dead_stock_finding:${p.findingId}`]:[]);
  const r=snapshot.returns;
  if(r.complete&&r.sample>=config.returnMinSample&&r.currentRate.value!=null&&r.previousRate.value!=null&&D(r.currentRate.value).sub(r.previousRate.value).gte(config.returnIncreasePoints))add("RETURNS_SPIKE","sales","warning","company",month,[m("cfo_satis_birim_duz","return_rate.current",r.currentRate,"pct"),m("cfo_satis_birim_duz","return_rate.previous",r.previousRate,"pct")]);
  return result.sort((a,b)=>(a.category==="cash"?-100:0)+(a.severity==="critical"?-10:0)-((b.category==="cash"?-100:0)+(b.severity==="critical"?-10:0))||b.weight-a.weight);
}

export function shouldReopen(anomaly:Anomaly, previous:{createdAt:Date;impact:number|null}, now:Date,cooldownHours=72):boolean {
  if(now.getTime()-previous.createdAt.getTime()>=cooldownHours*3600000)return true;
  const impact=anomaly.impact?.value;
  return impact!=null&&previous.impact!=null&&Math.abs(impact)>0&&Math.abs(impact)>=Math.abs(previous.impact)*1.5;
}

/** Rules that cannot fire right now because of data freshness / coverage (girdi şartnamesi Blok B + kabul testi 2):
 *  `no_actionable_anomaly` must be able to say WHICH rules are blind, not only that nothing was found. Mirrors the gates above. */
export function silencedRules(snapshot:CfoAgentSnapshot,config:CfoConfig=getCfoConfig()):string[] {
  const stale=snapshot.dataQuality.staleSources, out:string[]=[];
  const coverage=snapshot.dataQuality.costCoveragePct;
  if(stale.includes("Entegra"))out.push("Entegra bayat → PRICE_BELOW_FLOOR, LOW_PRICE_STRUCTURAL_LOSS, DEAD_STOCK, PROCUREMENT, NEGATIVE_PROFIT, REVENUE_DEVIATION susuyor");
  if(stale.includes("XML"))out.push("XML bayat → STOCKOUT, DEAD_STOCK, PROCUREMENT susuyor");
  if(!snapshot.cash.banksFresh){const m=(snapshot.cash.staleBanks??[]).filter(b=>b.material).map(b=>b.name);out.push(`banka bakiyesi bayat${m.length?` (${m.join(", ")})`:""} → CASH_CRITICAL susuyor`);}
  if(coverage==null||coverage<config.minCostCoveragePct)out.push(`maliyet kapsamı %${coverage==null?"?":Math.round(coverage*10)/10} < %${config.minCostCoveragePct} → MARGIN_DROP, NEGATIVE_PROFIT, PROCUREMENT susuyor`);
  return out;
}
