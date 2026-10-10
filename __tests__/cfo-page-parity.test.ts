import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";

// Sayfa-motor eşlik testi (CFO-023, 2026-10-10). Aynı metrik/eşik her ekranda motorla AYNI kaynaktan okunur; sayfada ikinci bir sabit
// yaşamaz. Statik koruma (DB gerekmez): (1) bilinen sabit kalıntıları app/ altında yorum dışı kodda yasak; (2) her eşik/kur/hedef
// tüketicisi kanonik kaynağı okuyor. Yeni bir tüketici eklendikçe BINDINGS genişler.
// Çalıştır: node --import tsx __tests__/cfo-page-parity.test.ts
const walk = (d: string): string[] => readdirSync(d).flatMap(f => {
  const p = `${d}/${f}`;
  return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
});
// Yorumlar tarih notu taşıyabilir ("eskiden 48,50"); yalnız çalışan kod ve görünen metin denetlenir.
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, "")).replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const read = (f: string) => readFileSync(f, "utf8");

// (1) Yasak kalıntılar — her biri bir kez üretimde iki ekranı ayrıştırdı.
const FORBIDDEN: [RegExp, string][] = [
  [/\b48[.,]50?\b/, "sabit USD/TRY 48,5 — kur lib/fx/current (getCurrentFx) veya stratejik kur (lib/fx/strategic) üzerinden okunur"],
  [/\b100[.]?000\s*USD/, "sabit 100.000 USD hedefi — hedef cfo_settings.monthlyRevenueTargetUsd"],
  [/ORAN_ESIGI\s*=\s*0\./, "sabit ölü stok oran eşiği — cfo_settings.deadStockSalesRatioPct (görünümle aynı ifade)"],
  [/kapsam\w*\)?\s*[<>]=?\s*(8\d|9\d)\b/i, "sabit maliyet kapsamı eşiği — motorun getCfoConfig().minCostCoveragePct"],
  [/(freeKmh\w*|nakit|cardDebt\w*)\s*[<>]=?\s*\d[\d_]{3,}/, "sabit TL KPI eşiği — KMH: lib/cfo-agent/capacity.ts (capacityStatus), nakit: cash-floor (netPositionFloorTry), kart: devreden faiz"],
];
const violations: string[] = [];
for (const f of walk("app")) {
  code(read(f)).split("\n").forEach((line, i) => {
    for (const [re, why] of FORBIDDEN) if (re.test(line)) violations.push(`${f}:${i + 1} ${why}\n    ${line.trim().slice(0, 160)}`);
  });
}
assert.deepEqual(violations, [], `sayfa-motor eşlik ihlali:\n${violations.join("\n")}`);

// (2) Bağlar — tüketici kanonik kaynağı okuyor (ve kaynak gerçekten o tanımı taşıyor).
const OLU_STOK_ESIK = `coalesce(max("deadStockSalesRatioPct"), 20) / 100.0`;
const BINDINGS: { file: string; must: (string | RegExp)[]; why: string }[] = [
  { file: "prisma/migrations/20260912150000_olu_stok_xml_sinyali/migration.sql", must: [OLU_STOK_ESIK], why: "cfo_olu_stok görünümünün eşik ifadesi (son tanım)" },
  { file: "app/(app)/cfo/olu-stok/page.tsx", must: [OLU_STOK_ESIK], why: "/cfo/olu-stok boyaması görünümle aynı eşik" },
  { file: "lib/cfo-agent/anomalies.ts", must: ["config.minCostCoveragePct"], why: "motor kapsam kapısı" },
  { file: "app/(app)/cfo/kazananlar/page.tsx", must: ["getCfoConfig().minCostCoveragePct"], why: "/cfo/kazananlar kapsam eşiği = motor" },
  { file: "app/(app)/admin/yeni-urunler/[sku]/page.tsx", must: ["getCurrentFx()", "fx.usdTry"], why: "yeni ürün marjı güncel kur tek kaynağı" },
  { file: "lib/cfo/revenue-levers-data.ts", must: [`"monthlyRevenueTargetUsd"`, /targetUnknown: targetMonthlyTry == null, targetUsd\b/], why: "ciro hedefi ayarlardan; yoksa BİLİNMİYOR" },
  { file: "app/(app)/cfo/sermaye/page.tsx", must: ["rv.targetUsd"], why: "/cfo/sermaye hedef etiketi = kaldıraç hesabının hedefi" },
  { file: "app/(app)/cfo/calisan/page.tsx", must: ["monthlyRevenueTargetUsd"], why: "/cfo/calisan hedef metni ayarlardan" },
  { file: "lib/cfo-agent/health.ts", must: ["capacityStatus(i.capacity)", "CAPACITY_PATH_SQL"], why: "motor capacity_breach alarmı tek kural" },
  { file: "app/(app)/cfo/page.tsx", must: ["capacityStatus(capacity)", "loadCapacity()"], why: "/cfo Boş KMH kartı = motor kapasite kuralı" },
  { file: "app/(app)/cfo/odemeler/page.tsx", must: ["readCashFloor(getCfoConfig().cashFloorTry)", "taban.floorTry"], why: "/cfo/odemeler nakit rengi = motor taban alarmı" },
];
for (const b of BINDINGS) {
  const src = b.file.endsWith(".sql") ? read(b.file) : code(read(b.file));
  for (const m of b.must) assert.ok(typeof m === "string" ? src.includes(m) : m.test(src), `${b.file}: ${b.why} — ${String(m)} bulunamadı`);
}

// Kendi kendini sına: yasak kalıplar gerçekten yakalıyor, yorumdaki tarih notu yakalanmıyor.
const hits = (s: string) => FORBIDDEN.filter(([re]) => code(s).split("\n").some(l => re.test(l))).length;
assert.equal(hits("const m = usd * 48.5;"), 1);
assert.equal(hits("<p>(Kur 48,50 varsayıldı.)</p>"), 1);
assert.equal(hits("<>hedef (100.000 USD × {fx})</>"), 1);
assert.equal(hits("const ORAN_ESIGI = 0.2;"), 1);
assert.equal(hits("const dusuk = n(a.kapsam_pct) < 85;"), 1);
assert.equal(hits("status={o.freeKmhTry >= 1_500_000 ? \"ok\" : \"warn\"}"), 1);
assert.equal(hits("if (nakit < 50_000) return \"warn\";"), 1);
assert.equal(hits("o.cardDebtTry <= 1_000_000"), 1);
assert.equal(hits("if (nakit < taban.floorTry) return \"danger\";"), 0);
assert.equal(hits("// eskiden 48,50 sabitti; 100.000 USD yedeği kaldırıldı"), 0);
assert.equal(hits("kapsam >= 60 ? \"warn\" : \"danger\""), 0);
assert.equal(hits("const url = \"https://x.test/a\"; const k = kapsam < KAPSAM_ESIGI;"), 0);
console.log(`cfo-page-parity: ${walk("app").length} dosya tarandı, ${BINDINGS.length} bağ doğrulandı`);
