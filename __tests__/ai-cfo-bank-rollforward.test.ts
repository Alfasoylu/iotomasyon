import assert from "node:assert/strict";
import { resolveAccount, rollForwardBalances, type RfAccount } from "../lib/cfo-agent/bank-rollforward";

// Banka bakiyesi ileri taşıma (2026-10-07 kararı): bakiye haftalık girilir; arada takvimde tarihi geçmiş kalemler eklenir.
const accounts: RfAccount[] = [
  { name: "Ziraat", balanceTry: 100000, lastUpdatedAt: "2026-10-06T17:13:00.000Z" },
  { name: "Ziraat USD (şirket)", balanceTry: 50000, lastUpdatedAt: "2026-09-17T13:37:00.000Z" },
  { name: "Yapı Kredi", balanceTry: 20000, lastUpdatedAt: "2026-10-03T10:00:00.000Z" },
  { name: "Akbank Alp", balanceTry: 5000, lastUpdatedAt: "2026-10-04T14:28:00.000Z" },
  { name: "Garanti", balanceTry: 1000, lastUpdatedAt: "2026-10-04T14:28:00.000Z" },
  { name: "Garanti Alp", balanceTry: 2000, lastUpdatedAt: "2026-10-04T14:28:00.000Z" },
];

// Eşleme: birebir ad önce; yoksa markada tek hesap; büyük harf/Türkçe karakter duyarsız
assert.equal(resolveAccount("ZIRAAT", accounts)?.name, "Ziraat", "birebir ad, USD hesabı değil");
assert.equal(resolveAccount("Akbank", accounts)?.name, "Akbank Alp", "markada tek hesap");
assert.equal(resolveAccount("Garanti", accounts)?.name, "Garanti", "birebir ad iki Garanti hesabından önce gelir");
assert.equal(resolveAccount("Fibabanka", accounts), null, "hesap yoksa eşlenmez");
assert.equal(resolveAccount(null, accounts), null);

const r = rollForwardBalances(accounts, [
  { date: "2026-10-06", bank: "Ziraat", amountTry: -29750, settled: true, label: "Kredi taksiti" },       // bakiye aynı gün girildi → dahil, eklenmez
  { date: "2026-10-05", bank: "Yapı Kredi", amountTry: 15000, settled: false, label: "Trendyol hakediş" }, // tarihi geçti → eklenir
  { date: "2026-10-04", bank: "Yapı Kredi", amountTry: -3000, settled: false, label: "Sabit gider" },     // tarihi geçti → eklenir
  { date: "2026-10-07", bank: "Yapı Kredi", amountTry: -9999, settled: false, label: "Bugün, ödenmedi" },  // bugün, işaret yok → henüz değil
  { date: "2026-10-07", bank: "Akbank", amountTry: -1000, settled: true, label: "Bugün ödendi" },          // bugün ama ödendi → eklenir
  { date: "2026-10-08", bank: "Ziraat", amountTry: -50000, settled: false, label: "Yarın" },               // gelecek → eklenmez
  { date: "2026-10-05", bank: "Fibabanka", amountTry: -700, settled: false, label: "Eşlenmeyen" },          // hesap yok → raporlanır
], "2026-10-07");
const by = (n: string) => r.accounts.find(a => a.name === n)!;
assert.equal(by("Ziraat").projectedTry, 100000, "güncelleme günündeki kalem bakiyede");
assert.equal(by("Yapı Kredi").projectedTry, 20000 + 15000 - 3000, "tarihi geçmiş giriş ve çıkış eklenir; bugünkü ödenmemiş eklenmez");
assert.equal(by("Yapı Kredi").movements, 2);
assert.equal(by("Akbank Alp").projectedTry, 4000, "bugün ama ödendi işaretli");
assert.equal(by("Ziraat USD (şirket)").projectedTry, 50000, "hareketsiz hesap aynen kalır");
assert.deepEqual(r.unmapped, [{ label: "Eşlenmeyen", bank: "Fibabanka", amountTry: -700 }], "eşlenmeyen uydurulmaz, raporlanır");
assert.equal(r.anchorTotalTry, 178000); assert.equal(r.projectedTotalTry, 178000 + 12000 - 1000);

// Güncelleme günü İstanbul saatiyle: 05.10 22:30 UTC = 06.10 01:30 İstanbul → 06.10 kalemi bakiyede sayılır
const late = rollForwardBalances([{ name: "Enpara", balanceTry: 1000, lastUpdatedAt: "2026-10-05T22:30:00.000Z" }],
  [{ date: "2026-10-06", bank: "Enpara", amountTry: -500, settled: true, label: "x" }], "2026-10-07");
assert.equal(late.accounts[0].anchorDate, "2026-10-06"); assert.equal(late.accounts[0].projectedTry, 1000);

console.log("AI CFO bank roll-forward: anchor-day items stay in balance, passed-date items added, today only if settled, future excluded, brand→account mapping, unmapped reported passed");
