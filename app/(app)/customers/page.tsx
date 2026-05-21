import Link from "next/link";
import { Users, FileSpreadsheet, User as UserIcon, Phone, FileText, Clock, Zap, CircleAlert, CircleDot, Circle } from "lucide-react";

import { CustomerImportForm } from "@/components/customers/customer-import-form";
import { PageHeader } from "@/components/layout/page-header";
import { PageHelp } from "@/components/layout/page-help";
import { EmptyState } from "@/components/layout/empty-state";
import { CustomerKanbanBoard } from "@/components/customers/customer-kanban-board";
import { CustomerCohortCards } from "@/components/customers/customer-cohort-cards";
import { CustomerRow } from "@/components/customers/customer-row";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CustomerFilters } from "@/components/customers/customer-filters";
import { listCustomers, listUsersForSelect } from "@/services/customer-service";
import {
  getCustomerCohortCounts,
  getCustomerIdsForCohort,
  getCustomerStats,
  getPowerQueueIds,
  getSegmentCounts,
  type CohortKey,
} from "@/services/customer-cohort-service";
import { SegmentStrip } from "@/components/customers/segment-strip";
import { getSalesRepKPIs } from "@/services/sales-rep-kpi-service";
import { getRecentActivityByOthers } from "@/services/customer-activity-service";
import { getCustomerFilterOptions } from "@/services/customer-filter-options-service";
import { listAttributes } from "@/services/attribute-service";
import { SalesRepKpiBar } from "@/components/customers/sales-rep-kpi-bar";
import { SavedViewSelector } from "@/components/customers/saved-view-selector";
import { CustomerBulkList } from "@/components/customers/customer-bulk-list";
import { KeyboardNav } from "@/components/customers/keyboard-nav";
import { DensityToggle } from "@/components/customers/density-toggle";
import { listMySavedViews } from "@/lib/actions/saved-view-actions";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function fmtTry(n: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(n);
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission(PERMISSIONS.CUSTOMERS_READ);
  const params = await searchParams;
  const query        = typeof params.q            === "string" ? params.q            : "";
  const status       = typeof params.status       === "string" ? params.status       : "all";
  const source       = typeof params.source       === "string" ? params.source       : "all";
  const ownedById    = typeof params.ownedById    === "string" ? params.ownedById    : "all";
  const attributeId  = typeof params.attributeId  === "string" ? params.attributeId  : "all";
  const customerType = typeof params.customerType === "string" ? params.customerType : "all";
  const leadListId   = typeof params.leadListId   === "string" ? params.leadListId   : "all";
  const segment      = typeof params.segment      === "string" ? params.segment      : "all";
  const city            = typeof params.city            === "string" ? params.city            : "all";
  const district        = typeof params.district        === "string" ? params.district        : "all";
  const industryGroupId = typeof params.industryGroupId === "string" ? params.industryGroupId : "all";
  const industryId      = typeof params.industryId      === "string" ? params.industryId      : "all";
  const categoryId      = typeof params.categoryId      === "string" ? params.categoryId      : "all";
  const cohortParam  = typeof params.cohort       === "string" ? params.cohort       : null;
  const validCohorts: CohortKey[] = ["queue", "todayCall", "dormant", "new", "openQuotes"];
  const cohort: CohortKey | null =
    cohortParam && (validCohorts as string[]).includes(cohortParam)
      ? (cohortParam as CohortKey)
      : null;

  const [{ databaseAvailable, customers }, users, attributes, cohortCounts, salesKpis, savedViews, segmentCounts, filterOptions] =
    await Promise.all([
      listCustomers({
        q: query, status, source, ownedById, attributeId, customerType,
        leadListId, segment, city, district, industryGroupId, industryId, categoryId,
      }),
      listUsersForSelect(),
      listAttributes(),
      getCustomerCohortCounts(),
      getSalesRepKPIs(user.id),
      listMySavedViews("customers"),
      getSegmentCounts(),
      getCustomerFilterOptions(),
    ]);

  // Cohort filtresi varsa ID set'i ile filtrele
  let filteredCustomers = customers;
  if (cohort === "queue") {
    // Power Queue: smart priority sırasını koru
    const orderedIds = await getPowerQueueIds(30);
    const customerById = new Map(customers.map((c) => [c.id, c]));
    filteredCustomers = orderedIds
      .map((id) => customerById.get(id))
      .filter((c): c is (typeof customers)[number] => !!c);

    // Anti-monotony: shownInQueueCount artır (gösterildi)
    if (orderedIds.length > 0) {
      const { prisma } = await import("@/lib/prisma");
      await prisma.customer.updateMany({
        where: { id: { in: orderedIds } },
        data: { shownInQueueCount: { increment: 1 } },
      }).catch(() => null);
    }
  } else if (cohort) {
    const cohortIds = await getCustomerIdsForCohort(cohort);
    filteredCustomers = customers.filter((c) => cohortIds.has(c.id));
  }

  const statsMap = databaseAvailable
    ? await getCustomerStats(filteredCustomers.map((c) => c.id))
    : new Map();

  const recentActivityMap = databaseAvailable
    ? await getRecentActivityByOthers(filteredCustomers.map((c) => c.id), user.id)
    : new Map();

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Users}
        breadcrumb={[{ label: "Satış" }, { label: "Müşteriler" }]}
        title="Müşteriler"
        subtitle="Tüm müşteri portföyün. 'Bugün senin için' kartlarından günlük iş listesini hızla aç."
        actions={
          <>
            <PageHelp pageKey="customers" />
            <DensityToggle />
            <KeyboardNav />
            <SavedViewSelector views={savedViews} currentUserId={user.id} resource="customers" />
            <Link href="/customers/new">
              <Button size="sm">Yeni müşteri</Button>
            </Link>
          </>
        }
      />

      {/* Personal KPI bar (Phase 95e) */}
      {databaseAvailable && salesKpis.databaseAvailable && (
        <SalesRepKpiBar kpis={salesKpis} userName={user.name} />
      )}

      {/* Phase 98 — Segment çatıları */}
      {databaseAvailable && (
        <SegmentStrip counts={segmentCounts} activeSegment={segment} />
      )}

      {/* Cohort kartları */}
      {databaseAvailable && (
        <CustomerCohortCards counts={cohortCounts} activeCohort={cohort} />
      )}

      {/* Quick KPI şeridi */}
      {databaseAvailable && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] px-4 py-2.5 text-[12px] text-[var(--text-secondary)]">
          <span className="inline-flex items-center gap-1.5">
            <UserIcon size={14} strokeWidth={1.5} className="text-[var(--text-muted)]" />
            <strong className="text-[var(--text-primary)] font-semibold">{cohortCounts.totalActive.toLocaleString("tr-TR")}</strong> aktif portföy
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Phone size={14} strokeWidth={1.5} className="text-[var(--text-muted)]" />
            <strong className="text-[var(--text-primary)] font-semibold">{cohortCounts.weeklyContacted.toLocaleString("tr-TR")}</strong> bu hafta arandı
          </span>
          <span className="inline-flex items-center gap-1.5">
            <FileText size={14} strokeWidth={1.5} className="text-[var(--text-muted)]" />
            <strong className="text-[var(--text-primary)] font-semibold">{fmtTry(cohortCounts.openQuoteAmount)}</strong> açık teklif
          </span>
          {cohortCounts.overdueTaskCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[var(--danger)]">
              <Clock size={14} strokeWidth={1.5} />
              <strong className="font-semibold">{cohortCounts.overdueTaskCount}</strong> vadesi geçmiş görev
            </span>
          )}
        </div>
      )}

      {/* Filtreler */}
      <Card className="p-5">
        <CustomerFilters
          initialQuery={query}
          initialStatus={status}
          initialSource={source}
          initialOwnedById={ownedById}
          initialAttributeId={attributeId}
          initialCustomerType={customerType}
          initialSegment={segment}
          initialCity={city}
          initialDistrict={district}
          initialIndustryGroupId={industryGroupId}
          initialIndustryId={industryId}
          initialCategoryId={categoryId}
          users={users}
          attributes={attributes}
          cities={filterOptions.cities}
          districtsByCity={Object.fromEntries(filterOptions.districts.entries())}
          industryGroups={filterOptions.industryGroups}
          categories={filterOptions.categories}
        />
      </Card>

      {/* C2-01: Kanban Board kaldırıldı (boş ilçe kolonları görsel kirlilik yapıyordu).
          İleride istenirse SavedView / ayrı /customers/kanban sayfasına taşınabilir. */}

      {!databaseAvailable && (
        <Card className="p-5 text-[13px] leading-6 text-[var(--warn)] border-[var(--warn-border)] bg-[var(--warn-dim)]">
          Veritabanı bağlantısı şu anda kullanılamıyor. Müşteri listesi gösterilemiyor.
        </Card>
      )}

      {/* Yeni müşteri listesi — info-dense kartlar */}
      {databaseAvailable && (
        <section>
          <p className="mb-3 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            {cohort === "queue" ? (
              <>
                <Zap size={14} strokeWidth={1.5} className="text-[var(--accent)]" />
                <span>Sıralı Arama Listesi — En Yüksek Öncelikten</span>
              </>
            ) : cohort === "todayCall" ? (
              <>
                <CircleAlert size={14} strokeWidth={1.5} className="text-[var(--danger)]" />
                <span>Bugün Aranacaklar</span>
              </>
            ) : cohort === "dormant" ? (
              <>
                <CircleDot size={14} strokeWidth={1.5} className="text-[var(--warn)]" />
                <span>Uyuyan Müşteriler</span>
              </>
            ) : cohort === "new" ? (
              <>
                <Circle size={14} strokeWidth={1.5} className="text-[var(--ok)]" />
                <span>Yeni Fırsatlar</span>
              </>
            ) : cohort === "openQuotes" ? (
              <>
                <CircleDot size={14} strokeWidth={1.5} className="text-[var(--info)]" />
                <span>Açık Teklifler</span>
              </>
            ) : (
              <span>Müşteri Listesi</span>
            )}
            <span className="text-[var(--text-muted)] font-normal normal-case tracking-normal">({filteredCustomers.length})</span>
          </p>
          {cohort === "queue" && (
            <p className="mb-3 text-[11px] text-[var(--text-muted)] leading-relaxed">
              Akıllı sıralama: <strong className="text-[var(--text-secondary)]">Lead skoru × Bilgi tamlığı × Anti-monotony</strong>.
              Telefonu olan + satışı geçmiş + bu hafta az gösterilmiş müşteri öncelikli.
              Aynı müşteri tekrar tekrar çıkmaz (shownInQueueCount ile soğutma).
            </p>
          )}

          {filteredCustomers.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Bu filtrelerle eşleşen müşteri bulunamadı"
              hint="Filtreleri temizleyebilir veya yeni müşteri ekleyebilirsin."
              action={
                <Link href="/customers/new">
                  <Button size="sm">Yeni müşteri ekle</Button>
                </Link>
              }
            />
          ) : (
            <CustomerBulkList
              customers={filteredCustomers}
              statsByCustomerId={Object.fromEntries(
                filteredCustomers.map((c) => [c.id, statsMap.get(c.id)]).filter(([, v]) => !!v) as [string, NonNullable<ReturnType<typeof statsMap.get>>][],
              )}
              recentActivityByCustomerId={Object.fromEntries(
                Array.from(recentActivityMap.entries()).map(([cid, a]) => [
                  cid,
                  { byUserName: a.byUserName, minutesAgo: a.minutesAgo },
                ]),
              )}
            />
          )}
        </section>
      )}

      {/* CSV import — sayfa altında collapsible */}
      <details className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)]">
        <summary className="cursor-pointer list-none px-5 py-3 text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)] transition-colors">
          <span className="inline-flex items-center gap-2">
            <FileSpreadsheet size={14} strokeWidth={1.5} className="text-[var(--text-muted)]" />
            CSV ile toplu müşteri içe aktar
          </span>
        </summary>
        <div className="border-t border-[var(--border-subtle)] px-5 py-4">
          <p className="text-[12px] text-[var(--text-muted)] mb-3">
            Kolon adları: name, company, phone, whatsapp, email, taxNumber, address, city, country, notes, status
          </p>
          <CustomerImportForm />
        </div>
      </details>
    </div>
  );
}
