/**
 * Phase 78 — Toplu Veri Girişi
 *
 * Allows bulk-updating product import fields (sourceCostRmb, weightKg, customsRatePct,
 * shippingMethodPref, importPaymentFeePct) via CSV download → fill → upload.
 *
 * The same CSV template can be downloaded repeatedly, filled in Excel, and re-uploaded.
 * Empty cells in the uploaded CSV preserve existing values.
 */

import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { BulkImportForm } from "@/components/bulk-import/bulk-import-form";

export const dynamic = "force-dynamic";

export default async function BulkImportPage() {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  const [totalProducts, missingCost, missingWeight] = await Promise.all([
    prisma.product.count({ where: { isActive: true } }),
    prisma.product.count({
      where: { isActive: true, sourceCostRmb: null },
    }),
    prisma.product.count({
      where: { isActive: true, weightKg: null },
    }),
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Yönetim</p>
        <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
          Toplu Veri Girişi
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Ürünlerin ağırlık, maliyet ve gümrük verilerini Excel şablonu üzerinden toplu güncelleyin.
        </p>
      </div>

      <BulkImportForm
        totalProducts={totalProducts}
        missingCost={missingCost}
        missingWeight={missingWeight}
      />
    </div>
  );
}
