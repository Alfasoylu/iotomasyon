"use server";

/**
 * Satır bazında soru cevaplama ve ürün kararı.
 *
 * Cevap `cfo_question`'a soru metniyle BİRLİKTE yazılır. Sebep: soru türetilmiş
 * (veritabanında durmuyor); yalnız cevabı saklarsak altı ay sonra "bu cevap neyin
 * cevabıydı" bilinmez. Soru + neden + cevap birlikte kayda geçer.
 *
 * Ürün kararı ayrı tabloda (`cfo_urun_karar`) çünkü o bir cevap değil, süregelen
 * bir talimat: parti değişse de yaşar ve öneri görünümü onu okur.
 *
 * Her iki yazma da `cfo_change_log`'a düşer — CFO kuralı: eski değer silinmez.
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import type { ActionResult } from "@/types/actions";

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;

function revalidateQa() {
  revalidatePath("/cfo/kazananlar");
  revalidatePath("/cfo/sorular");
  revalidatePath("/cfo");
}

async function guardWrite() {
  const user = await requireUser();
  return (await checkPermission(user, PERMISSIONS.CFO_WRITE)) ? user : null;
}

/**
 * `cfo_change_log.kind` ve `.area` DB'de CHECK ile sınırlı. İzinli kind değerleri:
 * bulgu, duzeltme, karar, aksiyon, analiz, teyit, celiski, arastirma, senaryo,
 * onay, model, plan, cfo_oz_elestiri. Buraya listede olmayan bir değer yazmak
 * (ilk sürümde "cevap" yazılmıştı) INSERT'i patlatır.
 */
type LogKind = "teyit" | "karar" | "duzeltme";

async function log(
  user: { email: string | null; name: string | null },
  area: string,
  kind: LogKind,
  item: string,
  oldValue: string,
  newValue: string,
  note: string,
) {
  await prisma.cfoChangeLog.create({
    data: {
      area,
      kind,
      item: item.slice(0, 120),
      oldValue: oldValue.slice(0, 2000),
      newValue: newValue.slice(0, 2000),
      source: user.email ?? user.name ?? "kullanıcı",
      note: note.slice(0, 2000),
    },
  });
}

/** Bir satır sorusunu cevapla. Aynı soru daha önce cevaplandıysa üzerine yazar. */
export async function answerRowQuestionAction(input: {
  scope: string;
  entityKey: string;
  code: string;
  question: string;
  why: string;
  area: string;
  answer: string;
}): Promise<ActionResult> {
  const user = await guardWrite();
  if (!user) return PERM_DENIED;

  const cevap = input.answer.trim();
  if (cevap.length < 2) return { ok: false, message: "Cevap boş olamaz." };

  try {
    const kim = user.email ?? user.name ?? "kullanıcı";

    const [mevcut] = await prisma.$queryRaw<{ id: string; answer: string | null }[]>`
      select id, answer from cfo_question
       where scope = ${input.scope} and entity_key = ${input.entityKey} and code = ${input.code}
       order by "askedAt" desc limit 1`;

    // Tek transaction: log CHECK'e takılırsa cevap da yazılmasın. İlk sürümde
    // ayrı ayrı çalışıyorlardı; log patlayınca cevap KAYDEDİLMİŞ olmasına rağmen
    // kullanıcıya "kaydedilemedi" deniyordu — en kötü hata türü.
    await prisma.$transaction(async (tx) => {
      if (mevcut) {
        // Cevap güncellenirken eskisi log'a geçer; soru metni de tazelenir çünkü
        // türetilmiş sorunun ifadesi veriyle birlikte değişmiş olabilir.
        await tx.$executeRaw`
          update cfo_question
             set answer = ${cevap}, "answeredAt" = now(), "answeredBy" = ${kim},
                 status = 'CEVAPLANDI', question = ${input.question}, why = ${input.why},
                 "processedAt" = null, "processNote" = null
           where id = ${mevcut.id}`;
      } else {
        await tx.$executeRaw`
          insert into cfo_question
            (id, "askedAt", question, why, area, priority, status,
             answer, "answeredAt", "answeredBy", scope, entity_key, code)
          values
            (gen_random_uuid()::text, now(), ${input.question}, ${input.why}, ${input.area}, 2,
             'CEVAPLANDI', ${cevap}, now(), ${kim},
             ${input.scope}, ${input.entityKey}, ${input.code})`;
      }

      await tx.cfoChangeLog.create({
        data: {
          area: input.area,
          kind: "teyit",
          item: `${input.entityKey} · ${input.code}`.slice(0, 120),
          oldValue: (mevcut?.answer ?? "(soru açıktı)").slice(0, 2000),
          newValue: cevap.slice(0, 2000),
          source: kim,
          note: input.question.slice(0, 2000),
        },
      });
    });

    revalidateQa();
    return { ok: true, message: "Cevap kaydedildi." };
  } catch (e) {
    // Sessiz yutma yasak: ilk sürümde gerçek sebep (CHECK ihlali) görünmüyordu
    // ve hatayı bulmak canlı log okumayı gerektirdi.
    console.error("answerRowQuestionAction", input.entityKey, input.code, e);
    return { ok: false, message: "Cevap kaydedilemedi." };
  }
}

/** Ürün için kalıcı ithalat kararı. ALMA = öneriye girmesin. */
export async function setProductDecisionAction(input: {
  sku: string;
  karar: "ALMA" | "AL" | "BEKLE";
  sebep: string;
  gecerliBitis?: string | null;
}): Promise<ActionResult> {
  const user = await guardWrite();
  if (!user) return PERM_DENIED;

  const sebep = input.sebep.trim();
  // Gerekçe zorunlu: karar kadar nedeni de bilgidir. Gerekçesiz karar altı ay
  // sonra "neden almamıştık" sorusunu cevapsız bırakır.
  if (sebep.length < 3) return { ok: false, message: "Gerekçe yazmadan karar kaydedilemez." };
  if (!["ALMA", "AL", "BEKLE"].includes(input.karar)) {
    return { ok: false, message: "Geçersiz karar." };
  }

  try {
    const kim = user.email ?? user.name ?? "kullanıcı";
    const bitis = input.gecerliBitis && input.gecerliBitis.length > 0 ? input.gecerliBitis : null;

    const [eski] = await prisma.$queryRaw<{ karar: string; sebep: string }[]>`
      select karar, sebep from cfo_urun_karar where sku = ${input.sku}`;

    await prisma.$executeRaw`
      insert into cfo_urun_karar (sku, karar, sebep, gecerli_bitis, kaynak, karar_veren, updated_at)
      values (${input.sku}, ${input.karar}, ${sebep}, ${bitis}::date, 'panel', ${kim}, now())
      on conflict (sku) do update
        set karar = excluded.karar, sebep = excluded.sebep,
            gecerli_bitis = excluded.gecerli_bitis, kaynak = excluded.kaynak,
            karar_veren = excluded.karar_veren, updated_at = now()`;

    await log(user, "siparis", "karar", input.sku,
      eski ? `${eski.karar} — ${eski.sebep}` : "(karar yoktu)",
      `${input.karar} — ${sebep}${bitis ? ` (${bitis} tarihine kadar)` : " (süresiz)"}`,
      "Panelden ürün kararı");

    revalidateQa();
    return { ok: true, message: "Karar kaydedildi." };
  } catch (e) {
    console.error("setProductDecisionAction", input.sku, e);
    return { ok: false, message: "Karar kaydedilemedi." };
  }
}

/** Kararı kaldır — ürün tekrar öneriye girsin. */
export async function clearProductDecisionAction(sku: string): Promise<ActionResult> {
  const user = await guardWrite();
  if (!user) return PERM_DENIED;
  try {
    const [eski] = await prisma.$queryRaw<{ karar: string; sebep: string }[]>`
      select karar, sebep from cfo_urun_karar where sku = ${sku}`;
    if (!eski) return { ok: true, message: "Karar zaten yok." };

    await prisma.$executeRaw`delete from cfo_urun_karar where sku = ${sku}`;
    await log(user, "siparis", "karar", sku, `${eski.karar} — ${eski.sebep}`, "(kaldırıldı)",
      "Panelden karar kaldırıldı");

    revalidateQa();
    return { ok: true, message: "Karar kaldırıldı." };
  } catch (e) {
    console.error("clearProductDecisionAction", sku, e);
    return { ok: false, message: "Karar kaldırılamadı." };
  }
}
