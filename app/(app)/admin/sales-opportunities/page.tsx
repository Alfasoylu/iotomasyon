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
import { Flame, Clock, Package, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { UpdateInterestForm } from "./update-interest-form";

export const dynamic = "force-dynamic";

// ── Enum etiketleri ──────────────────────────────────────────────────────────
type Tab = "all" | "hot" | "followup" | "waiting_stock";

const TAB_LABELS: Record<Tab, { label: string; icon: typeof Flame | null }> = {
  all:           { label: "Tümü", icon: null },
  hot:           { label: "Stok Var", icon: Flame },
  followup:      { label: "Takip", icon: Clock },
  waiting_stock: { label: "Stok Bekliyor", icon: Package },
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
        <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">CRM / Satış</p>
        <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">Satış Fırsatları</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Ürün bazında müşteri talepleri — stokla çapraz, takip tarihleriyle sıralı.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: "Aktif Talep",        value: totalInterests,    tone: "neutral" as const },
          { label: "Farklı Ürün",        value: totalProducts,     tone: "neutral" as const },
          { label: "Toplam Talep Adeti", value: totalUnits,        tone: "neutral" as const },
          { label: "Gecikmiş Takip",     value: overdueFollowups,  tone: overdueFollowups > 0 ? "danger" : "neutral" as const },
          { label: "Stoklu Fırsat",      value: hotOpportunities,  tone: hotOpportunities > 0 ? "ok" : "neutral" as const },
        ].map(({ label, value, tone }) => {
          const valueColor =
            tone === "ok"
              ? "text-[var(--ok)]"
              : tone === "danger"
              ? "text-[var(--danger)]"
              : "text-[var(--text-primary)]";
          return (
            <Card key={label} className="p-4 rounded-lg">
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">{label}</p>
              <p className={`mt-2 text-2xl font-semibold tabular-nums font-mono ${valueColor}`}>
                {value}
              </p>
            </Card>
          );
        })}
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => {
          const TabIcon = TAB_LABELS[t].icon;
          const isActive = tab === t;
          return (
            <Link
              key={t}
              href={`/admin/sales-opportunities?tab=${t}`}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium border transition ${
                isActive
                  ? "bg-[var(--accent-dim)] border-[var(--accent-border)] text-[var(--accent)]"
                  : "bg-[var(--surface-2)] border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--surface-3)]"
              }`}
            >
              {TabIcon && <TabIcon size={14} strokeWidth={1.5} />}
              <span>{TAB_LABELS[t].label}</span>
              <span className={`ml-1 rounded-md px-1.5 py-0.5 text-[10px] tabular-nums font-mono ${
                isActive ? "bg-[var(--accent-dim)] text-[var(--accent)]" : "bg-[var(--surface-3)] text-[var(--text-muted)]"
              }`}>
                {tabCounts[t]}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Product groups table */}
      {filteredGroups.length === 0 ? (
        <Card className="p-8 text-center text-sm text-[var(--text-muted)] rounded-lg">
          Bu filtrede fırsat kaydı yok.
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredGroups.map((g) => {
            const isExpanded = expandId === g.productId;
            const stockLow = g.stockQuantity <= g.minimumStock && g.minimumStock > 0;
            const stockEmpty = g.stockQuantity === 0;

            return (
              <Card key={g.productId} className="overflow-hidden rounded-lg">
                {/* Product header row */}
                <div
                  className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 ${
                    isExpanded ? "border-b border-[var(--border-subtle)] bg-[var(--surface-1)]" : ""
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
                      className="flex-shrink-0 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                      aria-label={isExpanded ? "Kapat" : "Aç"}
                    >
                      {isExpanded ? <ChevronDown size={14} strokeWidth={1.5} /> : <ChevronRight size={14} strokeWidth={1.5} />}
                    </Link>

                    <div className="min-w-0">
                      <Link
                        href={`/products/${g.productId}`}
                        className="text-sm font-semibold text-[var(--text-primary)] hover:underline"
                      >
                        {g.productName}
                      </Link>
                      {g.productSku && (
                        <span className="ml-2 font-mono text-xs text-[var(--text-muted)]">{g.productSku}</span>
                      )}
                    </div>

                    {/* Follow-up alert */}
                    {g.hasOverdueFollowup && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-[var(--danger-border)] bg-[var(--danger-dim)] px-2 py-0.5 text-[10px] font-medium text-[var(--danger)]">
                        <AlertTriangle size={14} strokeWidth={1.5} />
                        Gecikmiş
                      </span>
                    )}
                    {!g.hasOverdueFollowup && g.hasTodayFollowup && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-[var(--warn-border)] bg-[var(--warn-dim)] px-2 py-0.5 text-[10px] font-medium text-[var(--warn)]">
                        <Clock size={14} strokeWidth={1.5} />
                        Bugün
                      </span>
                    )}
                  </div>

                  {/* Right side stats */}
                  <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--text-secondary)]">
                    {/* Stock pill */}
                    <span
                      className={`rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums font-mono ${
                        stockEmpty
                          ? "bg-[var(--danger-dim)] border-[var(--danger-border)] text-[var(--danger)]"
                          : stockLow
                          ? "bg-[var(--warn-dim)] border-[var(--warn-border)] text-[var(--warn)]"
                          : "bg-[var(--ok-dim)] border-[var(--ok-border)] text-[var(--ok)]"
                      }`}
                    >
                      Stok: {g.stockQuantity}
                    </span>

                    <span className="font-medium text-[var(--text-primary)] tabular-nums font-mono">
                      {g.customerCount} müşteri
                    </span>
                    <span className="text-[var(--text-muted)] tabular-nums font-mono">
                      {g.totalUnits} adet talep
                    </span>
                  </div>
                </div>

                {/* Expanded: customer interest rows */}
                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)] text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
                          <th className="px-5 py-2 text-left font-medium">Müşteri</th>
                          <th className="px-3 py-2 text-left font-medium">Durum / Öncelik</th>
                          <th className="px-3 py-2 text-right font-medium">Talep Adeti</th>
                          <th className="px-3 py-2 text-right font-medium">Teklif Fiyatı</th>
                          <th className="px-3 py-2 text-right font-medium">Takip Tarihi</th>
                          <th className="px-3 py-2 text-left font-medium">Not</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)]">
                        {g.interests.map((i) => {
                          const isOverdue =
                            i.followUpAt != null && i.followUpAt < todayStart;
                          const isToday =
                            i.followUpAt != null &&
                            i.followUpAt >= todayStart &&
                            i.followUpAt <= today;
                          return (
                            <tr key={i.id} className="hover:bg-[var(--surface-1)]">
                              <td className="px-5 py-2.5">
                                <Link
                                  href={`/customers/${i.customer.id}`}
                                  className="font-medium text-[var(--text-primary)] hover:underline"
                                >
                                  {i.customer.company ?? i.customer.name}
                                </Link>
                                {i.customer.company && (
                                  <span className="ml-1 text-xs text-[var(--text-muted)]">
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
                              <td className="px-3 py-2.5 text-right tabular-nums font-mono text-[var(--text-secondary)]">
                                {i.quantity}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums font-mono text-[var(--text-secondary)]">
                                {i.quotedPrice
                                  ? `${i.quotedPrice} ${i.currency}`
                                  : <span className="text-[var(--text-muted)]">—</span>}
                              </td>
                              <td className="px-3 py-2.5 text-right text-xs tabular-nums font-mono">
                                {i.followUpAt ? (
                                  <span
                                    className={
                                      isOverdue
                                        ? "font-semibold text-[var(--danger)]"
                                        : isToday
                                        ? "font-semibold text-[var(--warn)]"
                                        : "text-[var(--text-muted)]"
                                    }
                                  >
                                    {i.followUpAt.toLocaleDateString("tr-TR")}
                                  </span>
                                ) : (
                                  <span className="text-[var(--text-muted)]">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-xs text-[var(--text-muted)] max-w-[200px] truncate">
                                {i.interestNotes ?? <span className="text-[var(--text-muted)]">—</span>}
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <Link
                                  href={`/customers/${i.customer.id}`}
                                  className="text-xs text-[var(--info)] hover:underline whitespace-nowrap"
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
        <Card className="p-8 text-center rounded-lg">
          <p className="text-sm text-[var(--text-secondary)]">Henüz aktif ürün ilgi kaydı yok.</p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Müşteri detay sayfalarından ürün ilgisi ekleyebilirsiniz.
          </p>
          <Link href="/customers" className="mt-3 inline-block text-xs text-[var(--info)] underline">
            Müşterilere git →
          </Link>
        </Card>
      )}
    </div>
  );
}
