/**
 * Aşağı yön senaryoları (lib/cfo/downside.ts) — saf, DB yok. Fikstür: 07.10 üretim cfo_nakit_projeksiyon(120) günlük bileşenleri
 * (eşlik denetimiyle birebir), cfo_nakit_kapisi ve cfo_kaynak_yeterliligi kaynakları.
 * Çalıştır: node --import tsx __tests__/cfo-downside.test.ts
 */
import assert from "node:assert/strict";
import { NO_SHOCK, runDownside, simulate, stressGapTry, tierOf, type DayFlow, type Resources } from "../lib/cfo/downside";

const START = 59693.13;
const RES: Resources = { generalTry: 1786353.47, customsTry: 750000, personalTry: 1100000 };
const KMH = 0.045;

// 07.10 üretim akışı: defter alacağı, kanal temposu (parçalı sabit), çıkışlar (gümrük = kur duyarlı)
const LEDGER: Record<string, number> = { "10-08": 141783, "10-12": 87370, "10-13": 55485, "10-15": 123390, "10-19": 114006, "10-20": 39906, "10-22": 80383,
  "10-25": 18000, "10-26": 108808, "10-27": 55346, "10-30": 48522, "11-02": 41352, "11-03": 38668, "11-05": 60696, "11-10": 27759 };
const OUT: Record<string, number> = { "10-07": 6500, "10-09": 1857683, "10-13": 5000, "10-15": 158932, "10-16": 137314, "10-21": 1101587, "10-22": 95510,
  "10-24": 32793, "10-25": 33112, "10-26": 400000, "10-28": 85259, "11-01": 328400, "11-06": 97840, "11-10": 29750, "11-15": 146600, "11-16": 137314,
  "11-21": 51587, "11-22": 85956, "11-24": 32793, "11-25": 33112, "11-28": 118536, "12-01": 328400, "12-06": 36000, "12-10": 41521, "12-15": 146600,
  "12-16": 137314, "12-21": 51587, "12-22": 79937, "12-24": 32793, "12-25": 33112, "12-28": 118536, "01-01": 328400, "01-06": 36000, "01-11": 41521,
  "01-15": 146600, "01-16": 137314, "01-21": 51587, "01-22": 79937, "01-25": 33112, "01-26": 32793, "01-28": 118536 };
const FX: Record<string, number> = { "10-09": 1857683, "10-21": 1050000, "10-26": 400000 };
const TEMPO: [string, number][] = [["10-09", 401], ["10-16", 2592], ["10-20", 3156], ["10-26", 3756], ["10-27", 4017], ["11-06", 27477], ["11-11", 33791]];

const days: DayFlow[] = [];
for (let i = 0; i <= 120; i++) {
  const d = new Date(Date.UTC(2026, 9, 7 + i)).toISOString().slice(0, 10), k = d.slice(5);
  const tempo = [...TEMPO].reverse().find(([from]) => (from.startsWith("01") ? "2027-" : "2026-") + from <= d)?.[1] ?? 0;
  days.push({ date: d, ledgerIn: LEDGER[k] ?? 0, forecastIn: tempo, out: OUT[k] ?? 0, fxOut: FX[k] ?? 0 });
}

// 1) Faizsiz simülasyon = üretim projeksiyonu (dip −3.279.787, 01.12)
const proj = simulate(days, START, NO_SHOCK, 0);
assert.equal(proj.minDate, "2026-12-01");
assert.ok(Math.abs(proj.minPosition - -3279787) <= 60, `projeksiyon dibi ${proj.minPosition} (fikstür günlük yuvarlanmış)`);

const d = runDownside(days, START, RES, KMH);
const by = (k: string) => d.scenarios.find(s => s.key === k)!;

// 2) Baz KMH faizini içerir → projeksiyondan derin; faiz maliyeti pozitif
assert.ok(by("base").minPosition < proj.minPosition, "projeksiyon eksi pozisyonun faizini saymıyor");
assert.ok(by("base").carryCostTry > 100_000, `120 günde KMH faizi ${by("base").carryCostTry}`);
assert.equal(by("base").tier, "PERSONAL", "baz bile şahsi hesaplara dayanıyor (cfo_kaynak_yeterliligi ile tutarlı)");
assert.ok(by("base").firstBeyondGeneral != null && by("base").firstBeyondGeneral! < "2026-11-01", "genel KMH ekim sonunda aşılır");

// 3) Şoklar bazı kötüleştirir; kur şoku = gümrük × %15 (+ faizi)
for (const k of ["revenue-20", "payout-14", "fx-15", "rate-1", "stress", "severe"]) assert.ok(by(k).deltaVsBaseTry < 0, k);
assert.ok(by("fx-15").deltaVsBaseTry <= -Math.round((1857683 + 1050000 + 400000) * 0.15), "kur şoku en az gümrük × %15");
assert.ok(by("severe").minPosition < by("stress").minPosition);
assert.equal(by("severe").tier, "UNFUNDED"); assert.ok(by("severe").shortfallTry > 0);

// 4) Duyarlılık sırası: en zararlı tekil şok başta; emniyet payları kaynakların ne kadar ince olduğunu söyler
assert.equal(d.sensitivity.length, 4);
assert.ok(d.sensitivity[0].deltaVsBaseTry <= d.sensitivity[3].deltaVsBaseTry);
assert.ok(d.tolerance.maxRevenueDropPct != null && d.tolerance.maxRevenueDropPct < 20, `ciro düşüş toleransı %${d.tolerance.maxRevenueDropPct}`);
assert.ok(d.tolerance.maxFxUpPct != null && d.tolerance.maxFxUpPct < 15, `kur toleransı %${d.tolerance.maxFxUpPct}`);

// 5) Katman ve stres açığı
assert.deepEqual(tierOf(-1_000_000, RES), { tier: "GENERAL", shortfallTry: 0, headroomTry: 2636353 });
assert.equal(tierOf(-2_000_000, RES).tier, "CUSTOMS");
assert.equal(tierOf(-5_000_000, { ...RES, personalTry: null }).headroomTry, null, "şahsi limit bilinmiyorsa pay UNKNOWN");
assert.equal(stressGapTry(d, -3_000_000), Math.round(-3_000_000 - d.stress.minPosition));
// Gecikme ufuk dışına taşan tahsilatı düşer (temkinli) ve hiçbir zaman iyileştirmez
assert.ok(simulate(days, START, { ...NO_SHOCK, payoutDelayDays: 30 }, KMH).minPosition <= simulate(days, START, { ...NO_SHOCK, payoutDelayDays: 14 }, KMH).minPosition);
console.log(`CFO downside: projection parity (−3.279.787 @ 01.12), carry cost ${by("base").carryCostTry}, stress ${d.stress.minPosition} (${d.stress.tier}), tolerance revenue %${d.tolerance.maxRevenueDropPct} / delay ${d.tolerance.maxPayoutDelayDays}g / fx %${d.tolerance.maxFxUpPct} passed`);
