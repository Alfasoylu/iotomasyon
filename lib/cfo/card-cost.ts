// KREDİ KARTI BORÇ MALİYETİ (SAF, deterministik; 2026-10-08 CFO yol haritası #7).
// Kartta faiz YALNIZ son ekstreden ödenmeyip devreden bakiyeye işler (dönem içi harcama ve gelecek taksitler faizsiz). Eski
// hesap (computeCfo) tüm kart borcunu KMH oranıyla çarpıyordu; sermaye motoru ise kartları faizsiz sayıyordu — ikisi de yanlış.
// Efektif aylık maliyet = akdi faiz × (1 + KKDF + BSMV). Kredi kartı faizine KKDF %15 + BSMV %5 → ×1,20 (Alperen kararı 2026-10-09,
// Cowork itirazı: önceki BSMV %15 / ×1,30 fazlaydı; ekstrenin "vergiler" satırıyla teyit edilir). Devreden bakiye ya da oran girilmemişse UNKNOWN kalır: uydurma oran yok.

export const CARD_TAX = { kkdf: 0.15, bsmv: 0.05 } as const;

export type CardCostInput = {
  name: string; personal: boolean;
  totalDebtTry: number | null;
  /** devreden, faiz işleyen bakiye; null = bilinmiyor */
  revolvingTry: number | null;
  /** aylık akdi faiz % (vergi hariç); null = bilinmiyor */
  contractMonthlyRatePct: number | null;
};

/** Aylık efektif maliyet (ondalık; 0,0553 = %5,53). */
export function cardEffectiveMonthlyRate(contractMonthlyRatePct: number | null): number | null {
  return contractMonthlyRatePct == null || contractMonthlyRatePct <= 0 ? null : (contractMonthlyRatePct / 100) * (1 + CARD_TAX.kkdf + CARD_TAX.bsmv);
}

export type CardCarry = {
  /** devreden bakiyesi VE oranı bilinen kartların aylık faiz + vergi maliyeti */
  interestMonthlyTry: number;
  revolvingTry: number;
  /** devreden bakiyesi bilinen ama oranı girilmemiş tutar (maliyeti hesaba girmedi) */
  revolvingWithoutRateTry: number;
  /** borcu olan ama devreden bakiyesi bilinmeyen kart sayısı */
  unknownRevolvingCards: number;
  perCard: { name: string; personal: boolean; revolvingTry: number | null; effectiveMonthlyRate: number | null; interestMonthlyTry: number | null }[];
};

export function cardCarry(cards: CardCostInput[]): CardCarry {
  let interest = 0, revolving = 0, withoutRate = 0, unknown = 0;
  const perCard = cards.map(c => {
    const eff = cardEffectiveMonthlyRate(c.contractMonthlyRatePct);
    if (c.revolvingTry == null) {
      if ((c.totalDebtTry ?? 0) > 0) unknown++;
      return { name: c.name, personal: c.personal, revolvingTry: null, effectiveMonthlyRate: eff, interestMonthlyTry: null };
    }
    const r = Math.max(0, c.revolvingTry);
    revolving += r;
    if (eff == null) { withoutRate += r; return { name: c.name, personal: c.personal, revolvingTry: r, effectiveMonthlyRate: null, interestMonthlyTry: null }; }
    interest += r * eff;
    return { name: c.name, personal: c.personal, revolvingTry: r, effectiveMonthlyRate: eff, interestMonthlyTry: Math.round(r * eff) };
  });
  return { interestMonthlyTry: Math.round(interest), revolvingTry: Math.round(revolving), revolvingWithoutRateTry: Math.round(withoutRate), unknownRevolvingCards: unknown, perCard };
}

/** Şahsi kart: tek sınıflama (lib/cfo/ownership.ts, CFO-006). */
export { isPersonalCard } from "./ownership";

/** Devreden/oran sütunları var mı? (migration 20261008180000 uygulanmadan önce ham sorgular bu sütunları okumaz) */
export const CARD_COLUMNS_SQL = `select count(*)::int as n from information_schema.columns
  where table_schema = 'public' and table_name = 'cfo_credit_card' and column_name in ('revolvingTry', 'contractMonthlyRatePct')`;
