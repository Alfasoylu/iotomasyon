/**
 * CFO-020 ölü stok TL tek kuralı (lib/cfo/dead-stock-value.ts): TL yalnız maliyet esaslı satırlardan; GERCEKLESEN_SATIS (satış değeri)
 * satırları sayılır ama toplama girmez. Koruma: /cfo/olu-stok kartları ve /admin/sermaye (lib/capital/health.ts) aynı fonksiyonu kullanır,
 * görünüm özetinin karışık esaslı `bagli_sermaye` / `kirmizi_bagli` toplamı ekranda TL olarak gösterilmez.
 * Çalıştır: node --import tsx __tests__/cfo-dead-stock-value.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deadStockValue, isCostBasis } from "../lib/cfo/dead-stock-value";

const rows = [
  { bagli_sermaye: "100000.50", deger_kaynagi: "MALIYET" },
  { bagli_sermaye: 22171.5, deger_kaynagi: "MALIYET" },
  { bagli_sermaye: "2020039", deger_kaynagi: "GERCEKLESEN_SATIS" },
  { bagli_sermaye: null, deger_kaynagi: "MALIYET" },
  { bagli_sermaye: 5, deger_kaynagi: null },
];
assert.deepEqual(deadStockValue(rows), { costTry: 122172, costSku: 2, unknownCostSku: 3, saleValueTry: 2020044 });
assert.deepEqual(deadStockValue([]), { costTry: 0, costSku: 0, unknownCostSku: 0, saleValueTry: 0 });
assert.equal(isCostBasis({ bagli_sermaye: "1", deger_kaynagi: "MALIYET" }), true);
assert.equal(isCostBasis({ bagli_sermaye: null, deger_kaynagi: "MALIYET" }), false, "maliyet esaslı ama değer yok → bilinmiyor");

const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const page = strip(readFileSync("app/(app)/cfo/olu-stok/page.tsx", "utf8"));
const health = strip(readFileSync("lib/capital/health.ts", "utf8"));
assert.match(page, /deadStockValue\(rows\)/, "/cfo/olu-stok TL kartı tek kuraldan");
assert.ok(!/o\?\.(bagli_sermaye|kirmizi_bagli)/.test(page), "görünüm özetinin karışık esaslı TL toplamı ekranda kullanılmaz");
assert.match(health, /deadStockValue\(deadRows\)/, "/admin/sermaye ölü stok TL'si tek kuraldan");
assert.ok(!/dead\.reduce\(\(s, r\) => s \+ r\.lockedTry/.test(health), "satış değeri bağlı sermayeye toplanmaz");
console.log("CFO-020 ölü stok TL tek kural: yalnız maliyet esaslı, maliyetsiz satırlar ayrı, sayfa + sermaye sağlığı aynı fonksiyon passed");
