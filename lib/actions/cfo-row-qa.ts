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

import { ensureRowQuestion, validateRowQuestion, type RowQuestionInput } from "@/lib/cfo/question-record";
import { questionHref } from "@/lib/cfo/question-links";
import type { Prisma } from "@prisma/client";
import { scheduleCfoCycle } from "@/lib/cfo-agent/workflow-trigger";
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
  revalidatePath("/cfo/calisan");
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
  tx: Prisma.TransactionClient,
) {
  await tx.cfoChangeLog.create({
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

/** Explicit owner navigation registers one question; rendering a page never creates a backlog. */
export async function openRowQuestionAction(input:RowQuestionInput){
  const user=await guardWrite();
  if(!user)return PERM_DENIED;
  if(!validateRowQuestion(input)||input.code==='PLAN_NOTU')return {ok:false,message:'Soru bağlantısı geçersiz.'};
  try{
    const row=await prisma.$transaction(async tx=>{
      const q=await ensureRowQuestion({query:(sql,...params)=>tx.$queryRawUnsafe(sql,...params),execute:(sql,...params)=>tx.$executeRawUnsafe(sql,...params)},input);
      if(q.created)await tx.cfoChangeLog.create({data:{area:'soru',kind:'arastirma',item:input.question.slice(0,120),source:user.email??'kullanıcı',note:'Planlayıcı sorusu ortak soru defterine bağlandı.'}});
      return q;
    });
    revalidateQa();
    return {ok:true,href:questionHref(row.id),message:'Sorular sayfasına bağlandı.'};
  }catch{return {ok:false,message:'Soru bağlantısı oluşturulamadı.'};}
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
  if (cevap.length > 8000) return { ok: false, message: "Not en fazla 8000 karakter olabilir." };
  if (cevap.length < 2) return { ok: false, message: "Cevap boş olamaz." };

  try {
    const kim = user.email ?? user.name ?? "kullanıcı";

    await prisma.$transaction(async (tx) => {
      const mevcut=await ensureRowQuestion({query:(sql,...params)=>tx.$queryRawUnsafe(sql,...params),execute:(sql,...params)=>tx.$executeRawUnsafe(sql,...params)},input);
      await tx.cfoQuestion.update({where:{id:mevcut.id},data:{answer:cevap,answeredAt:new Date(),answeredBy:kim,status:'CEVAPLANDI',processedAt:null,processNote:null}});

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

    scheduleCfoCycle("import_row_answer");
    revalidateQa();
    return { ok: true, message: "Cevap kaydedildi. CFO yeniden değerlendirecek." };
  } catch {
    // Sessiz yutma yasak: ilk sürümde gerçek sebep (CHECK ihlali) görünmüyordu
    // ve hatayı bulmak canlı log okumayı gerektirdi.
    console.error("answerRowQuestionAction failed");
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
  if (sebep.length > 2000 || !input.sku.trim() || input.sku.length > 250) return { ok: false, message: "Ürün veya gerekçe geçersiz." };
  if (sebep.length < 3) return { ok: false, message: "Gerekçe yazmadan karar kaydedilemez." };
  if (!["ALMA", "AL", "BEKLE"].includes(input.karar)) {
    return { ok: false, message: "Geçersiz karar." };
  }

  try {
    const kim = user.email ?? user.name ?? "kullanıcı";
    const bitis = input.gecerliBitis && input.gecerliBitis.length > 0 ? input.gecerliBitis : null;

    await prisma.$transaction(async tx=>{
    const [eski] = await tx.$queryRaw<{ karar: string; sebep: string }[]>`
      select karar, sebep from cfo_urun_karar where sku = ${input.sku}`;

    await tx.$executeRaw`
      insert into cfo_urun_karar (sku, karar, sebep, gecerli_bitis, kaynak, karar_veren, updated_at)
      values (${input.sku}, ${input.karar}, ${sebep}, ${bitis}::date, 'panel', ${kim}, now())
      on conflict (sku) do update
        set karar = excluded.karar, sebep = excluded.sebep,
            gecerli_bitis = excluded.gecerli_bitis, kaynak = excluded.kaynak,
            karar_veren = excluded.karar_veren, updated_at = now()`;

    await log(user, "siparis", "karar", input.sku,
      eski ? `${eski.karar} — ${eski.sebep}` : "(karar yoktu)",
      `${input.karar} — ${sebep}${bitis ? ` (${bitis} tarihine kadar)` : " (süresiz)"}`,
      "Panelden ürün kararı", tx);

    });
    scheduleCfoCycle("import_product_decision");
    revalidateQa();
    return { ok: true, message: "Karar kaydedildi." };
  } catch {
    console.error("setProductDecisionAction failed");
    return { ok: false, message: "Karar kaydedilemedi." };
  }
}

/** Kararı kaldır — ürün tekrar öneriye girsin. */
export async function clearProductDecisionAction(sku: string): Promise<ActionResult> {
  const user = await guardWrite();
  if (!user) return PERM_DENIED;
  try {
    await prisma.$transaction(async tx=>{
    const [eski] = await tx.$queryRaw<{ karar: string; sebep: string }[]>`
      select karar, sebep from cfo_urun_karar where sku = ${sku}`;
    if (!eski) return;

    await tx.$executeRaw`delete from cfo_urun_karar where sku = ${sku}`;
    await log(user, "siparis", "karar", sku, `${eski.karar} — ${eski.sebep}`, "(kaldırıldı)",
      "Panelden karar kaldırıldı", tx);

    });
    scheduleCfoCycle("import_decision_cleared");
    revalidateQa();
    return { ok: true, message: "Karar kaldırıldı." };
  } catch {
    console.error("clearProductDecisionAction failed");
    return { ok: false, message: "Karar kaldırılamadı." };
  }
}
