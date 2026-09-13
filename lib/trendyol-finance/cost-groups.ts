/**
 * Faz 91 — Trendyol fatura tipi → gider grubu eşlemesi.
 *
 * Trendyol'un "Fatura Tipi" alanı serbest metin ve zaman içinde büyüyor
 * (elimizdeki 2 yıllık dökümde 41 farklı değer var: "Kargo Fatura",
 * "Kargo Faturası", "AZ-Platform Hizmet Bedeli", "AZ - Platform Hizmet
 * Bedeli" gibi neredeyse aynı ama birebir tutmayan varyantlar dahil).
 *
 * Bu yüzden tipi enum'a çevirmiyoruz — orijinal metni saklayıp raporlama için
 * anahtar kelimeyle **gider grubuna** indirgiyoruz. Yeni bir tip çıktığında
 * kod değişmeden DIGER'e düşer, rapor bozulmaz.
 */

import { TrendyolCostGroup } from "@prisma/client";

/** Türkçe karakterleri katlayıp küçük harfe indirger (eşleme için). */
export function fold(s: string): string {
  return s
    .replace(/[İIı]/g, "i")
    .replace(/[Şş]/g, "s")
    .replace(/[Ğğ]/g, "g")
    .replace(/[Üü]/g, "u")
    .replace(/[Öö]/g, "o")
    .replace(/[Çç]/g, "c")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Sıra önemlidir — ilk eşleşen kazanır.
 * Örn. "Komisyonlu İnfluencer Reklam Bedeli" hem "reklam" hem "komisyon"
 * içerir; reklam kuralı önce geldiği için REKLAM'a düşer.
 */
const RULES: Array<{ group: TrendyolCostGroup; keywords: string[] }> = [
  { group: TrendyolCostGroup.REKLAM, keywords: ["reklam", "musteri duyurulari"] },
  { group: TrendyolCostGroup.KARGO, keywords: ["kargo"] },
  { group: TrendyolCostGroup.KOMISYON, keywords: ["komisyon"] },
  {
    group: TrendyolCostGroup.CEZA,
    keywords: [
      "kusurlu", "eksik", "yanlis", "termin gecikme", "tedarik edememe",
      "tedarik edilemeyen", "tazmin", "fiyat-etiket", "ceza",
    ],
  },
  { group: TrendyolCostGroup.KAMPANYA, keywords: ["kampanya", "promosyon"] },
  { group: TrendyolCostGroup.ERKEN_ODEME, keywords: ["erken odeme"] },
  {
    group: TrendyolCostGroup.HIZMET,
    keywords: [
      "platform hizmet", "uluslararasi hizmet", "yurtdisi operasyon",
      "islem bedeli", "hizmet bedeli", "mikro ihracat", "iade bedeli",
    ],
  },
];

/**
 * Fatura tipini gider grubuna indirger.
 *
 * `amountTry` verilir ve pozitifse (bizim lehimize kesilen tedarikçi faturası)
 * grup daima IADE_ALACAK olur — tip metni ne derse desin. Gider raporunda
 * bu kalemler maliyet gibi görünmemeli.
 */
export function resolveCostGroup(invoiceType: string, amountTry?: number | null): TrendyolCostGroup {
  if (amountTry != null && amountTry > 0) return TrendyolCostGroup.IADE_ALACAK;

  const t = fold(invoiceType);
  for (const rule of RULES) {
    if (rule.keywords.some((k) => t.includes(k))) return rule.group;
  }
  return TrendyolCostGroup.DIGER;
}

export const COST_GROUP_LABEL: Record<TrendyolCostGroup, string> = {
  KOMISYON: "Komisyon",
  KARGO: "Kargo",
  HIZMET: "Platform & hizmet",
  REKLAM: "Reklam",
  CEZA: "Ceza & tazmin",
  KAMPANYA: "Kampanya katkısı",
  ERKEN_ODEME: "Erken ödeme",
  IADE_ALACAK: "Lehimize iade",
  DIGER: "Diğer",
};

/** Grafik/rozet rengi — globals.css değişkenleriyle uyumlu. */
export const COST_GROUP_COLOR: Record<TrendyolCostGroup, string> = {
  KOMISYON: "#6366f1",
  KARGO: "#0ea5e9",
  HIZMET: "#14b8a6",
  REKLAM: "#f59e0b",
  CEZA: "#ef4444",
  KAMPANYA: "#a855f7",
  ERKEN_ODEME: "#84cc16",
  IADE_ALACAK: "#22c55e",
  DIGER: "#94a3b8",
};

/** Raporlarda sabit sıra — en büyük kalemden en küçüğe doğru okunur. */
export const COST_GROUP_ORDER: TrendyolCostGroup[] = [
  TrendyolCostGroup.KOMISYON,
  TrendyolCostGroup.KARGO,
  TrendyolCostGroup.HIZMET,
  TrendyolCostGroup.REKLAM,
  TrendyolCostGroup.CEZA,
  TrendyolCostGroup.KAMPANYA,
  TrendyolCostGroup.ERKEN_ODEME,
  TrendyolCostGroup.DIGER,
  TrendyolCostGroup.IADE_ALACAK,
];
