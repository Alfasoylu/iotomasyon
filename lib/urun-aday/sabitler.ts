/**
 * Ürün adayı sabitleri.
 *
 * Ayrı dosyada çünkü `"use server"` işaretli bir modül YALNIZCA async fonksiyon
 * export edebilir — sabit export etmek derlemeyi kırıyor. Hem sunucu eylemleri
 * hem istemci bileşenleri buradan okur.
 */

export const GORSEL_TURLERI = ["URUN", "PAKET", "INFO_TR", "CINCE_BILGI"] as const;
export type GorselTuru = (typeof GORSEL_TURLERI)[number];

/** İlana/Excel çıktısına giren türler. CINCE_BILGI bilerek yok. */
export const ILANA_GIREN: GorselTuru[] = ["URUN", "PAKET", "INFO_TR"];

/** İlan açma eşiği. Alperen'in kuralı: altında ilan oluşturulmaz. */
export const PUAN_ESIGI = 90;
