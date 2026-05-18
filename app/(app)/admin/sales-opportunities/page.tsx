/**
 * Phase 86 + 88 — Satış Fırsatları Motoru + İnline Durum Güncellemesi
 *
 * Ürün bazlı müşteri talep özeti.
 * ProductInterest kayıtlarını ürüne göre gruplar:
 *   - Kaç müşteri ilgileniyor?
 *   - Toplam talep adeti?
 *   - Stok var mı? (fırsat sıcak mı?)
 *   - Yaklaşan takip tarihleri var mı?
 *
 * Filtreler:
 *   ?tab=all           → tümü (WON/LOST/CANCELLED hariç)
 *   ?tab=hot           → stok > 0 (hemen satılabilir)
 *   ?tab=followup      → followUpAt bugün veya geçmiş
 *   ?tab=waiting_stock → WAITING_STOCK statüsündekiler
 *
 * Permission: CUSTOMERS_READ (SALES rolü görebilir)
 * Schema değişikliği: YOK
 */

import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UpdateInterestForm } from "./update-interest-form";

export const dynamic = "force-dynamic";

// ── Enum etiketleri ──────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  NEW:           "Yeni",
  WAITING_STOCK: "Stok Bekliyor",
  CONTACTED:     "İletişim Kuruldu",
  QUOTED:        "Teklif Verildi",
  WON:           "Kazanıldı",
  LOST:          "Kaybedildi",
  CANCELLED:     "İptal",
};

const STATUS_STYLE: Record<string, string> = {
  NEW:           "bg-blue-100 text-blue-700",
  WAITING_STOCK: "bg-amber-100 text-amber-700",
  CONTACTED:     "bg-sky-100 text-sky-700",
  QUOTED:        "bg-violet-100 text-violet-700",
  WON:           "bg-emerald-100 text-emerald-700",
  LOST:          "bg-slate-100 text-slate-500",
  CANCELLED:     "bg-slate-100 text-slate-400",
};

const PRIORITY_LABEL: Record<string, string> = {
  LOW:    "Düşük",
  NORMAL: "Normal",
  HIGH:   "Yüksek",
  URGENT: "Acil",
};

const PRIORITY_STYLE: Record<string, string> = {
  LOW:    "text-slate-400",
  NORMAL: "text-slate-600",
  HIGH:   "text-amber-600 font-semibold",
  URGENT: "text-red-600 font-bold",
};

type Tab = "all" | "hot" | "followup" | "waiting_stock";

const TAB_LABELS: Record<Tab, string> = {
  all:           "Tümü",
  hot:           "🔥 Stok Var",
  followup:      "⏰ Takip",
  waiting_stock: "📦 Stok Bekliyor",
};

// ── Row tipi ─────────────────────────────────────────────────────────────────
type InterestRow = {
  id: string;
  status: string;
  priority: string;
  quantity: number;
  quotedPrice: string | null;
  currency: string;
  interestNotes: string | null;
  followUpAt: Date | null;
  createdAt: Date;
  customer: { id: string; name: string; company: string | null };
};

type ProductGroup = {
  productId: string;
  productName: string;
  productSku: string | null;
  stockQuantity: number;
  minimumStock: number;
  interests: InterestRow[];
  totalUnits: number;
  customerCount: number;
  hasOverdueFollowup: boolean;
  hasTodayFollowup: boolean;
};

export default async function SalesOpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission(PERMISSIONS.CUSTOMERS_READ);

  const sp = await searchParams;
  const tab = (sp.tab as Tab | undefined) ?? "all";
  const expandId = sp.expand ?? null;

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Fetch all active (non-closed) ProductInterests with customer + product
  const allInterests = await prisma.productInterest.findMany({
    where: {
      status: { notIn: ["WON", "LOST", "CANCELLED"] },
    },
    select: {
      id: true,
      status: true,
      priority: true,
      quantity: true,
      quotedPrice: true,
      currency: true,
      interestNotes: true,
      followUpAt: true,
      createdAt: true,
      customer: {
        select: { id: true, name: true, company: true },
      },
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          stockQuantity: true,
          minimumStock: true,
        },
      },
    },
    orderBy: [
      { priority: "desc" },
      { followUpAt: "asc" },
      { createdAt: "desc" },
    ],
  });

  // ── Group by product ──────────────────────────────────────────────────────
  const productMap = new Map<string, ProductGroup>();

  for (const i of allInterests) {
    if (!productMap.has(i.product.id)) {
      productMap.set(i.product.id, {
        productId: i.product.id,
        productName: i.product.name,
        productSku: i.product.sku,
        stockQuantity: i.product.stockQuantity,
        minimumStock: i.product.minimumStock,
        interests: [],
        totalUnits: 0,
        customerCount: 0,
        hasOverdueFollowup: false,
        hasTodayFollowup: false,
      });
    }
    const g = productMap.get(i.product.id)!;
    g.interests.push({
      id: i.id,
      status: i.status,
      priority: i.priority,
      quantity: i.quantity,
      quotedPrice: i.quotedPrice != null ? i.quotedPrice.toString() : null,
      currency: i.currency,
      interestNotes: i.interestNotes,
      followUpAt: i.followUpAt,
      createdAt: i.createdAt,
      customer: i.customer,
    });
    g.totalUnits += i.quantity;
    g.customerCount++;

    if (i.followUpAt) {
      if (i.followUpAt < todayStart) g.hasOverdueFollowup = true;
      else if (i.followUpAt <= today) g.hasTodayFollowup = true;
    }
  }

  const allGroups = [...productMap.values()].sort(
    (a, b) => b.customerCount - a.customerCount,
  );

  // ── Filter by tab ─────────────────────────────────────────────────────────
  const filteredGroups =
    tab === "hot"
      ? allGroups.filter((g) => g.stockQuantity > 0)
      : tab === "followup"
      ? allGroups.filter((g) => g.hasOverdueFollowup || g.hasTodayFollowup)
      : tab === "waiting_stock"
      ? allGroups.filter((g) => g.interests.some((i) => i.status === "WAITING_STOCK"))
      : allGroups;

  // ── KPI totals ────────────────────────────────────────────────────────────
  const totalInterests = allInterests.length;
  const totalProducts = allGroups.length;
  const totalUnits = allGroups.reduce((s, g) => s + g.totalUnits, 0);
  const overdueFollowups = allGroups.filter((g) => g.hasOverdueFollowup).length;
  const hotOpportunities = allGroups.filter(
    (g) => g.stockQuantity > 0 && g.customerCount >= 1,
  ).length;

  // ── Tab links ─────────────────────────────────────────────────────────────
  const tabs: Tab[] = ["all", "hot", "followup", "waiting_stock"];
  const tabCounts: Record<Tab, number> = {
    all:           allGroups.length,
    hot:           allGroups.filter((g) => g.stockQuantity > 0).length,
    followup:      allGroups.filter((g) => g.hasOverdueFollowup || g.hasTodayFollowup).length,
    waiting_stock: allGroups.filter((g) => g.interests.some((i) => i.status === "WAITING_STOCK")).length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">CRM / Satış</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Satış Fırsatları</h1>
        <p className="mt-1 text-sm text-slate-500">
          Ürün bazında müşteri talepleri — stokla çapraz, takip tarihleriyle sıralı.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: "Aktif Talep", value: totalInterests, tone: "slate" },
          { label: "Farklı Ürün", value: totalProducts, tone: "slate" },
          { label: "Toplam Talep Adeti", value: totalUnits, tone: "slate" },
          { label: "Gecikmiş Takip", value: overdueFollowups, tone: overdueFollowups > 0 ? "red" : "slate" },
          { label: "Stoklu Fırsat", value: hotOpportunities, tone: hotOpportunities > 0 ? "emerald" : "slate" },
        ].map(({ label, value, tone }) => (
          <Card key={label} className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
            <p
              className={`mt-1 text-2xl font-semibold ${
                tone === "emerald"
                  ? "text-emerald-700"
                  : tone === "red"
                  ? "text-red-600"
                  : "text-slate-800"
              }`}
            >
              {value}
            </p>
          </Card>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link
            key={t}
            href={`/admin/sales-opportunities?tab=${t}`}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
              tab === t
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {TAB_LABELS[t]}
            <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
              {tabCounts[t]}
            </span>
          </Link>
        ))}
      </div>

      {/* Product groups table */}
      {filteredGroups.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-400">
          Bu filtrede fırsat kaydı yok.
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredGroups.map((g) => {
            const isExpanded = expandId === g.productId;
            const stockLow = g.stockQuantity <= g.minimumStock && g.minimumStock > 0;
            const stockEmpty = g.stockQuantity === 0;

            return (
              <Card key={g.productId} className="overflow-hidden">
                {/* Product header row */}
                <div
                  className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 ${
                    isExpanded ? "border-b border-slate-100 bg-slate-50" : ""
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Expand/collapse toggle */}
                    <Link
                      href={
                        isExpanded
                          ? `/admin/sales-opportunities?tab=${tab}`
                          : `/admin/sales-opportunities?tab=${tab}&expand=${g.productId}`
                      }
                      className="flex-shrink-0 text-slate-400 hover:text-slate-700"
                      aria-label={isExpanded ? "Kapat" : "Aç"}
                    >
                      <span className="text-sm">{isExpanded ? "▲" : "▶"}</span>
                    </Link>

                    <div className="min-w-0">
                      <Link
                        href={`/products/${g.productId}`}
                        className="text-sm font-semibold text-slate-800 hover:underline"
                      >
                        {g.productName}
                      </Link>
                      {g.productSku && (
                        <span className="ml-2 font-mono text-xs text-slate-400">{g.productSku}</span>
                      )}
                    </div>

                    {/* Follow-up alert */}
                    {g.hasOverdueFollowup && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                        ⏰ Gecikmiş
                      </span>
                    )}
                    {!g.hasOverdueFollowup && g.hasTodayFollowup && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        ⏰ Bugün
                      </span>
                    )}
                  </div>

                  {/* Right side stats */}
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                    {/* Stock pill */}
                    <span
                      className={`rounded-full px-2.5 py-1 font-medium ${
                        stockEmpty
                          ? "bg-red-100 text-red-600"
                          : stockLow
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      Stok: {g.stockQuantity}
                    </span>

                    <span className="font-medium text-slate-700">
                      {g.customerCount} müşteri
                    </span>
                    <span className="text-slate-500">
                      {g.totalUnits} adet talep
                    </span>
                  </div>
                </div>

                {/* Expanded: customer interest rows */}
                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/70 text-xs uppercase tracking-widest text-slate-400">
                          <th className="px-5 py-2 text-left">Müşteri</th>
                          <th className="px-3 py-2 text-left">Durum / Öncelik</th>
                          <th className="px-3 py-2 text-right">Talep Adeti</th>
                          <th className="px-3 py-2 text-right">Teklif Fiyatı</th>
                          <th className="px-3 py-2 text-right">Takip Tarihi</th>
                          <th className="px-3 py-2 text-left">Not</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {g.interests.map((i) => {
                          const isOverdue =
                            i.followUpAt != null && i.followUpAt < todayStart;
                          const isToday =
                            i.followUpAt != null &&
                            i.followUpAt >= todayStart &&
                            i.followUpAt <= today;
                          return (
                            <tr key={i.id} className="hover:bg-slate-50/60">
                              <td className="px-5 py-2.5">
                                <Link
                                  href={`/customers/${i.customer.id}`}
                                  className="font-medium text-slate-800 hover:underline"
                                >
                                  {i.customer.company ?? i.customer.name}
                                </Link>
                                {i.customer.company && (
                                  <span className="ml-1 text-xs text-slate-400">
                                    ({i.customer.name})
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5">
                                <UpdateInterestForm
                                  interestId={i.id}
                                  currentStatus={i.status}
                                  currentPriority={i.priority}
                                />
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                                {i.quantity}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                                {i.quotedPrice
                                  ? `${i.quotedPrice} ${i.currency}`
                                  : <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-3 py-2.5 text-right text-xs">
                                {i.followUpAt ? (
                                  <span
                                    className={
                                      isOverdue
                                        ? "font-semibold text-red-600"
                                        : isToday
                                        ? "font-semibold text-amber-600"
                                        : "text-slate-500"
                                    }
                                  >
                                    {i.followUpAt.toLocaleDateString("tr-TR")}
                                    {isOverdue && " ⚠"}
                                    {isToday && " ●"}
                                  </span>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-xs text-slate-500 max-w-[200px] truncate">
                                {i.interestNotes ?? <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <Link
                                  href={`/customers/${i.customer.id}`}
                                  className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                                >
                                  Müşteri →
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Empty state for no interests at all */}
      {allInterests.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-sm text-slate-500">Henüz aktif ürün ilgi kaydı yok.</p>
          <p className="mt-2 text-xs text-slate-400">
            Müşteri detay sayfalarından ürün ilgisi ekleyebilirsiniz.
          </p>
          <Link href="/customers" className="mt-3 inline-block text-xs text-blue-600 underline">
            Müşterilere git →
          </Link>
        </Card>
      )}
    </div>
  );
}
