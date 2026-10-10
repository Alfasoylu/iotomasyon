// ÖLÜ STOK EYLEM PLANI — SAF öneri motoru (2026-10-10, Alperen: "ölü stokta yeni ilan, fiyat düşürme, başlık/açıklama/foto
// optimizasyonu — Trendyol ve PttAVM"). Bu modül pazaryerine HİÇBİR ŞEY göndermez; yalnız öneri üretir. Uygulama insan onaylıdır.
// Kurallar:
//  - Fiyat tabanı = başabaş: (birim maliyet + kargo) / (1 − komisyon − hizmet payı). Öneri tabanın altına inmez; taban bilinmiyorsa
//    fiyat önerisi YOK (BİLİNMİYOR), "maliyet gir" eylemi döner.
//  - İndirim adımı: mevcut gerçekleşen fiyattan %step (varsayılan %10); ölü stok yaşı uzadıkça adım artar (60+ gün %15, 120+ gün %20),
//    hiçbir zaman tabanın altına inmez.
//  - Yeni ilan (Entegra'dan bağımsız, ayrı SKU/barkod, stok XML'den): son 90 günde satış yoksa ve stok > 0 ise önerilir; mükerrer
//    ilan riski uyarısı her zaman eklenir.
//  - İçerik: açıklama yok/kısa (< 300 karakter), görsel yok, barkod yok → ilgili optimizasyon eylemi.
export type DeadStockRow = { sku: string; name: string; stock: number; unitCostTry: number | null; boundCapitalTry: number | null;
  units90: number; daysSinceSale: number | null; avgPrice90Try: number | null; descriptionLength: number; hasImage: boolean; hasBarcode: boolean;
  alarm: string | null };
export type ChannelEconomics = { channel: "TRENDYOL" | "PTTAVM"; commissionRate: number | null; serviceFeeRate: number; shippingTry: number | null };
export type Action =
  | { kind: "PRICE_DROP"; channel: ChannelEconomics["channel"]; fromTry: number; toTry: number; floorTry: number; stepPct: number }
  | { kind: "PRICE_UNKNOWN"; channel: ChannelEconomics["channel"]; reason: string }
  | { kind: "NEW_LISTING"; channel: ChannelEconomics["channel"]; reason: string; risk: string }
  | { kind: "CONTENT"; field: "description" | "image" | "barcode"; reason: string };
export type Plan = { sku: string; name: string; priority: number; boundCapitalTry: number | null; actions: Action[] };

export const DUPLICATE_LISTING_RISK = "Aynı ürünün farklı barkodla ikinci ilanı pazaryeri kurallarında mükerrer ilan sayılabilir — ilk ilandan önce kural teyidi";

export function floorPrice(unitCostTry: number | null, ch: ChannelEconomics): number | null {
  if (unitCostTry == null || unitCostTry <= 0 || ch.commissionRate == null || ch.shippingTry == null) return null;
  const keep = 1 - ch.commissionRate - ch.serviceFeeRate;
  if (keep <= 0) return null;
  return Math.ceil(((unitCostTry + ch.shippingTry) / keep) * 100) / 100;
}

export function stepPct(daysSinceSale: number | null): number {
  if (daysSinceSale == null || daysSinceSale >= 120) return 20;
  if (daysSinceSale >= 60) return 15;
  return 10;
}

export function planFor(row: DeadStockRow, channels: ChannelEconomics[]): Plan {
  const actions: Action[] = [];
  for (const ch of channels) {
    const floor = floorPrice(row.unitCostTry, ch);
    if (floor == null) actions.push({ kind: "PRICE_UNKNOWN", channel: ch.channel, reason: row.unitCostTry == null ? "birim maliyet yok" : "kanal komisyonu/kargo bilinmiyor" });
    else if (row.avgPrice90Try != null && row.avgPrice90Try > floor) {
      const step = stepPct(row.daysSinceSale);
      const to = Math.max(floor, Math.round(row.avgPrice90Try * (1 - step / 100) * 100) / 100);
      if (to < row.avgPrice90Try) actions.push({ kind: "PRICE_DROP", channel: ch.channel, fromTry: row.avgPrice90Try, toTry: to, floorTry: floor, stepPct: step });
    }
    if (row.stock > 0 && row.units90 === 0) actions.push({ kind: "NEW_LISTING", channel: ch.channel, reason: "son 90 günde satış yok", risk: DUPLICATE_LISTING_RISK });
  }
  if (row.descriptionLength < 300) actions.push({ kind: "CONTENT", field: "description", reason: row.descriptionLength === 0 ? "açıklama yok" : "açıklama kısa (< 300 karakter)" });
  if (!row.hasImage) actions.push({ kind: "CONTENT", field: "image", reason: "görsel yok" });
  if (!row.hasBarcode) actions.push({ kind: "CONTENT", field: "barcode", reason: "barkod yok (yeni ilan için gerekli)" });
  // Öncelik: bağlı sermaye (TL) × yaş katsayısı; kırmızı alarm öne
  const age = row.daysSinceSale == null ? 2 : row.daysSinceSale >= 120 ? 2 : row.daysSinceSale >= 60 ? 1.5 : 1;
  const priority = Math.round((row.boundCapitalTry ?? 0) * age * (row.alarm === "KIRMIZI" ? 2 : 1));
  return { sku: row.sku, name: row.name, priority, boundCapitalTry: row.boundCapitalTry, actions };
}

export function planAll(rows: DeadStockRow[], channels: ChannelEconomics[]): Plan[] {
  return rows.map(r => planFor(r, channels)).sort((a, b) => b.priority - a.priority || a.sku.localeCompare(b.sku));
}

/** Kalibre net oran (cfo_kanal_net_oran.net_oran: komisyon + hizmet + kargo düşülmüş, banka ekstresinden) → taban = maliyet / net oran. */
export function economicsFromNetRate(channel: ChannelEconomics["channel"], netRate: number | null): ChannelEconomics {
  const ok = netRate != null && netRate > 0 && netRate < 1;
  return { channel, commissionRate: ok ? Math.round((1 - netRate) * 10000) / 10000 : null, serviceFeeRate: 0, shippingTry: 0 };
}

/** Entegra'dan bağımsız ilan için ayrı SKU/barkod: "ALFOS-" + SKU (yalnız harf/rakam . - _), en fazla 40 karakter. */
export function independentCode(sku: string): string {
  const clean = sku.normalize("NFKD").replace(/[^\w.-]/g, "").replace(/_/g, "-");
  return `ALFOS-${clean}`.slice(0, 40);
}
