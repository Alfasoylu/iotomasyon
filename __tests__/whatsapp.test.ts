/**
 * WhatsApp altyapısı birim testleri — DB/ağ GEREKTİRMEZ.
 * Çalıştır: npx tsx __tests__/whatsapp.test.ts
 *
 * Neden test: bu katmandaki hataların hepsi SESSİZ.
 *  - Numara yanlış normalleştirilirse mesaj hiç ulaşmaz, hata bile dönmez.
 *  - İmza doğrulaması gevşek olursa isteyen istediği "cevabı" yazdırabilir;
 *    depo kayıtları uydurulabilir ve kimse fark etmez.
 *  - Pencere kuralı yanlışsa Meta reddeder ve sebep log'da kaybolur.
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { normalizePhone, parseRecipients, cleanParam, windowOpen } from "../lib/whatsapp/phone";
import { signatureValid } from "../lib/whatsapp/signature";

let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  OK   ${name}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL ${name}\n         ${e instanceof Error ? e.message : e}`);
  }
}

console.log("\nWhatsApp altyapisi testleri\n");

// ── Numara ────────────────────────────────────────────────────────────────
check("Türk numarası biçimleri doğru çevrilir", () => {
  assert.equal(normalizePhone("0532 123 45 67"), "905321234567");
  assert.equal(normalizePhone("+90 532 123 45 67"), "905321234567");
  assert.equal(normalizePhone("905321234567"), "905321234567");
  assert.equal(normalizePhone("5321234567"), "905321234567");
  assert.equal(normalizePhone("00905321234567"), "905321234567");
});

check("Baştaki 0 ATILIR — atılmazsa Meta numarayı bulamaz", () => {
  assert.ok(!normalizePhone("0532 123 45 67").startsWith("900"));
});

check("Geçersiz numara BOŞ döner (uydurma numaraya gönderilmez)", () => {
  assert.equal(normalizePhone(""), "");
  assert.equal(normalizePhone("abc"), "");
  assert.equal(normalizePhone("123"), "", "10 haneden kısa kabul edilmemeli");
});

check("Liste ayrıştırılır ve mükerrerler elenir", () => {
  assert.deepEqual(parseRecipients("0532 111 22 33, 0533 444 55 66"), ["905321112233", "905334445566"]);
  assert.deepEqual(parseRecipients("05321112233;+90 532 111 22 33"), ["905321112233"]);
  assert.deepEqual(parseRecipients("05321112233\n05334445566"), ["905321112233", "905334445566"]);
  assert.deepEqual(parseRecipients(""), []);
});

check("Numara İÇİNDEKİ boşluk listeyi bölmez", () => {
  // Turkiye'de numara "0532 111 22 33" diye yazilir. Bosluk ayirici sayilsaydi
  // dort parcaya bolunur, dordu de elenir ve liste SESSIZCE bosalirdi.
  assert.deepEqual(parseRecipients("0532 111 22 33"), ["905321112233"]);
  assert.deepEqual(parseRecipients("+90 (532) 111-22-33"), ["905321112233"]);
});

check("Boşlukla ayrılmış iki numara da okunur (tek numara olarak geçmezse)", () => {
  assert.deepEqual(parseRecipients("905321112233 905334445566"), ["905321112233", "905334445566"]);
  assert.deepEqual(parseRecipients("05321112233 05334445566"), ["905321112233", "905334445566"]);
});

check("15 haneden uzun rakam dizisi REDDEDİLİR (uydurma numaraya gitmez)", () => {
  // Yapisan iki numara 24 haneye cikip "10+ hane" kuralini geciyordu; mesaj
  // var olmayan bir numaraya giderdi ve Meta hata donmezdi.
  assert.equal(normalizePhone("9053211122339053344455"), "", "15 haneden uzun kabul edilmemeli");
  assert.equal(normalizePhone("905321112233").length, 12, "gercek numara hala gecerli");
  assert.deepEqual(parseRecipients("9053211122339053344455"), [], "tek parca olarak da elenmeli");
});

// ── Şablon parametresi ────────────────────────────────────────────────────
check("Parametreden satır sonu/sekme temizlenir (Meta 132000)", () => {
  assert.equal(cleanParam("a\nb"), "a b");
  assert.equal(cleanParam("a\tb"), "a b");
  assert.ok(!/ {4}/.test(cleanParam("a          b")));
  assert.ok(cleanParam("x".repeat(500)).length <= 200);
});

// ── 24 saatlik pencere ────────────────────────────────────────────────────
check("Pencere: hiç yazmamışsa KAPALI", () => {
  assert.equal(windowOpen(null), false);
  assert.equal(windowOpen(undefined), false);
});

check("Pencere: 23 saat açık, 25 saat kapalı", () => {
  const now = new Date("2026-09-14T12:00:00Z");
  assert.equal(windowOpen(new Date("2026-09-13T13:00:00Z"), now), true, "23 saat -> acik");
  assert.equal(windowOpen(new Date("2026-09-13T11:00:00Z"), now), false, "25 saat -> kapali");
});

check("Pencere sınırı tam 24 saatte kapanır", () => {
  const now = new Date("2026-09-14T12:00:00Z");
  assert.equal(windowOpen(new Date("2026-09-13T12:00:00Z"), now), false);
  assert.equal(windowOpen(new Date("2026-09-13T12:00:01Z"), now), true);
});

// ── Webhook imzası — GÜVENLİĞİN KRİTİK NOKTASI ────────────────────────────
const SECRET = "test-app-secret";
const imzala = (body: string, secret = SECRET) =>
  "sha256=" + crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");

check("Doğru imza KABUL edilir", () => {
  const body = '{"entry":[]}';
  assert.equal(signatureValid(body, imzala(body), SECRET), true);
});

check("Gövde değiştirilmişse REDDEDİLİR", () => {
  // Saldirgan cevabi degistirip ayni imzayla gonderirse tutmamali.
  const body = '{"entry":[]}';
  const sig = imzala(body);
  assert.equal(signatureValid('{"entry":[{"sahte":1}]}', sig, SECRET), false);
});

check("Yanlış secret ile imza REDDEDİLİR", () => {
  const body = '{"entry":[]}';
  assert.equal(signatureValid(body, imzala(body, "baska-secret"), SECRET), false);
});

check("İmza başlığı yoksa/bozuksa REDDEDİLİR", () => {
  const body = '{"entry":[]}';
  assert.equal(signatureValid(body, null, SECRET), false);
  assert.equal(signatureValid(body, "", SECRET), false);
  assert.equal(signatureValid(body, "sha1=abc", SECRET), false, "yalniz sha256 kabul edilmeli");
  assert.equal(signatureValid(body, "deadbeef", SECRET), false, "on ek yoksa reddedilmeli");
});

check("Yanlış uzunluktaki imza ÇÖKERTMEZ, reddeder", () => {
  // timingSafeEqual farkli uzunlukta FIRLATIR; kontrol olmazsa webhook 500 verir
  // ve Meta saatlerce yeniden dener.
  const body = '{"entry":[]}';
  assert.doesNotThrow(() => signatureValid(body, "sha256=abc", SECRET));
  assert.equal(signatureValid(body, "sha256=abc", SECRET), false);
});

check("Boş gövde imzası da doğrulanır", () => {
  assert.equal(signatureValid("", imzala(""), SECRET), true);
  assert.equal(signatureValid("", imzala("x"), SECRET), false);
});

console.log(failed === 0 ? "\n✅ Tumu gecti\n" : `\n❌ ${failed} test basarisiz\n`);
process.exit(failed === 0 ? 0 : 1);
