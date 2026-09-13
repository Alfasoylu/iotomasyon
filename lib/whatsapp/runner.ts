/**
 * Zamanlanmış mesajların gönderilmesi ve cevapların soruya bağlanması.
 *
 * Buradaki iki işlem de "en fazla bir kez" olmak zorunda: her fazladan mesaj
 * ayrıca ücretlendirilir ve alıcıyı rahatsız eder. Mükerrer freni
 * `lastRunOn` damgasıdır (bkz. schedule.ts) ve gönderimden ÖNCE atılır.
 */

import { prisma } from "@/lib/prisma";
import { sendTemplate, sendText, whatsappConfigured } from "./client";
import { windowOpen } from "./phone";
import { dueReason, localNow, replyMatchCutoff, type DueReason } from "./schedule";

export type RunReport = {
  /** Değerlendirilen aktif görev sayısı. */
  bakilan: number;
  calistirilan: number;
  gonderilen: number;
  basarisiz: Array<{ gorev: string; kisi: string; sebep: string }>;
  atlanan: Array<{ gorev: string; sebep: DueReason }>;
  yapilandirilmadi?: boolean;
};

/**
 * Zamanı gelen görevleri çalıştırır.
 *
 * Damga gönderimden ÖNCE atılır: gönderim yarısında çökersek bazı kişilere
 * mesaj gitmiş olur; damga atılmamış olsaydı bir sonraki çağrıda HERKESE
 * yeniden giderdi. Eksik gönderim (loglanır, görünür) mükerrer gönderimden
 * iyidir — mükerrer olan hem ücretli hem güven kırıcıdır.
 */
export async function runDueSchedules(now: Date = new Date()): Promise<RunReport> {
  const rapor: RunReport = {
    bakilan: 0, calistirilan: 0, gonderilen: 0, basarisiz: [], atlanan: [],
  };

  if (!whatsappConfigured()) {
    rapor.yapilandirilmadi = true;
    return rapor;
  }

  const yerel = localNow(now);
  const gorevler = await prisma.whatsAppSchedule.findMany({
    where: { isActive: true },
    include: { recipients: { include: { contact: true } } },
  });
  rapor.bakilan = gorevler.length;

  for (const g of gorevler) {
    const sebep = dueReason(g, yerel);
    if (sebep !== "gonderilecek") {
      rapor.atlanan.push({ gorev: g.name, sebep });
      continue;
    }

    await prisma.whatsAppSchedule.update({
      where: { id: g.id },
      data: { lastRunOn: yerel.date, lastRunAt: now },
    });
    rapor.calistirilan++;

    for (const { contact } of g.recipients) {
      if (!contact.isActive) continue;

      const sonuc = g.templateName
        ? await sendTemplate(contact.phone, g.templateName, g.templateParams, g.templateLang ?? undefined)
        : await sendText(contact.phone, g.body, windowOpen(contact.lastInboundAt, now));

      await prisma.whatsAppMessage.create({
        data: {
          contactId: contact.id,
          direction: "OUT",
          scheduleId: g.id,
          templateName: g.templateName,
          body: g.body,
          waMessageId: sonuc.ok ? (sonuc.waMessageId ?? null) : null,
          status: sonuc.ok ? "sent" : "failed",
          error: sonuc.ok ? null : `${sonuc.reason}${sonuc.detail ? " — " + sonuc.detail : ""}`,
          // Cevap yalnız GÖNDERİLEBİLEN mesaj için beklenir. Gönderilemeyen
          // mesajı "cevap bekliyor" saymak, olmayan bir soruyu cevapsız
          // göstererek listeyi çöpe çevirirdi.
          awaitingReply: sonuc.ok && g.expectsReply,
        },
      });

      if (sonuc.ok) rapor.gonderilen++;
      else rapor.basarisiz.push({
        gorev: g.name,
        kisi: contact.name,
        sebep: `${sonuc.reason}${sonuc.detail ? " — " + sonuc.detail : ""}`,
      });
    }
  }

  return rapor;
}

/**
 * Gelen mesajı, cevapsız bekleyen SON soruya bağlar.
 *
 * Neden "son": aynı kişiye iki soru sorulmuşsa insan genelde en sonuncuyu
 * cevaplar. Yanlış eşleşme riski var ama bağlamamak kesin kayıp — kullanıcının
 * istediği tam olarak "cevabını iotomasyon üzerinden takip etmek".
 *
 * `replyToId` TEKİL olduğu için bir soruya yalnız bir cevap bağlanır; ikinci
 * gelen mesaj bir sonraki bekleyen soruya gider ya da bağsız kalır.
 */
export async function linkReply(
  contactId: string,
  inboundMessageId: string,
  now: Date = new Date()
): Promise<string | null> {
  const soru = await prisma.whatsAppMessage.findFirst({
    where: {
      contactId,
      direction: "OUT",
      awaitingReply: true,
      createdAt: { gte: replyMatchCutoff(now) },
      reply: null,
    },
    orderBy: { createdAt: "desc" },
  });
  if (!soru) return null;

  // Tek transaction: cevabın bağı ile sorunun "artık beklemiyor" işareti
  // birlikte yazılır. Ayrı yazılsa, arada bir hata soruyu sonsuza dek
  // "cevap bekliyor" listesinde bırakırdı.
  await prisma.$transaction([
    prisma.whatsAppMessage.update({
      where: { id: inboundMessageId },
      data: { replyToId: soru.id },
    }),
    prisma.whatsAppMessage.update({
      where: { id: soru.id },
      data: { awaitingReply: false },
    }),
  ]);
  return soru.id;
}
