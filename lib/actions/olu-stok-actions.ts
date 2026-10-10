"use server";
// ÖLÜ STOK pazaryeri eylemleri — İNSAN ONAYLI tek yazma kapısı (Alperen kararı 2026-10-10; docs/AI-RULES.md istisnası,
// docs/DECISION-LOG.md). Her eylem: marketplaceListings.write izni + "ONAYLIYORUM" + sunucuda yeniden doğrulama (başabaş tabanı,
// ±%50 üstü değişimde ikinci onay) + cfo_change_log kaydı (kim, eski → yeni, işlem no). Otomatik iş / AI CFO bunları çağırmaz.
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import type { ActionResult } from "@/types/actions";
import type { TrendyolConfig } from "@/lib/trendyol-api";
import { createProducts, getBatchResult, updateApprovedContent, updatePriceAndInventory } from "@/lib/trendyol/write";
import { pttavmConfig } from "@/lib/pttavm/client";
import { trackingResult, updateStockPrices } from "@/lib/pttavm/write";
import { floorPrice, independentCode } from "@/lib/olu-stok/plan";
import { loadChannels, loadDeadStock } from "@/lib/olu-stok/load";

const CONFIRM = "ONAYLIYORUM";
const DENIED = { ok: false, message: "Bu işlem için yetkiniz yok (marketplaceListings.write)." } as const;
type Result = ActionResult & { trackingId?: string | null };

async function guard(confirm: string) {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.MARKETPLACE_LISTINGS_WRITE))) return { error: DENIED };
  if (confirm.trim() !== CONFIRM) return { error: { ok: false, message: `Onay için "${CONFIRM}" yazın.` } as const };
  return { user };
}
async function trendyolCfg(): Promise<TrendyolConfig | null> {
  const c = await prisma.trendyolConfig.findUnique({ where: { id: "singleton" } });
  return c?.isEnabled && c.supplierId && c.apiKey && c.apiSecret ? { supplierId: c.supplierId, apiKey: c.apiKey, apiSecret: c.apiSecret } : null;
}
async function log(area: "fiyat" | "urun", item: string, oldValue: string | null, newValue: string, email: string, note: string) {
  await prisma.cfoChangeLog.create({ data: { area, kind: "aksiyon", item, oldValue, newValue, source: `Kullanıcı: ${email}`, note } });
}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Bilinmeyen hata");

// ── Fiyat değişikliği ────────────────────────────────────────────────────────
const priceSchema = z.object({ channel: z.enum(["TRENDYOL", "PTTAVM"]), sku: z.string().min(1), barcode: z.string().trim().min(1, "Barkod gerekli"),
  newPrice: z.number().positive(), oldPrice: z.number().positive().nullable(), confirm: z.string(), confirmLarge: z.boolean().default(false) });

export async function applyPriceChangeAction(input: z.input<typeof priceSchema>): Promise<Result> {
  const p = priceSchema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Geçersiz veri." };
  const g = await guard(p.data.confirm); if ("error" in g) return g.error!;
  const { channel, sku, barcode, newPrice, oldPrice } = p.data;
  const [ctx, channels] = await Promise.all([loadDeadStock(), loadChannels()]);
  const row = ctx.get(sku)?.row;
  if (!row) return { ok: false, message: `${sku} ölü stok listesinde değil.` };
  const floor = floorPrice(row.unitCostTry, channels.find(c => c.channel === channel)!);
  if (floor == null) return { ok: false, message: "Başabaş tabanı bilinmiyor (birim maliyet ya da kanal net oranı yok) — fiyat düşürülmez." };
  if (newPrice < floor) return { ok: false, message: `Yeni fiyat başabaş tabanının (${floor} TL) altında.` };
  if (oldPrice != null && Math.abs(newPrice - oldPrice) / oldPrice > 0.5 && !p.data.confirmLarge)
    return { ok: false, message: "Değişim ±%50'yi aşıyor — ikinci onay kutusunu işaretleyin." };
  let trackingId: string | null = null;
  try {
    if (channel === "TRENDYOL") {
      const cfg = await trendyolCfg(); if (!cfg) return { ok: false, message: "Trendyol API yapılandırması eksik veya pasif." };
      const listPrice = oldPrice != null && oldPrice >= newPrice ? oldPrice : newPrice;
      trackingId = (await updatePriceAndInventory(cfg, [{ barcode, salePrice: newPrice, listPrice }])).batchRequestId;
    } else {
      const cfg = pttavmConfig(); if (!cfg) return { ok: false, message: "PttAVM API anahtarları tanımlı değil." };
      trackingId = (await updateStockPrices(cfg, [{ barcode, priceWithVAT: newPrice }])).trackingId;
    }
  } catch (e) {
    await log("fiyat", `${channel} ${sku} fiyat`, oldPrice?.toString() ?? null, `${newPrice} (HATA)`, g.user!.email, errMsg(e));
    return { ok: false, message: `${channel} reddetti: ${errMsg(e)}` };
  }
  await log("fiyat", `${channel} ${sku} fiyat`, oldPrice?.toString() ?? null, String(newPrice), g.user!.email, `barkod ${barcode}; taban ${floor}; işlem ${trackingId ?? "-"}`);
  return { ok: true, trackingId, message: `Gönderildi — işlem no ${trackingId ?? "-"}. Sonucu "İşlem sonucu" ile kontrol edin.` };
}

// ── Trendyol onaylı ürün içeriği (başlık / açıklama / görsel) ────────────────
const contentSchema = z.object({ sku: z.string().min(1), contentId: z.number().int().positive(), title: z.string().trim().max(100).optional(),
  description: z.string().trim().max(30000).optional(), images: z.array(z.string().url()).max(8).optional(), confirm: z.string() });

export async function applyContentAction(input: z.input<typeof contentSchema>): Promise<Result> {
  const p = contentSchema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Geçersiz veri." };
  const g = await guard(p.data.confirm); if ("error" in g) return g.error!;
  const cfg = await trendyolCfg(); if (!cfg) return { ok: false, message: "Trendyol API yapılandırması eksik veya pasif." };
  const { sku, contentId, title, description, images } = p.data;
  const fields = [title && "başlık", description && "açıklama", images?.length && "görsel"].filter(Boolean).join(", ");
  try {
    const { batchRequestId } = await updateApprovedContent(cfg, [{ contentId, title: title || undefined, description: description || undefined, images: images?.length ? images : undefined }]);
    await log("urun", `TRENDYOL ${sku} içerik`, null, fields, g.user!.email, `contentId ${contentId}; işlem ${batchRequestId}`);
    return { ok: true, trackingId: batchRequestId, message: `Gönderildi (${fields}) — Trendyol içerik kontrolünden sonra yayına girer.` };
  } catch (e) {
    await log("urun", `TRENDYOL ${sku} içerik`, null, `${fields} (HATA)`, g.user!.email, errMsg(e));
    return { ok: false, message: `Trendyol reddetti: ${errMsg(e)}` };
  }
}

// ── Entegra'dan bağımsız yeni Trendyol ilanı (ayrı SKU/barkod, stok XML'den) ─
const listingSchema = z.object({ sku: z.string().min(1), title: z.string().trim().min(1).max(100), description: z.string().trim().min(1).max(30000),
  brandId: z.number().int().positive(), categoryId: z.number().int().positive(), listPrice: z.number().positive(), salePrice: z.number().positive(),
  vatRate: z.number().int(), dimensionalWeight: z.number().positive(), images: z.array(z.string().url()).min(1).max(8),
  attributes: z.array(z.object({ attributeId: z.number().int(), attributeValueId: z.number().int().optional(), customAttributeValue: z.string().optional() })).default([]),
  acknowledgeDuplicateRisk: z.literal(true, { message: "Mükerrer ilan riskini onaylayın." }), confirm: z.string() });

export async function createIndependentListingAction(input: z.input<typeof listingSchema>): Promise<Result> {
  const p = listingSchema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Geçersiz veri." };
  const g = await guard(p.data.confirm); if ("error" in g) return g.error!;
  const cfg = await trendyolCfg(); if (!cfg) return { ok: false, message: "Trendyol API yapılandırması eksik veya pasif." };
  const [ctx, channels] = await Promise.all([loadDeadStock(), loadChannels()]);
  const c = ctx.get(p.data.sku);
  if (!c) return { ok: false, message: `${p.data.sku} ölü stok listesinde değil.` };
  const floor = floorPrice(c.row.unitCostTry, channels.find(x => x.channel === "TRENDYOL")!);
  if (floor == null) return { ok: false, message: "Başabaş tabanı bilinmiyor — önce birim maliyet girilmeli." };
  if (p.data.salePrice < floor) return { ok: false, message: `Satış fiyatı başabaş tabanının (${floor} TL) altında.` };
  const code = independentCode(p.data.sku);
  const { sku, title, description, brandId, categoryId, listPrice, salePrice, vatRate, dimensionalWeight, images, attributes } = p.data;
  try {
    const { batchRequestId } = await createProducts(cfg, [{ title, description, brandId, categoryId, listPrice, salePrice, vatRate, dimensionalWeight, images, attributes, barcode: code, productMainId: code, stockCode: code, quantity: c.xmlStock }]);
    await log("urun", `TRENDYOL ${sku} yeni ilan`, null, `${code} @ ${p.data.salePrice} TL, stok ${c.xmlStock}`, g.user!.email, `bağımsız ilan (Entegra dışı); taban ${floor}; işlem ${batchRequestId}`);
    return { ok: true, trackingId: batchRequestId, message: `Yeni ilan gönderildi (${code}, stok ${c.xmlStock}) — Trendyol onayından sonra yayına girer.` };
  } catch (e) {
    await log("urun", `TRENDYOL ${sku} yeni ilan`, null, `${code} (HATA)`, g.user!.email, errMsg(e));
    return { ok: false, message: `Trendyol reddetti: ${errMsg(e)}` };
  }
}

// ── İşlem sonucu (okuma) ─────────────────────────────────────────────────────
export async function checkTrackingAction(channel: "TRENDYOL" | "PTTAVM", id: string): Promise<ActionResult & { result?: unknown }> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.MARKETPLACE_LISTINGS_WRITE))) return DENIED;
  try {
    if (channel === "TRENDYOL") {
      const cfg = await trendyolCfg(); if (!cfg) return { ok: false, message: "Trendyol API yapılandırması eksik." };
      return { ok: true, result: await getBatchResult(cfg, id) };
    }
    const cfg = pttavmConfig(); if (!cfg) return { ok: false, message: "PttAVM API anahtarları tanımlı değil." };
    return { ok: true, result: await trackingResult(cfg, id) };
  } catch (e) { return { ok: false, message: errMsg(e) }; }
}
