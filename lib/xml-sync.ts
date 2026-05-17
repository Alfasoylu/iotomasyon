/**
 * Phase 11A — XML Feed Parser (Entegra / iotomasyon.xml format)
 *
 * Parses the real Entegra XML feed structure:
 *   <Urunler>
 *     <Urun>
 *       <urun_kodu>...</urun_kodu>
 *       <urun_ismi><![CDATA[...]]></urun_ismi>
 *       <urun_stok>0</urun_stok>
 *       <marka><![CDATA[...]]></marka>
 *       <urun_tipi>0</urun_tipi>
 *       <CurrencyType>USD</CurrencyType>
 *       <KDV>20</KDV>
 *       <date_change>...</date_change>
 *       <date_add>...</date_add>
 *       <price4>8.1356</price4>
 *       <trendyol_salePrice>...</trendyol_salePrice>
 *       <hb_price>...</hb_price>
 *       <amazon_price>...</amazon_price>
 *       <pazarama_salePrice>...</pazarama_salePrice>
 *       <idefix_sale_price>...</idefix_sale_price>
 *       <bayi>...</bayi>
 *       <koctas>...</koctas>
 *       <teknosa_sale_price>...</teknosa_sale_price>
 *       <temu_sale_price>...</temu_sale_price>
 *       <aciklama><![CDATA[...]]></aciklama>
 *       <resim1>http://...</resim1>
 *       ... <resim5>
 *       <ana_urun_kodu>...</ana_urun_kodu>
 *     </Urun>
 *   </Urunler>
 *
 * Rules:
 *   - Primary identifier: urun_kodu (no barcode in this feed)
 *   - Prices are in USD (CurrencyType = USD)
 *   - CDATA sections are stripped automatically
 *   - Missing / empty values → null
 *   - resim1 = primary image, resim2-5 = extra images
 *   - ana_urun_kodu = parent product code (may be literal "[parent_product_code]")
 */

export type XmlProductRecord = {
  // Core identity
  sku: string;               // urun_kodu — always present and non-empty
  name?: string;             // urun_ismi
  brand?: string;            // marka
  description?: string;      // aciklama
  // Stock & meta
  stock?: number;            // urun_stok
  urunTipi?: string;         // urun_tipi (informational only)
  currencyType?: string;     // CurrencyType
  kdv?: number;              // KDV
  dateChange?: string;       // date_change raw
  dateAdd?: string;          // date_add raw
  anaUrunKodu?: string;      // ana_urun_kodu (parent product code if set)
  // USD prices
  price4?: number;           // base price
  trendyolPrice?: number;    // trendyol_salePrice
  hbPrice?: number;          // hb_price
  amazonPrice?: number;      // amazon_price
  pazaramaPrice?: number;    // pazarama_salePrice
  idefixPrice?: number;      // idefix_sale_price
  bayiPrice?: number;        // bayi
  koctasPrice?: number;      // koctas
  teknosaPrice?: number;     // teknosa_sale_price
  temuPrice?: number;        // temu_sale_price
  // Images
  resim1?: string;
  resim2?: string;
  resim3?: string;
  resim4?: string;
  resim5?: string;
};

export type SyncResult = {
  recordsFound: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
  errorMessage?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract text content between XML tags, stripping CDATA wrappers. */
function getTag(inner: string, tagName: string): string | undefined {
  // Match both CDATA and plain content
  const pattern = new RegExp(
    `<${tagName}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*?))<\\/${tagName}>`,
    "i",
  );
  const m = inner.match(pattern);
  if (!m) return undefined;
  const val = (m[1] ?? m[2] ?? "").trim();
  return val.length > 0 ? val : undefined;
}

/** Parse a decimal number from a string (handles comma-decimal). Returns undefined if invalid or ≤ 0. */
function parsePositiveDecimal(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Parse a non-negative integer. Returns undefined if invalid. */
function parseNonNegInt(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Returns undefined if string is `[parent_product_code]` or empty. */
function sanitizeAnaUrunKodu(s: string | undefined): string | undefined {
  if (!s) return undefined;
  if (s === "[parent_product_code]") return undefined;
  return s;
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export function parseXmlFeed(xmlText: string): XmlProductRecord[] {
  const records: XmlProductRecord[] = [];

  // Match <Urun>...</Urun> blocks (case-sensitive; Entegra uses capital U)
  // Also fall back to generic Product/Item/Row for other feed formats
  const productPattern =
    /<(?:Urun|Product|Item|Row|urun|product|item|row)\b([^>]*)>([\s\S]*?)<\/(?:Urun|Product|Item|Row|urun|product|item|row)>/gi;

  let match: RegExpExecArray | null;
  while ((match = productPattern.exec(xmlText)) !== null) {
    const inner = match[2];

    // Primary identifier — required
    const rawSku =
      getTag(inner, "urun_kodu") ??
      getTag(inner, "SKU") ??
      getTag(inner, "Sku") ??
      getTag(inner, "sku") ??
      getTag(inner, "StockCode") ??
      getTag(inner, "ProductCode");

    if (!rawSku) continue; // can't match without identifier

    const sku = rawSku.toUpperCase().trim();
    if (!sku) continue;

    const anaRaw = sanitizeAnaUrunKodu(getTag(inner, "ana_urun_kodu"));

    records.push({
      sku,
      name:          getTag(inner, "urun_ismi"),
      brand:         getTag(inner, "marka"),
      description:   getTag(inner, "aciklama"),
      stock:         parseNonNegInt(getTag(inner, "urun_stok") ?? getTag(inner, "Stock") ?? getTag(inner, "stock")),
      urunTipi:      getTag(inner, "urun_tipi"),
      currencyType:  getTag(inner, "CurrencyType"),
      kdv:           parsePositiveDecimal(getTag(inner, "KDV")),
      dateChange:    getTag(inner, "date_change"),
      dateAdd:       getTag(inner, "date_add"),
      anaUrunKodu:   anaRaw,
      price4:        parsePositiveDecimal(getTag(inner, "price4")),
      trendyolPrice: parsePositiveDecimal(getTag(inner, "trendyol_salePrice")),
      hbPrice:       parsePositiveDecimal(getTag(inner, "hb_price")),
      amazonPrice:   parsePositiveDecimal(getTag(inner, "amazon_price")),
      pazaramaPrice: parsePositiveDecimal(getTag(inner, "pazarama_salePrice")),
      idefixPrice:   parsePositiveDecimal(getTag(inner, "idefix_sale_price")),
      bayiPrice:     parsePositiveDecimal(getTag(inner, "bayi")),
      koctasPrice:   parsePositiveDecimal(getTag(inner, "koctas")),
      teknosaPrice:  parsePositiveDecimal(getTag(inner, "teknosa_sale_price")),
      temuPrice:     parsePositiveDecimal(getTag(inner, "temu_sale_price")),
      resim1:        getTag(inner, "resim1"),
      resim2:        getTag(inner, "resim2"),
      resim3:        getTag(inner, "resim3"),
      resim4:        getTag(inner, "resim4"),
      resim5:        getTag(inner, "resim5"),
    });
  }

  return records;
}
