/**
 * Faz 90 — CFO Hesap Motoru
 *
 * Saf fonksiyonlar. DB'den okunan ham satırları alır, tüm KPI'ları,
 * 7/30/60/90 gün rolling forecast'i, gümrük rezerv açığını ve net ticari
 * serveti üretir. Sayfalar hesap yapmaz — sadece bu motorun çıktısını basar.
 *
 * ÇİFT SAYIM KURALLARI (kritik):
 *  1. Pazaryeri tahsilatları YALNIZ CfoReceivable'dan gelir. Aynı hakediş için
 *     ayrıca CfoCashEvent açılmaz.
 *  2. Haftalık (son 14 gün cirosu / 4) tahmini, aynı haftadaki gerçek
 *     hakedişlerden DÜŞÜLÜR; kalan pozitifse tahmini ek tahsilat sayılır.
 *  3. Sabit giderler kredi taksiti ve kart ödemesinden ayrı tutulur.
 *  4. Yoldaki ve bloke stok, satılabilir stoğa dahil edilmez.
 */

export type Traffic = "YESIL" | "SARI" | "KIRMIZI" | "NOTR";

type Dec = { toString(): string } | number | null | undefined;

/** Prisma Decimal | number | null → number */
export function num(v: Dec): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const n = Number(v.toString());
  return Number.isFinite(n) ? n : 0;
}

/** null'ı koruyan varyant — "veri yok" ile "sıfır" ayrımı için. */
export function numOrNull(v: Dec): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const n = Number(v.toString());
  return Number.isFinite(n) ? n : null;
}

// ── Girdi tipleri (Prisma modellerinin okunan alt kümesi) ────────────────────

export interface BankRow {
  id: string; name: string; accountType: string;
  balanceTry: Dec; kmhLimitTry: Dec; monthlyRatePct: Dec;
  dataTag: string; note: string | null; lastUpdatedAt: Date;
}
export interface CardRow {
  id: string; bank: string; holder: string | null;
  statementDebtTry: Dec; totalDebtTry: Dec; fxDebtUsd: Dec;
  statementDay: number | null; dueDay: number | null; minOverrideTry: Dec;
  currentMonthState: string; nextDueDate: Date | null;
  dataTag: string; note: string | null; lastUpdatedAt: Date;
}
export interface LoanRow {
  id: string; bank: string; name: string;
  earlyPayoffTry: Dec; monthlyPaymentTry: Dec; interestRatePct: Dec;
  paymentDay: number | null; nextPaymentDate: Date | null; lastInstallmentDate: Date | null;
  totalInstallments: number | null; remainingOverride: number | null;
  currentMonthState: string; status: string; priority: string | null;
  strategy: string | null; dataTag: string; note: string | null;
}
export interface ExpenseRow { id: string; name: string; category: string | null; monthlyTry: Dec; paymentDay: number | null; isActive: boolean; }
export interface ReceivableRow { id: string; channel: string; dueDate: Date; amountTry: Dec; certainty: string; isCollected: boolean; source: string | null; }
export interface CashEventRow {
  id: string; eventDate: Date; kind: string; description: string; bank: string | null;
  inflowTry: Dec; outflowTry: Dec; certainty: string; relatedDebt: string | null;
  relatedImport: string | null; isSettled: boolean; note: string | null;
}
export interface ImportRow {
  id: string; code: string; status: string; etaDate: Date | null;
  totalCostUsd: Dec; customsEstimateTry: Dec; expectedRevenueTry: Dec;
  expectedProfitTry: Dec; salesMonths: Dec;
}
export interface SettingsRow {
  usdTryRate: Dec; kmhMonthlyRatePct: Dec; cardMinPct: Dec;
  marketplaceTermDays: number; cashConversionPct: Dec;
  customsReserveTarget: Dec; customsReserveDate: Date | null; customsReserveSaved: Dec;
  usdWealthTarget: Dec; wealthTargetDate: Date | null;
  last14dRevenueTry: Dec; last14dRevenueDate: Date | null;
  monthlyRevenueTarget1: Dec; monthlyRevenueTarget2: Dec;
  stockCostUsd: Dec; blockedStockUsd: Dec; stockCoverMonths: Dec;
}

export interface CfoInput {
  settings: SettingsRow | null;
  banks: BankRow[];
  cards: CardRow[];
  loans: LoanRow[];
  expenses: ExpenseRow[];
  receivables: ReceivableRow[];
  cashEvents: CashEventRow[];
  imports: ImportRow[];
  today?: Date;
}

// ── Yardımcılar ──────────────────────────────────────────────────────────────

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

/**
 * Kalan taksit sayısı. Elle girilmiş `remainingOverride` varsa o kazanır
 * (düzensiz ödeme planları için). Yoksa sonraki ödeme ile son taksit tarihi
 * arasındaki ay farkından hesaplanır — böylece zamanla kendiliğinden azalır
 * ve elle güncelleme gerektirmez. Kapanan kredide 0, tarih eksikse null.
 */
export function remainingInstallments(l: Pick<LoanRow, "nextPaymentDate" | "lastInstallmentDate" | "remainingOverride" | "status">): number | null {
  if (l.status !== "AKTIF") return 0;
  if (l.remainingOverride != null) return l.remainingOverride;
  const from = l.nextPaymentDate;
  const to = l.lastInstallmentDate;
  if (!from || !to) return null;
  const f = from instanceof Date ? from : new Date(from);
  const t = to instanceof Date ? to : new Date(to);
  const n = (t.getFullYear() - f.getFullYear()) * 12 + (t.getMonth() - f.getMonth()) + 1;
  return n > 0 ? n : 0;
}

export function trafficForGap(gap: number, freeCapacity: number): Traffic {
  if (gap <= 0) return "YESIL";
  if (gap <= freeCapacity) return "SARI";
  return "KIRMIZI";
}

// ── Çıktı tipleri ────────────────────────────────────────────────────────────

export interface WeekBucket { start: Date; end: Date; gross: number; actual: number; net: number; }
export interface HorizonRow {
  label: string; days: number;
  inflow: number; outflow: number; net: number;
  position: number; gap: number; traffic: Traffic;
}
export interface CfoOverview {
  today: Date;
  usdTry: number;
  monthlyRatePct: number;

  // Nakit & banka
  netCashTry: number;
  usedKmhTry: number;
  totalKmhLimitTry: number;
  freeKmhTry: number;
  kmhInterestMonthlyTry: number;
  banksMissingBalance: number;

  // Borçlar
  cardDebtTry: number;
  cardMinTotalTry: number;
  cardCarryCostTry: number;
  loanEarlyPayoffTry: number;
  loanMonthlyServiceTry: number;
  loansMissingRate: number;
  fixedExpenseMonthlyTry: number;
  totalFinancialDebtTry: number;
  netDebtTry: number;
  debtServiceRatio: number | null;

  // Alacak & stok
  receivablesPendingTry: number;
  receivablesByChannel: Array<{ channel: string; amount: number; count: number }>;
  sellableStockTry: number;
  blockedStockTry: number;
  inTransitStockTry: number;

  // Satış
  last14dRevenueTry: number | null;
  monthlyRunRateTry: number | null;
  monthlyCashCollectionTry: number | null;
  weeklyEstimateGrossTry: number;
  revenueDataAgeDays: number | null;

  // Forecast
  weeks: WeekBucket[];
  horizons: HorizonRow[];

  // Gümrük rezervi
  customs: {
    target: number; saved: number; dueDate: Date | null; daysLeft: number | null;
    expectedInflow: number; mandatoryOutflow: number; projectedCash: number;
    gap: number; remainingCapacity: number; traffic: Traffic; interestCostMonthly: number;
  } | null;

  // Net ticari servet
  narrowWorthTry: number; narrowWorthUsd: number;
  wideWorthTry: number; wideWorthUsd: number;
  target: { usd: number; remainingUsd: number; monthsLeft: number | null; requiredMonthlyUsd: number | null; progress: number } | null;

  // Aksiyon
  monthlyOperatingCashTry: number;
  needsAttention: Array<{ area: string; item: string; reason: string }>;
}

// ── Ana hesap ────────────────────────────────────────────────────────────────

export function computeCfo(input: CfoInput): CfoOverview {
  const today = startOfDay(input.today ?? new Date());
  const s = input.settings;

  const usdTry = s ? num(s.usdTryRate) || 1 : 1;
  const ratePct = s ? num(s.kmhMonthlyRatePct) : 4.5;
  const rate = ratePct / 100;
  const cardMinPct = (s ? num(s.cardMinPct) : 20) / 100;

  // ── Bankalar ──
  let netCashTry = 0, usedKmhTry = 0, totalKmhLimitTry = 0, freeKmhTry = 0, banksMissingBalance = 0;
  for (const b of input.banks) {
    const bal = numOrNull(b.balanceTry);
    const limit = num(b.kmhLimitTry);
    totalKmhLimitTry += limit;
    if (bal == null) { banksMissingBalance++; continue; } // muhafazakâr: bilinmeyen bakiye boş limite sayılmaz
    netCashTry += bal;
    const used = bal < 0 ? -bal : 0;
    usedKmhTry += used;
    freeKmhTry += Math.max(0, limit - used);
  }
  const kmhInterestMonthlyTry = usedKmhTry * rate;

  // ── Kartlar ──
  let cardDebtTry = 0, cardMinTotalTry = 0;
  for (const c of input.cards) {
    const debt = numOrNull(c.totalDebtTry) ?? numOrNull(c.statementDebtTry);
    if (debt == null) continue;
    cardDebtTry += debt;
    cardMinTotalTry += numOrNull(c.minOverrideTry) ?? Math.round(debt * cardMinPct);
  }
  const cardCarryCostTry = cardDebtTry * rate;

  // ── Krediler ──
  let loanEarlyPayoffTry = 0, loanMonthlyServiceTry = 0, loansMissingRate = 0;
  for (const l of input.loans) {
    if (l.status !== "AKTIF") continue;
    loanEarlyPayoffTry += num(l.earlyPayoffTry);
    loanMonthlyServiceTry += num(l.monthlyPaymentTry);
    if (numOrNull(l.interestRatePct) == null) loansMissingRate++;
  }

  const fixedExpenseMonthlyTry = input.expenses.filter((e) => e.isActive).reduce((a, e) => a + num(e.monthlyTry), 0);
  const totalFinancialDebtTry = usedKmhTry + cardDebtTry + loanEarlyPayoffTry;
  const netDebtTry = totalFinancialDebtTry - Math.max(0, netCashTry);

  // ── Alacaklar ──
  const pending = input.receivables.filter((r) => !r.isCollected);
  const receivablesPendingTry = pending.reduce((a, r) => a + num(r.amountTry), 0);
  const byChannel = new Map<string, { amount: number; count: number }>();
  for (const r of pending) {
    const cur = byChannel.get(r.channel) ?? { amount: 0, count: 0 };
    cur.amount += num(r.amountTry); cur.count++;
    byChannel.set(r.channel, cur);
  }
  const receivablesByChannel = [...byChannel.entries()]
    .map(([channel, v]) => ({ channel, ...v }))
    .sort((a, b) => b.amount - a.amount);

  // ── Stok ──
  const sellableStockTry = s ? num(s.stockCostUsd) * usdTry : 0;
  const blockedStockTry = s ? num(s.blockedStockUsd) * usdTry : 0;
  const inTransitStockTry = input.imports
    .filter((i) => i.status === "YOLDA" || i.status === "GUMRUKTE")
    .reduce((a, i) => a + num(i.totalCostUsd) * usdTry, 0);

  // ── Satış ──
  const last14 = s ? numOrNull(s.last14dRevenueTry) : null;
  const monthlyRunRateTry = last14 != null ? (last14 / 14) * 30 : null;
  const cashConv = (s ? num(s.cashConversionPct) : 70) / 100;
  const monthlyCashCollectionTry = monthlyRunRateTry != null ? monthlyRunRateTry * cashConv : null;
  const weeklyEstimateGrossTry = last14 != null ? last14 / 4 : 0;
  const revenueDataAgeDays =
    s?.last14dRevenueDate != null
      ? Math.round((today.getTime() - startOfDay(new Date(s.last14dRevenueDate)).getTime()) / 86400000)
      : null;

  // ── Haftalık tahmin kovaları (çift sayım korumalı) ──
  const weeks: WeekBucket[] = [];
  for (let i = 0; i < 14; i++) {
    const start = addDays(today, i * 7);
    const end = addDays(start, 6);
    const actual = pending
      .filter((r) => r.dueDate >= start && r.dueDate <= end)
      .reduce((a, r) => a + num(r.amountTry), 0);
    weeks.push({ start, end, gross: weeklyEstimateGrossTry, actual, net: Math.max(0, weeklyEstimateGrossTry - actual) });
  }

  // ── Rolling forecast ──
  function windowSums(days: number) {
    const until = addDays(today, days);
    const inflowReal = pending
      .filter((r) => r.dueDate >= today && r.dueDate <= until)
      .reduce((a, r) => a + num(r.amountTry), 0);
    const inflowEst = weeks.filter((w) => w.end >= today && w.end <= until).reduce((a, w) => a + w.net, 0);
    const evIn = input.cashEvents
      .filter((e) => !e.isSettled && e.eventDate >= today && e.eventDate <= until)
      .reduce((a, e) => a + num(e.inflowTry), 0);
    const evOut = input.cashEvents
      .filter((e) => !e.isSettled && e.eventDate >= today && e.eventDate <= until)
      .reduce((a, e) => a + num(e.outflowTry), 0);
    return { inflow: inflowReal + inflowEst + evIn, outflow: evOut };
  }

  const horizons: HorizonRow[] = [7, 30, 60, 90].map((days) => {
    const { inflow, outflow } = windowSums(days);
    const net = inflow - outflow;
    const position = netCashTry + net;
    const gap = position < 0 ? -position : 0;
    return {
      label: `${days} gün`, days, inflow, outflow, net, position, gap,
      traffic: trafficForGap(gap, freeKmhTry),
    };
  });

  // ── Gümrük rezervi ──
  let customs: CfoOverview["customs"] = null;
  if (s && numOrNull(s.customsReserveTarget) != null && s.customsReserveDate) {
    const target = num(s.customsReserveTarget);
    const saved = num(s.customsReserveSaved);
    const due = startOfDay(new Date(s.customsReserveDate));
    const daysLeft = Math.round((due.getTime() - today.getTime()) / 86400000);
    const expectedInflow =
      pending.filter((r) => r.dueDate >= today && r.dueDate <= due).reduce((a, r) => a + num(r.amountTry), 0) +
      weeks.filter((w) => w.end >= today && w.end <= due).reduce((a, w) => a + w.net, 0) +
      input.cashEvents.filter((e) => !e.isSettled && e.eventDate >= today && e.eventDate <= due).reduce((a, e) => a + num(e.inflowTry), 0);
    // gümrük ödemesinin kendisi hariç — rezerv onu karşılamak için
    const mandatoryOutflow = input.cashEvents
      .filter((e) => !e.isSettled && e.kind !== "VERGI_GUMRUK" && e.eventDate >= today && e.eventDate <= due)
      .reduce((a, e) => a + num(e.outflowTry), 0);
    const projectedCash = netCashTry + expectedInflow - mandatoryOutflow;
    const gap = Math.max(0, target - (projectedCash + saved));
    const remainingCapacity = freeKmhTry - gap;
    customs = {
      target, saved, dueDate: due, daysLeft, expectedInflow, mandatoryOutflow, projectedCash,
      gap, remainingCapacity, traffic: trafficForGap(gap, freeKmhTry), interestCostMonthly: gap * rate,
    };
  }

  // ── Net ticari servet ──
  const narrowWorthTry = netCashTry + receivablesPendingTry + sellableStockTry - cardDebtTry - loanEarlyPayoffTry;
  const wideWorthTry = narrowWorthTry + inTransitStockTry + blockedStockTry;
  const narrowWorthUsd = narrowWorthTry / usdTry;
  const wideWorthUsd = wideWorthTry / usdTry;

  let target: CfoOverview["target"] = null;
  if (s && numOrNull(s.usdWealthTarget) != null) {
    const t = num(s.usdWealthTarget);
    const monthsLeft = s.wealthTargetDate
      ? (startOfDay(new Date(s.wealthTargetDate)).getTime() - today.getTime()) / 86400000 / 30.4
      : null;
    const remainingUsd = t - wideWorthUsd;
    target = {
      usd: t, remainingUsd, monthsLeft,
      requiredMonthlyUsd: monthsLeft && monthsLeft > 0 ? remainingUsd / monthsLeft : null,
      progress: t > 0 ? wideWorthUsd / t : 0,
    };
  }

  const monthlyOperatingCashTry =
    (monthlyCashCollectionTry ?? 0) - fixedExpenseMonthlyTry - loanMonthlyServiceTry - cardMinTotalTry - kmhInterestMonthlyTry;
  const debtServiceRatio =
    monthlyCashCollectionTry && monthlyCashCollectionTry > 0
      ? (loanMonthlyServiceTry + cardMinTotalTry + kmhInterestMonthlyTry) / monthlyCashCollectionTry
      : null;

  // ── Dikkat gerektirenler ──
  const needsAttention: CfoOverview["needsAttention"] = [];
  for (const b of input.banks) {
    if (numOrNull(b.balanceTry) == null) needsAttention.push({ area: "Banka", item: b.name, reason: "Bakiye bilinmiyor — boş limite sayılmadı" });
  }
  for (const c of input.cards) {
    if (c.currentMonthState === "TEYIT_EDILMELI") needsAttention.push({ area: "Kredi kartı", item: `${c.bank} ${c.holder ?? ""}`.trim(), reason: "Bu ayki ödeme durumu teyit edilmeli" });
    if (numOrNull(c.totalDebtTry) == null && numOrNull(c.statementDebtTry) == null) needsAttention.push({ area: "Kredi kartı", item: `${c.bank} ${c.holder ?? ""}`.trim(), reason: "Güncel borç girilmemiş" });
  }
  for (const l of input.loans) {
    if (l.status !== "AKTIF") continue;
    if (numOrNull(l.interestRatePct) == null) needsAttention.push({ area: "Kredi", item: `${l.bank} — ${l.name}`, reason: "Faiz oranı yok — erken kapama getirisi hesaplanamıyor" });
    if (l.currentMonthState === "TEYIT_EDILMELI") needsAttention.push({ area: "Kredi", item: `${l.bank} — ${l.name}`, reason: "Bu ayki taksit durumu teyit edilmeli" });
  }
  if (revenueDataAgeDays != null && revenueDataAgeDays > 21) {
    needsAttention.push({ area: "Satış", item: "Son 14 gün cirosu", reason: `${revenueDataAgeDays} gündür güncellenmedi — tahminler güvenilirliğini kaybediyor` });
  }

  return {
    today, usdTry, monthlyRatePct: ratePct,
    netCashTry, usedKmhTry, totalKmhLimitTry, freeKmhTry, kmhInterestMonthlyTry, banksMissingBalance,
    cardDebtTry, cardMinTotalTry, cardCarryCostTry,
    loanEarlyPayoffTry, loanMonthlyServiceTry, loansMissingRate,
    fixedExpenseMonthlyTry, totalFinancialDebtTry, netDebtTry, debtServiceRatio,
    receivablesPendingTry, receivablesByChannel,
    sellableStockTry, blockedStockTry, inTransitStockTry,
    last14dRevenueTry: last14, monthlyRunRateTry, monthlyCashCollectionTry, weeklyEstimateGrossTry, revenueDataAgeDays,
    weeks, horizons, customs,
    narrowWorthTry, narrowWorthUsd, wideWorthTry, wideWorthUsd, target,
    monthlyOperatingCashTry, needsAttention,
  };
}

// ── Sermaye tahsisi karşılaştırması ─────────────────────────────────────────

export interface AllocationOption {
  rank: number; name: string; capital: number | null;
  certainSavingMonthly: number | null; cashReliefMonthly: number | null;
  annualReturn: number | null; annualRoi: number | null;
  risk: string; liquidity: string; dataOk: boolean; advice: string;
}

/** Her yeni 100.000 TL serbest nakit için alternatif kullanım sıralaması. */
export function buildAllocation(o: CfoOverview, loans: LoanRow[], unit = 100_000): AllocationOption[] {
  const rate = o.monthlyRatePct / 100;
  const opts: AllocationOption[] = [];
  let rank = 1;

  if (o.customs && o.customs.gap > 0) {
    opts.push({
      rank: rank++, name: "Gümrük rezervi", capital: unit,
      certainSavingMonthly: unit * rate, cashReliefMonthly: null,
      annualReturn: unit * rate * 12, annualRoi: rate * 12, risk: "Düşük", liquidity: "Nakdi bağlar", dataOk: true,
      advice: "ÖNCELİK 1. Rezerv oluşmazsa gümrük KMH ile finanse edilir; hem faiz hem ardiye/gecikme riski doğar.",
    });
  }
  opts.push({
    rank: rank++, name: "KMH azaltma", capital: unit,
    certainSavingMonthly: unit * rate, cashReliefMonthly: unit * rate,
    annualReturn: unit * rate * 12, annualRoi: rate * 12, risk: "Çok düşük", liquidity: "İyileştirir", dataOk: true,
    advice: "Kesin ve garantili tasarruf. Limit yeniden kullanılabilir hale gelir.",
  });
  opts.push({
    rank: rank++, name: "Kredi kartı borcu azaltma", capital: unit,
    certainSavingMonthly: unit * rate, cashReliefMonthly: unit * rate * 0.2,
    annualReturn: unit * rate * 12, annualRoi: rate * 12, risk: "Çok düşük", liquidity: "İyileştirir", dataOk: true,
    advice: "KMH ile aynı maliyet. Gecikme riski olan kart varsa KMH'den önce gelir.",
  });

  for (const l of loans.filter((x) => x.status === "AKTIF")) {
    const r = numOrNull(l.interestRatePct);
    const payoff = numOrNull(l.earlyPayoffTry);
    opts.push({
      rank: rank++, name: `${l.bank} — ${l.name} erken kapama`, capital: payoff,
      certainSavingMonthly: r != null && payoff != null ? payoff * (r / 100) : null,
      cashReliefMonthly: numOrNull(l.monthlyPaymentTry),
      annualReturn: r != null && payoff != null ? payoff * (r / 100) * 12 : null,
      annualRoi: r != null ? (r / 100) * 12 : null,
      risk: l.priority === "Yüksek" ? "Orta" : "Düşük",
      liquidity: "Nakdi azaltır", dataOk: r != null,
      advice: r == null
        ? "FAİZ ORANI GİRİLMELİ — gerçek getiri hesaplanamıyor. Aylık taksit rahatlaması yine de kesin."
        : (l.strategy ?? "Faiz oranına göre sıralanır."),
    });
  }

  return opts.sort((a, b) => {
    if (a.dataOk !== b.dataOk) return a.dataOk ? -1 : 1;
    return (b.annualRoi ?? -1) - (a.annualRoi ?? -1);
  }).map((x, i) => ({ ...x, rank: i + 1 }));
}

// ── Günlük aksiyon üretimi ───────────────────────────────────────────────────

export interface DailyAction { order: number; text: string; tone: "danger" | "warn" | "ok" | "info"; }

/**
 * "Bugün yapılacak 3 şey" — dashboard ve sabah raporu aynı kaynaktan beslenir.
 * Rakam uydurmaz; veri yoksa o maddeyi üretmez.
 */
export function buildDailyActions(o: CfoOverview, input: CfoInput): DailyAction[] {
  const out: DailyAction[] = [];
  const today = o.today;

  const nextOut = input.cashEvents
    .filter((e) => !e.isSettled && num(e.outflowTry) > 0 && e.eventDate >= today)
    .sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime())[0];
  if (nextOut) {
    out.push({
      order: 1, tone: "danger",
      text: `${nextOut.eventDate.toLocaleDateString("tr-TR")} — ${nextOut.description} için ${Math.round(num(nextOut.outflowTry)).toLocaleString("tr-TR")} TL hazırla.`,
    });
  }

  const nextIn = input.receivables
    .filter((r) => !r.isCollected && r.dueDate >= today)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];
  if (nextIn) {
    const dest = o.customs && o.customs.gap > 0 ? "GÜMRÜK REZERVİNE" : "KMH/kart azaltımına";
    out.push({
      order: 2, tone: "info",
      text: `${nextIn.dueDate.toLocaleDateString("tr-TR")} günü gelecek ${Math.round(num(nextIn.amountTry)).toLocaleString("tr-TR")} TL ${nextIn.channel} tahsilatını ${dest} yönlendir.`,
    });
  }

  if (o.customs && o.customs.gap > 0) {
    out.push({
      order: 3, tone: "danger",
      text: `Gümrük rezervi açığı ${Math.round(o.customs.gap).toLocaleString("tr-TR")} TL — yeni ithalat siparişi verme, gelen nakdi rezerve ayır.`,
    });
  } else if (o.customs) {
    out.push({ order: 3, tone: "ok", text: "Gümrük rezervi tamam — serbest nakdi KMH/kart azaltımına yönlendir." });
  }

  if (o.needsAttention.length > 0) {
    out.push({
      order: 4, tone: "warn",
      text: `Teyit/veri bekleyen ${o.needsAttention.length} kalem var — aşağıdaki listeye bak.`,
    });
  }
  return out;
}
