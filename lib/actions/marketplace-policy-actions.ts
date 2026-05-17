"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import type { ActionResult } from "@/types/actions";
import { MarketplacePlatform } from "@prisma/client";
import { parseShippingTiers } from "@/lib/marketplace-policy";

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;

const policySchema = z.object({
  platform:              z.nativeEnum(MarketplacePlatform),
  standardShippingTry:   z.coerce.number().min(0).max(9999),
  standardCommissionPct: z.coerce.number().min(0).max(100),
  paymentFeePct:         z.coerce.number().min(0).max(100),
  returnReservePct:      z.coerce.number().min(0).max(100),
  vatPct:                z.coerce.number().min(0).max(100),
  /** Raw JSON string for shipping tiers; validated by parseShippingTiers */
  shippingTiersJson:     z.string().trim().max(2000).optional().or(z.literal("")),
  notes:                 z.string().trim().max(500).optional().or(z.literal("")),
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
    shippingTiersJson,
    notes,
  } = parsed.data;

  // Validate tiers JSON if provided
  const tiersRaw = shippingTiersJson?.trim() || null;
  if (tiersRaw) {
    const tiers = parseShippingTiers(tiersRaw);
    if (tiers.length === 0) {
      return { ok: false, message: "Kargo kademesi JSON formatı hatalı. Örnek: [{\"maxPriceUsd\":5,\"costUsd\":1.2},{\"costUsd\":3.3}]" };
    }
    // Ensure last tier has no maxPriceUsd (catch-all)
    const last = tiers[tiers.length - 1];
    if (last.maxPriceUsd !== undefined) {
      return { ok: false, message: "Son kargo kademesi bir sınır (maxPriceUsd) içermemelidir — tüm fiyatları kapsar." };
    }
  }

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
        shippingTiersJson: tiersRaw,
        notes: notes || null,
        updatedById: user.id,
      },
      update: {
        standardShippingTry,
        standardCommissionPct,
        paymentFeePct,
        returnReservePct,
        vatPct,
        shippingTiersJson: tiersRaw,
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
