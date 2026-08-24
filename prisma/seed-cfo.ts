/**
 * Faz 90 — CFO modülü başlangıç verisi (idempotent).
 *
 * 24.08.2026 itibarıyla bilinen KESİN veriler. Rakam uydurulmamıştır;
 * bilinmeyen alanlar boş bırakılmış ve dataTag ile işaretlenmiştir.
 *
 * Çalıştırma: npm run db:seed:cfo
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function main() {
  console.log("🏦 CFO seed başlıyor…");

  // ── Ayarlar (tekil) ──
  const existing = await prisma.cfoSettings.findFirst();
  const settingsData = {
    usdTryRate: 45,
    usdRmbRate: 7,
    kmhMonthlyRatePct: 4.5,
    cardMinPct: 20,
    marketplaceTermDays: 30,
    cashConversionPct: 70,
    customsReserveTarget: 3_000_000,
    customsReserveDate: D("2026-09-30"),
    customsReserveSaved: 0,
    usdWealthTarget: 300_000,
    wealthTargetDate: D("2027-12-31"),
    last14dRevenueTry: 1_147_734.54,
    last14dRevenueDate: D("2026-08-23"),
    monthlyRevenueTarget1: 3_000_000,
    monthlyRevenueTarget2: 3_750_000,
    stockCostUsd: 100_000,
    blockedStockUsd: 40_000,
    stockCoverMonths: 4,
  };
  if (existing) await prisma.cfoSettings.update({ where: { id: existing.id }, data: settingsData });
  else await prisma.cfoSettings.create({ data: settingsData });
  console.log("   ✓ Ayarlar");

  // ── Bankalar / KMH ──
  const banks = [
    { name: "Yapı Kredi",  balanceTry: -269_000, kmhLimitTry:   500_000, sortOrder: 1, dataTag: "KESIN" as const, note: "Kullanılan KMH 269.000 TL" },
    { name: "Ziraat",      balanceTry: -200_000, kmhLimitTry: 1_000_000, sortOrder: 2, dataTag: "KESIN" as const, note: "Kullanılan KMH 200.000 TL" },
    { name: "Enpara",      balanceTry: 0,        kmhLimitTry:   500_000, sortOrder: 3, dataTag: "KESIN" as const, note: "KMH kullanılmıyor" },
    { name: "Garanti",     balanceTry: 0,        kmhLimitTry: 1_000_000, sortOrder: 4, dataTag: "KESIN" as const, note: "Şirket hesabı, KMH kullanılmıyor" },
    { name: "Garanti Alp", balanceTry: 0,        kmhLimitTry:   200_000, sortOrder: 5, dataTag: "KESIN" as const, note: "24.08.2026 kullanıcı bildirimi" },
    { name: "Akbank Alp",  balanceTry: 0,        kmhLimitTry:   250_000, sortOrder: 6, dataTag: "KESIN" as const, note: "24.08.2026: limit 500.000 -> 250.000 düzeltildi" },
  ];
  for (const b of banks) {
    const found = await prisma.cfoBankAccount.findFirst({ where: { name: b.name } });
    if (found) await prisma.cfoBankAccount.update({ where: { id: found.id }, data: { ...b, lastUpdatedAt: D("2026-08-24") } });
    else await prisma.cfoBankAccount.create({ data: { ...b, lastUpdatedAt: D("2026-08-24") } });
  }
  console.log(`   ✓ ${banks.length} banka hesabı`);

  // ── Kredi kartları ──
  const cards = [
    { bank: "Garanti", holder: "Alfa",  totalDebtTry: 850_000, dueDay: 27, currentMonthState: "TEYIT_EDILMELI" as const, sortOrder: 1, dataTag: "KESIN" as const, note: "27.08.2026 ödemesi teyit bekliyor. %20 asgari TAHMİNİDİR." },
    { bank: "Ziraat",  holder: "Şirket", totalDebtTry: 728_000, dueDay: 15, currentMonthState: "ODENDI" as const,        sortOrder: 2, dataTag: "KESIN" as const, note: "Ağustos asgarisi ödendi" },
    { bank: "Enpara",  holder: "Şirket", totalDebtTry: 180_000, dueDay: 10, currentMonthState: "ODENDI" as const,        sortOrder: 3, dataTag: "KESIN" as const, note: "Bu ayki kart borcu ödendi" },
    { bank: "Akbank",  holder: "Alp",    totalDebtTry: 150_000, dueDay: 24, currentMonthState: "ODENDI" as const,        sortOrder: 4, dataTag: "KESIN" as const, note: "24.08.2026: Ağustos asgarisi ödendi, kalan 150.000 TL" },
    { bank: "Garanti", holder: "Alp",    totalDebtTry:   5_000, dueDay: 15, statementDay: 8, currentMonthState: "ODENDI" as const, sortOrder: 5, dataTag: "KESIN" as const, note: "24.08.2026 bildirimi. Eski veri (32.000 TL + 1.130 USD) geçersiz." },
  ];
  for (const c of cards) {
    const found = await prisma.cfoCreditCard.findFirst({ where: { bank: c.bank, holder: c.holder } });
    if (found) await prisma.cfoCreditCard.update({ where: { id: found.id }, data: { ...c, lastUpdatedAt: D("2026-08-24") } });
    else await prisma.cfoCreditCard.create({ data: { ...c, lastUpdatedAt: D("2026-08-24") } });
  }
  console.log(`   ✓ ${cards.length} kredi kartı`);

  // ── Krediler ──
  const loans = [
    { bank: "Enpara",    name: "İhtiyaç/Ticari (3 taksit)", principalTry: 750_000, earlyPayoffTry: 0, monthlyPaymentTry: 269_079.91, paymentDay: 21, lastInstallmentDate: D("2026-08-21"), currentMonthState: "ODENDI" as const, status: "KAPANDI" as const, sortOrder: 1, dataTag: "KESIN" as const, strategy: "KAPANDI — gelecek borç servisinde sayılmaz.", note: "Son taksit 21.08.2026'da ödendi" },
    { bank: "Ziraat",    name: "Ziraat KGF / Kredi 1", earlyPayoffTry: 900_000, monthlyPaymentTry: 51_587.41, paymentDay: 21, nextPaymentDate: D("2026-09-21"), currentMonthState: "ODENDI" as const, status: "AKTIF" as const, priority: "Düşük", sortOrder: 2, dataTag: "KESIN" as const, strategy: "Faizi düşük — erken kapama önceliği düşük, işletme sermayesini koru." },
    { bank: "Ziraat",    name: "Ziraat Kredi 2", earlyPayoffTry: 900_000, monthlyPaymentTry: 29_750, paymentDay: 10, currentMonthState: "ODENDI" as const, status: "AKTIF" as const, priority: "Düşük", sortOrder: 3, dataTag: "GUNCELLEME_GEREKLI" as const, strategy: "Ödeme planı güncellenmeli — kesin taksit takvimi bilinmiyor.", note: "10.08.2026'da 29.750 TL ödendi" },
    { bank: "Garanti",   name: "Ticari kredi", principalTry: 2_000_000, earlyPayoffTry: 1_200_000, monthlyPaymentTry: 137_313.81, paymentDay: 16, nextPaymentDate: D("2026-09-16"), currentMonthState: "ODENDI" as const, status: "AKTIF" as const, priority: "Yüksek", sortOrder: 4, dataTag: "KESIN" as const, strategy: "2026 sonuna kadar kapatma adayı — ancak gümrük ödemesinden SONRA." },
    { bank: "Fibabanka", name: "Ticari kredi", principalTry: 500_000, earlyPayoffTry: 480_000, monthlyPaymentTry: 32_800, paymentDay: 24, nextPaymentDate: D("2026-09-24"), currentMonthState: "TEYIT_EDILMELI" as const, status: "AKTIF" as const, priority: "Yüksek", sortOrder: 5, dataTag: "KESIN" as const, strategy: "Garanti/YKB ile birlikte kapatma adayı." },
    { bank: "Yapı Kredi", name: "Ticari kredi", earlyPayoffTry: 300_000, monthlyPaymentTry: 33_277.20, paymentDay: 28, nextPaymentDate: D("2026-08-28"), lastInstallmentDate: D("2027-06-28"), currentMonthState: "ODENMEDI" as const, status: "AKTIF" as const, priority: "Yüksek", sortOrder: 6, dataTag: "KESIN" as const, strategy: "En küçük bakiye — en hızlı kapanabilecek kredi." },
  ];
  for (const l of loans) {
    const found = await prisma.cfoLoan.findFirst({ where: { bank: l.bank, name: l.name } });
    if (found) await prisma.cfoLoan.update({ where: { id: found.id }, data: { ...l, lastUpdatedAt: D("2026-08-24") } });
    else await prisma.cfoLoan.create({ data: { ...l, lastUpdatedAt: D("2026-08-24") } });
  }
  console.log(`   ✓ ${loans.length} kredi`);

  // ── Sabit giderler ──
  const expenses = [
    { name: "Fatih", category: "Personel/Ortak", monthlyTry: 60_000, sortOrder: 1 },
    { name: "Alperen", category: "Personel/Ortak", monthlyTry: 60_000, sortOrder: 2 },
    { name: "TTM kira", category: "Kira", monthlyTry: 32_500, sortOrder: 3 },
    { name: "TTM aidat", category: "Kira", monthlyTry: 6_500, sortOrder: 4 },
    { name: "TTM faturalar", category: "İşletme", monthlyTry: 10_000, sortOrder: 5 },
    { name: "Entegra + Ideasoft + yazılım", category: "Yazılım", monthlyTry: 15_000, sortOrder: 6 },
    { name: "Batıkan", category: "Personel", monthlyTry: 37_000, sortOrder: 7 },
    { name: "Alper Özcan", category: "Personel", monthlyTry: 49_000, sortOrder: 8 },
    { name: "Reklam + sorunlu ürün", category: "Pazarlama/Operasyon", monthlyTry: 10_000, sortOrder: 9 },
    { name: "SGK", category: "Vergi/SGK", monthlyTry: 45_000, sortOrder: 10 },
    { name: "Muhasebe", category: "Hizmet", monthlyTry: 15_000, sortOrder: 11 },
    { name: "Uzak masaüstü", category: "Yazılım", monthlyTry: 8_400, sortOrder: 12 },
  ];
  for (const e of expenses) {
    const found = await prisma.cfoFixedExpense.findFirst({ where: { name: e.name } });
    if (found) await prisma.cfoFixedExpense.update({ where: { id: found.id }, data: e });
    else await prisma.cfoFixedExpense.create({ data: e });
  }
  console.log(`   ✓ ${expenses.length} sabit gider (toplam 348.400 TL/ay)`);

  // ── Pazaryeri hakedişleri ──
  const receivables: Array<[string, string, number]> = [
    ["Trendyol", "2026-08-24",  95_752.67],
    ["Trendyol", "2026-08-27", 127_439.11],
    ["Trendyol", "2026-08-31",  92_975.84],
    ["Trendyol", "2026-09-03", 111_229.21],
    ["Trendyol", "2026-09-07", 153_058.81],
    ["Trendyol", "2026-09-10", 115_861.38],
    ["Trendyol", "2026-09-14",  81_873.09],
    ["Trendyol", "2026-09-17",  95_997.50],
    ["Trendyol", "2026-09-21",  63_550.29],
    ["Hepsiburada", "2026-08-25", 24_792.62],
    ["Hepsiburada", "2026-09-01", 56_899.83],
    ["Hepsiburada", "2026-09-08", 57_029.11],
    ["Hepsiburada", "2026-09-15", 53_835.68],
    ["Hepsiburada", "2026-09-22", 45_784.56],
    ["Hepsiburada", "2026-09-29", 12_870.52],
  ];
  for (const [channel, date, amount] of receivables) {
    const found = await prisma.cfoReceivable.findFirst({ where: { channel, dueDate: D(date) } });
    const data = { channel, dueDate: D(date), amountTry: amount, certainty: "KESIN" as const, source: "Pazaryeri ödeme ekranı 24.08.2026" };
    if (found) await prisma.cfoReceivable.update({ where: { id: found.id }, data });
    else await prisma.cfoReceivable.create({ data });
  }
  console.log(`   ✓ ${receivables.length} hakediş (Trendyol 937.737,90 + HB 251.212,32)`);

  // ── İthalat ──
  const imp = {
    code: "07.26sea", status: "YOLDA" as const, etaDate: D("2026-09-30"),
    totalCostUsd: 130_000, paidUsd: 130_000, customsEstimateTry: 3_000_000,
    expectedRevenueTry: 15_000_000, expectedProfitTry: 4_000_000, salesMonths: 6,
    dataTag: "TAHMINI" as const,
    note: "Ürün + navlun ödendi, vergi hariç. 3 mn TL gümrüğün 130.000 USD'ye dahil olup olmadığı TEYİT EDİLMELİ.",
  };
  const foundImp = await prisma.cfoImportProject.findUnique({ where: { code: imp.code } });
  if (foundImp) await prisma.cfoImportProject.update({ where: { code: imp.code }, data: imp });
  else await prisma.cfoImportProject.create({ data: imp });
  console.log("   ✓ 07.26sea ithalat partisi");

  // ── Nakit olayları (zorunlu çıkışlar — Eylül/Ekim/Kasım) ──
  await prisma.cfoCashEvent.deleteMany({ where: { autoGenerated: true } });
  const events: Array<{ d: string; kind: "KREDI_TAKSITI" | "KART_ODEMESI" | "SABIT_GIDER" | "VERGI_GUMRUK"; desc: string; bank?: string; out: number | null; certainty: "KESIN" | "TAHMINI"; debt?: string; note?: string }> = [];
  events.push({ d: "2026-08-24", kind: "KREDI_TAKSITI", desc: "Fibabanka taksiti", bank: "Fibabanka", out: 32_800, certainty: "KESIN", debt: "Fibabanka", note: "Ödeme durumu teyit edilmeli" });
  events.push({ d: "2026-08-27", kind: "KART_ODEMESI", desc: "Garanti Alfa kart asgarisi", bank: "Garanti", out: 170_000, certainty: "TAHMINI", debt: "Garanti Alfa KK", note: "%20 asgari varsayımı" });
  events.push({ d: "2026-08-28", kind: "KREDI_TAKSITI", desc: "Yapı Kredi taksiti", bank: "Yapı Kredi", out: 33_277.2, certainty: "KESIN", debt: "Yapı Kredi", note: "Henüz ödenmedi" });
  events.push({ d: "2026-09-30", kind: "VERGI_GUMRUK", desc: "07.26sea gümrük ve vergi ödemesi", out: 3_000_000, certainty: "TAHMINI", note: "ZORUNLU — gümrük rezervi bunun için" });
  const monthly: Array<[number, "KREDI_TAKSITI" | "KART_ODEMESI" | "SABIT_GIDER", string, string | undefined, number, string | undefined]> = [
    [1,  "SABIT_GIDER",   "Aylık sabit giderler (toplam)", undefined,    348_400,   undefined],
    [10, "KART_ODEMESI",  "Enpara kart asgarisi",          "Enpara",      36_000,   "Enpara KK"],
    [10, "KREDI_TAKSITI", "Ziraat Kredi 2 taksiti",        "Ziraat",      29_750,   "Ziraat Kredi 2"],
    [15, "KART_ODEMESI",  "Ziraat kart asgarisi",          "Ziraat",     145_600,   "Ziraat KK"],
    [15, "KART_ODEMESI",  "Garanti Alp kart asgarisi",     "Garanti",      1_000,   "Garanti Alp KK"],
    [16, "KREDI_TAKSITI", "Garanti ticari kredi taksiti",  "Garanti",    137_313.81,"Garanti kredi"],
    [21, "KREDI_TAKSITI", "Ziraat KGF taksiti",            "Ziraat",      51_587.41,"Ziraat KGF"],
    [24, "KART_ODEMESI",  "Akbank Alp kart asgarisi",      "Akbank",      30_000,   "Akbank Alp KK"],
    [24, "KREDI_TAKSITI", "Fibabanka taksiti",             "Fibabanka",   32_800,   "Fibabanka"],
    [27, "KART_ODEMESI",  "Garanti Alfa kart asgarisi",    "Garanti",    170_000,   "Garanti Alfa KK"],
    [28, "KREDI_TAKSITI", "Yapı Kredi taksiti",            "Yapı Kredi",  33_277.2, "Yapı Kredi"],
  ];
  for (const month of [9, 10, 11]) {
    for (const [day, kind, desc, bank, out, debt] of monthly) {
      const certain = month === 9 && [16, 21, 28].includes(day);
      events.push({
        d: `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        kind, desc, bank, out, certainty: certain ? "KESIN" : "TAHMINI", debt,
      });
    }
  }
  await prisma.cfoCashEvent.createMany({
    data: events.map((e) => ({
      eventDate: D(e.d), kind: e.kind, description: e.desc, bank: e.bank ?? null,
      outflowTry: e.out, certainty: e.certainty, relatedDebt: e.debt ?? null,
      autoGenerated: true, note: e.note ?? null,
    })),
  });
  console.log(`   ✓ ${events.length} nakit olayı`);

  console.log("✅ CFO seed tamamlandı.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
