import Link from "next/link";
import { ClipboardList, ListPlus, Users, Phone, Trash2 } from "lucide-react";
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

export default async function LeadListsPage() {
  const user = await requirePermission(PERMISSIONS.CUSTOMERS_READ);

  const lists = await prisma.leadList.findMany({
    orderBy: { importedAt: "desc" },
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { members: true } },
    },
    take: 100,
  });

  const listIds = lists.map((l) => l.id);

  const membershipsAgg = listIds.length
    ? await prisma.customerLeadListMembership.findMany({
        where: { leadListId: { in: listIds } },
        select: {
          leadListId: true,
          customer: {
            select: {
              id: true,
              status: true,
              lastContactedAt: true,
            },
          },
        },
      })
    : [];

  const statsByList = new Map<
    string,
    { total: number; contacted: number; proposal: number; won: number; lost: number }
  >();
  for (const m of membershipsAgg) {
    const cur =
      statsByList.get(m.leadListId) ?? {
        total: 0,
        contacted: 0,
        proposal: 0,
        won: 0,
        lost: 0,
      };
    cur.total++;
    if (m.customer.lastContactedAt) cur.contacted++;
    if (m.customer.status === "QUOTED" || m.customer.status === "NEGOTIATING") cur.proposal++;
    if (m.customer.status === "WON") cur.won++;
    if (m.customer.status === "LOST") cur.lost++;
    statsByList.set(m.leadListId, cur);
  }

  const canDelete = user.role === "ADMIN";

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
        <div className="grid gap-4 md:grid-cols-2">
          {lists.map((list) => {
            const stats = statsByList.get(list.id) ?? {
              total: list._count.members,
              contacted: 0,
              proposal: 0,
              won: 0,
              lost: 0,
            };
            const contactedPct = stats.total > 0 ? Math.round((stats.contacted / stats.total) * 100) : 0;
            return (
              <Card key={list.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-semibold text-slate-900">{list.name}</h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {list.source}
                      {list.city ? ` · ${list.city}` : ""}
                      {list.category ? ` · ${list.category}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {formatDate(list.importedAt)} · {list.createdBy?.name ?? "—"}
                    </p>
                  </div>
                  {canDelete && (
                    <LeadListDeleteButton leadListId={list.id} listName={list.name} />
                  )}
                </div>

                <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 p-2">
                    <div className="text-lg font-bold text-slate-900">{stats.total}</div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Toplam</div>
                  </div>
                  <div className="rounded-lg bg-blue-50 p-2">
                    <div className="text-lg font-bold text-blue-700">{stats.contacted}</div>
                    <div className="text-[10px] uppercase tracking-wide text-blue-600">Arandı</div>
                  </div>
                  <div className="rounded-lg bg-amber-50 p-2">
                    <div className="text-lg font-bold text-amber-700">{stats.proposal}</div>
                    <div className="text-[10px] uppercase tracking-wide text-amber-600">Teklif</div>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-2">
                    <div className="text-lg font-bold text-emerald-700">{stats.won}</div>
                    <div className="text-[10px] uppercase tracking-wide text-emerald-600">Kazandı</div>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Arama ilerlemesi</span>
                    <span className="font-medium">%{contactedPct}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all"
                      style={{ width: `${contactedPct}%` }}
                    />
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <Link
                    href={`/customers?leadListId=${list.id}`}
                    className="flex-1"
                  >
                    <Button variant="secondary" className="w-full">
                      <Users className="mr-2 h-4 w-4" />
                      Listeyi Görüntüle
                    </Button>
                  </Link>
                  <Link
                    href={`/customers?leadListId=${list.id}&cohort=queue`}
                    className="flex-1"
                  >
                    <Button className="w-full">
                      <Phone className="mr-2 h-4 w-4" />
                      Ara
                    </Button>
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {lists.length > 0 && (
        <Card className="p-4">
          <p className="text-xs text-slate-500">
            <Trash2 className="mr-1 inline h-3 w-3 align-text-bottom" />
            Bir listeyi silmek müşterilerini varsayılan olarak silmez. Liste silme onay penceresinde
            <span className="font-medium"> "müşterileri de sil"</span> kutusunu işaretlersen yalnızca
            <span className="font-medium"> NEW</span> statüsünde, ürün ilgisi veya satışı olmayan müşteriler silinir
            (güvenli silme).
          </p>
        </Card>
      )}
    </div>
  );
}
