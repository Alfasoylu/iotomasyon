/**
 * Decision Memory (lib/cfo/decision-memory.ts) — saf, DB yok. Fikstürler 07.10 üretim cfo_hamle satırları.
 * Çalıştır: node --import tsx __tests__/cfo-decision-memory.test.ts
 */
import assert from "node:assert/strict";
import { deadlineOf, evaluateHamle, newHamleRow, parseTrNumber, planMeasurements, proposalDrafts, resolveMetric, scoreHamle, summarize, validateNewHamle,
  type Hamle, type NewHamle } from "../lib/cfo/decision-memory";

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
assert.deepEqual(s.calibration, { measured: 1, meanError: 0.2, unmeasurableClosed: 1, hitRate: 0, bias: 0.2, coverage: 0.6 },
  "C: borç 100→50 beklendi, 60 gerçekleşti → ıska, +0,2 iyimser; 5 kararın 3'ünde beklenen SAYI var");

// ── CFO-012 (2026-10-10) ──
// (a) yeni karar: beklenen SAYI + başlangıç + ölçülebilir metrik + tarih zorunlu
const ok: NewHamle = { kod: "H13-KMH-KAPAT", baslik: "KMH kapat", kararTarihi: "2026-10-10", alan: "borç", neden: "faiz yükü", yapilan: "nakit KMH'ye",
  metric: "card_kmh_try", baslangicDeger: 2366017, beklenenDeger: 1500000, ilkOlcumTarihi: "2026-11-30" };
assert.deepEqual(validateNewHamle(ok), []);
assert.ok(validateNewHamle({ ...ok, beklenenDeger: NaN }).some(e => /beklenen değer zorunlu/.test(e)), "beklenen SAYI yoksa reddedilir");
assert.ok(validateNewHamle({ ...ok, beklenenDeger: ok.baslangicDeger }).some(e => /farklı/.test(e)));
assert.ok(validateNewHamle({ ...ok, metric: "Satilan set adedi" as NewHamle["metric"] }).some(e => /ölçülebilen/.test(e)), "serbest metin metrik reddedilir");
assert.ok(validateNewHamle({ ...ok, metric: "toString" as NewHamle["metric"] }).some(e => /ölçülebilen/.test(e)), "prototip anahtarı metrik sayılmaz");
assert.ok(validateNewHamle({ ...ok, ilkOlcumTarihi: "2026-10-10" }).some(e => /sonra/.test(e)));
assert.ok(validateNewHamle({ ...ok, kod: "h13 küçük" }).length > 0);
assert.deepEqual([parseTrNumber("6.000.000"), parseTrNumber("1.234,5"), parseTrNumber("-12,5"), parseTrNumber("1500000"), parseTrNumber(""), parseTrNumber("abc")].map(String),
  ["6000000", "1234.5", "-12.5", "1500000", "NaN", "NaN"], "boş sayı 0 değil NaN");
const row = newHamleRow(ok);
assert.equal(resolveMetric(`${row.olcum_metrigi} ${row.baslangic_metrik}`), "card_kmh_try", "kayıt satırı metrik anahtarıyla başlar → kesin çözülür");
assert.equal(deadlineOf({ ...h({ kod: "x" }), beklenenEtki: row.beklenen_etki, ilkOlcumTarihi: row.ilk_olcum_tarihi }), "2026-11-30");
assert.equal(row.durum, "KARAR_VERILDI");
// okuma tarafı bayrağı: kural tarihinden sonra beklenen SAYI'sız açık karar
assert.equal(evaluateHamle(h({ kod: "Y", createdAt: "2026-10-11", olcumMetrigi: "Net borç", baslangicDeger: 9e6 }), 9e6, "2026-10-12").status, "MISSING_EXPECTATION");
assert.notEqual(evaluateHamle(h({ kod: "E", createdAt: "2026-09-17", olcumMetrigi: "Net borç", baslangicDeger: 9e6 }), 9e6, TODAY).status, "MISSING_EXPECTATION", "eski kayıt bayraklanmaz");
assert.equal(evaluateHamle(h({ kod: "Z", createdAt: "2026-10-11", durum: "GERI_ALINDI" }), null, "2026-10-12").status, "CLOSED");

// (b) ölçüm planı: kontrol noktaları (ilk ölçüm, hedef tarihi); as-of metrik ertesi gün o günün değeriyle, canlı bakiye bugünkü değerle
const h09p = { ...h09, durum: "UYGULANDI" };
const h11 = h({ kod: "H11", baslangicMetrik: "Kart + KMH borcu", baslangicDeger: 2366017, beklenenDeger: 1000000, olcumMetrigi: "Kart + KMH borcu toplamı", ilkOlcumTarihi: "2026-10-31" });
const h06 = h({ kod: "H06", durum: "OLCULUYOR", olcumMetrigi: "Satilan set adedi ve kar", ilkOlcumTarihi: "2026-10-31" });
const h01 = h({ kod: "H01", durum: "SONUCLANDI", olcumMetrigi: "Net borç", ilkOlcumTarihi: "2026-05-01" });
assert.deepEqual(planMeasurements([h09p, h11, h06, h01], new Map(), "2026-10-10"), [], "kontrol noktası gelmedi");
assert.deepEqual(planMeasurements([h09p, h11, h06, h01], new Map(), "2026-10-31"),
  [{ kod: "H11", metric: "card_kmh_try", checkpoint: "2026-10-31", date: "2026-10-31", asOf: false }], "borç günü kapanmadan ölçülmez; canlı bakiye aynı gün");
assert.deepEqual(planMeasurements([h09p, h11], new Map(), "2026-11-02"), [
  { kod: "H09", metric: "debt_try", checkpoint: "2026-10-31", date: "2026-10-31", asOf: true },
  { kod: "H11", metric: "card_kmh_try", checkpoint: "2026-10-31", date: "2026-11-02", asOf: false }]);
assert.deepEqual(planMeasurements([h09p, h11], new Map([["H09", [{ date: "2026-10-31", value: 9e6 }]], ["H11", [{ date: "2026-11-01", value: 2e6 }]]]), "2026-11-02"), [],
  "kontrol noktası ve sonrası ölçüm varsa tekrar yazılmaz");
assert.deepEqual(planMeasurements([h09p], new Map([["H09", [{ date: "2026-10-31", value: 9e6 }]]]), "2027-01-03").map(p => p.checkpoint), ["2026-12-31"], "hedef tarihi ayrı kontrol noktası");
assert.deepEqual(planMeasurements([h09p], new Map(), "2027-01-03").map(p => [p.checkpoint, p.date]), [["2026-10-31", "2026-10-31"], ["2026-12-31", "2026-12-31"]], "kaçırılan as-of noktalar geriye dönük");
assert.deepEqual(planMeasurements([h11], new Map(), "2026-12-05").length, 1, "canlı bakiye: tek satır (bugün), geçmiş noktaya uydurulmaz");

// (c) açık kararın isabeti: hedef tarihinde ya da sonrasındaki ilk ölçüm
const ev09 = evaluateHamle(h09p, 8e6, "2027-01-03");
assert.equal(scoreHamle(ev09, [{ date: "2026-10-31", value: 9e6 }]), null, "hedef tarihi ölçümü yoksa isabet yok");
const sc = scoreHamle(ev09, [{ date: "2026-10-31", value: 9e6 }, { date: "2026-12-31", value: 6.5e6 }])!;
assert.deepEqual([sc.hit, Math.round(sc.error * 1000) / 1000, Math.round(sc.optimism * 1000) / 1000], [false, Math.round(500000 / 3113838 * 1000) / 1000, Math.round(500000 / 3113838 * 1000) / 1000]);
const s2 = summarize([ev09], new Map([["H09", [{ date: "2026-12-31", value: 5.9e6 }]]]));
assert.deepEqual([s2.calibration.measured, s2.calibration.hitRate, s2.calibration.bias! < 0], [1, 1, true], "6,0M beklendi 5,9M gerçekleşti → isabet, temkinli");
// (d) motor önerisi → karar taslağı: yalnız ölçülebilir borç kapama; beklenen = bugün − plan tutarı; taslak doğrulamadan geçer
const plan = [
  { use: { kind: "LIQUIDITY", label: "açığı kapat", returnMonthly: null, capitalTry: 1e5 }, amountTry: 1e5 },
  { use: { kind: "DEBT_PAYOFF", label: "Garanti Şirket kart devreden bakiyesini kapat", returnMonthly: 0.0425, capitalTry: 80000, debt: { name: "Garanti Şirket kart", kind: "CARD" as const } }, amountTry: 50000.4 },
  { use: { kind: "DEBT_PAYOFF", label: "QNB — Ticari kredi kapat", returnMonthly: 0.031, capitalTry: 3e5, debt: { name: "QNB — Ticari kredi", kind: "LOAN" as const } }, amountTry: 3e5 },
  { use: { kind: "RESTOCK", label: "SKU1 stok tamamla", returnMonthly: 0.2, capitalTry: 1e4 }, amountTry: 1e4 },
];
const drafts = proposalDrafts(plan, { card_try: 2420289, debt_try: 9239814 }, "2026-10-10");
assert.deepEqual(drafts.map(d => [d.kod, d.metric, d.baslangicDeger, d.beklenenDeger, d.ilkOlcumTarihi]), [
  ["O-261010-GARANTI-SIRKET-KART", "card_try", "2420289", "2370289", "2026-12-09"],
  ["O-261010-QNB-TICARI-KREDI", "debt_try", "9239814", "8939814", "2026-12-09"]], "likidite / stok önerisi ölçülemez → taslak yok");
for (const d of drafts) assert.deepEqual(validateNewHamle({ ...d, baslangicDeger: parseTrNumber(d.baslangicDeger), beklenenDeger: parseTrNumber(d.beklenenDeger) }), [], `${d.kod} taslağı geçerli`);
assert.deepEqual(proposalDrafts(plan, { debt_try: 9239814 }, "2026-10-10").map(d => d.metric), ["debt_try"], "bugünkü değer okunamayan metrik için taslak yok");

console.log("CFO decision memory: metric mapping, deadline parsing, progress vs time path, wrong-direction / behind / achieved, closed-decision calibration; CFO-012 new-decision validation, missing-expectation flag, checkpoint measurement plan, open-decision hit/bias/coverage, engine proposal drafts passed");
