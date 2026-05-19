/**
 * Hepsiburada Marketplace API Client (READ-ONLY)
 *
 * Trendyol'a paralel mimari. Sadece veri çekme — ürün/stok/fiyat push
 * Entegra'nın işidir, bu projeden YAPILMAZ ([docs/AI-RULES.md] kuralı).
 *
 * Base URL'ler:
 *   Test (SIT):     https://*-sit.hepsiburada.com
 *   Production:     https://*.hepsiburada.com (`-sit` yok)
 *
 * Spesifik gateway'ler:
 *   Ürün katalog:   https://mpop[-sit].hepsiburada.com/product/api/products/...
 *   Sipariş:        https://oms-external[-sit].hepsiburada.com/orders/merchantid/{merchantId}
 *   İade:           https://order-external-sit.hepsiburada.com/orders/.../claims/
 *
 * Auth: HTTP Basic — base64(username:password) Authorization header'da.
 *
 * Rate limit: 1000 req/s. 429 + remaining quota response header.
 *
 * Dokümantasyon:
 *   https://developers.hepsiburada.com/hepsiburada/docs/getting-started
 *   https://developers.hepsiburada.com/hepsiburada/reference/getallproductsbymerchantid
 *   https://developers.hepsiburada.com/hepsiburada/reference/siparis-entegrasyonu-onemli-bilgiler
 */

const ENV = (process.env.HEPSIBURADA_ENV ?? "production").toLowerCase();
const SUFFIX = ENV === "sit" || ENV === "test" ? "-sit" : "";

const MPOP_BASE   = `https://mpop${SUFFIX}.hepsiburada.com`;
const OMS_BASE    = `https://oms-external${SUFFIX}.hepsiburada.com`;
const LISTING_BASE = `https://listing-external${SUFFIX}.hepsiburada.com`;

export interface HepsiburadaConfig {
  merchantId: string;
  username: string;
  password: string;
}

export class HepsiburadaApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`Hepsiburada API ${status}: ${body.slice(0, 200)}`);
    this.name = "HepsiburadaApiError";
  }
}

function authHeader(cfg: HepsiburadaConfig): string {
  const encoded = Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64");
  return `Basic ${encoded}`;
}

async function hbFetch<T>(
  cfg: HepsiburadaConfig,
  fullUrl: string,
  params?: Record<string, string | number>,
): Promise<T> {
  const url = new URL(fullUrl);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: authHeader(cfg),
      Accept: "application/json",
      "User-Agent": `iotomasyon-crm/1.0 (${cfg.merchantId})`,
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new HepsiburadaApiError(res.status, text);
  }
  return (await res.json()) as T;
}

// ── Connection test ─────────────────────────────────────────────────────────

export async function testHepsiburadaConnection(
  cfg: HepsiburadaConfig,
): Promise<{ ok: boolean; message: string; sample?: unknown }> {
  try {
    // Ürün listesi endpoint'i en az dependency'li — page=0 size=1 ile probe
    const url = `${MPOP_BASE}/product/api/products/all-products-of-merchant/${cfg.merchantId}`;
    const data = await hbFetch<HepsiburadaCatalogResponse>(cfg, url, { page: 0, size: 1 });
    return {
      ok: true,
      message: `Bağlantı başarılı. Toplam ${data.totalElements ?? "?"} ürün görüldü.`,
      sample: data.content?.[0],
    };
  } catch (e) {
    if (e instanceof HepsiburadaApiError) {
      return { ok: false, message: `Hepsiburada ${e.status}: ${e.body.slice(0, 300)}` };
    }
    return { ok: false, message: e instanceof Error ? e.message : "Bilinmeyen hata" };
  }
}

// ── Catalog (mağaza ürünleri) ───────────────────────────────────────────────

export interface HepsiburadaCatalogProduct {
  merchantSku?: string | null;
  hbSku?: string | null;
  barcode?: string | null;
  productName?: string | null;
  status?: string | null;
  /** Trendyol'daki `quantity` karşılığı */
  stockAmount?: number;
  /** Listing fiyatları, dikkate alınması gereken alanlar Hepsiburada response'una bağlı */
  price?: number;
  listingId?: string;
  categoryName?: string;
  brand?: string;
  images?: { url?: string }[];
}

export interface HepsiburadaCatalogResponse {
  /** Hepsiburada Spring Data Page pattern: content + totalElements + totalPages + size + number */
  content: HepsiburadaCatalogProduct[];
  totalElements?: number;
  totalPages?: number;
  size?: number;
  number?: number;
}

/**
 * GET /product/api/products/all-products-of-merchant/{merchantId}
 * Mağazadaki tüm ürünleri sayfalı şekilde döndürür (default size 1000).
 */
export async function fetchHepsiburadaCatalog(
  cfg: HepsiburadaConfig,
  opts: { page?: number; size?: number; barcode?: string; merchantSku?: string; hbSku?: string } = {},
): Promise<HepsiburadaCatalogResponse> {
  const params: Record<string, string | number> = {
    page: opts.page ?? 0,
    size: opts.size ?? 1000,
  };
  if (opts.barcode) params.barcode = opts.barcode;
  if (opts.merchantSku) params.merchantSku = opts.merchantSku;
  if (opts.hbSku) params.hbSku = opts.hbSku;

  const url = `${MPOP_BASE}/product/api/products/all-products-of-merchant/${cfg.merchantId}`;
  return hbFetch<HepsiburadaCatalogResponse>(cfg, url, params);
}

// ── Orders (sipariş) ────────────────────────────────────────────────────────

export interface HepsiburadaOrderItem {
  id?: string;
  lineItemId?: string;
  hbSku?: string;
  merchantSku?: string;
  barcode?: string;
  productName?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  vat?: number;
  status?: string;
  cargoCompany?: string;
}

export interface HepsiburadaOrder {
  orderNumber?: string;
  orderDate?: string;
  status?: string;
  customerName?: string;
  items?: HepsiburadaOrderItem[];
}

export interface HepsiburadaOrdersResponse {
  items?: HepsiburadaOrder[];
  totalCount?: number;
  limit?: number;
  offset?: number;
}

/**
 * GET /orders/merchantid/{merchantId}/paid?limit=10&offset=0
 * Ödeme tamamlanmış siparişleri döndürür. Offset/limit pagination.
 *
 * NOT: Hepsiburada response yapısı endpoint sürümüne göre değişebiliyor.
 * Burası best-effort tipler; ilk gerçek çağrıda yanıtı incelemek gerek.
 */
export async function fetchHepsiburadaPaidOrders(
  cfg: HepsiburadaConfig,
  opts: { limit?: number; offset?: number; beginDate?: string; endDate?: string } = {},
): Promise<HepsiburadaOrdersResponse> {
  const params: Record<string, string | number> = {
    limit: opts.limit ?? 50,
    offset: opts.offset ?? 0,
  };
  if (opts.beginDate) params.beginDate = opts.beginDate;
  if (opts.endDate) params.endDate = opts.endDate;

  const url = `${OMS_BASE}/orders/merchantid/${cfg.merchantId}/paid`;
  return hbFetch<HepsiburadaOrdersResponse>(cfg, url, params);
}

// ── (Opsiyonel) İade — şu an stub, dokümantasyonda netleştiğinde doldurulacak
//   Hepsiburada claim endpoint'i product-team ile değişen path kullandığı için
//   ilk MVP'de boş bırakıyoruz. Trendyol returns paralel implementasyonu sonra.

export const HEPSIBURADA_BASES = { MPOP_BASE, OMS_BASE, LISTING_BASE } as const;
