/**
 * Push abonelik ucu — TENANT SIZDIRMA testi. Ağ/DB GEREKTİRMEZ.
 * Çalıştır: npm run check:push
 *
 * Neden test (güvenlik bulgusu D2): eski kod aboneliği yazmadan önce
 * `deleteMany({ where: { endpoint } })` çağırıyordu — `tenantId` YOK.
 * `endpoint` global unique olduğu için bu, kayıt başka bir tenant'a aitse
 * onu da siliyordu; ayrıca create'in catch'i sessiz olduğu için araya giren
 * herhangi bir hata aboneliği tamamen yok edip cihazı bildirimsiz
 * bırakıyordu. İkisi de SESSİZ arıza: kimse push almadığını günler sonra
 * fark eder.
 *
 * Test, "sil sonra oluştur" desenini ve tenant'sız silmeyi yasaklıyor.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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

console.log("\nPush abonelik (tenant izolasyonu) testleri\n");

const raw = readFileSync("app/api/pdks/push/subscribe/route.ts", "utf8");

/**
 * Yorumlar ÇIKARILIR. Dosyadaki açıklama eski hatalı deseni ("deleteMany")
 * anlatmak için birebir yazıyor; yorumlara bakan bir test o metni KOD sanıp
 * yanlış alarm verir. (Aynı tuzak alfashome'da yaşandı: kaba bir yorum
 * temizleme yüzünden testler YANLIŞ SEBEPLE geçiyordu — bu yüzden burada
 * hem satır hem blok yorumu ayrı ayrı siliyoruz ve sonucu tek satıra
 * indirgemiyoruz.)
 */
const src = raw
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

check("deleteMany ile silme YOK (tenant'sız silme geri geldi mi?)", () => {
  assert.doesNotMatch(
    src,
    /deleteMany\s*\(/,
    "abonelik yazılırken silme yapılıyor: başka tenant'ın kaydını silme ve " +
      "aboneliği tamamen kaybetme riski geri döndü (D2)"
  );
});

check("yazma ATOMİK (upsert) ve tenantId açıkça veriliyor", () => {
  assert.match(src, /upsert\s*\(/, "atomik yazma kalkmış");
  const upsert = src.slice(src.indexOf("upsert"));
  assert.match(upsert, /create:\s*\{[\s\S]*tenantId:\s*session\.tenantId/, "create'te tenantId yok");
  assert.match(upsert, /update:\s*\{[\s\S]*tenantId:\s*session\.tenantId/, "update'te tenantId yok");
});

check("anahtar döndüğünde tazeleniyor (p256dh/auth update'te)", () => {
  const upsert = src.slice(src.indexOf("upsert"));
  const update = upsert.slice(upsert.indexOf("update:"));
  assert.match(update, /p256dh/, "update p256dh yazmıyor — anahtar dönünce bildirim sessizce ölür");
  assert.match(update, /auth/, "update auth yazmıyor");
});

check("oturum zorunlu (withPdksSession)", () => {
  assert.match(src, /withPdksSession/, "kimlik doğrulaması kalkmış: herkes abonelik yazabilir");
});

check("sessiz yutan boş catch YOK", () => {
  assert.doesNotMatch(
    src,
    /catch\s*\{\s*(\/\/[^\n]*\n\s*)*\}/,
    "hatayı yutan boş catch: yazma başarısız olur, uç 200 döner, kimse fark etmez"
  );
});

console.log(failed === 0 ? "\n✅ Push testleri gecti\n" : `\n❌ ${failed} test BASARISIZ\n`);
process.exit(failed === 0 ? 0 : 1);
