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

import { CARD_TAX, cardCarry, isPersonalCard } from "./card-cost";

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
  /** devreden faiz işleyen bakiye + aylık akdi faiz (2026-10-08 migration; okunmamışsa undefined = bilinmiyor) */
  revolvingTry?: Dec; contractMonthlyRatePct?: Dec;
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
  /** cfo_tahsilat_tahmini (kanal temposu, alacak ufku dışı; cfo_nakit_projeksiyon ile aynı mekanizma). null = görünüm yok → eski last14/4 tahmini. */
  forecast?: { date: Date; amountTry: number }[] | null;
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
/** Ay sonu nakit tahmini — "ay kapanışında bankada ne görünür" sorusunun cevabı. */
export interface MonthEndRow {
  label: string;          // "Eylül 2026"
  date: Date;             // ayın son günü
  days: number;           // bugünden kaç gün sonra
  inflow: number;         // bugünden ay sonuna kümülatif tahsilat
  outflow: number;        // bugünden ay sonuna kümülatif ödeme
  net: number;
  position: number;       // netCash + net  → ay sonu nakit pozisyonu
  freeCapacityAfter: number; // pozisyon negatifse KMH'den ne kadar kalır
  traffic: Traffic;
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
  /** devreden bakiyesi ve oranı bilinen kartların aylık faiz + KKDF/BSMV maliyeti */
  cardCarryCostTry: number;
  cardRevolvingTry: number; cardRevolvingWithoutRateTry: number; cardsUnknownRevolving: number;
  /** devreden bakiyesi ve oranı bilinen en pahalı kart (şahsi dahil) */
  cardTopRevolving: { name: string; revolvingTry: number; effectiveMonthlyRate: number } | null;
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
  /** Haftalık tahminin kaynağı: kanal temposu (cfo_tahsilat_tahmini) ya da yedek last14/4 (elle girilen ciro). */
  weeklyEstimateSource: "kanal_temposu" | "last14";
  revenueDataAgeDays: number | null;

  // Forecast
  weeks: WeekBucket[];
  horizons: HorizonRow[];
  monthEnds: MonthEndRow[];

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
  let netCashTry = 0, usedKmhTry = 0, totalKmhLimitTry = 0, freeKmhTry = 0, banksMissingBalance = 0, kmhInterestMonthlyTry = 0;
  for (const b of input.banks) {
    const bal = numOrNull(b.balanceTry);
    const limit = num(b.kmhLimitTry);
    totalKmhLimitTry += limit;
    if (bal == null) { banksMissingBalance++; continue; } // muhafazakâr: bilinmeyen bakiye boş limite sayılmaz
    netCashTry += bal;
    const used = bal < 0 ? -bal : 0;
    usedKmhTry += used;
    freeKmhTry += Math.max(0, limit - used);
    // Banka bazlı oran (yoksa genel); şahsi KMH faizine KKDF + BSMV eklenir (bireysel kredi vergisi).
    const bankRate = (numOrNull(b.monthlyRatePct) ?? ratePct) / 100;
    kmhInterestMonthlyTry += used * bankRate * (/ŞAHSİ|şahsi/i.test(`${b.accountType} ${b.name}`) ? 1 + CARD_TAX.kkdf + CARD_TAX.bsmv : 1);
  }

  // ── Kartlar ──
  let cardDebtTry = 0, cardMinTotalTry = 0;
  for (const c of input.cards) {
    const debt = numOrNull(c.totalDebtTry) ?? numOrNull(c.statementDebtTry);
    if (debt == null) continue;
    cardDebtTry += debt;
    cardMinTotalTry += numOrNull(c.minOverrideTry) ?? Math.round(debt * cardMinPct);
  }
  // Faiz yalnız devreden bakiyeye işler (lib/cfo/card-cost.ts); devreden ya da oran bilinmiyorsa maliyet UNKNOWN kalır.
  const carry = cardCarry(input.cards.map(c => ({ name: `${c.bank} ${c.holder ?? ""}`.trim(), personal: isPersonalCard(c.holder),
    totalDebtTry: numOrNull(c.totalDebtTry) ?? numOrNull(c.statementDebtTry), revolvingTry: numOrNull(c.revolvingTry ?? null),
    contractMonthlyRatePct: numOrNull(c.contractMonthlyRatePct ?? null) })));
  const cardCarryCostTry = carry.interestMonthlyTry;

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
  // DİKKAT (10.09.2026): bu üç alan ELLE GİRİLMİŞ USD sabitlerinden türer
  // (cfo_settings.stockCostUsd / blockedStockUsd). Kimse güncellemediği için
  // aylarca donuk kaldılar ve serveti yanlış gösterdiler. Artık ekrana
  // BASILMIYORLAR ve snapshot'a YAZILMIYORLAR.
  //
  // Gerçek stok değeri: `cfo_stok_deger` → `cfo_servet` (lib/cfo/wealth.ts).
  // Buradaki alanlar yalnız geriye dönük uyumluluk için duruyor; yeni bir yerde
  // kullanmadan önce wealth.ts'e bak.
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
  // Tek mekanizma (2026-10-08, Cowork kararı): cfo_tahsilat_tahmini varsa haftanın ek tahsilatı = o haftaya düşen kanal temposu.
  // Görünüm her kanalı kendi son açık vadesinden SONRA saydığı için alacakla çakışmaz (net = tahmin, brüt = alacak + tahmin);
  // /cfo ufukları, ay sonları ve gümrük kartı böylece cfo_nakit_projeksiyon / cfo_odeme_gunluk ile aynı girişi görür.
  // Görünüm yoksa eski yedek: elle girilen son 14 gün cirosu / 4, haftanın gerçek hakedişi düşülerek.
  const forecast = input.forecast ?? null;
  const weeklyEstimateSource: CfoOverview["weeklyEstimateSource"] = forecast ? "kanal_temposu" : "last14";
  const weeks: WeekBucket[] = [];
  for (let i = 0; i < 14; i++) {
    const start = addDays(today, i * 7);
    const end = addDays(start, 6);
    const actual = pending
      .filter((r) => r.dueDate >= start && r.dueDate <= end)
      .reduce((a, r) => a + num(r.amountTry), 0);
    if (forecast) {
      const est = forecast.filter((f) => f.date >= start && f.date <= end).reduce((a, f) => a + f.amountTry, 0);
      weeks.push({ start, end, gross: actual + est, actual, net: est });
    } else {
      weeks.push({ start, end, gross: weeklyEstimateGrossTry, actual, net: Math.max(0, weeklyEstimateGrossTry - actual) });
    }
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

  // ── Ay sonu nakit tahminleri (3 ay) ──
  // Ay sonu bilerek seçildi: bankaların gördüğü bakiye ay sonu bakiyesidir (Alperen kuralı, 24.08).
  const TR_AY = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
  const monthEnds: MonthEndRow[] = [0, 1, 2].map((i) => {
    const eom = startOfDay(new Date(today.getFullYear(), today.getMonth() + i + 1, 0));
    const days = Math.max(0, Math.round((eom.getTime() - today.getTime()) / 86400000));
    const { inflow, outflow } = windowSums(days);
    const net = inflow - outflow;
    const position = netCashTry + net;
    const gap = position < 0 ? -position : 0;
    return {
      label: `${TR_AY[eom.getMonth()]} ${eom.getFullYear()}`,
      date: eom, days, inflow, outflow, net, position,
      freeCapacityAfter: freeKmhTry - gap,
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
  // DİKKAT: aşağıdaki dört alan yukarıdaki sabit-tabanlı stok rakamını kullanır,
  // dolayısıyla GERÇEK servet DEĞİLDİR. Kokpit ve snapshot artık cfo_servet
  // görünümünü okuyor. Bu alanlar silinmedi çünkü target/progress hesabı hâlâ
  // burada; ama hiçbir ekran bunları basmıyor.
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
    cardDebtTry, cardMinTotalTry, cardCarryCostTry, cardRevolvingTry: carry.revolvingTry, cardRevolvingWithoutRateTry: carry.revolvingWithoutRateTry,
    cardsUnknownRevolving: carry.unknownRevolvingCards,
    cardTopRevolving: carry.perCard.filter(c => (c.revolvingTry ?? 0) > 0 && c.effectiveMonthlyRate != null)
      .sort((a, b) => b.effectiveMonthlyRate! - a.effectiveMonthlyRate!)
      .map(c => ({ name: c.name, revolvingTry: c.revolvingTry!, effectiveMonthlyRate: c.effectiveMonthlyRate! }))[0] ?? null,
    loanEarlyPayoffTry, loanMonthlyServiceTry, loansMissingRate,
    fixedExpenseMonthlyTry, totalFinancialDebtTry, netDebtTry, debtServiceRatio,
    receivablesPendingTry, receivablesByChannel,
    sellableStockTry, blockedStockTry, inTransitStockTry,
    last14dRevenueTry: last14, monthlyRunRateTry, monthlyCashCollectionTry, weeklyEstimateGrossTry, weeklyEstimateSource, revenueDataAgeDays,
    weeks, horizons, monthEnds, customs,
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
  // Kart: tasarruf yalnız DEVREDEN bakiyede ve kartın kendi efektif oranıyla (akdi × (1+KKDF+BSMV)). Dönem içi harcamayı erken
  // ödemek faiz kazandırmaz. Devreden ya da oran bilinmiyorsa getiri UNKNOWN (eskiden KMH oranı varsayılıyordu).
  const card = o.cardTopRevolving;
  opts.push(card
    ? { rank: rank++, name: `Kart devreden bakiyesi azaltma (${card.name})`, capital: Math.min(unit, card.revolvingTry),
        certainSavingMonthly: Math.min(unit, card.revolvingTry) * card.effectiveMonthlyRate, cashReliefMonthly: null,
        annualReturn: Math.min(unit, card.revolvingTry) * card.effectiveMonthlyRate * 12, annualRoi: card.effectiveMonthlyRate * 12,
        risk: "Çok düşük", liquidity: "Limit açılır", dataOk: true,
        advice: `Devreden ${Math.round(card.revolvingTry)} TL aylık %${(card.effectiveMonthlyRate * 100).toFixed(2)} (KKDF+BSMV dahil) işliyor — en pahalı borçlardan.` }
    : { rank: rank++, name: "Kredi kartı borcu azaltma", capital: unit, certainSavingMonthly: null, cashReliefMonthly: null,
        annualReturn: null, annualRoi: null, risk: "Çok düşük", liquidity: "İyileştirir", dataOk: false,
        advice: o.cardRevolvingTry > 0 ? "Devreden bakiyenin akdi faiz oranı girilmemiş — getiri hesaplanamıyor."
          : "Devreden (faiz işleyen) kart bakiyesi girilmemiş — dönem içi harcamayı erken ödemek faiz kazandırmaz." });

  for (const l of loans.filter((x) => x.status === "AKTIF")) {
    // cfo_loan.interestRatePct YILLIK tutulur (el kitabı v33 🔴; taksit/bakiye amortismanı da yıllık okumayla tutarlı).
    // 2026-10-07'ye kadar burada aylık sayılıyordu → kredi getirisi 12 kat şişiyordu (Garanti %620/yıl, 517k/ay tasarruf).
    const r = numOrNull(l.interestRatePct);
    const payoff = numOrNull(l.earlyPayoffTry);
    opts.push({
      rank: rank++, name: `${l.bank} — ${l.name} erken kapama`, capital: payoff,
      certainSavingMonthly: r != null && payoff != null ? payoff * (r / 100 / 12) : null,
      cashReliefMonthly: numOrNull(l.monthlyPaymentTry),
      annualReturn: r != null && payoff != null ? payoff * (r / 100) : null,
      annualRoi: r != null ? r / 100 : null,
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
