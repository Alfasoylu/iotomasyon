// Bağımsız ilan stok eşitlemesinin SAF planlayıcısı (veritabanı/ağ yok) — çağıran lib/olu-stok/stock-sync.ts; kurallar orada.
import type { PriceInventoryItem } from "@/lib/trendyol/write";

export const XML_MAX_AGE_HOURS = 36;
export const TRENDYOL_MAX_QTY = 20000;
export const PTTAVM_MAX_QTY = 9999;

/** Çift ilan fazla satış sınırı (Alperen onayı 2026-10-10): aynı fiziksel stok Entegra ilanında ve bağımsız (ALFOS-) ilanda birlikte
 *  görünür; XML ancak ertesi gece düşer. Bağımsız ilan en fazla TAVAN adet gösterir → bir günde en fazla TAVAN adet fazla satılabilir.
 *  Ortam: OLU_STOK_BAGIMSIZ_STOK_TAVANI (varsayılan 3; 0 = bağımsız ilan satışa kapalı). */
export const DEFAULT_INDEPENDENT_CAP = 3;
export function independentCap(env: Record<string, string | undefined> = process.env): number {
  const v = Number(env.OLU_STOK_BAGIMSIZ_STOK_TAVANI);
  return env.OLU_STOK_BAGIMSIZ_STOK_TAVANI?.trim() && Number.isInteger(v) && v >= 0 ? v : DEFAULT_INDEPENDENT_CAP;
}
export const independentQty = (xmlQty: number, cap: number, maxQty: number) => Math.max(0, Math.min(cap, maxQty, Math.trunc(xmlQty)));

export type Listing = { id: string; sku: string; barcode: string; lastQty: number | null };
export type XmlStock = { qty: number; syncedAt: Date | null };

/** Saf planlayıcı: hangi ilana hangi adet gidecek, hangileri neden atlandı. */
export function planStockSync(listings: Listing[], xml: Map<string, XmlStock>, now: Date, maxQty = TRENDYOL_MAX_QTY, cap = Number.MAX_SAFE_INTEGER): { items: (PriceInventoryItem & { id: string; sku: string })[]; skipped: { sku: string; reason: string }[] } {
  const items: (PriceInventoryItem & { id: string; sku: string })[] = []; const skipped: { sku: string; reason: string }[] = [];
  for (const l of listings) {
    const x = xml.get(l.sku);
    if (!x) { skipped.push({ sku: l.sku, reason: "ürün yok" }); continue; }
    if (!x.syncedAt || now.getTime() - x.syncedAt.getTime() > XML_MAX_AGE_HOURS * 3600_000) { skipped.push({ sku: l.sku, reason: "XML stoğu bayat" }); continue; }
    const qty = independentQty(x.qty, cap, maxQty);
    if (qty === l.lastQty) { skipped.push({ sku: l.sku, reason: "değişmedi" }); continue; }
    items.push({ id: l.id, sku: l.sku, barcode: l.barcode, quantity: qty });
  }
  return { items, skipped };
}
