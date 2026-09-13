import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Servet — TEK kaynak: `cfo_servet` görünümü.
 *
 * NEDEN AYRI DOSYA: kokpitteki servet rakamı 10.09.2026'ya kadar
 * `lib/cfo/engine.ts` içinde şöyle hesaplanıyordu:
 *
 *     sellableStockTry = cfo_settings.stockCostUsd × kur   // 100.000 USD sabiti
 *     blockedStockTry  = cfo_settings.blockedStockUsd × kur //  40.000 USD sabiti
 *
 * Yani stok, elle girilmiş iki USD sabitiydi. Kimse güncellemediği için servetin
 * yarısından fazlası donmuş bir sayıydı; `cfo_snapshot.stockTry` 31.08–10.09 arası
 * on bir gün boyunca kuruşu kuruşuna 13.130.432,65 TL kaldı — o günlerde satış
 * yapıldı, mal çıktı, sayı kıpırdamadı.
 *
 * Artık servet gerçek stoktan hesaplanıyor (`cfo_stok_deger` → `cfo_servet`):
 * her SKU'nun son 90 günde GERÇEKLEŞEN satış fiyatı × kanal net oranı − kargo.
 * Yani "satarsam elime ne geçer" değeri; liste fiyatı değil.
 *
 * Engine'in narrowWorth/wideWorth alanları hâlâ hesaplanıyor ama artık ekrana
 * BASILMIYOR — bkz. engine.ts'teki uyarı. Buradan okunur.
 */

export type ServetOzeti = {
  varlik: unknown;
  borc: unknown;
  servet_try: unknown;
  riskli_haric_tutulan: unknown;
  servet_riskli_dahil: unknown;
  kur: unknown;
  servet_usd: unknown;
};

export type ServetKalemi = {
  sira: number;
  tur: string;
  kalem: string;
  tutar: unknown;
  kaynak: string | null;
  guven: string | null;
};

export type LikiditeDilimi = {
  dilim: string;
  urun: number;
  adet: number;
  net_deger: unknown;
  bir_yilda_nakde_donen: unknown;
};

export type StokYogunlasmasi = {
  sku: string;
  name: string | null;
  stok: number;
  net_deger: unknown;
  ortu_gun: unknown;
  deger_kaynagi: string | null;
};

export type ServetVerisi = {
  ozet: ServetOzeti | null;
  kalemler: ServetKalemi[];
  likidite: LikiditeDilimi[];
  yogunlasma: StokYogunlasmasi[];
  /** Hedef tarihine kalan ay. Burada hesaplanır çünkü "şu an"ı okumak bir yan
   *  etkidir ve React bunu render sırasında yapmayı yasaklar. */
  hedefAyKalan: number | null;
};

/**
 * Kokpit ve servet ekranı için tek çağrı. Dört sorgu da salt-okunur view —
 * render sırasında çağrılması güvenli.
 */
export async function loadWealth(hedefTarihi?: Date | null): Promise<ServetVerisi> {
  const [ozet, kalemler, likidite, yogunlasma] = await Promise.all([
    prisma.$queryRaw<ServetOzeti[]>`select * from cfo_servet`,
    prisma.$queryRaw<ServetKalemi[]>`select * from cfo_servet_kalem order by sira`,
    prisma.$queryRaw<LikiditeDilimi[]>`select * from cfo_servet_likidite order by dilim`,
    // Servetin ne kadarının tek bir üründe kilitli olduğunu görmek için ilk 5.
    prisma.$queryRaw<StokYogunlasmasi[]>`
      select sku, name, stok, net_deger, ortu_gun, deger_kaynagi
        from cfo_stok_deger
       where gercek_stok and net_deger > 0
       order by net_deger desc
       limit 5`,
  ]);

  const hedefAyKalan =
    hedefTarihi != null
      ? (new Date(hedefTarihi).getTime() - Date.now()) / 86400000 / 30.4
      : null;

  return { ozet: ozet[0] ?? null, kalemler, likidite, yogunlasma, hedefAyKalan };
}

export const DILIM_ETIKET: Record<string, string> = {
  "1_0-3AY": "0–3 ay",
  "2_3-12AY": "3–12 ay",
  "3_12AY+": "12 ay+",
  "4_SATMIYOR": "Satmıyor",
};
