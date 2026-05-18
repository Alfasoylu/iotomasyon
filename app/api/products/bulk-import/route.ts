/**
 * Phase 78 — Toplu Veri İçe Aktarma
 *
 * POST /api/products/bulk-import
 * Content-Type: multipart/form-data  (field: "file")
 *
 * Accepts the CSV produced by /api/products/bulk-export (or any CSV with the same header).
 * For each row, looks up the product by SKU and updates only the import-relevant fields
 * that are non-empty in the CSV (empty cell = keep existing value).
 *
 * Allowed columns: sourceCostRmb, weightKg, customsRatePct, shippingMethodPref, importPaymentFeePct
 * SKU and name columns are read-only — they identify the product but are never written.
 *
 * Returns JSON: { updated: number; skipped: number; errors: string[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type CsvRow = Record<string, string>;

/** Parse CSV text (RFC 4180 — handles quoted fields with embedded commas/newlines). */
function parseCsv(text: string): CsvRow[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return [];

  // Parse a single CSV line, handling quoted fields
  function parseLine(line: string): string[] {
    const fields: string[] = [];
    let i = 0;
    while (i < line.length) {
      if (line[i] === '"') {
        // Quoted field
        let field = "";
        i++; // skip opening quote
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') {
            field += '"';
            i += 2;
          } else if (line[i] === '"') {
            i++; // skip closing quote
            break;
          } else {
            field += line[i++];
          }
        }
        fields.push(field);
        if (line[i] === ",") i++;
      } else {
        // Unquoted field
        const end = line.indexOf(",", i);
        if (end === -1) {
          fields.push(line.slice(i));
          break;
        } else {
          fields.push(line.slice(i, end));
          i = end + 1;
        }
      }
    }
    return fields;
  }

  const headers = parseLine(lines[0]);
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseLine(line);
    const row: CsvRow = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = (values[idx] ?? "").trim();
    });
    rows.push(row);
  }

  return rows;
}

function parseDecimal(val: string): number | null {
  if (!val || val.trim() === "") return null;
  const n = parseFloat(val.replace(",", "."));
  return isNaN(n) ? null : n;
}

const VALID_SHIPPING = new Set(["AIR", "SEA", ""]);

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

  // 5 MB limit
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "Dosya boyutu 5 MB'ı aşıyor" }, { status: 400 });
  }

  const text = await file.text();
  const rows = parseCsv(text);

  if (rows.length === 0) {
    return NextResponse.json({ error: "CSV boş veya okunamadı" }, { status: 400 });
  }

  // Validate required column exists
  if (!("sku" in rows[0])) {
    return NextResponse.json(
      { error: "CSV'de 'sku' sütunu bulunamadı. Şablonu indirip doldurun." },
      { status: 400 }
    );
  }

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const sku = row["sku"]?.trim();
    if (!sku) {
      skipped++;
      continue;
    }

    // Build update payload — only include fields with a non-empty value
    const updateData: Record<string, unknown> = {};

    const sourceCostRmb = parseDecimal(row["sourceCostRmb"] ?? "");
    if (sourceCostRmb !== null) updateData.sourceCostRmb = sourceCostRmb;

    const weightKg = parseDecimal(row["weightKg"] ?? "");
    if (weightKg !== null) updateData.weightKg = weightKg;

    const customsRatePct = parseDecimal(row["customsRatePct"] ?? "");
    if (customsRatePct !== null) updateData.customsRatePct = customsRatePct;

    const shippingMethodPref = (row["shippingMethodPref"] ?? "").trim().toUpperCase();
    if (shippingMethodPref !== "") {
      if (!VALID_SHIPPING.has(shippingMethodPref)) {
        errors.push(`SKU ${sku}: geçersiz shippingMethodPref "${shippingMethodPref}" (AIR veya SEA olmalı)`);
        continue;
      }
      updateData.shippingMethodPref = shippingMethodPref || null;
    }

    const importPaymentFeePct = parseDecimal(row["importPaymentFeePct"] ?? "");
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
