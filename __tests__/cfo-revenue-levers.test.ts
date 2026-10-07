/**
 * Gelir kaldıraçları (lib/cfo/revenue-levers.ts) — saf, DB yok. Fikstürler 07.10 üretim değerleri.
 * Çalıştır: node --import tsx __tests__/cfo-revenue-levers.test.ts
 */
import assert from "node:assert/strict";
import { newProductsLever, rankLevers, scaleProtectLever, stockoutLever } from "../lib/cfo/revenue-levers";

const FX = 48.98;
// Konteynerdeki 149 ürün: liste 14.726.800 TL, gümrüklü 145.091 USD (batık), 6 ay erime varsayımı
const np = newProductsLever({ n: 149, notInCatalog: 145, grossListTry: 14726800, landedTry: 145091 * FX, salesMonths: 6 })!;
assert.equal(np.revenueMonthlyTry, Math.round(14726800 / 6));
assert.equal(np.capitalNeededTry, 0); assert.equal(np.grossPerCapital, null, "ek sermaye yok → sınırsız getiri");
assert.equal(np.sunkCapitalTry, Math.round(145091 * FX));
assert.equal(newProductsLever({ n: 0, notInCatalog: 0, grossListTry: 0, landedTry: 0, salesMonths: 6 }), null);

// Stoksuz satan: ciro 90g/3; maliyetsiz satır brüt katkıya girmez ama ciroya girer
const so = stockoutLever([{ sku: "A", rev90: 900000, units90: 900, unitCost: 300 }, { sku: "B", rev90: 300000, units90: 100, unitCost: null }], 22, 97)!;
assert.equal(so.revenueMonthlyTry, 400000);
assert.equal(so.grossMonthlyTry, Math.round((900000 - 900 * 300) / 3));
assert.equal(so.capitalNeededTry, Math.round((900 * 300 / 3) * 97 / 30));
assert.match(so.basis, /1 üründe maliyet yok/);
assert.equal(stockoutLever([], 22, 97), null);

const sc = scaleProtectLever(650297, 900000, 140226, 67)!;
assert.ok(Math.abs(sc.grossPerCapital! - 140226 / 650297) < 1e-12);
assert.equal(scaleProtectLever(0, 1, 1, 67), null);

// Sıralama: batık sermayeyi çalıştıran önce; açık payı güvenle ağırlıklı; hedef 100k USD
const plan = rankLevers([sc, so, np, null], 1894641, 100000 * FX);
assert.equal(plan.gapMonthlyTry, Math.round(100000 * FX - 1894641));
assert.deepEqual(plan.levers.map(l => l.key), ["new-products", "stockout", "scale-restock"]);
assert.ok(Math.abs(plan.levers[0].gapShare - (Math.round(14726800 / 6) * 0.4) / (100000 * FX - 1894641)) < 1e-9);
assert.ok(plan.coveredShare > 0 && plan.coveredShare <= 1);
assert.equal(rankLevers([np], 10_000_000, 4_898_000).gapMonthlyTry, 0, "hedef aşılmışsa açık 0");
console.log("CFO revenue levers: sunk-capital listing first, stockout recovery, scale protection, gap share passed");
