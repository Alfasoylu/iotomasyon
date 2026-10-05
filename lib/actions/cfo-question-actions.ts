"use server";

/**
 * CFO Soru-Cevap — server actions.
 *
 * Neden var: CFO'nun her sabah sohbetten soru sorması, cevapların sohbet geçmişinde
 * kalması ve bir sonraki oturumda kaybolması demekti. Sorular artık burada durur,
 * cevaplar veritabanında kalıcı olur.
 *
 * Soru sayısında LİMİT YOKTUR (27.08.2026, Alperen kararı). Önceden 20 açık soru
 * sınırı vardı; kaldırıldı. Disiplin artık iki yerden geliyor:
 *   1) priority — en önemli soru en üstte, liste uzasa da sıra bozulmuyor,
 *   2) Not Defteri (cfo_note) — cevaplanan bilgi kalıcı nota dönüşür, aynı şey
 *      bir daha sorulmaz.
 */

import { scheduleCfoCycle } from "@/lib/cfo-agent/workflow-trigger";
import { applyCostAnswer } from "@/lib/cfo-agent/cost-answer";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import type { ActionResult } from "@/types/actions";
import { getStorageConfig } from "@/lib/storage/supabase-storage";

import { uploadPrivateCfoFile } from "@/lib/cfo-agent/private-files";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function revalidateQ() {
  revalidatePath("/cfo/sorular");
  revalidatePath("/cfo");
  revalidatePath("/cfo/kazananlar");
  revalidatePath("/cfo/calisan");
  revalidatePath("/cfo/defter");
}

async function guardWrite() {
  const user = await requireUser();
  return (await checkPermission(user, PERMISSIONS.CFO_WRITE)) ? user : null;
}

/** Açık soru sayısı — rozet için. Limit kontrolü YOK. */
export async function openQuestionCount(): Promise<number> {
  return prisma.cfoQuestion.count({ where: { status: "ACIK" } });
}

/** Soru sorar (CFO tarafı). Adet limiti yok; sıralamayı priority belirler. */
export async function askQuestionAction(input: {
  question: string;
  why?: string | null;
  area?: string;
  priority?: number;
}): Promise<ActionResult> {
  const user = await guardWrite();
  if (!user) return { ok: false, message: "Bu işlem için yetkiniz yok." };

  const q = input.question.trim();
  if (q.length < 5) return { ok: false, message: "Soru çok kısa." };

  await prisma.cfoQuestion.create({
    data: {
      question: q,
      why: input.why?.trim() || null,
      area: input.area?.trim() || "diger",
      priority: Math.min(5, Math.max(1, input.priority ?? 3)),
    },
  });

  revalidateQ();
  const open = await openQuestionCount();
  return { ok: true, message: `Soru eklendi. Açık soru: ${open}` };
}

/** Cevaplar (Alperen tarafı). Metin ve/veya dosya. */
export async function answerQuestionAction(formData: FormData): Promise<ActionResult> {
  const user = await guardWrite();
  if (!user) return { ok: false, message: "Bu işlem için yetkiniz yok." };

  const id = String(formData.get("questionId") ?? "");
  const answer = String(formData.get("answer") ?? "").trim();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

  if (!id) return { ok: false, message: "Soru bulunamadı." };
  if (!answer && files.length === 0) {
    return { ok: false, message: "Cevap metni yazın veya dosya ekleyin." };
  }

  const existing = await prisma.cfoQuestion.findUnique({ where: { id } });
  if (!existing) return { ok: false, message: "Soru bulunamadı." };

  // scope/entity_key/code Prisma şemasında yok (CFO'nun tabloya elle eklediği
  // kolonlar) — bkz. lib/cfo-agent/workflow.ts'teki aynı to_jsonb deseni.
  const [identity] = await prisma.$queryRawUnsafe<{ entity_key: string | null; code: string | null }[]>(
    `select to_jsonb(q)->>'entity_key' as entity_key, to_jsonb(q)->>'code' as code from cfo_question q where id=$1`,
    id
  );

  const uploaded: Array<{ url: string; fileName: string; mimeType: string; sizeBytes: number }> = [];
  const failures: string[] = [];

  if (files.length > 0) {
    const storage = getStorageConfig();

    if (!storage.ok) {
      // Depolama kullanilamiyor. Dosyalar eklenemez AMA cevap metni YINE DE
      // kaydedilir. Kullanicinin yazdigi cevabi bir yapilandirma hatasi
      // yuzunden cope atmak kabul edilemez (27.08.2026 hatasi).
      failures.push(storage.reason);
    } else {
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) {
          failures.push(`"${file.name}" 10 MB sınırını aşıyor.`);
          continue;
        }
        const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
        const path = `${id}/${Date.now()}_${safe}`;
        const res = await uploadPrivateCfoFile(storage.config, path, file);
        if (!res.ok) {
          failures.push(`"${file.name}" yüklenemedi: ${res.reason}`);
          continue;
        }
        uploaded.push({
          url: res.privateRef,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        });
      }
    }
  }

  // Metin de yok, basarili yukleme de yoksa kaydedilecek bir sey kalmaz.
  if (!answer && uploaded.length === 0) {
    return {
      ok: false,
      message: ["Kaydedilecek bir şey yok.", ...failures].join(" "),
    };
  }

  const costResult = await prisma.$transaction(async (tx) => {
    await tx.cfoQuestion.update({
      where: { id },
      data: {
        ...(answer ? {answer} : {}),
        answeredAt: new Date(),
        answeredBy: user.email ?? user.name ?? "kullanıcı",
        status: "CEVAPLANDI",
        // Yeniden cevaplanırsa CFO'nun tekrar işlemesi gerekir.
        processedAt: null,
        processNote: null,
      },
    });
    if (uploaded.length > 0) {
      await tx.cfoQuestionFile.createMany({
        data: uploaded.map((u) => ({ questionId: id, ...u })),
      });
    }
    await tx.cfoChangeLog.create({
      data: {
        area: "soru",
        item: existing.question.slice(0, 120),
        oldValue: existing.answer ?? "(cevapsız)",
        newValue: (answer || "(sadece dosya)") + (uploaded.length ? ` [+${uploaded.length} dosya]` : ""),
        source: user.email ?? "kullanıcı",
        note:
          "CFO Sorular sayfasından cevaplandı." +
          (failures.length ? ` | EKLENEMEYEN DOSYALAR: ${failures.join(" ")}` : ""),
      },
    });
    // Maliyet sorusuna net bir TL cevabı geldiyse Product.unitCostTry'a yazar.
    // Belirsizlikte (başka para birimi, çoklu rakam, SKU bulunamadı, maliyet
    // zaten doluysa) hiçbir şey yapmaz — soru insan incelemesine açık kalır.
    if (!answer) return null;
    return applyCostAnswer(
      tx,
      { id, entityKey: identity?.entity_key ?? null, code: identity?.code ?? null },
      answer,
      { email: user.email, name: user.name }
    );
  });

  scheduleCfoCycle("question_answer");
  revalidateQ();
  const costNote = costResult?.applied
    ? ` ${costResult.sku} birim maliyeti ${costResult.amountTry} TL olarak otomatik yazıldı.`
    : "";
  if (failures.length > 0) {
    return {
      ok: true,
      message: `Cevap metni kaydedildi, ancak dosyalar eklenemedi. ${failures.join(" ")}${costNote}`,
    };
  }
  return { ok: true, message: `Cevap kaydedildi.${costNote}` };
}

/** CFO cevabı işledi — deftere/hesaba yansıdı. */
export async function markQuestionProcessedAction(id: string, note?: string): Promise<ActionResult> {
  const user = await guardWrite();
  if (!user) return { ok: false, message: "Bu işlem için yetkiniz yok." };
  await prisma.cfoQuestion.update({
    where: { id },
    data: { processedAt: new Date(), processNote: note?.trim() || null },
  });
  scheduleCfoCycle("question_processed");
  revalidateQ();
  return { ok: true, message: "İşlendi olarak işaretlendi." };
}

/** Soruyu iptal eder (artık gereksiz). Limitten düşer. */
export async function cancelQuestionAction(id: string): Promise<ActionResult> {
  const user = await guardWrite();
  if (!user) return { ok: false, message: "Bu işlem için yetkiniz yok." };
  await prisma.cfoQuestion.update({ where: { id }, data: { status: "IPTAL" } });
  scheduleCfoCycle("question_cancelled");
  revalidateQ();
  return { ok: true, message: "Soru iptal edildi." };
}
