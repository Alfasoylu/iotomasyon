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
 * F) SEPETLER — kararı ALFAS verir (mail gönderen job ile AYNI fonksiyonlar);
 *    panel yalnız gösterir. Riskler: "kayıtlı" ile "e-posta bırakmış misafir"i
 *    karıştırmak, gecikmiş maili "bekliyor" göstermek, bilinmeyen kodu gizlemek,
 *    eksik yanıtı "0 sepet, sorun yok" diye çizmek.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { tokenIpucu } from "../lib/alfashome/config";
import {
  alfasPara,
  alfashomeConfigured,
  fetchAlfasCarts,
  fetchAlfasMembers,
  fetchAlfasOrders,
  odemeEtiketi,
  type AlfasSepet,
  type AlfasSiparis,
  type AlfasUye,
} from "../lib/alfashome/client";
import {
  bostaMetni,
  enCokSepettekiUrunler,
  fazEtiketi,
  gosterParam,
  kalemOzeti,
  mailEtiketi,
  mailSebepMetni,
  sepetFiltrele,
  sepetSirala,
  siralaParam,
  sureMetni,
  uyelikEtiketi,
} from "../lib/alfashome/sepetler";

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
const sepetSayfa = dosya("app/(app)/alfashome/sepetler/page.tsx");
const sepetYardimci = dosya("lib/alfashome/sepetler.ts");
const sepetGovde = dosya("components/alfashome/sepet-govdesi.tsx");
// Çizim kodu bileşende, izin/veri çekme sayfada: güvenlik/çizim kontrolleri İKİSİNE bakar.
const sepetTum = sepetSayfa + "\n" + sepetGovde;
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

  // ── F) Sepetler: fetch taklidiyle GERÇEK istemci davranışı ──────────────────
  const gercekFetch = globalThis.fetch;
  const cagrilar: { url: string; auth: string | null; method: string }[] = [];
  const taklit = (durum: number, govde: unknown) => {
    globalThis.fetch = (async (girdi: unknown, init?: RequestInit) => {
      cagrilar.push({
        url: String(girdi),
        auth: new Headers(init?.headers).get("authorization"),
        method: init?.method ?? "GET",
      });
      return new Response(typeof govde === "string" ? govde : JSON.stringify(govde), {
        status: durum,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
  };

  const tamYanit = {
    ok: true,
    adet: 1,
    toplam: 3,
    kesildi: false,
    pencere_gun: 30,
    mail_yapilandirildi: true,
    esikler: ESIK,
    ozet: {
      toplam: 3, bekleyen: 1, terk: 2, eski: 0, kayitli: 1, kayitsiz: 1, anonim: 1, bilinmiyor: 0,
      tutar_bekleyen: 100, tutar_terk: 200, mail_gitti: 1, mail_bekliyor: 1, mail_gecikti: 0,
      mail_gonderilemez: 1,
    },
    kurtarilan: { adet: 1, tutar: 900 },
    sepetler: [sepet()],
  };

  try {
    await checkAsync("F) istemci: doğru adres, Bearer başlığı, yalnız GET, `gun` iletilir", async () => {
      ayarla("https://api.alfashome.com", "j".repeat(30));
      cagrilar.length = 0;
      taklit(200, tamYanit);
      const r = await fetchAlfasCarts(150, 14);
      assert.equal(r.ok, true);
      assert.equal(cagrilar.length, 1);
      const c = cagrilar[0];
      assert.ok(c.url.startsWith("https://api.alfashome.com/crm/carts?"), c.url);
      const q = new URL(c.url).searchParams;
      assert.equal(q.get("limit"), "150");
      assert.equal(q.get("gun"), "14");
      assert.equal(c.auth, `Bearer ${"j".repeat(30)}`);
      assert.equal(c.method, "GET");
      assert.ok(!c.url.includes("j".repeat(30)), "jeton URL'ye yazılmış — log'a düşer");
    });

    await checkAsync("F) istemci: yanıt alanları eksiksiz taşınır (tutar 100'e bölünmez)", async () => {
      taklit(200, tamYanit);
      const r = await fetchAlfasCarts();
      assert.equal(r.ok, true);
      if (r.ok) {
        assert.equal(r.sepetler[0].tutar, 5300);
        assert.equal(r.toplam, 3);
        assert.equal(r.ozet.terk, 2);
        assert.equal(r.kurtarilan.tutar, 900);
        assert.equal(r.mail_yapilandirildi, true);
        assert.deepEqual(r.esikler, ESIK);
      }
    });

    await checkAsync("F) ozet/esikler EKSİK yanıt → HATA (0 sepet gibi çizilmez)", async () => {
      taklit(200, { ok: true, sepetler: [] });
      const r = await fetchAlfasCarts();
      assert.equal(r.ok, false, "eksik yanıt başarı sayılmış — panel 'sepet yok' diye çizer");
      if (!r.ok) assert.match(r.hata.mesaj, /beklenen biçimde değil/);
    });

    await checkAsync("F) `sepetler` dizi değilse HATA", async () => {
      taklit(200, { ...tamYanit, sepetler: "yok" });
      assert.equal((await fetchAlfasCarts()).ok, false);
    });

    await checkAsync("F) mail_yapilandirildi eksikse KAPALI sayılır (varsayılan güvenli yön)", async () => {
      const { mail_yapilandirildi: _, ...eksik } = tamYanit;
      taklit(200, eksik);
      const r = await fetchAlfasCarts();
      assert.equal(r.ok, true);
      if (r.ok) assert.equal(r.mail_yapilandirildi, false, "bilinmeyen durum 'açık' gösterilmemeli");
    });

    await checkAsync("F) HTTP hataları anlamlı: 401 jeton, 503 kapalı, 404 uç yok, gövde JSON olmasa da", async () => {
      taklit(401, { ok: false, message: "Geçersiz jeton." });
      let r = await fetchAlfasCarts();
      assert.equal(r.ok, false);
      if (!r.ok) assert.match(r.hata.mesaj, /jetonu geçersiz/);

      taklit(503, { ok: false, message: "yapılandırılmadı" });
      r = await fetchAlfasCarts();
      if (!r.ok) assert.match(r.hata.mesaj, /kapalı \(503\)/);

      taklit(404, "<html>Not Found</html>");
      r = await fetchAlfasCarts();
      assert.equal(r.ok, false);
      if (!r.ok) {
        assert.match(r.hata.mesaj, /bu uç yok \(404\)/);
        assert.ok(!/jeton/i.test(r.hata.mesaj), "404 jeton sorunu gibi anlatılmış");
      }
    });

    await checkAsync("F) hata metni JETONU İÇERMEZ (sepet ucu)", async () => {
      const JETON = "cok-gizli-sepet-jetonu-12345";
      ayarla("https://api.alfashome.com", JETON);
      taklit(500, `iç hata ${JETON}`.replace(JETON, "***"));
      const r = await fetchAlfasCarts();
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(!`${r.hata.mesaj} ${r.hata.detay ?? ""}`.includes(JETON));
    });
  } finally {
    globalThis.fetch = gercekFetch;
  }
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
    ["sepetler", sepetSayfa],
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
    ["sepetler", sepetSayfa],
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
    ["sepetler", sepetSayfa],
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
    ["sepetler", sepetSayfa],
  ] as const) {
    assert.match(s, /AlfasBaglantiHatasi/, `${ad}: hata kartı kullanılmıyor`);
    assert.match(s, /!sonuc\.ok \?/, `${ad}: hata dalı yok`);
  }
});

// ── F) Sepetler ────────────────────────────────────────────────────────────

const ESIK = { ilk_saat: 1, ikinci_saat: 24, max_gun: 7 };
const tarihF = (iso: string) => `<${iso}>`;

const mailBase = {
  gonderilen: 0 as 0 | 1 | 2,
  mail1: null,
  mail2: null,
  sonraki: null as 1 | 2 | null,
  sonraki_dk: null as number | null,
  sebep: null as string | null,
};
const sepet = (o: Partial<AlfasSepet> = {}): AlfasSepet => ({
  id: "cart_1",
  olusturma: "2026-09-28T09:00:00.000Z",
  guncelleme: "2026-09-28T10:00:00.000Z",
  bosta_saat: 2,
  bosta_belirsiz: false,
  faz: "terk",
  uyelik: "kayitli",
  eposta: "a@b.com",
  ad: "Ayşe Yılmaz",
  telefon: "0532 111 22 33",
  musteri_id: "cus_1",
  kalemler: [{ ad: "Batarya", adet: 2 }],
  kalem_adet: 2,
  tutar: 5300,
  para: "try",
  mail: { durum: "bekliyor", ...mailBase, sonraki: 1, sonraki_dk: 30 },
  ...o,
});

check("F) sepet alan adları sözleşmeyle aynı (tip + istemci)", () => {
  // Tip atamasıyla sabitlenir: alan adı değişirse `sepet()` derlenmez.
  const s = sepet();
  assert.equal(s.kalem_adet, 2);
  assert.equal(s.mail.durum, "bekliyor");
  for (const alan of [
    "sepetler",
    "toplam",
    "kesildi",
    "pencere_gun",
    "mail_yapilandirildi",
    "esikler",
    "ozet",
    "kurtarilan",
  ]) {
    assert.ok(client.includes(`${alan}:`), `istemci ${alan} alanını okumuyor`);
  }
});

check("F) istek /crm/carts adresine gidiyor, `gun` parametresiyle", () => {
  assert.match(client, /"carts"/);
  assert.match(client, /URLSearchParams/, "sorgu dizesi güvenli kurulmuyor");
  assert.match(client, /\{ gun \}/, "gun parametresi iletilmiyor");
});

check("F) eksik yanıt 'sorun yok' diye ÇİZİLMEZ (ozet/esikler/sepetler zorunlu)", () => {
  assert.match(client, /!Array\.isArray\(v\.sepetler\) \|\| !v\.ozet \|\| !v\.esikler/);
});

check("F) 404 → uç yok mesajı (panel ALFAS'tan önce yayına girerse jeton sanılmasın)", () => {
  assert.match(client, /r\.status === 404/);
  assert.match(client, /bu uç yok \(404\)/);
});

check("F) TUZAK: 'kayıtlı' yalnız hesabı olana denir; kayıtsız iki türlü yazılır", () => {
  assert.equal(uyelikEtiketi("kayitli").etiket, "Kayıtlı üye");
  assert.match(uyelikEtiketi("kayitsiz").etiket, /^Kayıtsız/);
  assert.match(uyelikEtiketi("anonim").etiket, /^Kayıtsız/);
  assert.notEqual(uyelikEtiketi("kayitsiz").etiket, uyelikEtiketi("anonim").etiket);
  // Sorgu başarısızsa "kayıtsız" DENMEZ.
  assert.doesNotMatch(uyelikEtiketi("bilinmiyor").etiket, /Kayıtsız|Kayıtlı/);
  assert.equal(uyelikEtiketi("yeni_kod").etiket, "yeni_kod", "bilinmeyen kod gizlenmemeli");
});

check("F) faz etiketleri + bilinmeyen kod olduğu gibi", () => {
  assert.equal(fazEtiketi("bekliyor", ESIK).etiket, "Sepette bekliyor");
  assert.equal(fazEtiketi("terk", ESIK).etiket, "Terk edildi");
  assert.match(fazEtiketi("eski", ESIK).etiket, /7 gün/, "eşik ALFAS'tan gelmeli");
  assert.equal(fazEtiketi("ya_bu", ESIK).etiket, "ya_bu");
});

check("F) mail: gitti / bekliyor / gecikti / gönderilemez okunur ve doğru tonda", () => {
  const gitti1 = mailEtiketi(
    { durum: "gitti", ...mailBase, gonderilen: 1, mail1: "2026-09-28T10:30:00Z", sonraki: 2, sonraki_dk: 840 },
    ESIK,
    tarihF
  );
  assert.equal(gitti1.etiket, "1. mail gitti");
  assert.equal(gitti1.ton, "success");
  assert.ok(gitti1.ayrinti.some((a) => a.includes("<2026-09-28T10:30:00Z>")), "gönderim tarihi yok");
  assert.ok(gitti1.ayrinti.some((a) => a.includes("2. mail") && a.includes("14 sa")), "2. mail süresi yok");

  const iki = mailEtiketi(
    { durum: "gitti", ...mailBase, gonderilen: 2, mail1: "a", mail2: "b" },
    ESIK,
    tarihF
  );
  assert.equal(iki.etiket, "2 mail de gitti");

  const bekle = mailEtiketi({ durum: "bekliyor", ...mailBase, sonraki: 1, sonraki_dk: 30 }, ESIK, tarihF);
  assert.equal(bekle.etiket, "Mail bekliyor");
  assert.ok(bekle.ayrinti[0].includes("30 dk"));
  const simdi = mailEtiketi({ durum: "bekliyor", ...mailBase, sonraki: 1, sonraki_dk: 0 }, ESIK, tarihF);
  assert.match(simdi.ayrinti[0], /sonraki saat başı turunda/);

  const gec = mailEtiketi({ durum: "gecikti", ...mailBase, sonraki: 1 }, ESIK, tarihF);
  assert.equal(gec.ton, "danger");
  assert.ok(gec.ayrinti.join(" ").includes("Railway log"), "gecikme sebebi için yön gösterilmeli");

  const yok = mailEtiketi({ durum: "gonderilemez", ...mailBase, sebep: "eposta_yok" }, ESIK, tarihF);
  assert.equal(yok.etiket, "Gönderilemez");
  assert.match(yok.ayrinti.join(" "), /E-posta adresi yok/);
});

check("F) 'gecikti' sebep UYDURMAZ ve mail kapalıyken kırmızı", () => {
  const gec = mailEtiketi({ durum: "gecikti", ...mailBase, sonraki: 2 }, ESIK, tarihF);
  // Başarısız deneme kaydedilmiyor → "Resend reddetti" gibi kesin bir sebep yazılamaz.
  assert.match(gec.ayrinti.join(" "), /Sebep kayıtlı değil/);
  assert.doesNotMatch(gec.ayrinti.join(" "), /reddetti|kota doldu/i);
  const kapali = mailEtiketi({ durum: "gonderilemez", ...mailBase, sebep: "mail_kapali" }, ESIK, tarihF);
  assert.equal(kapali.ton, "danger", "hiçbir mail gitmiyorsa bu 'nötr' bir bilgi değil");
  assert.equal(mailSebepMetni("yeni_sebep", ESIK), "yeni_sebep", "bilinmeyen sebep gizlenmemeli");
  assert.match(mailSebepMetni("cok_eski", ESIK), /7 gün/);
});

check("F) 1. mail gitmiş ama sebep var (çok eski): gitti + sebep gösterilir", () => {
  const m = mailEtiketi(
    { durum: "gitti", ...mailBase, gonderilen: 1, mail1: "x", sebep: "cok_eski" },
    ESIK,
    tarihF
  );
  assert.equal(m.etiket, "1. mail gitti");
  assert.ok(m.ayrinti.some((a) => a.includes("günden eski")), "2. mailin neden gitmeyeceği yazılmalı");
});

check("F) süre metinleri", () => {
  assert.equal(sureMetni(0.4), "1 dk'dan az");
  assert.equal(sureMetni(45), "45 dk");
  assert.equal(sureMetni(135), "2 sa 15 dk");
  assert.equal(sureMetni(120), "2 sa");
  assert.equal(sureMetni(3000), "2 gün");
  assert.equal(sureMetni(null), "—");
  assert.equal(sureMetni(-5), "—");
  assert.equal(bostaMetni(3, true), "en az 3 sa", "alt sınır 'en az' ile gösterilmeli");
  assert.equal(bostaMetni(null), "—");
});

check("F) süzgeç: kayıtsız = misafir + anonim; bilinmiyor yalnız Tümü'nde", () => {
  const l = [
    sepet({ id: "a", uyelik: "kayitli" }),
    sepet({ id: "b", uyelik: "kayitsiz", faz: "bekliyor" }),
    sepet({ id: "c", uyelik: "anonim" }),
    sepet({ id: "d", uyelik: "bilinmiyor" }),
    sepet({ id: "e", mail: { durum: "gecikti", ...mailBase, sonraki: 1 } }),
    sepet({ id: "f", mail: { durum: "gonderilemez", ...mailBase, sebep: "eposta_yok" } }),
  ];
  const ids = (g: Parameters<typeof sepetFiltrele>[1]) => sepetFiltrele(l, g).map((s) => s.id);
  assert.deepEqual(ids("tumu"), ["a", "b", "c", "d", "e", "f"]);
  assert.deepEqual(ids("kayitli"), ["a", "e", "f"]);
  assert.deepEqual(ids("kayitsiz"), ["b", "c"]);
  assert.deepEqual(ids("bekleyen"), ["b"]);
  assert.deepEqual(ids("terk"), ["a", "c", "d", "e", "f"]);
  assert.deepEqual(ids("gecikti"), ["e"]);
  assert.deepEqual(ids("gonderilemez"), ["f"]);
});

check("F) sıralama: tutar büyükten küçüğe, girdi değişmez", () => {
  const l = [sepet({ id: "a", tutar: 100 }), sepet({ id: "b", tutar: 900 }), sepet({ id: "c", tutar: 500 })];
  assert.deepEqual(sepetSirala(l, "tutar").map((s) => s.id), ["b", "c", "a"]);
  assert.deepEqual(l.map((s) => s.id), ["a", "b", "c"], "girdi dizisi değiştirilmiş");
  assert.deepEqual(sepetSirala(l, "yeni").map((s) => s.id), ["a", "b", "c"]);
});

check("F) adres çubuğu değerleri uydurulamaz (geçersiz → varsayılan)", () => {
  assert.equal(gosterParam("terk"), "terk");
  assert.equal(gosterParam("<script>"), "tumu");
  assert.equal(gosterParam(undefined), "tumu");
  assert.equal(siralaParam("tutar"), "tutar");
  assert.equal(siralaParam("'; drop table"), "yeni");
});

check("F) en çok sepette kalan ürünler: farklı sepet sayısı, eski sepetler hariç", () => {
  const l = [
    sepet({ id: "1", kalemler: [{ ad: "A", adet: 5 }] }), // tek sepette 5 adet
    sepet({ id: "2", kalemler: [{ ad: "B", adet: 1 }] }),
    sepet({ id: "3", kalemler: [{ ad: "B", adet: 1 }, { ad: "B", adet: 1 }] }), // aynı sepette iki satır
    sepet({ id: "4", kalemler: [{ ad: "B", adet: 1 }], faz: "eski" }), // sayılmaz
  ];
  const u = enCokSepettekiUrunler(l);
  assert.equal(u[0].ad, "B", "5 adetlik tek sepet, 2 sepette bırakılan ürünü geçmemeli");
  assert.equal(u[0].sepet, 2, "aynı sepette iki satır tek sepet sayılmalı; eski sepet hariç");
  assert.equal(u[0].adet, 3);
  assert.equal(u[1].ad, "A");
  assert.equal(enCokSepettekiUrunler([], 5).length, 0);
});

check("F) kalem özeti: en çok 2 satır + kalan sayısı", () => {
  const s = sepet({
    kalemler: [
      { ad: "A", adet: 2 },
      { ad: "B", adet: 1 },
      { ad: "C", adet: 1 },
      { ad: "D", adet: 1 },
    ],
  });
  assert.deepEqual(kalemOzeti(s), { satirlar: ["2× A", "B"], fazla: 2 });
  assert.deepEqual(kalemOzeti(sepet({ kalemler: [] })), { satirlar: [], fazla: 0 });
});

check("F) sayfa: taze veri, izin, ortak hata kartı, salt okunur", () => {
  assert.match(sepetSayfa, /export const dynamic = "force-dynamic"/);
  assert.match(sepetSayfa, /await requireUser\(\)/);
  assert.match(sepetSayfa, /checkPermission\(user, PERMISSIONS\.EXECUTIVE_READ\)/);
  assert.match(sepetSayfa, /AlfasBaglantiHatasi/);
  assert.match(sepetSayfa, /!sonuc\.ok \?/);
  assert.doesNotMatch(sepetTum, /method:\s*"(POST|PUT|PATCH|DELETE)"|<form|"use server"/, "sayfa yazıyor");
});

check("F) sayfa kendini YENİLEMEZ (her açılış ALFAS DB'sini uyandırır — 25.09 dersi)", () => {
  assert.doesNotMatch(sepetTum, /setInterval|setTimeout|router\.refresh|revalidate|"use client"/);
  assert.match(sepetSayfa, /fetchAlfasCarts\(200, 30\)/, "istek boyutu/pencere değişmiş");
});

check("F) sayfa müşteri metnini HTML olarak basmıyor (ad/ürün başlığı dış veri)", () => {
  assert.doesNotMatch(sepetTum, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(sepetYardimci, /dangerouslySetInnerHTML/);
});

check("F) eşikler ekrana ALFAS'ın verdiği değerden basılır (metne gömülü rakam yok)", () => {
  // Job eşikleri env ile değişiyor; ekranda gömülü "24 saat"/"7 gün" olursa
  // değer değişince panel SESSİZCE yanlış söyler.
  // Yorum satırları hariç (açıklama metninde "1 saat" geçebilir); KOD/JSX metni denetlenir.
  const kodSatirlari = (src: string) =>
    src
      .split("\n")
      .filter((l) => {
        const t = l.trim();
        return !(t.startsWith("//") || t.startsWith("/*") || t.startsWith("*"));
      })
      .join("\n");
  for (const [ad, s] of [["sayfa", sepetSayfa], ["bileşen", sepetGovde], ["yardımcı", sepetYardimci]] as const) {
    assert.doesNotMatch(
      kodSatirlari(s),
      /\b24 saat\b|\b7 gün\b|\b1 saat\b/,
      `${ad}: gömülü eşik metni`
    );
  }
  assert.match(sepetGovde, /esikler\.ilk_saat/);
  assert.match(sepetGovde, /esikler\.max_gun/);
});

check("F) WhatsApp bağlantısı numarayı normalize ediyor ve güvenli açılıyor", () => {
  assert.match(sepetGovde, /normalizePhone\(s\.telefon\)/);
  assert.match(sepetGovde, /https:\/\/wa\.me\/\$\{tel\}/);
  assert.match(sepetGovde, /rel="noopener noreferrer"/);
  // Otomatik mesaj metni EKLENMEZ: müşteri adına pazarlama metni yazmak operatörün kararı.
  assert.doesNotMatch(sepetTum, /wa\.me\/[^`"]*\?text=/, "hazır WhatsApp metni eklenmiş");
});

check("F) mail kapalıyken sayfa bunu YÜKSEK SESLE söylüyor", () => {
  assert.match(sepetGovde, /!sonuc\.mail_yapilandirildi/);
  assert.match(sepetGovde, /RESEND_API_KEY/);
});

check("F) taranan liste eksikse sayfa söylüyor (kesildi + limit)", () => {
  assert.match(sepetGovde, /sonuc\.kesildi/);
  assert.match(sepetGovde, /sonuc\.toplam > sonuc\.adet/);
});

check("F) Sepetler menüde, ikonu sidebar'da tanımlı", () => {
  assert.ok(layout.includes('"/alfashome/sepetler"'), "menüde sepetler yok");
  assert.match(layout, /href: "\/alfashome\/sepetler"[\s\S]{0,200}iconKey: "basket"/);
  assert.match(sidebar, /basket: ShoppingBasket/, "ikon anahtarı sidebar'da yok — ikonsuz kalır");
  assert.match(layout, /href: "\/alfashome\/sepetler"[\s\S]{0,260}section: "ALFAS Home"/);
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
  assert.equal(bolum, 5, `ALFAS Home bölümünde 5 sayfa beklenir, ${bolum} var`);
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
