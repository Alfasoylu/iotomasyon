/**
 * N11 API istemcisi (2026-10-10, Alperen: "Koçtaş ve N11 — PttAVM bitince"). Kaynak: developer.n11.com/documentation (+ public WSDL'ler).
 *  - REST https://api.n11.com — başlık `appKey` + `appSecret`: sipariş paketleri (/rest/delivery/v1/shipmentPackages; en fazla 15 günlük
 *    pencere, size ≤ 100, Kasım 2024 öncesi veri yok), satıcı ürün sorgusu (/ms/product-query; size ≤ 250).
 *  - SOAP https://api.n11.com/ws/<servis>/ (ad alanı http://www.n11.com/ws/schemas, gövdede <auth><appKey/><appSecret/></auth>):
 *    ürün soruları (GetProductQuestionList — dakikada 1; GetProductQuestionDetail), iadeler (ClaimReturnList), hakediş
 *    (SettlementService — portalda yok, WSDL hâlâ yayında; çalıştığı DOĞRULANMADI).
 *  - Tek yazma: soru yanıtı SaveProductAnswer (1–2048 karakter, soru başına bir kez) — yalnız lib/actions/n11-question-actions.ts
 *    (izin marketplaceQuestions.answer + kayıt). Fiyat/stok/ürün yazma uçları KURULMADI (AI-RULES; ölü stok istisnası Trendyol + PttAVM).
 * Komisyon: REST satırında yalnız ORAN var (commissionRate − sellerCampaignCommissionRate); tutar = satıcı fatura tutarı × oran (tahmin).
 * Kişisel veri (alıcı adı, adres, e-posta) özetlere ve günlüğe yazılmaz.
 */
import { asArray, escapeXml, parseXml, pick, type XmlNode } from "@/lib/pttavm/xml";

export const N11_REST = "https://api.n11.com";
const SOAP_NS = "http://www.n11.com/ws/schemas";
const TIMEOUT_MS = 25_000;
export const N11_ORDER_WINDOW_DAYS = 14; // resmî sınır 15 gün (daha geniş aralık sessizce son 15 güne kırpılır)

export type N11Config = { appKey: string; appSecret: string };
type Fetch = typeof fetch;

export function n11Config(env: Record<string, string | undefined> = process.env): N11Config | null {
  const k = env.N11_APP_KEY?.trim(), s = env.N11_APP_SECRET?.trim();
  return k && s ? { appKey: k, appSecret: s } : null;
}

export class N11Error extends Error {
  constructor(public status: number | null, message: string) { super(`N11 ${status ?? "ağ"}: ${message.slice(0, 300)}`); this.name = "N11Error"; }
}

async function timed(f: Fetch, url: string, init: RequestInit): Promise<Response> {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try { return await f(url, { ...init, signal: ac.signal, cache: "no-store" }); }
  catch (e) { throw new N11Error(null, e instanceof Error ? e.message : "ağ hatası"); }
  finally { clearTimeout(t); }
}

// ── REST (salt okuma) ────────────────────────────────────────────────────────
export async function restGet<T>(cfg: N11Config, path: string, params: Record<string, string | number | boolean | undefined> = {}, f: Fetch = fetch): Promise<T> {
  if (!path.startsWith("/rest/delivery/v1/shipmentPackages") && !path.startsWith("/ms/product-query")) throw new Error(`N11 REST okuma listesinde değil: ${path}`);
  const url = new URL(N11_REST + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  const res = await timed(f, url.toString(), { headers: { appKey: cfg.appKey, appSecret: cfg.appSecret, Accept: "application/json" } });
  const text = await res.text();
  if (!res.ok) throw new N11Error(res.status, text);
  return (text ? JSON.parse(text) : null) as T;
}

/** [from, to] aralığını ≤ 14 günlük dilimlere böler (resmî üst sınır 15 gün). */
export function orderWindows(from: Date, to: Date, days = N11_ORDER_WINDOW_DAYS): [Date, Date][] {
  const out: [Date, Date][] = []; const step = days * 86400_000;
  for (let s = from.getTime(); s < to.getTime(); s += step) out.push([new Date(s), new Date(Math.min(s + step - 1, to.getTime()))]);
  return out;
}

export type N11Line = { orderLineId?: number; productId?: number; stockCode?: string; barcode?: string; quantity?: number; price?: number;
  sellerInvoiceAmount?: number; dueAmount?: number; commissionRate?: number; sellerCampaignCommissionRate?: number; vatRate?: number;
  netMarketplaceFeeRate?: number; netMarketingFeeRate?: number; orderItemLineItemStatusName?: string; sellerDiscount?: number; sellerCouponDiscount?: number };
export type N11Package = { id?: number; orderNumber?: string; totalAmount?: number; shipmentPackageStatus?: string; lastModifiedDate?: number; lines?: N11Line[] };

const pageContent = <T,>(r: unknown): T[] => Array.isArray(r) ? r as T[] : Array.isArray((r as { content?: unknown })?.content) ? (r as { content: T[] }).content : [];

export async function listShipmentPackages(cfg: N11Config, from: Date, to: Date, f: Fetch = fetch, maxPages = 50): Promise<N11Package[]> {
  const out: N11Package[] = [];
  for (const [a, b] of orderWindows(from, to)) {
    for (let page = 0; page < maxPages; page++) {
      const r = await restGet<unknown>(cfg, "/rest/delivery/v1/shipmentPackages", { startDate: a.getTime(), endDate: b.getTime(), page, size: 100 }, f);
      const items = pageContent<N11Package>(r);
      out.push(...items);
      const total = (r as { totalPages?: number })?.totalPages;
      if (items.length < 100 || (total != null && page + 1 >= total)) break;
    }
  }
  return out;
}

export async function productQuery(cfg: N11Config, q: { stockCode?: string; page?: number; size?: number } = {}, f: Fetch = fetch) {
  const r = await restGet<{ content?: unknown[]; totalElements?: number; totalPages?: number }>(cfg, "/ms/product-query",
    { stockCode: q.stockCode, page: q.page ?? 0, size: Math.min(250, q.size ?? 50) }, f);
  return { items: pageContent<Record<string, unknown>>(r), totalElements: r?.totalElements ?? null, totalPages: r?.totalPages ?? null };
}

/** Komisyon özeti (kişisel veri yok). Etkin oran = commissionRate − sellerCampaignCommissionRate (yüzde); tutar = fatura tutarı × oran. */
export const N11_EXCLUDED_STATUSES = new Set(["Cancelled", "UnSupplied", "İptal Edildi", "Tedarik Edilemedi"]);
export function summarizeCommission(pkgs: N11Package[]) {
  let lines = 0, gross = 0, commission = 0, rated = 0, excluded = 0, missingRate = 0;
  const byStatus: Record<string, number> = {};
  for (const p of pkgs) for (const l of p.lines ?? []) {
    const st = l.orderItemLineItemStatusName ?? p.shipmentPackageStatus ?? "?";
    byStatus[st] = (byStatus[st] ?? 0) + 1;
    if (N11_EXCLUDED_STATUSES.has(st) || N11_EXCLUDED_STATUSES.has(p.shipmentPackageStatus ?? "")) { excluded++; continue; }
    lines++;
    const amt = l.sellerInvoiceAmount ?? ((l.price ?? 0) * (l.quantity ?? 0) - (l.sellerDiscount ?? 0) - (l.sellerCouponDiscount ?? 0));
    gross += amt;
    if (l.commissionRate == null) { missingRate++; continue; }
    const rate = Math.max(0, l.commissionRate - (l.sellerCampaignCommissionRate ?? 0)) / 100;
    commission += amt * rate; rated += amt;
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { packages: pkgs.length, lines, excludedLines: excluded, linesWithoutRate: missingRate, grossTry: r2(gross), commissionTry: r2(commission),
    commissionPctOfRated: rated > 0 ? r2((commission / rated) * 100) : null, byStatus };
}

// ── SOAP ─────────────────────────────────────────────────────────────────────
type SoapValue = string | number | null | { [k: string]: SoapValue };
function toXml(v: { [k: string]: SoapValue }): string {
  return Object.entries(v).map(([k, x]) => x == null ? `<${k}/>` : typeof x === "object" ? `<${k}>${toXml(x)}</${k}>` : `<${k}>${escapeXml(String(x))}</${k}>`).join("");
}
export function soapEnvelope(cfg: N11Config, op: string, body: { [k: string]: SoapValue }): string {
  return `<?xml version="1.0" encoding="utf-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sch="${SOAP_NS}">`
    + `<soapenv:Header/><soapenv:Body><sch:${op}Request>${toXml({ auth: { appKey: cfg.appKey, appSecret: cfg.appSecret }, ...body })}</sch:${op}Request></soapenv:Body></soapenv:Envelope>`;
}

const SOAP_READ: Record<string, string> = { GetProductQuestionList: "productService", GetProductQuestionDetail: "productService",
  ClaimReturnList: "returnService", GetSettlementList: "settlementService", GetSettlementDetail: "settlementService" };
const SOAP_WRITE: Record<string, string> = { SaveProductAnswer: "productService" };

async function soap(cfg: N11Config, op: string, body: { [k: string]: SoapValue }, f: Fetch, allowWrite = false): Promise<XmlNode | XmlNode[] | undefined> {
  const service = SOAP_READ[op] ?? (allowWrite ? SOAP_WRITE[op] : undefined);
  if (!service) throw new Error(`N11 SOAP işlemi izinli değil: ${op}`);
  const res = await timed(f, `${N11_REST}/ws/${service}/`, { method: "POST", headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '""' }, body: soapEnvelope(cfg, op, body) });
  const text = await res.text();
  let doc: XmlNode;
  try { doc = parseXml(text); } catch { throw new N11Error(res.status, text); }
  const fault = pick(doc, "Envelope", "Body", "Fault");
  if (fault) throw new N11Error(res.status, String(pick(fault, "faultstring") ?? "SOAP Fault"));
  if (!res.ok) throw new N11Error(res.status, text);
  const resp = pick(doc, "Envelope", "Body", `${op}Response`);
  const status = pick(resp, "result", "status");
  if (typeof status === "string" && status.toLowerCase() === "failure")
    throw new N11Error(res.status, `${pick(resp, "result", "errorCode") ?? ""} ${pick(resp, "result", "errorMessage") ?? ""}`.trim());
  return resp;
}

const ddmmyyyy = (d: Date) => new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric" }).format(d).replace(/\./g, "/");
const str = (v: unknown) => (typeof v === "string" ? v : null);
const num = (v: unknown) => (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

export type N11Question = { id: string; productId: string | null; productTitle: string | null; subject: string | null; question: string | null; answer: string | null };
export type N11QuestionStatus = "OPEN" | "CLOSED";

export async function listQuestions(cfg: N11Config, q: { status?: N11QuestionStatus; from: Date; to: Date; page?: number; pageSize?: number }, f: Fetch = fetch) {
  const resp = await soap(cfg, "GetProductQuestionList", { productQuestionSearch: { status: q.status ?? "OPEN", startDate: ddmmyyyy(q.from), endDate: ddmmyyyy(q.to) },
    pagingData: { currentPage: q.page ?? 0, pageSize: Math.min(100, q.pageSize ?? 50) } }, f);
  const items = asArray(pick(resp, "productQuestions", "productQuestion") as XmlNode | XmlNode[] | undefined).map((x): N11Question => ({
    id: str(pick(x, "id")) ?? "", productId: str(pick(x, "productId")), productTitle: str(pick(x, "productTitle")), subject: str(pick(x, "questionSubject")),
    question: str(pick(x, "question")), answer: str(pick(x, "answer")) || null })).filter(x => x.id);
  return { items, totalCount: num(pick(resp, "pagingData", "totalCount")), pageCount: num(pick(resp, "pagingData", "pageCount")) };
}

/** Soru yanıtı — TEK yazma işlemi; yalnız insan onaylı eylemden çağrılır. Soru başına bir kez; 1–2048 karakter. */
export async function answerQuestion(cfg: N11Config, questionId: string, answer: string, f: Fetch = fetch): Promise<void> {
  if (!/^\d{1,20}$/.test(questionId)) throw new Error("geçersiz soru id");
  const text = answer.trim();
  if (!text || text.length > 2048) throw new Error("yanıt 1–2048 karakter olmalı");
  await soap(cfg, "SaveProductAnswer", { productQuestionId: questionId, answer: text }, f, true);
}

/** İade talepleri (kişisel veri yok: yalnız sayı, tutar, sebep). */
export async function listReturns(cfg: N11Config, from: Date, to: Date, status = "ALL", f: Fetch = fetch, maxPages = 20) {
  const out: { claimReturnId: string | null; orderNumber: string | null; quantity: number | null; finalPrice: number | null; reason: string | null; status: string | null }[] = [];
  for (let page = 0; page < maxPages; page++) {
    const resp = await soap(cfg, "ClaimReturnList", { searchData: { status, period: { startDate: ddmmyyyy(from), endDate: ddmmyyyy(to) } }, pagingData: { currentPage: page } }, f);
    const list = asArray(pick(resp, "claimReturnList", "claimReturn") as XmlNode | XmlNode[] | undefined);
    for (const x of list) out.push({ claimReturnId: str(pick(x, "claimReturnId")), orderNumber: str(pick(x, "orderNumber")), quantity: num(pick(x, "quantity")),
      finalPrice: num(pick(x, "finalPrice")), reason: str(pick(x, "returnReasonType")), status: str(pick(x, "status")) });
    if (list.length < 20) break;
  }
  return out;
}

/** Hakediş özeti (SettlementService; portalda yok — çalıştığı DOĞRULANMADI, tarih biçimi dd/MM/yyyy varsayımı). */
export async function listSettlements(cfg: N11Config, from: Date, to: Date, f: Fetch = fetch) {
  const resp = await soap(cfg, "GetSettlementList", { startDate: ddmmyyyy(from), endDate: ddmmyyyy(to), pagingData: { currentPage: 0, pageSize: 100 } }, f);
  return asArray(pick(resp, "settlementListData", "settlementList") as XmlNode | XmlNode[] | undefined).map(x => ({
    settlementDate: str(pick(x, "settlementDate")), remittanceDate: str(pick(x, "remittanceDate")), status: str(pick(x, "status")),
    paymentAmount: num(pick(x, "paymentAmount")), deductionAmount: num(pick(x, "deductionAmount")), settlementAmount: num(pick(x, "settlementAmount")) }));
}
