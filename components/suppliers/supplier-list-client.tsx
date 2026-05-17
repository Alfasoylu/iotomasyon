"use client";

import { useState } from "react";
import { SupplierForm } from "@/components/suppliers/supplier-form";

interface SupplierRow {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  countryOfOrigin: string | null;
  paymentTerms: string | null;
  defaultLeadDays: number | null;
  notes: string | null;
  isActive: boolean;
  productCount: number;
}

interface SupplierListClientProps {
  suppliers: SupplierRow[];
}

export function SupplierListClient({ suppliers }: SupplierListClientProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="divide-y divide-slate-100">
      {suppliers.map((s) => (
        <div key={s.id}>
          {/* Row */}
          <div
            className="flex cursor-pointer items-center justify-between px-6 py-4 hover:bg-slate-50"
            onClick={() => toggle(s.id)}
          >
            <div className="flex items-center gap-4 min-w-0">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 truncate">{s.name}</p>
                <p className="text-xs text-slate-500 mt-0.5 truncate">
                  {[s.contactName, s.phone, s.email].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              {!s.isActive && (
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                  Pasif
                </span>
              )}
            </div>
            <div className="flex items-center gap-6 shrink-0 pl-4">
              <div className="hidden sm:block text-right">
                <p className="text-xs text-slate-400 uppercase tracking-wide">Ürün</p>
                <p className="text-sm font-semibold text-slate-700">{s.productCount}</p>
              </div>
              {s.defaultLeadDays && (
                <div className="hidden md:block text-right">
                  <p className="text-xs text-slate-400 uppercase tracking-wide">Tedarik</p>
                  <p className="text-sm font-semibold text-slate-700">{s.defaultLeadDays} gün</p>
                </div>
              )}
              {s.countryOfOrigin && (
                <div className="hidden lg:block text-right">
                  <p className="text-xs text-slate-400 uppercase tracking-wide">Menşei</p>
                  <p className="text-sm font-semibold text-slate-700">{s.countryOfOrigin}</p>
                </div>
              )}
              <span className="text-slate-400 text-sm">{expandedId === s.id ? "▲" : "▼"}</span>
            </div>
          </div>

          {/* Expanded edit form */}
          {expandedId === s.id && (
            <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">
                Tedarikçi Düzenle
              </p>
              <SupplierForm
                supplierId={s.id}
                initialValues={{
                  name: s.name,
                  contactName: s.contactName ?? "",
                  phone: s.phone ?? "",
                  email: s.email ?? "",
                  countryOfOrigin: s.countryOfOrigin ?? "",
                  paymentTerms: s.paymentTerms ?? "",
                  defaultLeadDays: s.defaultLeadDays != null ? String(s.defaultLeadDays) : "",
                  notes: s.notes ?? "",
                  isActive: s.isActive,
                }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
