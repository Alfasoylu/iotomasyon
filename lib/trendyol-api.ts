/**
 * Phase 14 — Trendyol Seller API Client (READ ONLY)
 *
 * Base URL: https://api.trendyol.com/sapigw/suppliers/{supplierId}/
 * Auth: Basic base64(apiKey:apiSecret)
 *
 * All functions return typed results or throw on error.
 */

// New Trendyol integration gateway (apigw) — replaced legacy api.trendyol.com/sapigw
const BASE_URL = "https://apigw.trendyol.com/integration/order/sellers";

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

export interface TrendyolReturnLine {
  barcode: string | null;
  quantity: number;
  returnReason: string | null;
  productName: string;
  price: number;
  orderLineItemId: number;
}

export interface TrendyolReturn {
  id: number;
  claimId: string;
  orderNumber: string;
  status: string;
  createdDate: number;
  lastModifiedDate: number;
  lines: TrendyolReturnLine[];
  customerFirstName: string;
  customerLastName: string;
  claimType: string;
  reason: string | null;
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
