import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CustomerFilters } from "@/components/customers/customer-filters";
import {
  formatCustomerStatus,
  getCustomerStatusTone,
} from "@/lib/customer-utils";
import { listCustomers } from "@/services/customer-service";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const status = typeof params.status === "string" ? params.status : "all";
  const { databaseAvailable, customers } = await listCustomers({ q: query, status });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Customers
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Musteri portfoyu
          </h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Satis sureci icin musteri kayitlari, durum takibi ve iletisim bilgileri.
          </p>
        </div>
        <Link href="/customers/new">
          <Button>Yeni musteri</Button>
        </Link>
      </div>

      <Card className="p-5">
        <CustomerFilters initialQuery={query} initialStatus={status} />
      </Card>

      {!databaseAvailable ? (
        <Card className="border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-900">
          Veritabani baglantisi su anda kullanilamiyor. Musteri listesi gosterilemiyor.
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.25em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Musteri</th>
                <th className="px-4 py-3">Iletisim</th>
                <th className="px-4 py-3">Sehir</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3 text-right">Aksiyon</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-sm">
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    Bu filtrelerle eslesen musteri bulunamadi.
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
