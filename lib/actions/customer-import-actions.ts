"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { CustomerStatus, Prisma } from "@prisma/client";

type ImportResult = {
  ok: boolean;
  message: string;
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

export async function importCustomersCsvAction(formData: FormData): Promise<ImportResult> {
  await requireUser();

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, message: "CSV dosyasi secin." };
  }

  const text = await file.text();
  const rows = parseCsv(text);

  if (rows.length < 2) {
    return { ok: false, message: "CSV icinde veri bulunamadi." };
  }

  const rawHeaders = rows[0].map((header) => header.trim().toLowerCase());
  const headers = rawHeaders.map((header) => FIELD_ALIASES[header] ?? header);

  if (!headers.includes("name")) {
    return { ok: false, message: "CSV icinde en az 'name' kolonu gerekli." };
  }

  let processed = 0;

  for (const row of rows.slice(1)) {
    const record = Object.fromEntries(headers.map((header, index) => [header, row[index]?.trim() ?? ""]));

    if (!record.name) {
      continue;
    }

    const email = record.email?.toLowerCase() || null;
    const phone = record.phone || null;
    const whatsapp = record.whatsapp || null;

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
    } else {
      await prisma.customer.create({ data });
    }

    processed += 1;
  }

  revalidatePath("/customers");
  revalidatePath("/dashboard");

  return {
    ok: true,
    message: `${processed} musteri satiri islendi.`,
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
