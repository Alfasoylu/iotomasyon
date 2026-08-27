/**
 * CFO soru defteri sabitleri.
 *
 * Ayrı dosyada çünkü `"use server"` modüllerinden SADECE async fonksiyon export
 * edilebilir — sabit export etmek build'i kırıyor (27.08.2026'da bu hata alındı).
 */

/** Aynı anda tutulabilecek en fazla AÇIK soru. Dolduğunda CFO yeni soru ekleyemez. */
export const MAX_OPEN_QUESTIONS = 20;

export const QUESTION_AREAS = [
  "nakit", "marj", "stok", "siparis", "gumruk", "urun", "banka", "seo", "diger",
] as const;
