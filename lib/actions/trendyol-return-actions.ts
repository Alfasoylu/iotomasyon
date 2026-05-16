"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { approveTrendyolClaim, createTrendyolClaimIssue } from "@/lib/trendyol-api";
import type { ActionResult } from "@/types/actions";

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;

async function getConfig() {
  return prisma.trendyolConfig.findUnique({ where: { id: "singleton" } });
}

// ── Approve ───────────────────────────────────────────────────────────────────

const approveSchema = z.object({
  claimId: z.string().min(1),
  claimLineItemIds: z.array(z.string().min(1)).min(1, "En az bir kalem seçilmeli."),
});

export async function approveTrendyolClaimAction(
  values: { claimId: string; claimLineItemIds: string[] },
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.MARKETPLACE_RETURNS_ACTION))) return PERM_DENIED;

  const parsed = approveSchema.safeParse(values);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Geçersiz veri." };

  const config = await getConfig();
  if (!config || !config.isEnabled || !config.supplierId || !config.apiKey || !config.apiSecret) {
    return { ok: false, message: "Trendyol API yapılandırması eksik veya pasif." };
  }

  let responseStatus = "SUCCESS";
  let errorMessage: string | undefined;

  try {
    await approveTrendyolClaim(
      { supplierId: config.supplierId, apiKey: config.apiKey, apiSecret: config.apiSecret },
      parsed.data.claimId,
      parsed.data.claimLineItemIds,
    );
  } catch (err) {
    responseStatus = "ERROR";
    errorMessage = err instanceof Error ? err.message : "Bilinmeyen hata";
  }

  await prisma.marketplaceReturnActionLog.create({
    data: {
      id: crypto.randomUUID(),
      platform: "TRENDYOL",
      claimId: parsed.data.claimId,
      claimItemId: parsed.data.claimLineItemIds.join(","),
      actionType: "APPROVE",
      userId: user.id,
      responseStatus,
      errorMessage: errorMessage ?? null,
    },
  });

  if (responseStatus === "ERROR") {
    return { ok: false, message: `İade onaylanamadı: ${errorMessage}` };
  }
  return { ok: true };
}

// ── Create issue (reject/dispute) ─────────────────────────────────────────────

const createIssueSchema = z.object({
  claimId: z.string().min(1),
  claimIssueReasonId: z.number().int().positive("Neden seçilmeli."),
  claimItemIdList: z.string().min(1, "Kalem ID listesi boş olamaz."),
  description: z.string().trim().min(5, "Açıklama en az 5 karakter olmalıdır.").max(500),
});

export async function createTrendyolClaimIssueAction(
  values: {
    claimId: string;
    claimIssueReasonId: number;
    claimItemIdList: string;
    description: string;
  },
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.MARKETPLACE_RETURNS_ACTION))) return PERM_DENIED;

  const parsed = createIssueSchema.safeParse(values);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Geçersiz veri." };

  const config = await getConfig();
  if (!config || !config.isEnabled || !config.supplierId || !config.apiKey || !config.apiSecret) {
    return { ok: false, message: "Trendyol API yapılandırması eksik veya pasif." };
  }

  let responseStatus = "SUCCESS";
  let errorMessage: string | undefined;

  try {
    await createTrendyolClaimIssue(
      { supplierId: config.supplierId, apiKey: config.apiKey, apiSecret: config.apiSecret },
      parsed.data.claimId,
      {
        claimIssueReasonId: parsed.data.claimIssueReasonId,
        claimItemIdList: parsed.data.claimItemIdList,
        description: parsed.data.description,
      },
    );
  } catch (err) {
    responseStatus = "ERROR";
    errorMessage = err instanceof Error ? err.message : "Bilinmeyen hata";
  }

  await prisma.marketplaceReturnActionLog.create({
    data: {
      id: crypto.randomUUID(),
      platform: "TRENDYOL",
      claimId: parsed.data.claimId,
      actionType: "CREATE_ISSUE",
      reasonCode: String(parsed.data.claimIssueReasonId),
      note: parsed.data.description,
      userId: user.id,
      responseStatus,
      errorMessage: errorMessage ?? null,
    },
  });

  if (responseStatus === "ERROR") {
    return { ok: false, message: `İşlem gönderilemedi: ${errorMessage}` };
  }
  return { ok: true };
}
