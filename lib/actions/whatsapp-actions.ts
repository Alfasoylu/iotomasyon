"use server";

import { revalidatePath } from "next/cache";

import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { sendTemplate, sendText, whatsappConfigured } from "@/lib/whatsapp/client";
import { normalizePhone, windowOpen } from "@/lib/whatsapp/phone";
import { runDueSchedules } from "@/lib/whatsapp/runner";
import type { ActionResult } from "@/types/actions";

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;
const SAYFA = "/whatsapp";

// ── Kişiler ──────────────────────────────────────────────────────────────────

export async function saveContactAction(
  id: string | null,
  form: { name: string; phone: string; label: string; isActive: boolean },
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.WHATSAPP_MANAGE))) return PERM_DENIED;

  const name = form.name.trim();
  if (!name) return { ok: false, message: "İsim boş olamaz." };

  // Numara TEK KAYNAKTAN normalleştirilir. Ham hâlde saklamak, aynı kişinin
  // "0532…" ve "+90 532…" diye iki kez kaydedilmesine ve iki mesaj almasına
  // yol açardı; ayrıca Meta yalnız bu biçimi kabul eder.
  const phone = normalizePhone(form.phone);
  if (!phone) {
    return {
      ok: false,
      message: "Numara geçersiz. Ülke koduyla veya 0'lı yerel biçimde yazın (örn. 0532 111 22 33).",
    };
  }

  const data = { name, phone, label: form.label.trim() || null, isActive: form.isActive };

  try {
    if (id) await prisma.whatsAppContact.update({ where: { id }, data });
    else await prisma.whatsAppContact.create({ data });
    revalidatePath(SAYFA);
    return { ok: true };
  } catch (e) {
    // Tekillik ihlali en olası hata ve mesajı net olmalı: "kaydedilemedi"
    // deyip geçmek, kullanıcıyı aynı numarayı tekrar tekrar denemeye iter.
    const mesaj = e instanceof Error && e.message.includes("Unique")
      ? "Bu numara zaten kayıtlı."
      : "Kişi kaydedilemedi.";
    return { ok: false, message: mesaj };
  }
}

export async function deleteContactAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.WHATSAPP_MANAGE))) return PERM_DENIED;

  try {
    // Görev bağları CASCADE DEĞİL (repo kuralı): önce bağlar, sonra kişi —
    // tek transaction'da, yarıda kalırsa ikisi de yazılmasın.
    await prisma.$transaction([
      prisma.whatsAppScheduleRecipient.deleteMany({ where: { contactId: id } }),
      prisma.whatsAppContact.delete({ where: { id } }),
    ]);
    revalidatePath(SAYFA);
    return { ok: true };
  } catch {
    // Mesaj geçmişi olan kişi FK RESTRICT yüzünden silinemez — bu kasıtlı.
    return {
      ok: false,
      message:
        "Mesaj geçmişi olan kişi silinemez (geçmiş korunuyor). Bunun yerine pasife alın.",
    };
  }
}

// ── Zamanlanmış görevler ─────────────────────────────────────────────────────

export async function saveScheduleAction(
  id: string | null,
  form: {
    name: string;
    templateName: string;
    templateLang: string;
    templateParams: string[];
    body: string;
    hour: number;
    minute: number;
    daysOfWeek: number[];
    expectsReply: boolean;
    isActive: boolean;
    contactIds: string[];
  },
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.WHATSAPP_MANAGE))) return PERM_DENIED;

  const name = form.name.trim();
  if (!name) return { ok: false, message: "Görev adı boş olamaz." };
  if (!form.body.trim()) return { ok: false, message: "Mesaj gövdesi boş olamaz." };
  if (!Number.isInteger(form.hour) || form.hour < 0 || form.hour > 23) {
    return { ok: false, message: "Saat 0-23 arasında olmalı." };
  }
  if (!Number.isInteger(form.minute) || form.minute < 0 || form.minute > 59) {
    return { ok: false, message: "Dakika 0-59 arasında olmalı." };
  }
  if (!form.contactIds.length) {
    return { ok: false, message: "En az bir alıcı seçin." };
  }

  const data = {
    name,
    templateName: form.templateName.trim() || null,
    templateLang: form.templateLang.trim() || null,
    templateParams: form.templateParams.filter((p) => p.trim() !== ""),
    body: form.body.trim(),
    hour: form.hour,
    minute: form.minute,
    daysOfWeek: form.daysOfWeek.filter((d) => d >= 0 && d <= 6),
    expectsReply: form.expectsReply,
    isActive: form.isActive,
  };

  try {
    await prisma.$transaction(async (tx) => {
      const gorev = id
        ? await tx.whatsAppSchedule.update({ where: { id }, data })
        : await tx.whatsAppSchedule.create({ data });

      // Alıcı listesi tam olarak forma eşitlenir: eskiler silinir, yeniler
      // yazılır. Fark hesaplamak yerine bu, çünkü listede unutulan bir kişi
      // her gün mesaj almaya devam ederdi.
      await tx.whatsAppScheduleRecipient.deleteMany({ where: { scheduleId: gorev.id } });
      await tx.whatsAppScheduleRecipient.createMany({
        data: form.contactIds.map((contactId) => ({ scheduleId: gorev.id, contactId })),
        skipDuplicates: true,
      });
    });
    revalidatePath(SAYFA);
    return { ok: true };
  } catch {
    return { ok: false, message: "Görev kaydedilemedi." };
  }
}

export async function deleteScheduleAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.WHATSAPP_MANAGE))) return PERM_DENIED;

  try {
    await prisma.$transaction([
      prisma.whatsAppScheduleRecipient.deleteMany({ where: { scheduleId: id } }),
      // Mesajların scheduleId'si SET NULL ile kopar; geçmiş SİLİNMEZ.
      // "O soruyu sormuştuk, cevabı neydi" sorusu cevapsız kalmasın.
      prisma.whatsAppSchedule.delete({ where: { id } }),
    ]);
    revalidatePath(SAYFA);
    return { ok: true };
  } catch {
    return { ok: false, message: "Görev silinemedi." };
  }
}

export async function toggleScheduleAction(id: string, isActive: boolean): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.WHATSAPP_MANAGE))) return PERM_DENIED;

  try {
    await prisma.whatsAppSchedule.update({ where: { id }, data: { isActive } });
    revalidatePath(SAYFA);
    return { ok: true };
  } catch {
    return { ok: false, message: "Görev durumu değiştirilemedi." };
  }
}

// ── Gönderim ─────────────────────────────────────────────────────────────────

/**
 * Tek kişiye elle mesaj. Şablon adı verilirse şablon, verilmezse serbest metin.
 *
 * Serbest metin yalnız 24 saatlik pencere açıkken gider; pencere kapalıyken
 * denemeden reddedilir ve sebep AÇIKÇA yazılır. Denemek Meta tarafında hata
 * üretir, sebebi log'da kaybolur ve kullanıcı mesajın neden gitmediğini bilemez.
 */
export async function sendManualMessageAction(
  contactId: string,
  text: string,
  templateName?: string,
  expectsReply = false,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.WHATSAPP_SEND))) return PERM_DENIED;

  if (!whatsappConfigured()) {
    return {
      ok: false,
      message: "WhatsApp yapılandırılmamış (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID).",
    };
  }
  const govde = text.trim();
  if (!govde && !templateName) return { ok: false, message: "Mesaj boş olamaz." };

  const kisi = await prisma.whatsAppContact.findUnique({ where: { id: contactId } });
  if (!kisi) return { ok: false, message: "Kişi bulunamadı." };
  if (!kisi.isActive) return { ok: false, message: "Pasif kişiye mesaj gönderilmez." };

  const acik = windowOpen(kisi.lastInboundAt);
  if (!templateName && !acik) {
    return {
      ok: false,
      message:
        "Bu kişi son 24 saatte size yazmadı; serbest metin gönderilemez. Onaylı bir şablon seçin.",
    };
  }

  const sonuc = templateName
    ? await sendTemplate(kisi.phone, templateName, [])
    : await sendText(kisi.phone, govde, acik);

  await prisma.whatsAppMessage.create({
    data: {
      contactId: kisi.id,
      direction: "OUT",
      templateName: templateName ?? null,
      body: govde || `[şablon: ${templateName}]`,
      waMessageId: sonuc.ok ? (sonuc.waMessageId ?? null) : null,
      status: sonuc.ok ? "sent" : "failed",
      error: sonuc.ok ? null : `${sonuc.reason}${sonuc.detail ? " — " + sonuc.detail : ""}`,
      awaitingReply: sonuc.ok && expectsReply,
    },
  });

  revalidatePath(SAYFA);
  if (!sonuc.ok) {
    return { ok: false, message: `Gönderilemedi: ${sonuc.reason}${sonuc.detail ? " — " + sonuc.detail : ""}` };
  }
  return { ok: true, message: "Gönderildi." };
}

/**
 * Zamanlanmış görevleri ŞİMDİ çalıştırır (panelden elle tetikleme).
 *
 * Mükerrer freni aynen işler: bugün gönderilmiş bir görev yeniden gitmez.
 * Bu, harici zamanlayıcının kurulup kurulmadığını kanıtlamanın da tek yolu —
 * "görev tanımlı" olması mesajın gittiğini KANITLAMAZ.
 */
export async function runSchedulesNowAction(): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.WHATSAPP_SEND))) return PERM_DENIED;

  try {
    const r = await runDueSchedules();
    revalidatePath(SAYFA);
    if (r.yapilandirilmadi) {
      return { ok: false, message: "WhatsApp yapılandırılmamış — hiçbir mesaj gönderilmedi." };
    }
    if (r.calistirilan === 0) {
      return { ok: true, message: "Zamanı gelen görev yok (bugün gönderilmiş olabilir)." };
    }
    const hata = r.basarisiz.length ? ` ${r.basarisiz.length} gönderim başarısız.` : "";
    return { ok: true, message: `${r.calistirilan} görev çalıştı, ${r.gonderilen} mesaj gitti.${hata}` };
  } catch {
    return { ok: false, message: "Görevler çalıştırılamadı." };
  }
}
