/**
 * CFO-018 adım 2: nakit ufku / ay sonu tek nakit yolundan (lib/cfo/cash-path.ts). Yol = cfo_nakit_projeksiyon satırları (günlük, ilk gün
 * bugün). Ufuk = o güne kadarki birikimli giriş/çıkış + o günün pozisyonu; KIRMIZI eşiği capacityStatus "danger" ile aynı (açık >
 * genel + amaca bağlı limit); kapasiteyle kapanan açık SARI. Kısmi hafta düşmez (eski motor kovası düşürüyordu). Yol ufka ulaşmıyorsa o ufuk yok (sıfır uydurulmaz).
 * Koruma: /cfo, /cfo/nakit-akisi, /cfo/borclar ufuk/ay sonu tablolarını eski motordan (o.horizons / o.monthEnds) okumaz.
 * Çalıştır: node --import tsx __tests__/cfo-cash-path.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { horizonsFromPath, monthEndsFromPath, pathTraffic, toPathRows } from "../lib/cfo/cash-path";
import { capacityStatus } from "../lib/cfo-agent/capacity";

const iso = (n: number) => { const d = new Date(Date.UTC(2026, 9, 10)); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// 121 gün: açılış 100.000; gün 0 +10.000 giriş; gün 5 −300.000; gün 29 +50.000 (eski motorda 30 günlük pencerenin kısmi haftası); gün 45 −2.000.000
let pos = 100000;
const raw = Array.from({ length: 121 }, (_, n) => {
  const i = n === 0 ? 10000 : n === 29 ? 50000 : 0, o = n === 5 ? 300000 : n === 45 ? 2000000 : 0;
  pos += i - o; return { d: iso(n), i: String(i), o, p: pos };
});
const path = toPathRows([...raw, { d: null, i: 0, o: 0, p: 1 }, { d: iso(200), i: 0, o: 0, p: null }]);
assert.equal(path.length, 121, "tarihsiz / pozisyonsuz satır atılır");
const cap = { generalTry: 1000000, customsTry: 500000 };

const h = horizonsFromPath(path, cap);
assert.deepEqual(h.map(x => [x.days, x.inflow, x.outflow, x.position, x.gap, x.traffic]), [
  [7, 10000, 300000, -190000, 190000, "SARI"],
  [30, 60000, 300000, -140000, 140000, "SARI"],          // gün 29 girişi sayılır
  [60, 60000, 2300000, -2140000, 2140000, "KIRMIZI"],    // 2,14M > 1,5M şirket kapasitesi
  [90, 60000, 2300000, -2140000, 2140000, "KIRMIZI"],
]);
assert.ok(h.every(x => x.net === x.inflow - x.outflow && x.position === 100000 + x.net), "pozisyon = açılış + birikimli net");
assert.deepEqual(horizonsFromPath(path.slice(0, 40), cap).map(x => x.days), [7, 30], "yol 60/90 güne ulaşmıyorsa o ufuk yok");
assert.deepEqual(horizonsFromPath([], cap), []);

// KIRMIZI eşiği = capacityStatus "danger" (şirket kapasitesi: genel + amaca bağlı); açık yoksa YEŞİL, kapasiteyle kapanan açık SARI
for (const gap of [0, 900000, 1200000, 1500000, 1600000]) {
  const s = capacityStatus({ generalTry: cap.generalTry, customsTry: cap.customsTry, personalTry: null, path: [{ date: "x", position: -gap }] }).status;
  const t = pathTraffic(gap, cap);
  assert.equal(t === "KIRMIZI", s === "danger", `açık ${gap}: KIRMIZI ⇔ danger`);
  assert.equal(t === "YESIL", gap === 0, `açık ${gap}: YEŞİL ⇔ açık yok`);
}

const me = monthEndsFromPath(path, cap);
assert.deepEqual(me.map(m => [m.label, m.days, m.position, m.freeCapacityAfter]), [
  ["Ekim 2026", 21, -190000, 1310000], ["Kasım 2026", 51, -2140000, -640000], ["Aralık 2026", 82, -2140000, -640000]]);

const strip = (f: string) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
for (const f of ["app/(app)/cfo/page.tsx", "app/(app)/cfo/nakit-akisi/page.tsx", "app/(app)/cfo/borclar/page.tsx"]) {
  const src = strip(f);
  assert.ok(!/o\.(horizons|monthEnds)/.test(src), `${f} ufuk/ay sonunu eski motordan okumaz`);
  assert.match(src, /loadCashHorizons\(\)/, `${f} tek nakit yolunu okur`);
}
console.log("CFO-018 adım 2 nakit ufku tek yoldan: birikimli akış + pozisyon, kısmi hafta düşmez, eksik ufuk yok, KIRMIZI = capacityStatus danger, 3 sayfa passed");
