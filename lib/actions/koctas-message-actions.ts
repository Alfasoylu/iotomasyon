"use server";

// Koçtaş (Mirakl) müşteri mesajı yanıtı (M12) — Trendyol/N11 yanıtlarıyla aynı kapı: marketplaceQuestions.answer izni + her deneme
// (hata dahil) MarketplaceQuestionActionLog'a platform "KOCTAS" ile (questionId = Mirakl konu id). Alıcı: müşteri.
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { koctasConfig, replyToThread } from "@/lib/koctas/client";
import type { ActionResult } from "@/types/actions";

const schema = z.object({
  questionId: z.string().regex(/^[\w-]{1,100}$/, "Geçersiz konu."),
  text: z.string().trim().min(10, "Cevap en az 10 karakter olmalıdır.").max(2000, "Cevap en fazla 2000 karakter olabilir."),
});

export async function answerKoctasMessageAction(values: { questionId: string; text: string }): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.MARKETPLACE_QUESTIONS_ANSWER))) return { ok: false, message: "Bu işlem için yetkiniz yok." };
  const parsed = schema.safeParse(values);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Geçersiz form verisi." };
  let cfg;
  try { cfg = koctasConfig(); } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Yapılandırma hatası" }; }
  if (!cfg) return { ok: false, message: "Koçtaş API anahtarı tanımlı değil (KOCTAS_API_KEY)." };

  let errorMessage: string | null = null;
  try { await replyToThread(cfg, parsed.data.questionId, parsed.data.text, "CUSTOMER"); }
  catch (err) { errorMessage = err instanceof Error ? err.message : "Bilinmeyen hata"; }

  await prisma.marketplaceQuestionActionLog.create({
    data: { id: crypto.randomUUID(), platform: "KOCTAS", questionId: parsed.data.questionId, actionType: "ANSWERED", answerText: parsed.data.text,
      userId: user.id, responseStatus: errorMessage ? "ERROR" : "SUCCESS", errorMessage },
  });
  return errorMessage ? { ok: false, message: `Koçtaş'a gönderilemedi: ${errorMessage}` } : { ok: true };
}
