/**
 * Phase 78 — Toplu Veri İçe Aktarma
 *
 * POST /api/products/bulk-import
 * Content-Type: multipart/form-data  (field: "file")
 *
 * Accepts .xlsx OR .csv files produced by /api/products/bulk-export.
 * For each row, looks up the product by SKU and updates only the import-relevant
 * fields that are non-empty in the file (empty cell = keep existing value).
 *
 * Allowed columns: sourceCostRmb, weightKg, customsRatePct, shippingMethodPref, importPaymentFeePct
 * SKU and name are read-only — they identify the product but are never written.
 *
 * Returns JSON: { updated: number; skipped: number; errors: string[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

type CsvRow = Record<string, string>;

const VALID_SHIPPING = new Set(["AIR", "SEA", ""]);

function parseDecimal(val: unknown): number | null {
  if (val == null || val === "") return null;
  const str = String(val).trim().replace(",", ".");
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
}

export async function POST(req: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.EXECUTIVE_READ);
  } catch {
    return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Form verisi okunamadı" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "Dosya bulunamadı (alan adı: file)" }, { status: 400 });
  }

  // 10 MB limit
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Dosya boyutu 10 MB'ı aşıyor" }, { status: 400 });
  }

  // Read file buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Parse with SheetJS — handles both .xlsx and .csv
  let rows: CsvRow[];
  try {
    const workbook = XLSX.read(buffer, { type: "buffer", codepage: 65001 });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json({ error: "Dosyada sayfa bulunamadı" }, { status: 400 });
    }
    const sheet = workbook.Sheets[sheetName];
    // defval: "" ensures empty cells become empty strings instead of undefined
    rows = XLSX.utils.sheet_to_json<CsvRow>(sheet, { defval: "", raw: false });
  } catch {
    return NextResponse.json({ error: "Dosya okunamadı. Geçerli bir .xlsx veya .csv dosyası yükleyin." }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "Dosya boş veya okunamadı" }, { status: 400 });
  }

  // Validate required column exists
  if (!("sku" in rows[0])) {
    return NextResponse.json(
      { error: "Dosyada 'sku' sütunu bulunamadı. Şablonu indirip doldurun." },
      { status: 400 }
    );
  }

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const sku = String(row["sku"] ?? "").trim();
    if (!sku) {
      skipped++;
      continue;
    }

    // Build update payload — only include fields with a non-empty value
    const updateData: Record<string, unknown> = {};

    const sourceCostRmb = parseDecimal(row["sourceCostRmb"]);
    if (sourceCostRmb !== null) updateData.sourceCostRmb = sourceCostRmb;

    const weightKg = parseDecimal(row["weightKg"]);
    if (weightKg !== null) updateData.weightKg = weightKg;

    const customsRatePct = parseDecimal(row["customsRatePct"]);
    if (customsRatePct !== null) updateData.customsRatePct = customsRatePct;

    const shippingRaw = String(row["shippingMethodPref"] ?? "").trim().toUpperCase();
    if (shippingRaw !== "") {
      if (!VALID_SHIPPING.has(shippingRaw)) {
        errors.push(`SKU ${sku}: geçersiz shippingMethodPref "${shippingRaw}" (AIR veya SEA olmalı)`);
        continue;
      }
      updateData.shippingMethodPref = shippingRaw || null;
    }

    const importPaymentFeePct = parseDecimal(row["importPaymentFeePct"]);
    if (importPaymentFeePct !== null) updateData.importPaymentFeePct = importPaymentFeePct;

    // Nothing to update for this row
    if (Object.keys(updateData).length === 0) {
      skipped++;
      continue;
    }

    try {
      const result = await prisma.product.updateMany({
        where: { sku },
        data: updateData,
      });
      if (result.count === 0) {
        errors.push(`SKU ${sku}: ürün bulunamadı`);
      } else {
        updated++;
      }
    } catch (err) {
      errors.push(`SKU ${sku}: güncelleme hatası — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({ updated, skipped, errors });
}
