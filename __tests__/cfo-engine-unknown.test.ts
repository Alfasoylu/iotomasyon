/**
 * CFO-014 kısım 2 (RF-016): eski motor (lib/cfo/engine.ts) bilinmeyeni 0 / gizli varsayılanla doldurmaz. Saf, DB yok.
 * Çalıştır: node --import tsx __tests__/cfo-engine-unknown.test.ts
 */
import assert from "node:assert/strict";
import { computeCfo, type CfoInput } from "../lib/cfo/engine";

const today = new Date(2026, 9, 10);
const S = (o: Record<string, unknown>) => o as unknown as CfoInput["settings"];
const loan = (name: string, earlyPayoffTry: number | null, monthlyPaymentTry: number | null) =>
  ({ id: name, bank: "Ziraat", name, status: "AKTIF", earlyPayoffTry, monthlyPaymentTry, interestRatePct: 40, currentMonthState: "ODENDI" }) as unknown as CfoInput["loans"][number];
const card = (bank: string, totalDebtTry: number, minOverrideTry: number | null = null) =>
  ({ id: bank, bank, holder: null, totalDebtTry, statementDebtTry: null, minOverrideTry, currentMonthState: "ODENDI" }) as unknown as CfoInput["cards"][number];
const base = (o: Partial<CfoInput>): CfoInput => ({ settings: null, banks: [], cards: [], loans: [], expenses: [], receivables: [], cashEvents: [], imports: [],
  today, forecast: [], revenue14: { amountTry: 140000, through: "2026-10-09", source: "test" } as CfoInput["revenue14"], ...o });

// Tam veri: davranış aynı (oranlar ayardan, kredi/kart toplamları)
const full = computeCfo(base({ settings: S({ cardMinPct: 20, cashConversionPct: 70 }), loans: [loan("A", 500000, 20000)], cards: [card("Garanti", 100000)] }));
assert.deepEqual([full.loanEarlyPayoffTry, full.loanMonthlyServiceTry, full.cardMinTotalTry, full.totalFinancialDebtTry], [500000, 20000, 20000, 600000]);
assert.equal(full.monthlyCashCollectionTry, 140000 / 14 * 30 * 0.7);
assert.equal(Math.round(full.monthlyOperatingCashTry!), Math.round(210000 - 40000));
assert.equal(full.debtServiceRatio, 40000 / 210000);

// Erken kapama / taksit eksik kredi 0 SAYILMAZ → toplam borç, net borç, servis BİLİNMİYOR + Dikkat satırı
const miss = computeCfo(base({ settings: S({ cardMinPct: 20, cashConversionPct: 70 }), loans: [loan("A", 500000, 20000), loan("B", null, null)] }));
assert.deepEqual([miss.loanEarlyPayoffTry, miss.loanMonthlyServiceTry, miss.totalFinancialDebtTry, miss.netDebtTry, miss.loansMissingPayoff], [null, null, null, null, 1]);
assert.deepEqual([miss.monthlyOperatingCashTry, miss.debtServiceRatio], [null, null]);
assert.ok(miss.needsAttention.some(n => n.item.endsWith("B") && /Erken kapama/.test(n.reason)));
assert.ok(miss.needsAttention.some(n => n.item.endsWith("B") && /taksit/.test(n.reason)));

// Kart asgari oranı ayarda yoksa %20 VARSAYILMAZ; kart bazında asgari girilmişse o kullanılır
const noPct = computeCfo(base({ settings: S({ cashConversionPct: 70 }), cards: [card("Garanti", 100000), card("Ziraat", 50000, 3000)] }));
assert.equal(noPct.cardMinTotalTry, null);
assert.ok(noPct.needsAttention.some(n => n.area === "Kredi kartı" && /Asgari ödeme bilinmiyor/.test(n.reason)));
assert.equal(computeCfo(base({ settings: S({ cashConversionPct: 70 }), cards: [card("Ziraat", 50000, 3000)] })).cardMinTotalTry, 3000);

// Nakde dönüşüm oranı yoksa %70 VARSAYILMAZ; tahsilat bilinmiyorken faaliyet nakdi "−giderler" (sahte kırmızı) değil BİLİNMİYOR
const noConv = computeCfo(base({ settings: S({ cardMinPct: 20 }), expenses: [{ isActive: true, monthlyTry: 100000 } as unknown as CfoInput["expenses"][number]] }));
assert.deepEqual([noConv.monthlyCashCollectionTry, noConv.monthlyOperatingCashTry], [null, null]);
assert.ok(noConv.needsAttention.some(n => n.item === "Nakde dönüşüm oranı"));

// Ayar satırı yoksa eski sabit stok alanları 0 değil null; ciro yoksa yedek haftalık brüt tahmin null, haftalar yalnız gerçek hakedişle
const bare = computeCfo(base({ revenue14: null, forecast: null }));
assert.deepEqual([bare.sellableStockTry, bare.blockedStockTry, bare.weeklyEstimateGrossTry, bare.monthlyCashCollectionTry], [null, null, null, null]);
assert.ok(bare.weeks.every(w => w.net === 0 && w.gross === w.actual), "bilinmeyen ciro tahmini tahsilat üretmez");

console.log("CFO engine UNKNOWN (CFO-014/RF-016): kredi erken kapama/taksit, kart asgari oranı, nakde dönüşüm, faaliyet nakdi, eski stok alanları, yedek haftalık tahmin passed");
