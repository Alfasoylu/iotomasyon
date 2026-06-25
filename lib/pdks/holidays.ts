// PDKS — Resmi tatil verisi ve yardımcıları (client + server ortak; server-only DEĞİL).

export type Holiday = { date: string; name: string }; // date: "YYYY-MM-DD"

/**
 * 2026 Türkiye resmî tatilleri (tam gün). Hareketli dini bayramlar Diyanet/2026
 * takvimine göre. Arife (yarım gün) günleri kasıtlı dahil DEĞİL — sabah çalışıldığı
 * için tam tatil sayılmaz; gerekirse admin elle ekleyebilir.
 */
export const TR_HOLIDAYS_2026: Holiday[] = [
  { date: "2026-01-01", name: "Yılbaşı" },
  { date: "2026-03-20", name: "Ramazan Bayramı 1. Gün" },
  { date: "2026-03-21", name: "Ramazan Bayramı 2. Gün" },
  { date: "2026-03-22", name: "Ramazan Bayramı 3. Gün" },
  { date: "2026-04-23", name: "Ulusal Egemenlik ve Çocuk Bayramı" },
  { date: "2026-05-01", name: "Emek ve Dayanışma Günü" },
  { date: "2026-05-19", name: "Atatürk'ü Anma, Gençlik ve Spor Bayramı" },
  { date: "2026-05-27", name: "Kurban Bayramı 1. Gün" },
  { date: "2026-05-28", name: "Kurban Bayramı 2. Gün" },
  { date: "2026-05-29", name: "Kurban Bayramı 3. Gün" },
  { date: "2026-05-30", name: "Kurban Bayramı 4. Gün" },
  { date: "2026-07-15", name: "Demokrasi ve Millî Birlik Günü" },
  { date: "2026-08-30", name: "Zafer Bayramı" },
  { date: "2026-10-29", name: "Cumhuriyet Bayramı" },
];

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Tenant'ın saklı tatil listesini çözer (bozuksa boş). */
export function parseHolidays(json: string | null | undefined): Holiday[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    if (Array.isArray(v)) {
      return v.filter(
        (h): h is Holiday =>
          h && typeof h.date === "string" && YMD_RE.test(h.date) && typeof h.name === "string",
      );
    }
  } catch {
    // bozuk JSON → boş
  }
  return [];
}

/** Tatil tarihleri kümesi (hızlı kontrol için). */
export function holidaySet(list: Holiday[]): Set<string> {
  return new Set(list.map((h) => h.date));
}

/** Date (@db.Date → UTC gece-yarısı) → "YYYY-MM-DD". */
export function ymdUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}
