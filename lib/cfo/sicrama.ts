/**
 * Stok sıçraması kapatma durumları — TEK KAYNAK.
 *
 * Bu liste veritabanındaki `cfo_stok_sicrama_durum_check` CHECK constraint'i ile
 * birebir aynı olmak zorundadır (22.09.2026'da doğrulandı). Ayrı yazılırsa uç
 * geçerli sanıp yazmayı dener, Postgres reddeder ve kullanıcı sebebi
 * anlaşılmayan bir hata görür.
 *
 * 'ACIK' bilerek yok: o açık kaydın başlangıç durumu, bir kapatma sebebi değil.
 */
export const SICRAMA_KAPATMA_DURUMLARI = [
  { value: "SATIS", label: "Satış" },
  { value: "TOPLU_SATIS", label: "Toplu satış" },
  { value: "FBA_GONDERIM", label: "FBA gönderim" },
  { value: "SAYIM_DUZELTME", label: "Sayım düzeltmesi" },
  { value: "IADE_IPTAL", label: "İade / iptal" },
  { value: "TRANSFER_BASKA_SKU", label: "Başka SKU'ya transfer" },
  { value: "DIGER", label: "Diğer" },
] as const;

export type SicramaKapatmaDurumu =
  (typeof SICRAMA_KAPATMA_DURUMLARI)[number]["value"];

const GECERLI = new Set<string>(SICRAMA_KAPATMA_DURUMLARI.map((d) => d.value));

export function gecerliKapatmaDurumu(v: unknown): v is SicramaKapatmaDurumu {
  return typeof v === "string" && GECERLI.has(v);
}
