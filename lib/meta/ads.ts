/**
 * Meta Marketing API — reklam performansı OKUMA.
 *
 * ⚠️ SALT OKUNUR. Bu modül yalnız `insights` ve kampanya durumu çeker; bütçe
 * değiştirmez, kampanya durdurmaz/başlatmaz. Reklam harcaması geri alınamaz
 * bir işlemdir ve panelden yanlışlıkla tetiklenmemelidir — bütçe kararları
 * Meta panelinden, bilerek verilir.
 *
 * Gerekli izin: `ads_read` (Sistem Kullanıcısı anahtarında).
 *
 * ⚠️ ANAHTAR ÖMRÜ: geçici anahtar 24 saatte ölür ve panel bir anda boşalır.
 * Bu durumda "reklam yok" DEĞİL, hata gösterilir (bkz. AdsError) — boş panel
 * "kampanya durmuş" diye okunur ve yanlış paniğe yol açardı.
 */

import { normalizeAccountId, normalizeInsight, summarize, type AdsSummary, type RawInsight } from "./insights";

const GRAPH = "https://graph.facebook.com/v21.0";

/** Panelde sunulan zaman aralıkları — Meta'nın `date_preset` değerleri. */
export const DATE_PRESETS = {
  today: "Bugün",
  yesterday: "Dün",
  last_7d: "Son 7 gün",
  last_14d: "Son 14 gün",
  last_30d: "Son 30 gün",
  maximum: "Tümü",
} as const;

export type DatePreset = keyof typeof DATE_PRESETS;

export function isDatePreset(v: string | undefined): v is DatePreset {
  return Boolean(v && v in DATE_PRESETS);
}

export type AdsError = {
  /** Kullanıcıya gösterilecek Türkçe açıklama. */
  mesaj: string;
  /** Meta'nın ham hata metni — teşhis için, panelde küçük punto. */
  detay?: string;
};

export type AdsResult =
  | { ok: true; ozet: AdsSummary; currency: string; hesap: string; guncellendi: Date }
  | { ok: false; hata: AdsError };

export function adsConfigured(): boolean {
  return Boolean(process.env.META_ADS_TOKEN && normalizeAccountId(process.env.META_AD_ACCOUNT_ID ?? ""));
}

/**
 * Ardışık sayfa yenilemelerini yumuşatan kısa ömürlü bellek önbelleği.
 *
 * Kalıcı DEĞİL (sunucusuz örnekler kısa yaşar) ve öyle olması da gerekmiyor:
 * amacı tek kullanıcının hızlı yenilemelerinde Graph'a gereksiz istek
 * atmamak. Veriyi DB'ye yazıp bayatını sunmak bilerek YAPILMADI — panelde
 * eski sayı göstermek, ölçüye güvenip bütçe kararı verdirirken en tehlikeli
 * durumdur; hata varsa hata görünmeli.
 */
const TTL_MS = 60_000;
const onbellek = new Map<string, { t: number; sonuc: AdsResult }>();

async function graphGet(path: string, params: Record<string, string>): Promise<unknown> {
  const token = process.env.META_ADS_TOKEN!;
  const url = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // Anahtar sorgu dizesine DEĞİL başlığa konur: sorgu dizesi sunucu ve ara
  // katman log'larına düşer ve anahtar oralarda kalıcı olur.
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (json as { error?: { message?: string; code?: number } }).error;
    throw new Error(`${res.status} ${e?.code ?? ""} ${e?.message ?? "bilinmeyen hata"}`.trim());
  }
  return json;
}

/**
 * Kampanya bazında performans özeti.
 *
 * `level=campaign` ile kampanya kırılımı alınır: tek satırlık hesap özeti
 * "hangi kampanya para yakıyor" sorusunu cevaplamaz ve panelin amacı odur.
 */
export async function fetchAdsSummary(preset: DatePreset = "last_7d"): Promise<AdsResult> {
  if (!process.env.META_ADS_TOKEN) {
    return { ok: false, hata: { mesaj: "META_ADS_TOKEN tanımlı değil — reklam verisi çekilemiyor." } };
  }
  const hesap = normalizeAccountId(process.env.META_AD_ACCOUNT_ID ?? "");
  if (!hesap) {
    return {
      ok: false,
      hata: {
        mesaj:
          "META_AD_ACCOUNT_ID tanımlı değil ya da geçersiz. Yalnız rakam ya da act_<rakam> biçiminde olmalı.",
      },
    };
  }

  const anahtar = `${hesap}:${preset}`;
  const cached = onbellek.get(anahtar);
  if (cached && Date.now() - cached.t < TTL_MS) return cached.sonuc;

  let sonuc: AdsResult;
  try {
    const [insights, hesapBilgi] = await Promise.all([
      graphGet(`${hesap}/insights`, {
        level: "campaign",
        date_preset: preset,
        fields: "campaign_id,campaign_name,spend,impressions,clicks,reach,actions,action_values",
        limit: "100",
      }),
      graphGet(hesap, { fields: "currency" }),
    ]);

    const satirlar = ((insights as { data?: RawInsight[] }).data ?? []).map(normalizeInsight);
    // En çok harcayan üstte: bütçe hangi kampanyaya gidiyor sorusu ilk sırada.
    satirlar.sort((a, b) => b.spend - a.spend);

    sonuc = {
      ok: true,
      ozet: summarize(satirlar),
      currency: (hesapBilgi as { currency?: string }).currency ?? "TRY",
      hesap,
      guncellendi: new Date(),
    };
  } catch (e) {
    const detay = e instanceof Error ? e.message : String(e);
    // Anahtar süresi en sık hata ve belirtisi sessiz: panel boşalır. Sebebi
    // tahmin ettirmeden yaz.
    const anahtarOldu = /190|expired|session/i.test(detay);
    sonuc = {
      ok: false,
      hata: {
        mesaj: anahtarOldu
          ? "Meta anahtarı geçersiz ya da süresi dolmuş. Sistem Kullanıcısı'ndan süresiz anahtar alıp META_ADS_TOKEN'ı güncelleyin."
          : "Meta reklam verisi alınamadı.",
        detay,
      },
    };
  }

  onbellek.set(anahtar, { t: Date.now(), sonuc });
  return sonuc;
}
