/**
 * Zamanlanmış mesaj kararı — SAF fonksiyonlar, DB/ağ yok.
 *
 * Neden ayrı ve test edilebilir: bu katmandaki her hata sessiz ve pahalı.
 * Bir görev iki kez tetiklenirse depocuya aynı soru iki kez gider ve İKİ KEZ
 * ücretlenir; hiç tetiklenmezse kimse fark etmez (mesaj gelmemesi normal
 * görünür). Karar mantığı cron route'unun içinde kalsaydı ne biri ne öbürü
 * denenebilirdi.
 */

/**
 * Tüm zamanlama Europe/Istanbul YEREL saatine göredir.
 *
 * UTC saklamak yaz saati değişiminde mesajı bir saat kaydırırdı. "Her sabah
 * 08:30" kullanıcı için yerel bir vaattir; Türkiye kalıcı UTC+3'te olsa da
 * sunucu saati UTC olduğu için dönüşüm yine de açıkça yapılmalı.
 */
export const TZ = "Europe/Istanbul";

export type LocalNow = {
  /** "2026-09-14" — mükerrer gönderim freninin damgası. */
  date: string;
  hour: number;
  minute: number;
  /** 0=Pazar … 6=Cumartesi */
  weekday: number;
};

const PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hour12: false,
});

const GUNLER: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Verilen anın Istanbul yerel karşılığı. */
export function localNow(now: Date = new Date()): LocalNow {
  const p = PARTS.formatToParts(now);
  const al = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  // hour12:false bazı ortamlarda gece yarısını "24" verir; 0'a çekilmeli,
  // yoksa 00:30'da hiçbir görev "saati geldi" sayılmaz.
  const hour = Number(al("hour")) % 24;
  return {
    date: `${al("year")}-${al("month")}-${al("day")}`,
    hour,
    minute: Number(al("minute")),
    weekday: GUNLER[al("weekday")] ?? 0,
  };
}

export type Schedulable = {
  hour: number;
  minute: number;
  /** Boş dizi = her gün. */
  daysOfWeek: number[];
  isActive: boolean;
  /** En son çalıştığı Istanbul yerel günü. */
  lastRunOn: string | null;
};

export type DueReason =
  | "gonderilecek"
  | "pasif"
  | "gun_uymuyor"
  | "saati_gelmedi"
  | "bugun_gonderildi";

/**
 * Bu görev ŞİMDİ gönderilmeli mi?
 *
 * Kural sırası bilerek böyle: önce ucuz elemeler, en sona mükerrer freni.
 * Fren `lastRunOn` damgasına bakar, "şu kadar dakika önce" gibi bir pencereye
 * DEĞİL — harici zamanlayıcı gecikirse ya da iki kez çağırırsa pencere tabanlı
 * kural ya mesajı kaçırır ya iki kez gönderir.
 *
 * Saati geçmiş bir görev gün içinde HÂLÂ gönderilir (>=, == değil): zamanlayıcı
 * 08:30'u kaçırıp 09:00'da çağırırsa yoklama yine gitmeli. Ertesi güne
 * sarkmaz, çünkü damga yerel güne bağlı.
 */
export function dueReason(s: Schedulable, now: LocalNow): DueReason {
  if (!s.isActive) return "pasif";
  if (s.daysOfWeek.length > 0 && !s.daysOfWeek.includes(now.weekday)) return "gun_uymuyor";
  if (s.lastRunOn === now.date) return "bugun_gonderildi";
  const suAn = now.hour * 60 + now.minute;
  const hedef = s.hour * 60 + s.minute;
  if (suAn < hedef) return "saati_gelmedi";
  return "gonderilecek";
}

export function isDue(s: Schedulable, now: LocalNow): boolean {
  return dueReason(s, now) === "gonderilecek";
}

/** "08:30" — panelde ve log'da gösterim. */
export function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

const GUN_ADI = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

/** "Pzt, Sal, Çar, Per, Cum" / "Her gün" */
export function formatDays(daysOfWeek: number[]): string {
  if (!daysOfWeek.length) return "Her gün";
  return [...daysOfWeek]
    .filter((d) => d >= 0 && d <= 6)
    .sort((a, b) => a - b)
    .map((d) => GUN_ADI[d])
    .join(", ");
}

/**
 * Cevap eşleştirme penceresi. Gelen mesaj, bu süre içinde sorulmuş ve hâlâ
 * cevapsız bekleyen SON soruya bağlanır.
 *
 * 48 saat: sabah sorulan yoklamaya akşam, hatta ertesi sabah gelen "evet"
 * hâlâ o sorunun cevabıdır. Daha uzun tutmak alakasız bir mesajı üç gün
 * önceki soruya bağlardı ve kayıt yanlış olurdu — yanlış kayıt, kayıt
 * olmamasından kötüdür.
 */
export const REPLY_MATCH_HOURS = 48;

export function replyMatchCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - REPLY_MATCH_HOURS * 3600_000);
}
