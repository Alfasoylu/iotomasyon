/**
 * Decision Memory (lib/cfo/decision-memory.ts) — saf, DB yok. Fikstürler 07.10 üretim cfo_hamle satırları.
 * Çalıştır: node --import tsx __tests__/cfo-decision-memory.test.ts
 */
import assert from "node:assert/strict";
import { deadlineOf, evaluateHamle, resolveMetric, summarize, type Hamle } from "../lib/cfo/decision-memory";

const h = (o: Partial<Hamle> & Pick<Hamle, "kod">): Hamle => ({ baslik: o.kod, kararTarihi: "2026-09-21", durum: "UYGULANDI", baslangicMetrik: null, baslangicDeger: null,
  beklenenEtki: null, beklenenDeger: null, olcumMetrigi: null, ilkOlcumTarihi: null, gerceklesenDeger: null, ...o });
const TODAY = "2026-10-07";

// Metrik eşleme (Türkçe metin, sıra: özel olan önce)
assert.equal(resolveMetric("Net borç (TL) — cfo_odeme/servet borç tarafı"), "debt_try");
assert.equal(resolveMetric("Kart + KMH borcu toplamı"), "card_kmh_try");
assert.equal(resolveMetric("Akbank Alp + Garanti Alp toplam borcu Şahsi kart borcu (TL)"), "personal_card_try");
assert.equal(resolveMetric("Kart borcu (TL)"), "card_try");
assert.equal(resolveMetric("Kamu kanalı aylık ciro (cfo_pay_obs KURUMSAL_*)"), "kamu_monthly_try");
assert.equal(resolveMetric("90 gunluk FBA cirosu (TL)"), "fba_90d_try");
assert.equal(resolveMetric("Satilan set adedi ve kar"), null, "eşleşmeyen → UNMEASURED");

// H09: 21.09'da net borç 9.113.838, hedef 31.12.2026'da 6.000.000; bugün 9.239.814 → TERS yön
const h09 = h({ kod: "H09", baslangicMetrik: "Net borç (TL)", baslangicDeger: 9113838, beklenenEtki: "31.12.2026 net borç 6.000.000", beklenenDeger: 6000000,
  olcumMetrigi: "Net borç (TL) — cfo_odeme/servet borç tarafı", ilkOlcumTarihi: "2026-10-31" });
assert.equal(deadlineOf(h09), "2026-12-31", "metindeki tarih ilk ölçüm tarihinden önce gelir");
const e09 = evaluateHamle(h09, 9239814, TODAY);
assert.equal(e09.status, "WRONG_DIRECTION");
assert.ok(e09.progress! < 0);
assert.equal(Math.round(e09.requiredPerDay!), Math.round((6000000 - 9239814) / 85), "kalan 85 günde gereken günlük düşüş");

// H12: şahsi kart 349.335 → hedef 0 (22.11); bugün 349.335 → ilerleme %0, sürenin %31'i geçti → BEHIND
const e12 = evaluateHamle(h({ kod: "H12", kararTarihi: "2026-10-03", baslangicMetrik: "Şahsi kart borcu (TL)", baslangicDeger: 349335, beklenenDeger: 0,
  olcumMetrigi: "Akbank Alp + Garanti Alp toplam borcu", ilkOlcumTarihi: "2026-11-22" }), 349335, TODAY);
assert.equal(e12.status, "ON_TRACK", "4 gün / 50 gün = %8 süre, %0 ilerleme → henüz tolerans içinde");
assert.equal(evaluateHamle(h({ kod: "H12b", kararTarihi: "2026-10-03", baslangicMetrik: "Şahsi kart borcu", baslangicDeger: 349335, beklenenDeger: 0,
  olcumMetrigi: "şahsi kart", ilkOlcumTarihi: "2026-11-22" }), 349335, "2026-10-25").status, "BEHIND", "22 gün sonra hâlâ %0 → geride");

// H07: hedef sayısı yok, kart borcu 2.031.772 → 2.420.289 → ters yönde
const e07 = evaluateHamle(h({ kod: "H07", baslangicMetrik: "Kart borcu (TL)", baslangicDeger: 2031772, olcumMetrigi: "Kart borcu (TL)", ilkOlcumTarihi: "2026-11-30" }), 2420289, TODAY);
assert.equal(e07.status, "WORSENING"); assert.match(e07.note, /TERS/);

// Ciro metriği: yukarı iyi
assert.equal(evaluateHamle(h({ kod: "H10", baslangicMetrik: "Kamu satışı (TL/ay)", baslangicDeger: 24001, olcumMetrigi: "Kamu kanalı aylık ciro" }), 60000, TODAY).status, "IMPROVING");
// Başarılı
assert.equal(evaluateHamle(h({ kod: "A", baslangicDeger: 100, beklenenDeger: 50, olcumMetrigi: "Net borç" }), 40, TODAY).status, "ACHIEVED");

// Kapalı kararlar: isabet yalnız beklenen SAYI varsa ölçülür
const closedNoNumber = evaluateHamle(h({ kod: "H01", durum: "SONUCLANDI", baslangicDeger: 2.2, gerceklesenDeger: 20.8 }), null, TODAY);
assert.equal(closedNoNumber.status, "CLOSED"); assert.equal(closedNoNumber.calibrationError, null);
const closedCal = evaluateHamle(h({ kod: "C", durum: "SONUCLANDI", baslangicDeger: 100, beklenenDeger: 50, gerceklesenDeger: 60 }), null, TODAY);
assert.equal(closedCal.calibrationError, 0.2, "|60−50| / |50−100|");

// Ölçülemeyen ve başlangıçsız
assert.equal(evaluateHamle(h({ kod: "H06", olcumMetrigi: "Satilan set adedi ve kar" }), null, TODAY).status, "UNMEASURED");
assert.equal(evaluateHamle(h({ kod: "N", olcumMetrigi: "Net borç" }), 9e6, TODAY).status, "NO_BASELINE");

// Özet: kötü haber önce; kalibrasyon sayımı
const s = summarize([e07, e09, e12, closedNoNumber, closedCal]);
assert.equal(s.evals[0].kod, "H09", "TERS yön ilk sırada");
assert.deepEqual(s.calibration, { measured: 1, meanError: 0.2, unmeasurableClosed: 1 });
console.log("CFO decision memory: metric mapping, deadline parsing, progress vs time path, wrong-direction / behind / achieved, closed-decision calibration passed");
