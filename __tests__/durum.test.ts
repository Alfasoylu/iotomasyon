/**
 * /api/durum sızdırma testi — ağ/DB GEREKTİRMEZ.
 * Çalıştır: npm run check:durum
 *
 * Neden test: bu uç HERKESE AÇIK. Bir gün "teşhisi kolaylaştırmak için"
 * anahtarın ilk 4 hanesini ya da uzunluğunu eklemek cazip gelir; ikisi de
 * sızdırmadır ve fark edilmesi zordur. Test, uçtan dönen gövdede env
 * DEĞERLERİNİN geçmediğini sabitler.
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

console.log("\n/api/durum sızdırma testleri\n");

const src = readFileSync("app/api/durum/route.ts", "utf8");

// Gizli sayılan değişkenler: değerleri ASLA yanıta girmemeli.
const GIZLI = [
  "WHATSAPP_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_VERIFY_TOKEN",
  "META_ADS_TOKEN",
  "META_AD_ACCOUNT_ID",
  "CRON_SECRET",
];

check("Gizli değişkenler yalnız `tanimli()` içinden okunuyor", () => {
  for (const ad of GIZLI) {
    // process.env.X geçen her satır ya tanimli(...) ya da normalizeAccountId
    // ile sarılmış olmalı; çıplak kullanım değeri yanıta taşıyabilir.
    const satirlar = src
      .split("\n")
      .filter((s) => s.includes(`process.env.${ad}`));
    assert.ok(satirlar.length > 0, `${ad} hiç okunmuyor — durum eksik kalır`);
    for (const s of satirlar) {
      const sarili =
        /tanimli\(\s*process\.env\./.test(s) ||
        /const\s+\w+\s*=\s*process\.env\.\w+\s*\?\?\s*""/.test(s);
      assert.ok(sarili, `${ad} çıplak okunuyor, değer sızabilir:\n         ${s.trim()}`);
    }
  }
});

check("Yanıtta gizli değeri basan bir ifade YOK", () => {
  // `token: process.env.X` gibi doğrudan atama, slice/substring ile kırpma,
  // uzunluk sızdırma (`.length`) — hepsi yasak.
  for (const ad of GIZLI) {
    assert.ok(
      !new RegExp(`:\\s*process\\.env\\.${ad}\\b`).test(src),
      `${ad} doğrudan yanıta atanmış`
    );
    assert.ok(
      !new RegExp(`process\\.env\\.${ad}[^\\n]*\\.(slice|substring|substr|length)`).test(src),
      `${ad} kırpılarak/uzunluğuyla sızdırılıyor`
    );
  }
});

check("templateLang BİLEREK açık (gizli değil, yanlış yazımı arıza sebebi)", () => {
  // Bu tek istisna: dil kodu gizli degil ve "tr_TR" gibi yanlis yazim Meta'da
  // 132001 uretiyor. Gorunur olmasi teshis icin gerekli.
  assert.ok(src.includes("WHATSAPP_TEMPLATE_LANG"));
  assert.ok(
    /templateLang:\s*process\.env\.WHATSAPP_TEMPLATE_LANG/.test(src),
    "templateLang değeri gösterilmeli"
  );
});

check("Uç kimlik doğrulaması İSTEMİYOR (uzaktan ölçüm için)", () => {
  // Auth arkasina alinirsa kurulumu uzaktan dogrulamak imkansizlasir ki bu
  // ucun VAR OLMA sebebi tam olarak bu.
  assert.ok(!src.includes("requireUser"), "auth eklenmiş — uzaktan ölçüm bozulur");
  assert.ok(!src.includes("checkPermission"));
});

check("Önbelleğe alınmıyor (bayat durum yanıltır)", () => {
  assert.ok(src.includes('"no-store"'), "cache-control: no-store olmalı");
  assert.ok(src.includes('dynamic = "force-dynamic"'));
});

console.log(failed === 0 ? "\n✅ Tumu gecti\n" : `\n❌ ${failed} test basarisiz\n`);
process.exit(failed === 0 ? 0 : 1);
