// HEDEF AÇIĞI ATFI — net sermaye neden değişti? (SAF, deterministik; 2026-10-07 CFO yol haritası #4)
// fm_balance_day net sermayesi = nakit + alacak + stok değeri − borç. Stok değeri gerçekleşebilir değerle (son 90 gün satış fiyatı)
// yeniden hesaplandığı için miktar hiç değişmeden günde ±1M oynayabiliyor (06.10: adet −1.322, stok değeri +1,35M). Goal Engine
// bu oynaklığı "ilerleme" sanıyordu. Bu modül değişimi sürücülere böler:
//   nakit, alacak, borç (ters işaret), stok MİKTAR etkisi (Δadet × bugünkü birim değer), stok DEĞERLEME etkisi (kalan)
// ve operasyonel (değerleme hariç) günlük hızı hedefin gerektirdiği hızla karşılaştırır.

/** inTransit: yoldaki ödenmiş mal (yalnız v3 sözleşme bileşenlerinde ayrı; v2'de stoğun içinde → 0). */
export type BalanceRow = { date: string; cash: number; receivables: number; inventory: number; debt: number; net: number; inTransit?: number };
export type Attribution = {
  from: string; to: string; days: number;
  netChange: number; cash: number; receivables: number; debt: number; inTransit: number;
  inventoryQuantity: number; inventoryValuation: number;
  /** kimlik farkı: net değişim − bileşen değişimleri toplamı (CFO-017). |fark| > 1 TL ise bileşenler net sermayeyi açıklamıyor (tanım farkı) */
  unexplained: number; identityOk: boolean;
  /** değerleme hariç değişim (nakit + alacak − borç değişimi + stok miktar etkisi) */
  operational: number;
  operationalPerDay: number; reportedPerDay: number;
  /** değerlemenin net değişimdeki payı (mutlak) — yüksekse bildirilen hız yanıltıcı */
  valuationShare: number;
};

export function attribute(first: BalanceRow, last: BalanceRow, inventoryQuantityEffect: number): Attribution {
  const days = Math.max(1, Math.round((Date.parse(last.date) - Date.parse(first.date)) / 86400000));
  const cash = last.cash - first.cash, receivables = last.receivables - first.receivables, debt = -(last.debt - first.debt);
  const inv = last.inventory - first.inventory, inTransit = (last.inTransit ?? 0) - (first.inTransit ?? 0);
  const valuation = inv - inventoryQuantityEffect;
  const operational = cash + receivables + debt + inTransit + inventoryQuantityEffect;
  const netChange = last.net - first.net;
  const unexplained = Math.round((netChange - (cash + receivables + debt + inv + inTransit)) * 100) / 100;
  const denom = Math.abs(operational) + Math.abs(valuation);
  return { from: first.date, to: last.date, days, netChange, cash, receivables, debt, inTransit, unexplained, identityOk: Math.abs(unexplained) <= 1,
    inventoryQuantity: inventoryQuantityEffect, inventoryValuation: valuation,
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
