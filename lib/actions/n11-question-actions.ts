"use server";

// N11 müşteri sorusu yanıtı (SOAP SaveProductAnswer) — Trendyol yanıtıyla aynı kapı: marketplaceQuestions.answer izni + her deneme
// (hata dahil) MarketplaceQuestionActionLog'a platform "N11" ile yazılır. N11'de soru başına yalnız bir yanıt verilebilir.
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { answerQuestion, n11Config } from "@/lib/n11/client";
import type { ActionResult } from "@/types/actions";

const answerSchema = z.object({
  questionId: z.string().regex(/^\d{1,20}$/, "Geçersiz soru."),
  text: z.string().trim().min(10, "Cevap en az 10 karakter olmalıdır.").max(2000, "Cevap en fazla 2000 karakter olabilir."),
});

export async function answerN11QuestionAction(values: { questionId: string; text: string }): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.MARKETPLACE_QUESTIONS_ANSWER))) return { ok: false, message: "Bu işlem için yetkiniz yok." };
  const parsed = answerSchema.safeParse(values);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Geçersiz form verisi." };
  const cfg = n11Config();
  if (!cfg) return { ok: false, message: "N11 API anahtarları tanımlı değil (N11_APP_KEY / N11_APP_SECRET)." };

  let errorMessage: string | null = null;
  try { await answerQuestion(cfg, parsed.data.questionId, parsed.data.text); }
  catch (err) { errorMessage = err instanceof Error ? err.message : "Bilinmeyen hata"; }

  await prisma.marketplaceQuestionActionLog.create({
    data: { id: crypto.randomUUID(), platform: "N11", questionId: parsed.data.questionId, actionType: "ANSWERED", answerText: parsed.data.text,
      userId: user.id, responseStatus: errorMessage ? "ERROR" : "SUCCESS", errorMessage },
  });
  return errorMessage ? { ok: false, message: `N11'e gönderilemedi: ${errorMessage}` } : { ok: true };
}
