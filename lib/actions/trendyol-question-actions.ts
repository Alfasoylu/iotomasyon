"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { answerTrendyolQuestion } from "@/lib/trendyol-api";
import type { ActionResult } from "@/types/actions";

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;

const answerSchema = z.object({
  questionId: z.string().min(1),
  text: z.string().trim().min(10, "Cevap en az 10 karakter olmalıdır.").max(2000, "Cevap en fazla 2000 karakter olabilir."),
});

/** Load the singleton Trendyol config from DB. */
async function getConfig() {
  return prisma.trendyolConfig.findUnique({ where: { id: "singleton" } });
}

export async function answerTrendyolQuestionAction(
  values: { questionId: string; text: string },
): Promise<ActionResult> {
  const user = await requireUser();

  if (!(await checkPermission(user, PERMISSIONS.MARKETPLACE_QUESTIONS_ANSWER))) {
    return PERM_DENIED;
  }

  const parsed = answerSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Geçersiz form verisi." };
  }

  const config = await getConfig();
  if (!config || !config.isEnabled || !config.supplierId || !config.apiKey || !config.apiSecret) {
    return { ok: false, message: "Trendyol API yapılandırması eksik veya pasif." };
  }

  let responseStatus = "SUCCESS";
  let errorMessage: string | undefined;

  try {
    await answerTrendyolQuestion(
      { supplierId: config.supplierId, apiKey: config.apiKey, apiSecret: config.apiSecret },
      parsed.data.questionId,
      parsed.data.text,
    );
  } catch (err) {
    responseStatus = "ERROR";
    errorMessage = err instanceof Error ? err.message : "Bilinmeyen hata";
  }

  // Audit log — always write, even on error
  await prisma.marketplaceQuestionActionLog.create({
    data: {
      id: crypto.randomUUID(),
      platform: "TRENDYOL",
      questionId: parsed.data.questionId,
      actionType: "ANSWERED",
      answerText: parsed.data.text,
      userId: user.id,
      responseStatus,
      errorMessage: errorMessage ?? null,
    },
  });

  if (responseStatus === "ERROR") {
    return { ok: false, message: `Trendyol'a gönderilemedi: ${errorMessage}` };
  }

  return { ok: true };
}
