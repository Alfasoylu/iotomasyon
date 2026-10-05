import "server-only";

/**
 * MALIYET_YOK sorusuna gelen cevabı Product.unitCostTry'a otomatik yazar.
 *
 * Neden var: CFO-WORKFLOW.md'nin kendi tanımı gereği "Answers are stored as
 * unverified context... does not change product costs" — yani bugüne kadar
 * Alperen bir ürünün maliyetini soru cevabına yazdığında, bunu kataloğa elle
 * taşımak hâlâ insana düşüyordu. Bu dosya o tek, dar ve geri alınabilir adımı
 * kapatır: SORU AÇIKÇA "birim maliyet nedir" (code=MALIYET_YOK), CEVAP tek ve
 * belirsizliksiz bir TL rakamıysa, SKU TEK bir ürüne eşleşiyorsa VE o ürünün
 * maliyeti hâlâ boşsa yaz. Aksi hâlde HİÇBİR ŞEY yapma — soru insan
 * incelemesine açık kalır (bugünkü davranışın aynısı).
 *
 * ⛔ Bilerek yapmadıkları: başka para birimi (USD/RMB/EUR/…) geçen cevaba
 * dokunmaz (RMB/kg ithalat maliyetlendirmesi CFO-GOREV.md §6.1'de ayrı, elle
 * bir akış — burada karıştırılmaz), birden fazla farklı TL rakamı geçen
 * cevaba dokunmaz (hangisi birim maliyet belirsiz), mevcut bir maliyeti ASLA
 * üzerine yazmaz (yanlışlıkla doğru kaydı bozmasın).
 */
import type { Prisma } from "@prisma/client";
import { skuFromEntityKey } from "@/lib/cfo/question-record";
import { skuIndex } from "./sku";

const FOREIGN_CURRENCY = /USD|EUR|RMB|CNY|GBP|[$€¥£]/i;
// Türkçe biçim (1.234,56) VEYA düz ondalık (1234.56 / 1234,56 / 1234) — en fazla
// 2 ondalık basamak; "1.234" gibi tek nokta + 3'lü grup binlik ayıraç sayılır.
const NUMBER = `(\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?|\\d+(?:,\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)`;
const MARKER = `(?:TL|TRY|₺)`;
const TRY_TAGGED = new RegExp(`${MARKER}\\s*${NUMBER}|${NUMBER}\\s*${MARKER}`, "gi");

function turkishNumberToFloat(raw: string): number | null {
  let s = raw.trim();
  if (s.includes(".") && s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Cevapta TAM OLARAK bir TL rakamı varsa onu döner; başka para birimi
 * geçiyorsa ya da birden fazla FARKLI TL rakamı varsa null (belirsiz).
 */
export function parseTryCostAnswer(answer: string): number | null {
  if (FOREIGN_CURRENCY.test(answer)) return null;

  const values = new Set<number>();
  for (const m of answer.matchAll(TRY_TAGGED)) {
    const raw = m[1] ?? m[2];
    if (!raw) continue;
    const n = turkishNumberToFloat(raw);
    if (n != null && n > 0) values.add(Math.round(n * 100) / 100);
  }
  if (values.size !== 1) return null;
  return [...values][0];
}

export interface CostAnswerQuestion {
  id: string;
  entityKey: string | null;
  code: string | null;
}

export interface CostAnswerActor {
  email: string | null;
  name: string | null;
}

export interface CostAnswerResult {
  applied: boolean;
  reason:
    | "ok"
    | "not_cost_question"
    | "no_entity_key"
    | "amount_not_unambiguous_try"
    | "no_sku_in_entity_key"
    | "sku_not_found_or_ambiguous"
    | "cost_already_recorded";
  sku?: string;
  amountTry?: number;
}

/**
 * Çağıran, cevabı KAYDETTİĞİ AYNI transaction içinde çağırmalı — yoksa
 * "cevap kaydedildi ama maliyet yazılmadı" yarım durumu oluşabilir.
 */
export async function applyCostAnswer(
  tx: Prisma.TransactionClient,
  question: CostAnswerQuestion,
  answerText: string,
  actor: CostAnswerActor
): Promise<CostAnswerResult> {
  if (question.code !== "MALIYET_YOK") return { applied: false, reason: "not_cost_question" };
  if (!question.entityKey) return { applied: false, reason: "no_entity_key" };

  const amount = parseTryCostAnswer(answerText);
  if (amount == null) return { applied: false, reason: "amount_not_unambiguous_try" };

  const sku = skuFromEntityKey(question.entityKey);
  if (!sku) return { applied: false, reason: "no_sku_in_entity_key" };

  const products = await tx.product.findMany({
    where: { isActive: true },
    select: { id: true, sku: true, unitCostTry: true },
  });
  const product = skuIndex(products, (p) => p.sku).get(sku);
  if (!product) return { applied: false, reason: "sku_not_found_or_ambiguous" };
  if (product.unitCostTry != null) return { applied: false, reason: "cost_already_recorded" };

  const kim = actor.email ?? actor.name ?? "kullanıcı";
  const tarih = new Date().toISOString().slice(0, 10);

  await tx.product.update({ where: { id: product.id }, data: { unitCostTry: amount } });

  await tx.cfoChangeLog.create({
    data: {
      area: "maliyet",
      kind: "aksiyon",
      item: `${product.sku}: birim maliyet`.slice(0, 120),
      oldValue: "(bilinmiyor)",
      newValue: `${amount} TL`,
      source: kim,
      note: `Soru cevabından otomatik yazıldı (soru: ${question.id}).`,
    },
  });

  await tx.cfoNote.create({
    data: {
      title: `${product.sku} birim maliyet`.slice(0, 200),
      body: `${product.sku} ürününün birim maliyeti ${amount} TL olarak cevaplandı ve Product.unitCostTry'a otomatik yazıldı (${tarih}).`,
      category: "marj",
      dataTag: "KESIN",
      source: "Alperen beyanı (soru cevabı)",
      sourceQuestionId: question.id,
    },
  });

  await tx.cfoQuestion.update({
    where: { id: question.id },
    data: {
      processedAt: new Date(),
      processNote: `Otomatik: ${product.sku} Product.unitCostTry = ${amount} TL olarak yazıldı.`,
    },
  });

  return { applied: true, reason: "ok", sku: product.sku, amountTry: amount };
}
