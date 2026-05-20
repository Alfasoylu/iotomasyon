/**
 * Faz 1 — Sektör → Katalog Profili Eşleştirme (Hard-coded MVP)
 *
 * 12 sektör profili. Phase 99 Industry.slug değerleriyle eşleşir.
 * Faz 5'te DB tabanlı yapıya (Industry.catalog* alanları) taşınacak.
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

// ── 12 sektör profili + fallback ──────────────────────────────────────────────

const CCTV_CORE = ["cctv-kamera-sistemleri"];
const CCTV_EXPANDED = [
  "cctv-kamera-sistemleri",
  "telsiz-haberlesme",
  "metal-dedektoru",
  "akilli-ev-iot-otomasyon",
];
const SECURITY_INSTALLER = [
  "cctv-kamera-sistemleri",
  "akilli-ev-iot-otomasyon",
  "guc-kaynagi-donusturucu",
  "telsiz-haberlesme",
];
const RETAIL_QUICK = [
  "cctv-kamera-sistemleri",
  "metal-dedektoru",
  "guc-kaynagi-donusturucu",
];
const IT_RESELLER = [
  "cctv-kamera-sistemleri",
  "bilgisayar-cevre-baglanti",
  "bilgisayar-donanim-sogutucu",
  "akilli-ev-iot-otomasyon",
];
const ELECTRICAL = [
  "aydinlatma-led",
  "cctv-kamera-sistemleri",
  "guc-kaynagi-donusturucu",
  "elektronik-modul-gelistirme",
];
const INSTALLATION_VENUE = [
  "cctv-kamera-sistemleri",
  "akilli-ev-iot-otomasyon",
  "audio-amfi-hoparlor",
];

export const CATALOG_PROFILES: Record<string, CatalogProfile> = {
  // ── Güvenlik Bayisi grubu ───────────────────────────────────────────────────
  "guvenlik-sistemi-tedarikcisi": {
    slug: "guvenlik-sistemi-tedarikcisi",
    title: "Güvenlik Bayileri için Toptan Katalog",
    subtitle: "CCTV · Telsiz · Akıllı Ev · Metal Dedektör",
    categorySlugs: CCTV_EXPANDED,
    defaultPriceMode: "wholesale",
  },
  "guvenlik-sistemi-kurulum": {
    slug: "guvenlik-sistemi-kurulum",
    title: "Kurulum Hizmeti Sağlayıcılar Kataloğu",
    subtitle: "Kameralar · Aksesuar · Akıllı Ev",
    categorySlugs: SECURITY_INSTALLER,
    defaultPriceMode: "wholesale",
  },
  "guvenlik-sirketi": {
    slug: "guvenlik-sirketi",
    title: "Kurumsal Güvenlik Sistemleri",
    subtitle: "IP Kameralar · NVR · Erişim Kontrol",
    categorySlugs: CCTV_EXPANDED,
    defaultPriceMode: "wholesale",
  },
  "bilgisayar-guvenlik": {
    slug: "bilgisayar-guvenlik",
    title: "Bilişim & Güvenlik Hizmet Kataloğu",
    subtitle: "CCTV + Bilgisayar Çevre Birimi + Akıllı Ev",
    categorySlugs: IT_RESELLER,
    defaultPriceMode: "wholesale",
  },

  // ── Yan Bayi grubu ──────────────────────────────────────────────────────────
  "nalbur": {
    slug: "nalbur",
    title: "Nalbur Hızlı Satış Kataloğu",
    subtitle: "Popüler AHD/IP + Alarm + Kit",
    categorySlugs: RETAIL_QUICK,
    defaultPriceMode: "wholesale",
  },
  "elektronik-magaza": {
    slug: "elektronik-magaza",
    title: "Mağaza Tezgah Ürünleri Kataloğu",
    subtitle: "Hazır setler · Perakende kit",
    categorySlugs: CCTV_CORE.concat("akilli-ev-iot-otomasyon", "guc-kaynagi-donusturucu"),
    defaultPriceMode: "retail",
  },
  "bilgisayar-servisi": {
    slug: "bilgisayar-servisi",
    title: "IT Servisi Çözümleri",
    subtitle: "Starter setler + Çevre birim",
    categorySlugs: IT_RESELLER,
    defaultPriceMode: "wholesale",
  },
  "elektrikci": {
    slug: "elektrikci",
    title: "Elektrikçi Aksesuar Kataloğu",
    subtitle: "Aydınlatma · Kameralar · Güç Kaynağı",
    categorySlugs: ELECTRICAL,
    defaultPriceMode: "wholesale",
  },

  // ── Montaj Müşterisi grubu ──────────────────────────────────────────────────
  "restoran-cafe": {
    slug: "restoran-cafe",
    title: "Restoran & Cafe Güvenlik Paketi",
    subtitle: "4-8 Kamera Mini Set · Alarm",
    categorySlugs: INSTALLATION_VENUE,
    defaultPriceMode: "retail",
  },
  "site-yonetimi": {
    slug: "site-yonetimi",
    title: "Site Güvenlik Çözümleri",
    subtitle: "IP/PTZ + NVR + Erişim Kontrol",
    categorySlugs: INSTALLATION_VENUE,
    defaultPriceMode: "retail",
  },
  "otel-pansiyon": {
    slug: "otel-pansiyon",
    title: "Otel & Pansiyon Güvenlik Çözümü",
    subtitle: "IP Backbone + NVR",
    categorySlugs: INSTALLATION_VENUE,
    defaultPriceMode: "retail",
  },
  "ofis-isyeri": {
    slug: "ofis-isyeri",
    title: "Ofis & İşyeri Güvenlik Paketi",
    subtitle: "Mini IP Set + Alarm",
    categorySlugs: INSTALLATION_VENUE,
    defaultPriceMode: "retail",
  },
};

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

export function getCatalogProfile(industrySlug: string | null | undefined): CatalogProfile {
  if (!industrySlug) return GENERAL_PROFILE;
  return CATALOG_PROFILES[industrySlug] ?? GENERAL_PROFILE;
}

export function listCatalogProfiles(): CatalogProfile[] {
  return [GENERAL_PROFILE, ...Object.values(CATALOG_PROFILES)];
}
