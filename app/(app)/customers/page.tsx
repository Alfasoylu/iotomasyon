import Link from "next/link";

import { CustomerImportForm } from "@/components/customers/customer-import-form";
import { CustomerKanbanBoard } from "@/components/customers/customer-kanban-board";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CustomerFilters } from "@/components/customers/customer-filters";
import {
  formatCustomerStatus,
  getCustomerStatusTone,
} from "@/lib/customer-utils";
import { listCustomers, listUsersForSelect } from "@/services/customer-service";
import { listAttributes } from "@/services/attribute-service";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query       = typeof params.q           === "string" ? params.q           : "";
  const status      = typeof params.status      === "string" ? params.status      : "all";
  const source      = typeof params.source      === "string" ? params.source      : "all";
  const ownedById   = typeof params.ownedById   === "string" ? params.ownedById   : "all";
  const attributeId = typeof params.attributeId === "string" ? params.attributeId : "all";

  const [{ databaseAvailable, customers }, users, attributes] = await Promise.all([
    listCustomers({ q: query, status, source, ownedById, attributeId }),
    listUsersForSelect(),
    listAttributes(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Müşteriler
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Müşteri portföyü
          </h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Satış süreci için müşteri kayıtları, durum takibi ve iletişim bilgileri.
          </p>
        </div>
        <Link href="/customers/new">
          <Button>Yeni müşteri</Button>
        </Link>
      </div>

      <Card className="p-5">
        <CustomerFilters
          initialQuery={query}
          initialStatus={status}
          initialSource={source}
          initialOwnedById={ownedById}
          initialAttributeId={attributeId}
          users={users}
          attributes={attributes}
        />
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
        <Card className="p-5">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Satış hattı
          </p>
          <h2 className="mt-3 text-xl font-semibold text-slate-950">
            Müşteri durum panosu
          </h2>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Kayıtları durum bazlı izleyin ve satış sürecindeki yoğunluğu görün.
          </p>
        </Card>

        <Card className="p-5">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            CSV ile içe aktar
          </p>
          <h2 className="mt-3 text-xl font-semibold text-slate-950">
            Müşteri listesini içe aktar
          </h2>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Kolon adlari: name, company, phone, whatsapp, email, taxNumber, address,
            city, country, notes, status
          </p>
          <div className="mt-5">
            <CustomerImportForm />
          </div>
        </Card>
      </div>

      <CustomerKanbanBoard customers={customers} />

      {!databaseAvailable ? (
        <Card className="border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-900">
          Veritabanı bağlantısı şu anda kullanılamıyor. Müşteri listesi gösterilemiyor.
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.25em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Müşteri</th>
                <th className="px-4 py-3">İletişim</th>
                <th className="px-4 py-3">Şehir</th>
                <th className="px-4 py-3">Kaynak</th>
                <th className="px-4 py-3">Sorumlu</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3 text-right">Aksiyon</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-sm">
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    Bu filtrelerle eşleşen müşteri bulunamadı.
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-50">
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-900">{customer.name}</p>
                      <p className="text-slate-500">{customer.company ?? "-"}</p>
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      <p>{customer.phone ?? "-"}</p>
                      <p>{customer.email ?? customer.whatsapp ?? "-"}</p>
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {[customer.city, customer.country].filter(Boolean).join(" / ") || "-"}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {customer.source ?? "-"}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {customer.owner?.name ?? "-"}
                    </td>
                    <td className="px-4 py-4">
                      <Badge tone={getCustomerStatusTone(customer.status)}>
                        {formatCustomerStatus(customer.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Link
                        href={`/customers/${customer.id}`}
                        className="text-sm font-semibold text-slate-900 hover:text-[color:var(--accent)]"
                      >
                        Detay
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
