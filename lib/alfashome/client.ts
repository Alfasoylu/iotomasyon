/**
 * ALFAS Home (alfashome.com) okuma istemcisi — SİPARİŞLER ve ÜYELER.
 *
 * NEREDEN OKUR: ALFAS mağazasının Medusa arka ucundaki salt okunur `/crm/*`
 * uçları (kaynak: alfashome `backend/src/api/crm/*`). Medusa **admin**
 * anahtarı bilerek KULLANILMIYOR — o anahtar ürün silmeye, fiyat
 * değiştirmeye, iade yapmaya da yetiyor; panelin ihtiyacı yalnız okumak.
 *
 * ⚠️ ALAN ADLARI İKİ REPO ARASINDA SÖZLEŞMEDİR. Yazan taraf alfashome
 * `backend/src/api/crm/orders|members/route.ts`. Bir alan yeniden
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

/** Gerekli iki değişken de dolu mu. */
export function alfashomeConfigured(): boolean {
  return Boolean(alfasUrl() && (process.env.ALFASHOME_API_TOKEN ?? "").trim());
}

function alfasUrl(): string {
  // Sondaki `/` temizlenir; `.../crm` ile birleştirirken çift slash olmasın.
  return (process.env.ALFASHOME_API_URL ?? "").trim().replace(/\/+$/, "");
}

const YAPILANDIRMA_HATASI: AlfasHata = {
  mesaj: "ALFAS bağlantısı yapılandırılmadı.",
  detay:
    "Vercel → Environment Variables: ALFASHOME_API_URL (ör. https://api.alfashome.com) ve ALFASHOME_API_TOKEN gerekli. Aynı jeton ALFAS tarafında Railway → CRM_API_TOKEN olarak tanımlı olmalı.",
};

/** Ağ isteği için üst sınır: panel, arka uç yanıt vermezse takılı kalmasın. */
const TIMEOUT_MS = 12_000;

async function cek<T>(yol: string, limit: number): Promise<{ ok: true; veri: T } | { ok: false; hata: AlfasHata }> {
  if (!alfashomeConfigured()) return { ok: false, hata: YAPILANDIRMA_HATASI };

  const url = `${alfasUrl()}/crm/${yol}?limit=${limit}`;
  try {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${(process.env.ALFASHOME_API_TOKEN ?? "").trim()}` },
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
