/**
 * Banka hareketleri yükleme testleri — ağ/DB GEREKTİRMEZ.
 * Çalıştır: npm run check:banka
 *
 * Neden test: bu ekranın en kritik davranışları sessizce bozulabilir —
 * Türkçe başlık eşlemesi (Entegra'daki "İ" tuzağının aynısı), gün-önce tarih
 * ayrıştırma (Amerikan biçimiyle karıştırılırsa ay/gün yer değiştirir) ve
 * aynı gün/tutar/açıklamalı GERÇEK iki işlemin mükerrer sayılmaması.
 */

import assert from "node:assert/strict";
import {
  normalizeHeader,
  otomatikEsle,
  zorunluEksik,
  ALAN_ADAYLARI,
} from "../lib/banka/columns";
import { toDateOnlyTr, toDecimalTr, satirHash, normalizeAciklama, onayAnahtariHesapla } from "../lib/banka/parse";

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

console.log("\nBanka yükleme testleri\n");

/* ── başlık normalize (Türkçe İ/I tuzağı) ─────────────────────────────────── */

check("normalizeHeader büyük/küçük harf farkını yok eder", () => {
  assert.equal(normalizeHeader("Tarih"), normalizeHeader("TARİH"));
  assert.equal(normalizeHeader("Tarih"), normalizeHeader("tarih"));
});

check("normalizeHeader Türkçe İ/ı tuzağını doğru çözer (Entegra'daki aynı tuzak)", () => {
  // Ham toLowerCase() "İşlem" -> "i̇şlem" (noktalı, 2 karakter) yapar ve
  // "işlem" ile eşleşmez. normalizeHeader ikisini de aynı forma indirmeli.
  assert.equal(normalizeHeader("İşlem Tarihi"), normalizeHeader("işlem tarihi"));
  assert.equal(normalizeHeader("İşlem Tarihi"), normalizeHeader("İŞLEM TARİHİ"));
});

check("normalizeHeader boşluğu tekilleştirir ve baş/son boşluğu atar", () => {
  assert.equal(normalizeHeader("  İşlem   Açıklaması "), normalizeHeader("İşlem Açıklaması"));
});

check("normalizeHeader Türkçe karakterleri ASCII'ye indirir", () => {
  assert.equal(normalizeHeader("Gönderen/Alıcı"), normalizeHeader("gonderen/alici"));
});

/* ── otomatik sütun eşleme ────────────────────────────────────────────────── */

check("Enpara tarzı başlıklar (İşlem Tarihi/İşlem Açıklaması) eşleşir", () => {
  const { eslesen, eksikZorunlu } = otomatikEsle(["İşlem Tarihi", "İşlem Açıklaması", "Tutar", "Bakiye"]);
  assert.equal(eslesen.tarih, "İşlem Tarihi");
  assert.equal(eslesen.aciklama, "İşlem Açıklaması");
  assert.equal(eslesen.tutar, "Tutar");
  assert.equal(eslesen.bakiye, "Bakiye");
  assert.deepEqual(eksikZorunlu, []);
});

check("Borç/Alacak ayrı sütunlarla tutar zorunluluğu karşılanır", () => {
  const { eksikZorunlu } = otomatikEsle(["Tarih", "Açıklama", "Borç", "Alacak"]);
  assert.deepEqual(eksikZorunlu, []);
});

check("yalnız Borç varsa (Alacak yok) tutar hâlâ eksik sayılır", () => {
  const eksik = zorunluEksik({ tarih: "Tarih", aciklama: "Açıklama", borc: "Borç" });
  assert.ok(eksik.includes("tutar"));
});

check("tanınmayan başlık eşleşmeyen sütun listesine düşer, hata FIRLATMAZ", () => {
  const { eslesmeyenSutunlar } = otomatikEsle(["Tarih", "Açıklama", "Tutar", "İşlem Kanalı"]);
  assert.deepEqual(eslesmeyenSutunlar, ["İşlem Kanalı"]);
});

check("aynı başlık iki alana asla atanmaz (Tarih/Valör çakışması)", () => {
  // "Valör" hem tarih hem valor adayı OLABİLİRDİ — burada değil, ama genel
  // kural: bir başlık bulunduğu anda başka alan onu tekrar alamaz.
  const { eslesen } = otomatikEsle(["Tarih", "Tarih"]);
  // İkinci "Tarih" başlığı artık boş kalan bir alana düşmemeli (tarih dolu).
  const kacTaneTarihAlaniVar = Object.values(eslesen).filter((v) => v === "Tarih").length;
  assert.equal(kacTaneTarihAlaniVar, 1);
});

check("Tarih VE Valör birlikte varsa tarih Tarih'ten, Valör ayrı valor alanına düşer", () => {
  const { eslesen } = otomatikEsle(["Tarih", "Açıklama", "Tutar", "Valör"]);
  assert.equal(eslesen.tarih, "Tarih");
  assert.equal(eslesen.valor, "Valör");
});

check("YALNIZ Valör varsa (başka tarih sütunu yok) tarih ONDAN türetilir (görev §3)", () => {
  const { eslesen, eksikZorunlu } = otomatikEsle(["Valör", "Açıklama", "Tutar"]);
  assert.equal(eslesen.tarih, "Valör");
  assert.ok(!eksikZorunlu.includes("tarih"));
});

check("aday çakışması yalnız BİLEREK izin verilen tarih/valor çiftinde var (başka yerde yok)", () => {
  // "Valör" tarih VE valor adaylarında bilerek tekrarlanıyor (bkz. columns.ts
  // yorumu) — otomatikEsle bunu iki aşamalı çözüyor. Başka hiçbir alan
  // çifti bir adayı PAYLAŞMAMALI, aksi hâlde otomatikEsle'nin "ilk bulunan
  // kazanır" kuralı hangi alanın dolacağını belirsizleştirir.
  const IZINLI_CAKISMA = new Set(["tarih|valor", "valor|tarih"]);
  const gorulen = new Map<string, string>();
  for (const alan of Object.keys(ALAN_ADAYLARI) as (keyof typeof ALAN_ADAYLARI)[]) {
    for (const aday of ALAN_ADAYLARI[alan]) {
      const n = normalizeHeader(aday);
      const onceki = gorulen.get(n);
      if (onceki && onceki !== alan && !IZINLI_CAKISMA.has(`${onceki}|${alan}`)) {
        throw new Error(`"${aday}" hem ${onceki} hem ${alan} adayı — otomatikEsle ilk bulanı seçer, belirsiz`);
      }
      gorulen.set(n, alan);
    }
  }
});

/* ── tarih ayrıştırma (gün ÖNCE — Entegra'nın Amerikan varsayımı BURADA yok) ── */

check("dd/MM/yyyy gün-önce okunur (28/09/2026 → 28 Eylül, 9 DEĞİL)", () => {
  const d = toDateOnlyTr("28/09/2026");
  assert.ok(d);
  assert.equal(d!.getUTCFullYear(), 2026);
  assert.equal(d!.getUTCMonth(), 8); // 0 tabanlı: Eylül
  assert.equal(d!.getUTCDate(), 28);
});

check("dd.MM.yyyy da gün-önce okunur", () => {
  const d = toDateOnlyTr("05.01.2026");
  assert.ok(d);
  assert.equal(d!.getUTCMonth(), 0); // Ocak
  assert.equal(d!.getUTCDate(), 5);
});

check("13/02/2026 gibi ay>12 olamayacak biçimler de gün-önce okunur", () => {
  const d = toDateOnlyTr("13/02/2026");
  assert.ok(d);
  assert.equal(d!.getUTCMonth(), 1); // Şubat
  assert.equal(d!.getUTCDate(), 13);
});

check("Excel seri numarası (sayı) doğru tarihe çözülür", () => {
  const d = toDateOnlyTr(45932); // 2025-10-08 civarı — yalnız çözülebildiğini doğrula
  assert.ok(d instanceof Date && !Number.isNaN(d.getTime()));
});

check("boş/okunamayan tarih null döner (satır atlanır, uydurulmaz)", () => {
  assert.equal(toDateOnlyTr(""), null);
  assert.equal(toDateOnlyTr("geçersiz"), null);
});

/* ── tutar ayrıştırma ─────────────────────────────────────────────────────── */

check("Türkçe biçim '1.234,56' → 1234.56", () => {
  assert.equal(toDecimalTr("1.234,56"), 1234.56);
});

check("noktalı ondalık '1234.56' de kabul edilir", () => {
  assert.equal(toDecimalTr("1234.56"), 1234.56);
});

check("sondaki '-' negatif sayılır ('1.234,56-' → -1234.56)", () => {
  assert.equal(toDecimalTr("1.234,56-"), -1234.56);
});

check("TL/TRY/₺ eki temizlenir", () => {
  assert.equal(toDecimalTr("1.234,56 TL"), 1234.56);
  assert.equal(toDecimalTr("₺1.234,56"), 1234.56);
});

/* ── satır hash — mükerrerlik ve GERÇEK ikiz işlem ayrımı ─────────────────── */

check("aynı girdi aynı hash'i üretir (idempotent — dosya iki kez yüklenirse mükerrer olmaz)", () => {
  const h1 = satirHash("Enpara", "2026-09-28", 100, "Market alışverişi", null, 0);
  const h2 = satirHash("Enpara", "2026-09-28", 100, "Market alışverişi", null, 0);
  assert.equal(h1, h2);
});

check("aynı gün/tutar/açıklamalı İKİ GERÇEK işlem sira ile ayrışır (biri kaybolmaz)", () => {
  const h1 = satirHash("Enpara", "2026-09-28", 100, "Market alışverişi", null, 0);
  const h2 = satirHash("Enpara", "2026-09-28", 100, "Market alışverişi", null, 1);
  assert.notEqual(h1, h2);
});

check("banka farklıysa hash farklı (yanlış bankaya yazılan satır başka bankanınkiyle çakışmaz)", () => {
  const h1 = satirHash("Enpara", "2026-09-28", 100, "x", null, 0);
  const h2 = satirHash("Garanti", "2026-09-28", 100, "x", null, 0);
  assert.notEqual(h1, h2);
});

check("açıklama normalize edilir ama hash'te büyük/küçük harf ya da fazla boşluk fark yaratmaz", () => {
  const h1 = satirHash("Enpara", "2026-09-28", 100, "Market   Alışverişi", null, 0);
  const h2 = satirHash("Enpara", "2026-09-28", 100, "market alışverişi", null, 0);
  assert.equal(h1, h2);
});

check("normalizeAciklama boşlukları tekilleştirir", () => {
  assert.equal(normalizeAciklama("  a   b  "), "A B");
});

/* ── onay anahtarı — dosya/banka/eşleme üçü de doğrulanır ─────────────────── */

check("onayAnahtari banka değişince değişir (onaylanan banka ile yazılan banka aynı olmalı)", () => {
  const a = onayAnahtariHesapla("abc", "Enpara", { tarih: "Tarih" });
  const b = onayAnahtariHesapla("abc", "Garanti", { tarih: "Tarih" });
  assert.notEqual(a, b);
});

check("onayAnahtari sütun eşlemesi değişince değişir", () => {
  const a = onayAnahtariHesapla("abc", "Enpara", { tarih: "Tarih" });
  const b = onayAnahtariHesapla("abc", "Enpara", { tarih: "İşlem Tarihi" });
  assert.notEqual(a, b);
});

check("onayAnahtari fileHash değişince değişir", () => {
  const a = onayAnahtariHesapla("abc", "Enpara", { tarih: "Tarih" });
  const b = onayAnahtariHesapla("xyz", "Enpara", { tarih: "Tarih" });
  assert.notEqual(a, b);
});

check("onayAnahtari eşleme anahtar SIRASINDAN bağımsız (aynı içerik aynı anahtar)", () => {
  const a = onayAnahtariHesapla("abc", "Enpara", { tarih: "Tarih", aciklama: "Açıklama" });
  const b = onayAnahtariHesapla("abc", "Enpara", { aciklama: "Açıklama", tarih: "Tarih" });
  assert.equal(a, b);
});

console.log(`\n${failed === 0 ? "Tüm testler geçti." : `${failed} test BAŞARISIZ.`}\n`);
if (failed > 0) process.exit(1);

