"use client";

import { useState } from "react";
import { CheckSquare, Square, Download, X } from "lucide-react";

import { CustomerRow } from "./customer-row";
import type { CustomerStatsRow } from "@/services/customer-cohort-service";
import type { CustomerStatus } from "@prisma/client";

interface CustomerLike {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  status: CustomerStatus;
  customerType: string | null;
  source: string | null;
  owner: { id: string; name: string } | null;
  lastContactedAt: Date | null;
  tags: string[];
  doNotCall: boolean;
  avatarUrl: string | null;
  taxNumber: string | null;
  address: string | null;
  customerNotes: string | null;
}

/**
 * Müşteri liste wrapper'ı — bulk multi-select + CSV export.
 *
 * Checkbox tıklanınca toolbar açılır, CSV indir ile filtreli liste indirilir.
 */
export function CustomerBulkList({
  customers,
  statsByCustomerId,
  recentActivityByCustomerId,
}: {
  customers: CustomerLike[];
  statsByCustomerId: Record<string, CustomerStatsRow>;
  recentActivityByCustomerId?: Record<string, { byUserName: string; minutesAgo: number }>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(customers.map((c) => c.id)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  function exportCsv(onlySelected: boolean) {
    const rows = onlySelected
      ? customers.filter((c) => selected.has(c.id))
      : customers;

    const header = [
      "Ad", "Şirket", "Telefon", "WhatsApp", "E-posta", "Şehir",
      "Vergi No", "Status", "Tip", "Tag'ler", "Sahip",
      "Lifetime Sipariş", "Lifetime Ciro TRY", "Aktif İlgi", "Açık Teklif",
      "Son Temas", "DND"
    ];

    function esc(v: string | number | null | undefined): string {
      const s = String(v ?? "");
      if (s.includes('"') || s.includes(";") || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    }

    const lines = [
      header.join(";"),
      ...rows.map((c) => {
        const stats = statsByCustomerId[c.id];
        return [
          esc(c.name),
          esc(c.company ?? ""),
          esc(c.phone ?? ""),
          esc(c.whatsapp ?? ""),
          esc(c.email ?? ""),
          esc(c.city ?? ""),
          esc(c.taxNumber ?? ""),
          esc(c.status),
          esc(c.customerType ?? ""),
          esc(c.tags.join(",")),
          esc(c.owner?.name ?? ""),
          esc(stats?.lifetimeOrders ?? 0),
          esc(stats?.lifetimeRevenueTry?.toFixed(2) ?? "0"),
          esc(stats?.activeInterestsCount ?? 0),
          esc(stats?.openQuoteCount ?? 0),
          esc(c.lastContactedAt ? new Date(c.lastContactedAt).toISOString().slice(0, 10) : ""),
          esc(c.doNotCall ? "EVET" : ""),
        ].join(";");
      }),
    ];

    const csv = "﻿" + lines.join("\n");  // BOM for Excel UTF-8
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `musteriler-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-2">
      {/* Top bar: select all + bulk actions */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
        <button
          type="button"
          onClick={selected.size === customers.length ? clearAll : selectAll}
          className="inline-flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          {selected.size === customers.length && customers.length > 0 ? (
            <CheckSquare size={14} strokeWidth={1.5} />
          ) : (
            <Square size={14} strokeWidth={1.5} />
          )}
          {selected.size > 0
            ? `${selected.size} seçili / ${customers.length}`
            : `Tümünü seç (${customers.length})`}
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => exportCsv(false)}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
            title="Mevcut filtreli liste CSV"
          >
            <Download size={14} strokeWidth={1.5} />
            Tümü CSV
          </button>
        </div>
      </div>

      {/* Sticky bulk toolbar when ≥1 selected */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 rounded-md border border-[var(--accent-border)] bg-[var(--accent-dim)] px-4 py-2.5">
          <p className="text-sm font-medium text-[var(--accent)]">
            <strong className="font-mono tabular-nums">{selected.size}</strong> müşteri seçildi
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => exportCsv(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-2.5 py-1 text-xs font-semibold text-[var(--accent-fg)] hover:opacity-90"
            >
              <Download size={14} strokeWidth={1.5} />
              Seçili CSV indir
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
            >
              <X size={14} strokeWidth={1.5} />
              Seçimi temizle
            </button>
          </div>
        </div>
      )}

      {/* Customer rows with checkbox */}
      <div className="space-y-2">
        {customers.map((customer) => (
          <div key={customer.id} className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => toggle(customer.id)}
              className="mt-5 flex-shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              aria-label={selected.has(customer.id) ? "Seçimi kaldır" : "Seç"}
            >
              {selected.has(customer.id) ? (
                <CheckSquare size={14} strokeWidth={1.5} className="text-[var(--accent)]" />
              ) : (
                <Square size={14} strokeWidth={1.5} />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <CustomerRow
                customer={customer}
                stats={statsByCustomerId[customer.id] ?? null}
                recentActivity={recentActivityByCustomerId?.[customer.id] ?? null}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
