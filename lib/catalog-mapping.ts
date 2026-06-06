/**
 * Sektör → Katalog Profili eşleştirmesi.
 *
 * Migration 20260606000300 ile DB tabanlı (CatalogProfile model). Bu dosya
 * tip tanımlarını + hard-coded fallback'i (eski 12 profil) içerir. DB'den
 * okuma için `lib/get-catalog-profile.ts` kullanılır.
 *
 * Profil yapısı:
 * - title: Katalog kapağında gösterilen başlık
 * - subtitle: Alt başlık (kapakta)
 * - categorySlugs: Bu profile dahil edilecek ProductCategory.slug listesi
 * - defaultPriceMode: Varsayılan fiyat modu ("wholesale" | "retail" | "hidden")
 *
 * Fiyat modu kuralları:
 * - wholesale → Product.wholesalePriceUsd kullanılır
 * - retail → Product.retailPriceUsd kullanılır
 * - hidden → Fiyat gösterilmez
 *
 * SALES rolü wholesale modunu seçemez (lib/permissions.ts CATALOGS_WHOLESALE_MODE).
 */

export type CatalogPriceMode = "wholesale" | "retail" | "hidden";

export interface CatalogProfile {
  slug: string;             // Industry.slug ile eşleşir (veya "general" fallback)
  title: string;            // PDF kapak başlığı
  subtitle: string;         // Alt başlık
  categorySlugs: string[];  // ProductCategory.slug listesi
  defaultPriceMode: CatalogPriceMode;
}

// ── Hard-coded FALLBACK profilleri (DB miss durumunda) ────────────────────────

export const GENERAL_PROFILE: CatalogProfile = {
  slug: "general",
  title: "Ürün Kataloğu",
  subtitle: "Güvenlik · Elektronik · Akıllı Sistemler",
  categorySlugs: [
    "cctv-kamera-sistemleri",
    "akilli-ev-iot-otomasyon",
    "telsiz-haberlesme",
    "metal-dedektoru",
  ],
  defaultPriceMode: "hidden",
};

/**
 * FALLBACK_PROFILES — DÜZELTİLMİŞ hard-coded mapping (bug-fix).
 * Önceki versiyonda nalbur/elektrikçi sektörlerine yanlışlıkla CCTV
 * kataloğu gidiyordu. Bu fallback DB unavailable olduğunda kullanılır.
 * Esas kaynak: CatalogProfile DB tablosu (migration 20260606000300).
 */
export const FALLBACK_PROFILES: Record<string, CatalogProfile> = {
  "guvenlik-sistemi-tedarikcisi": {
    slug: "guvenlik-sistemi-tedarikcisi",
    title: "Güvenlik Bayileri için Toptan Katalog",
    subtitle: "CCTV · Telsiz · Akıllı Ev · Metal Dedektör",
    categorySlugs: ["cctv-kamera-sistemleri", "telsiz-haberlesme", "metal-dedektoru", "akilli-ev-iot-otomasyon"],
    defaultPriceMode: "wholesale",
  },
  "guvenlik-sistemi-kurulum": {
    slug: "guvenlik-sistemi-kurulum",
    title: "Kurulum Hizmeti Sağlayıcılar Kataloğu",
    subtitle: "Kameralar · Aksesuar · Akıllı Ev",
    categorySlugs: ["cctv-kamera-sistemleri", "akilli-ev-iot-otomasyon", "guc-kaynagi-donusturucu", "telsiz-haberlesme"],
    defaultPriceMode: "wholesale",
  },
  "guvenlik-sirketi": {
    slug: "guvenlik-sirketi",
    title: "Kurumsal Güvenlik Sistemleri",
    subtitle: "IP Kameralar · NVR · Erişim Kontrol",
    categorySlugs: ["cctv-kamera-sistemleri", "telsiz-haberlesme", "metal-dedektoru", "akilli-ev-iot-otomasyon"],
    defaultPriceMode: "wholesale",
  },
  "bilgisayar-guvenlik": {
    slug: "bilgisayar-guvenlik",
    title: "Bilişim & Güvenlik Hizmet Kataloğu",
    subtitle: "CCTV + Bilgisayar Çevre Birimi + Akıllı Ev",
    categorySlugs: ["cctv-kamera-sistemleri", "bilgisayar-cevre-baglanti", "bilgisayar-donanim-sogutucu", "akilli-ev-iot-otomasyon"],
    defaultPriceMode: "wholesale",
  },
  "nalbur": {
    slug: "nalbur",
    title: "Nalbur & Yapı Marketi Kataloğu",
    subtitle: "Musluk · El Aleti · Aydınlatma · Güç Kaynağı",
    categorySlugs: ["banyo-mutfak-bataryasi", "el-aleti-lehim", "aydinlatma-led", "guc-kaynagi-donusturucu", "su-aritma-pompa-akvaryum", "pil-aku"],
    defaultPriceMode: "wholesale",
  },
  "elektronik-magaza": {
    slug: "elektronik-magaza",
    title: "Mağaza Tezgah Ürünleri Kataloğu",
    subtitle: "Hazır setler · Perakende kit",
    categorySlugs: ["cctv-kamera-sistemleri", "akilli-ev-iot-otomasyon", "guc-kaynagi-donusturucu", "telefon-tablet-aksesuar", "gaming-konsol-aksesuar", "audio-amfi-hoparlor"],
    defaultPriceMode: "retail",
  },
  "bilgisayar-servisi": {
    slug: "bilgisayar-servisi",
    title: "IT Servisi Çözümleri",
    subtitle: "Starter setler + Çevre birim",
    categorySlugs: ["bilgisayar-cevre-baglanti", "bilgisayar-donanim-sogutucu", "cctv-kamera-sistemleri", "akilli-ev-iot-otomasyon"],
    defaultPriceMode: "wholesale",
  },
  "elektrikci": {
    slug: "elektrikci",
    title: "Elektrikçi Aksesuar Kataloğu",
    subtitle: "Aydınlatma · El Aleti · Güç Kaynağı · Ölçüm",
    categorySlugs: ["aydinlatma-led", "el-aleti-lehim", "guc-kaynagi-donusturucu", "elektronik-modul-gelistirme", "olcum-test-cihazlari", "motor-rc-surucu"],
    defaultPriceMode: "wholesale",
  },
  "restoran-cafe": {
    slug: "restoran-cafe",
    title: "Restoran & Cafe Güvenlik Paketi",
    subtitle: "4-8 Kamera Mini Set · Alarm",
    categorySlugs: ["cctv-kamera-sistemleri", "akilli-ev-iot-otomasyon", "audio-amfi-hoparlor"],
    defaultPriceMode: "retail",
  },
  "site-yonetimi": {
    slug: "site-yonetimi",
    title: "Site Güvenlik Çözümleri",
    subtitle: "IP/PTZ + NVR + Erişim Kontrol",
    categorySlugs: ["cctv-kamera-sistemleri", "akilli-ev-iot-otomasyon", "audio-amfi-hoparlor"],
    defaultPriceMode: "retail",
  },
  "otel-pansiyon": {
    slug: "otel-pansiyon",
    title: "Otel & Pansiyon Güvenlik Çözümü",
    subtitle: "IP Backbone + NVR",
    categorySlugs: ["cctv-kamera-sistemleri", "akilli-ev-iot-otomasyon", "audio-amfi-hoparlor"],
    defaultPriceMode: "retail",
  },
  "ofis-isyeri": {
    slug: "ofis-isyeri",
    title: "Ofis & İşyeri Güvenlik Paketi",
    subtitle: "Mini IP Set + Alarm",
    categorySlugs: ["cctv-kamera-sistemleri", "akilli-ev-iot-otomasyon", "audio-amfi-hoparlor"],
    defaultPriceMode: "retail",
  },
};

/**
 * Senkron getter — eski API. Sadece FALLBACK_PROFILES'ten okur, DB'yi atlar.
 * Yeni kod `getCatalogProfile()` (async, DB-aware) kullanmalı.
 *
 * @deprecated Use `getCatalogProfile` from `lib/get-catalog-profile.ts` instead.
 */
export function getCatalogProfileSync(industrySlug: string | null | undefined): CatalogProfile {
  if (!industrySlug) return GENERAL_PROFILE;
  return FALLBACK_PROFILES[industrySlug] ?? GENERAL_PROFILE;
}

export function listFallbackProfiles(): CatalogProfile[] {
  return [GENERAL_PROFILE, ...Object.values(FALLBACK_PROFILES)];
}

// ── Backward compat aliases (geçiş sürecinde — yakında silinir) ──────────────
export const CATALOG_PROFILES = FALLBACK_PROFILES;
export const getCatalogProfile = getCatalogProfileSync; // eski sync API
export const listCatalogProfiles = listFallbackProfiles;
