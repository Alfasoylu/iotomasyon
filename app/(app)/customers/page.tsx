import Link from "next/link";
import { Users, FileSpreadsheet } from "lucide-react";

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
  type CohortKey,
} from "@/services/customer-cohort-service";
import { listAttributes } from "@/services/attribute-service";
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
  await requirePermission(PERMISSIONS.CUSTOMERS_READ);
  const params = await searchParams;
  const query        = typeof params.q            === "string" ? params.q            : "";
  const status       = typeof params.status       === "string" ? params.status       : "all";
  const source       = typeof params.source       === "string" ? params.source       : "all";
  const ownedById    = typeof params.ownedById    === "string" ? params.ownedById    : "all";
  const attributeId  = typeof params.attributeId  === "string" ? params.attributeId  : "all";
  const customerType = typeof params.customerType === "string" ? params.customerType : "all";
  const cohortParam  = typeof params.cohort       === "string" ? params.cohort       : null;
  const validCohorts: CohortKey[] = ["queue", "todayCall", "dormant", "new", "openQuotes"];
  const cohort: CohortKey | null =
    cohortParam && (validCohorts as string[]).includes(cohortParam)
      ? (cohortParam as CohortKey)
      : null;

  const [{ databaseAvailable, customers }, users, attributes, cohortCounts] =
    await Promise.all([
      listCustomers({ q: query, status, source, ownedById, attributeId, customerType }),
      listUsersForSelect(),
      listAttributes(),
      getCustomerCohortCounts(),
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
            <Link href="/customers/new">
              <Button>Yeni müşteri</Button>
            </Link>
          </>
        }
      />

      {/* Cohort kartları */}
      {databaseAvailable && (
        <CustomerCohortCards counts={cohortCounts} activeCohort={cohort} />
      )}

      {/* Quick KPI şeridi */}
      {databaseAvailable && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
          <span>
            🧑 <strong className="text-slate-900">{cohortCounts.totalActive.toLocaleString("tr-TR")}</strong> aktif portföy
          </span>
          <span>
            📞 <strong className="text-slate-900">{cohortCounts.weeklyContacted.toLocaleString("tr-TR")}</strong> bu hafta arandı
          </span>
          <span>
            📄 <strong className="text-slate-900">{fmtTry(cohortCounts.openQuoteAmount)}</strong> açık teklif
          </span>
          {cohortCounts.overdueTaskCount > 0 && (
            <span className="text-rose-600">
              ⏰ <strong>{cohortCounts.overdueTaskCount}</strong> vadesi geçmiş görev
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
          users={users}
          attributes={attributes}
        />
      </Card>

      {/* Kanban — yalnızca cohort filtresi yokken göster (gürültü olmasın) */}
      {databaseAvailable && !cohort && (
        <CustomerKanbanBoard customers={customers} />
      )}

      {!databaseAvailable && (
        <Card className="border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-900">
          Veritabanı bağlantısı şu anda kullanılamıyor. Müşteri listesi gösterilemiyor.
        </Card>
      )}

      {/* Yeni müşteri listesi — info-dense kartlar */}
      {databaseAvailable && (
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
            {cohort === "queue" ? "⚡ Sıralı Arama Listesi — En Yüksek Öncelikten" :
             cohort === "todayCall" ? "🔴 Bugün Aranacaklar" :
             cohort === "dormant" ? "🟡 Uyuyan Müşteriler" :
             cohort === "new" ? "🟢 Yeni Fırsatlar" :
             cohort === "openQuotes" ? "🔵 Açık Teklifler" :
             "Müşteri Listesi"}
            {" "}
            <span className="text-slate-400 font-normal">({filteredCustomers.length})</span>
          </p>
          {cohort === "queue" && (
            <p className="mb-3 text-[11px] text-slate-500 leading-relaxed">
              Akıllı sıralama: <strong>Lead skoru × Bilgi tamlığı × Anti-monotony</strong>.
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
                  <Button>Yeni müşteri ekle</Button>
                </Link>
              }
            />
          ) : (
            <div className="space-y-2">
              {filteredCustomers.map((customer) => (
                <CustomerRow
                  key={customer.id}
                  customer={customer}
                  stats={statsMap.get(customer.id) ?? null}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* CSV import — sayfa altında collapsible */}
      <details className="rounded-2xl border border-slate-200 bg-white">
        <summary className="cursor-pointer list-none px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <span className="inline-flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-slate-400" />
            CSV ile toplu müşteri içe aktar
          </span>
        </summary>
        <div className="border-t border-slate-100 px-5 py-4">
          <p className="text-xs text-slate-500 mb-3">
            Kolon adları: name, company, phone, whatsapp, email, taxNumber, address, city, country, notes, status
          </p>
          <CustomerImportForm />
        </div>
      </details>
    </div>
  );
}
