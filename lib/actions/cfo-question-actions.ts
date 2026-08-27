"use server";

/**
 * CFO Soru-Cevap — server actions.
 *
 * Neden var: CFO'nun her sabah sohbetten soru sorması, cevapların sohbet geçmişinde
 * kalması ve bir sonraki oturumda kaybolması demekti. Sorular artık burada durur,
 * cevaplar veritabanında kalıcı olur.
 *
 * Kural: aynı anda en fazla MAX_OPEN açık soru. Liste doluysa yeni soru eklenemez —
 * önce mevcutlar cevaplanmalı. Bu, soru enflasyonunu ve "cevaplanmayan 50 soru"
 * çöplüğünü engeller.
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import type { ActionResult } from "@/types/actions";
import { MAX_OPEN_QUESTIONS } from "@/lib/cfo/questions";

const BUCKET = "cfo-files";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function revalidateQ() {
  revalidatePath("/cfo/sorular");
  revalidatePath("/cfo");
}

async function guardWrite() {
  const user = await requireUser();
  return (await checkPermission(user, PERMISSIONS.CFO_WRITE)) ? user : null;
}

/** Açık soru sayısı — limit kontrolü ve rozet için. */
export async function openQuestionCount(): Promise<number> {
  return prisma.cfoQuestion.count({ where: { status: "ACIK" } });
}

/** Soru sorar (CFO tarafı). Limit dolu ise reddeder. */
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

  const open = await openQuestionCount();
  if (open >= MAX_OPEN_QUESTIONS) {
    return {
      ok: false,
      message: `Açık soru limiti dolu (${MAX_OPEN_QUESTIONS}). Yeni soru eklemeden önce mevcut sorular cevaplanmalı.`,
    };
  }

  await prisma.cfoQuestion.create({
    data: {
      question: q,
      why: input.why?.trim() || null,
      area: input.area?.trim() || "diger",
      priority: Math.min(5, Math.max(1, input.priority ?? 3)),
    },
  });

  revalidateQ();
  return { ok: true, message: `Soru eklendi. Açık soru: ${open + 1}/${MAX_OPEN_QUESTIONS}` };
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

  const uploaded: Array<{ url: string; fileName: string; mimeType: string; sizeBytes: number }> = [];
  const failures: string[] = [];

  if (files.length > 0) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      // Depolama yapilandirilmamis olabilir. Bu durumda dosyalar eklenemez AMA
      // cevap metni YINE DE kaydedilir. Kullanicinin yazdigi cevabi bir ortam
      // degiskeni eksikligi yuzunden cope atmak kabul edilemez (27.08.2026 hatasi).
      failures.push(
        "Depolama yapılandırması eksik (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) — dosyalar eklenemedi.",
      );
    } else {
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) {
          failures.push(`"${file.name}" 10 MB sınırını aşıyor.`);
          continue;
        }
        const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
        const path = `${id}/${Date.now()}_${safe}`;
        try {
          const res = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${path}`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              "Content-Type": file.type || "application/octet-stream",
              "x-upsert": "false",
            },
            body: Buffer.from(await file.arrayBuffer()),
          });
          if (!res.ok) {
            const body = await res.text().catch(() => "");
            failures.push(`"${file.name}" yüklenemedi (${res.status}): ${body.slice(0, 120)}`);
            continue;
          }
        } catch (err) {
          failures.push(
            `"${file.name}" yüklenemedi: ${err instanceof Error ? err.message : "bilinmeyen hata"}`,
          );
          continue;
        }
        uploaded.push({
          url: `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`,
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

  await prisma.$transaction(async (tx) => {
    await tx.cfoQuestion.update({
      where: { id },
      data: {
        answer: answer || existing.answer,
        answeredAt: new Date(),
        answeredBy: user.email ?? user.name ?? "kullanıcı",
        status: "CEVAPLANDI",
        // Yeniden cevaplanırsa CFO'nun tekrar işlemesi gerekir.
        processedAt: null,
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
  });

  revalidateQ();
  if (failures.length > 0) {
    return {
      ok: true,
      message: `Cevap metni kaydedildi, ancak dosyalar eklenemedi. ${failures.join(" ")}`,
    };
  }
  return { ok: true, message: "Cevap kaydedildi." };
}

/** CFO cevabı işledi — deftere/hesaba yansıdı. */
export async function markQuestionProcessedAction(id: string, note?: string): Promise<ActionResult> {
  const user = await guardWrite();
  if (!user) return { ok: false, message: "Bu işlem için yetkiniz yok." };
  await prisma.cfoQuestion.update({
    where: { id },
    data: { processedAt: new Date(), processNote: note?.trim() || null },
  });
  revalidateQ();
  return { ok: true, message: "İşlendi olarak işaretlendi." };
}

/** Soruyu iptal eder (artık gereksiz). Limitten düşer. */
export async function cancelQuestionAction(id: string): Promise<ActionResult> {
  const user = await guardWrite();
  if (!user) return { ok: false, message: "Bu işlem için yetkiniz yok." };
  await prisma.cfoQuestion.update({ where: { id }, data: { status: "IPTAL" } });
  revalidateQ();
  return { ok: true, message: "Soru iptal edildi." };
}
