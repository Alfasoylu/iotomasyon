/**
 * ALFAS Home bölümü testleri — ağ GEREKTİRMEZ.
 * Çalıştır: npm run check:alfashome
 *
 * Neden bu testler: bu katmandaki hataların hepsi SESSİZ.
 *
 * A) SÖZLEŞME KAYMASI — alan adları iki repo arasında sözleşme (yazan taraf:
 *    alfashome `backend/src/api/crm/*`). Bir ad değişirse `undefined` gelir,
 *    tablo boş görünür ve hiçbir hata çıkmaz: "hiç sipariş yok" diye okunur.
 * B) YAPILANDIRMA SIZINTISI — env eksikken sayfanın boş tablo göstermesi.
 *    Boş tablo yanlış karar verdirir; hata gösterilmeli.
 * C) JETON SIZINTISI — jetonun ekrana/hata metnine düşmesi.
 * D) YANLIŞ TUTAR — Medusa v2 fiyatı ondalık para birimidir; 100'e bölmek
 *    tutarı yüz kat küçük gösterir (1.518 ₺ → 15 ₺).
 * E) YAZMA — panelin ALFAS'ta değişiklik yapması. Uçlar salt okunur;
 *    istemci GET dışında bir şey yapmamalı.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { tokenIpucu } from "../lib/alfashome/config";
import {
  alfasPara,
  alfashomeConfigured,
  fetchAlfasMembers,
  fetchAlfasOrders,
  odemeEtiketi,
  type AlfasSiparis,
  type AlfasUye,
} from "../lib/alfashome/client";

let failed = 0;
function check(name: string, fn: () => void | Promise<void>) {
  try {
    const r = fn();
    if (r instanceof Promise) throw new Error("senkron kontrol bekleniyordu");
    console.log(`  OK   ${name}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL ${name}\n         ${e instanceof Error ? e.message : e}`);
  }
}
async function checkAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  OK   ${name}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL ${name}\n         ${e instanceof Error ? e.message : e}`);
  }
}

const dosya = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const client = dosya("lib/alfashome/client.ts");
const siparisSayfa = dosya("app/(app)/alfashome/siparisler/page.tsx");
const uyeSayfa = dosya("app/(app)/alfashome/uyeler/page.tsx");
const layout = dosya("app/(app)/layout.tsx");
const sidebar = dosya("components/dashboard/sidebar.tsx");
const reklamSayfa = dosya("app/(app)/reklamlar/page.tsx");
const ayarSayfa = dosya("app/(app)/alfashome/ayarlar/page.tsx");
const form = dosya("components/alfashome/ayar-formu.tsx");
const aksiyon = dosya("lib/actions/alfashome-actions.ts");
const paket = JSON.parse(dosya("package.json"));

console.log("\nALFAS Home bolumu testleri\n");

// ── B) Yapılandırma yoksa HATA, boş tablo değil ────────────────────────────

const eskiUrl = process.env.ALFASHOME_API_URL;
const eskiToken = process.env.ALFASHOME_API_TOKEN;
const ayarla = (u?: string, t?: string) => {
  if (u === undefined) delete process.env.ALFASHOME_API_URL;
  else process.env.ALFASHOME_API_URL = u;
  if (t === undefined) delete process.env.ALFASHOME_API_TOKEN;
  else process.env.ALFASHOME_API_TOKEN = t;
};


// tsx bu repoda CJS'e çeviriyor → top-level await YOK. Ağ/env davranış
// kontrolleri tek async fonksiyonda toplanıp en sonda çalıştırılıyor.
async function asenkronKontroller() {
  await checkAsync("yapılandırma yoksa 'kurulu' sayılmaz (DB yok → env yedeği)", async () => {
    // ⚠️ Bu kontrol artık ASENKRON: bağlantı önce VERİTABANINDAN okunuyor
    // (panelden girilen ayar), yoksa env'e düşüyor. Testte DB olmadığı için
    // env dalı çalışır — config.ts prisma'yı geç import edip hatayı yutuyor,
    // yoksa test DB'ye bağımlı olurdu.
    ayarla(undefined, undefined);
    assert.equal(await alfashomeConfigured(), false);
    ayarla("https://api.alfashome.com", undefined);
    assert.equal(await alfashomeConfigured(), false, "jeton olmadan kurulu sayılıyor");
    ayarla(undefined, "jeton");
    assert.equal(await alfashomeConfigured(), false, "adres olmadan kurulu sayılıyor");
    ayarla("  ", "  ");
    assert.equal(await alfashomeConfigured(), false, "boşluk dolu değer geçerli sayılıyor");
    ayarla("https://api.alfashome.com", "jeton");
    assert.equal(await alfashomeConfigured(), true);
  });

  await checkAsync("B) env eksikken sipariş çağrısı HATA döner (boş liste değil)", async () => {
    ayarla(undefined, undefined);
    const r = await fetchAlfasOrders();
    assert.equal(r.ok, false, "yapılandırma yokken başarı dönüyor — panel boş tablo gösterir");
    if (!r.ok) {
      assert.match(r.hata.mesaj, /yapılandırılmadı/i);
      // Ne yapılacağını söylemeli: iki değişkenin adı geçsin.
      // Ne yapılacağını söylemeli: önce PANEL yolu, sonra env alternatifi.
      assert.match(String(r.hata.detay), /Ayarlar/, "panel ayar sayfası yazılmamış");
      assert.match(String(r.hata.detay), /ALFASHOME_API_URL/);
      assert.match(String(r.hata.detay), /ALFASHOME_API_TOKEN/);
      assert.match(String(r.hata.detay), /CRM_API_TOKEN/, "ALFAS tarafındaki değişken yazılmamış");
    }
  });

  await checkAsync("B) env eksikken üye çağrısı da HATA döner", async () => {
    ayarla(undefined, undefined);
    const r = await fetchAlfasMembers();
    assert.equal(r.ok, false);
  });

  await checkAsync("C) hata metni JETONU İÇERMEZ", async () => {
    const JETON = "cok-gizli-jeton-1234567890";
    // Ulaşılamayan adres: ağ hatası dalı çalışır ve hata metni üretilir.
    ayarla("http://127.0.0.1:1/dur", JETON);
    const r = await fetchAlfasOrders();
    assert.equal(r.ok, false);
    if (!r.ok) {
      const hepsi = `${r.hata.mesaj} ${r.hata.detay ?? ""}`;
      assert.ok(!hepsi.includes(JETON), "jeton hata metnine sızmış");
    }
  });
  ayarla(eskiUrl, eskiToken);
}



// ── A) Sözleşme: istemci hangi alanları okuyor ─────────────────────────────

check("A) sipariş alan adları sözleşmeyle aynı", () => {
  // Tip üzerinden sabitleniyor: alan adı değişirse bu atama derlenmez.
  const s: AlfasSiparis = {
    id: "order_1",
    no: 12,
    tarih: "2026-09-19T10:00:00.000Z",
    eposta: "a@b.c",
    musteri: "Ad Soyad",
    sehir: "İstanbul",
    telefon: "0555",
    tutar: 1518,
    para: "try",
    durum: "pending",
    odeme: "captured",
    musteri_id: "cus_1",
    kalemler: [{ ad: "Batarya", adet: 2 }],
    kalem_adet: 2,
  };
  assert.equal(s.kalemler[0].adet, 2);
  // Üst düzey alanlar istemcide okunuyor mu (yeniden adlandırma yakalanır).
  for (const alan of ["siparisler", "adet", "ciro", "para"]) {
    assert.ok(client.includes(`${alan}:`), `istemci ${alan} alanını okumuyor`);
  }
});

check("A) üye alan adları sözleşmeyle aynı", () => {
  const u: AlfasUye = {
    id: "cus_1",
    eposta: "a@b.c",
    ad: "Ad Soyad",
    telefon: null,
    hesap_var: true,
    kayit: "2026-09-01T00:00:00.000Z",
    siparis_adet: 3,
    harcama: 4554,
    son_siparis: "2026-09-18T00:00:00.000Z",
    kaynak: "eposta-katmani",
  };
  assert.equal(u.siparis_adet, 3);
  for (const alan of ["uyeler", "hesapli", "alici"]) {
    assert.ok(client.includes(`${alan}:`), `istemci ${alan} alanını okumuyor`);
  }
});

check("istekler /crm/orders ve /crm/members adreslerine gidiyor", () => {
  assert.match(client, /\/crm\/\$\{yol\}/, "uç yolu şablonu değişmiş");
  assert.match(client, /"orders"/);
  assert.match(client, /"members"/);
  // Jeton Authorization başlığında, sorgu dizesinde DEĞİL (URL log'lara düşer).
  assert.match(client, /Authorization: `Bearer \$\{/);
  assert.doesNotMatch(client, /token=\$\{/, "jeton URL'ye yazılmış — log'a düşer");
});

// ── D) Tutar birimi ────────────────────────────────────────────────────────

check("D) tutar 100'e BÖLÜNMÜYOR (Medusa v2 ondalık para birimi)", () => {
  assert.equal(alfasPara(1518, "try"), "1.518 ₺");
  for (const [ad, s] of [
    ["client", client],
    ["siparişler", siparisSayfa],
    ["üyeler", uyeSayfa],
  ] as const) {
    assert.doesNotMatch(s, /\/\s*100\b/, `${ad}: tutar 100'e bölünmüş`);
  }
});

check("bilinmeyen para birimi kodu olduğu gibi gösterilir", () => {
  assert.equal(alfasPara(1000, "usd"), "1.000 USD");
});

// ── Ödeme durumu etiketleri ────────────────────────────────────────────────

check("ödeme durumları Türkçeleşiyor, bilinmeyen değer GİZLENMİYOR", () => {
  assert.equal(odemeEtiketi("captured").etiket, "Ödendi");
  assert.equal(odemeEtiketi("captured").ton, "success");
  assert.equal(odemeEtiketi("refunded").ton, "danger");
  assert.equal(odemeEtiketi("awaiting").ton, "warning");
  // Medusa yeni bir durum eklerse ekranda kod görünür — "—" gösterip durumu
  // saklamak, ödenmemiş siparişi ödenmiş gibi okutabilirdi.
  assert.equal(odemeEtiketi("yeni_durum").etiket, "yeni_durum");
  assert.equal(odemeEtiketi(null).etiket, "—");
});

// ── E) Salt okunur ─────────────────────────────────────────────────────────

check("E) istemci YAZMA isteği atmıyor (yalnız GET)", () => {
  assert.doesNotMatch(client, /method:\s*"(POST|PUT|PATCH|DELETE)"/, "yazma isteği eklenmiş");
});

check("sayfalar taze veri okuyor (force-dynamic + no-store)", () => {
  for (const [ad, s] of [
    ["siparişler", siparisSayfa],
    ["üyeler", uyeSayfa],
  ] as const) {
    assert.match(s, /export const dynamic = "force-dynamic"/, `${ad}: force-dynamic yok`);
  }
  assert.match(client, /cache: "no-store"/, "istemci önbelleğe alıyor");
  assert.match(client, /AbortSignal\.timeout/, "zaman aşımı yok — panel takılı kalabilir");
});

check("sayfalar izin kontrolünden geçiyor", () => {
  for (const [ad, s] of [
    ["siparişler", siparisSayfa],
    ["üyeler", uyeSayfa],
  ] as const) {
    assert.match(s, /await requireUser\(\)/, `${ad}: requireUser yok`);
    assert.match(
      s,
      /checkPermission\(user, PERMISSIONS\.EXECUTIVE_READ\)/,
      `${ad}: izin kontrolü yok`
    );
  }
});

check("hata durumunda ORTAK hata kartı gösteriliyor", () => {
  for (const [ad, s] of [
    ["siparişler", siparisSayfa],
    ["üyeler", uyeSayfa],
  ] as const) {
    assert.match(s, /AlfasBaglantiHatasi/, `${ad}: hata kartı kullanılmıyor`);
    assert.match(s, /!sonuc\.ok \?/, `${ad}: hata dalı yok`);
  }
});

// ── Menü ───────────────────────────────────────────────────────────────────

check("ALFAS Home bölümü menüde ve üç sayfa da içinde", () => {
  for (const yol of ['"/reklamlar"', '"/alfashome/siparisler"', '"/alfashome/uyeler"']) {
    assert.ok(layout.includes(yol), `menüde eksik: ${yol}`);
  }
  const bolum = (layout.match(/section: "ALFAS Home"/g) ?? []).length;
  assert.ok(bolum >= 3, `ALFAS Home bölümünde en az 3 sayfa beklenir, ${bolum} var`);
  // Reklam sayfası artık "Sistem" altında DEĞİL.
  assert.doesNotMatch(
    layout,
    /href: "\/reklamlar"[\s\S]{0,160}section: "Sistem"/,
    "Meta Reklamları hâlâ Sistem bölümünde"
  );
});

check("bölüm sidebar sırasında tanımlı (yoksa en sona düşer)", () => {
  assert.match(sidebar, /key: "ALFAS Home"/, "SECTION_META'ya eklenmemiş");
});

check("reklam sayfasının kırıntısı da güncellendi", () => {
  assert.match(reklamSayfa, /label: "ALFAS Home"/, "breadcrumb hâlâ Sistem diyor");
});

check("kayıtlı jeton EKRANA BASILMIYOR — yalnız son 4 hane", () => {
  // Sır her sayfa görüntülemesinde HTML'e gömülmesin.
  assert.equal(tokenIpucu("cok-gizli-jeton-1234"), "••••1234");
  assert.equal(tokenIpucu("kisa"), "••••", "kısa değerde bile içerik sızmamalı");
  const ipucu = tokenIpucu("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  assert.ok(!ipucu.includes("ABCDEFGHIJ"), "jetonun başı ipucunda görünüyor");
  // Ayar sayfası ham jetonu forma geçirmiyor (yalnız var/yok + ipucu).
  assert.match(ayarSayfa, /tokenVar: Boolean\(kayit\?\.token\)/, "sayfa tokenVar hesaplamıyor");
  assert.doesNotMatch(
    ayarSayfa,
    /token: kayit\?\.token/,
    "ham jeton forma geçiriliyor — HTML'e gömülür"
  );
  assert.match(form, /type="password"/, "jeton alanı düz metin");
});

check("boş jeton MEVCUT değeri korur (kazara silme yok)", () => {
  // Form kayıtlı jetonu geri basmadığı için "boş" = "dokunmadım".
  assert.match(aksiyon, /token \|\| mevcut\?\.token \|\| ""/, "boş jeton mevcut değeri silebilir");
});

check("HTTP adresi reddediliyor (jeton başlıkta gidiyor)", () => {
  assert.match(aksiyon, /\^https:\\\/\\\//, "https zorunluluğu yok");
});

check("jeton alt sınırı ALFAS tarafıyla AYNI (24)", () => {
  // ALFAS 24 karakterden kısa jetonu 503 ile reddediyor; panel sebebi
  // göstermeden kaydetse kullanıcı neden çalışmadığını anlamazdı.
  assert.match(aksiyon, /MIN_TOKEN = 24/, "alt sınır değişmiş ya da kaldırılmış");
});

check("ayar sayfası ALFAS Home bölümünde", () => {
  assert.ok(layout.includes('"/alfashome/ayarlar"'), "menüde ayarlar yok");
  const bolum = (layout.match(/section: "ALFAS Home"/g) ?? []).length;
  assert.equal(bolum, 4, `ALFAS Home bölümünde 4 sayfa beklenir, ${bolum} var`);
});

check("npm betikleri tanımlı", () => {
  assert.match(paket.scripts["check:alfashome"], /alfashome\.test\.ts/);
});

void asenkronKontroller().then(() => {
  console.log(
    failed === 0 ? "\n✅ ALFAS Home testleri gecti\n" : `\n❌ ${failed} test basarisiz\n`
  );
  process.exit(failed === 0 ? 0 : 1);
});
