/**
 * Meta Marketing API "insights" yanıtının normalleştirilmesi — SAF fonksiyonlar.
 *
 * Neden ayrı ve test edilebilir: Graph API'nin insights yanıtı üç ayrı tuzak
 * barındırıyor ve üçü de SESSİZ yanlış sayı üretir (hata fırlatmaz):
 *
 *  1. Tüm sayılar STRING gelir ("1234.56"). Doğrudan toplanırsa
 *     "12" + "34" = "1234" olur.
 *  2. Dönüşümler `actions` dizisinde, satın alma değeri `action_values`
 *     dizisinde ve satın alma birden çok `action_type` altında AYNI ANDA
 *     raporlanır (`purchase`, `omni_purchase`,
 *     `offsite_conversion.fb_pixel_purchase`). Hepsini toplamak ciroyu
 *     ÜÇE KATLAR ve ROAS'ı uydurur.
 *  3. Hiç dönüşüm yoksa alanlar tamamen YOKTUR (boş dizi değil, alan yok).
 */

export type RawAction = { action_type?: string; value?: string | number };

export type RawInsight = {
  campaign_id?: string;
  campaign_name?: string;
  spend?: string | number;
  impressions?: string | number;
  clicks?: string | number;
  reach?: string | number;
  actions?: RawAction[];
  action_values?: RawAction[];
  date_start?: string;
  date_stop?: string;
};

/** Graph API sayıları string döndürür; güvenli çevirim. */
export function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Satın alma için TEK bir action_type seçilir — toplanmaz.
 *
 * Öncelik sırası bilerek böyle: `omni_purchase` Meta'nın kanallar arası
 * TEKİLLEŞTİRİLMİŞ ölçüsüdür ve varsa doğru olan odur. Yoksa pixel'in kendi
 * sayacına, o da yoksa genel `purchase`a düşülür.
 *
 * Sıralamayı değiştirmeden önce: bunları TOPLAMAK aynı satışı iki-üç kez
 * saymak demektir ve ROAS olduğundan yüksek çıkar — yani bütçe kararı yanlış
 * veriyle verilir.
 */
export const PURCHASE_ACTION_PRIORITY = [
  "omni_purchase",
  "offsite_conversion.fb_pixel_purchase",
  "purchase",
] as const;

export function pickAction(
  list: RawAction[] | undefined,
  priority: readonly string[] = PURCHASE_ACTION_PRIORITY
): number {
  if (!list?.length) return 0;
  for (const tip of priority) {
    const bulunan = list.find((a) => a.action_type === tip);
    if (bulunan) return num(bulunan.value);
  }
  return 0;
}

export type CampaignInsight = {
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  /** Satın alma adedi. */
  purchases: number;
  /** Satın alma cirosu (hesabın para biriminde). */
  revenue: number;
  /** Tıklama oranı, yüzde. */
  ctr: number;
  /** Tıklama başı maliyet. */
  cpc: number;
  /** Satın alma başı maliyet. Satış yoksa null — 0 göstermek "bedava" derdi. */
  cpa: number | null;
  /** Reklam harcamasının getirisi (ciro / harcama). Harcama yoksa null. */
  roas: number | null;
};

export function normalizeInsight(raw: RawInsight): CampaignInsight {
  const spend = num(raw.spend);
  const clicks = num(raw.clicks);
  const impressions = num(raw.impressions);
  const purchases = pickAction(raw.actions);
  const revenue = pickAction(raw.action_values);

  return {
    campaignId: raw.campaign_id ?? "",
    campaignName: raw.campaign_name ?? "(adsız kampanya)",
    spend,
    impressions,
    clicks,
    reach: num(raw.reach),
    purchases,
    revenue,
    // CTR/CPC'yi Meta da döndürüyor ama kendimiz hesaplıyoruz: bölen sıfırken
    // Meta alanı hiç göndermiyor ve okuyan taraf 0 sanıyor.
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    // Satış yokken CPA "0" göstermek "satın alma bedavaya geldi" demekti.
    cpa: purchases > 0 ? spend / purchases : null,
    // Harcama yokken ROAS tanımsızdır; 0 göstermek "hiç getirisi yok" derdi.
    roas: spend > 0 ? revenue / spend : null,
  };
}

export type AdsSummary = {
  campaigns: CampaignInsight[];
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
  ctr: number;
  cpc: number;
  cpa: number | null;
  roas: number | null;
};

/**
 * Kampanyaları tek özete indirger.
 *
 * Oranlar (CTR/CPC/CPA/ROAS) kampanya oranlarının ORTALAMASI DEĞİL, toplam
 * paydan yeniden hesaplanır. Ortalama almak, 1 ₺ harcayan kampanyayı 1.000 ₺
 * harcayanla eşit ağırlığa sokar ve toplam ROAS'ı tamamen yanlış gösterir.
 */
export function summarize(campaigns: CampaignInsight[]): AdsSummary {
  const spend = campaigns.reduce((t, c) => t + c.spend, 0);
  const impressions = campaigns.reduce((t, c) => t + c.impressions, 0);
  const clicks = campaigns.reduce((t, c) => t + c.clicks, 0);
  const purchases = campaigns.reduce((t, c) => t + c.purchases, 0);
  const revenue = campaigns.reduce((t, c) => t + c.revenue, 0);

  return {
    campaigns,
    spend,
    impressions,
    clicks,
    purchases,
    revenue,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpa: purchases > 0 ? spend / purchases : null,
    roas: spend > 0 ? revenue / spend : null,
  };
}

/**
 * Hesap kimliğini `act_` önekli biçime getirir.
 * Kullanıcı panelden kopyalarken bazen önekli bazen öneksiz alır; yanlış biçim
 * Graph API'de "Unsupported get request" verir ve hata mesajı sebebi söylemez.
 */
export function normalizeAccountId(raw: string): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  const sadeceRakam = t.replace(/^act_/, "");
  if (!/^\d+$/.test(sadeceRakam)) return "";
  return `act_${sadeceRakam}`;
}
