// HEDEF AÇIĞI ATFI — net sermaye neden değişti? (SAF, deterministik; 2026-10-07 CFO yol haritası #4)
// fm_balance_day net sermayesi = nakit + alacak + stok değeri − borç. Stok değeri gerçekleşebilir değerle (son 90 gün satış fiyatı)
// yeniden hesaplandığı için miktar hiç değişmeden günde ±1M oynayabiliyor (06.10: adet −1.322, stok değeri +1,35M). Goal Engine
// bu oynaklığı "ilerleme" sanıyordu. Bu modül değişimi sürücülere böler:
//   nakit, alacak, borç (ters işaret), stok MİKTAR etkisi (Δadet × bugünkü birim değer), stok DEĞERLEME etkisi (kalan)
// ve operasyonel (değerleme hariç) günlük hızı hedefin gerektirdiği hızla karşılaştırır.

export type BalanceRow = { date: string; cash: number; receivables: number; inventory: number; debt: number; net: number };
export type Attribution = {
  from: string; to: string; days: number;
  netChange: number; cash: number; receivables: number; debt: number;
  inventoryQuantity: number; inventoryValuation: number;
  /** değerleme hariç değişim (nakit + alacak − borç değişimi + stok miktar etkisi) */
  operational: number;
  operationalPerDay: number; reportedPerDay: number;
  /** değerlemenin net değişimdeki payı (mutlak) — yüksekse bildirilen hız yanıltıcı */
  valuationShare: number;
};

export function attribute(first: BalanceRow, last: BalanceRow, inventoryQuantityEffect: number): Attribution {
  const days = Math.max(1, Math.round((Date.parse(last.date) - Date.parse(first.date)) / 86400000));
  const cash = last.cash - first.cash, receivables = last.receivables - first.receivables, debt = -(last.debt - first.debt);
  const inv = last.inventory - first.inventory;
  const valuation = inv - inventoryQuantityEffect;
  const operational = cash + receivables + debt + inventoryQuantityEffect;
  const netChange = last.net - first.net;
  const denom = Math.abs(operational) + Math.abs(valuation);
  return { from: first.date, to: last.date, days, netChange, cash, receivables, debt, inventoryQuantity: inventoryQuantityEffect, inventoryValuation: valuation,
    operational, operationalPerDay: operational / days, reportedPerDay: netChange / days, valuationShare: denom > 0 ? Math.abs(valuation) / denom : 0 };
}

export type GoalPace = { requiredPerDay: number | null; operationalPerDay: number; reportedPerDay: number;
  verdict: "ON_PACE" | "BEHIND" | "SHRINKING" | "UNKNOWN"; daysToGoalAtOperational: number | null; gapTry: number | null };

/** Operasyonel hızla hedefe varış: açık / günlük hız. Hız ≤ 0 ise hiç varılmaz (SHRINKING). */
export function pace(a: Attribution, goal: { gapTry: number | null; requiredPerDay: number | null }): GoalPace {
  const op = a.operationalPerDay;
  const verdict = goal.requiredPerDay == null ? "UNKNOWN" : op <= 0 ? "SHRINKING" : op >= goal.requiredPerDay ? "ON_PACE" : "BEHIND";
  return { requiredPerDay: goal.requiredPerDay, operationalPerDay: op, reportedPerDay: a.reportedPerDay, verdict,
    daysToGoalAtOperational: goal.gapTry != null && op > 0 ? Math.ceil(goal.gapTry / op) : null, gapTry: goal.gapTry };
}
