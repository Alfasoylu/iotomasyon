// BAĞIMSIZ İLAN STOK EŞİTLEMESİ (Alperen 2026-10-10: "stok adedini XML'den çekersin"; "önerilerini onaylıyorum"). Gece XML senkronundan
// hemen sonra (app/api/cron/xml-sync after-zinciri) çalışır. Kapsam DAR — AI-RULES ölü stok istisnası:
//  - YALNIZ olu_stok_bagimsiz_ilan'daki ALFOS-… barkodlar (Entegra ilanlarına dokunmaz), YALNIZ stok adedi (fiyat otomatik değişmez).
//  - Kaynak Product.stockQuantity (Entegra XML), TAVANLA sınırlı (independentCap — çift ilan fazla satış sınırı). XML bu gece güncellenmediyse (lastStockSyncAt > 36 saat) HİÇBİR şey gönderilmez —
//    bayat stok yayılmaz. Değişmeyen adet gönderilmez (Trendyol 15 dk, PttAVM 5 dk aynı isteği reddeder).
//  - Kanal bayrağı (TRENDYOL_WRITE_ENABLED / PTTAVM_WRITE_ENABLED) kapalıysa o kanal atlanır; sonuç cfo_change_log'a kanal başına tek satır.
import { prisma } from "@/lib/prisma";
import { updatePriceAndInventory, trendyolWriteEnabled } from "@/lib/trendyol/write";
import { pttavmConfig } from "@/lib/pttavm/client";
import { pttavmWriteEnabled, updateStockPrices } from "@/lib/pttavm/write";
import { independentCap, planStockSync, PTTAVM_MAX_QTY, TRENDYOL_MAX_QTY } from "./stock-plan";

type Channel = "TRENDYOL" | "PTTAVM";
type ChannelResult = { channel: Channel; sent: number; skipped: number; trackingId?: string | null; note?: string };

async function trendyolCfg() {
  const c = await prisma.trendyolConfig.findUnique({ where: { id: "singleton" } });
  return c?.isEnabled && c.supplierId && c.apiKey && c.apiSecret ? { supplierId: c.supplierId, apiKey: c.apiKey, apiSecret: c.apiSecret } : null;
}

async function syncChannel(channel: Channel, now: Date): Promise<ChannelResult> {
  const ptt = pttavmConfig();
  const enabled = channel === "TRENDYOL" ? trendyolWriteEnabled() : pttavmWriteEnabled(ptt);
  if (!enabled) return { channel, sent: 0, skipped: 0, note: "yazma bayrağı kapalı" };
  const rows = await prisma.$queryRaw<{ id: string; sku: string; barkod: string; son_stok: number | null }[]>`
    select id, sku, barkod, son_stok from olu_stok_bagimsiz_ilan where kanal = ${channel} and durum in ('GONDERILDI', 'AKTIF')`;
  if (!rows.length) return { channel, sent: 0, skipped: 0, note: "kayıtlı bağımsız ilan yok" };
  const products = await prisma.product.findMany({ where: { sku: { in: rows.map(r => r.sku) } }, select: { sku: true, stockQuantity: true, lastStockSyncAt: true } });
  const xml = new Map(products.map(p => [p.sku, { qty: p.stockQuantity, syncedAt: p.lastStockSyncAt }]));
  const { items, skipped } = planStockSync(rows.map(r => ({ id: r.id, sku: r.sku, barcode: r.barkod, lastQty: r.son_stok })), xml, now,
    channel === "TRENDYOL" ? TRENDYOL_MAX_QTY : PTTAVM_MAX_QTY, independentCap());
  if (!items.length) return { channel, sent: 0, skipped: skipped.length };
  let trackingId: string | null;
  if (channel === "TRENDYOL") {
    const cfg = await trendyolCfg(); if (!cfg) return { channel, sent: 0, skipped: skipped.length, note: "Trendyol API yapılandırması eksik" };
    trackingId = (await updatePriceAndInventory(cfg, items.map(i => ({ barcode: i.barcode, quantity: i.quantity })))).batchRequestId;
  } else {
    trackingId = (await updateStockPrices(ptt!, items.map(i => ({ barcode: i.barcode, quantity: i.quantity })))).trackingId;
  }
  for (const i of items) await prisma.$executeRaw`
    update olu_stok_bagimsiz_ilan set son_stok = ${i.quantity}, son_stok_at = now(), son_stok_islem = ${trackingId} where id = ${i.id}`;
  await prisma.cfoChangeLog.create({ data: { area: "stok", kind: "aksiyon", item: `Bağımsız ilan stok eşitlemesi (${channel})`,
    newValue: items.map(i => `${i.barcode}=${i.quantity}`).join(", ").slice(0, 2000), source: "Sistem (XML senkronu sonrası)",
    note: `işlem ${trackingId ?? "-"}; atlanan ${skipped.length}` } });
  return { channel, sent: items.length, skipped: skipped.length, trackingId };
}

export async function syncIndependentStock(now = new Date()): Promise<ChannelResult[]> {
  const exists = await prisma.$queryRaw<{ t: string | null }[]>`select to_regclass('public.olu_stok_bagimsiz_ilan')::text t`;
  if (!exists[0]?.t) return [];
  const out: ChannelResult[] = [];
  for (const ch of ["TRENDYOL", "PTTAVM"] as const) {
    try { out.push(await syncChannel(ch, now)); } catch (e) {
      // Bir kanalın hatası diğerini durdurmaz; günlüğe yazılır.
      await prisma.cfoChangeLog.create({ data: { area: "stok", kind: "aksiyon", item: `Bağımsız ilan stok eşitlemesi (${ch}) — HATA`,
        source: "Sistem (XML senkronu sonrası)", note: (e instanceof Error ? e.message : "hata").slice(0, 500) } }).catch(() => undefined);
      out.push({ channel: ch, sent: 0, skipped: 0, note: "hata" });
    }
  }
  return out;
}

/** Cron zincirinde güvenli çağrı: hata senkronu düşürmez. */
export async function safeSyncIndependentStock(): Promise<void> {
  try { await syncIndependentStock(); } catch { /* tablo sorgusu dahil hiçbir hata XML senkronunu etkilemez */ }
}
