"use server";

import { revalidatePath } from "next/cache";

import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { CustomerStatus, Prisma } from "@prisma/client";

type ImportResult = {
  ok: boolean;
  message: string;
  created?: number;
  updated?: number;
  skipped?: number;
};

const FIELD_ALIASES: Record<string, string> = {
  name: "name",
  company: "company",
  phone: "phone",
  whatsapp: "whatsapp",
  email: "email",
  taxnumber: "taxNumber",
  address: "address",
  city: "city",
  country: "country",
  notes: "customerNotes",
  status: "status",
};

const PERM_DENIED: ImportResult = { ok: false, message: "Bu işlem için yetkiniz yok." };

export async function importCustomersCsvAction(formData: FormData): Promise<ImportResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.CUSTOMERS_CREATE))) return PERM_DENIED;

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, message: "CSV dosyasi secin." };
  }

  const rawText = await file.text();
  // Strip UTF-8 BOM if present
  const text = rawText.startsWith("﻿") ? rawText.slice(1) : rawText;
  const rows = parseCsv(text);

  if (rows.length < 2) {
    return { ok: false, message: "CSV icinde veri bulunamadi." };
  }

  const rawHeaders = rows[0].map((header) => header.trim().toLowerCase());
  const headers = rawHeaders.map((header) => FIELD_ALIASES[header] ?? header);

  if (!headers.includes("name")) {
    return { ok: false, message: "CSV icinde en az 'name' kolonu gerekli." };
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows.slice(1)) {
    const record = Object.fromEntries(headers.map((header, index) => [header, row[index]?.trim() ?? ""]));

    // Skip empty rows
    if (!record.name || record.name.trim().length < 2) {
      skipped += 1;
      continue;
    }

    const email = record.email?.toLowerCase().trim() || null;
    const phone = normalizePhone(record.phone) || null;
    const whatsapp = normalizePhone(record.whatsapp) || null;

    const matchClauses: Prisma.CustomerWhereInput[] = [];
    if (email) {
      matchClauses.push({ email });
    }
    if (phone) {
      matchClauses.push({ phone });
    }
    if (whatsapp) {
      matchClauses.push({ whatsapp });
    }

    const existing = matchClauses.length
      ? await prisma.customer.findFirst({
          where: {
            OR: matchClauses,
          },
        })
      : null;

    const data = {
      name: record.name,
      company: emptyToNull(record.company),
      phone: phone,
      whatsapp: whatsapp,
      email,
      taxNumber: emptyToNull(record.taxNumber),
      address: emptyToNull(record.address),
      city: emptyToNull(record.city),
      country: emptyToNull(record.country),
      customerNotes: emptyToNull(record.customerNotes),
      status: parseCustomerStatus(record.status),
    };

    if (existing) {
      await prisma.customer.update({
        where: { id: existing.id },
        data,
      });
      updated += 1;
    } else {
      await prisma.customer.create({ data });
      created += 1;
    }
  }

  revalidatePath("/customers");
  revalidatePath("/dashboard");

  return {
    ok: true,
    message: `Tamamlandi: ${created} yeni, ${updated} guncellendi, ${skipped} atlandi.`,
    created,
    updated,
    skipped,
  };
}

function parseCsv(input: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }

      row.push(current);
      current = "";

      if (row.some((cell) => cell.trim().length > 0)) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    if (row.some((cell) => cell.trim().length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

function emptyToNull(value: string | undefined) {
  return value && value.trim().length > 0 ? value.trim() : null;
}

function normalizePhone(value: string | undefined) {
  if (!value) return null;
  // Keep digits, +, and spaces; strip other chars
  const cleaned = value.replace(/[^\d+\s\-()]/g, "").trim();
  return cleaned.length >= 7 ? cleaned : null;
}

function parseCustomerStatus(value: string | undefined): CustomerStatus {
  const normalized = value?.trim().toUpperCase();

  if (
    normalized === "NEW" ||
    normalized === "CONTACTED" ||
    normalized === "QUOTED" ||
    normalized === "NEGOTIATING" ||
    normalized === "WON" ||
    normalized === "LOST"
  ) {
    return normalized;
  }

  return "NEW";
}
