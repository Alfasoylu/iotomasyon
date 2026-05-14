"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";

import { updateCustomerStatusAction } from "@/lib/actions/customer-actions";
import {
  formatCustomerStatus,
  getCustomerStatusTone,
} from "@/lib/customer-utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CUSTOMER_STATUS_OPTIONS } from "@/types/customers";
import type { CustomerStatus } from "@/types/customers";

type CustomerCard = {
  id: string;
  name: string;
  company: string | null;
  status: CustomerStatus;
};

export function CustomerKanbanBoard({ customers }: { customers: CustomerCard[] }) {
  const [, startTransition] = useTransition();
  const [optimisticCustomers, moveCustomer] = useOptimistic(
    customers,
    (state, { id, status }: { id: string; status: CustomerStatus }) =>
      state.map((c) => (c.id === id ? { ...c, status } : c)),
  );

  function onDrop(customerId: string, newStatus: CustomerStatus) {
    const current = optimisticCustomers.find((c) => c.id === customerId);
    if (!current || current.status === newStatus) return;

    startTransition(async () => {
      moveCustomer({ id: customerId, status: newStatus });
      await updateCustomerStatusAction(customerId, newStatus);
    });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-6">
      {CUSTOMER_STATUS_OPTIONS.map((status) => {
        const items = optimisticCustomers.filter((c) => c.status === status);

        return (
          <KanbanColumn
            key={status}
            status={status}
            items={items}
            onDrop={onDrop}
          />
        );
      })}
    </div>
  );
}

function KanbanColumn({
  status,
  items,
  onDrop,
}: {
  status: CustomerStatus;
  items: CustomerCard[];
  onDrop: (id: string, status: CustomerStatus) => void;
}) {
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (id) onDrop(id, status);
  }

  return (
    <Card className="p-4">
      {/* invisible drop zone overlay handled by inner div */}
      <div
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className="flex h-full min-h-full flex-col"
      >
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
          <p className="rounded-xl border-2 border-dashed border-slate-200 p-3 text-center text-sm text-slate-400">
            Bırak
          </p>
        ) : (
          items.map((customer) => (
            <KanbanCard key={customer.id} customer={customer} />
          ))
        )}
      </div>
      </div>
    </Card>
  );
}

function KanbanCard({ customer }: { customer: CustomerCard }) {
  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData("text/plain", customer.id);
    e.dataTransfer.effectAllowed = "move";
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="cursor-grab rounded-2xl border border-slate-200 bg-slate-50 p-3 transition hover:border-slate-300 hover:bg-white active:cursor-grabbing active:opacity-60"
    >
      <Link href={`/customers/${customer.id}`} onClick={(e) => e.stopPropagation()}>
        <p className="font-semibold text-slate-900">{customer.name}</p>
        <p className="mt-1 text-sm text-slate-500">{customer.company ?? "-"}</p>
      </Link>
    </div>
  );
}
