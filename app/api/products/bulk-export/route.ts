/**
 * Phase 78 — Toplu Veri Dışa Aktarma (xlsx)
 *
 * GET /api/products/bulk-export
 *
 * Returns an .xlsx file with all active products and their import-relevant fields.
 * Missing values are left as empty cells so the user can fill them in Excel.
 * The same template can be downloaded repeatedly, filled, and re-uploaded.
 *
 * Columns:
 *   sku | name | sourceCostRmb | weightKg | customsRatePct | shippingMethodPref | importPaymentFeePct
 *
 * Header row is bold + frozen. Filled cells have a light fill; empty (missing)
 * cells get a subtle yellow fill so they're easy to spot.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
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

  // Build rows
  type Row = {
    sku: string;
    name: string;
    sourceCostRmb: number | string;
    weightKg: number | string;
    customsRatePct: number | string;
    shippingMethodPref: string;
    importPaymentFeePct: number | string;
  };

  const rows: Row[] = products.map((p) => ({
    sku: p.sku ?? "",
    name: p.name,
    sourceCostRmb:        p.sourceCostRmb        != null ? Number(p.sourceCostRmb)        : "",
    weightKg:             p.weightKg             != null ? Number(p.weightKg)             : "",
    customsRatePct:       p.customsRatePct       != null ? Number(p.customsRatePct)       : "",
    shippingMethodPref:   p.shippingMethodPref   ?? "",
    importPaymentFeePct:  p.importPaymentFeePct  != null ? Number(p.importPaymentFeePct)  : "",
  }));

  // Create workbook
  const wb = XLSX.utils.book_new();

  // Header labels (Turkish-friendly)
  const headers = [
    "sku",
    "name",
    "sourceCostRmb",
    "weightKg",
    "customsRatePct",
    "shippingMethodPref",
    "importPaymentFeePct",
  ];

  // Sheet data: header row + data rows
  const sheetData = [
    headers,
    ...rows.map((r) => [
      r.sku,
      r.name,
      r.sourceCostRmb,
      r.weightKg,
      r.customsRatePct,
      r.shippingMethodPref,
      r.importPaymentFeePct,
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Column widths
  ws["!cols"] = [
    { wch: 20 }, // sku
    { wch: 55 }, // name
    { wch: 16 }, // sourceCostRmb
    { wch: 12 }, // weightKg
    { wch: 16 }, // customsRatePct
    { wch: 20 }, // shippingMethodPref
    { wch: 22 }, // importPaymentFeePct
  ];

  // Freeze first row (header)
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };

  // Style header row — bold + blue background
  const headerStyle = {
    font: { bold: true, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "1E3A5F" } },
    alignment: { horizontal: "center" as const },
  };
  headers.forEach((_, colIdx) => {
    const cellAddr = XLSX.utils.encode_cell({ r: 0, c: colIdx });
    if (ws[cellAddr]) {
      ws[cellAddr].s = headerStyle;
    }
  });

  // Style data rows — yellow fill for missing (empty) cells, normal fill otherwise
  const filledStyle  = { fill: { fgColor: { rgb: "FFFFFF" } } };
  const missingStyle = { fill: { fgColor: { rgb: "FFF9C4" } } }; // pale yellow

  rows.forEach((row, rowIdx) => {
    const values = [
      row.sku,
      row.name,
      row.sourceCostRmb,
      row.weightKg,
      row.customsRatePct,
      row.shippingMethodPref,
      row.importPaymentFeePct,
    ];
    values.forEach((val, colIdx) => {
      const cellAddr = XLSX.utils.encode_cell({ r: rowIdx + 1, c: colIdx });
      if (!ws[cellAddr]) {
        // Empty cell — create it so we can style it
        ws[cellAddr] = { t: "z", v: undefined };
      }
      // sku + name columns are always "filled" (read-only reference)
      const isEmpty = val === "" || val == null;
      const isReadOnly = colIdx < 2;
      ws[cellAddr].s = isReadOnly || !isEmpty ? filledStyle : missingStyle;
    });
  });

  XLSX.utils.book_append_sheet(wb, ws, "Ürünler");

  // Write as buffer
  const buf = XLSX.write(wb, {
    type: "buffer",
    bookType: "xlsx",
    cellStyles: true,
  });

  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const filename = `urunler-maliyet-agirlik-${dateStr}.xlsx`;

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
