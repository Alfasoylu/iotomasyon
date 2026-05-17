"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import type { ActionResult } from "@/types/actions";
import { MarketplacePlatform } from "@prisma/client";

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;

const policySchema = z.object({
  platform:             z.nativeEnum(MarketplacePlatform),
  standardShippingTry:  z.coerce.number().min(0).max(9999),
  standardCommissionPct:z.coerce.number().min(0).max(100),
  paymentFeePct:        z.coerce.number().min(0).max(100),
  returnReservePct:     z.coerce.number().min(0).max(100),
  vatPct:               z.coerce.number().min(0).max(100),
  notes:                z.string().trim().max(500).optional().or(z.literal("")),
});

export type PolicyFormValues = z.infer<typeof policySchema>;

export async function upsertPlatformPolicyAction(
  values: PolicyFormValues,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.MARKETPLACE_POLICIES_MANAGE)))
    return PERM_DENIED;

  const parsed = policySchema.safeParse(values);
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Geçersiz form verisi." };

  const {
    platform,
    standardShippingTry,
    standardCommissionPct,
    paymentFeePct,
    returnReservePct,
    vatPct,
    notes,
  } = parsed.data;

  try {
    await prisma.marketplacePlatformPolicy.upsert({
      where: { platform },
      create: {
        id: crypto.randomUUID(),
        platform,
        standardShippingTry,
        standardCommissionPct,
        paymentFeePct,
        returnReservePct,
        vatPct,
        notes: notes || null,
        updatedById: user.id,
      },
      update: {
        standardShippingTry,
        standardCommissionPct,
        paymentFeePct,
        returnReservePct,
        vatPct,
        notes: notes || null,
        updatedById: user.id,
      },
    });
    return { ok: true };
  } catch (err) {
    console.error("[marketplace-policy-actions] upsert:", err);
    return { ok: false, message: "Platform politikası kaydedilemedi." };
  }
}
