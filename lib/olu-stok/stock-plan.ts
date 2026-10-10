// Bağımsız ilan stok eşitlemesinin SAF planlayıcısı (veritabanı/ağ yok) — çağıran lib/olu-stok/stock-sync.ts; kurallar orada.
import type { PriceInventoryItem } from "@/lib/trendyol/write";

export const XML_MAX_AGE_HOURS = 36;
export const TRENDYOL_MAX_QTY = 20000;

export type Listing = { id: string; sku: string; barcode: string; lastQty: number | null };
export type XmlStock = { qty: number; syncedAt: Date | null };

/** Saf planlayıcı: hangi ilana hangi adet gidecek, hangileri neden atlandı. */
export function planStockSync(listings: Listing[], xml: Map<string, XmlStock>, now: Date): { items: (PriceInventoryItem & { id: string; sku: string })[]; skipped: { sku: string; reason: string }[] } {
  const items: (PriceInventoryItem & { id: string; sku: string })[] = []; const skipped: { sku: string; reason: string }[] = [];
  for (const l of listings) {
    const x = xml.get(l.sku);
    if (!x) { skipped.push({ sku: l.sku, reason: "ürün yok" }); continue; }
    if (!x.syncedAt || now.getTime() - x.syncedAt.getTime() > XML_MAX_AGE_HOURS * 3600_000) { skipped.push({ sku: l.sku, reason: "XML stoğu bayat" }); continue; }
    const qty = Math.max(0, Math.min(TRENDYOL_MAX_QTY, Math.trunc(x.qty)));
    if (qty === l.lastQty) { skipped.push({ sku: l.sku, reason: "değişmedi" }); continue; }
    items.push({ id: l.id, sku: l.sku, barcode: l.barcode, quantity: qty });
  }
  return { items, skipped };
}
