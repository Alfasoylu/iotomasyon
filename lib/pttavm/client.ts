/**
 * PttAVM pazaryeri istemcisi — YALNIZ OKUMA (docs/AI-RULES.md: stok/fiyat/ürün/sipariş durumu yazma Entegra'nın işi; bu projeden
 * açık onayla bile yapılmaz). Kaynak: developers.pttavm.com/tr (2026-10-10 okundu) + WSDL'den üretilmiş proxy.
 *
 * İki kimlik yolu (PttAVM ikisini paralel çalıştırıyor; kullanıcı adı/şifre "çoğunluk geçince" kaldırılacak):
 *  - REST  https://integration-api.pttavm.com/api/v1 — başlıklar Api-Key + access-token + X-Correlation-Id (her istekte yeni UUID).
 *          Anahtarlar Satıcı Paneli → Hesap Yönetimi → Entegrasyon Bilgileri. Ortam: PTTAVM_API_KEY, PTTAVM_ACCESS_TOKEN.
 *  - SOAP  https://ws.pttavm.com:93/service.svc — WS-Security UsernameToken (gövdede kullanıcı/şifre alanı yok; mağaza kimlikten).
 *          Ortam: PTTAVM_USERNAME, PTTAVM_PASSWORD. PTTAVM_SHOP_ID yalnız bilgi.
 *  REST anahtarları varsa REST, yoksa SOAP kullanılır.
 *
 * Okunabilenler: sipariş arama (≤ 40 gün; burada 30 günlük dilimler), sipariş detayı, kargo bilgisi, kargo profilleri, ürün/stok
 * listesi, barkod sorgusu, kategoriler, depolar, satıcı bilgisi. Resmî kaynakta hakediş/finans ve iade ucu YOK: iade yalnız
 * sipariş satırı durumunda (`iade`, `gondericisine_teslim_edildi`) görünür; net alacak satır komisyonundan TAHMİN edilir.
 * Kişisel veri (ad, TCKN, telefon, adres) bu modülden loglanmaz; teşhis özeti yalnız sayı/tutar döner.
 */
import { randomUUID } from "node:crypto";
import { asArray, escapeXml, parseXml, pick, type XmlNode } from "./xml";

const REST_BASE = "https://integration-api.pttavm.com/api/v1";
const SHIPMENT_BASE = "https://shipment.pttavm.com/api/v1";
const SOAP_URL = "https://ws.pttavm.com:93/service.svc";
const TIMEOUT_MS = 25_000;
export const MAX_ORDER_WINDOW_DAYS = 30; // resmî sınır 40 gün; güvenli pay

export type PttavmMode = "rest" | "soap";
export type PttavmConfig = { mode: PttavmMode; apiKey?: string; accessToken?: string; username?: string; password?: string; shopId?: string };

export function pttavmConfig(env: Record<string, string | undefined> = process.env): PttavmConfig | null {
  const v = (k: string) => env[k]?.trim() || undefined;
  const shopId = v("PTTAVM_SHOP_ID");
  if (v("PTTAVM_API_KEY") && v("PTTAVM_ACCESS_TOKEN")) return { mode: "rest", apiKey: v("PTTAVM_API_KEY"), accessToken: v("PTTAVM_ACCESS_TOKEN"), shopId };
  if (v("PTTAVM_USERNAME") && v("PTTAVM_PASSWORD")) return { mode: "soap", username: v("PTTAVM_USERNAME"), password: v("PTTAVM_PASSWORD"), shopId };
  return null;
}

export class PttavmError extends Error {
  constructor(public status: number | null, message: string) { super(`PttAVM ${status ?? "ağ"}: ${message.slice(0, 300)}`); this.name = "PttavmError"; }
}

type Fetch = typeof fetch;
async function timed(f: Fetch, url: string, init: RequestInit): Promise<Response> {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try { return await f(url, { ...init, signal: ac.signal, cache: "no-store" }); }
  catch (e) { throw new PttavmError(null, e instanceof Error ? e.message : "ağ hatası"); }
  finally { clearTimeout(t); }
}

// ── REST ──
function restHeaders(cfg: PttavmConfig): Record<string, string> {
  return { "Api-Key": cfg.apiKey!, "access-token": cfg.accessToken!, "X-Correlation-Id": randomUUID(), "Content-Type": "application/json", Accept: "application/json" };
}
/** Yazma modülü (lib/pttavm/write.ts) aynı başlık + zaman aşımı kurallarını kullanır. */
export { timed as pttavmTimed, restHeaders as pttavmRestHeaders, REST_BASE as PTTAVM_REST_BASE, SOAP_URL as PTTAVM_SOAP_URL };
export async function restGet<T>(cfg: PttavmConfig, path: string, params: Record<string, string | number | boolean> = {}, f: Fetch = fetch, base = REST_BASE): Promise<T> {
  const url = new URL(base + path);
  for (const [k, val] of Object.entries(params)) url.searchParams.set(k, String(val));
  const res = await timed(f, url.toString(), { method: "GET", headers: restHeaders(cfg) });
  const body = await res.text();
  if (!res.ok) throw new PttavmError(res.status, body);
  return (body ? JSON.parse(body) : null) as T;
}
/** Yalnız OKUMA amaçlı POST uçları (barkod sorgusu, iş takibi, depo listesi) — yazma uçları bu modülde yok. */
const READ_ONLY_POST = new Set(["/products/get-by-barcodes", "/products/get-faulty-images", "/get-warehouse", "/barcode-status"]);
export async function restPostRead<T>(cfg: PttavmConfig, path: string, body: unknown, f: Fetch = fetch, base = REST_BASE): Promise<T> {
  if (!READ_ONLY_POST.has(path) && !path.startsWith("/products/tracking-result/")) throw new Error(`PttAVM yazma ucu engellendi (salt-okuma modülü): ${path}`);
  const res = await timed(f, base + path, { method: "POST", headers: restHeaders(cfg), body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new PttavmError(res.status, text);
  return (text ? JSON.parse(text) : null) as T;
}

// ── SOAP ──
const SOAP_READ_OPS = new Set(["GetVersion", "KullaniciTedarikciBilgisiGetir", "SiparisKontrolListesiV2", "SiparisDetay", "KargoBilgiListesi",
  "GetCargoProfiles", "BarkodKontrol", "GetMainCategories", "GetCategory", "GetProductsWithVariants", "StokKontrolListesi"]);
export function soapEnvelope(cfg: PttavmConfig, op: string, args: Record<string, string | number> = {}): string {
  return soapEnvelopeRaw(cfg, op, Object.entries(args).map(([k, v]) => `<tem:${k}>${escapeXml(String(v))}</tem:${k}>`).join(""));
}
/** Ham gövdeli zarf (iç içe DataContract alanları için; ad alanı `ept` = ePttAVMService). Çağıran içeriği kaçışlamaktan sorumlu. */
export function soapEnvelopeRaw(cfg: PttavmConfig, op: string, body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/" xmlns:ept="http://schemas.datacontract.org/2004/07/ePttAVMService">`
    + `<soapenv:Header><wsse:Security soapenv:mustUnderstand="1" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">`
    + `<wsse:UsernameToken><wsse:Username>${escapeXml(cfg.username!)}</wsse:Username>`
    + `<wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${escapeXml(cfg.password!)}</wsse:Password>`
    + `</wsse:UsernameToken></wsse:Security></soapenv:Header><soapenv:Body><tem:${op}>${body}</tem:${op}></soapenv:Body></soapenv:Envelope>`;
}
export async function soapCall(cfg: PttavmConfig, op: string, args: Record<string, string | number> = {}, f: Fetch = fetch): Promise<XmlNode | XmlNode[] | undefined> {
  if (!SOAP_READ_OPS.has(op)) throw new Error(`PttAVM SOAP işlemi salt-okuma listesinde değil: ${op}`);
  const res = await timed(f, SOAP_URL, { method: "POST", headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"http://tempuri.org/IService/${op}"` }, body: soapEnvelope(cfg, op, args) });
  const text = await res.text();
  let doc: XmlNode;
  try { doc = parseXml(text); } catch { throw new PttavmError(res.status, text); }
  const fault = pick(doc, "Envelope", "Body", "Fault");
  if (fault) throw new PttavmError(res.status, String(pick(fault, "faultstring") ?? pick(fault, "Reason", "Text") ?? "SOAP Fault"));
  if (!res.ok) throw new PttavmError(res.status, text);
  return pick(doc, "Envelope", "Body", `${op}Response`, `${op}Result`);
}

/** PascalCase SOAP alanlarını REST'in camelCase adlarına çevirir (SiparisNo → siparisNo; dizi/iç içe korunur). */
export function camelize(n: XmlNode | XmlNode[] | undefined): unknown {
  if (n == null || typeof n === "string") return n ?? null;
  if (Array.isArray(n)) return n.map(camelize);
  return Object.fromEntries(Object.entries(n).map(([k, v]) => [k.charAt(0).toLowerCase() + k.slice(1), camelize(v as XmlNode)]));
}

// ── Ortak model ──
export type PttavmOrderLine = { lineItemId?: number | string; urunId?: number | string; urunBarkod?: string | null; variantBarkod?: string | null;
  siparisDurumu?: string | null; toplamIslemAdedi?: number | string; kdvOrani?: number | string; kdvHaricToplamTutar?: number | string;
  kdvDahilToplamTutar?: number | string; komisyon?: number | string; indirimToplam?: number | string; indirimPttavm?: number | string;
  indirimTedarikci?: number | string; couponAmount?: number | string; isInvoice?: boolean | string };
export type PttavmOrder = { siparisNo?: string | null; islemTarihi?: string | null; kargoTutari?: number | string; siparisUrunler?: PttavmOrderLine[] } & Record<string, unknown>;

const ymd = (d: Date) => d.toISOString().slice(0, 19);
/** [from, to] aralığını ≤ MAX_ORDER_WINDOW_DAYS günlük dilimlere böler (resmî sınır 40 gün). */
export function orderWindows(from: Date, to: Date, days = MAX_ORDER_WINDOW_DAYS): [Date, Date][] {
  if (to < from) throw new Error("bitiş başlangıçtan önce olamaz");
  const out: [Date, Date][] = [];
  for (let a = new Date(from); a < to; ) {
    const b = new Date(Math.min(to.getTime(), a.getTime() + days * 86400000));
    out.push([a, b]); a = b;
  }
  return out.length ? out : [[from, to]];
}

export async function searchOrders(cfg: PttavmConfig, from: Date, to: Date, f: Fetch = fetch): Promise<PttavmOrder[]> {
  const all: PttavmOrder[] = [];
  for (const [a, b] of orderWindows(from, to)) {
    if (cfg.mode === "rest") {
      const r = await restGet<PttavmOrder[] | { data?: PttavmOrder[] }>(cfg, "/orders/search", { startDate: ymd(a), endDate: ymd(b), isActiveOrders: false }, f);
      all.push(...(Array.isArray(r) ? r : r?.data ?? []));
    } else {
      const r = await soapCall(cfg, "SiparisKontrolListesiV2", { BaslangicTarihi: ymd(a), BitisTarihi: ymd(b), AktifSiparisler: 0 }, f);
      const rows = asArray(r && typeof r === "object" && !Array.isArray(r) ? Object.values(r)[0] as XmlNode | XmlNode[] : r);
      all.push(...rows.map(x => {
        const o = camelize(x) as PttavmOrder;
        const lines = (o.siparisUrunler as unknown as Record<string, unknown> | null)?.["siparisUrun"];
        return { ...o, siparisUrunler: asArray(lines as PttavmOrderLine | PttavmOrderLine[]) };
      }));
    }
  }
  return all;
}

export async function getOrder(cfg: PttavmConfig, orderId: string, f: Fetch = fetch): Promise<PttavmOrder | null> {
  if (cfg.mode === "rest") return restGet<PttavmOrder>(cfg, `/orders/${encodeURIComponent(orderId)}`, {}, f);
  return camelize(await soapCall(cfg, "SiparisDetay", { SiparisNo: orderId }, f)) as PttavmOrder | null;
}
export async function getCargoInfos(cfg: PttavmConfig, orderId: string, f: Fetch = fetch): Promise<unknown> {
  if (cfg.mode === "rest") return restGet(cfg, `/orders/${encodeURIComponent(orderId)}/cargo-infos`, {}, f);
  return camelize(await soapCall(cfg, "KargoBilgiListesi", { orderId }, f));
}
export async function getCargoProfiles(cfg: PttavmConfig, f: Fetch = fetch): Promise<unknown> {
  if (cfg.mode === "rest") return restGet(cfg, "/shipping/cargo-profiles", {}, f);
  return camelize(await soapCall(cfg, "GetCargoProfiles", {}, f));
}
export async function getMainCategories(cfg: PttavmConfig, f: Fetch = fetch): Promise<unknown> {
  if (cfg.mode === "rest") return restGet(cfg, "/categories/main", {}, f);
  return camelize(await soapCall(cfg, "GetMainCategories", {}, f));
}
/** Ürün/stok listesi (sayfalı). REST'te altı filtre "zorunlu" — 0 = filtre yok varsayımı (doğrulanmadı; hata metni teşhiste döner). */
export async function searchProducts(cfg: PttavmConfig, page = 1, f: Fetch = fetch): Promise<unknown[]> {
  if (cfg.mode === "rest") {
    const r = await restGet<unknown[] | { data?: unknown[] }>(cfg, "/products/search", { categoryId: 0, subCategoryId: 0, isActive: true, isInStock: false, merchantCategoryId: 0, searchPage: page }, f);
    return Array.isArray(r) ? r : r?.data ?? [];
  }
  const r = await soapCall(cfg, "GetProductsWithVariants", { page, size: 100 }, f);
  return asArray(camelize(r && typeof r === "object" && !Array.isArray(r) ? Object.values(r)[0] as XmlNode : r) as unknown[]);
}
export async function getProductsByBarcodes(cfg: PttavmConfig, barcodes: string[], f: Fetch = fetch): Promise<unknown> {
  if (cfg.mode !== "rest") throw new Error("toplu barkod sorgusu yalnız REST'te");
  return restPostRead(cfg, "/products/get-by-barcodes", { barcodes }, f);
}
export async function getWarehouses(cfg: PttavmConfig, f: Fetch = fetch): Promise<unknown> {
  if (cfg.mode !== "rest") throw new Error("depo listesi yalnız REST'te");
  return restPostRead(cfg, "/get-warehouse", {}, f, SHIPMENT_BASE);
}
/** Bağlantı testi: SOAP → GetVersion + satıcı bilgisi; REST → kargo profilleri (yan etkisiz okuma). */
export async function ping(cfg: PttavmConfig, f: Fetch = fetch): Promise<string> {
  if (cfg.mode === "rest") { await getCargoProfiles(cfg, f); return "rest:ok"; }
  const v = await soapCall(cfg, "GetVersion", {}, f);
  return `soap:${typeof v === "string" ? v : "ok"}`;
}

// ── Özet (kişisel veri yok) ──
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
export const RETURN_STATUSES = new Set(["iade", "gondericisine_teslim_edildi"]);
export function summarizeOrders(orders: PttavmOrder[]) {
  const byStatus: Record<string, number> = {};
  let lines = 0, gross = 0, net = 0, commission = 0, discountPttavm = 0, discountSeller = 0, cargo = 0, returnLines = 0, returnGross = 0;
  for (const o of orders) {
    cargo += n(o.kargoTutari);
    for (const l of o.siparisUrunler ?? []) {
      lines++;
      const st = String(l.siparisDurumu ?? "bilinmiyor");
      byStatus[st] = (byStatus[st] ?? 0) + 1;
      gross += n(l.kdvDahilToplamTutar); net += n(l.kdvHaricToplamTutar); commission += n(l.komisyon);
      discountPttavm += n(l.indirimPttavm); discountSeller += n(l.indirimTedarikci);
      if (RETURN_STATUSES.has(st)) { returnLines++; returnGross += n(l.kdvDahilToplamTutar); }
    }
  }
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return { orders: orders.length, lines, byStatus, grossInclVatTry: r2(gross), netExclVatTry: r2(net), commissionTry: r2(commission),
    commissionPctOfGross: gross > 0 ? r2((commission / gross) * 100) : null, discountPttavmTry: r2(discountPttavm), discountSellerTry: r2(discountSeller),
    cargoTry: r2(cargo), returnLines, returnGrossTry: r2(returnGross) };
}
