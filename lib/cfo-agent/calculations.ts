import { Prisma } from "@prisma/client";
import type { Impact, Metric, Profitability } from "./types";

// See docs/AI-CFO-FINANCIAL-CONTRACT.md. No legacy dashboard calculation changes.
export const FINANCIAL_CONTRACT = Object.freeze({
  version: "alfas-gross-v7", basis: "gross_incl_vat" as const,
  statement: "Komisyon, kargo, hizmet ve ceza oranları KDV DÂHİL brüt tutar üzerinden uygulanır. revenue_ex_vat yalnızca raporlama içindir, marj paydası olarak kullanılmaz.",
  dummyStock: [500, 998, 999, 1000, 9999, 10000],
  orderReturnReserveTry: "13.36", orderProcessingTry: "12.29", orderServicePenaltyTry: "10.00",
  packagingLightTry: "10.00", packagingHeavyTry: "18.74",
});
export const D = (v: number | string | Prisma.Decimal) => new Prisma.Decimal(v);
export function numeric(v: unknown): number | null {
  if (v == null || v === "" || typeof v === "boolean") return null;
  const n = Number(v); return Number.isFinite(n) ? n : null;
}
export function metric(v: unknown, estimated = false, reason?: string): Metric {
  return { value: numeric(v), estimated, basis: "gross_incl_vat", ...(reason ? { reason } : {}) };
}
export const unknown = (reason: string) => metric(null, false, reason);
export const isDummyStock = (qty: number) => FINANCIAL_CONTRACT.dummyStock.includes(qty);
export function percentage(a: number | null, b: number | null): number | null {
  return a == null || b == null || b <= 0 ? null : D(a).div(b).mul(100).toNumber();
}
export function divide(a: number | null, b: number | null): number | null {
  return a == null || b == null || b <= 0 ? null : D(a).div(b).toNumber();
}
export function contribution(input: Omit<Profitability, "contributionProfit" | "contributionMargin" | "revenueExVat">,
  grossIncludesRefunds?: boolean): Profitability {
  const costs = [input.productCost, input.commission, input.shipping, input.advertising, input.otherVariableCosts];
  if (grossIncludesRefunds !== true) costs.push(input.refunds);
  const complete = input.grossRevenue.value != null && grossIncludesRefunds !== undefined && costs.every(c => c.value != null);
  const estimated = [input.grossRevenue, ...costs].some(c => c.estimated);
  const profit = complete ? D(input.grossRevenue.value!).sub(costs.reduce((s,c) => s.add(c.value!), D(0))).toNumber() : null;
  const exVat = input.grossRevenue.value != null && input.vat.value != null ? D(input.grossRevenue.value).sub(input.vat.value).toNumber() : null;
  return { ...input, revenueExVat: { ...metric(exVat, input.vat.estimated, exVat == null ? "vat_unavailable" : undefined), basis: "net_ex_vat" },
    contributionProfit: metric(profit, estimated, complete ? undefined : "incomplete_variable_costs_or_refund_basis"),
    contributionMargin: metric(percentage(profit, input.grossRevenue.value), estimated, complete ? undefined : "incomplete_contribution") };
}
export function emptyProfitability(): Profitability {
  const u = unknown("source_unavailable"); return contribution({ grossRevenue:u, vat:u, refunds:u, productCost:u, commission:u, shipping:u, advertising:u, otherVariableCosts:u });
}
export type ShippingBand = { min: number; max: number | null; shipping: number };
export function shippingFor(price: number, bands: ShippingBand[]): number | null {
  const found = bands.filter(b => price >= b.min && (b.max == null || price < b.max));
  return found.length === 1 ? found[0].shipping : null;
}
/** `processingInShipping`: the shipping bands already carry the measured per-order processing fee (cfo_kargo_tarife.toplam =
 *  tarife + ek_maliyet/ISLEM_BEDELI), so the contract's constant processing fee is not added a second time. */
export function priceFloor(cost: number | null, commission: number | null, weightKg: number | null, bands: ShippingBand[], processingInShipping = false): Metric {
  if (cost == null || commission == null || weightKg == null || commission < 0 || commission >= 1) return unknown("floor_inputs_unavailable");
  const pack = weightKg <= .5 ? FINANCIAL_CONTRACT.packagingLightTry : FINANCIAL_CONTRACT.packagingHeavyTry;
  const fixed = D(cost).add(pack).add(FINANCIAL_CONTRACT.orderReturnReserveTry).add(processingInShipping ? 0 : FINANCIAL_CONTRACT.orderProcessingTry).add(FINANCIAL_CONTRACT.orderServicePenaltyTry);
  // Solve in every band, rather than iterating indefinitely across discontinuities.
  const solutions = bands.map(b => fixed.add(b.shipping).div(D(1).sub(commission)))
    .filter(p => shippingFor(p.toNumber(), bands) != null && p.gte(fixed.add(shippingFor(p.toNumber(), bands)!).div(D(1).sub(commission))))
    .sort((a,b) => a.cmp(b));
  return solutions.length ? metric(solutions[0].toDecimalPlaces(2, Prisma.Decimal.ROUND_CEIL).toNumber(), true) : unknown("shipping_band_unavailable");
}
export function allocateOrderCost(orderCost: number | null, lineGross: number | null, orderGross: number | null, complete: boolean): number | null {
  return !complete || orderCost == null || lineGross == null || lineGross < 0 || orderGross == null || orderGross <= 0 ? null : D(orderCost).mul(lineGross).div(orderGross).toNumber();
}
// SQL equivalent of allocateOrderCost. Kept beside the Decimal formula so all
// order-grain tariff/packaging allocation follows the same revenue-share rule.
export function orderAllocationSql(costExpression:string,lineGross:string,orderGross:string,complete:string):string {
  return `case when (${complete}) and (${orderGross})>0 and (${lineGross})>=0 then (${costExpression})::numeric*(${lineGross})::numeric/(${orderGross})::numeric end`;
}
export function measuredCommission(channel: string, count: number, commission: number | null, gross: number | null,
  _channelCommission: number | null, _channelGross: number | null, coveragePct=0): Metric {
  // Zero-filled channels (TEMU/IDEFIX) are unusable even with apparent 100%
  // coverage. No settlement ratio may be relabelled as a commission rate.
  if (!['TRENDYOL','HEPSIBURADA'].includes(channel) || coveragePct < 90 || count < 10)
    return unknown("commission_coverage_or_sample_unavailable");
  const value=divide(commission,gross);
  return value == null || value <= 0 || value >= 1 ? unknown("commission_unavailable") : metric(value,false,"outlier_filtered_weighted_commission");
}
export function cautiousDemand(salesUnits:Metric,xmlUnits:Metric,xmlVelocity:Metric,salesComplete:boolean) {
  const salesVelocity=metric(salesComplete?divide(salesUnits.value,30):null,false,salesComplete?undefined:"sales_coverage_incomplete");
  // An incomplete Entegra count is a lower bound, not demand. Never take max.
  const velocity=xmlVelocity.value==null?unknown("cautious_xml_velocity_unavailable"):
    metric(salesVelocity.value==null?xmlVelocity.value:Math.min(salesVelocity.value,xmlVelocity.value),true,"cautious_sources");
  const gap=salesUnits.value==null||xmlUnits.value==null||Math.max(salesUnits.value,xmlUnits.value)<=0?null:
    D(salesUnits.value).sub(xmlUnits.value).abs().div(Math.max(salesUnits.value,xmlUnits.value)).mul(100).toNumber();
  return {salesVelocity,velocity,gap:metric(gap)};
}
export function financialImpact(unitProfit: Metric, dailyVelocity: Metric, days: number): Impact | null {
  if (unitProfit.value == null || dailyVelocity.value == null || dailyVelocity.value < 0 || days < 0) return null;
  return { value:D(unitProfit.value).mul(dailyVelocity.value).mul(days).toDecimalPlaces(2).toNumber(),
    formula:"unit_profit_try * daily_velocity * affected_days", inputs:{unit_profit_try:unitProfit.value,daily_velocity:dailyVelocity.value,affected_days:days},
    basis:"gross_incl_vat", estimated:unitProfit.estimated || dailyVelocity.estimated };
}
export function stale(orderDate: string | null, now: Date, hours = 48): boolean {
  return !orderDate || !Number.isFinite(Date.parse(orderDate)) || now.getTime() - Date.parse(orderDate) > hours * 3600000;
}
