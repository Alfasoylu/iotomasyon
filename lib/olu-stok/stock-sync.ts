// BAĞIMSIZ İLAN STOK EŞİTLEMESİ (Alperen 2026-10-10: "stok adedini XML'den çekersin"; "önerilerini onaylıyorum"). Gece XML senkronundan
// hemen sonra (app/api/cron/xml-sync after-zinciri) çalışır. Kapsam DAR — AI-RULES ölü stok istisnası:
//  - YALNIZ olu_stok_bagimsiz_ilan'daki ALFOS-… barkodlar (Entegra ilanlarına dokunmaz), YALNIZ stok adedi (fiyat otomatik değişmez).
//  - Kaynak Product.stockQuantity (Entegra XML). XML bu gece güncellenmediyse (lastStockSyncAt > 36 saat) HİÇBİR şey gönderilmez —
//    bayat stok yayılmaz. Değişmeyen adet gönderilmez (Trendyol aynı isteği 15 dk tekrar reddeder).
//  - TRENDYOL_WRITE_ENABLED kapalıysa veya tablo yoksa sessizce atlar; sonuç cfo_change_log'a tek satır (stok / aksiyon).
import { prisma } from "@/lib/prisma";
import { updatePriceAndInventory, trendyolWriteEnabled } from "@/lib/trendyol/write";
import { planStockSync } from "./stock-plan";

async function trendyolCfg() {
  const c = await prisma.trendyolConfig.findUnique({ where: { id: "singleton" } });
  return c?.isEnabled && c.supplierId && c.apiKey && c.apiSecret ? { supplierId: c.supplierId, apiKey: c.apiKey, apiSecret: c.apiSecret } : null;
}

export async function syncIndependentStock(now = new Date()): Promise<{ sent: number; skipped: number; batchRequestId?: string; note?: string }> {
  if (!trendyolWriteEnabled()) return { sent: 0, skipped: 0, note: "TRENDYOL_WRITE_ENABLED kapalı" };
  const exists = await prisma.$queryRaw<{ t: string | null }[]>`select to_regclass('public.olu_stok_bagimsiz_ilan')::text t`;
  if (!exists[0]?.t) return { sent: 0, skipped: 0, note: "olu_stok_bagimsiz_ilan tablosu yok" };
  const rows = await prisma.$queryRaw<{ id: string; sku: string; barkod: string; son_stok: number | null }[]>`
    select id, sku, barkod, son_stok from olu_stok_bagimsiz_ilan where kanal = 'TRENDYOL' and durum in ('GONDERILDI', 'AKTIF')`;
  if (!rows.length) return { sent: 0, skipped: 0, note: "kayıtlı bağımsız ilan yok" };
  const products = await prisma.product.findMany({ where: { sku: { in: rows.map(r => r.sku) } }, select: { sku: true, stockQuantity: true, lastStockSyncAt: true } });
  const xml = new Map(products.map(p => [p.sku, { qty: p.stockQuantity, syncedAt: p.lastStockSyncAt }]));
  const { items, skipped } = planStockSync(rows.map(r => ({ id: r.id, sku: r.sku, barcode: r.barkod, lastQty: r.son_stok })), xml, now);
  if (!items.length) return { sent: 0, skipped: skipped.length };
  const cfg = await trendyolCfg();
  if (!cfg) return { sent: 0, skipped: skipped.length, note: "Trendyol API yapılandırması eksik" };
  const { batchRequestId } = await updatePriceAndInventory(cfg, items.map(i => ({ barcode: i.barcode, quantity: i.quantity })));
  for (const i of items) await prisma.$executeRaw`
    update olu_stok_bagimsiz_ilan set son_stok = ${i.quantity}, son_stok_at = now(), son_stok_islem = ${batchRequestId} where id = ${i.id}`;
  await prisma.cfoChangeLog.create({ data: { area: "stok", kind: "aksiyon", item: "Bağımsız ilan stok eşitlemesi (Trendyol)",
    newValue: items.map(i => `${i.barcode}=${i.quantity}`).join(", ").slice(0, 2000), source: "Sistem (XML senkronu sonrası)",
    note: `işlem ${batchRequestId}; atlanan ${skipped.length}` } });
  return { sent: items.length, skipped: skipped.length, batchRequestId };
}

/** Cron zincirinde güvenli çağrı: hata senkronu düşürmez, günlüğe yazılır. */
export async function safeSyncIndependentStock(): Promise<void> {
  try { await syncIndependentStock(); } catch (e) {
    await prisma.cfoChangeLog.create({ data: { area: "stok", kind: "aksiyon", item: "Bağımsız ilan stok eşitlemesi (Trendyol) — HATA",
      source: "Sistem (XML senkronu sonrası)", note: (e instanceof Error ? e.message : "hata").slice(0, 500) } }).catch(() => undefined);
  }
}
