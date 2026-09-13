"use server";

/**
 * CFO Not Defteri — server actions.
 *
 * Neden var: soru defteri işlemsel ("şunu sordum, şu cevap geldi"), not defteri
 * kalıcı ("Ziraat kartın aylık faizi %4,50"). Bir cevap yeterliyse ondan çıkan
 * bilgi buraya yazılır ve aynı soru bir daha sorulmaz.
 *
 * Kurallar:
 *  - Bir not GÜNCELLENDİĞİNDE eski değeri cfo_change_log'a yazılır (eski değerleri silme).
 *  - Gereksizleşen not ARŞİVLENİR, silinmez. Gerçek silme sadece yanlışlıkla
 *    açılmış kayıtlar için var ve o da change log'a düşer.
 *  - Her notta dataTag zorunlu: KESIN | TAHMINI | ESKI | TEYIT_EDILMELI.
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import type { ActionResult } from "@/types/actions";

function revalidateN() {
  revalidatePath("/cfo/defter");
  revalidatePath("/cfo/sorular");
  revalidatePath("/cfo");
}

async function guardWrite() {
  const user = await requireUser();
  return (await checkPermission(user, PERMISSIONS.CFO_WRITE)) ? user : null;
}

export type NoteInput = {
  title: string;
  body: string;
  category?: string;
  dataTag?: string;
  source?: string | null;
  sourceQuestionId?: string | null;
  pinned?: boolean;
  reviewBy?: string | null;
};

/** Yeni kalıcı bilgi ekler. */
export async function createNoteAction(input: NoteInput): Promise<ActionResult> {
  const user = await guardWrite();
  if (!user) return { ok: false, message: "Bu işlem için yetkiniz yok." };

  const title = input.title.trim();
  const body = input.body.trim();
  if (title.length < 3) return { ok: false, message: "Başlık çok kısa." };
  if (body.length < 3) return { ok: false, message: "Not içeriği boş olamaz." };

  const note = await prisma.cfoNote.create({
    data: {
      title,
      body,
      category: input.category?.trim() || "diger",
      dataTag: input.dataTag?.trim() || "KESIN",
      source: input.source?.trim() || null,
      sourceQuestionId: input.sourceQuestionId || null,
      pinned: input.pinned ?? false,
      reviewBy: input.reviewBy ? new Date(input.reviewBy) : null,
    },
  });

  await prisma.cfoChangeLog.create({
    data: {
      area: "not",
      item: title.slice(0, 120),
      oldValue: "(yok)",
      newValue: body.slice(0, 400),
      source: user.email ?? "kullanıcı",
      note: "Not Defteri'ne yeni kayıt.",
    },
  });

  revalidateN();
  return { ok: true, message: `Not eklendi: ${note.title}` };
}

/** Notu günceller. Eski gövde change log'a yazılır. */
export async function updateNoteAction(id: string, input: Partial<NoteInput>): Promise<ActionResult> {
  const user = await guardWrite();
  if (!user) return { ok: false, message: "Bu işlem için yetkiniz yok." };

  const existing = await prisma.cfoNote.findUnique({ where: { id } });
  if (!existing) return { ok: false, message: "Not bulunamadı." };

  const nextBody = input.body?.trim() ?? existing.body;
  const nextTitle = input.title?.trim() ?? existing.title;

  await prisma.cfoNote.update({
    where: { id },
    data: {
      title: nextTitle,
      body: nextBody,
      category: input.category?.trim() ?? existing.category,
      dataTag: input.dataTag?.trim() ?? existing.dataTag,
      source: input.source === undefined ? existing.source : input.source?.trim() || null,
      pinned: input.pinned ?? existing.pinned,
      reviewBy:
        input.reviewBy === undefined
          ? existing.reviewBy
          : input.reviewBy
            ? new Date(input.reviewBy)
            : null,
    },
  });

  // Sadece içerik gerçekten değiştiyse log'a yaz — pin/kategori değişimi gürültü yapmasın.
  if (nextBody !== existing.body || nextTitle !== existing.title) {
    await prisma.cfoChangeLog.create({
      data: {
        area: "not",
        item: nextTitle.slice(0, 120),
        oldValue: existing.body.slice(0, 400),
        newValue: nextBody.slice(0, 400),
        source: user.email ?? "kullanıcı",
        note: "Not Defteri kaydı güncellendi.",
      },
    });
  }

  revalidateN();
  return { ok: true, message: "Not güncellendi." };
}

/** Arşivler (listeden kalkar, kayıt durur) veya arşivden çıkarır. */
export async function archiveNoteAction(id: string, archived: boolean): Promise<ActionResult> {
  const user = await guardWrite();
  if (!user) return { ok: false, message: "Bu işlem için yetkiniz yok." };

  const existing = await prisma.cfoNote.findUnique({ where: { id } });
  if (!existing) return { ok: false, message: "Not bulunamadı." };

  await prisma.cfoNote.update({
    where: { id },
    data: { archivedAt: archived ? new Date() : null },
  });

  await prisma.cfoChangeLog.create({
    data: {
      area: "not",
      item: existing.title.slice(0, 120),
      oldValue: existing.archivedAt ? "arşivli" : "aktif",
      newValue: archived ? "arşivli" : "aktif",
      source: user.email ?? "kullanıcı",
      note: archived ? "Not arşivlendi (silinmedi)." : "Not arşivden çıkarıldı.",
    },
  });

  revalidateN();
  return { ok: true, message: archived ? "Not arşivlendi." : "Not geri alındı." };
}

/** Üste sabitler / sabitlemeyi kaldırır. */
export async function pinNoteAction(id: string, pinned: boolean): Promise<ActionResult> {
  const user = await guardWrite();
  if (!user) return { ok: false, message: "Bu işlem için yetkiniz yok." };
  await prisma.cfoNote.update({ where: { id }, data: { pinned } });
  revalidateN();
  return { ok: true, message: pinned ? "Sabitlendi." : "Sabitleme kaldırıldı." };
}
