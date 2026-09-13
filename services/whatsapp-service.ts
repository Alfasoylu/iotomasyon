/**
 * WhatsApp mesaj merkezi — okuma katmanı.
 *
 * Panelin cevaplaması gereken tek soru şu: "sorduk mu, cevap geldi mi?"
 * Bu yüzden mesaj listesi düz bir akış değil, soru↔cevap eşleşmiş hâlde döner.
 */

import { prisma } from "@/lib/prisma";
import { windowOpen } from "@/lib/whatsapp/phone";

export async function listContacts() {
  const kisiler = await prisma.whatsAppContact.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      _count: { select: { messages: true, schedules: true } },
    },
  });

  return kisiler.map((k) => ({
    ...k,
    /** Serbest metin gönderilebilir mi — şablon gerekip gerekmediğini söyler. */
    pencereAcik: windowOpen(k.lastInboundAt),
  }));
}

export async function listSchedules() {
  return prisma.whatsAppSchedule.findMany({
    orderBy: [{ isActive: "desc" }, { hour: "asc" }, { minute: "asc" }],
    include: {
      recipients: { include: { contact: { select: { id: true, name: true, isActive: true } } } },
      _count: { select: { messages: true } },
    },
  });
}

/**
 * Son mesajlar, cevabıyla birlikte.
 *
 * Yalnız GİDEN mesajlar listelenir ve cevabı içine gömülür; gelen mesajın
 * kendisi ayrıca satır açmaz. Aksi hâlde aynı diyalog iki satır olur ve
 * "cevapsız kalan hangisi" sorusu gözle taranamaz hâle gelirdi.
 * Bir soruya bağlanamamış gelen mesajlar ayrıca döner.
 */
export async function listRecentThreads(limit = 50) {
  const [giden, bagsizGelen] = await Promise.all([
    prisma.whatsAppMessage.findMany({
      where: { direction: "OUT" },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        contact: { select: { id: true, name: true, phone: true } },
        schedule: { select: { id: true, name: true } },
        reply: { select: { id: true, body: true, createdAt: true } },
      },
    }),
    prisma.whatsAppMessage.findMany({
      where: { direction: "IN", replyToId: null },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { contact: { select: { id: true, name: true, phone: true } } },
    }),
  ]);

  return { giden, bagsizGelen };
}

/** Sorulmuş ama cevabı gelmemiş mesajlar — panelin en üstündeki iş listesi. */
export async function listAwaitingReply() {
  return prisma.whatsAppMessage.findMany({
    where: { direction: "OUT", awaitingReply: true },
    orderBy: { createdAt: "asc" },
    include: {
      contact: { select: { id: true, name: true, phone: true } },
      schedule: { select: { id: true, name: true } },
    },
  });
}

export async function getWhatsAppStats() {
  const [kisi, aktifGorev, bekleyen, bugunGiden] = await Promise.all([
    prisma.whatsAppContact.count({ where: { isActive: true } }),
    prisma.whatsAppSchedule.count({ where: { isActive: true } }),
    prisma.whatsAppMessage.count({ where: { direction: "OUT", awaitingReply: true } }),
    prisma.whatsAppMessage.count({
      where: { direction: "OUT", createdAt: { gte: new Date(Date.now() - 86_400_000) } },
    }),
  ]);
  return { kisi, aktifGorev, bekleyen, bugunGiden };
}
