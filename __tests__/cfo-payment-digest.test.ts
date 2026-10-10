import assert from "node:assert/strict";
import { overduePaymentsSql, paymentDigestParams, shortLabel, upcomingPaymentsSql, type DigestRow } from "../lib/cfo-agent/payment-digest";

// Günlük ödeme özeti (Alperen 2026-10-10): en yakın 5 ödenmemiş çıkış, kısa etiket, toplam, tahmini işareti, vadesi geçmiş sayısı;
// Meta parametre kuralı (satır sonu/sekme yok, uzunluk sınırı); SQL ödeme takvimiyle aynı filtre. Çalıştır: node --import tsx __tests__/cfo-payment-digest.test.ts
const R = (due: string, description: string, amountTry: number, certainty = "KESIN"): DigestRow => ({ due, kind: "X", description, amountTry, certainty });
const rows = [
  R("2026-10-13", "TTM aidat — Ekim 6.500 TL. 01.10 ana sabit gider kaydinda", 6500),
  R("2026-10-13", "Garanti Alp (sahsi kart) KAPATMA — 5.000 TL.", 5000),
  R("2026-10-14", "07.26sea gumruk vergisi DILIM 1/2 — eviye disi 7 kalem", 1965467.83),
  R("2026-10-15", "Ziraat kart asgarisi", 69966.13),
  R("2026-10-16", "Garanti ticari kredi taksiti (TAHMINI 137.313,81)", 137313.81, "TAHMINI"),
  R("2026-10-21", "Ziraat KGF taksiti", 51587.41),
];
assert.equal(shortLabel(rows[0].description), "TTM aidat");
assert.equal(shortLabel(rows[1].description), "Garanti Alp");
assert.equal(shortLabel(rows[2].description), "07.26sea gumruk vergisi DILIM 1/2");
assert.ok(shortLabel("x".repeat(80)).length <= 34);

const [head, list] = paymentDigestParams(rows, 2, "2026-10-10");
assert.equal(head, "Günlük ödeme özeti 10.10 — en yakın 5 ödeme, toplam 2.184.248 TL (+2 vadesi geçmiş, işaretlenmemiş)");
assert.equal(list, "1) 13.10 TTM aidat 6.500 TL · 2) 13.10 Garanti Alp 5.000 TL · 3) 14.10 07.26sea gumruk vergisi DILIM 1/2 1.965.468 TL · "
  + "4) 15.10 Ziraat kart asgarisi 69.966 TL · 5) 16.10 Garanti ticari kredi taksiti 137.314 TL (tahmini)");
assert.ok(!list.includes("21.10"), "yalnız en yakın 5");
for (const p of [head, list]) assert.ok(!/[\n\t]/.test(p) && !/ {5,}/.test(p), "Meta parametre kuralı");
assert.ok(head.length <= 200 && list.length <= 600);

assert.deepEqual(paymentDigestParams([], 0, "2026-10-10"), ["Günlük ödeme özeti 10.10 — yaklaşan ödenmemiş ödeme yok", "Takvimde bugünden sonra ödenmemiş çıkış yok"]);

const sql = upcomingPaymentsSql("2026-10-10");
for (const m of [`not "isSettled"`, `coalesce("outflowTry", 0) > 0`, `"eventDate"::date >= '2026-10-10'::date`, "limit 5"]) assert.ok(sql.includes(m), m);
assert.ok(overduePaymentsSql("2026-10-10").includes(`"eventDate"::date < '2026-10-10'::date`));
assert.throws(() => upcomingPaymentsSql("2026-10-10'; drop"), /YYYY-MM-DD/);
console.log("CFO günlük ödeme özeti: en yakın 5, kısa etiket, toplam, tahmini, vadesi geçmiş, Meta kuralı, SQL filtresi passed");
