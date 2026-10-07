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
  { date: "2026-10-07", bank: "Fibabanka", amountTry: -700, settled: true, label: "Eşlenmeyen" },           // hesap yok → raporlanır
  { date: "2026-10-05", bank: "Fibabanka", amountTry: -300, settled: false, label: "Eski eşlenmeyen" },     // en son bakiye gününden (06.10) önce → sayılmaz
], "2026-10-07");
const by = (n: string) => r.accounts.find(a => a.name === n)!;
assert.equal(by("Ziraat").projectedTry, 100000, "güncelleme günündeki kalem bakiyede");
assert.equal(by("Yapı Kredi").projectedTry, 20000 + 15000 - 3000, "tarihi geçmiş giriş ve çıkış eklenir; bugünkü ödenmemiş eklenmez");
assert.equal(by("Yapı Kredi").movements, 2);
assert.equal(by("Akbank Alp").projectedTry, 4000, "bugün ama ödendi işaretli");
assert.equal(by("Ziraat USD (şirket)").projectedTry, 50000, "hareketsiz hesap aynen kalır");
assert.deepEqual(r.unmapped, [{ label: "Eşlenmeyen", bank: "Fibabanka", amountTry: -700, reason: "hesap bulunamadı: Fibabanka" }], "eşlenmeyen uydurulmaz, raporlanır");
assert.equal(r.anchorTotalTry, 178000); assert.equal(r.accountsProjectedTry, 178000 + 12000 - 1000);
assert.equal(r.unassignedTry, -700); assert.equal(r.projectedTotalTry, 178000 + 12000 - 1000 - 700, "hesabı belirsiz kalem şirket toplamından düşülür");

// Bankasız çıkış (07.10: 100.000 TL sabit gider, bakiyeler toplamı 57.764) HİÇBİR hesaba atanmaz; nedeniyle raporlanır.
// En son bakiye gününden (06.10) önceki bankasız kalem çift düşülmez: hangi hesaptan çıktıysa o bakiyede.
const u = rollForwardBalances(accounts, [
  { date: "2026-10-07", bank: null, amountTry: -100000, settled: true, label: "Sabit gider kalanı" },
  { date: "2026-10-05", bank: null, amountTry: -400, settled: false, label: "Eski bankasız" },
  { date: "2026-10-06", bank: "IDEASOFT?", amountTry: 900, settled: false, label: "IDEASOFT hakediş", reason: "sözlükte banka ölçülmedi (OLCULMEDI)" },
], "2026-10-08");
assert.deepEqual(u.accounts.map(a => a.projectedTry), accounts.map(a => a.balanceTry), "hiçbir hesap değişmez");
assert.deepEqual(u.unmapped.map(x => x.reason), ["takvimde banka yok"], "06.10 ve öncesi en son bakiyede; yalnız 07.10 kalemi");
assert.equal(u.projectedTotalTry, 178000 - 100000);

// Güncelleme günü İstanbul saatiyle: 05.10 22:30 UTC = 06.10 01:30 İstanbul → 06.10 kalemi bakiyede sayılır
const late = rollForwardBalances([{ name: "Enpara", balanceTry: 1000, lastUpdatedAt: "2026-10-05T22:30:00.000Z" }],
  [{ date: "2026-10-06", bank: "Enpara", amountTry: -500, settled: true, label: "x" }], "2026-10-07");
assert.equal(late.accounts[0].anchorDate, "2026-10-06"); assert.equal(late.accounts[0].projectedTry, 1000);

console.log("AI CFO bank roll-forward: anchor-day items stay in balance, passed-date items added, today only if settled, future excluded, brand→account mapping, unmapped reported with reason, bank-less items only hit the company total passed");
