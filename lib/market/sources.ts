// Market Scout — source registry, data grades and the TRUTHFUL source-health matrix (docs/MARKET-SCOUT.md).
// Health is never optimistic: a provider is AVAILABLE only when it actually works with what is configured today; nothing is
// scheduled by this module. External data is untrusted input everywhere (never instructions).

export const MARKET_SCOUT_VERSION = "market-scout-foundation-v1";

export const MARKET_SOURCES = [
  "TRENDYOL_OFFICIAL_API", "TRENDYOL_SITEMAP", "MANUAL_BROWSER_CAPTURE", "GOOGLE_OFFICIAL", "GOOGLE_AUTOCOMPLETE_EXPERIMENTAL",
  "ALIBABA_OFFICIAL", "MANUAL_SOURCING", "LICENSED_PROVIDER", "LEGACY_SCOUT_IMPORT", "DERIVED",
] as const;
export type MarketSource = typeof MARKET_SOURCES[number];

/** A = authoritative structured source · B = public page seen/entered by a person · C = derived from observations · D = heuristic/LLM · UNKNOWN. */
export const DATA_GRADES = ["A", "B", "C", "D", "UNKNOWN"] as const;
export type DataGrade = typeof DATA_GRADES[number];
export const SOURCE_GRADE: Record<MarketSource, DataGrade> = {
  TRENDYOL_OFFICIAL_API: "A", TRENDYOL_SITEMAP: "A", MANUAL_BROWSER_CAPTURE: "B", GOOGLE_OFFICIAL: "A", GOOGLE_AUTOCOMPLETE_EXPERIMENTAL: "B",
  ALIBABA_OFFICIAL: "A", MANUAL_SOURCING: "B", LICENSED_PROVIDER: "C", LEGACY_SCOUT_IMPORT: "C", DERIVED: "C",
};

export type HealthStatus = "AVAILABLE" | "LIMITED" | "EXPERIMENTAL" | "BLOCKED" | "UNAVAILABLE" | "LEGAL_REVIEW_REQUIRED";
export interface SourceHealth {
  key: string; label: string; source: MarketSource | null; status: HealthStatus; scheduled: false;
  reason: string; verifiedOn: string; lastRun?: { status: string; finishedAt: string | null } | null;
}
export interface HealthContext {
  trendyolConfigured: boolean;           // TrendyolConfig enabled with credentials (never the values)
  buyboxStorefrontConfigured: boolean;   // MARKET_SCOUT_TRENDYOL_STOREFRONT_CODE set (TR value is not listed in Trendyol docs → unverified)
  googleTrendsConfigured: boolean;       // official Trends API (alpha) access configured
  autocompleteEnabled: boolean;          // MARKET_SCOUT_AUTOCOMPLETE_ENABLED === "true"
  lastRuns?: Record<string, { status: string; finishedAt: string | null }>;
}

const VERIFIED = "2026-10-06";
/** Truthful health matrix. `scheduled` is always false in this PR: no collector runs on a schedule. */
export function sourceHealth(ctx: HealthContext): SourceHealth[] {
  const run = (k: string) => ctx.lastRuns?.[k] ?? null;
  return [
    { key: "trendyol_buybox", label: "Trendyol Buybox (resmi Seller API)", source: "TRENDYOL_OFFICIAL_API",
      status: !ctx.trendyolConfigured || !ctx.buyboxStorefrontConfigured ? "UNAVAILABLE" : run("trendyol_buybox")?.status === "OK" ? "AVAILABLE" : "LIMITED",
      scheduled: false, verifiedOn: VERIFIED, lastRun: run("trendyol_buybox"),
      reason: !ctx.trendyolConfigured ? "TrendyolConfig etkin değil"
        : !ctx.buyboxStorefrontConfigured ? "MARKET_SCOUT_TRENDYOL_STOREFRONT_CODE yok (belgelerde TR değeri listelenmiyor)"
        : run("trendyol_buybox")?.status === "OK" ? "Yalnız bizim barkodlarımız; 10 barkod/istek, 1000 istek/dk. Rakip satış adedi vermez."
        : "Kimlik bilgisi var; TR mağazası için ilk yetkili çağrı henüz doğrulanmadı" },
    { key: "trendyol_sitemap", label: "Trendyol Sitemap", source: "TRENDYOL_SITEMAP", status: "LIMITED", scheduled: false, verifiedOn: VERIFIED,
      lastRun: run("trendyol_sitemap"),
      reason: "İzinli: mağaza listesi (ad/ID) ve ürün URL/ID/görsel. Fiyat, puan, yorum, satıcı YOK; ürün dosyalarında lastmod yok, ID'ler 333 dosyaya dağınık." },
    { key: "trendyol_store_crawl", label: "Trendyol Mağaza/Ürün Sayfası", source: null, status: "BLOCKED", scheduled: false, verifiedOn: VERIFIED,
      reason: "Cloudflare 403 + robots (/sr?, ?mid=, /magaza/profil) — anti-bot aşımı yapılmaz." },
    { key: "manual_capture", label: "Manuel Capture (tarayıcıdan)", source: "MANUAL_BROWSER_CAPTURE", status: "AVAILABLE", scheduled: false, verifiedOn: VERIFIED,
      reason: "Kullanıcının normal tarayıcıda gördüğü değerler; append-only, B derecesi." },
    { key: "google_trends", label: "Google Trends (resmi API alpha)", source: "GOOGLE_OFFICIAL",
      status: ctx.googleTrendsConfigured ? "AVAILABLE" : "UNAVAILABLE", scheduled: false, verifiedOn: VERIFIED,
      reason: ctx.googleTrendsConfigured ? "Normalize ilgi endeksi (arama hacmi değil)" : "Erişim yok (başvuru tabanlı alpha); sinyal UNKNOWN. Resmî olmayan uç robots ile yasak." },
    { key: "google_autocomplete", label: "Google Otomatik Tamamlama", source: "GOOGLE_AUTOCOMPLETE_EXPERIMENTAL",
      status: "EXPERIMENTAL", scheduled: false, verifiedOn: VERIFIED,
      reason: ctx.autocompleteEnabled ? "Yalnız anahtar kelime keşfi (arama hacmi DEĞİL); belgelenmemiş uç" : "Kapalı (MARKET_SCOUT_AUTOCOMPLETE_ENABLED) — yalnız anahtar kelime keşfi, hacim değil" },
    { key: "alibaba_search", label: "Alibaba Arama", source: "ALIBABA_OFFICIAL", status: "UNAVAILABLE", scheduled: false, verifiedOn: VERIFIED,
      reason: "robots /trade/ yasak, showroom 410; resmi Open Platform başvurusu yok." },
    { key: "manual_sourcing", label: "Manuel Tedarik (Alibaba/1688/MIC linki)", source: "MANUAL_SOURCING", status: "AVAILABLE", scheduled: false,
      verifiedOn: VERIFIED, reason: "Ekip girer; görünen fiyat iniş maliyeti değildir (UNKNOWN)." },
    { key: "licensed_provider", label: "Lisanslı veri sağlayıcı", source: "LICENSED_PROVIDER", status: "LEGAL_REVIEW_REQUIRED", scheduled: false,
      verifiedOn: VERIFIED, reason: "Hukuki inceleme olmadan entegre edilmez." },
  ];
}
