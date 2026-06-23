/**
 * PDKS — Sunucu tarafı coğrafi yardımcılar. Geofence kararı DAİMA sunucuda
 * verilir (spec §7); client yalnızca ham koordinat + accuracy gönderir.
 */

/** İki nokta arası mesafe (metre), haversine. */
export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Türkiye (Europe/Istanbul) takvim gününü UTC gece-yarısı Date olarak döndürür.
 * `workDate` (@db.Date) için kullanılır — sunucu UTC olsa da "bugün" TR'ye göre.
 */
export function workDateTR(now: Date = new Date()): Date {
  // en-CA → "YYYY-MM-DD"
  const ymd = now.toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
  return new Date(`${ymd}T00:00:00.000Z`);
}
