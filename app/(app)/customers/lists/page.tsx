import Link from "next/link";
import { ClipboardList, ListPlus, Users, Phone, Trash2, ChevronDown } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LeadListDeleteButton } from "@/components/customers/lead-list-delete-button";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

interface ListStats {
  total: number;
  contacted: number;
  proposal: number;
  won: number;
  lost: number;
}

export default async function LeadListsPage({
  searchParams,
}: {
  searchParams?: Promise<{ city?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.CUSTOMERS_READ);
  const params = (await searchParams) ?? {};
  const cityFilter = params.city ?? "all";

  const lists = await prisma.leadList.findMany({
    orderBy: [{ city: "asc" }, { importedAt: "desc" }],
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { members: true } },
    },
    take: 300,
  });

  const listIds = lists.map((l) => l.id);

  const membershipsAgg = listIds.length
    ? await prisma.customerLeadListMembership.findMany({
        where: { leadListId: { in: listIds } },
        select: {
          leadListId: true,
          customer: {
            select: { id: true, status: true, lastContactedAt: true },
          },
        },
      })
    : [];

  const statsByList = new Map<string, ListStats>();
  for (const m of membershipsAgg) {
    const cur =
      statsByList.get(m.leadListId) ?? { total: 0, contacted: 0, proposal: 0, won: 0, lost: 0 };
    cur.total++;
    if (m.customer.lastContactedAt) cur.contacted++;
    if (m.customer.status === "QUOTED" || m.customer.status === "NEGOTIATING") cur.proposal++;
    if (m.customer.status === "WON") cur.won++;
    if (m.customer.status === "LOST") cur.lost++;
    statsByList.set(m.leadListId, cur);
  }

  // P4 — Şehir bazında grupla
  const byCity = new Map<
    string,
    {
      city: string;
      lists: Array<(typeof lists)[number]>;
      totalFirms: number;
      contactedFirms: number;
    }
  >();
  for (const l of lists) {
    const cityKey = l.city ?? "Belirsiz";
    if (cityFilter !== "all" && cityKey !== cityFilter) continue;
    const cur = byCity.get(cityKey) ?? {
      city: cityKey,
      lists: [],
      totalFirms: 0,
      contactedFirms: 0,
    };
    cur.lists.push(l);
    const stats = statsByList.get(l.id) ?? {
      total: l._count.members,
      contacted: 0,
      proposal: 0,
      won: 0,
      lost: 0,
    };
    cur.totalFirms += stats.total;
    cur.contactedFirms += stats.contacted;
    byCity.set(cityKey, cur);
  }

  const cityGroups = Array.from(byCity.values());
  cityGroups.sort((a, b) => b.totalFirms - a.totalFirms || a.city.localeCompare(b.city, "tr"));
  for (const g of cityGroups) {
    g.lists.sort((a, b) => {
      const sa = statsByList.get(a.id)?.total ?? a._count.members;
      const sb = statsByList.get(b.id)?.total ?? b._count.members;
      return sb - sa || a.name.localeCompare(b.name, "tr");
    });
  }

  // Şehir filtresi için tüm distinct şehirler
  const allCities = Array.from(new Set(lists.map((l) => l.city ?? "Belirsiz"))).sort((a, b) =>
    a.localeCompare(b, "tr"),
  );

  const canDelete = user.role === "ADMIN";

  const totalFirms = cityGroups.reduce((acc, g) => acc + g.totalFirms, 0);
  const totalContacted = cityGroups.reduce((acc, g) => acc + g.contactedFirms, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ClipboardList}
        breadcrumb={[
          { label: "Satış" },
          { label: "Müşteriler", href: "/customers" },
          { label: "Listelerim" },
        ]}
        title="Lead Listelerim"
        subtitle="Google Maps'ten topladığın firmaları organize et — her listenin çağrı performansını takip et."
        actions={
          <Link href="/customers/import-list">
            <Button>
              <ListPlus className="mr-2 h-4 w-4" />
              Yeni Liste Import
            </Button>
          </Link>
        }
      />

      {/* P4 — Üst özet + şehir filtresi */}
      {lists.length > 0 && (
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span>
                📋 <strong>{lists.length}</strong> liste
              </span>
              <span>
                🏢 <strong>{totalFirms.toLocaleString("tr-TR")}</strong> firma
              </span>
              <span>
                📞 <strong>{totalContacted.toLocaleString("tr-TR")}</strong> arandı (%
                {totalFirms > 0 ? Math.round((totalContacted / totalFirms) * 100) : 0})
              </span>
              <span>
                🗺 <strong>{allCities.length}</strong> şehir
              </span>
            </div>
            <form method="GET" action="/customers/lists" className="flex items-center gap-2">
              <select
                name="city"
                defaultValue={cityFilter}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="all">Tüm şehirler ({allCities.length})</option>
                {allCities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="h-9 rounded-lg bg-slate-900 px-3 text-xs font-medium text-white"
              >
                Filtrele
              </button>
            </form>
          </div>
        </Card>
      )}

      {lists.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Henüz lead listesi yok"
          hint="Google Maps'ten bir şehir/sektör listesi topladıysan, CSV veya satır satır yapıştırarak hızlıca import edebilirsin."
          action={
            <Link href="/customers/import-list">
              <Button>
                <ListPlus className="mr-2 h-4 w-4" />
                İlk Listeyi Import Et
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {cityGroups.map((group, idx) => {
            const contactPct =
              group.totalFirms > 0
                ? Math.round((group.contactedFirms / group.totalFirms) * 100)
                : 0;
            return (
              <details
                key={group.city}
                open={idx === 0 || cityFilter !== "all"}
                className="group rounded-2xl border border-slate-200 bg-white overflow-hidden"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50 list-none">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
                    <h3 className="text-base font-semibold text-slate-900">{group.city}</h3>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {group.lists.length} liste · {group.totalFirms} firma
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500 flex-shrink-0">
                    <span>📞 {group.contactedFirms} arandı (%{contactPct})</span>
                  </div>
                </summary>

                <div className="border-t border-slate-100 bg-slate-50/50 p-3 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {group.lists.map((list) => {
                    const stats = statsByList.get(list.id) ?? {
                      total: list._count.members,
                      contacted: 0,
                      proposal: 0,
                      won: 0,
                      lost: 0,
                    };
                    const pct =
                      stats.total > 0
                        ? Math.round((stats.contacted / stats.total) * 100)
                        : 0;
                    return (
                      <Card key={list.id} className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <h4 className="truncate text-sm font-semibold text-slate-900">
                              {list.name.replace(/\s*\(Excel.*\)$/, "")}
                            </h4>
                            <p className="mt-0.5 text-[10px] text-slate-400">
                              {formatDate(list.importedAt)} · {list.createdBy?.name ?? "—"}
                            </p>
                          </div>
                          {canDelete && (
                            <LeadListDeleteButton leadListId={list.id} listName={list.name} />
                          )}
                        </div>

                        <div className="mt-2 grid grid-cols-4 gap-1 text-center">
                          <div className="rounded bg-slate-100 px-1 py-1">
                            <div className="text-sm font-bold text-slate-900 tabular-nums">{stats.total}</div>
                            <div className="text-[9px] uppercase text-slate-500">Toplam</div>
                          </div>
                          <div className="rounded bg-blue-50 px-1 py-1">
                            <div className="text-sm font-bold text-blue-700 tabular-nums">{stats.contacted}</div>
                            <div className="text-[9px] uppercase text-blue-600">Arandı</div>
                          </div>
                          <div className="rounded bg-amber-50 px-1 py-1">
                            <div className="text-sm font-bold text-amber-700 tabular-nums">{stats.proposal}</div>
                            <div className="text-[9px] uppercase text-amber-600">Teklif</div>
                          </div>
                          <div className="rounded bg-emerald-50 px-1 py-1">
                            <div className="text-sm font-bold text-emerald-700 tabular-nums">{stats.won}</div>
                            <div className="text-[9px] uppercase text-emerald-600">✓</div>
                          </div>
                        </div>

                        <div className="mt-2">
                          <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>

                        {stats.total > 0 && stats.contacted >= stats.total ? (
                          <Link
                            href={`/customers?leadListId=${list.id}`}
                            className="mt-2 block w-full text-center rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                          >
                            ✓ Tamamlandı — Listeyi Gör
                          </Link>
                        ) : (
                          <Link
                            href={`/customers?leadListId=${list.id}&cohort=queue`}
                            className="mt-2 block w-full text-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700"
                          >
                            📞 Aramaya Başla ({stats.total - stats.contacted})
                          </Link>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
