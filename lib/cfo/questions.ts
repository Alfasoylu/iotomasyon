/**
 * CFO soru defteri + not defteri sabitleri.
 *
 * Ayrı dosyada çünkü `"use server"` modüllerinden SADECE async fonksiyon export
 * edilebilir — sabit export etmek build'i kırıyor (27.08.2026'da bu hata alındı).
 *
 * NOT: 27.08.2026'ya kadar burada MAX_OPEN_QUESTIONS = 20 vardı ve açık soru
 * sayısı dolduğunda CFO yeni soru ekleyemiyordu. Alperen'in kararıyla limit
 * KALDIRILDI: soru sayısı serbest, disiplin öncelik sıralamasıyla sağlanıyor
 * (priority 1 en üstte). Limit yerine kural: cevaplanan bilgi Not Defteri'ne
 * yazılır ve aynı şey bir daha sorulmaz.
 */

export const QUESTION_AREAS = [
  "nakit", "marj", "stok", "siparis", "gumruk", "urun", "banka", "seo", "diger",
] as const;

/** Not defteri kategorileri — sorulardan farklı olarak "kural" da var. */
export const NOTE_CATEGORIES = [
  "nakit", "marj", "stok", "siparis", "gumruk", "urun", "banka", "seo", "kural", "diger",
] as const;

/**
 * Veri güvenilirlik etiketi. "Rakam uydurma" kuralının defterdeki karşılığı:
 * her bilginin ne kadar sağlam olduğu yanında yazar.
 */
export const NOTE_TAGS = ["KESIN", "TAHMINI", "ESKI", "TEYIT_EDILMELI"] as const;

export const NOTE_TAG_TR: Record<string, string> = {
  KESIN: "Kesin",
  TAHMINI: "Tahmini",
  ESKI: "Eski",
  TEYIT_EDILMELI: "Teyit edilmeli",
};

export const CATEGORY_TR: Record<string, string> = {
  nakit: "Nakit", marj: "Marj", stok: "Stok", siparis: "Sipariş",
  gumruk: "Gümrük", urun: "Ürün", banka: "Banka", seo: "SEO",
  kural: "Kural", diger: "Diğer",
};
