/**
 * CFO motoru: önemli değişiklik bayrağı (materiality) + bağlam blokları (ithalat cirosu, ALFASHOME, sermaye, panel defterleri).
 * DB/ağ yok. Çalıştır: node --conditions=react-server --import tsx __tests__/ai-cfo-context-blocks.test.ts
 */
import assert from "node:assert/strict";
import { decisionInputHash, impactBucket, materialChange, sinceYesterday } from "../lib/cfo-agent/materiality";
import { importProjectEvidence } from "../lib/cfo-agent/import-revenue";
import { alfashomeEvidence } from "../lib/cfo-agent/alfashome-sales";
import { capitalConfigEvidence } from "../lib/cfo-agent/capital-config";
import { bankLedgerEvidence, quoteEvidence, trendyolFinanceEvidence } from "../lib/cfo-agent/finance-ledgers";
import { capitalScore, freeCapital } from "../lib/capital/score";
import { evidence } from "../lib/cfo-agent/evidence";
import type { Anomaly, Evidence } from "../lib/cfo-agent/types";

let failed = 0;
function check(name: string, fn: () => void) {
  try { fn(); console.log(`  OK   ${name}`); } catch (e) { failed++; console.error(`  FAIL ${name}\n         ${e instanceof Error ? e.stack ?? e.message : e}`); }
}
const AT = "2026-10-07T05:00:00.000Z";
// Üretim şekilli fikstür: 07.10 16:59 koşusundaki STOCKOUT/PRICE_BELOW_FLOOR kanıt sorguları gibi uzun sorgu metinleri.
function anomaly(i: number, rule = "STOCKOUT", impact: number | null = 120000, nEvidence = 6): { a: Anomaly; ev: Evidence[] } {
  const sku = `MD-30${i}3B1`;
  const ev = Array.from({ length: nEvidence }, (_, k) => evidence("cfo_satis_birim_duz", `product.${sku}.TRENDYOL.metric_${k}.stockDays/velocity/unitProfit (son 30 gün, adet_duz=1)`, 1234.56 + k * 17.3, k % 2 ? "TRY" : "days", AT, k !== 3));
  return { ev, a: { id: `a_${i}`, rule, severity: i === 0 ? "critical" : "warning", category: rule === "STOCKOUT" ? "inventory" : "pricing", entityType: "sku", entityId: `sku:${sku}`,
    period: "2026-10", fingerprint: `${rule}:${sku}:2026-10`, cooldownKey: `${rule}:${sku}`, evidenceIds: ev.map(e => e.id), actionable: true,
    impact: impact == null ? null : { value: impact, formula: "x", inputs: {}, basis: "gross_incl_vat", estimated: true, kind: "lost_profit" }, weight: 1, existingRecordIds: [] } };
}

check("önemli değişiklik: yeni / önem arttı / etki ≥1 kova ve ≥10.000 TL arttı; aksi halde aynı", () => {
  const { a } = anomaly(1, "STOCKOUT", 100000);
  assert.equal(materialChange(a, undefined, 10000), "new");
  assert.equal(materialChange(a, { severity: "warning", impact: 100000 }, 10000), null, "aynı anomali hâlâ açık → çağrı yok");
  assert.equal(materialChange({ ...a, severity: "critical" }, { severity: "warning", impact: 100000 }, 10000), "severity_up");
  assert.equal(materialChange(a, { severity: "warning", impact: 70000 }, 10000), "impact_up", "+%43 ve +30.000 TL");
  assert.equal(materialChange(a, { severity: "warning", impact: 95000 }, 10000), null, "+%5 kova değiştirmez");
  assert.equal(materialChange({ ...a, impact: { ...a.impact!, value: 30000 } }, { severity: "warning", impact: 22000 }, 10000), null, "kova arttı ama < 10.000 TL");
  assert.equal(materialChange({ ...a, severity: "info" }, { severity: "warning", impact: 100000 }, 10000), null, "önem azaldı → çağrı yok");
  assert.equal(sinceYesterday(a, undefined, 10000), "yeni"); assert.equal(sinceYesterday(a, { severity: "warning", impact: 70000 }, 10000), "degisti");
  assert.equal(sinceYesterday(a, { severity: "warning", impact: 100000 }, 10000), "ayni");
  assert.equal(impactBucket(null), null); assert.equal(impactBucket(100000), impactBucket(101000), "küçük oynama aynı kova");
});

check("karar girdisi hash'i (TÜM anomaliler): zaman damgası/asOf/kanıt sırası/tazelik değişince aynı; önem, kova, sürüm değişince farklı", () => {
  const { a } = anomaly(0), { a: b } = anomaly(1);
  const h = (list: Anomaly[], versions = { calc: "v10", engine: "e1" }) => decisionInputHash({ anomalies: list, versions });
  const base = h([a, b]);
  assert.equal(h([b, a]), base, "sıra");
  assert.equal(h([{ ...a, evidenceIds: [...a.evidenceIds].reverse(), period: "2026-11" }, b]), base, "kanıt sırası / dönem");
  assert.equal(h([{ ...a, impact: { ...a.impact!, value: 121000 } }, b]), base, "aynı kova");
  assert.notEqual(h([{ ...a, severity: "warning" }, b]), base);
  assert.notEqual(h([{ ...a, impact: { ...a.impact!, value: 400000 } }, b]), base);
  assert.notEqual(h([a]), base, "bir bulgu kapandı → değişti");
  assert.notEqual(h([a, b], { calc: "v11", engine: "e1" }), base);
});

check("ithalat beklenen ciro: proje başına durum/ciro/kâr/aylık katkı TAHMİNİ; varışı geçmiş YOLDA kaydı işaretlenir", () => {
  const ev = importProjectEvidence([
    { code: "07.26sea", status: "YOLDA", eta: "2026-10-05", revenue: 15474895, profit: 6039484, months: 6, tag: "KESIN" },
    { code: "ROMANYA-PARCA", status: "GUMRUKTE", eta: null, revenue: 3343000, profit: null, months: null, tag: "KESIN" },
  ], "2026-10-07T12:00:00.000Z");
  const v = (q: string) => ev.find(e => e.query.startsWith(q));
  assert.match(String(v("ithalat.07.26sea.durum")?.value), /varış tarihi geçti — durum güncellenmeli/);
  assert.equal(v("ithalat.07.26sea.durum")?.measured, false, "bayat kayıt ölçülmüş sayılmaz");
  assert.equal(v("ithalat.07.26sea.aylik_ciro_katkisi_try")?.value, Math.round(15474895 / 6));
  assert.equal(v("ithalat.07.26sea.beklenen_kar_try")?.measured, false, "plan TAHMİNİdir");
  assert.equal(v("ithalat.ROMANYA-PARCA.aylik_ciro_katkisi_try"), undefined, "satış ayı yoksa aylık katkı uydurulmaz");
  assert.equal(v("ithalat.toplam_beklenen_ciro_try")?.value, 15474895 + 3343000);
  assert.doesNotMatch(String(v("ithalat.ROMANYA-PARCA.durum")?.value), /geçti/, "varış tarihi yoksa bayat sayılmaz");
});

check("ALFASHOME kanalı: senkron tazeliği kanıtın ölçülmüşlüğünü belirler; senkron yoksa BAYAT/hiç", () => {
  const at = "2026-10-07T12:00:00.000Z";
  const fresh = alfashomeEvidence({ n30: 12, rev30: 18450.5, mtd: 4200, pending30: 1500, lastOrder: "2026-10-06T10:00:00.000Z", lastSync: "2026-10-07T06:00:00.000Z" }, at);
  const v = (list: typeof fresh, q: string) => list.find(e => e.query.startsWith(q));
  assert.equal(v(fresh, "alfashome.ciro_son_30_gun_try")?.value, 18450.5); assert.equal(v(fresh, "alfashome.ciro_son_30_gun_try")?.measured, true);
  assert.equal(v(fresh, "alfashome.son_siparis")?.value, "2026-10-06");
  const stale = alfashomeEvidence({ n30: 0, rev30: null, mtd: null, pending30: null, lastOrder: null, lastSync: "2026-10-01T06:00:00.000Z" }, at);
  assert.match(String(v(stale, "alfashome.senkron")?.value), /BAYAT/); assert.equal(v(stale, "alfashome.ciro_son_30_gun_try")?.measured, false, "bayat senkron ölçüm sayılmaz");
  assert.equal(v(stale, "alfashome.ciro_son_30_gun_try")?.value, 0);
  assert.match(String(v(alfashomeEvidence({ n30: 0, rev30: null, mtd: null, pending30: null, lastOrder: null, lastSync: null }, at), "alfashome.senkron")?.value), /hiç senkron yok/);
});

check("sermaye: tek skor/serbest sermaye kuralı (sayfa + dashboard + CFO aynı) ve CFO sermaye ayarını görür", () => {
  // Serbest sermaye: rezerv SERBEST kısmın yüzdesi (eski Yönetici Paneli toplamın yüzdesini alıyordu).
  assert.deepEqual(freeCapital(5_000_000, 4_000_000, 20), { total: 5_000_000, locked: 4_000_000, available: 1_000_000, reserve: 200_000, deployable: 800_000 });
  assert.deepEqual(freeCapital(1_000_000, 2_000_000, 20), { total: 1_000_000, locked: 2_000_000, available: 0, reserve: 0, deployable: 0 }, "stok > sermaye → negatif serbest yok");
  const full = capitalScore({ annualRoiPct: 60, deadRatio: 0, urgentCount: 0, liquidationCount: 0 });
  assert.deepEqual([full.total, full.label, full.tone], [100, "Mükemmel", "ok"]);
  const s = capitalScore({ annualRoiPct: 30, deadRatio: 0.25, urgentCount: 3, liquidationCount: 10 });
  assert.deepEqual([s.roi, s.dead, s.urgent, s.liquidation, s.total, s.label], [25, 12.5, 7, 10, 55, "İyi"]);
  assert.equal(capitalScore({ annualRoiPct: -40, deadRatio: 2, urgentCount: 50, liquidationCount: 99 }).total, 0, "alt sınır 0");
  const ev = capitalConfigEvidence({ totalTry: 5_000_000, reservePct: 20, updatedAt: "2026-09-01T00:00:00.000Z" }, 4_357_225.37, AT);
  const v = (q: string) => ev.find(e => e.query.startsWith(q));
  assert.equal(v("sermaye.stokta_bagli_try")?.value, 4_357_225); assert.equal(v("sermaye.stokta_bagli_try")?.measured, true);
  assert.equal(v("sermaye.ayar_toplam_try")?.measured, false, "elle girilen çerçeve ölçüm değildir");
  assert.equal(v("sermaye.kullanilabilir_try")?.value, 514_220);
  assert.deepEqual(capitalConfigEvidence(null, null, AT), [], "ayar ve görünüm yoksa kanıt yok");
});

check("panel defterleri: Trendyol kesinti dökümü + oran, banka hareketi, teklif; bayat yükleme ölçüm sayılmaz", () => {
  // Üretim 07.10 şekli: Ağustos faturaları, son yükleme 09.09 (27 tam gün → BAYAT)
  const agg = { lastImport: "2026-09-09T19:52:30.000Z", lastInvoice: "2026-09-09T13:08:00.000Z", month: "2026-08",
    expenseByGroup: [{ group: "KOMISYON", expenseTry: 194144 }, { group: "KARGO", expenseTry: 163348 }, { group: "HIZMET", expenseTry: 23210 },
      { group: "CEZA", expenseTry: 9100 }, { group: "REKLAM", expenseTry: 5000 }, { group: "IADE_ALACAK", expenseTry: 0 }],
    monthSalesTry: 1512257, sales90Try: 2787127, returns90Try: 320796, penalties90: { n: 16, try: 21000 } };
  const ev = trendyolFinanceEvidence(agg, "2026-10-07T12:00:00.000Z");
  const v = (q: string) => ev.find(e => e.query.startsWith(q));
  assert.match(String(v("trendyol_finans.yukleme")?.value), /27 gün\) — BAYAT/);
  assert.equal(v("trendyol_finans.2026-08.kesinti_toplam_try")?.value, 394802);
  assert.equal(v("trendyol_finans.2026-08.kesinti_orani_pct")?.value, 26.1, "394.802 / 1.512.257");
  assert.equal(v("trendyol_finans.iade_orani_son_90_gun_pct")?.value, 11.5);
  assert.equal(v("trendyol_finans.2026-08.kesinti_reklam_try")?.value, 5000, "pazar yeri reklam harcaması görünür");
  assert.equal(v("trendyol_finans.2026-08.kesinti_iade_alacak_try"), undefined, "sıfır kalem yazılmaz");
  assert.ok(ev.every(e => !e.measured), "bayat dosya → hiçbir kanıt ölçüm değil");
  assert.ok(trendyolFinanceEvidence({ ...agg, lastImport: "2026-10-05T00:00:00.000Z" }, "2026-10-07T12:00:00.000Z").every(e => e.measured), "taze dosya ölçüm");
  assert.equal(trendyolFinanceEvidence({ ...agg, lastImport: null, month: null }, AT).length, 1, "yükleme yoksa yalnız durum");
  const bank = bankLedgerEvidence([{ bank: "Ziraat", lastDate: "2026-10-04", in30: 1072776.4, out30: 1043684 }, { bank: "Ziraat USD (şirket)", lastDate: "2026-09-15", in30: 7500, out30: 7500 }], "2026-10-07T12:00:00.000Z");
  assert.equal(bank.find(e => e.query === "banka_hareket.Ziraat.giris_son_30_gun_try")?.value, 1072776);
  assert.match(String(bank.find(e => e.query.startsWith("banka_hareket.Ziraat USD (şirket).son_hareket"))?.value), /BAYAT/, "22 gün > 10");
  const q = quoteEvidence({ open: 9, openTry: 248032, expired: 8, oldest: "2026-05-14T21:59:11.000Z" }, AT);
  assert.deepEqual(q.map(e => e.value), [9, 248032, 8, "2026-05-14"]);
  assert.deepEqual(quoteEvidence({ open: 0, openTry: 0, expired: 0, oldest: null }, AT).map(e => e.value), [0]);
});

if (failed) { console.error(`\n${failed} test başarısız`); process.exit(1); }
console.log("\nCFO engine materiality flag + context blocks: tüm testler geçti");
