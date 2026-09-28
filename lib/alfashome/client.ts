/**
 * ALFAS Home (alfashome.com) okuma istemcisi — SİPARİŞLER, ÜYELER ve SEPETLER.
 *
 * NEREDEN OKUR: ALFAS mağazasının Medusa arka ucundaki salt okunur `/crm/*`
 * uçları (kaynak: alfashome `backend/src/api/crm/*`). Medusa **admin**
 * anahtarı bilerek KULLANILMIYOR — o anahtar ürün silmeye, fiyat
 * değiştirmeye, iade yapmaya da yetiyor; panelin ihtiyacı yalnız okumak.
 *
 * ⚠️ ALAN ADLARI İKİ REPO ARASINDA SÖZLEŞMEDİR. Yazan taraf alfashome
 * `backend/src/api/crm/orders|members|carts/route.ts`. Bir alan yeniden
 * adlandırılırsa panel SESSİZCE boşalır: `undefined` ekranda "veri yok" gibi
 * görünür, hiçbir hata çıkmaz. Bu yüzden iki tarafta da alan adlarını
 * sabitleyen test var:
 *   iotomasyon: npm run check:alfashome
 *   alfashome : npm run check:crm
 *
 * ⚠️ HATA SESSİZ KALMAZ. Boş tablo "hiç sipariş yok" diye okunur ve yanlış
 * karara yol açar (reklam panelinde aynı gerekçe: lib/meta/ads.ts). Bu yüzden
 * sonuç `{ok:false, hata}` döner ve sayfa sebebi yazar.
 *
 * ⚠️ TUTARLAR ONDALIK PARA BİRİMİ (Medusa v2): 1518 = 1.518 ₺. 100'e BÖLÜNMEZ.
 */

import { alfasBaglanti } from "./config";

export type AlfasHata = {
  /** Kullanıcıya gösterilecek Türkçe açıklama. */
  mesaj: string;
  /** Teşhis için ham ayrıntı — panelde küçük punto. */
  detay?: string;
};

export type AlfasSiparisKalemi = { ad: string; adet: number };

export type AlfasSiparis = {
  id: string;
  no: number | null;
  tarih: string | null;
  eposta: string | null;
  musteri: string | null;
  sehir: string | null;
  telefon: string | null;
  tutar: number;
  para: string;
  durum: string | null;
  odeme: string | null;
  musteri_id: string | null;
  kalemler: AlfasSiparisKalemi[];
  kalem_adet: number;
};

export type AlfasUye = {
  id: string;
  eposta: string | null;
  ad: string | null;
  telefon: string | null;
  hesap_var: boolean;
  kayit: string | null;
  siparis_adet: number;
  harcama: number;
  son_siparis: string | null;
  kaynak: string | null;
};

export type SiparisSonuc =
  | {
      ok: true;
      siparisler: AlfasSiparis[];
      adet: number;
      ciro: number;
      para: string;
      guncellendi: Date;
    }
  | { ok: false; hata: AlfasHata };

export type UyeSonuc =
  | {
      ok: true;
      uyeler: AlfasUye[];
      adet: number;
      hesapli: number;
      alici: number;
      guncellendi: Date;
    }
  | { ok: false; hata: AlfasHata };

export type AlfasSepetKalemi = { ad: string; adet: number };

/**
 * Sepetin hatırlatma maili durumu — kararı ALFAS verir (`lib/cart-recovery.ts`,
 * mail gönderen job ile AYNI fonksiyonlar); panel yalnız gösterir.
 *
 * ⚠️ BAŞARISIZ DENEME KAYDEDİLMİYOR: job damgayı yalnız başarılı gönderimden
 * sonra atar. "Gönderilemedi" doğrudan bilinemez; bilinen şey `gecikti` = sırası
 * geldi ama damga yok (sebep: Resend hatası / job durdu / kota — Railway log'u).
 */
export type AlfasSepetMail = {
  durum: "bekliyor" | "gitti" | "gecikti" | "gonderilemez";
  gonderilen: 0 | 1 | 2;
  mail1: string | null;
  mail2: string | null;
  sonraki: 1 | 2 | null;
  sonraki_dk: number | null;
  sebep: string | null;
};

export type AlfasSepet = {
  id: string;
  olusturma: string | null;
  guncelleme: string | null;
  bosta_saat: number | null;
  /** true → `bosta_saat` alt sınırdır (mail damgası `updated_at`'i ezmiş). */
  bosta_belirsiz: boolean;
  faz: "bekliyor" | "terk" | "eski";
  /** kayitli = ŞİFRELİ HESABI olan. `customer_id` dolu olması yetmez (misafir kaydı da açılır). */
  uyelik: "kayitli" | "kayitsiz" | "anonim" | "bilinmiyor";
  eposta: string | null;
  ad: string | null;
  telefon: string | null;
  musteri_id: string | null;
  kalemler: AlfasSepetKalemi[];
  /** ADETLERİN toplamı (siparişlerdeki `kalem_adet` ile aynı anlam). */
  kalem_adet: number;
  tutar: number;
  para: string;
  mail: AlfasSepetMail;
};

export type AlfasSepetOzet = {
  toplam: number;
  bekleyen: number;
  terk: number;
  eski: number;
  kayitli: number;
  kayitsiz: number;
  anonim: number;
  bilinmiyor: number;
  tutar_bekleyen: number;
  tutar_terk: number;
  mail_gitti: number;
  mail_bekliyor: number;
  mail_gecikti: number;
  mail_gonderilemez: number;
};

export type AlfasSepetEsikler = { ilk_saat: number; ikinci_saat: number; max_gun: number };

export type SepetSonuc =
  | {
      ok: true;
      sepetler: AlfasSepet[];
      /** Listelenen sepet sayısı. */
      adet: number;
      /** Pencere içindeki TÜM aktif sepet (limit kırpsa da). */
      toplam: number;
      /** true → ALFAS tarama tavanına takıldı; liste eksik olabilir. */
      kesildi: boolean;
      pencere_gun: number;
      /** false → ALFAS'ta RESEND yapılandırılmamış: HİÇBİR sepete mail gitmez. */
      mail_yapilandirildi: boolean;
      esikler: AlfasSepetEsikler;
      ozet: AlfasSepetOzet;
      /** Mail SONRASI tamamlanan sepetler — korelasyon, kanıt değil. */
      kurtarilan: { adet: number; tutar: number };
      guncellendi: Date;
    }
  | { ok: false; hata: AlfasHata };

/**
 * Adres + jeton var mı (panel ayarı ya da env).
 *
 * ⚠️ ASENKRON: değer artık **veritabanından** da gelebiliyor (panelden girilen
 * ayar, bkz. ./config.ts). Senkron kalsaydı yalnız env'i görür ve panelden
 * kaydedilmiş bağlantıyı "yok" sayardı.
 */
export async function alfashomeConfigured(): Promise<boolean> {
  const b = await alfasBaglanti();
  return Boolean(b.baseUrl && b.token);
}

const YAPILANDIRMA_HATASI: AlfasHata = {
  mesaj: "ALFAS bağlantısı yapılandırılmadı.",
  detay:
    "Panel → ALFAS Home → Ayarlar sayfasından adres ve jetonu girin (ALFAS tarafında Railway → CRM_API_TOKEN ile AYNI değer). Alternatif: Vercel ortam değişkenleri ALFASHOME_API_URL + ALFASHOME_API_TOKEN.",
};

/** Ağ isteği için üst sınır: panel, arka uç yanıt vermezse takılı kalmasın. */
const TIMEOUT_MS = 12_000;

async function cek<T>(
  yol: string,
  limit: number,
  ek: Record<string, number> = {}
): Promise<{ ok: true; veri: T } | { ok: false; hata: AlfasHata }> {
  const baglanti = await alfasBaglanti();
  if (!baglanti.baseUrl || !baglanti.token) return { ok: false, hata: YAPILANDIRMA_HATASI };

  const sorgu = new URLSearchParams({ limit: String(limit) });
  for (const [k, v] of Object.entries(ek)) sorgu.set(k, String(v));
  const url = `${baglanti.baseUrl}/crm/${yol}?${sorgu.toString()}`;
  try {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${baglanti.token}` },
      // Sipariş listesi bayat gösterilmez: panelde eski sayı, "sipariş gelmemiş"
      // sanılmasına yol açar.
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!r.ok) {
      // Gövde JSON olmayabilir (proxy hatası, HTML sayfa) — okunabileni al.
      let detay = `HTTP ${r.status}`;
      try {
        const g = await r.text();
        const j = g.trim().startsWith("{") ? JSON.parse(g) : null;
        if (j?.message) detay = `HTTP ${r.status} — ${j.message}`;
        else if (g) detay = `HTTP ${r.status} — ${g.slice(0, 200)}`;
      } catch {
        /* gövde okunamadı; HTTP kodu yeterli */
      }
      // 401/503 en sık karşılaşılan iki durum: jeton yanlış ya da ALFAS
      // tarafında hiç tanımlı değil. Kullanıcı ne yapacağını bilsin.
      const mesaj =
        r.status === 401
          ? "ALFAS jetonu geçersiz (401)."
          : r.status === 503
            ? "ALFAS tarafında CRM okuma ucu kapalı (503)."
            : r.status === 404
              ? // Panel, ALFAS'tan ÖNCE yayına girerse yeni uç henüz yoktur. Jeton/adres
                // sorunu sanılmasın: 401/503 değil, uç bulunamıyor.
                "ALFAS tarafında bu uç yok (404) — alfashome'un son sürümü henüz yayında olmayabilir."
              : "ALFAS verisi alınamadı.";
      return { ok: false, hata: { mesaj, detay } };
    }

    // Gövde `{ok:true,...}` sözleşmesine uymazsa veri kullanılmaz: `any`
    // yerine daraltılmış tip, alan adı değişince derleyicinin uyarması için.
    const j = (await r.json()) as { ok?: boolean; message?: string } & Record<string, unknown>;
    if (!j?.ok) {
      return { ok: false, hata: { mesaj: "ALFAS verisi alınamadı.", detay: j?.message } };
    }
    return { ok: true, veri: j as unknown as T };
  } catch (e: unknown) {
    const hata = e as { name?: string; message?: string };
    const zamanAsimi = hata?.name === "TimeoutError" || hata?.name === "AbortError";
    return {
      ok: false,
      hata: {
        mesaj: zamanAsimi ? "ALFAS arka ucu zamanında yanıt vermedi." : "ALFAS arka ucuna ulaşılamadı.",
        detay: String(hata?.message ?? e).slice(0, 200),
      },
    };
  }
}

export async function fetchAlfasOrders(limit = 50): Promise<SiparisSonuc> {
  const r = await cek<{ siparisler: AlfasSiparis[]; adet: number; ciro: number; para: string }>(
    "orders",
    limit
  );
  if (!r.ok) return { ok: false, hata: r.hata };
  return {
    ok: true,
    siparisler: r.veri.siparisler ?? [],
    adet: r.veri.adet ?? 0,
    ciro: r.veri.ciro ?? 0,
    para: r.veri.para ?? "try",
    guncellendi: new Date(),
  };
}

export async function fetchAlfasMembers(limit = 200): Promise<UyeSonuc> {
  const r = await cek<{ uyeler: AlfasUye[]; adet: number; hesapli: number; alici: number }>(
    "members",
    limit
  );
  if (!r.ok) return { ok: false, hata: r.hata };
  return {
    ok: true,
    uyeler: r.veri.uyeler ?? [],
    adet: r.veri.adet ?? 0,
    hesapli: r.veri.hesapli ?? 0,
    alici: r.veri.alici ?? 0,
    guncellendi: new Date(),
  };
}

/**
 * Terk edilen / bekleyen sepetler. `gun`: kaç gün geriye bakılacağı (ALFAS
 * tarafında 1-90 aralığına sıkıştırılır). Uç mail GÖNDERMEZ ve hiçbir şey yazmaz.
 */
export async function fetchAlfasCarts(limit = 200, gun = 30): Promise<SepetSonuc> {
  const r = await cek<{
    sepetler: AlfasSepet[];
    adet: number;
    toplam: number;
    kesildi: boolean;
    pencere_gun: number;
    mail_yapilandirildi: boolean;
    esikler: AlfasSepetEsikler;
    ozet: AlfasSepetOzet;
    kurtarilan: { adet: number; tutar: number };
  }>("carts", limit, { gun });
  if (!r.ok) return { ok: false, hata: r.hata };
  const v = r.veri;
  // ⚠️ Beklenen alanlar yoksa VERİ KULLANILMAZ: eksik `ozet`/`esikler` ile sayfayı
  // çizmek "0 sepet, sorun yok" gibi okunurdu (alan adı kaymasının sessiz yüzü).
  if (!Array.isArray(v.sepetler) || !v.ozet || !v.esikler) {
    return {
      ok: false,
      hata: {
        mesaj: "ALFAS sepet yanıtı beklenen biçimde değil.",
        detay: "sepetler / ozet / esikler alanlarından biri eksik — iki repo sözleşmesi kaymış olabilir.",
      },
    };
  }
  return {
    ok: true,
    sepetler: v.sepetler,
    adet: v.adet ?? v.sepetler.length,
    toplam: v.toplam ?? v.sepetler.length,
    kesildi: Boolean(v.kesildi),
    pencere_gun: v.pencere_gun ?? gun,
    mail_yapilandirildi: Boolean(v.mail_yapilandirildi),
    esikler: v.esikler,
    ozet: v.ozet,
    kurtarilan: v.kurtarilan ?? { adet: 0, tutar: 0 },
    guncellendi: new Date(),
  };
}

/** Panelde gösterilen tutar biçimi — ALFAS tarafı TRY döndürüyor. */
export function alfasPara(n: number, para = "try"): string {
  const birim = para.toUpperCase() === "TRY" ? "₺" : para.toUpperCase();
  return `${n.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} ${birim}`;
}

/** Ödeme durumu → Türkçe etiket + ton. Bilinmeyen değer OLDUĞU GİBİ gösterilir. */
export function odemeEtiketi(odeme: string | null): { etiket: string; ton: "success" | "warning" | "danger" | "neutral" } {
  switch (odeme) {
    case "captured":
      return { etiket: "Ödendi", ton: "success" };
    case "authorized":
      return { etiket: "Provizyon", ton: "warning" };
    case "awaiting":
    case "not_paid":
      return { etiket: "Ödeme bekliyor", ton: "warning" };
    case "partially_refunded":
      return { etiket: "Kısmi iade", ton: "warning" };
    case "refunded":
      return { etiket: "İade edildi", ton: "danger" };
    case "canceled":
      return { etiket: "İptal", ton: "danger" };
    default:
      return { etiket: odeme ?? "—", ton: "neutral" };
  }
}
