/**
 * PDKS — Otomatik çıkış kararı. SAF: ağ, DB, `server-only` YOK.
 *
 * NEDEN AYRI DOSYA: karar `api/pdks/cron/reminders/route.ts` içinde, DB
 * çağrılarının arasına gömülüydü; yani TEST EDİLEMİYORDU. Oysa burada yanlış
 * karar doğrudan **maaşa** yazılıyor: erken kapatmak çalışılan saati siler,
 * hiç kapatmamak kaydı sonsuza dek açık bırakır.
 */

/** Beklenen çıkıştan bu kadar dakika sonra hâlâ açıksa sistem kapatır. */
export const AUTO_CHECKOUT_DELAY_MIN = 15;

export type CheckoutAction =
  /** O gün tatil / programda kapalı → sistem karışmaz. */
  | "tatil"
  /** Çıkış saati henüz gelmedi. */
  | "bekle"
  /** Çıkış saati geçti, süre dolmadı → tek sefer hatırlat. */
  | "hatirlat"
  /** Hatırlatma zaten yapılmış, süre dolmadı → bir şey yapma. */
  | "hatirlatildi"
  /** Süre doldu → otomatik çıkış (bildirimli). */
  | "otomatik-cikis"
  /** Geçmiş güne ait açık kayıt → sessizce kapat (bildirim yok). */
  | "gecmis-gun-kapat";

/**
 * Tek bir açık devam kaydı için ne yapılmalı?
 *
 * @param workDate       Kaydın günü (TR gününün UTC gece-yarısı)
 * @param today          Bugün (aynı biçim — `workDateTR()`)
 * @param expectedOutMin Beklenen çıkış (gün içi dakika) — tatilse null
 * @param nowMinTR       Şu anki TR saati (gün içi dakika)
 * @param reminded       Bu kayda çıkış hatırlatması gönderilmiş mi
 *
 * ⚠️ `overtime=true` kayıtlar buraya HİÇ gelmez (sorgu onları ayıklar):
 * fazla mesai bilerek uzar, sistem kapatmaz.
 */
export function checkoutAction(args: {
  workDate: Date;
  today: Date;
  expectedOutMin: number | null;
  nowMinTR: number;
  reminded: boolean;
}): CheckoutAction {
  // Geçmiş gün kontrolü tatilden ÖNCE değil, SONRA gelir: tatil günü açılmış
  // bir kayıt için beklenen çıkış yoktur, hangi saate kapatılacağı bilinemez.
  if (args.expectedOutMin == null) return "tatil";

  // Geçmiş güne ait açık kayıt kesin gecikmiş — "şu an"la kıyaslamak anlamsız
  // (dün 18:30'u bugünün dakikasıyla karşılaştırmak yanlış sonuç verir).
  if (args.workDate.getTime() < args.today.getTime()) return "gecmis-gun-kapat";

  const gecen = args.nowMinTR - args.expectedOutMin;
  if (gecen < 0) return "bekle";
  if (gecen >= AUTO_CHECKOUT_DELAY_MIN) return "otomatik-cikis";
  return args.reminded ? "hatirlatildi" : "hatirlat";
}
