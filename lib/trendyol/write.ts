/**
 * Trendyol YAZMA — fiyat/stok, onaylı ürün içeriği (başlık/açıklama/görsel), yeni ürün (V2) ve toplu işlem sonucu
 * (Alperen kararı 2026-10-10: "tam yetkilisin; ölü stokta fiyat düşürme, yeni ilan, içerik optimizasyonu"). docs/AI-RULES.md
 * Trendyol istisnası. Her çağrı İNSAN ONAYLIDIR: yalnız lib/actions/olu-stok-actions.ts çağırır (izin + "ONAYLIYORUM" + kayıt);
 * otomatik iş / AI CFO bu modülü çağırmaz. Yazma yalnız TRENDYOL_WRITE_ENABLED=true iken açılır.
 * Kaynak: developers.trendyol.com — updatePriceAndInventory, content-bulk-update (onaylı ürün V2), createProducts V2,
 * getBatchRequestResult. V1 ürün uçları 15.10.2026'da kapanıyor; burada yalnız V2 kullanılır.
 */
import type { TrendyolConfig } from "@/lib/trendyol-api";

const BASE = "https://apigw.trendyol.com/integration";
export const TRENDYOL_MAX_ITEMS = 1000;
export const TRENDYOL_ALLOWED_VAT = [0, 1, 10, 20] as const;
const TIMEOUT_MS = 20_000;

export function trendyolWriteEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.TRENDYOL_WRITE_ENABLED?.trim() === "true";
}

export class TrendyolWriteError extends Error {
  constructor(public status: number, body: string) { super(`Trendyol ${status}: ${body.slice(0, 300)}`); }
}

type Fetch = typeof fetch;
function headers(cfg: TrendyolConfig): Record<string, string> {
  return { Authorization: `Basic ${Buffer.from(`${cfg.apiKey}:${cfg.apiSecret}`).toString("base64")}`,
    "Content-Type": "application/json", "User-Agent": `${cfg.supplierId} - SelfIntegration` };
}
async function call<T>(cfg: TrendyolConfig, method: "GET" | "POST", url: string, body: unknown, f: Fetch): Promise<T> {
  const res = await f(url, { method, headers: headers(cfg), body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await res.text();
  if (!res.ok) throw new TrendyolWriteError(res.status, text);
  return (text ? JSON.parse(text) : null) as T;
}
function gate() { if (!trendyolWriteEnabled()) throw new Error("Trendyol yazma kapalı (TRENDYOL_WRITE_ENABLED=true gerekli)"); }
const isHttps = (u: string) => /^https:\/\/\S+$/.test(u);
const BARCODE_RE = /^[\p{L}\d._-]{1,40}$/u;
function batchErrors(n: number): string[] {
  return n === 0 ? ["boş ürün listesi gönderilemez"] : n > TRENDYOL_MAX_ITEMS ? [`tek istekte en fazla ${TRENDYOL_MAX_ITEMS} ürün`] : [];
}

// ── Fiyat / stok ─────────────────────────────────────────────────────────────
export type PriceInventoryItem = { barcode: string; quantity?: number; salePrice?: number; listPrice?: number };

/** Kurallar: ≤ 1000, barkod tekil, en az bir alan, stok 0–20000 tam sayı, fiyat > 0, satış ≤ liste. */
export function validatePriceInventory(items: PriceInventoryItem[]): string[] {
  const errors = batchErrors(items.length);
  const seen = new Set<string>();
  for (const it of items) {
    const b = it.barcode?.trim() ?? "";
    if (!b) { errors.push("barkodsuz ürün işleme alınmaz"); continue; }
    if (seen.has(b)) errors.push(`${b}: aynı barkod iki kez`); seen.add(b);
    if (it.quantity == null && it.salePrice == null && it.listPrice == null) errors.push(`${b}: en az bir alan (stok, satış fiyatı, liste fiyatı) gerekli`);
    if (it.quantity != null && (!Number.isInteger(it.quantity) || it.quantity < 0 || it.quantity > 20000)) errors.push(`${b}: stok 0–20000 tam sayı olmalı`);
    for (const [k, v] of [["satış", it.salePrice], ["liste", it.listPrice]] as const) if (v != null && !(v > 0)) errors.push(`${b}: ${k} fiyatı 0'dan büyük olmalı`);
    if (it.salePrice != null && it.listPrice != null && it.salePrice > it.listPrice) errors.push(`${b}: satış fiyatı liste fiyatını geçemez`);
  }
  return errors;
}

export async function updatePriceAndInventory(cfg: TrendyolConfig, items: PriceInventoryItem[], f: Fetch = fetch): Promise<{ batchRequestId: string }> {
  gate();
  const errors = validatePriceInventory(items);
  if (errors.length) throw new Error(`Trendyol fiyat/stok isteği geçersiz: ${errors.join("; ")}`);
  const body = { items: items.map(i => ({ barcode: i.barcode.trim(), ...(i.quantity != null ? { quantity: i.quantity } : {}),
    ...(i.salePrice != null ? { salePrice: i.salePrice } : {}), ...(i.listPrice != null ? { listPrice: i.listPrice } : {}) })) };
  return call(cfg, "POST", `${BASE}/inventory/sellers/${cfg.supplierId}/products/price-and-inventory`, body, f);
}

// ── Onaylı ürün içeriği (V2, kısmi güncelleme; özellik değiştirilmez) ─────────
export type ContentItem = { contentId: number; title?: string; description?: string; images?: string[] };

export function validateContent(items: ContentItem[]): string[] {
  const errors = batchErrors(items.length);
  for (const it of items) {
    const id = it.contentId;
    if (!Number.isInteger(id) || id <= 0) { errors.push("geçersiz contentId"); continue; }
    if (it.title == null && it.description == null && it.images == null) errors.push(`${id}: en az bir alan (başlık, açıklama, görsel) gerekli`);
    if (it.title != null && (!it.title.trim() || it.title.length > 100)) errors.push(`${id}: başlık 1–100 karakter olmalı`);
    if (it.description != null && (!it.description.trim() || it.description.length > 30000)) errors.push(`${id}: açıklama 1–30000 karakter olmalı`);
    if (it.images != null && (!it.images.length || it.images.length > 8 || !it.images.every(isHttps))) errors.push(`${id}: 1–8 adet https görsel gerekli`);
  }
  return errors;
}

export async function updateApprovedContent(cfg: TrendyolConfig, items: ContentItem[], f: Fetch = fetch): Promise<{ batchRequestId: string }> {
  gate();
  const errors = validateContent(items);
  if (errors.length) throw new Error(`Trendyol içerik isteği geçersiz: ${errors.join("; ")}`);
  const body = { items: items.map(i => ({ contentId: i.contentId, ...(i.title != null ? { title: i.title.trim() } : {}),
    ...(i.description != null ? { description: i.description } : {}), ...(i.images != null ? { images: i.images.map(url => ({ url })) } : {}) })) };
  return call(cfg, "POST", `${BASE}/product/sellers/${cfg.supplierId}/products/content-bulk-update`, body, f);
}

// ── Yeni ürün (V2) ───────────────────────────────────────────────────────────
export type NewProduct = { barcode: string; title: string; productMainId: string; brandId: number; categoryId: number; quantity: number;
  stockCode: string; dimensionalWeight: number; description: string; listPrice: number; salePrice: number; vatRate: number; images: string[];
  attributes: { attributeId: number; attributeValueId?: number; customAttributeValue?: string }[] };

export function validateNewProducts(items: NewProduct[]): string[] {
  const errors = batchErrors(items.length);
  const seen = new Set<string>();
  for (const p of items) {
    const b = p.barcode?.trim() ?? "";
    if (!BARCODE_RE.test(b)) { errors.push(`${b || "(boş)"}: barkod 1–40 karakter; harf, rakam, . - _ dışında karakter içeremez`); continue; }
    if (seen.has(b)) errors.push(`${b}: aynı barkod iki kez`); seen.add(b);
    if (!p.title?.trim() || p.title.length > 100) errors.push(`${b}: başlık 1–100 karakter olmalı`);
    if (!p.productMainId?.trim() || p.productMainId.length > 40) errors.push(`${b}: ana ürün kodu 1–40 karakter olmalı`);
    if (!p.stockCode?.trim() || p.stockCode.length > 100) errors.push(`${b}: stok kodu 1–100 karakter olmalı`);
    if (!p.description?.trim() || p.description.length > 30000) errors.push(`${b}: açıklama 1–30000 karakter olmalı`);
    if (!(Number.isInteger(p.brandId) && p.brandId > 0) || !(Number.isInteger(p.categoryId) && p.categoryId > 0)) errors.push(`${b}: marka ve kategori id gerekli`);
    if (!Number.isInteger(p.quantity) || p.quantity < 0 || p.quantity > 20000) errors.push(`${b}: stok 0–20000 tam sayı olmalı`);
    if (!(p.dimensionalWeight > 0)) errors.push(`${b}: desi 0'dan büyük olmalı`);
    if (!(p.salePrice > 0) || !(p.listPrice > 0) || p.salePrice > p.listPrice) errors.push(`${b}: fiyatlar > 0 ve satış ≤ liste olmalı`);
    if (!(TRENDYOL_ALLOWED_VAT as readonly number[]).includes(p.vatRate)) errors.push(`${b}: KDV 0, 1, 10 ya da 20 olmalı`);
    if (!p.images?.length || p.images.length > 8 || !p.images.every(isHttps)) errors.push(`${b}: 1–8 adet https görsel gerekli`);
  }
  return errors;
}

export async function createProducts(cfg: TrendyolConfig, items: NewProduct[], f: Fetch = fetch): Promise<{ batchRequestId: string }> {
  gate();
  const errors = validateNewProducts(items);
  if (errors.length) throw new Error(`Trendyol yeni ürün isteği geçersiz: ${errors.join("; ")}`);
  const body = { items: items.map(p => ({ ...p, barcode: p.barcode.trim(), title: p.title.trim(), images: p.images.map(url => ({ url })) })) };
  return call(cfg, "POST", `${BASE}/product/sellers/${cfg.supplierId}/v2/products`, body, f);
}

// ── Toplu işlem sonucu (okuma; yazma kapalıyken de çalışır) ──────────────────
export type BatchResult = { batchRequestId: string; status?: string; itemCount?: number; failedItemCount?: number;
  items?: { status: string; failureReasons: string[]; requestItem: Record<string, unknown> }[] };

export async function getBatchResult(cfg: TrendyolConfig, batchRequestId: string, f: Fetch = fetch): Promise<BatchResult> {
  if (!/^[\w-]{4,100}$/.test(batchRequestId)) throw new Error("geçersiz batchRequestId");
  return call(cfg, "GET", `${BASE}/product/sellers/${cfg.supplierId}/products/batch-requests/${batchRequestId}`, undefined, f);
}
