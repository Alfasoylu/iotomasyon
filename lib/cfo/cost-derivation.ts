// CFO BİRİM MALİYETİ — İTHALAT MOTORUNDAN OTOMATİK TÜRETME (SAF, deterministik; CFO-029, RF-033).
// Karar (DECISION-LOG 2026-10-10, Alperen "deniz ve havaya ithalat öneri motoru karar vermeli"): CFO birim maliyeti =
// lib/importer-cost.ts calcImportCost toplamı × güncel USD/TRY; gümrük GTİP'ten (cfo_gtip_tarife yasal yükü, KDV + ÖTV dahil — D-P06
// maliyet KDV dahil kayıtlı); deniz/hava kararını motor verir (tercih yoksa yıllık ROI). Bu modül yalnız NE değişmeli sorusunu
// cevaplar; yazma ve günlük lib/cfo/cost-derivation-data.ts'de (eşzamanlılık korumalı, her alan cfo_change_log'a).
//   İTHAL   RMB > 0 ve ağırlık > 0 (ve IC_PIYASA değil): gümrük % = GTİP tarifesi (en uzun önek), tarife yoksa kayıtlı %;
//           ikisi de yoksa ürün ATLANIR (varsayılan %30 maliyete yazılmaz — CFO-003: sabit yedek bilinmeyeni gizlemez).
//   YURTİÇİ shippingMethodPref = IC_PIYASA ve unitCostUsd > 0 (İstoç vb. "USD + KDV" × 1,2): yalnız TL = USD × kur.
//   RMB/USD tek kaynak lib/fx/current.ts (elle girilen aylık kur, sabit yedek yok); RMB bilinmiyor ya da USD/TRY "varsayılan" ise
//   HİÇBİR ŞEY yazılmaz (kur_bilinmiyor). İthalatçı görünümü ve sermaye sağlığı aynı kuru kullanır.
// Yuvarlama 2026-10-10 tek seferlik türetmeyle aynı: USD 4 hane, TL = round(toplam USD × kur, 2), gümrük % 1 hane.
import { calcImportCost, DROPSHIP_STOCK_THRESHOLD } from "../importer-cost";

export const COST_DERIVATION_SOURCE = "CFO-029 maliyet türetme";
export const DOMESTIC_PREF = "IC_PIYASA";
/** Alarm (cost_jump): stoklu bir üründe birim maliyet bu yüzde kadar değiştiyse ya da stok maliyeti toplamı bu kadar oynadıysa. */
export const COST_JUMP_PCT = 25;
export const COST_JUMP_STOCK_TRY = 50_000;

export type CostRow = {
  sku: string;
  sourceCostRmb: number | null; weightKg: number | null; importPaymentFeePct: number | null; shippingMethodPref: string | null;
  /** Ham DB metni (eşzamanlılık koruması aynen bu değerle karşılaştırır). */
  customsRatePct: string | null; unitCostUsd: string | null; unitCostTry: string | null;
  /** MarketplacePrice TRENDYOL (TL); yoksa XML Trendyol fiyatı (USD) × kur — ithalatçı görünümüyle aynı. */
  trendyolPriceTry: number | null; xmlTrendyolPriceUsd: number | null;
  /** cfo_gtip_tarife en uzun önek yükü (%; KDV + ÖTV dahil, 1 hane); GTİP ya da tarife yoksa null. */
  tariffBurdenPct: number | null;
  stock: number;
};
export type CostFx = { usdTry: number; rmbPerUsd: number | null; usdTrySource: string; rmbSource: string };
export type CostField = "customsRatePct" | "unitCostUsd" | "unitCostTry";
export type CostUpdate = {
  sku: string; kind: "ITHAL" | "YURTICI"; method: "SEA" | "AIR" | null;
  old: Record<CostField, string | null>; next: Record<CostField, string | null>;
  changes: { field: CostField; old: string | null; new: string }[];
  /** Değerlenen stok (1–999; ≥1000 dropship yer tutucusu sayılmaz) × TL farkı — KDV dahil. */
  deltaStockTry: number; pct: number | null; stock: number;
};
export type CostDerivation = {
  status: "ok" | "kur_bilinmiyor"; fx: CostFx;
  updates: CostUpdate[]; skipped: { sku: string; reason: "gumruk_bilinmiyor" }[]; unchanged: number;
  deltaStockTry: number; bigMovers: CostUpdate[];
};

const num = (s: string | null) => (s == null || s.trim() === "" ? null : Number(s));
const r = (v: number, d: number) => { const k = 10 ** d; return Math.round(v * k) / k; };
const valuedStock = (s: number) => (s > 0 && s < DROPSHIP_STOCK_THRESHOLD ? s : 0);

export function deriveUnitCosts(rows: CostRow[], fx: CostFx): CostDerivation {
  const out: CostDerivation = { status: "ok", fx, updates: [], skipped: [], unchanged: 0, deltaStockTry: 0, bigMovers: [] };
  // RMB/USD tek kaynak (lib/fx/current.ts: elle girilen aylık kur); bilinmiyorsa (null) ya da USD/TRY varsayılandaysa hiçbir şey yazılmaz
  if (fx.usdTrySource === "varsayılan" || fx.rmbPerUsd == null || !(fx.rmbPerUsd > 0) || !(fx.usdTry > 0)) return { ...out, status: "kur_bilinmiyor" };
  for (const p of rows) {
    const old = { customsRatePct: p.customsRatePct, unitCostUsd: p.unitCostUsd, unitCostTry: p.unitCostTry };
    const next: Record<CostField, string | null> = { ...old };
    let kind: CostUpdate["kind"], method: CostUpdate["method"] = null;
    if (p.shippingMethodPref?.trim().toUpperCase() === DOMESTIC_PREF) {
      const usd = num(p.unitCostUsd);
      if (usd == null || !(usd > 0)) continue;
      kind = "YURTICI";
      next.unitCostTry = r(usd * fx.usdTry, 2).toFixed(2);
    } else {
      if (!((p.sourceCostRmb ?? 0) > 0) || !((p.weightKg ?? 0) > 0)) continue;
      const stored = num(p.customsRatePct);
      const customs = p.tariffBurdenPct ?? stored;
      if (customs == null) { out.skipped.push({ sku: p.sku, reason: "gumruk_bilinmiyor" }); continue; }
      if (p.tariffBurdenPct != null && (stored == null || Math.abs(stored - p.tariffBurdenPct) > 0.05)) next.customsRatePct = p.tariffBurdenPct.toFixed(1);
      const trendyolPriceTry = p.trendyolPriceTry ?? (p.xmlTrendyolPriceUsd != null ? p.xmlTrendyolPriceUsd * fx.usdTry : null);
      const res = calcImportCost({ sourceCostRmb: p.sourceCostRmb, weightKg: p.weightKg, customsRatePct: customs, importPaymentFeePct: p.importPaymentFeePct,
        shippingMethodPref: p.shippingMethodPref, rmbUsdRate: fx.rmbPerUsd, trendyolPriceTry, usdTryRate: fx.usdTry });
      if (!res) continue;
      kind = "ITHAL"; method = res.shippingMethod;
      next.unitCostUsd = r(res.totalCostUsd, 4).toFixed(4);
      next.unitCostTry = r(res.totalCostUsd * fx.usdTry, 2).toFixed(2);
    }
    const changes: CostUpdate["changes"] = [];
    const tol: Record<CostField, number> = { customsRatePct: 0.05, unitCostUsd: 0.00005, unitCostTry: 0.005 };
    for (const f of ["customsRatePct", "unitCostUsd", "unitCostTry"] as const) {
      const o = num(old[f]), n = num(next[f]);
      if (n == null) continue;
      if (o == null || Math.abs(o - n) >= tol[f]) changes.push({ field: f, old: old[f], new: next[f]! });
      else next[f] = old[f];
    }
    if (!changes.length) { out.unchanged++; continue; }
    const oT = num(old.unitCostTry), nT = num(next.unitCostTry)!;
    const stock = valuedStock(p.stock);
    const u: CostUpdate = { sku: p.sku, kind, method, old, next, changes, stock,
      deltaStockTry: r(stock * (nT - (oT ?? 0)), 2), pct: oT != null && oT > 0 ? r((nT / oT - 1) * 100, 1) : null };
    out.updates.push(u);
    out.deltaStockTry = r(out.deltaStockTry + u.deltaStockTry, 2);
    if (stock > 0 && u.pct != null && Math.abs(u.pct) >= COST_JUMP_PCT) out.bigMovers.push(u);
  }
  return out;
}

/** Günlük (cfo_change_log) alan satırları + özet notu. Özel not/kişisel veri yok; yalnız maliyet alanları. */
export function derivationLog(d: CostDerivation): { rows: { sku: string; field: CostField; old: string | null; new: string; note: string }[]; summary: string } {
  const fxNote = `USD/TRY ${d.fx.usdTry} (${d.fx.usdTrySource}), RMB/USD ${d.fx.rmbPerUsd} (${d.fx.rmbSource})`;
  const rows = d.updates.flatMap(u => u.changes.map(c => ({ sku: u.sku, field: c.field, old: c.old, new: c.new,
    note: u.kind === "ITHAL"
      ? `İthalat motoru (calcImportCost): ${u.method === "SEA" ? "deniz" : "hava"}; gümrük % GTİP tarifesi (KDV+ÖTV dahil); ${fxNote}`
      : `Yurt içi alış (IC_PIYASA): unitCostUsd × USD/TRY; ${fxNote}` })));
  const ithal = d.updates.filter(u => u.kind === "ITHAL").length, yurtici = d.updates.length - ithal;
  const summary = `${d.updates.length} ürün (${ithal} ithal, ${yurtici} yurt içi), ${rows.length} alan; değerlenen stok maliyeti farkı (KDV dahil) `
    + `${d.deltaStockTry >= 0 ? "+" : ""}${d.deltaStockTry.toFixed(2)} TL; %${COST_JUMP_PCT}+ değişen stoklu ürün ${d.bigMovers.length}; `
    + `gümrüğü bilinmediği için atlanan ${d.skipped.length}; değişmeyen ${d.unchanged}. ${fxNote}`;
  return { rows, summary };
}
