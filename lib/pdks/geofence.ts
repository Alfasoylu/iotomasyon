/**
 * PDKS — Geofence kararı. SAF: ağ, DB, `server-only` YOK.
 *
 * NEDEN AYRI DOSYA: aynı kural iki uçta (check-in, check-out) ayrı ayrı
 * yazılmıştı. Biri güncellenip öbürü unutulursa giriş ile çıkış farklı
 * davranır ve fark SESSİZ olur (çıkışta kabul edilen konum girişte
 * reddedilir). Karar DAİMA sunucuda verilir — client yalnız ham koordinat +
 * accuracy gönderir (spec §7).
 */

import { distanceMeters } from "./geo";

export type GeoSite = {
  id?: string;
  name?: string;
  latitude: number;
  longitude: number;
  /** Bu yarıçapın (metre) DIŞINDA giriş/çıkış kabul edilmez. */
  radiusMeters: number;
  /** Cihazın bildirdiği accuracy bu değeri (metre) AŞARSA konum güvenilmez. */
  maxAccuracyMeters: number;
};

export type GeoVerdict =
  | { ok: true; site: GeoSite; distance: number }
  | { ok: false; reason: "santiye-yok"; site: null; distance: null }
  | { ok: false; reason: "dogruluk-yetersiz" | "uzakta"; site: GeoSite; distance: number };

/** En yakın şantiye ve mesafesi. Liste boşsa null. */
export function nearestSite(
  lat: number,
  lng: number,
  sites: readonly GeoSite[]
): { site: GeoSite; distance: number } | null {
  let best: { site: GeoSite; distance: number } | null = null;
  for (const s of sites) {
    const d = distanceMeters(lat, lng, s.latitude, s.longitude);
    if (!best || d < best.distance) best = { site: s, distance: d };
  }
  return best;
}

/**
 * Giriş/çıkış konum kararı.
 *
 * Sıra ÖNEMLİ: doğruluk kapısı mesafeden ÖNCE gelir. Aksi hâlde ±500 m
 * hatayla gelen bir koordinat "şantiyede" sayılabilir — kapalı alanda telefon
 * bunu rutin olarak bildirir. Eşik şantiye başına (`maxAccuracyMeters`).
 *
 * `accuracy` sayı değilse (cihaz bildirmedi) doğruluk kapısı UYGULANMAZ —
 * eski davranış korunuyor: bilgi yokluğu gerekçe sayılmaz, mesafe yine bakılır.
 */
export function geofenceVerdict(args: {
  lat: number;
  lng: number;
  accuracy?: number | null;
  sites: readonly GeoSite[];
}): GeoVerdict {
  const yakin = nearestSite(args.lat, args.lng, args.sites);
  if (!yakin) return { ok: false, reason: "santiye-yok", site: null, distance: null };

  const acc = Number(args.accuracy);
  if (Number.isFinite(acc) && acc > yakin.site.maxAccuracyMeters) {
    return { ok: false, reason: "dogruluk-yetersiz", site: yakin.site, distance: yakin.distance };
  }
  if (yakin.distance > yakin.site.radiusMeters) {
    return { ok: false, reason: "uzakta", site: yakin.site, distance: yakin.distance };
  }
  return { ok: true, site: yakin.site, distance: yakin.distance };
}

/**
 * 18:00–05:00 arası giriş normal mesai başlangıcı değildir → ya yanlışlık ya
 * fazla mesai. Personelden onay istenir; onaylarsa kayıt fazla mesai olur ve
 * otomatik çıkıştan muaf tutulur.
 */
export function isAbnormalCheckInHour(hhmmTR: string): boolean {
  const saat = Number(hhmmTR.slice(0, 2));
  if (!Number.isFinite(saat)) return false;
  return saat >= 18 || saat < 5;
}
