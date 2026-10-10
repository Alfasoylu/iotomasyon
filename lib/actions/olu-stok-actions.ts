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
import { getProductsByBarcodes, pttavmConfig } from "@/lib/pttavm/client";
import { interpretLookup } from "@/lib/pttavm/lookup";
import { detectImageType } from "@/lib/storage/image-type";
import { getStorageConfig, uploadObject } from "@/lib/storage/supabase-storage";
import { soapUpdatePriceStock, trackingResult, updateStockPrices, upsertProducts } from "@/lib/pttavm/write";
import { distinctListingErrors, floorPrice, independentCode } from "@/lib/olu-stok/plan";
import { findApprovedByBarcode } from "@/lib/trendyol/approved";
import { loadChannels, loadDeadStock } from "@/lib/olu-stok/load";
import { independentCap, independentQty, PTTAVM_MAX_QTY, TRENDYOL_MAX_QTY } from "@/lib/olu-stok/stock-plan";

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
      // Kullanıcı adı/şifre (SOAP): BarkodKontrol → değişmeyen alanlar aynen → StokFiyatGuncelle3; REST anahtarı varsa stock-prices.
      trackingId = cfg.mode === "soap" ? ((await soapUpdatePriceStock(cfg, barcode, { priceWithVat: newPrice })).urunId ?? "soap")
        : (await updateStockPrices(cfg, [{ barcode, priceWithVAT: newPrice }])).trackingId;
    }
  } catch (e) {
    await log("fiyat", `${channel} ${sku} fiyat`, oldPrice?.toString() ?? null, `${newPrice} (HATA)`, g.user!.email, errMsg(e));
    return { ok: false, message: `${channel} reddetti: ${errMsg(e)}` };
  }
  await log("fiyat", `${channel} ${sku} fiyat`, oldPrice?.toString() ?? null, String(newPrice), g.user!.email, `barkod ${barcode}; taban ${floor}; işlem ${trackingId ?? "-"}`);
  return { ok: true, trackingId, message: `Gönderildi — işlem no ${trackingId ?? "-"}. Sonucu "İşlem sonucu" ile kontrol edin.` };
}

// ── Trendyol onaylı ürün içeriği (başlık / açıklama / görsel) ────────────────
// contentId verilmezse ürünün barkodundan onaylı ürün filtresiyle bulunur.
const contentSchema = z.object({ sku: z.string().min(1), contentId: z.number().int().positive().optional(), title: z.string().trim().max(100).optional(),
  description: z.string().trim().max(30000).optional(), images: z.array(z.string().url()).max(8).optional(), confirm: z.string() });

export async function applyContentAction(input: z.input<typeof contentSchema>): Promise<Result> {
  const p = contentSchema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Geçersiz veri." };
  const g = await guard(p.data.confirm); if ("error" in g) return g.error!;
  const cfg = await trendyolCfg(); if (!cfg) return { ok: false, message: "Trendyol API yapılandırması eksik veya pasif." };
  const { sku, title, description, images } = p.data;
  let contentId = p.data.contentId;
  if (!contentId) {
    const barcode = (await loadDeadStock()).get(sku)?.barcode;
    if (!barcode) return { ok: false, message: "Üründe barkod yok — contentId'yi elle girin." };
    contentId = (await findApprovedByBarcode(cfg, barcode).catch(() => null))?.contentId;
    if (!contentId) return { ok: false, message: `Trendyol'da ${barcode} barkodlu onaylı ürün bulunamadı.` };
  }
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
// Alperen 2026-10-10: farklı SKU + farklı (AI) görseller + farklı başlık. Marka/kategori/özellikler verilmezse Entegra'nın mevcut ilanından
// (ürün barkodu → onaylı ürün filtresi) kopyalanır. Başlık ve görseller mevcut ürün/ilandan FARKLI olmalı (distinctListingErrors).
// Gönderim olu_stok_bagimsiz_ilan'a kaydedilir; stok her gece XML'den eşitlenir (lib/olu-stok/stock-sync.ts).
const listingSchema = z.object({ sku: z.string().min(1), title: z.string().trim().min(1).max(100), description: z.string().trim().min(1).max(30000),
  brandId: z.number().int().positive().optional(), categoryId: z.number().int().positive().optional(), listPrice: z.number().positive(), salePrice: z.number().positive(),
  vatRate: z.number().int(), dimensionalWeight: z.number().positive(), images: z.array(z.string().url()).min(1).max(8),
  attributes: z.array(z.object({ attributeId: z.number().int(), attributeValueId: z.number().int().optional(), customAttributeValue: z.string().optional() })).optional(),
  acknowledgeDuplicateRisk: z.literal(true, { message: "Mükerrer ilan riskini onaylayın." }), confirm: z.string() });

export async function createIndependentListingAction(input: z.input<typeof listingSchema>): Promise<Result> {
  const p = listingSchema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Geçersiz veri." };
  const g = await guard(p.data.confirm); if ("error" in g) return g.error!;
  const cfg = await trendyolCfg(); if (!cfg) return { ok: false, message: "Trendyol API yapılandırması eksik veya pasif." };
  const reg = await prisma.$queryRaw<{ t: string | null }[]>`select to_regclass('public.olu_stok_bagimsiz_ilan')::text t`;
  if (!reg[0]?.t) return { ok: false, message: "Bağımsız ilan kayıt tablosu yok (migration 20261010150000) — stok eşitlenemeyeceği için ilan açılmaz." };
  const [ctx, channels] = await Promise.all([loadDeadStock(), loadChannels()]);
  const c = ctx.get(p.data.sku);
  if (!c) return { ok: false, message: `${p.data.sku} ölü stok listesinde değil.` };
  const floor = floorPrice(c.row.unitCostTry, channels.find(x => x.channel === "TRENDYOL")!);
  if (floor == null) return { ok: false, message: "Başabaş tabanı bilinmiyor — önce birim maliyet girilmeli." };
  if (p.data.salePrice < floor) return { ok: false, message: `Satış fiyatı başabaş tabanının (${floor} TL) altında.` };
  const src = c.barcode ? await findApprovedByBarcode(cfg, c.barcode).catch(() => null) : null;
  const brandId = p.data.brandId ?? src?.brandId ?? null, categoryId = p.data.categoryId ?? src?.categoryId ?? null;
  const attributes = p.data.attributes ?? src?.attributes ?? [];
  if (!brandId || !categoryId) return { ok: false, message: "Marka/kategori mevcut ilandan bulunamadı — elle girin." };
  const distinct = distinctListingErrors({ titles: [c.row.name, src?.title ?? ""], images: [c.imageUrl ?? "", ...(src?.images ?? [])] },
    { title: p.data.title, images: p.data.images });
  if (distinct.length) return { ok: false, message: `Yeni ilan mevcut ilandan yeterince farklı değil: ${distinct.join("; ")}` };
  const code = independentCode(p.data.sku);
  const tyQty = independentQty(c.xmlStock, independentCap(), TRENDYOL_MAX_QTY);
  const { sku, title, description, listPrice, salePrice, vatRate, dimensionalWeight, images } = p.data;
  try {
    const { batchRequestId } = await createProducts(cfg, [{ title, description, brandId, categoryId, listPrice, salePrice, vatRate, dimensionalWeight, images, attributes,
      barcode: code, productMainId: code, stockCode: code, quantity: tyQty }]);
    await prisma.$executeRaw`insert into olu_stok_bagimsiz_ilan (sku, kanal, barkod, baslik, kaynak_barkod, satis_fiyati, islem_no, olusturan, son_stok, son_stok_at, son_stok_islem)
      values (${sku}, 'TRENDYOL', ${code}, ${title}, ${c.barcode}, ${salePrice}, ${batchRequestId}, ${g.user!.email}, ${tyQty}, now(), ${batchRequestId})
      on conflict (kanal, barkod) do update set baslik = excluded.baslik, satis_fiyati = excluded.satis_fiyati, islem_no = excluded.islem_no, durum = 'GONDERILDI'`;
    await log("urun", `TRENDYOL ${sku} yeni ilan`, null, `${code} @ ${salePrice} TL, stok ${tyQty} (XML ${c.xmlStock}, tavan ${independentCap()})`, g.user!.email,
      `bağımsız ilan (Entegra dışı); kaynak ${c.barcode ?? "-"}${src ? " (marka/kategori/özellik kopyalandı)" : ""}; taban ${floor}; işlem ${batchRequestId}`);
    return { ok: true, trackingId: batchRequestId, message: `Yeni ilan gönderildi (${code}, stok ${tyQty} — XML ${c.xmlStock}, tavan ${independentCap()}) — Trendyol onayından sonra yayına girer; stok her gece XML'den eşitlenir.` };
  } catch (e) {
    await log("urun", `TRENDYOL ${sku} yeni ilan`, null, `${code} (HATA)`, g.user!.email, errMsg(e));
    return { ok: false, message: `Trendyol reddetti: ${errMsg(e)}` };
  }
}

// ── Yeni ilan görselleri (AI ile üretilmiş) → public urun-gorsel/olu-stok/<SKU>/ ─
// Yalnız gerçek JPEG/PNG/WebP (magic byte), ≤ 10 MB, en fazla 8; dönen https adresleri ilan formuna eklenir.
export async function uploadListingImagesAction(formData: FormData): Promise<ActionResult & { urls?: string[] }> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.MARKETPLACE_LISTINGS_WRITE))) return DENIED;
  const sku = String(formData.get("sku") ?? "");
  if (!(await loadDeadStock()).has(sku)) return { ok: false, message: `${sku} ölü stok listesinde değil.` };
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length || files.length > 8) return { ok: false, message: "1–8 görsel seçin." };
  const storage = getStorageConfig(); if (!storage.ok) return { ok: false, message: storage.reason };
  const urls: string[] = [];
  for (const file of files) {
    if (file.size > 10 * 1024 * 1024) return { ok: false, message: `${file.name}: en fazla 10 MB.` };
    const bytes = Buffer.from(await file.arrayBuffer());
    const t = detectImageType(bytes);
    if (!t || t.ext === "gif") return { ok: false, message: `${file.name}: yalnız JPEG, PNG veya WebP.` };
    const path = `olu-stok/${independentCode(sku)}/${crypto.randomUUID()}.${t.ext}`;
    const r = await uploadObject(storage.config, "urun-gorsel", path, new File([bytes], `g.${t.ext}`, { type: t.mime }));
    if (!r.ok) return { ok: false, message: r.reason, urls };
    urls.push(r.publicUrl);
  }
  return { ok: true, urls, message: `${urls.length} görsel yüklendi.` };
}

// ── PttAVM içerik (ad / açıklama / görsel) — POST /products/upsert, mevcut ürün ─
// Upsert kayıtlı olmayan barkodu YENİ ürün yapar ve varyant gönderilmezse varyantları siler → önce barkod sorgusu: ürün VAR ve
// varyantsız olmalı; yanıt yorumlanamazsa gönderilmez.
const pttContentSchema = z.object({ sku: z.string().min(1), barcode: z.string().trim().min(1, "PttAVM barkodu (stok kodu) gerekli"),
  name: z.string().trim().max(200).optional(), longDescription: z.string().trim().max(30000).optional(), images: z.array(z.string().url()).max(8).optional(), confirm: z.string() });

export async function applyPttContentAction(input: z.input<typeof pttContentSchema>): Promise<Result> {
  const p = pttContentSchema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Geçersiz veri." };
  const g = await guard(p.data.confirm); if ("error" in g) return g.error!;
  const cfg = pttavmConfig(); if (!cfg) return { ok: false, message: "PttAVM API anahtarları tanımlı değil." };
  if (cfg.mode !== "rest") return { ok: false, message: "PttAVM yeni ilan/içerik REST anahtarı ister (Satıcı Paneli → Hesap Yönetimi → Entegrasyon Bilgileri; entegratörü PttAVM tanımlar). Kullanıcı adı/şifreyle yalnız fiyat/stok güncellenir." };
  const { sku, barcode, name, longDescription, images } = p.data;
  let look;
  try { look = interpretLookup(await getProductsByBarcodes(cfg, [barcode]), barcode); } catch (e) { return { ok: false, message: `PttAVM barkod sorgusu: ${errMsg(e)}` }; }
  if (!look.found) return { ok: false, message: `PttAVM'de ${barcode} bulunamadı — upsert yeni ürün açacağı için gönderilmedi.` };
  if (look.hasVariants) return { ok: false, message: "Ürün varyantlı — upsert varyantları sileceği için gönderilmedi." };
  const fields = [name && "ad", longDescription && "açıklama", images?.length && "görsel"].filter(Boolean).join(", ");
  try {
    const r = await upsertProducts(cfg, [{ barcode, isNew: false, name: name || undefined, longDescription: longDescription || undefined, images: images?.length ? images : undefined }]);
    await log("urun", `PTTAVM ${sku} içerik`, null, fields, g.user!.email, `barkod ${barcode}; işlem ${r.trackingId ?? "-"}`);
    return { ok: true, trackingId: r.trackingId, message: `Gönderildi (${fields}) — işlem no ${r.trackingId ?? "-"}.` };
  } catch (e) {
    await log("urun", `PTTAVM ${sku} içerik`, null, `${fields} (HATA)`, g.user!.email, errMsg(e));
    return { ok: false, message: `PttAVM reddetti: ${errMsg(e)}` };
  }
}

// ── Entegra'dan bağımsız yeni PttAVM ilanı (ALFOS- barkod, stok XML'den) ──────
const pttListingSchema = z.object({ sku: z.string().min(1), name: z.string().trim().min(3).max(200), longDescription: z.string().trim().min(1).max(30000),
  categoryId: z.number().int().positive().optional(), priceWithVat: z.number().gt(1), vatRate: z.number().int(), desi: z.number().min(0).max(300),
  brand: z.string().trim().max(100).optional(), images: z.array(z.string().url()).min(1).max(8), sourceBarcode: z.string().trim().optional(),
  acknowledgeDuplicateRisk: z.literal(true, { message: "Mükerrer ilan riskini onaylayın." }), confirm: z.string() });

export async function createIndependentPttListingAction(input: z.input<typeof pttListingSchema>): Promise<Result> {
  const p = pttListingSchema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Geçersiz veri." };
  const g = await guard(p.data.confirm); if ("error" in g) return g.error!;
  const cfg = pttavmConfig(); if (!cfg) return { ok: false, message: "PttAVM API anahtarları tanımlı değil." };
  if (cfg.mode !== "rest") return { ok: false, message: "PttAVM yeni ilan/içerik REST anahtarı ister (Satıcı Paneli → Hesap Yönetimi → Entegrasyon Bilgileri; entegratörü PttAVM tanımlar). Kullanıcı adı/şifreyle yalnız fiyat/stok güncellenir." };
  const [ctx, channels] = await Promise.all([loadDeadStock(), loadChannels()]);
  const c = ctx.get(p.data.sku);
  if (!c) return { ok: false, message: `${p.data.sku} ölü stok listesinde değil.` };
  const floor = floorPrice(c.row.unitCostTry, channels.find(x => x.channel === "PTTAVM")!);
  if (floor == null) return { ok: false, message: "Başabaş tabanı bilinmiyor — önce birim maliyet girilmeli." };
  if (p.data.priceWithVat < floor) return { ok: false, message: `Fiyat başabaş tabanının (${floor} TL) altında.` };
  const code = independentCode(p.data.sku);
  let src: ReturnType<typeof interpretLookup> | null = null;
  try {
    if (interpretLookup(await getProductsByBarcodes(cfg, [code]), code).found) return { ok: false, message: `${code} PttAVM'de zaten var — yeni ilan açılmadı.` };
    const sb = p.data.sourceBarcode || c.barcode;
    if (sb) src = interpretLookup(await getProductsByBarcodes(cfg, [sb]), sb);
  } catch (e) { return { ok: false, message: `PttAVM barkod sorgusu: ${errMsg(e)}` }; }
  const categoryId = p.data.categoryId ?? src?.categoryId ?? null;
  if (!categoryId) return { ok: false, message: "Kategori mevcut ilandan bulunamadı — elle girin." };
  const distinct = distinctListingErrors({ titles: [c.row.name, ...(src?.names ?? [])], images: [c.imageUrl ?? "", ...(src?.images ?? [])] }, { title: p.data.name, images: p.data.images });
  if (distinct.length) return { ok: false, message: `Yeni ilan mevcut ilandan yeterince farklı değil: ${distinct.join("; ")}` };
  const qty = independentQty(c.xmlStock, independentCap(), PTTAVM_MAX_QTY);
  try {
    const r = await upsertProducts(cfg, [{ barcode: code, isNew: true, ean: code, productCode: code, categoryId, name: p.data.name, longDescription: p.data.longDescription,
      priceWithVat: p.data.priceWithVat, vatRate: p.data.vatRate, quantity: qty, desi: p.data.desi, brand: p.data.brand, images: p.data.images }]);
    await prisma.$executeRaw`insert into olu_stok_bagimsiz_ilan (sku, kanal, barkod, baslik, kaynak_barkod, satis_fiyati, islem_no, olusturan, son_stok, son_stok_at, son_stok_islem)
      values (${p.data.sku}, 'PTTAVM', ${code}, ${p.data.name}, ${src?.found ? (p.data.sourceBarcode || c.barcode) : null}, ${p.data.priceWithVat}, ${r.trackingId}, ${g.user!.email}, ${qty}, now(), ${r.trackingId})
      on conflict (kanal, barkod) do update set baslik = excluded.baslik, satis_fiyati = excluded.satis_fiyati, islem_no = excluded.islem_no, durum = 'GONDERILDI'`;
    await log("urun", `PTTAVM ${p.data.sku} yeni ilan`, null, `${code} @ ${p.data.priceWithVat} TL, stok ${qty}`, g.user!.email, `bağımsız ilan (Entegra dışı); taban ${floor}; işlem ${r.trackingId ?? "-"}`);
    return { ok: true, trackingId: r.trackingId, message: `Yeni PttAVM ilanı gönderildi (${code}, stok ${qty}) — işlem no ${r.trackingId ?? "-"}; stok her gece XML'den eşitlenir.` };
  } catch (e) {
    await log("urun", `PTTAVM ${p.data.sku} yeni ilan`, null, `${code} (HATA)`, g.user!.email, errMsg(e));
    return { ok: false, message: `PttAVM reddetti: ${errMsg(e)}` };
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
