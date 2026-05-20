/**
 * lib/customer-lead-score.ts — Müşteri Lead Skoru
 *
 * 0-100 manşet skor. Sales rep'in "bu müşteri ne kadar sıcak" sorusuna
 * tek bakışta cevap.
 *
 * Formül:
 *   active_interests × 8           (max 40pt)
 * + lifetime_orders × 4             (max 32pt)
 * + (60 - days_since_contact)/3     (yakın temas)
 * + open_quote × 10                 (her açık teklif)
 * + (status == WON) × 15            (kazanılmış müşteri bonus)
 * Clamp 0-100
 */

export interface LeadScoreInput {
  activeInterestsCount: number;   // ProductInterest aktif (NEW/CONTACTED/QUOTED/WAITING)
  lifetimeOrdersCount: number;    // MarketplaceSalesRecord toplam
  daysSinceContact: number | null; // null = hiç temas yok
  openQuoteCount: number;         // Quote status=SENT veya DRAFT
  status: string;                 // CustomerStatus
}

export interface LeadScoreResult {
  score: number;                  // 0-100
  tone: "success" | "info" | "warning" | "neutral";
  label: string;                  // "Sıcak" / "Kaliteli" / "Durağan" / "Soğuk"
  components: {
    interestsScore: number;
    ordersScore: number;
    recencyScore: number;
    quotesScore: number;
    wonBonus: number;
  };
}

export function calcLeadScore(input: LeadScoreInput): LeadScoreResult {
  const interestsScore = Math.min(40, input.activeInterestsCount * 8);
  const ordersScore = Math.min(32, input.lifetimeOrdersCount * 4);
  // Recency: yakın temas = yüksek puan. 0g = 20pt, 60g+ = 0pt
  const recencyScore =
    input.daysSinceContact == null
      ? 0
      : Math.max(0, Math.min(20, (60 - input.daysSinceContact) / 3));
  const quotesScore = Math.min(30, input.openQuoteCount * 10);
  const wonBonus = input.status === "WON" ? 15 : 0;

  const total = Math.round(
    interestsScore + ordersScore + recencyScore + quotesScore + wonBonus,
  );
  const score = Math.max(0, Math.min(100, total));

  const tone: "success" | "info" | "warning" | "neutral" =
    score >= 80 ? "success" :
    score >= 60 ? "info" :
    score >= 40 ? "warning" : "neutral";
  const label =
    score >= 80 ? "Sıcak" :
    score >= 60 ? "Kaliteli" :
    score >= 40 ? "Durağan" : "Soğuk";

  return {
    score,
    tone,
    label,
    components: {
      interestsScore,
      ordersScore,
      recencyScore,
      quotesScore,
      wonBonus,
    },
  };
}

export function daysSinceContact(lastContactedAt: Date | null): number | null {
  if (!lastContactedAt) return null;
  const ms = Date.now() - new Date(lastContactedAt).getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}
