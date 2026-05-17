/**
 * Phase 20 — Supplier Intelligence
 *
 * Admin CRUD page for managing suppliers and viewing their product links.
 */

import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { SupplierForm } from "@/components/suppliers/supplier-form";
import { SupplierListClient } from "@/components/suppliers/supplier-list-client";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  await requirePermission(PERMISSIONS.SUPPLIERS_READ);

  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { products: true } },
    },
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Yönetim / Tedarikçiler
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Tedarikçi Yönetimi
          </h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Tedarikçileri tanımlayın, ürünlerle ilişkilendirin ve tedarik koşullarını kaydedin.
          </p>
        </div>
        <Link href="/admin/procurement" className="text-sm font-medium text-slate-500 hover:text-slate-900">
          ← Tedarik Asistanı
        </Link>
      </div>

      {/* Add new supplier */}
      <Card className="p-6 space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
            Yeni Tedarikçi
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">Tedarikçi Ekle</h2>
        </div>
        <SupplierForm />
      </Card>

      {/* Supplier list */}
      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            Kayıtlı Tedarikçiler ({suppliers.length})
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Tedarikçi Listesi</h2>
        </div>

        {suppliers.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-slate-500">Henüz tedarikçi eklenmemiş.</p>
            <p className="mt-1 text-xs text-slate-400">
              Yukarıdaki formu kullanarak ilk tedarikçinizi ekleyin.
            </p>
          </div>
        ) : (
          <SupplierListClient
            suppliers={suppliers.map((s) => ({
              id: s.id,
              name: s.name,
              contactName: s.contactName,
              phone: s.phone,
              email: s.email,
              countryOfOrigin: s.countryOfOrigin,
              paymentTerms: s.paymentTerms,
              defaultLeadDays: s.defaultLeadDays,
              notes: s.notes,
              isActive: s.isActive,
              productCount: s._count.products,
            }))}
          />
        )}
      </Card>
    </div>
  );
}
