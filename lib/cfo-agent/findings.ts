import type { Anomaly, Evidence } from "./types";

// ŞABLONLU BULGU ÜRETİCİ (2026-10-08 mimari kararı: sitede LLM yok). Her anomali — eylemlik olsun olmasın, açık işi olsun
// olmasın — okunabilir tek satıra çevrilir: ne · TL etkisi · kanıt id'leri · önerilen aksiyon · aciliyet. Saf fonksiyon:
// metindeki her sayı anomalinin kanıtından ya da kodla hesaplanmış TL etkisinden gelir; yeni sayı üretilmez. Yargı, karar ve
// yeni görev Cowork CFO'nundur (sabah + akşam koşusu); bu satırlar onun okuduğu cfo_gun_ozeti'nin gövdesidir.
// Hiçbir aksiyon otomatik uygulanmaz: fiyat / sipariş / ödeme önerileri yalnız metindir.

export type Urgency = "ACIL" | "BUGUN" | "BU_HAFTA" | "BILGI";
export const URGENCY_RANK: Record<Urgency, number> = { ACIL: 0, BUGUN: 1, BU_HAFTA: 2, BILGI: 3 };
export const URGENCY_LABEL: Record<Urgency, string> = { ACIL: "ACİL", BUGUN: "BUGÜN", BU_HAFTA: "BU HAFTA", BILGI: "BİLGİ" };

export type Finding = {
  fingerprint: string; cooldownKey: string; rule: string; severity: Anomaly["severity"]; category: Anomaly["category"];
  entity: string; urgency: Urgency;
  /** kodla hesaplanmış TL etkisi (yoksa null) ve türü */
  impactTry: number | null; impactKind: string | null; impactEstimated: boolean;
  /** ne oldu (tek cümle, sayılar kanıttan) */
  what: string; action: string;
  /** tam satır: ne + aksiyon + kanıt + aciliyet */
  text: string;
  evidenceIds: string[];
  /** zaten açık iş kaydı (soru, ölü stok bulgusu, sıçrama) — Cowork CFO yeni iş açmaz, mevcudu izler */
  openRecords: string[];
  actionable: boolean;
};

const nf0 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });
/** TL: tam sayı; diğerleri en çok 2 ondalık (Türkçe biçim). */
export const tl = (v: number) => `${nf0.format(Math.round(v))} TL`;
export const num = (v: number) => nf2.format(Math.round(v * 100) / 100);
const pct = (v: number) => `%${nf2.format(Math.round(v * 10) / 10)}`;

type Ctx = { a: Anomaly; get: (suffix: string) => Evidence["value"] | undefined; n: (suffix: string) => number | null };
const sku = (entity: string) => entity.split(":").at(-1)!;
const channel = (entity: string) => (entity.includes(":") ? entity.split(":")[0] : null);
const where = (entity: string) => (channel(entity) ? `${sku(entity)} (${channel(entity)})` : entity);

/** Kural başına şablon. Dönen null alan "bilinmiyor" demektir; metne uydurma değer girmez. */
const TEMPLATES: Record<string, (c: Ctx, o: FindingOptions) => { what: string; action: string; urgency?: Urgency }> = {
  CASH_CRITICAL: ({ n }, o) => ({
    what: `Nakit dibi ${fmt(n("minimum_position"), tl)} — taban ${tl(o.cashFloorTry)} altında. Kasa ${fmt(n("cash"), tl)}; amaca bağlı limit ${fmt(n("purpose_limit_not_general_cash"), tl)} genel nakit değil.`,
    action: "Ödeme takvimini ve boştaki kaldıraç basamaklarını (cfo_kaldirac_basamak) gözden geçir; ertelenebilir çıkışları belirle.",
    urgency: "ACIL" }),
  REVENUE_DEVIATION: ({ a, n }) => {
    const cur = n("current"), prev = n("same_weekdays"), down = cur != null && prev != null && cur < prev;
    const d = cur != null && prev != null && prev > 0 ? (cur - prev) / prev * 100 : null;
    return { what: `${a.entityId} cirosu (${a.period}) ${fmt(cur, tl)}; önceki aynı günler ${fmt(prev, tl)}${d == null ? "" : ` (${d > 0 ? "+" : ""}${pct(d)})`}.`,
      action: down ? "Kanalda stok, fiyat ve listeleme değişikliğini kontrol et." : "Artışın kaynağını (kampanya / stok / fiyat) not et.", urgency: down ? "BU_HAFTA" : "BILGI" };
  },
  MARGIN_DROP: ({ a, n }) => ({
    what: `${a.entityId} katkı marjı ${fmt(n("margin"), pct)} (önceki ${fmt(n("previous_margin"), pct)}).`,
    action: "Kanalın komisyon, kargo ve fiyat değişikliklerini incele." }),
  NEGATIVE_PROFIT: ({ a, n }) => ({
    what: a.entityType === "channel"
      ? `${a.entityId} katkı kârı negatife döndü: ${fmt(n("contribution"), tl)} (önceki marj ${fmt(n("previous_margin"), pct)}).`
      : `${where(a.entityId)} birim kârı ${fmt(n("unit_profit"), tl)} (önceki ${fmt(n("previous_unit_profit"), tl)}) — her satış zarar.`,
    action: "Fiyatı tabana çek ya da satışı durdur (fiyat değişikliği Alperen onayıyla)." }),
  PRICE_BELOW_FLOOR: ({ a, n }) => {
    const avg = n("avg_price"), floor = n("floor_single_unit_order");
    return { what: `${where(a.entityId)} ortalama fiyat ${fmt(avg, tl)}, taban ${fmt(floor, tl)}${avg != null && floor != null ? ` (${tl(floor - avg)} altında)` : ""}; hız ${fmt(n("cautious_velocity"), num)} adet/gün.`,
      action: `Fiyatı en az ${fmt(floor, tl)}'ye çek (Alperen onayıyla).` };
  },
  PRICE_DEAD_BAND: ({ a, n }) => ({
    what: `${where(a.entityId)} fiyatı ${fmt(n("avg_price"), tl)} ölü bantta (200–243,70 / 350–365,50 TL: kargo bandı atlıyor, fiyat artışı kâra dönmüyor).`,
    action: "Fiyatı bandın dışına taşı (Alperen onayıyla).", urgency: "BU_HAFTA" }),
  LOW_PRICE_STRUCTURAL_LOSS: ({ a, n }) => ({
    what: `${where(a.entityId)} fiyatı ${fmt(n("avg_price"), tl)}; komisyon sıfır olsa bile taban ${fmt(n("zero_commission_sensitivity_floor"), tl)} — yapısal zarar.`,
    action: "Set/paket yap ya da listeden çıkar (Alperen onayıyla)." }),
  FLOOR_DATA_QUALITY: ({ a, get }) => ({ what: `${where(a.entityId)} taban fiyatı hesaplanamadı (${String(get("floor") ?? "neden bilinmiyor")}).`,
    action: "Eksik girdiyi tamamla (maliyet / ağırlık / komisyon).", urgency: "BILGI" }),
  DEMAND_SOURCE_DIVERGENCE: ({ a, n }) => ({
    what: `${where(a.entityId)}: 30 günde satış ${fmt(n("sales_units_30"), num)} adet, XML stok hareketi ${fmt(n("xml_units_30"), num)} adet (fark ${fmt(n("source_gap"), pct)}); hesapta düşük olan kullanılıyor.`,
    action: "Stok hareketini ve satış kaydını doğrula.", urgency: "BILGI" }),
  STOCKOUT: ({ a, n }, o) => {
    const days = n("stock_days"), v = n("cautious_velocity"), stock = n("stock_qty"), inbound = n("inbound_quantity") ?? 0;
    const unitProfit = a.impact?.kind === "lost_profit" ? a.impact.inputs.unit_profit_try ?? null : null;
    const perDay = unitProfit != null && v != null ? unitProfit * v : a.impact?.kind === "revenue_at_risk" && v != null ? (a.impact.inputs.avg_price_try ?? 0) * v : null;
    const need = v != null && stock != null ? Math.max(0, Math.ceil(v * o.coverDays - stock - inbound)) : null;
    return { what: `${where(a.entityId)} ${fmt(days, num)} günde tükenecek. Hız ${fmt(v, num)} adet/gün, stok ${fmt(stock, num)}, yolda ${fmt(n("inbound_quantity"), num)}`
        + (unitProfit != null ? `, birim kâr ${num(unitProfit)} TL` : "")
        + (perDay != null ? `, stoksuzluk maliyeti ${tl(perDay)}/gün${a.impact?.kind === "revenue_at_risk" ? " (ciro; kâr bilinmiyor)" : ""}` : "") + ".",
      action: need == null ? "Sipariş miktarı hesaplanamadı (stok ya da hız bilinmiyor)." : need > 0 ? `${o.coverDays} günlük örtü için ${nf0.format(need)} adet sipariş gerekiyor.` : `Yoldaki mal ${o.coverDays} günlük örtüyü karşılıyor; varışı izle.`,
      urgency: days != null && days < 7 ? "ACIL" : "BUGUN" };
  },
  PROCUREMENT: ({ a, n }, o) => {
    const v = n("cautious_velocity"), stock = n("stock_qty"), inbound = n("inbound_quantity") ?? 0;
    const need = v != null && stock != null ? Math.max(0, Math.ceil(v * o.coverDays - stock - inbound)) : null;
    return { what: `${where(a.entityId)} için açık satın alma siparişi yok ve yoldaki mal tükenmeden gelmiyor (${fmt(n("stock_days"), num)} gün stok).`,
      action: need ? `Satın alma siparişi aç: ${nf0.format(need)} adet (${o.coverDays} günlük örtü; Alperen onayıyla).` : "Tedarik süresini ve siparişi doğrula." };
  },
  DEAD_STOCK: ({ a, n }) => ({
    what: `${a.entityId} ölü stok: bağlı sermaye ${fmt(n("cost_value"), tl)}${a.impact ? `, aylık para maliyeti ${tl(a.impact.value)} (%${num(a.impact.inputs.monthly_money_cost_pct ?? 0)})` : ""}.`,
    action: "Tasfiye / indirim planı yap (break-even indirim /cfo/sermaye'de)." }),
  RETURNS_SPIKE: ({ n }) => ({ what: `İade oranı ${fmt(n("current"), pct)} (önceki ${fmt(n("previous"), pct)}).`, action: "İade sebeplerini kanal ve ürün bazında incele." }),
  DATA_STALE: ({ a }) => ({ what: `${a.entityId} verisi bayat — bu kaynağa bağlı kurallar susuyor.`, action: `${a.entityId} yüklemesini / senkronunu yenile.`, urgency: "BUGUN" }),
  DATA_QUALITY: ({ get }) => ({ what: `Eksik alanlar: ${String(get("missing_fields") ?? "").slice(0, 300)}.`, action: "Eksik veriyi tamamla.", urgency: "BILGI" }),
  COST_COVERAGE: ({ n }, o) => ({ what: `Maliyet kapsamı ${fmt(n("cost_coverage"), pct)} < %${o.minCostCoveragePct} → marj ve kâr kuralları susuyor.`,
    action: "Eksik ürün maliyetlerini gir.", urgency: "BUGUN" }),
};

/** Goal Engine kuralları (GOAL_OFF_TRACK / GOAL_AT_RISK / GOAL_NOT_MET) ortak şablon. */
function goalTemplate({ a, n, get }: Ctx): { what: string; action: string; urgency?: Urgency } {
  const k = a.entityId;
  const rate = n(`${k}.current_rate_try_per_day`), req = n(`${k}.required_rate_try_per_day`);
  return {
    what: `Hedef ${k} ${String(get(`${k}.state`) ?? a.rule)}: gözlem ${fmt(n(`${k}.observed_try`), tl)}, hedef ${fmt(n(`${k}.target_try`), tl)}, açık ${fmt(n(`${k}.gap_try`), tl)}`
      + (rate != null || req != null ? `; hız ${fmt(rate, tl)}/gün, gereken ${fmt(req, tl)}/gün` : "") + ".",
    action: "Hedef sapmasının sürücüsünü (cfo_gun_ozeti METRIK satırları: hedef atfı) incele.",
  };
}

function fmt(v: number | null, f: (v: number) => string) { return v == null ? "bilinmiyor" : f(v); }

export type FindingOptions = { cashFloorTry: number; coverDays: number; minCostCoveragePct: number };

function defaultUrgency(a: Anomaly): Urgency {
  if (a.category === "data_quality") return "BILGI";
  return a.severity === "critical" ? "BUGUN" : a.severity === "warning" ? "BU_HAFTA" : "BILGI";
}

export function renderFinding(a: Anomaly, evidence: Evidence[], o: FindingOptions): Finding {
  const mine = evidence.filter(e => a.evidenceIds.includes(e.id));
  const get = (suffix: string) => mine.find(e => e.query === suffix || e.query.endsWith(`.${suffix}`))?.value;
  const n = (suffix: string) => { const v = get(suffix); return typeof v === "number" && Number.isFinite(v) ? v : v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null; };
  const t: { what: string; action: string; urgency?: Urgency } = a.rule.startsWith("GOAL_") ? goalTemplate({ a, get, n }) : TEMPLATES[a.rule]?.({ a, get, n }, o)
    ?? { what: `${a.rule} — ${where(a.entityId)}.`, action: "Kanıtı incele (şablonu olmayan kural)." };
  const urgency = t.urgency ?? (a.rule === "GOAL_OFF_TRACK" && a.severity === "critical" ? "ACIL" : defaultUrgency(a));
  const open = a.existingRecordIds.filter(id => !id.startsWith("queue_check_unavailable:"));
  const impact = a.impact ? ` TL etkisi: ${tl(a.impact.value)}${a.impact.estimated ? " (tahmini)" : ""}.` : "";
  const text = `${t.what}${impact} ${t.action}${open.length ? ` Açık iş: ${open.join(", ")}.` : ""} Kanıt: ${a.evidenceIds.join(", ") || "yok"}. Aciliyet: ${URGENCY_LABEL[urgency]}.`;
  return { fingerprint: a.fingerprint, cooldownKey: a.cooldownKey, rule: a.rule, severity: a.severity, category: a.category, entity: a.entityId, urgency,
    impactTry: a.impact?.value ?? null, impactKind: a.impact?.kind ?? null, impactEstimated: a.impact?.estimated ?? false,
    what: t.what, action: t.action, text, evidenceIds: a.evidenceIds, openRecords: open, actionable: a.actionable };
}

/** Tüm anomaliler → bulgular; sıra: aciliyet, sonra |TL etkisi|. */
export function renderFindings(anomalies: Anomaly[], evidence: Evidence[], o: FindingOptions): Finding[] {
  return anomalies.map(a => renderFinding(a, evidence, o))
    .sort((x, y) => URGENCY_RANK[x.urgency] - URGENCY_RANK[y.urgency] || Math.abs(y.impactTry ?? 0) - Math.abs(x.impactTry ?? 0) || x.fingerprint.localeCompare(y.fingerprint));
}
