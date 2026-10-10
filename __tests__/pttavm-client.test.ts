/**
 * PttAVM salt-okuma istemcisi (lib/pttavm): kimlik seçimi (REST > SOAP), REST başlıkları, SOAP WS-Security zarfı + yanıt ayrıştırma
 * (PascalCase → camelCase, i:nil), ≤30 günlük pencereler, yazma uçlarının engeli, kişisel veri içermeyen özet. Ağ yok (sahte fetch).
 * Çalıştır: node --import tsx __tests__/pttavm-client.test.ts
 */
import assert from "node:assert/strict";
import { orderWindows, pttavmConfig, restPostRead, searchOrders, soapCall, soapEnvelope, summarizeOrders, type PttavmConfig } from "../lib/pttavm/client";
import { parseXml } from "../lib/pttavm/xml";

async function main() {
  // Kimlik seçimi: REST anahtarları varsa REST, yoksa SOAP, hiçbiri yoksa null
  assert.equal(pttavmConfig({}), null);
  assert.equal(pttavmConfig({ PTTAVM_USERNAME: "u", PTTAVM_PASSWORD: "p" })!.mode, "soap");
  assert.equal(pttavmConfig({ PTTAVM_USERNAME: "u", PTTAVM_PASSWORD: "p", PTTAVM_API_KEY: "k", PTTAVM_ACCESS_TOKEN: "t" })!.mode, "rest");
  assert.equal(pttavmConfig({ PTTAVM_API_KEY: "k" }), null, "token olmadan REST yok");

  // Pencereler: 75 gün → 30 + 30 + 15; bitiş < başlangıç hata
  const d = (s: string) => new Date(s + "T00:00:00Z");
  assert.deepEqual(orderWindows(d("2026-07-27"), d("2026-10-10")).map(([a, b]) => [a.toISOString().slice(0, 10), b.toISOString().slice(0, 10)]),
    [["2026-07-27", "2026-08-26"], ["2026-08-26", "2026-09-25"], ["2026-09-25", "2026-10-10"]]);
  assert.throws(() => orderWindows(d("2026-10-10"), d("2026-10-01")));

  // REST: başlıklar (Api-Key, access-token, her istekte yeni X-Correlation-Id), parametreler
  const rest: PttavmConfig = { mode: "rest", apiKey: "KEY", accessToken: "TOK" };
  const calls: { url: string; init: RequestInit }[] = [];
  const restFetch = (async (url: string, init: RequestInit) => { calls.push({ url, init });
    return new Response(JSON.stringify([{ siparisNo: "1", kargoTutari: 10, siparisUrunler: [{ siparisDurumu: "tamamlandi", kdvDahilToplamTutar: 120, kdvHaricToplamTutar: 100, komisyon: 12, toplamIslemAdedi: 1 }] }]), { status: 200 }); }) as unknown as typeof fetch;
  const ro = await searchOrders(rest, d("2026-09-01"), d("2026-10-10"), restFetch);
  assert.equal(calls.length, 2, "39 gün → 2 pencere");
  const h = calls[0].init.headers as Record<string, string>;
  assert.equal(h["Api-Key"], "KEY"); assert.equal(h["access-token"], "TOK"); assert.match(h["X-Correlation-Id"], /^[0-9a-f-]{36}$/);
  assert.notEqual(h["X-Correlation-Id"], (calls[1].init.headers as Record<string, string>)["X-Correlation-Id"]);
  const u = new URL(calls[0].url);
  assert.equal(u.pathname, "/api/v1/orders/search"); assert.equal(u.searchParams.get("isActiveOrders"), "false");
  assert.equal(u.searchParams.get("startDate"), "2026-09-01T00:00:00");
  assert.equal(ro.length, 2);

  // Yazma uçları engelli (stok/fiyat, ürün, fatura, barkod oluşturma)
  for (const p of ["/products/stock-prices", "/products/upsert", "/orders/1/invoice", "/create-barcode"])
    await assert.rejects(restPostRead(rest, p, {}, restFetch), /yazma ucu engellendi/);
  const soap: PttavmConfig = { mode: "soap", username: "alfa&<", password: "p\"w" };
  await assert.rejects(soapCall(soap, "StokFiyatGuncelle", {}, restFetch), /salt-okuma listesinde değil/);
  await assert.rejects(soapCall(soap, "OlmayanUrunAdetleriSifirla", {}, restFetch), /salt-okuma/);

  // SOAP zarfı: WS-Security UsernameToken, kaçışlı kimlik, tem: ad alanı
  const env = soapEnvelope(soap, "SiparisKontrolListesiV2", { BaslangicTarihi: "2026-09-01T00:00:00", AktifSiparisler: 0 });
  assert.match(env, /<wsse:Username>alfa&amp;&lt;<\/wsse:Username>/);
  assert.match(env, /#PasswordText">p&quot;w<\/wsse:Password>/);
  assert.match(env, /<tem:SiparisKontrolListesiV2><tem:BaslangicTarihi>2026-09-01T00:00:00<\/tem:BaslangicTarihi><tem:AktifSiparisler>0<\/tem:AktifSiparisler>/);

  // SOAP yanıtı: ad alanı önekleri, i:nil, tekil/çoğul satırlar, PascalCase → camelCase
  const xml = `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><SiparisKontrolListesiV2Response xmlns="http://tempuri.org/">
    <SiparisKontrolListesiV2Result xmlns:a="http://x" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
      <a:TedarikciSiparisKontrolV2><a:SiparisNo>A1</a:SiparisNo><a:Eposta i:nil="true"/><a:KargoTutari>0</a:KargoTutari>
        <a:SiparisUrunler><a:SiparisUrun><a:SiparisDurumu>iade</a:SiparisDurumu><a:KdvDahilToplamTutar>50.5</a:KdvDahilToplamTutar><a:Komisyon>5</a:Komisyon></a:SiparisUrun></a:SiparisUrunler>
      </a:TedarikciSiparisKontrolV2>
      <a:TedarikciSiparisKontrolV2><a:SiparisNo>A2 &amp; B</a:SiparisNo><a:SiparisUrunler>
        <a:SiparisUrun><a:SiparisDurumu>tamamlandi</a:SiparisDurumu><a:KdvDahilToplamTutar>100</a:KdvDahilToplamTutar><a:Komisyon>14</a:Komisyon></a:SiparisUrun>
        <a:SiparisUrun><a:SiparisDurumu>tamamlandi</a:SiparisDurumu><a:KdvDahilToplamTutar>30</a:KdvDahilToplamTutar></a:SiparisUrun></a:SiparisUrunler>
      </a:TedarikciSiparisKontrolV2></SiparisKontrolListesiV2Result></SiparisKontrolListesiV2Response></s:Body></s:Envelope>`;
  const soapCalls: RequestInit[] = [];
  const soapFetch = (async (_u: string, init: RequestInit) => { soapCalls.push(init); return new Response(xml, { status: 200 }); }) as unknown as typeof fetch;
  const so = await searchOrders(soap, d("2026-10-01"), d("2026-10-10"), soapFetch);
  assert.equal((soapCalls[0].headers as Record<string, string>).SOAPAction, '"http://tempuri.org/IService/SiparisKontrolListesiV2"');
  assert.deepEqual(so.map(o => [o.siparisNo, o.eposta, o.siparisUrunler!.length]), [["A1", null, 1], ["A2 & B", undefined, 2]]);
  const s = summarizeOrders(so);
  assert.deepEqual([s.orders, s.lines, s.byStatus, s.grossInclVatTry, s.returnLines, s.returnGrossTry, s.commissionTry], [2, 3, { iade: 1, tamamlandi: 2 }, 180.5, 1, 50.5, 14]);
  // Komisyon satırda ORAN (%): 100 TL × %14 = 14 TL; iade satırı (oran 5) ve oransız satır hariç (üretim 10.10: alan toplamı 2.324 / 161 satır ≈ %14,4)
  assert.deepEqual([s.commissionPctOfGross, s.avgCommissionRatePct], [14, 14]);
  assert.ok(!JSON.stringify(s).includes("A1"), "özet sipariş no / kişisel veri taşımaz");

  // SOAP Fault → anlamlı hata
  const faultFetch = (async () => new Response(`<s:Envelope xmlns:s="x"><s:Body><s:Fault><faultcode>s:Client</faultcode><faultstring>Kullanıcı doğrulanamadı</faultstring></s:Fault></s:Body></s:Envelope>`, { status: 500 })) as unknown as typeof fetch;
  await assert.rejects(soapCall(soap, "GetVersion", {}, faultFetch), /500: Kullanıcı doğrulanamadı/);
  assert.throws(() => parseXml("<a><b></a>"), /uyuşmuyor/);
  console.log("PttAVM istemcisi: kimlik seçimi, REST başlıkları + pencereler, SOAP zarfı/yanıtı, yazma engeli, kişisel verisiz özet, SOAP Fault passed");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
