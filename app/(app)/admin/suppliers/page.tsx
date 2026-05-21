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
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Yönetim / Tedarikçiler
          </p>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
            Tedarikçi Yönetimi
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Tedarikçileri tanımlayın, ürünlerle ilişkilendirin ve tedarik koşullarını kaydedin.
          </p>
        </div>
        <Link href="/admin/procurement" className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          ← Tedarik Asistanı
        </Link>
      </div>

      {/* Add new supplier */}
      <Card className="p-6 space-y-4 rounded-lg">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Yeni Tedarikçi
          </p>
          <h2 className="mt-1 text-base font-semibold text-[var(--text-primary)]">Tedarikçi Ekle</h2>
        </div>
        <SupplierForm />
      </Card>

      {/* Supplier list */}
      <Card className="overflow-hidden rounded-lg">
        <div className="border-b border-[var(--border-subtle)] px-6 py-5">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Kayıtlı Tedarikçiler ({suppliers.length})
          </p>
          <h2 className="mt-1 text-base font-semibold tracking-tight text-[var(--text-primary)]">Tedarikçi Listesi</h2>
        </div>

        {suppliers.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-[var(--text-secondary)]">Henüz tedarikçi eklenmemiş.</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
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
              defaultAirFreightUsdPerKg: s.defaultAirFreightUsdPerKg != null ? String(s.defaultAirFreightUsdPerKg) : "",
              defaultSeaFreightUsdPerKg: s.defaultSeaFreightUsdPerKg != null ? String(s.defaultSeaFreightUsdPerKg) : "",
              defaultPaymentFeePct: s.defaultPaymentFeePct != null ? String(s.defaultPaymentFeePct) : "",
              productCount: s._count.products,
            }))}
          />
        )}
      </Card>
    </div>
  );
}
