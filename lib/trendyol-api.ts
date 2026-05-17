/**
 * Phase 14 — Trendyol Seller API Client
 * Phase 16 — Extended with Q&A and Claim write operations
 *
 * Base URLs:
 *   Orders/Claims: https://apigw.trendyol.com/integration/order/sellers/{supplierId}/
 *   Q&A:           https://apigw.trendyol.com/integration/qna/sellers/{supplierId}/
 *   Claim reasons: https://apigw.trendyol.com/integration/order/claim-issue-reasons
 *
 * Auth: Basic base64(apiKey:apiSecret)
 *
 * All functions return typed results or throw on error.
 */

// Trendyol integration gateways
const ORDER_BASE_URL = "https://apigw.trendyol.com/integration/order/sellers";
const QNA_BASE_URL   = "https://apigw.trendyol.com/integration/qna/sellers";

// Legacy alias kept for read functions that already reference BASE_URL
const BASE_URL = ORDER_BASE_URL;

export interface TrendyolConfig {
  supplierId: string;
  apiKey: string;
  apiSecret: string;
}

function authHeader(cfg: TrendyolConfig): string {
  const encoded = Buffer.from(`${cfg.apiKey}:${cfg.apiSecret}`).toString("base64");
  return `Basic ${encoded}`;
}

async function trendyolFetch<T>(
  cfg: TrendyolConfig,
  path: string,
  params?: Record<string, string | number>,
): Promise<T> {
  const url = new URL(`${BASE_URL}/${cfg.supplierId}/${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: authHeader(cfg),
      "Content-Type": "application/json",
      "User-Agent": `iotomasyon-crm/1.0 (${cfg.supplierId})`,
    },
    next: { revalidate: 0 }, // never cache — always fresh from Trendyol
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new TrendyolApiError(res.status, text);
  }

  const json = await res.json();
  // Debug: log raw response shape so we can catch structure mismatches
  if (process.env.NODE_ENV !== "production" || process.env.TRENDYOL_DEBUG) {
    console.log("[trendyol-api] raw response keys:", Object.keys(json ?? {}));
  }
  return json as T;
}

/** POST helper — sends JSON body, returns parsed response or throws. */
async function trendyolPost<T>(
  cfg: TrendyolConfig,
  baseUrl: string,
  path: string,
  body: unknown,
): Promise<T> {
  const url = `${baseUrl}/${cfg.supplierId}/${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader(cfg),
      "Content-Type": "application/json",
      "User-Agent": `iotomasyon-crm/1.0 (${cfg.supplierId})`,
    },
    body: JSON.stringify(body),
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new TrendyolApiError(res.status, text);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

/** PUT helper — sends JSON body, returns parsed response or throws. */
async function trendyolPut<T>(
  cfg: TrendyolConfig,
  baseUrl: string,
  path: string,
  body: unknown,
): Promise<T> {
  const url = `${baseUrl}/${cfg.supplierId}/${path}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: authHeader(cfg),
      "Content-Type": "application/json",
      "User-Agent": `iotomasyon-crm/1.0 (${cfg.supplierId})`,
    },
    body: JSON.stringify(body),
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new TrendyolApiError(res.status, text);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

export class TrendyolApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`Trendyol API ${status}: ${body.slice(0, 200)}`);
    this.name = "TrendyolApiError";
  }
}

// ─── Order types ──────────────────────────────────────────────────────────────

export interface TrendyolOrderLine {
  quantity: number;
  salesCampaignId: number;
  productSize: string | null;
  merchantSku: string | null;
  productName: string;
  productCode: number;
  barcode: string | null;
  price: number;
  discountedPrice: number;
  currencyCode: string;
  productColor: string | null;
  id: number;
  sku: string | null;
  vatBaseAmount: number;
  publicSku: string | null;
  orderLineItemStatusName: string;
  stockId: number;
}

export interface TrendyolOrder {
  shipmentAddress: {
    id: number;
    firstName: string;
    lastName: string;
    address1: string;
    address2: string | null;
    city: string;
    cityCode: number;
    district: string;
    districtId: number;
    postalCode: string;
    countryCode: string;
    fullName: string;
    fullAddress: string;
  };
  orderNumber: string;
  grossAmount: number;
  totalDiscount: number;
  totalTyDiscount: number;
  taxNumber: string | null;
  invoiceAddress: {
    firstName: string;
    lastName: string;
    company: string | null;
    address1: string;
    city: string;
    district: string;
    postalCode: string;
    countryCode: string;
    fullName: string;
    fullAddress: string;
  };
  customerFirstName: string;
  customerEmail: string;
  id: number;
  cargoTrackingNumber: number;
  cargoTrackingLink: string | null;
  cargoSenderNumber: string | null;
  cargoProviderName: string;
  lines: TrendyolOrderLine[];
  orderDate: number; // epoch ms
  tcIdentityNumber: string | null;
  currencyCode: string;
  packageHistories: Array<{
    createdDate: number;
    status: string;
    statusName: string;
  }>;
  shipmentPackageId: number;
  status: string;
  deliveryType: string | null;
  estimatedDeliveryStartDate: number | null;
  estimatedDeliveryEndDate: number | null;
  totalPrice: number;
  deliveryAddressType: string | null;
  agreedDeliveryDate: number | null;
  commercialId: number;
  fastDelivery: boolean;
  originShipmentDate: number | null;
  lastModifiedDate: number;
  customerLastName: string;
  invoicedDate: number | null;
  invoiceNumber: string | null;
}

export interface TrendyolOrdersResponse {
  content: TrendyolOrder[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
}

// ─── Return / Claim types ─────────────────────────────────────────────────────
// Verified against live getClaims API (apigw.trendyol.com/integration/order/sellers)

export interface TrendyolClaimItemStatus {
  name: string; // "Accepted" | "Rejected" | "InAnalysis" | "Refunded" | "WaitingForArrival" | ...
}

export interface TrendyolClaimItemReason {
  id: number;
  name: string;       // Turkish reason string, e.g. "Kusurlu ürün gönderildi"
  externalReasonId: number;
  code: string;
}

export interface TrendyolClaimItem {
  id: string;
  orderLineItemId: number;
  customerClaimItemReason: TrendyolClaimItemReason | null;
  trendyolClaimItemReason: TrendyolClaimItemReason | null;
  claimItemStatus: TrendyolClaimItemStatus;
  autoApproveDate: number | null;
  note: string | null;
  customerNote: string | null;
  resolved: boolean;
  autoAccepted: boolean | null;
  acceptedBySeller: boolean | null;
  acceptDetail: string | null;
}

export interface TrendyolClaimOrderLine {
  id: number;
  productName: string;
  barcode: string | null;
  merchantSku: string | null;
  productColor: string | null;
  productSize: string | null;
  price: number;
  vatBaseAmount: number;
  vatRate: number;
  salesCampaignId: number;
  productCategory: string | null;
}

export interface TrendyolClaimLineItem {
  orderLine: TrendyolClaimOrderLine;
  claimItems: TrendyolClaimItem[];
}

export interface TrendyolReturn {
  id: string;
  claimId: string;
  orderNumber: string;
  orderDate: number;         // epoch ms — date of original order
  claimDate: number;         // epoch ms — date claim was opened
  lastModifiedDate: number;
  customerFirstName: string;
  customerLastName: string;
  cargoTrackingNumber: number | null;
  cargoProviderName: string | null;
  cargoSenderNumber: string | null;
  cargoTrackingLink: string | null;
  orderShipmentPackageId: number | null;
  orderOutboundPackageId: number | null;
  items: TrendyolClaimLineItem[];
}

export interface TrendyolReturnsResponse {
  content: TrendyolReturn[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
}

// ─── Public API functions ─────────────────────────────────────────────────────

/** Returns epoch-ms for N days ago */
function daysAgo(n: number): number {
  return Date.now() - n * 24 * 60 * 60 * 1000;
}

export async function fetchTrendyolOrders(
  cfg: TrendyolConfig,
  opts: { page?: number; size?: number; status?: string; startDate?: number; endDate?: number } = {},
): Promise<TrendyolOrdersResponse> {
  const params: Record<string, string | number> = {
    page: opts.page ?? 0,
    size: opts.size ?? 50,
    // Trendyol requires date range — default: last 30 days
    startDate: opts.startDate ?? daysAgo(30),
    endDate: opts.endDate ?? Date.now(),
  };
  if (opts.status) params.status = opts.status;
  return trendyolFetch<TrendyolOrdersResponse>(cfg, "orders", params);
}

export async function fetchTrendyolReturns(
  cfg: TrendyolConfig,
  opts: { page?: number; size?: number; startDate?: number; endDate?: number } = {},
): Promise<TrendyolReturnsResponse> {
  return trendyolFetch<TrendyolReturnsResponse>(cfg, "claims", {
    page: opts.page ?? 0,
    size: opts.size ?? 50,
    startDate: opts.startDate ?? daysAgo(30),
    endDate: opts.endDate ?? Date.now(),
  });
}

/** Simple connectivity check — fetch 1 order, return true if API responds OK. */
export async function testTrendyolConnection(cfg: TrendyolConfig): Promise<{ ok: boolean; message: string }> {
  try {
    await fetchTrendyolOrders(cfg, { size: 1 });
    return { ok: true, message: "Bağlantı başarılı." };
  } catch (err) {
    if (err instanceof TrendyolApiError) {
      if (err.status === 401) return { ok: false, message: "Kimlik doğrulama başarısız — API anahtarı veya gizli anahtar yanlış." };
      if (err.status === 403) return { ok: false, message: "Erişim reddedildi — satıcı ID'si doğrulanamadı." };
      if (err.status === 404) return { ok: false, message: "Satıcı bulunamadı — supplierId kontrol edin." };
      return { ok: false, message: `Trendyol API hatası: ${err.status}` };
    }
    return { ok: false, message: `Ağ hatası: ${err instanceof Error ? err.message : "Bilinmeyen hata"}` };
  }
}

// ─── Q&A types (Phase 16) ─────────────────────────────────────────────────────

export type TrendyolQuestionStatus =
  | "WAITING_FOR_ANSWER"
  | "ANSWERED"
  | "REJECTED"
  | "REPORTED";

export interface TrendyolQuestionCategory {
  id: number;
  name: string;
}

export interface TrendyolQuestion {
  id: number;  // Trendyol returns int64 — not string
  text: string;
  createdDate: number;   // epoch ms
  status: TrendyolQuestionStatus;
  productName: string;
  barcode: string | null;
  productCode: number | null;
  answers: Array<{
    id: number;  // also int64
    text: string;
    createdDate: number;
    createdBy: string | null;
  }>;
  categoryName: string | null;
}

export interface TrendyolQuestionsResponse {
  content: TrendyolQuestion[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
}

// ─── Claim issue reason types (Phase 16) ──────────────────────────────────────

export interface TrendyolClaimIssueReason {
  id: number;
  name: string;       // Turkish label
  code: string | null;
}

// ─── Q&A API functions (Phase 16) ────────────────────────────────────────────

export async function fetchTrendyolQuestions(
  cfg: TrendyolConfig,
  opts: {
    page?: number;
    size?: number;
    status?: TrendyolQuestionStatus;
    startDate?: number;
    endDate?: number;
  } = {},
): Promise<TrendyolQuestionsResponse> {
  const params: Record<string, string | number> = {
    page: opts.page ?? 0,
    size: opts.size ?? 50,
  };
  if (opts.status)    params.status    = opts.status;
  if (opts.startDate) params.startDate = opts.startDate;
  if (opts.endDate)   params.endDate   = opts.endDate;

  // Correct Trendyol endpoint is /questions/filter (not /questions)
  const url = new URL(`${QNA_BASE_URL}/${cfg.supplierId}/questions/filter`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: authHeader(cfg),
      "Content-Type": "application/json",
      "User-Agent": `iotomasyon-crm/1.0 (${cfg.supplierId})`,
    },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new TrendyolApiError(res.status, text);
  }
  return res.json() as Promise<TrendyolQuestionsResponse>;
}

/**
 * Answer a customer question on Trendyol.
 * POST /integration/qna/sellers/{supplierId}/questions/{questionId}/answers
 * Body: { text: string }  (10–2000 chars)
 */
export async function answerTrendyolQuestion(
  cfg: TrendyolConfig,
  questionId: string,
  text: string,
): Promise<void> {
  await trendyolPost<unknown>(cfg, QNA_BASE_URL, `questions/${questionId}/answers`, { text });
}

// ─── Claim write API functions (Phase 16) ─────────────────────────────────────

/**
 * Fetch available claim issue reasons (no supplierId in path).
 * GET https://apigw.trendyol.com/integration/order/claim-issue-reasons
 */
export async function fetchClaimIssueReasons(
  cfg: TrendyolConfig,
): Promise<TrendyolClaimIssueReason[]> {
  const url = "https://apigw.trendyol.com/integration/order/claim-issue-reasons";
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: authHeader(cfg),
      "Content-Type": "application/json",
      "User-Agent": `iotomasyon-crm/1.0 (${cfg.supplierId})`,
    },
    next: { revalidate: 300 }, // cache for 5 min — rarely changes
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new TrendyolApiError(res.status, text);
  }
  return res.json() as Promise<TrendyolClaimIssueReason[]>;
}

/**
 * Approve claim items.
 * PUT /integration/order/sellers/{supplierId}/claims/{claimId}/items/approve
 * Body: { claimLineItemIdList: string[] }
 */
export async function approveTrendyolClaim(
  cfg: TrendyolConfig,
  claimId: string,
  claimLineItemIds: string[],
): Promise<void> {
  await trendyolPut<unknown>(
    cfg,
    ORDER_BASE_URL,
    `claims/${claimId}/items/approve`,
    { claimLineItemIdList: claimLineItemIds },
  );
}

/**
 * Create a claim issue (reject / dispute).
 * POST /integration/order/sellers/{supplierId}/claims/{claimId}/issue
 * Body: { claimIssueReasonId: number, claimItemIdList: string, description: string }
 *
 * Note: claimItemIdList is a comma-separated string per Trendyol docs.
 */
export async function createTrendyolClaimIssue(
  cfg: TrendyolConfig,
  claimId: string,
  payload: {
    claimIssueReasonId: number;
    claimItemIdList: string;   // comma-separated claim item IDs
    description: string;
  },
): Promise<void> {
  await trendyolPost<unknown>(cfg, ORDER_BASE_URL, `claims/${claimId}/issue`, payload);
}
