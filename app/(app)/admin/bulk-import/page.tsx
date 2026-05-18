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
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Yönetim</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
          Toplu Veri Girişi
        </h1>
        <p className="mt-1 text-sm text-slate-500">
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
