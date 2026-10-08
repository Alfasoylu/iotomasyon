/**
 * Şablonlu bulgu üretici (lib/cfo-agent/findings.ts) — saf, DB yok. Fikstürler üretim şekilli kanıt sorguları (07.10 koşusu).
 * Çalıştır: node --import tsx __tests__/ai-cfo-findings.test.ts
 */
import assert from "node:assert/strict";
import { renderFinding, renderFindings, type FindingOptions } from "../lib/cfo-agent/findings";
import { financialImpact, metric, capitalCostImpact } from "../lib/cfo-agent/calculations";
import { evidence } from "../lib/cfo-agent/evidence";
import type { Anomaly, Evidence } from "../lib/cfo-agent/types";

const AT = "2026-10-08T06:00:00.000Z";
const O: FindingOptions = { cashFloorTry: -3000000, coverDays: 21, minCostCoveragePct: 95 };
const anomaly = (rule: string, entityId: string, proof: Evidence[], o: Partial<Anomaly> = {}): Anomaly => ({
  id: `a_${rule}_${entityId}`, rule, severity: "warning", category: "inventory", entityType: entityId.includes(":") ? "sku" : "company", entityId, period: "2026-10",
  fingerprint: `${rule}|${entityId}|2026-10`, cooldownKey: `${rule}|${entityId}`, evidenceIds: proof.map(e => e.id), actionable: true, impact: null, weight: 0, existingRecordIds: [], ...o });

// STOCKOUT — Cowork CFO örneği: MD-3003B1 EPTT'de 4 günde tükenecek, hız 5,33, birim kâr 123,55
const e = "EPTTAVM:MD-3003B1";
const so = [evidence("cfo_stok_hareket_hiz", `${e}.stock_days`, 4, "days", AT, false), evidence("Product", `${e}.stock_qty`, 21, "units", AT, true),
  evidence("cfo_stok_hareket_hiz", `${e}.cautious_velocity`, 5.33, "units/day", AT, false), evidence("cfo_yolda_sku", `${e}.inbound_quantity`, 0, "units", AT, true),
  evidence("cfo_yolda_sku", `${e}.inbound_eta`, null, "date", AT, true), evidence("PurchaseOrder", `${e}.open_orders`, 0, "count", AT, true)];
const stockout = anomaly("STOCKOUT", e, so, { severity: "critical", impact: financialImpact(metric(123.55, true), metric(5.33, true), 17) });
const f = renderFinding(stockout, so, O);
assert.equal(f.urgency, "ACIL", "7 günden az stok → ACİL");
assert.match(f.what, /^MD-3003B1 \(EPTTAVM\) 4 günde tükenecek\. Hız 5,33 adet\/gün, stok 21, yolda 0, birim kâr 123,55 TL, stoksuzluk maliyeti 659 TL\/gün\.$/);
assert.equal(f.action, "21 günlük örtü için 91 adet sipariş gerekiyor.", "ceil(5,33 × 21 − 21 − 0) = ceil(90,93) = 91");
assert.match(f.text, /TL etkisi: 11\.195 TL \(tahmini\)\./, "123,55 × 5,33 × 17");
assert.ok(f.text.includes(`Kanıt: ${so.map(x => x.id).join(", ")}`)); assert.ok(f.text.endsWith("Aciliyet: ACİL."));
assert.deepEqual(f.evidenceIds, stockout.evidenceIds);
// kâr bilinmiyorsa ciro riski etiketlenir; stok bilinmiyorsa sipariş miktarı uydurulmaz
const noStock = so.filter(x => !x.query.endsWith("stock_qty"));
const r2 = renderFinding(anomaly("STOCKOUT", e, noStock, { impact: { value: 5000, formula: "", inputs: { avg_price_try: 300, daily_velocity: 5.33, affected_days: 3 }, basis: "gross_incl_vat", estimated: true, kind: "revenue_at_risk" } }), noStock, O);
assert.match(r2.what, /stok bilinmiyor/); assert.match(r2.what, /1\.599 TL\/gün \(ciro; kâr bilinmiyor\)/);
assert.equal(r2.action, "Sipariş miktarı hesaplanamadı (stok ya da hız bilinmiyor).");

// stok sıfırsa "0 günde tükenecek" yerine "stokta yok"
const zero = so.map(x => x.query.endsWith("stock_qty") ? { ...x, value: 0 } : x.query.endsWith("stock_days") ? { ...x, value: 0 } : x);
assert.match(renderFinding(stockout, zero, O).what, /^MD-3003B1 \(EPTTAVM\) stokta yok\. Hız 5,33/);

// CASH_CRITICAL — ACİL; sayılar kanıttan
const cash = [evidence("cfo_nakit_projeksiyon", "minimum_position", -3379787, "TRY", AT, true), evidence("cfo_nakit_kapisi", "cash", 59693.13, "TRY", AT, true),
  evidence("cfo_nakit_kapisi", "purpose_limit_not_general_cash", 750000, "TRY", AT, true)];
const c = renderFinding(anomaly("CASH_CRITICAL", "company", cash, { category: "cash", severity: "critical" }), cash, O);
assert.equal(c.urgency, "ACIL");
assert.equal(c.what, "Nakit dibi -3.379.787 TL — taban -3.000.000 TL altında. Kasa 59.693 TL; amaca bağlı limit 750.000 TL genel nakit değil.");
// önemsiz bayat hesap kapıyı kapatmaz ama bulguda uyarı olarak görünür (Cowork 2026-10-08: Ziraat USD 419,53 TL)
const cashStale = [...cash, evidence("cfo_bank_account", "stale_immaterial", "Ziraat USD (420 TL)", "accounts", AT, true)];
assert.match(renderFinding(anomaly("CASH_CRITICAL", "company", cashStale, { category: "cash", severity: "critical" }), cashStale, O).what,
  /genel nakit değil\. Bayat ama önemsiz hesap \(kapıyı kapatmaz\): Ziraat USD \(420 TL\)\.$/);

// PRICE_BELOW_FLOOR, DEAD_STOCK, açık iş ve veri kalitesi
const pb = [evidence("cfo_satis_birim_duz", "TRENDYOL:X1.avg_price", 180, "TRY", AT, true), evidence("cfo_kargo_tarife", "TRENDYOL:X1.floor_single_unit_order", 214.5, "TRY", AT, false),
  evidence("cfo_stok_hareket_hiz", "TRENDYOL:X1.cautious_velocity", 2, "units/day", AT, false)];
const p = renderFinding(anomaly("PRICE_BELOW_FLOOR", "TRENDYOL:X1", pb, { category: "pricing", severity: "critical" }), pb, O);
assert.equal(p.urgency, "BUGUN"); assert.match(p.what, /ortalama fiyat 180 TL, taban 215 TL \(35 TL altında\); hız 2 adet\/gün/);
assert.match(p.action, /Alperen onayıyla/, "fiyat değişikliği öneridir, uygulanmaz");
const ds = [evidence("cfo_olu_stok", "SKU9.cost_value", 120000, "TRY", AT, false)];
const d = renderFinding(anomaly("DEAD_STOCK", "SKU9", ds, { impact: capitalCostImpact(metric(120000, true), 2.83), existingRecordIds: ["cfo_dead_stock_finding:7", "queue_check_unavailable:cfo_question"] }), ds, O);
assert.match(d.what, /bağlı sermaye 120\.000 TL, aylık para maliyeti 3\.396 TL \(%2,83\)/);
assert.deepEqual(d.openRecords, ["cfo_dead_stock_finding:7"], "kuyruk kontrolü yapılamadı notu açık iş sayılmaz");
assert.match(d.text, /Açık iş: cfo_dead_stock_finding:7\./);
const cov = [evidence("cfo_maliyet_kapsami", "cost_coverage", 87.5, "pct", AT, true)];
const cc = renderFinding(anomaly("COST_COVERAGE", "company", cov, { category: "data_quality", actionable: false }), cov, O);
assert.equal(cc.what, "Maliyet kapsamı %87,5 < %95 → marj ve kâr kuralları susuyor."); assert.equal(cc.actionable, false);
// şablonu olmayan kural da satır alır (görüş kapanmaz)
assert.match(renderFinding(anomaly("NEW_RULE", "company", []), [], O).text, /^NEW_RULE — company\./);

// Goal Engine ortak şablonu
const gk = "net_position_floor_try";
const gp = [evidence("fm_memory_goal", `${gk}.observed_try`, -3379787, "TRY", "2026-10-07", false), evidence("fm_memory_goal", `${gk}.target_try`, -3000000, "TRY", "2026-10-07", false),
  evidence("fm_memory_goal", `${gk}.gap_try`, 379787, "TRY", "2026-10-07", false), evidence("fm_memory_goal", `${gk}.state`, "OFF_TRACK/D", "state", "2026-10-07", false)];
const g = renderFinding(anomaly("GOAL_OFF_TRACK", gk, gp, { category: "cash", severity: "critical", entityType: "goal" }), gp, O);
assert.equal(g.urgency, "ACIL", "taban hedefi kritik → ACİL");
assert.equal(g.what, "Hedef net_position_floor_try OFF_TRACK/D: gözlem -3.379.787 TL, hedef -3.000.000 TL, açık 379.787 TL.");

// Sıralama: aciliyet, sonra |TL etkisi|
const all = renderFindings([anomaly("COST_COVERAGE", "company", cov, { category: "data_quality" }), anomaly("DEAD_STOCK", "SKU9", ds, { impact: capitalCostImpact(metric(120000, true), 2.83) }), stockout,
  anomaly("PRICE_BELOW_FLOOR", "TRENDYOL:X1", pb, { severity: "critical", category: "pricing" })], [...so, ...cov, ...ds, ...pb], O);
assert.deepEqual(all.map(x => x.rule), ["STOCKOUT", "COST_COVERAGE", "PRICE_BELOW_FLOOR", "DEAD_STOCK"]);
console.log("CFO findings: STOCKOUT example (numbers from evidence, order qty, impact), cash, price, dead stock + open task, coverage, goal, unknown rule, ordering passed");
