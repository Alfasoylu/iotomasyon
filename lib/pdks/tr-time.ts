/**
 * PDKS — Türkiye saati ↔ UTC dönüşümleri. SAF: ağ, DB, `server-only` YOK.
 *
 * NEDEN AYRI DOSYA: bu fonksiyonlar `timesheet.ts` içindeydi, o dosya ise
 * `import "server-only"` taşıyor ve prisma'yı çekiyor. Sonuç: zaman mantığı
 * TEST EDİLEMİYORDU (tsx altında `server-only` import anında patlar). Puantajın
 * en kırılgan yeri tam burası — saat kayması maaş hatası demek.
 *
 * ⚠️ TR sabit UTC+3: Türkiye 2016'dan beri yaz saati uygulamıyor, bu yüzden
 * 180 dakikalık sabit kaydırma doğru. Yaz saati geri gelirse bu dosya ve
 * `geo.ts` içindeki `workDateTR`/`currentTimeTR` birlikte gözden geçirilmeli
 * (ikisi de `toLocale*` ile Intl'e sorar, yani onlar kendiliğinden düzelir —
 * kırılacak olan buradaki sabittir).
 */

/** TR'nin UTC'den farkı (dakika). Sabit: 2016'dan beri yaz saati yok. */
export const TR_OFFSET_MIN = 180;

/** "H:MM" / "HH:MM" → gün içi dakika. Geçersiz/boş girdide null. */
export function toMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * workDate (@db.Date → TR takvim gününün UTC gece-yarısı) + "HH:MM" TR saati → UTC Date.
 * UTC = gün-başı + (saat:dk − 180dk). Manuel puantaj düzeltmesinde admin'in
 * girdiği YEREL saati doğru UTC instant'ına çevirir.
 */
export function trTimeOnDateToUtc(workDate: Date, hhmm: string): Date | null {
  const mins = toMinutes(hhmm);
  if (mins == null) return null;
  return new Date(workDate.getTime() + (mins - TR_OFFSET_MIN) * 60_000);
}
