/**
 * Eski motor (lib/cfo/engine.ts) manşet nakit/KMH = yalnız ŞİRKET hesapları (CFO-006 kuralı, sözleşme cfo_nakit_kapisi ile aynı).
 * Şahsi hesaplar ayrı alanda; kademeli faizde PERSONAL dilimi "son çare". Fikstür = üretim 10.10 hesap kümesi (bakiye/limit).
 * Saf, DB yok. Çalıştır: node --import tsx __tests__/cfo-engine-sahsi.test.ts
 */
import assert from "node:assert/strict";
import { computeCfo, type CfoInput } from "../lib/cfo/engine";

const today = new Date(2026, 9, 10);
const bank = (name: string, accountType: string, balanceTry: number | null, kmhLimitTry: number, monthlyRatePct: number | null = null) =>
  ({ id: name, name, accountType, balanceTry, kmhLimitTry, monthlyRatePct, dataTag: "KESIN", note: null, lastUpdatedAt: today }) as unknown as CfoInput["banks"][number];
const S = "Vadesiz + KMH (ŞAHSİ)";
const banks = [
  bank("Akbank Alp", S, 83.29, 250000), bank("Garanti Alperen (şahsi)", S, 0, 150000), bank("İş Bankası Alperen (şahsi)", S, 0, 100000),
  bank("Yapı Kredi Alperen (şahsi)", S, 0, 100000), bank("Ziraat Alperen (şahsi)", S, 0, 750000),
  bank("Enpara", "Vadesiz + KMH", 826.53, 109300), bank("Fibabanka Kiraz (şirket)", "Vadesiz", 246.40, 0), bank("Garanti", "Vadesiz + KMH", 0.22, 500000),
  bank("Garanti USD (sirket)", "Vadesiz DÖVİZ", 29.83, 0), bank("Yapı Kredi", "Vadesiz + KMH", 788.49, 500000), bank("Yapı Kredi TL-2 (şirket)", "Vadesiz", 0, 0),
  bank("Yapı Kredi USD (şirket)", "Vadesiz DÖVİZ", 1242.24, 0), bank("Ziraat", "Vadesiz + KMH", 147910.80, 250000, 4.083), bank("Ziraat USD (şirket)", "Vadesiz DÖVİZ", 425.56, 0),
];
const o = computeCfo({ settings: null, banks, cards: [], loans: [], expenses: [], receivables: [], cashEvents: [], imports: [], today, forecast: [] });
// Üretim sözleşmesi cfo_nakit_kapisi 10.10: nakit_try 151.470,07 · kmh_limit_try 1.359.300
assert.equal(Math.round(o.netCashTry * 100) / 100, 151470.07, "net banka = şirket hesapları (şahsi 83,29 hariç)");
assert.deepEqual([o.totalKmhLimitTry, o.freeKmhTry, o.usedKmhTry], [1359300, 1359300, 0], "boş KMH yalnız şirket (eskiden 2.709.300 — şahsi 1,35M dahil)");
assert.deepEqual(o.personal, { cashTry: 83.29, usedKmhTry: 0, freeKmhTry: 1350000, kmhLimitTry: 1350000, accounts: 5, missingBalance: 0 });
// Kademeli faizde şahsi dilim "son çare" olarak durur (kapasite manşetine girmez)
assert.equal(o.kmh.slices.filter(s => s.tier === "PERSONAL").reduce((a, s) => a + s.limitTry, 0), 1350000);
assert.equal(o.kmh.slices.filter(s => s.tier === "GENERAL").reduce((a, s) => a + s.limitTry, 0), 1359300);
// Şahsi hesap eksiye düşse de şirket nakdi/KMH kullanımını ve faizini etkilemez; bakiyesi bilinmeyen şahsi hesap şirket "eksik" sayacına girmez
const p = computeCfo({ settings: null, banks: [bank("Ziraat", "Vadesiz + KMH", -100000, 250000, 4), bank("Ziraat Alperen (şahsi)", S, -50000, 750000, 5), bank("X (şahsi)", S, null, 100000)],
  cards: [], loans: [], expenses: [], receivables: [], cashEvents: [], imports: [], today, forecast: [] });
assert.deepEqual([p.netCashTry, p.usedKmhTry, p.freeKmhTry, p.kmhInterestMonthlyTry, p.banksMissingBalance], [-100000, 100000, 150000, 4000, 0]);
assert.deepEqual([p.personal.cashTry, p.personal.usedKmhTry, p.personal.freeKmhTry, p.personal.missingBalance], [-50000, 50000, 700000, 1]);
console.log("CFO eski motor şirket/şahsi: manşet nakit ve KMH yalnız şirket (= cfo_nakit_kapisi üretim 10.10), şahsi ayrı alan + son çare dilimi passed");
