/**
 * N11 istemcisi (lib/n11/client.ts): yapılandırma, 14 günlük sipariş dilimleri, REST başlıkları + izin listesi, sayfalama, komisyon özeti
 * (etkin oran = komisyon − kampanya; iptal/tedarik edilemedi hariç; kişisel veri yok), SOAP zarfı (auth gövdede, kaçış), soru listesi
 * ayrıştırma, yanıt doğrulama (1–2048, sayısal id), SOAP "failure" hatası, yazma işleminin okuma yoluyla çağrılamaması.
 * Ağ yok (sahte fetch). Çalıştır: node --import tsx __tests__/n11-client.test.ts
 */
import assert from "node:assert/strict";
import { answerQuestion, listQuestions, listShipmentPackages, n11Config, orderWindows, restGet, soapEnvelope, summarizeCommission } from "../lib/n11/client";

async function main() {
  assert.equal(n11Config({}), null);
  const cfg = n11Config({ N11_APP_KEY: " k ", N11_APP_SECRET: "s" })!;
  assert.deepEqual(cfg, { appKey: "k", appSecret: "s" });

  // 30 gün → 3 dilim (14 + 14 + 2), hiçbiri 15 günü aşmaz
  const w = orderWindows(new Date("2026-09-10T00:00:00Z"), new Date("2026-10-10T00:00:00Z"));
  assert.equal(w.length, 3);
  assert.ok(w.every(([a, b]) => b.getTime() - a.getTime() < 15 * 86400_000));

  // REST: başlıklar, izin listesi, sayfalama (100 dolu sayfa → bir sonraki)
  const calls: { url: string; init: RequestInit }[] = [];
  const line = (o: object) => ({ orderLineId: 1, quantity: 1, price: 100, sellerInvoiceAmount: 100, commissionRate: 15, sellerCampaignCommissionRate: 2, orderItemLineItemStatusName: "Delivered", ...o });
  const full = { content: Array.from({ length: 100 }, (_, i) => ({ id: i, lines: [line({})] })), totalPages: 2 };
  const rest = (async (url: string, init: RequestInit) => { calls.push({ url, init });
    const page = new URL(url).searchParams.get("page");
    return new Response(JSON.stringify(page === "0" ? full : { content: [{ id: 999, shipmentPackageStatus: "Cancelled", lines: [line({})] }], totalPages: 2 }), { status: 200 }); }) as unknown as typeof fetch;
  const pk = await listShipmentPackages(cfg, new Date("2026-10-01T00:00:00Z"), new Date("2026-10-10T00:00:00Z"), rest);
  assert.equal(pk.length, 101);
  assert.equal(calls.length, 2);
  const h = calls[0].init.headers as Record<string, string>;
  assert.deepEqual([h.appKey, h.appSecret, "Authorization" in h], ["k", "s", false]);
  assert.match(calls[0].url, /^https:\/\/api\.n11\.com\/rest\/delivery\/v1\/shipmentPackages\?startDate=\d+&endDate=\d+&page=0&size=100$/);
  await assert.rejects(restGet(cfg, "/ms/product/tasks/price-stock-update", {}, rest), /okuma listesinde değil/);

  // Komisyon: 100 satır × 100 TL × (15 − 2)% = 1.300 TL; iptal paket hariç
  const s = summarizeCommission(pk);
  assert.deepEqual([s.lines, s.excludedLines, s.grossTry, s.commissionTry, s.commissionPctOfRated], [100, 1, 10000, 1300, 13]);
  assert.equal(summarizeCommission([{ lines: [line({ commissionRate: undefined })] }]).linesWithoutRate, 1);
  assert.ok(!JSON.stringify(s).match(/fullName|address|email/i), "özet kişisel veri içermez");

  // SOAP zarfı: auth gövdede, değerler kaçışlı
  const env = soapEnvelope(cfg, "SaveProductAnswer", { productQuestionId: "5", answer: "a<b & c" });
  assert.match(env, /<sch:SaveProductAnswerRequest><auth><appKey>k<\/appKey><appSecret>s<\/appSecret><\/auth><productQuestionId>5<\/productQuestionId><answer>a&lt;b &amp; c<\/answer><\/sch:SaveProductAnswerRequest>/);

  // Soru listesi ayrıştırma
  const soapCalls: { url: string; body: string }[] = [];
  const soapOk = (xml: string) => (async (url: string, init: RequestInit) => { soapCalls.push({ url, body: String(init.body) }); return new Response(xml, { status: 200 }); }) as unknown as typeof fetch;
  const listXml = `<?xml version="1.0"?><SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"><SOAP-ENV:Body><ns3:GetProductQuestionListResponse xmlns:ns3="http://www.n11.com/ws/schemas">
    <result><status>success</status></result><productQuestions><productQuestion><id>77</id><productId>9</productId><productTitle>Priz</productTitle><questionSubject>Ürün</questionSubject><question>Kaç amper?</question><answer/></productQuestion></productQuestions>
    <pagingData><currentPage>0</currentPage><pageSize>50</pageSize><totalCount>1</totalCount><pageCount>1</pageCount></pagingData></ns3:GetProductQuestionListResponse></SOAP-ENV:Body></SOAP-ENV:Envelope>`;
  const qs = await listQuestions(cfg, { from: new Date("2026-10-01T12:00:00Z"), to: new Date("2026-10-10T12:00:00Z") }, soapOk(listXml));
  assert.deepEqual(qs.items, [{ id: "77", productId: "9", productTitle: "Priz", subject: "Ürün", question: "Kaç amper?", answer: null }]);
  assert.equal(qs.totalCount, 1);
  assert.equal(soapCalls[0].url, "https://api.n11.com/ws/productService/");
  assert.match(soapCalls[0].body, /<status>OPEN<\/status><startDate>01\/10\/2026<\/startDate><endDate>10\/10\/2026<\/endDate>/);

  // Yanıt: doğrulama + failure sonucu hata
  await assert.rejects(answerQuestion(cfg, "abc", "x", soapOk("")), /geçersiz soru id/);
  await assert.rejects(answerQuestion(cfg, "77", " ", soapOk("")), /1–2048/);
  await assert.rejects(answerQuestion(cfg, "77", "x".repeat(2049), soapOk("")), /1–2048/);
  const fail = `<Envelope><Body><SaveProductAnswerResponse><result><status>failure</status><errorCode>X1</errorCode><errorMessage>zaten yanıtlandı</errorMessage></result></SaveProductAnswerResponse></Body></Envelope>`;
  await assert.rejects(answerQuestion(cfg, "77", "16 amper.", soapOk(fail)), /zaten yanıtlandı/);
  const ok = `<Envelope><Body><SaveProductAnswerResponse><result><status>success</status></result></SaveProductAnswerResponse></Body></Envelope>`;
  await answerQuestion(cfg, "77", "16 amper.", soapOk(ok));
  console.log("N11 istemcisi: 14 günlük dilim, REST başlık/izin listesi/sayfalama, komisyon özeti (kişisel veri yok), SOAP zarfı, soru listesi, yanıt doğrulama passed");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
