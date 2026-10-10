/**
 * PttAVM yazma (lib/pttavm/write.ts): bayrak kapalıyken istek GİTMEZ; resmî kurallar (boş liste, ≤1000, barkod tekil/≤250, en az bir
 * alan, KDV 0/1/10/20, fiyat > 1, indirim 0–70, stok 0–9999); doğru uç + yalnız verilen alanlar; aktif/pasif PUT; işlem takibi.
 * Ağ yok (sahte fetch). Çalıştır: node --import tsx __tests__/pttavm-write.test.ts
 */
import assert from "node:assert/strict";
import { pttavmWriteEnabled, setProductActive, trackingResult, updateStockPrices, validateStockPriceItems } from "../lib/pttavm/write";
import type { PttavmConfig } from "../lib/pttavm/client";

async function main() {
  const rest: PttavmConfig = { mode: "rest", apiKey: "K", accessToken: "T" };
  const soap: PttavmConfig = { mode: "soap", username: "u", password: "p" };
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => { calls.push({ url, init });
    return new Response(JSON.stringify({ trackingId: "trk-1", countOfProductsToBeProcessed: 1, success: true, message: null }), { status: 200 }); }) as unknown as typeof fetch;

  // Bayrak: REST + PTTAVM_WRITE_ENABLED=true şart
  assert.equal(pttavmWriteEnabled(rest, {}), false);
  assert.equal(pttavmWriteEnabled(rest, { PTTAVM_WRITE_ENABLED: "true" }), true);
  assert.equal(pttavmWriteEnabled(soap, { PTTAVM_WRITE_ENABLED: "true" }), false, "SOAP ile yazma yok");
  const prev = process.env.PTTAVM_WRITE_ENABLED;
  delete process.env.PTTAVM_WRITE_ENABLED;
  await assert.rejects(updateStockPrices(rest, [{ barcode: "B1", priceWithVAT: 100 }], f), /yazma kapalı/);
  await assert.rejects(setProductActive(rest, 5, false, f), /yazma kapalı/);
  assert.equal(calls.length, 0, "bayrak kapalıyken istek gitmez");

  // Kurallar
  assert.deepEqual(validateStockPriceItems([]), ["boş ürün listesi gönderilemez"]);
  const errs = validateStockPriceItems([{ barcode: "A", priceWithVAT: 1 }, { barcode: "A", quantity: 10000 }, { barcode: "C", vatRate: 18 },
    { barcode: "D", discount: 71 }, { barcode: "E" }, { barcode: " " }]);
  for (const re of [/fiyat 1'den büyük/, /aynı barkod/, /stok 0–9999/, /KDV 0, 1, 10 ya da 20/, /indirim 0–70/, /en az bir alan/, /barkodsuz/]) assert.ok(errs.some(e => re.test(e)), String(re));
  assert.match(validateStockPriceItems(Array.from({ length: 1001 }, (_, i) => ({ barcode: `B${i}`, quantity: 1 })))[0], /en fazla 1000/);

  // Gönderim: doğru uç, yalnız verilen alanlar
  process.env.PTTAVM_WRITE_ENABLED = "true";
  const r = await updateStockPrices(rest, [{ barcode: " B1 ", priceWithVAT: 199.9, vatRate: 20 }], f);
  assert.equal(r.trackingId, "trk-1");
  assert.equal(calls[0].url, "https://integration-api.pttavm.com/api/v1/products/stock-prices");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { items: [{ barcode: "B1", priceWithVAT: 199.9, vatRate: 20 }] });
  await assert.rejects(updateStockPrices(rest, [{ barcode: "B1", priceWithVAT: 0.5 }], f), /geçersiz/);
  await setProductActive(rest, 42, false, f);
  assert.equal(calls[1].url, "https://integration-api.pttavm.com/api/v1/products/42/status");
  assert.deepEqual([calls[1].init.method, JSON.parse(String(calls[1].init.body))], ["PUT", { isActive: false }]);
  await trackingResult(rest, "trk-1", f);
  assert.equal(calls[2].url, "https://integration-api.pttavm.com/api/v1/products/tracking-result/trk-1");
  await assert.rejects(trackingResult(rest, "../x", f), /geçersiz/);
  if (prev === undefined) delete process.env.PTTAVM_WRITE_ENABLED; else process.env.PTTAVM_WRITE_ENABLED = prev;
  console.log("PttAVM yazma: bayrak kapalıyken istek yok, resmî kurallar, stock-prices gövdesi, aktif/pasif, işlem takibi passed");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
