/**
 * Trendyol yazma (lib/trendyol/write.ts): bayrak kapalıyken istek GİTMEZ; fiyat/stok, içerik, yeni ürün kuralları; doğru V2 uçları,
 * yalnız verilen alanlar, görsel {url} biçimi, SelfIntegration User-Agent; toplu işlem sonucu GET. Ağ yok (sahte fetch).
 * Çalıştır: node --import tsx __tests__/trendyol-write.test.ts
 */
import assert from "node:assert/strict";
import { createProducts, getBatchResult, trendyolWriteEnabled, updateApprovedContent, updatePriceAndInventory,
  validateContent, validateNewProducts, validatePriceInventory, type NewProduct } from "../lib/trendyol/write";

async function main() {
  const cfg = { supplierId: "123", apiKey: "k", apiSecret: "s" };
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => { calls.push({ url, init });
    return new Response(JSON.stringify({ batchRequestId: "batch-1" }), { status: 200 }); }) as unknown as typeof fetch;
  const prod = (o: Partial<NewProduct> = {}): NewProduct => ({ barcode: "ALF-OS-001", title: "Ürün", productMainId: "ALF-OS-001", brandId: 1,
    categoryId: 2, quantity: 5, stockCode: "ALF-OS-001", dimensionalWeight: 3, description: "<p>açıklama</p>", listPrice: 500, salePrice: 450,
    vatRate: 20, images: ["https://x.com/a.jpg"], attributes: [], ...o });

  // Bayrak
  assert.equal(trendyolWriteEnabled({}), false);
  assert.equal(trendyolWriteEnabled({ TRENDYOL_WRITE_ENABLED: "true" }), true);
  const prev = process.env.TRENDYOL_WRITE_ENABLED;
  delete process.env.TRENDYOL_WRITE_ENABLED;
  await assert.rejects(updatePriceAndInventory(cfg, [{ barcode: "B", salePrice: 10 }], f), /yazma kapalı/);
  await assert.rejects(updateApprovedContent(cfg, [{ contentId: 1, title: "x" }], f), /yazma kapalı/);
  await assert.rejects(createProducts(cfg, [prod()], f), /yazma kapalı/);
  assert.equal(calls.length, 0, "bayrak kapalıyken istek gitmez");

  // Kurallar
  const pe = validatePriceInventory([{ barcode: "A", salePrice: 0 }, { barcode: "A", quantity: 20001 }, { barcode: "C" }, { barcode: "D", salePrice: 200, listPrice: 100 }]);
  for (const re of [/satış fiyatı 0'dan büyük/, /aynı barkod/, /stok 0–20000/, /en az bir alan/, /liste fiyatını geçemez/]) assert.ok(pe.some(e => re.test(e)), String(re));
  const ce = validateContent([{ contentId: 0 }, { contentId: 5 }, { contentId: 6, title: "x".repeat(101) }, { contentId: 7, images: ["http://a"] }]);
  for (const re of [/geçersiz contentId/, /en az bir alan/, /başlık 1–100/, /https görsel/]) assert.ok(ce.some(e => re.test(e)), String(re));
  const ne = validateNewProducts([prod({ barcode: "AB CD" }), prod({ vatRate: 18 }), prod({ barcode: "X2", salePrice: 600 }), prod({ barcode: "X3", images: [] })]);
  for (const re of [/barkod 1–40/, /KDV/, /satış ≤ liste/, /https görsel/]) assert.ok(ne.some(e => re.test(e)), String(re));
  assert.deepEqual(validateNewProducts([prod()]), []);

  // Gönderim
  process.env.TRENDYOL_WRITE_ENABLED = "true";
  assert.equal((await updatePriceAndInventory(cfg, [{ barcode: " B1 ", salePrice: 99.9, listPrice: 120 }], f)).batchRequestId, "batch-1");
  assert.equal(calls[0].url, "https://apigw.trendyol.com/integration/inventory/sellers/123/products/price-and-inventory");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { items: [{ barcode: "B1", salePrice: 99.9, listPrice: 120 }] });
  assert.equal((calls[0].init.headers as Record<string, string>)["User-Agent"], "123 - SelfIntegration");
  await updateApprovedContent(cfg, [{ contentId: 9, description: "yeni", images: ["https://x.com/b.jpg"] }], f);
  assert.equal(calls[1].url, "https://apigw.trendyol.com/integration/product/sellers/123/products/content-bulk-update");
  assert.deepEqual(JSON.parse(String(calls[1].init.body)), { items: [{ contentId: 9, description: "yeni", images: [{ url: "https://x.com/b.jpg" }] }] });
  await createProducts(cfg, [prod()], f);
  assert.equal(calls[2].url, "https://apigw.trendyol.com/integration/product/sellers/123/v2/products");
  assert.deepEqual(JSON.parse(String(calls[2].init.body)).items[0].images, [{ url: "https://x.com/a.jpg" }]);
  await assert.rejects(createProducts(cfg, [prod({ vatRate: 18 })], f), /geçersiz/);
  await getBatchResult(cfg, "batch-1", f);
  assert.deepEqual([calls[3].url, calls[3].init.method], ["https://apigw.trendyol.com/integration/product/sellers/123/products/batch-requests/batch-1", "GET"]);
  await assert.rejects(getBatchResult(cfg, "../x", f), /geçersiz/);
  assert.equal(calls.length, 4);
  if (prev === undefined) delete process.env.TRENDYOL_WRITE_ENABLED; else process.env.TRENDYOL_WRITE_ENABLED = prev;
  console.log("Trendyol yazma: bayrak kapalıyken istek yok, fiyat/stok/içerik/yeni ürün kuralları, V2 uçları, toplu işlem sonucu passed");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
