/**
 * Phase 78 — Toplu Veri Dışa Aktarma
 *
 * GET /api/products/bulk-export
 *
 * Returns a CSV file with all active products and their import-relevant fields.
 * Missing values are left as empty cells so the user can fill them in Excel.
 * The same template can be downloaded repeatedly, filled, and re-uploaded.
 *
 * Columns: sku, name, sourceCostRmb, weightKg, customsRatePct, shippingMethodPref, importPaymentFeePct
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function escapeCsv(value: string | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  // Wrap in quotes if contains comma, newline, or double-quote
  if (str.includes(",") || str.includes("\n") || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function decimalOrEmpty(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

export async function GET(req: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.EXECUTIVE_READ);
  } catch {
    return new NextResponse("Yetkisiz erişim", { status: 401 });
  }

  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: [{ sku: "asc" }],
    select: {
      sku: true,
      name: true,
      sourceCostRmb: true,
      weightKg: true,
      customsRatePct: true,
      shippingMethodPref: true,
      importPaymentFeePct: true,
    },
  });

  // CSV header
  const rows: string[] = [
    "sku,name,sourceCostRmb,weightKg,customsRatePct,shippingMethodPref,importPaymentFeePct",
  ];

  for (const p of products) {
    rows.push(
      [
        escapeCsv(p.sku),
        escapeCsv(p.name),
        decimalOrEmpty(p.sourceCostRmb),
        decimalOrEmpty(p.weightKg),
        decimalOrEmpty(p.customsRatePct),
        escapeCsv(p.shippingMethodPref),
        decimalOrEmpty(p.importPaymentFeePct),
      ].join(",")
    );
  }

  const csv = rows.join("\r\n");

  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const filename = `urunler-maliyet-agirlik-${dateStr}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
