/**
 * Phase 11 — XML Inventory Sync Engine
 *
 * Parses XML product feeds and returns normalized records for DB update.
 *
 * Supported XML formats (auto-detected):
 *   Format A (element-based):
 *     <Products><Product><SKU>...</SKU><Stock>...</Stock><Price>...</Price></Product></Products>
 *
 *   Format B (attribute-based):
 *     <products><product sku="..." stock="..." price="..." />...</products>
 *
 * Matching strategy (in order):
 *   1. Match by barcode if barcode field present
 *   2. Match by SKU
 *
 * Manual override protection:
 *   - Products with xmlLocked = true are skipped entirely
 *   - Products with stockSource = 'MANUAL' have stock skipped but price updated
 */

export type XmlProductRecord = {
  sku?: string;
  barcode?: string;
  stock?: number;
  price?: number;
  dealerPrice?: number;
};

function extractText(node: Element, ...tags: string[]): string | undefined {
  for (const tag of tags) {
    const el = node.querySelector(tag);
    if (el?.textContent?.trim()) return el.textContent.trim();
  }
  return undefined;
}

function extractAttr(node: Element, ...attrs: string[]): string | undefined {
  for (const attr of attrs) {
    const val = node.getAttribute(attr);
    if (val?.trim()) return val.trim();
  }
  return undefined;
}

function parseNum(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const n = parseFloat(s.replace(",", "."));
  return isFinite(n) && n >= 0 ? n : undefined;
}

export function parseXmlFeed(xmlText: string): XmlProductRecord[] {
  // Use DOMParser-like parsing via regex for edge environment compatibility
  // We parse the XML string directly since DOMParser isn't available in Node
  const records: XmlProductRecord[] = [];

  // Find all product/item elements (case-insensitive tag matching)
  const productPattern = /<(?:Product|Item|Row|product|item|row)\b([^>]*)>([\s\S]*?)<\/(?:Product|Item|Row|product|item|row)>/gi;
  let match;

  while ((match = productPattern.exec(xmlText)) !== null) {
    const attrs = match[1];
    const inner = match[2];

    // Helper: get value from inner XML element
    const getTag = (tagName: string): string | undefined => {
      const pattern = new RegExp(`<${tagName}[^>]*>([^<]*)<\/${tagName}>`, "i");
      const m = inner.match(pattern);
      return m?.[1]?.trim() || undefined;
    };

    // Helper: get attribute value
    const getAttr = (attrName: string): string | undefined => {
      const pattern = new RegExp(`${attrName}=["']([^"']*)["']`, "i");
      const m = attrs.match(pattern);
      return m?.[1]?.trim() || undefined;
    };

    const sku =
      getTag("SKU") || getTag("Sku") || getTag("sku") ||
      getTag("StockCode") || getTag("stockcode") || getTag("ProductCode") ||
      getAttr("sku") || getAttr("SKU") || getAttr("stock_code");

    const barcode =
      getTag("Barcode") || getTag("barcode") || getTag("EAN") || getTag("GTIN") ||
      getAttr("barcode") || getAttr("ean");

    const stockStr =
      getTag("Stock") || getTag("stock") || getTag("Quantity") || getTag("quantity") ||
      getTag("StockQuantity") || getTag("StockCount") ||
      getAttr("stock") || getAttr("quantity");

    const priceStr =
      getTag("Price") || getTag("price") || getTag("ListPrice") || getTag("SalePrice") ||
      getAttr("price") || getAttr("list_price");

    const dealerPriceStr =
      getTag("DealerPrice") || getTag("dealer_price") || getTag("WholesalePrice") ||
      getTag("PartnerPrice") || getTag("BayiiFiyat") ||
      getAttr("dealer_price") || getAttr("wholesale_price");

    if (!sku && !barcode) continue; // can't match without identifier

    records.push({
      sku: sku?.toUpperCase(),
      barcode,
      stock: parseNum(stockStr),
      price: parseNum(priceStr),
      dealerPrice: parseNum(dealerPriceStr),
    });
  }

  return records;
}

export type SyncResult = {
  recordsFound: number;
  recordsUpdated: number;
  recordsSkipped: number;
  errorMessage?: string;
};
