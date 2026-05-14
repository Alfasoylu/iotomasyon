import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  formatCustomerStatus,
  getCustomerStatusTone,
} from "@/lib/customer-utils";
import { CUSTOMER_STATUS_OPTIONS } from "@/types/customers";

type CustomerCard = {
  id: string;
  name: string;
  company: string | null;
  status: (typeof CUSTOMER_STATUS_OPTIONS)[number];
};

export function CustomerKanbanBoard({
  customers,
}: {
  customers: CustomerCard[];
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-6">
      {CUSTOMER_STATUS_OPTIONS.map((status) => {
        const items = customers.filter((customer) => customer.status === status);

        return (
          <Card key={status} className="p-4">
            <div className="flex items-center justify-between gap-3">
              <Badge tone={getCustomerStatusTone(status)}>
                {formatCustomerStatus(status)}
              </Badge>
              <span className="text-xs uppercase tracking-[0.25em] text-slate-400">
                {items.length}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {items.length === 0 ? (
                <p className="text-sm text-slate-400">Kayit yok</p>
              ) : (
                items.map((customer) => (
                  <Link
                    key={customer.id}
                    href={`/customers/${customer.id}`}
                    className="block rounded-2xl border border-slate-200 bg-slate-50 p-3 transition hover:border-slate-300 hover:bg-white"
                  >
                    <p className="font-semibold text-slate-900">{customer.name}</p>
                    <p className="mt-1 text-sm text-slate-500">{customer.company ?? "-"}</p>
                  </Link>
                ))
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
