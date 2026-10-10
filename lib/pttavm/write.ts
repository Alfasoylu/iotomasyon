/**
 * PttAVM YAZMA — fiyat/stok ve aktif-pasif (Alperen kararı 2026-10-10: "tam yetkilisin; ölü stokta fiyat düşürme, yeni ilan").
 * docs/AI-RULES.md PttAVM istisnası. Her çağrı İNSAN ONAYLIDIR: yalnız lib/actions/olu-stok-actions.ts çağırır (izin + "ONAYLIYORUM"
 * + kayıt); otomatik iş / AI CFO bu modülü çağırmaz. Yazma yalnız PTTAVM_WRITE_ENABLED=true ve REST anahtarlarıyla açılır.
 * Kaynak: developers.pttavm.com/tr — Listeleme → Fiyat Stok Güncelle (POST /products/stock-prices), Katalog → Aktif Yap
 * (PUT /products/{id}/status), Fiyat Stok Güncelleme Kontrolü (POST /products/tracking-result/{id}).
 */
import { PTTAVM_REST_BASE, PTTAVM_SOAP_URL, PttavmError, camelize, pttavmRestHeaders, pttavmTimed, soapCall, soapEnvelopeRaw, type PttavmConfig } from "./client";
import { escapeXml, parseXml, pick, type XmlNode } from "./xml";

export const PTTAVM_ALLOWED_VAT = [0, 1, 10, 20] as const;
export const PTTAVM_MAX_ITEMS = 1000;

/** Yazma bayrağı (REST ya da SOAP). Kullanıcı adı/şifreyle (SOAP) yalnız fiyat/stok güncellenebilir (soapUpdatePriceStock);
 *  REST anahtarı gerektirenler (stock-prices toplu, upsert, aktif/pasif) restWriteEnabled ile ayrıca korunur. */
export function pttavmWriteEnabled(cfg: PttavmConfig | null, env: Record<string, string | undefined> = process.env): cfg is PttavmConfig {
  return !!cfg && env.PTTAVM_WRITE_ENABLED?.trim() === "true";
}
function restWriteEnabled(cfg: PttavmConfig | null): boolean { return pttavmWriteEnabled(cfg) && cfg!.mode === "rest"; }

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
  if (!restWriteEnabled(cfg)) throw new Error("PttAVM yazma kapalı (PTTAVM_WRITE_ENABLED=true ve REST anahtarları gerekli)");
  const errors = validateStockPriceItems(items);
  if (errors.length) throw new Error(`PttAVM fiyat/stok isteği geçersiz: ${errors.join("; ")}`);
  const body = { items: items.map(i => ({ barcode: i.barcode.trim(),
    ...(i.priceWithVAT != null ? { priceWithVAT: i.priceWithVAT } : {}), ...(i.vatRate != null ? { vatRate: i.vatRate } : {}),
    ...(i.quantity != null ? { quantity: i.quantity } : {}), ...(i.active != null ? { active: i.active } : {}), ...(i.discount != null ? { discount: i.discount } : {}) })) };
  return send<StockPriceResult>(cfg, "POST", "/products/stock-prices", body, f);
}

export async function setProductActive(cfg: PttavmConfig, productId: number, isActive: boolean, f: Fetch = fetch): Promise<{ success: boolean; errorMessage: string | null }> {
  if (!restWriteEnabled(cfg)) throw new Error("PttAVM yazma kapalı (PTTAVM_WRITE_ENABLED=true ve REST anahtarları gerekli)");
  if (!Number.isInteger(productId) || productId <= 0) throw new Error("geçersiz ürün id");
  return send(cfg, "PUT", `/products/${productId}/status`, { isActive }, f);
}

/** İşlem sonucu (okuma; yazma kapalıyken de çalışır). */
export async function trackingResult(cfg: PttavmConfig, trackingId: string, f: Fetch = fetch): Promise<unknown> {
  if (cfg.mode !== "rest") throw new Error("işlem takibi yalnız REST'te");
  if (!/^[\w-]{4,100}$/.test(trackingId)) throw new Error("geçersiz trackingId");
  return send(cfg, "POST", `/products/tracking-result/${trackingId}`, {}, f);
}

// ── Ürün ekleme / güncelleme (POST /products/upsert) ─────────────────────────
// Kaynak: developers.pttavm.com/tr/katalog-entegrasyonu/ueruen-ekleme-guncelleme. Sisteme kayıtlı olmayan barkod YENİ ürün olur;
// kayıtlıysa yalnız gönderilen alanlar güncellenir. Varyant gönderilmez (varyant gönderilmezse mevcut varyant SİLİNİR — bu yüzden
// varyantlı ürünlerde upsert reddedilir: hasVariants). Kurallar: ≤ 1000, ad ≤ 200, KDV 0/1/10/20 (KDV dahil fiyatta > 0), stok ≥ 0,
// desi 0–300, indirim 0–70, yeni üründe kategori + ad + fiyat + stok + ≥ 1 görsel zorunlu.
export type PttUpsertItem = { barcode: string; isNew: boolean; hasVariants?: boolean; categoryId?: number; ean?: string; name?: string;
  priceWithVat?: number; vatRate?: number; quantity?: number; longDescription?: string; shortDescription?: string; images?: string[];
  desi?: number; discount?: number; brand?: string; productCode?: string; active?: boolean };

const isUrl = (u: string) => /^https?:\/\/[^\s/]+\.[^\s]+$/.test(u);

export function validateUpsert(items: PttUpsertItem[]): string[] {
  const errors: string[] = [];
  if (!items.length) errors.push("boş ürün listesi gönderilemez");
  if (items.length > PTTAVM_MAX_ITEMS) errors.push(`tek istekte en fazla ${PTTAVM_MAX_ITEMS} ürün`);
  const seen = new Set<string>();
  for (const it of items) {
    const b = it.barcode?.trim() ?? "";
    if (!b) { errors.push("barkodsuz ürün işleme alınmaz"); continue; }
    if (seen.has(b)) errors.push(`${b}: aynı barkod iki kez`); seen.add(b);
    if (it.hasVariants) errors.push(`${b}: varyantlı üründe upsert varyantları siler — desteklenmiyor`);
    if (it.name != null && (!it.name.trim() || it.name.length > 200)) errors.push(`${b}: ürün adı 1–200 karakter olmalı`);
    if (it.vatRate != null && !(PTTAVM_ALLOWED_VAT as readonly number[]).includes(it.vatRate)) errors.push(`${b}: KDV 0, 1, 10 ya da 20 olmalı`);
    if (it.priceWithVat != null && (!(it.priceWithVat > 1) || !(it.vatRate != null && it.vatRate > 0))) errors.push(`${b}: KDV dahil fiyat > 1 ve KDV > 0 olmalı`);
    if (it.quantity != null && (!Number.isInteger(it.quantity) || it.quantity < 0 || it.quantity > 9999)) errors.push(`${b}: stok 0–9999 tam sayı olmalı`);
    if (it.desi != null && (it.desi < 0 || it.desi > 300)) errors.push(`${b}: desi 0–300 olmalı`);
    if (it.discount != null && (it.discount < 0 || it.discount > 70)) errors.push(`${b}: indirim 0–70 arası olmalı`);
    if (it.images != null && (!it.images.length || !it.images.every(isUrl))) errors.push(`${b}: geçerli görsel adresi gerekli`);
    if (it.isNew) {
      if (!(Number.isInteger(it.categoryId) && it.categoryId! > 0)) errors.push(`${b}: yeni üründe kategori zorunlu`);
      if (!it.name?.trim()) errors.push(`${b}: yeni üründe ad zorunlu`);
      if (it.priceWithVat == null || it.quantity == null || it.vatRate == null) errors.push(`${b}: yeni üründe fiyat, KDV ve stok zorunlu`);
      if (!it.images?.length) errors.push(`${b}: yeni üründe en az bir görsel zorunlu`);
      if (!it.ean?.trim()) errors.push(`${b}: yeni üründe ean zorunlu`);
    } else if (it.name == null && it.longDescription == null && it.shortDescription == null && it.images == null && it.priceWithVat == null && it.quantity == null && it.active == null)
      errors.push(`${b}: güncellenecek en az bir alan gerekli`);
  }
  return errors;
}

export async function upsertProducts(cfg: PttavmConfig, items: PttUpsertItem[], f: Fetch = fetch): Promise<StockPriceResult> {
  if (!restWriteEnabled(cfg)) throw new Error("PttAVM yazma kapalı (PTTAVM_WRITE_ENABLED=true ve REST anahtarları gerekli)");
  const errors = validateUpsert(items);
  if (errors.length) throw new Error(`PttAVM ürün isteği geçersiz: ${errors.join("; ")}`);
  const WIRE = ["categoryId", "ean", "name", "priceWithVat", "vatRate", "quantity", "longDescription", "shortDescription", "desi", "discount", "brand", "productCode", "active"] as const;
  const body = { items: items.map(i => ({ barcode: i.barcode.trim(), ...Object.fromEntries(WIRE.filter(k => i[k] != null).map(k => [k, i[k]])),
    ...(i.images ? { images: i.images.map(url => ({ url })) } : {}) })) };
  return send<StockPriceResult>(cfg, "POST", "/products/upsert", body, f);
}

// ── SOAP fiyat/stok (kullanıcı adı/şifre; REST anahtarı yokken) ───────────────
// StokFiyatGuncelle3(item: StokUrun). DataContract alanı gönderilmezse sunucuda VARSAYILANA düşebilir (Miktar 0, Aktif false, İskonto 0) →
// önce BarkodKontrol ile güncel kayıt okunur; değişmeyen alanlar (Aktif, İskonto, KDV oranı, stok ya da fiyat) AYNEN geri gönderilir.
// Kayıt okunamazsa, barkod eşleşmezse ya da ürün varyantlıysa gönderilmez. Alan sırası DataContract alfabetik sırası.
export type SoapCurrent = { barcode: string; active: boolean; quantity: number; priceWithVat: number; vatRate: number; discount: number; hasVariants: boolean };
const toNum = (v: unknown) => (v == null || v === "" ? null : Number(String(v).replace(",", ".")));

export function parseSoapCurrent(node: unknown, barcode: string): SoapCurrent | null {
  const d = node as Record<string, unknown> | null;
  if (!d || typeof d !== "object") return null;
  const b = String(d.barkod ?? "").trim();
  const active = String(d.aktif ?? "").toLowerCase();
  const q = toNum(d.miktar), p = toNum(d.kDVli), r = toNum(d.kDVOran), disc = toNum(d.iskonto) ?? 0; // camelize: KDVli → kDVli
  if (b !== barcode.trim() || !["true", "false"].includes(active) || q == null || p == null || r == null || !Number.isFinite(q + p + r)) return null;
  const v = d.variantListesi as Record<string, unknown> | string | null | undefined;
  const hasVariants = !!v && typeof v === "object" && Object.keys(v).length > 0;
  return { barcode: b, active: active === "true", quantity: q, priceWithVat: p, vatRate: r, discount: disc, hasVariants };
}

export function stokUrunXml(c: SoapCurrent, next: { priceWithVat?: number; quantity?: number }): string {
  const price = next.priceWithVat ?? c.priceWithVat, qty = next.quantity ?? c.quantity;
  const net = Math.round((price / (1 + c.vatRate / 100)) * 100) / 100;
  const f = (n: number) => String(Math.round(n * 100) / 100);
  return `<tem:item><ept:Aktif>${c.active}</ept:Aktif><ept:Barkod>${escapeXml(c.barcode)}</ept:Barkod><ept:Iskonto>${f(c.discount)}</ept:Iskonto>`
    + `<ept:KDVOran>${f(c.vatRate)}</ept:KDVOran><ept:KDVli>${f(price)}</ept:KDVli><ept:KDVsiz>${f(net)}</ept:KDVsiz><ept:Miktar>${Math.trunc(qty)}</ept:Miktar></tem:item>`;
}

export async function soapUpdatePriceStock(cfg: PttavmConfig, barcode: string, next: { priceWithVat?: number; quantity?: number }, f: Fetch = fetch):
  Promise<{ before: SoapCurrent; urunId: string | null; warnings: string[] }> {
  if (!pttavmWriteEnabled(cfg)) throw new Error("PttAVM yazma kapalı (PTTAVM_WRITE_ENABLED=true gerekli)");
  if (cfg.mode !== "soap") throw new Error("SOAP güncellemesi yalnız kullanıcı adı/şifre modunda");
  if (next.priceWithVat == null && next.quantity == null) throw new Error("fiyat ya da stok gerekli");
  if (next.priceWithVat != null && !(next.priceWithVat > 1)) throw new Error("fiyat 1'den büyük olmalı");
  if (next.quantity != null && (!Number.isInteger(next.quantity) || next.quantity < 0 || next.quantity > 9999)) throw new Error("stok 0–9999 tam sayı olmalı");
  const before = parseSoapCurrent(camelize(await soapCall(cfg, "BarkodKontrol", { Barkod: barcode.trim() }, f)), barcode);
  if (!before) throw new Error(`PttAVM'de ${barcode} okunamadı ya da eşleşmedi — güncel değerler bilinmeden gönderilmez`);
  if (before.hasVariants) throw new Error("varyantlı ürün — SOAP güncellemesi varyantları etkileyebilir, gönderilmedi");
  const res = await pttavmTimed(f, PTTAVM_SOAP_URL, { method: "POST", headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '"http://tempuri.org/IService/StokFiyatGuncelle3"' },
    body: soapEnvelopeRaw(cfg, "StokFiyatGuncelle3", stokUrunXml(before, next)) });
  const text = await res.text();
  let doc: XmlNode;
  try { doc = parseXml(text); } catch { throw new PttavmError(res.status, text); }
  const fault = pick(doc, "Envelope", "Body", "Fault");
  if (fault) throw new PttavmError(res.status, String(pick(fault, "faultstring") ?? "SOAP Fault"));
  const r = camelize(pick(doc, "Envelope", "Body", "StokFiyatGuncelle3Response", "StokFiyatGuncelle3Result")) as Record<string, unknown> | null;
  if (!res.ok || !r || String(r.success).toLowerCase() !== "true") throw new PttavmError(res.status, String(r?.errorMessage ?? text));
  const w = r.warningMessages as Record<string, unknown> | null;
  const warnings = w && typeof w === "object" ? Object.values(w).flat().map(String) : [];
  return { before, urunId: r.urunId == null ? null : String(r.urunId), warnings };
}
