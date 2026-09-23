/**
 * Entegra satış yükleme testleri — ağ/DB GEREKTİRMEZ.
 * Çalıştır: npm run check:entegra
 *
 * Neden test: 23.09.2026'da gerçek Entegra dosyasında yakalanan hata bu
 * dosyanın varlık sebebi. `/iade|iptal/i.test("İade-İptal")` **false** döner
 * (Türkçe büyük İ, U+0130, ASCII 'i'ye katlanmaz) ve ekranın en kritik uyarısı
 * — "iadeye dönecek" — her gerçek iadede sessizce 0 gösterirdi. Hata görünür
 * değildi: sayfa çalışıyor, sayı sıfır, kimse fark etmiyor.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeChannel, toLineId, toDateOnly, toDecimal } from "../lib/entegra/parse";

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

console.log("\nEntegra yükleme testleri\n");

/* ── iade tespiti (Türkçe 'i' tuzağı) ─────────────────────────────────────── */

// import.ts prisma'yı import ettiği için burada mantığı KAYNAKTAN doğruluyoruz:
// fonksiyonun kendisi aynı dosyada, kopyalamak ayrışma riski taşırdı.
const importSrc = readFileSync("lib/entegra/import.ts", "utf8");

check("iadeMi ham /iade|iptal/i regex'i KULLANMIYOR (Türkçe İ'yi kaçırır)", () => {
  const govde = importSrc.slice(importSrc.indexOf("function iadeMi"));
  const son = govde.slice(0, govde.indexOf("\n}"));
  assert.ok(
    !/\/iade\|iptal\/i\.test/.test(son),
    "iadeMi yine ham regex kullanıyor — 'İade-İptal' yakalanmaz"
  );
});

check("iadeMi Türkçe normalize ediyor (NFD + noktasız ı)", () => {
  const govde = importSrc.slice(importSrc.indexOf("function iadeMi"));
  const son = govde.slice(0, govde.indexOf("\n}"));
  assert.ok(son.includes("normalize"), "NFD normalize yok");
  assert.ok(son.includes("u0131") || son.includes("ı"), "noktasız ı ele alınmıyor");
});

// Düzeltilmiş mantığın kendisi (import.ts ile AYNI adımlar) kenar durumlara karşı:
const iadeMi = (s: string) =>
  ((n) => n.includes("iade") || n.includes("iptal"))(
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ı/g, "i")
  );

check("İade-İptal (Entegra'nın gerçek yazımı) iade sayılır", () => {
  assert.equal(iadeMi("İade-İptal"), true);
  // Ham regex'in başarısız olduğunu da sabitle — testin neyi koruduğu belli olsun.
  assert.equal(/iade|iptal/i.test("İade-İptal"), false);
});

check("ASCII ve karışık yazımlar da iade sayılır", () => {
  for (const s of ["IPTAL", "iptal edildi", "Iade", "İptal", "ıptal", "İADE-İPTAL"]) {
    assert.equal(iadeMi(s), true, `${s} iade sayılmadı`);
  }
});

check("satış durumları iade SAYILMAZ", () => {
  for (const s of ["Onaylandı", "Yeni Siparis", "Kargolandı", "Teslim Edildi"]) {
    assert.equal(iadeMi(s), false, `${s} yanlışlıkla iade sayıldı`);
  }
});

/* ── alan eşlemesi ────────────────────────────────────────────────────────── */

check("kanal adları BÜYÜK harfe normalize ediliyor", () => {
  assert.equal(normalizeChannel("trendyol"), "TRENDYOL");
  assert.equal(normalizeChannel("HepsiBurada"), "HEPSIBURADA");
  assert.equal(normalizeChannel("Eptt"), "EPTT");
  assert.equal(normalizeChannel("n11"), "N11");
  assert.equal(normalizeChannel("Ideasoft"), "IDEASOFT");
  assert.equal(normalizeChannel("mirakl_koctas"), "MIRAKL_KOCTAS");
  assert.equal(normalizeChannel(""), null);
});

check("externalLineId tam sayıya iniyor ('153936.0' → '153936')", () => {
  assert.equal(toLineId("153936.0"), "153936");
  assert.equal(toLineId(153936), "153936");
  assert.equal(toLineId("153936"), "153936");
  // Boş ID benzersiz anahtarı kuramaz → null (satır atlanır).
  assert.equal(toLineId(""), null);
  assert.equal(toLineId(null), null);
});

check("tarihten SAAT atılıyor, gün kaymıyor", () => {
  // Gün sonu saati yerel saat diliminde bir sonraki güne kayabilirdi.
  assert.equal(toDateOnly(new Date(Date.UTC(2026, 4, 19, 23, 59)))?.toISOString(), "2026-05-19T00:00:00.000Z");
  assert.equal(toDateOnly("5/19/26")?.toISOString(), "2026-05-19T00:00:00.000Z");
  assert.equal(toDateOnly("19.05.2026")?.toISOString(), "2026-05-19T00:00:00.000Z");
  assert.equal(toDateOnly("2026-05-19")?.toISOString(), "2026-05-19T00:00:00.000Z");
  assert.equal(toDateOnly(""), null);
});

check("ondalık ayıracı: virgül ve binlik nokta", () => {
  assert.equal(toDecimal("100,50"), 100.5);
  assert.equal(toDecimal("1.234,56"), 1234.56);
  assert.equal(toDecimal("1234.56"), 1234.56);
  assert.equal(toDecimal(""), null);
});

/* ── yazma sınırları ──────────────────────────────────────────────────────── */

check("yükleme cfo_* tablolarına YAZMIYOR", () => {
  const sql = readFileSync("lib/entegra/sql.ts", "utf8");
  for (const src of [importSrc, sql]) {
    assert.ok(
      !/(INSERT|UPDATE|DELETE)[\s\S]{0,40}cfo_/i.test(src),
      "cfo_* tablosuna yazma girişimi var"
    );
  }
  // cfo_norm okuması serbest ve gerekli.
  assert.ok(importSrc.includes("cfo_norm"), "cfo_norm eşleştirmesi kaybolmuş");
});

check("birebir eşleşme cfo_norm'DAN ÖNCE çalışıyor", () => {
  const i1 = importSrc.indexOf("lower(p.sku) = lower(m.model)");
  const i2 = importSrc.indexOf("cfo_norm(p.sku) = cfo_norm(m.model)");
  assert.ok(i1 > 0 && i2 > 0, "iki aşama da bulunamadı");
  assert.ok(i1 < i2, "cfo_norm birebirden önce çalışıyor — ANUNNAKI-POINTER yanlış ürüne yazılır");
});

check("belirsiz eşleşme (n>1) reddediliyor", () => {
  assert.ok(importSrc.includes("n === 1"), "tekil eşleşme şartı yok — rastgele ürün seçilebilir");
});

console.log(failed === 0 ? "\n✓ tüm testler geçti\n" : `\n✗ ${failed} test başarısız\n`);
process.exit(failed === 0 ? 0 : 1);
