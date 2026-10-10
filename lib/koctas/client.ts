/**
 * Koçtaş (Mirakl Marketplace Platform) satıcı API istemcisi (2026-10-10, Alperen: "Koçtaş'a geç"). Kaynak: developer.mirakl.com satıcı
 * OpenAPI (seller openapi3.json). Örnek: https://koctas.mirakl.net (V01 /api/version herkese açık; giriş sayfası "Koçtaş Satış Ortağım").
 *  - Kimlik: başlık `Authorization: <API anahtarı>` (Bearer YOK); `shop_id` isteğe bağlı (çok mağazalı kullanıcı). 429 → Retry-After.
 *  - Okumalar: OR11 siparişler (/api/orders; max 100, offset; dakikada en fazla 1 yoklama), M11 mesaj konuları (/api/inbox/threads;
 *    page_token), TL02 ödeme hareketleri (/api/sellerpayment/transactions_logs; limit ≤ 2000, dakikada 20 / saatte 60), OF21 teklifler
 *    (/api/offers), RT11 iadeler (/api/returns; 5 dakikada 1).
 *  - Tek yazma: müşteri mesajına yanıt M12 (POST /api/inbox/threads/{id}/message, multipart `message_input`) — yalnız
 *    lib/actions/koctas-message-actions.ts (marketplaceQuestions.answer izni + kayıt). Teklif (fiyat/stok) yazma OF24/OF01 KURULMADI
 *    (AI-RULES; OF24 gönderilmeyen alanları varsayılana SIFIRLAR).
 * Komisyon: sipariş satırında TUTAR var — commission_fee (KDV hariç), total_commission (KDV dahil). TL02'de COMMISSION_FEE/VAT kalemleri.
 * Kişisel veri (müşteri adı, adres, mesaj gönderen adı) özetlere ve günlüğe yazılmaz.
 */
export const KOCTAS_DEFAULT_URL = "https://koctas.mirakl.net";
const TIMEOUT_MS = 25_000;

export type KoctasConfig = { baseUrl: string; apiKey: string; shopId?: string };
type Fetch = typeof fetch;

export function koctasConfig(env: Record<string, string | undefined> = process.env): KoctasConfig | null {
  const key = env.KOCTAS_API_KEY?.trim();
  if (!key) return null;
  const base = (env.KOCTAS_BASE_URL?.trim() || KOCTAS_DEFAULT_URL).replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9-]+\.mirakl\.net$/.test(base)) throw new Error("KOCTAS_BASE_URL https://<örnek>.mirakl.net olmalı");
  return { baseUrl: base, apiKey: key, shopId: env.KOCTAS_SHOP_ID?.trim() || undefined };
}

export class KoctasError extends Error {
  constructor(public status: number | null, message: string, public retryAfterSec: number | null = null) {
    super(`Koçtaş ${status ?? "ağ"}: ${message.slice(0, 300)}${retryAfterSec != null ? ` (yeniden dene: ${retryAfterSec} sn)` : ""}`); this.name = "KoctasError";
  }
}

const READ_PATHS = [/^\/api\/version$/, /^\/api\/orders$/, /^\/api\/inbox\/threads$/, /^\/api\/inbox\/threads\/[\w-]+$/,
  /^\/api\/sellerpayment\/transactions_logs$/, /^\/api\/offers$/, /^\/api\/returns$/];

async function request(cfg: KoctasConfig, method: "GET" | "POST", path: string, params: Record<string, string | number | boolean | undefined>, f: Fetch, body?: BodyInit): Promise<unknown> {
  const url = new URL(cfg.baseUrl + path);
  for (const [k, v] of Object.entries({ ...params, shop_id: cfg.shopId })) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  let res: Response;
  try { res = await f(url.toString(), { method, headers: { Authorization: cfg.apiKey, Accept: "application/json" }, body, signal: ac.signal, cache: "no-store" }); }
  catch (e) { throw new KoctasError(null, e instanceof Error ? e.message : "ağ hatası"); }
  finally { clearTimeout(t); }
  const text = await res.text();
  if (!res.ok) throw new KoctasError(res.status, text, res.status === 429 ? Number(res.headers.get("Retry-After")) || null : null);
  return text ? JSON.parse(text) : null;
}

export async function koctasGet<T>(cfg: KoctasConfig, path: string, params: Record<string, string | number | boolean | undefined> = {}, f: Fetch = fetch): Promise<T> {
  if (!READ_PATHS.some(re => re.test(path))) throw new Error(`Koçtaş okuma listesinde değil: ${path}`);
  return request(cfg, "GET", path, params, f) as Promise<T>;
}

// ── OR11 siparişler ──────────────────────────────────────────────────────────
export type KoctasLine = { order_line_id?: string; order_line_state?: string; offer_sku?: string; quantity?: number; price?: number;
  shipping_price?: number; total_price?: number; commission_fee?: number; total_commission?: number; commission_vat?: number };
export type KoctasOrder = { order_id?: string; order_state?: string; created_date?: string; price?: number; total_commission?: number; order_lines?: KoctasLine[] };

export async function listOrders(cfg: KoctasConfig, from: Date, to: Date, f: Fetch = fetch, maxPages = 50): Promise<KoctasOrder[]> {
  const out: KoctasOrder[] = [];
  for (let page = 0; page < maxPages; page++) {
    const r = await koctasGet<{ orders?: KoctasOrder[]; total_count?: number }>(cfg, "/api/orders",
      { start_date: from.toISOString(), end_date: to.toISOString(), max: 100, offset: page * 100, sort: "dateCreated" }, f);
    const items = r?.orders ?? [];
    out.push(...items);
    if (items.length < 100 || (r?.total_count != null && out.length >= r.total_count)) break;
  }
  return out;
}

/** Komisyon özeti (kişisel veri yok). Oran = commission_fee / satır fiyatı (kargo hariç). Reddedilen/iptal/iade satırlar hariç. */
export const KOCTAS_EXCLUDED_STATES = new Set(["REFUSED", "CANCELED", "REFUNDED", "STAGING", "WAITING_ACCEPTANCE"]);
export function summarizeCommission(orders: KoctasOrder[]) {
  let lines = 0, excluded = 0, gross = 0, fee = 0, feeInclVat = 0, rated = 0, missing = 0;
  const byState: Record<string, number> = {};
  for (const o of orders) for (const l of o.order_lines ?? []) {
    const st = l.order_line_state ?? o.order_state ?? "?";
    byState[st] = (byState[st] ?? 0) + 1;
    if (KOCTAS_EXCLUDED_STATES.has(st)) { excluded++; continue; }
    lines++; gross += l.price ?? 0;
    if (l.commission_fee == null) { missing++; continue; }
    fee += l.commission_fee; feeInclVat += l.total_commission ?? l.commission_fee + (l.commission_vat ?? 0); rated += l.price ?? 0;
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { orders: orders.length, lines, excludedLines: excluded, linesWithoutCommission: missing, grossTry: r2(gross), commissionFeeTry: r2(fee),
    commissionInclVatTry: r2(feeInclVat), commissionPctOfGross: rated > 0 ? r2((fee / rated) * 100) : null, byState };
}

// ── M11 / M12 müşteri mesajları ──────────────────────────────────────────────
type RawThread = { id: string; topic?: { type?: string; value?: string }; entities?: { type?: string; id?: string; label?: string }[];
  metadata?: { shop_reply_needed_since?: string | null; last_sender?: { type?: string } | null; last_message_date?: string };
  date_updated?: string; messages?: { body?: string; date_created?: string; from?: { type?: string } }[] };
export type KoctasThread = { id: string; topic: string | null; entityType: string | null; entityId: string | null; entityLabel: string | null;
  replyNeededSince: string | null; lastSenderType: string | null; messages: { fromType: string | null; body: string; date: string | null }[] };

/** Ham konu → ekran modeli. Gönderen ADI/kimliği taşınmaz, yalnız türü (CUSTOMER_USER, SHOP_USER, OPERATOR_USER). */
export function toThread(t: RawThread): KoctasThread {
  const e = t.entities?.[0];
  return { id: t.id, topic: t.topic?.value ?? null, entityType: e?.type ?? null, entityId: e?.id ?? null, entityLabel: e?.label ?? null,
    replyNeededSince: t.metadata?.shop_reply_needed_since ?? null, lastSenderType: t.metadata?.last_sender?.type ?? null,
    messages: (t.messages ?? []).map(m => ({ fromType: m.from?.type ?? null, body: m.body ?? "", date: m.date_created ?? null })) };
}

export async function listThreads(cfg: KoctasConfig, q: { updatedSince?: Date; pageToken?: string; limit?: number } = {}, f: Fetch = fetch) {
  const r = await koctasGet<{ data?: RawThread[]; next_page_token?: string | null }>(cfg, "/api/inbox/threads",
    { with_messages: true, limit: Math.min(100, q.limit ?? 50), updated_since: q.updatedSince?.toISOString(), page_token: q.pageToken }, f);
  return { items: (r?.data ?? []).map(toThread), nextPageToken: r?.next_page_token ?? null };
}

/** M12 — müşteri mesajına yanıt. TEK yazma işlemi; yalnız insan onaylı eylemden çağrılır. Gövde 3–50.000 karakter. */
export async function replyToThread(cfg: KoctasConfig, threadId: string, body: string, to: "CUSTOMER" | "OPERATOR" = "CUSTOMER", f: Fetch = fetch): Promise<{ message_id?: string }> {
  if (!/^[\w-]{1,100}$/.test(threadId)) throw new Error("geçersiz konu id");
  const text = body.trim();
  if (text.length < 3 || text.length > 50_000) throw new Error("mesaj 3–50.000 karakter olmalı");
  const form = new FormData();
  form.append("message_input", new Blob([JSON.stringify({ body: text, to: [{ type: to }] })], { type: "application/json" }));
  return request(cfg, "POST", `/api/inbox/threads/${threadId}/message`, {}, f, form) as Promise<{ message_id?: string }>;
}

// ── TL02 ödeme hareketleri (komisyon kalemleri) ───────────────────────────────
type Tx = { type?: string; amount?: number; payment_state?: string };
export async function transactionSummary(cfg: KoctasConfig, from: Date, to: Date, f: Fetch = fetch, maxPages = 10) {
  const byType: Record<string, number> = {}; let count = 0; let token: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const r = await koctasGet<{ data?: Tx[]; next_page_token?: string | null }>(cfg, "/api/sellerpayment/transactions_logs",
      { date_created_from: from.toISOString(), date_created_to: to.toISOString(), limit: 2000, page_token: token }, f);
    for (const t of r?.data ?? []) { count++; const k = t.type ?? "?"; byType[k] = Math.round(((byType[k] ?? 0) + (t.amount ?? 0)) * 100) / 100; }
    token = r?.next_page_token ?? undefined;
    if (!token) break;
  }
  const commission = ["COMMISSION_FEE", "COMMISSION_VAT", "REFUND_COMMISSION_FEE", "REFUND_COMMISSION_VAT"].reduce((a, k) => a + (byType[k] ?? 0), 0);
  return { transactions: count, byType, commissionNetTry: Math.round(commission * 100) / 100 };
}

export async function countReturns(cfg: KoctasConfig, from: Date, f: Fetch = fetch): Promise<number> {
  const r = await koctasGet<{ data?: unknown[] }>(cfg, "/api/returns", { return_creation_date_from: from.toISOString(), limit: 100 }, f);
  return r?.data?.length ?? 0;
}
