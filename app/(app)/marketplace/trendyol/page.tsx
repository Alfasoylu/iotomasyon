/**
 * Phase 14 — Trendyol Orders & Returns Dashboard (READ ONLY)
 *
 * Fetches live from Trendyol API on each page load.
 * Shows a clear error state if not configured or connection fails.
 */

import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  fetchTrendyolOrders,
  fetchTrendyolReturns,
  TrendyolApiError,
  type TrendyolOrder,
  type TrendyolReturn,
} from "@/lib/trendyol-api";

export const dynamic = "force-dynamic";

function fmtDate(epochMs: number | null | undefined) {
  if (!epochMs) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(epochMs));
}

function fmtCurrency(amount: number, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency, minimumFractionDigits: 2 }).format(amount);
}

const STATUS_TR: Record<string, string> = {
  Created: "Oluşturuldu",
  Picking: "Hazırlanıyor",
  Invoiced: "Faturalandı",
  Shipped: "Kargolandı",
  Delivered: "Teslim edildi",
  UnDelivered: "Teslim edilemedi",
  Cancelled: "İptal",
  UnPackaged: "Paketlenmedi",
  Returned: "İade",
};

const RETURN_STATUS_TR: Record<string, string> = {
  WaitingForArrival: "Kargo bekleniyor",
  Arrived: "Ulaştı",
  Rejected: "Reddedildi",
  Refunded: "İade edildi",
  PendingApproval: "Onay bekleniyor",
};

function StatusBadge({ status, map }: { status: string; map: Record<string, string> }) {
  const label = map[status] ?? status;
  const isDone = status === "Delivered" || status === "Refunded";
  const isCancel = status === "Cancelled" || status === "Rejected";
  const cls = isDone
    ? "bg-emerald-100 text-emerald-700"
    : isCancel
      ? "bg-red-100 text-red-700"
      : "bg-amber-100 text-amber-700";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
  );
}

interface PageData {
  orders: TrendyolOrder[];
  orderTotal: number;
  returns: TrendyolReturn[];
  returnTotal: number;
  error: string | null;
}

async function fetchDashboardData(supplierId: string, apiKey: string, apiSecret: string): Promise<PageData> {
  const cfg = { supplierId, apiKey, apiSecret };
  try {
    const [ordersResp, returnsResp] = await Promise.all([
      fetchTrendyolOrders(cfg, { size: 20 }),
      fetchTrendyolReturns(cfg, { size: 10 }),
    ]);
    // Defensive: log raw structure in case API response format differs
    console.log("[trendyol-dashboard] orders keys:", Object.keys(ordersResp ?? {}));
    console.log("[trendyol-dashboard] returns keys:", Object.keys(returnsResp ?? {}));
    return {
      // Null-safe: API may return different field names or structure
      orders: Array.isArray((ordersResp as any)?.content) ? (ordersResp as any).content : [],
      orderTotal: (ordersResp as any)?.totalElements ?? 0,
      returns: Array.isArray((returnsResp as any)?.content) ? (returnsResp as any).content : [],
      returnTotal: (returnsResp as any)?.totalElements ?? 0,
      error: null,
    };
  } catch (err) {
    console.error("[trendyol-dashboard] fetchDashboardData error:", err);
    const msg =
      err instanceof TrendyolApiError
        ? `Trendyol API hatası (${err.status}): ${err.status === 401 ? "Kimlik doğrulama başarısız." : err.status === 403 ? "Erişim reddedildi." : err.status === 404 ? "Satıcı bulunamadı." : err.body.slice(0, 120)}`
        : `Bağlantı hatası: ${err instanceof Error ? err.message : "Bilinmeyen hata"}`;
    return { orders: [], orderTotal: 0, returns: [], returnTotal: 0, error: msg };
  }
}

export default async function TrendyolDashboardPage() {
  await requirePermission(PERMISSIONS.MARKETPLACE_LISTINGS_READ);

  const config = await prisma.trendyolConfig.findUnique({ where: { id: "singleton" } });

  const notConfigured =
    !config || !config.isEnabled || !config.supplierId || !config.apiKey || !config.apiSecret;

  const data: PageData = notConfigured
    ? { orders: [], orderTotal: 0, returns: [], returnTotal: 0, error: null }
    : await fetchDashboardData(config.supplierId, config.apiKey, config.apiSecret);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Pazar Yerleri / Trendyol</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Trendyol Paneli</h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Son siparişler ve iadeler — yalnızca görüntüleme.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/trendyol">
            <Button variant="secondary">⚙ API Ayarları</Button>
          </Link>
          <Link href="/marketplace">
            <Button variant="secondary">← Pazar Yerleri</Button>
          </Link>
        </div>
      </div>

      {/* Not-configured state */}
      {notConfigured && (
        <Card className="p-10 text-center space-y-4">
          <p className="text-slate-600 text-sm font-medium">Trendyol API yapılandırılmamış veya pasif.</p>
          <p className="text-slate-400 text-xs">
            Sipariş ve iade verilerini görmek için API kimlik bilgilerini girin ve entegrasyonu aktive edin.
          </p>
          <Link href="/admin/trendyol">
            <Button className="mt-2">⚙ API Ayarlarına git</Button>
          </Link>
        </Card>
      )}

      {/* API error state */}
      {!notConfigured && data.error && (
        <Card className="p-6 border-red-200 bg-red-50">
          <p className="text-sm font-semibold text-red-700">Trendyol API bağlantısı başarısız</p>
          <p className="mt-1 text-xs text-red-600">{data.error}</p>
          <p className="mt-3 text-xs text-red-500">
            API kimlik bilgilerini{" "}
            <Link href="/admin/trendyol" className="underline hover:text-red-700">
              ayarlar sayfasından
            </Link>{" "}
            kontrol edin.
          </p>
        </Card>
      )}

      {/* Summary cards — shown only if data came through */}
      {!notConfigured && !data.error && (
        <>
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Toplam Sipariş</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{data.orderTotal}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Son 20 Sipariş</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{data.orders.length}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Toplam İade</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{data.returnTotal}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Son 10 İade</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{data.returns.length}</p>
            </Card>
          </div>

          {/* Orders table */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-slate-900">Son Siparişler</h2>
            {data.orders.length === 0 ? (
              <Card className="p-6 text-center">
                <p className="text-sm text-slate-400">Sipariş bulunamadı.</p>
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-slate-700 border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50">
                        <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Sipariş No</th>
                        <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Tarih</th>
                        <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Müşteri</th>
                        <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Tutar</th>
                        <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Durum</th>
                        <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Ürün(ler)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.orders.map((order) => (
                        <tr key={order.orderNumber} className="border-b border-slate-50 hover:bg-slate-50/50">
                          <td className="py-3 px-4 font-mono text-xs text-slate-600">{order.orderNumber}</td>
                          <td className="py-3 px-4 text-xs text-slate-500">{fmtDate(order.orderDate)}</td>
                          <td className="py-3 px-4 text-xs text-slate-600">
                            {order.customerFirstName} {order.customerLastName}
                          </td>
                          <td className="py-3 px-4 text-xs font-medium text-slate-800">
                            {fmtCurrency(order.totalPrice, order.currencyCode)}
                          </td>
                          <td className="py-3 px-4">
                            <StatusBadge status={order.status} map={STATUS_TR} />
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-500 max-w-[200px] truncate">
                            {(order.lines ?? []).map((l) => l.productName).join(", ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </section>

          {/* Returns table */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-slate-900">Son İadeler</h2>
            {data.returns.length === 0 ? (
              <Card className="p-6 text-center">
                <p className="text-sm text-slate-400">İade bulunamadı.</p>
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-slate-700 border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50">
                        <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">İade ID</th>
                        <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Sipariş No</th>
                        <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Tarih</th>
                        <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Müşteri</th>
                        <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Durum</th>
                        <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Ürün(ler)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.returns.map((ret) => (
                        <tr key={ret.claimId} className="border-b border-slate-50 hover:bg-slate-50/50">
                          <td className="py-3 px-4 font-mono text-xs text-slate-600">{ret.claimId}</td>
                          <td className="py-3 px-4 font-mono text-xs text-slate-500">{ret.orderNumber ?? "—"}</td>
                          <td className="py-3 px-4 text-xs text-slate-500">{fmtDate(ret.createdDate)}</td>
                          <td className="py-3 px-4 text-xs text-slate-600">
                            {ret.customerFirstName} {ret.customerLastName}
                          </td>
                          <td className="py-3 px-4">
                            <StatusBadge status={ret.status} map={RETURN_STATUS_TR} />
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-500 max-w-[200px] truncate">
                            {(ret.lines ?? []).map((l) => l.productName).join(", ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  );
}
