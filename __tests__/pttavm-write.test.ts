/**
 * PttAVM yazma (lib/pttavm/write.ts): bayrak kapalıyken istek GİTMEZ; resmî kurallar (boş liste, ≤1000, barkod tekil/≤250, en az bir
 * alan, KDV 0/1/10/20, fiyat > 1, indirim 0–70, stok 0–9999); doğru uç + yalnız verilen alanlar; aktif/pasif PUT; işlem takibi.
 * Ağ yok (sahte fetch). Çalıştır: node --import tsx __tests__/pttavm-write.test.ts
 */
import assert from "node:assert/strict";
import { pttavmWriteEnabled, setProductActive, trackingResult, updateStockPrices, upsertProducts, validateStockPriceItems, validateUpsert } from "../lib/pttavm/write";
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
  assert.equal(pttavmWriteEnabled(soap, { PTTAVM_WRITE_ENABLED: "true" }), true, "SOAP ile yalnız fiyat/stok (soapUpdatePriceStock); REST uçları ayrıca REST ister");
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
  // Ürün ekleme/güncelleme (upsert): yeni üründe zorunlular, varyantlı ürün reddi, yalnız verilen alanlar
  const ue = validateUpsert([{ barcode: "N1", isNew: true }, { barcode: "V1", isNew: false, hasVariants: true, name: "x" }, { barcode: "U1", isNew: false },
    { barcode: "P1", isNew: false, priceWithVat: 100, vatRate: 0 }, { barcode: "L1", isNew: false, name: "x".repeat(201) }]);
  for (const re of [/kategori zorunlu/, /ad zorunlu/, /fiyat, KDV ve stok/, /en az bir görsel/, /ean zorunlu/, /varyantları siler/, /en az bir alan/, /KDV > 0/, /1–200/]) assert.ok(ue.some(e => re.test(e)), String(re));
  const neu = { barcode: "ALFOS-X", isNew: true, categoryId: 7, ean: "ALFOS-X", name: "Yeni ad", priceWithVat: 250, vatRate: 20, quantity: 4, images: ["https://cdn.y/a.jpg"] };
  assert.deepEqual(validateUpsert([neu]), []);
  await upsertProducts(rest, [neu], f);
  assert.equal(calls[3].url, "https://integration-api.pttavm.com/api/v1/products/upsert");
  assert.deepEqual(JSON.parse(String(calls[3].init.body)), { items: [{ barcode: "ALFOS-X", categoryId: 7, ean: "ALFOS-X", name: "Yeni ad", priceWithVat: 250, vatRate: 20, quantity: 4, images: [{ url: "https://cdn.y/a.jpg" }] }] });
  await upsertProducts(rest, [{ barcode: "B9", isNew: false, longDescription: "<p>yeni</p>" }], f);
  assert.deepEqual(JSON.parse(String(calls[4].init.body)), { items: [{ barcode: "B9", longDescription: "<p>yeni</p>" }] });
  delete process.env.PTTAVM_WRITE_ENABLED;
  await assert.rejects(upsertProducts(rest, [neu], f), /yazma kapalı/);
  assert.equal(calls.length, 5);
  if (prev === undefined) delete process.env.PTTAVM_WRITE_ENABLED; else process.env.PTTAVM_WRITE_ENABLED = prev;
  console.log("PttAVM yazma: bayrak kapalıyken istek yok, resmî kurallar, stock-prices gövdesi, aktif/pasif, işlem takibi passed");
}
main().then(() => soapTests()).catch(e => { console.error(e); process.exitCode = 1; }); // sırayla: ikisi de PTTAVM_WRITE_ENABLED'i değiştirir

// SOAP fiyat/stok (kullanıcı adı/şifre): önce BarkodKontrol okunur, değişmeyen alanlar aynen geri gönderilir; okunamazsa/varyantlıysa gönderilmez.
import { parseSoapCurrent, soapUpdatePriceStock, stokUrunXml } from "../lib/pttavm/write";
async function soapTests() {
  const soap = { mode: "soap" as const, username: "u", password: "p" };
  const kontrol = (extra = "") => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><BarkodKontrolResponse xmlns="http://tempuri.org/"><BarkodKontrolResult xmlns:a="http://schemas.datacontract.org/2004/07/ePttAVMService">
    <a:Aktif>true</a:Aktif><a:Barkod>B1</a:Barkod><a:Iskonto>5</a:Iskonto><a:KDVOran>20</a:KDVOran><a:KDVli>240</a:KDVli><a:Miktar>7</a:Miktar>${extra}</BarkodKontrolResult></BarkodKontrolResponse></s:Body></s:Envelope>`;
  const ok = `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><StokFiyatGuncelle3Response xmlns="http://tempuri.org/"><StokFiyatGuncelle3Result xmlns:a="http://schemas.datacontract.org/2004/07/ePttAVMService"><a:ErrorMessage/><a:Success>true</a:Success><a:UrunId>99</a:UrunId></StokFiyatGuncelle3Result></StokFiyatGuncelle3Response></s:Body></s:Envelope>`;
  const bodies: string[] = [];
  const mk = (first: string, second = ok) => { let i = 0; return (async (_u: string, init: RequestInit) => { bodies.push(String(init.body)); return new Response(i++ === 0 ? first : second, { status: 200 }); }) as unknown as typeof fetch; };
  const prevFlag = process.env.PTTAVM_WRITE_ENABLED;
  delete process.env.PTTAVM_WRITE_ENABLED;
  await assert.rejects(soapUpdatePriceStock(soap, "B1", { priceWithVat: 200 }, mk(kontrol())), /yazma kapalı/);
  assert.equal(bodies.length, 0);
  process.env.PTTAVM_WRITE_ENABLED = "true";
  // REST'e özgü uçlar SOAP modunda kapalı kalır
  await assert.rejects(updateStockPrices(soap, [{ barcode: "B1", quantity: 1 }], mk(kontrol())), /REST anahtarları/);
  const r = await soapUpdatePriceStock(soap, "B1", { priceWithVat: 216 }, mk(kontrol()));
  assert.equal(r.urunId, "99");
  assert.match(bodies[0], /<tem:BarkodKontrol><tem:Barkod>B1<\/tem:Barkod><\/tem:BarkodKontrol>/);
  assert.match(bodies[1], /<tem:StokFiyatGuncelle3><tem:item><ept:Aktif>true<\/ept:Aktif><ept:Barkod>B1<\/ept:Barkod><ept:Iskonto>5<\/ept:Iskonto><ept:KDVOran>20<\/ept:KDVOran><ept:KDVli>216<\/ept:KDVli><ept:KDVsiz>180<\/ept:KDVsiz><ept:Miktar>7<\/ept:Miktar><\/tem:item>/,
    "aktiflik, iskonto, KDV oranı ve STOK aynen; yalnız fiyat değişir");
  await soapUpdatePriceStock(soap, "B1", { quantity: 3 }, mk(kontrol()));
  assert.match(bodies[3], /<ept:KDVli>240<\/ept:KDVli><ept:KDVsiz>200<\/ept:KDVsiz><ept:Miktar>3<\/ept:Miktar>/, "stok değişince fiyat aynen");
  const n = bodies.length;
  await assert.rejects(soapUpdatePriceStock(soap, "B2", { priceWithVat: 200 }, mk(kontrol())), /okunamadı ya da eşleşmedi/);
  await assert.rejects(soapUpdatePriceStock(soap, "B1", { priceWithVat: 200 }, mk(kontrol("<a:VariantListesi><a:Variant><a:Miktar>1</a:Miktar></a:Variant></a:VariantListesi>"))), /varyantlı/);
  assert.equal(bodies.length, n + 2, "yalnız okuma isteği gitti, güncelleme gitmedi");
  const fail = ok.replace("<a:ErrorMessage/>", "<a:ErrorMessage>Barkod bulunamadı</a:ErrorMessage>").replace(">true</a:Success>", ">false</a:Success>");
  await assert.rejects(soapUpdatePriceStock(soap, "B1", { priceWithVat: 200 }, mk(kontrol(), fail)), /Barkod bulunamadı/);
  await assert.rejects(soapUpdatePriceStock(soap, "B1", { priceWithVat: 1 }, mk(kontrol())), /1'den büyük/);
  assert.equal(parseSoapCurrent(null, "B1"), null);
  assert.match(stokUrunXml({ barcode: "A&B", active: false, quantity: 0, priceWithVat: 100, vatRate: 10, discount: 0, hasVariants: false }, {}), /<ept:Aktif>false<\/ept:Aktif><ept:Barkod>A&amp;B<\/ept:Barkod>/);
  if (prevFlag === undefined) delete process.env.PTTAVM_WRITE_ENABLED; else process.env.PTTAVM_WRITE_ENABLED = prevFlag;
  console.log("PttAVM SOAP fiyat/stok: önce okuma, değişmeyen alanlar aynen, eşleşmeyen/varyantlı ürün gönderilmez, başarısız sonuç hata passed");
}
