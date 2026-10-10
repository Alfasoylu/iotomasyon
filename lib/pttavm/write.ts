/**
 * PttAVM YAZMA — fiyat/stok ve aktif-pasif (Alperen kararı 2026-10-10: "tam yetkilisin; ölü stokta fiyat düşürme, yeni ilan").
 * docs/AI-RULES.md PttAVM istisnası. Her çağrı İNSAN ONAYLIDIR: yalnız lib/actions/olu-stok-actions.ts çağırır (izin + "ONAYLIYORUM"
 * + kayıt); otomatik iş / AI CFO bu modülü çağırmaz. Yazma yalnız PTTAVM_WRITE_ENABLED=true ve REST anahtarlarıyla açılır.
 * Kaynak: developers.pttavm.com/tr — Listeleme → Fiyat Stok Güncelle (POST /products/stock-prices), Katalog → Aktif Yap
 * (PUT /products/{id}/status), Fiyat Stok Güncelleme Kontrolü (POST /products/tracking-result/{id}).
 */
import { PTTAVM_REST_BASE, PttavmError, pttavmRestHeaders, pttavmTimed, type PttavmConfig } from "./client";

export const PTTAVM_ALLOWED_VAT = [0, 1, 10, 20] as const;
export const PTTAVM_MAX_ITEMS = 1000;

export function pttavmWriteEnabled(cfg: PttavmConfig | null, env: Record<string, string | undefined> = process.env): cfg is PttavmConfig {
  return !!cfg && cfg.mode === "rest" && env.PTTAVM_WRITE_ENABLED?.trim() === "true";
}

export type StockPriceItem = { barcode: string; priceWithVAT?: number; vatRate?: number; quantity?: number; active?: boolean; discount?: number };

/** Resmî kurallar: boş liste yok, ≤ 1000, barkod tekil ve ≤ 250, en az bir alan, KDV ∈ {0,1,10,20}, fiyat > 1, indirim 0–70, stok 0–9999. */
export function validateStockPriceItems(items: StockPriceItem[]): string[] {
  const errors: string[] = [];
  if (!items.length) errors.push("boş ürün listesi gönderilemez");
  if (items.length > PTTAVM_MAX_ITEMS) errors.push(`tek istekte en fazla ${PTTAVM_MAX_ITEMS} ürün`);
  const seen = new Set<string>();
  for (const it of items) {
    const b = it.barcode?.trim() ?? "";
    if (!b) { errors.push("barkodsuz ürün işleme alınmaz"); continue; }
    if (b.length > 250) errors.push(`${b}: barkod 250 karakteri geçemez`);
    if (seen.has(b)) errors.push(`${b}: aynı barkod iki kez`); seen.add(b);
    if (it.priceWithVAT == null && it.quantity == null && it.vatRate == null && it.active == null) errors.push(`${b}: en az bir alan (stok, fiyat, KDV, aktiflik) gerekli`);
    if (it.priceWithVAT != null && !(it.priceWithVAT > 1)) errors.push(`${b}: fiyat 1'den büyük olmalı`);
    if (it.vatRate != null && !(PTTAVM_ALLOWED_VAT as readonly number[]).includes(it.vatRate)) errors.push(`${b}: KDV 0, 1, 10 ya da 20 olmalı`);
    if (it.discount != null && (it.discount < 0 || it.discount > 70)) errors.push(`${b}: indirim 0–70 arası olmalı`);
    if (it.quantity != null && (!Number.isInteger(it.quantity) || it.quantity < 0 || it.quantity > 9999)) errors.push(`${b}: stok 0–9999 tam sayı olmalı`);
  }
  return errors;
}

type Fetch = typeof fetch;
async function send<T>(cfg: PttavmConfig, method: "POST" | "PUT", path: string, body: unknown, f: Fetch): Promise<T> {
  const res = await pttavmTimed(f, PTTAVM_REST_BASE + path, { method, headers: pttavmRestHeaders(cfg), body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new PttavmError(res.status, text);
  return (text ? JSON.parse(text) : null) as T;
}

export type StockPriceResult = { trackingId: string | null; countOfProductsToBeProcessed: number | null; success: boolean; message: string | null };

export async function updateStockPrices(cfg: PttavmConfig, items: StockPriceItem[], f: Fetch = fetch): Promise<StockPriceResult> {
  if (!pttavmWriteEnabled(cfg)) throw new Error("PttAVM yazma kapalı (PTTAVM_WRITE_ENABLED=true ve REST anahtarları gerekli)");
  const errors = validateStockPriceItems(items);
  if (errors.length) throw new Error(`PttAVM fiyat/stok isteği geçersiz: ${errors.join("; ")}`);
  const body = { items: items.map(i => ({ barcode: i.barcode.trim(),
    ...(i.priceWithVAT != null ? { priceWithVAT: i.priceWithVAT } : {}), ...(i.vatRate != null ? { vatRate: i.vatRate } : {}),
    ...(i.quantity != null ? { quantity: i.quantity } : {}), ...(i.active != null ? { active: i.active } : {}), ...(i.discount != null ? { discount: i.discount } : {}) })) };
  return send<StockPriceResult>(cfg, "POST", "/products/stock-prices", body, f);
}

export async function setProductActive(cfg: PttavmConfig, productId: number, isActive: boolean, f: Fetch = fetch): Promise<{ success: boolean; errorMessage: string | null }> {
  if (!pttavmWriteEnabled(cfg)) throw new Error("PttAVM yazma kapalı (PTTAVM_WRITE_ENABLED=true ve REST anahtarları gerekli)");
  if (!Number.isInteger(productId) || productId <= 0) throw new Error("geçersiz ürün id");
  return send(cfg, "PUT", `/products/${productId}/status`, { isActive }, f);
}

/** İşlem sonucu (okuma; yazma kapalıyken de çalışır). */
export async function trackingResult(cfg: PttavmConfig, trackingId: string, f: Fetch = fetch): Promise<unknown> {
  if (cfg.mode !== "rest") throw new Error("işlem takibi yalnız REST'te");
  if (!/^[\w-]{4,100}$/.test(trackingId)) throw new Error("geçersiz trackingId");
  return send(cfg, "POST", `/products/tracking-result/${trackingId}`, {}, f);
}
