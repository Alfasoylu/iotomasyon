import type { MarketSource } from "../sources";

// Provider architecture. Every provider declares its source (provenance) and an honest availability. Providers that are not usable
// today return UNAVAILABLE / UNKNOWN instead of data. A future LICENSED_PROVIDER, browser extension or bookmarklet plugs in here and
// writes the same observation shapes (with its own source) — nothing in scoring depends on which provider produced an observation.
export type ProviderStatus = "AVAILABLE" | "LIMITED" | "EXPERIMENTAL_DISABLED" | "EXPERIMENTAL" | "UNAVAILABLE" | "LEGAL_REVIEW_REQUIRED";
export interface ProviderResult<T> { status: ProviderStatus; signal: T | "UNKNOWN"; reason: string }

export interface MarketProvider { key: string; source: MarketSource; capabilities: string[]; status(env?: Record<string, string | undefined>): ProviderStatus }

export interface TrendsQuery { keyword: string; geo: "TR"; period: "today 12-m" | "today 3-m" }
/** Official Google Trends API (alpha, application-gated). Not configured → UNAVAILABLE + UNKNOWN; there is no unofficial fallback. */
export const googleTrendsOfficial = {
  key: "google_trends", source: "GOOGLE_OFFICIAL" as const, capabilities: ["TREND_INTEREST_INDEX (normalised 0–100, not search volume)"],
  status: (env: Record<string, string | undefined> = process.env): ProviderStatus => env.MARKET_SCOUT_GOOGLE_TRENDS_ACCESS === "granted" ? "LIMITED" : "UNAVAILABLE",
  async fetch(q: TrendsQuery, env: Record<string, string | undefined> = process.env): Promise<ProviderResult<{ interestIndex: number }>> {
    if (this.status(env) === "UNAVAILABLE") return { status: "UNAVAILABLE", signal: "UNKNOWN", reason: "Google Trends API (alpha) erişimi yok" };
    return { status: "UNAVAILABLE", signal: "UNKNOWN", reason: `İstemci erişim verildiğinde uygulanacak (alpha sözleşmesi): ${q.keyword}` };
  },
};

/** Alibaba official API — no general search access today. */
export const alibabaOfficial = {
  key: "alibaba_search", source: "ALIBABA_OFFICIAL" as const, capabilities: [],
  status: (): ProviderStatus => "UNAVAILABLE",
  async search(q: string): Promise<ProviderResult<never[]>> { return { status: "UNAVAILABLE", signal: "UNKNOWN", reason: `robots /trade/ yasak; resmi API erişimi yok (sorgu çalıştırılmadı: ${q.slice(0, 80)})` }; },
};

/** Third-party licensed data provider — blocked until legal review. */
export const licensedProvider = {
  key: "licensed_provider", source: "LICENSED_PROVIDER" as const, capabilities: [],
  status: (): ProviderStatus => "LEGAL_REVIEW_REQUIRED",
  async fetch(): Promise<ProviderResult<never>> { return { status: "LEGAL_REVIEW_REQUIRED", signal: "UNKNOWN", reason: "Hukuki inceleme tamamlanmadı" }; },
};

/** Google autocomplete — EXPERIMENTAL keyword discovery only (suggestions list, never a volume). Disabled unless explicitly enabled. */
export const googleAutocompleteExperimental = {
  key: "google_autocomplete", source: "GOOGLE_AUTOCOMPLETE_EXPERIMENTAL" as const, capabilities: ["AUTOCOMPLETE_SUGGESTIONS (not search volume)"],
  status: (env: Record<string, string | undefined> = process.env): ProviderStatus => env.MARKET_SCOUT_AUTOCOMPLETE_ENABLED === "true" ? "EXPERIMENTAL" : "EXPERIMENTAL_DISABLED",
  /** Parses the documented-by-observation response shape ["q", ["s1", ...], ...] into suggestions. No numbers are derived. */
  parse(json: unknown, keyword: string): { keyword: string; suggestions: string[]; metricKind: "AUTOCOMPLETE_SUGGESTIONS"; searchVolume: "UNKNOWN" } {
    const arr = Array.isArray(json) && Array.isArray(json[1]) ? (json[1] as unknown[]) : [];
    const suggestions = arr.filter((s): s is string => typeof s === "string").map(s => s.slice(0, 200)).slice(0, 20);
    return { keyword, suggestions, metricKind: "AUTOCOMPLETE_SUGGESTIONS", searchVolume: "UNKNOWN" };
  },
};

export const PROVIDERS = [
  { key: "trendyol_buybox", source: "TRENDYOL_OFFICIAL_API", capabilities: ["our barcodes: buybox rank, buybox price, multiple sellers, 2nd/3rd price"] },
  { key: "trendyol_sitemap", source: "TRENDYOL_SITEMAP", capabilities: ["store directory (slug, id)", "product URL/id/brand slug/image"] },
  { key: "manual_capture", source: "MANUAL_BROWSER_CAPTURE", capabilities: ["price, rating, reviews, visible sales signal, badge — as seen by a person"] },
  { key: "manual_sourcing", source: "MANUAL_SOURCING", capabilities: ["supplier, displayed price, MOQ, material, dimensions — as seen by a person"] },
  { key: googleTrendsOfficial.key, source: googleTrendsOfficial.source, capabilities: googleTrendsOfficial.capabilities },
  { key: googleAutocompleteExperimental.key, source: googleAutocompleteExperimental.source, capabilities: googleAutocompleteExperimental.capabilities },
  { key: alibabaOfficial.key, source: alibabaOfficial.source, capabilities: alibabaOfficial.capabilities },
  { key: licensedProvider.key, source: licensedProvider.source, capabilities: licensedProvider.capabilities },
] as const;
