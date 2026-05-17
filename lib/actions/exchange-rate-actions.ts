"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import type { ActionResult } from "@/types/actions";

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;

const rateSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  usdTryRate: z.number().positive("USD/TRY kuru pozitif olmalıdır."),
  rmbUsdRate: z.number().positive("RMB/USD kuru pozitif olmalıdır.").nullable().optional(),
  note: z.string().trim().max(300).optional().or(z.literal("")),
});

export type ExchangeRateFormValues = z.infer<typeof rateSchema>;

export async function upsertExchangeRateAction(
  values: ExchangeRateFormValues,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.EXCHANGE_RATES_MANAGE))) return PERM_DENIED;

  const parsed = rateSchema.safeParse(values);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Geçersiz form verisi." };

  try {
    const existing = await prisma.monthlyExchangeRate.findUnique({
      where: { year_month: { year: parsed.data.year, month: parsed.data.month } },
    });

    const noteValue = parsed.data.note && parsed.data.note.trim() !== "" ? parsed.data.note.trim() : null;
    const rmbUsdRateValue = parsed.data.rmbUsdRate ?? null;

    if (existing) {
      await prisma.monthlyExchangeRate.update({
        where: { id: existing.id },
        data: {
          usdTryRate: parsed.data.usdTryRate,
          rmbUsdRate: rmbUsdRateValue,
          note: noteValue,
          updatedAt: new Date(),
        },
      });
    } else {
      await prisma.monthlyExchangeRate.create({
        data: {
          id: crypto.randomUUID(),
          year: parsed.data.year,
          month: parsed.data.month,
          usdTryRate: parsed.data.usdTryRate,
          rmbUsdRate: rmbUsdRateValue,
          note: noteValue,
        },
      });
    }
    return { ok: true };
  } catch (err) {
    console.error("[exchange-rate-actions] upsert:", err);
    return { ok: false, message: "Döviz kuru kaydedilemedi." };
  }
}

export async function deleteExchangeRateAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.EXCHANGE_RATES_MANAGE))) return PERM_DENIED;

  try {
    await prisma.monthlyExchangeRate.delete({ where: { id } });
    return { ok: true };
  } catch {
    return { ok: false, message: "Kayıt silinemedi." };
  }
}

/** Utility: look up USD/TRY rate for a given epoch-ms timestamp. Returns null if not found. */
export async function getExchangeRateForDate(epochMs: number): Promise<number | null> {
  const d = new Date(epochMs);
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1-indexed

  const row = await prisma.monthlyExchangeRate.findUnique({
    where: { year_month: { year, month } },
  });
  if (!row) return null;
  return Number(row.usdTryRate);
}

/** Utility: get the most recent RMB/USD rate, or null if none entered. */
export async function getLatestRmbUsdRate(): Promise<number | null> {
  const row = await prisma.monthlyExchangeRate.findFirst({
    where: { rmbUsdRate: { not: null } },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  if (!row || row.rmbUsdRate == null) return null;
  return Number(row.rmbUsdRate);
}
