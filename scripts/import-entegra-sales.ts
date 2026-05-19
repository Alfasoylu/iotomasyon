/**
 * Entegra Excel satış log'unu (141k satır) MarketplaceSalesRecord'a yükle.
 *
 * Strateji:
 *   1) Tüm 14 kanalı destekle (TRENDYOL, HEPSIBURADA, N11, IDEASOFT, GG,
 *      PAZARAMA, EPTT, MIRAKL_KOCTAS, IDEFIX, AMAZON, CICEKSEPETI, TEMU,
 *      MIRAKL_TEKNOSA, SHOPPHP, MANUAL)
 *   2) Trendyol için dedup: Excel Platform Ref. No varsa TrendyolSalesRecord.orderId'de,
 *      ATLA (API'den zaten gelmiş, iki kere ekleme).
 *   3) Hepsiburada için dedup: orderNumber HepsiburadaSalesRecord.orderId'de varsa atla.
 *   4) productId eşleştir: Ürün Kodu / Model / Ürün Adı + fiyat similarity.
 *   5) Idempotent: aynı script tekrar çalışırsa unique key (channel, orderNumber,
 *      externalLineId) sayesinde duplicate insert hatası yer.
 *
 * Usage:
 *   DATABASE_URL=... DIRECT_URL=... npx tsx scripts/import-entegra-sales.ts          # dry-run
 *   DATABASE_URL=... DIRECT_URL=... npx tsx scripts/import-entegra-sales.ts --apply
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

const cs = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString: cs! });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");
const EXCEL_PATH = "C:/dev/iotomasyoncom/iotomasyon/ithalat/liste.xlsx";

// ── Türkçe → ASCII (matching için) ──────────────────────────────────────────
const TR_MAP: Record<string, string> = {
  "ş":"s","Ş":"s","ğ":"g","Ğ":"g","ç":"c","Ç":"c",
  "ü":"u","Ü":"u","ö":"o","Ö":"o","ı":"i","İ":"i",
};
function norm(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/[şŞğĞçÇüÜöÖıİ]/g, (c) => TR_MAP[c] ?? c).toLowerCase().trim();
}

// ── Kanal normalize ─────────────────────────────────────────────────────────
const CHANNEL_MAP: Record<string, string> = {
  trendyol: "TRENDYOL",
  hepsiburada: "HEPSIBURADA",
  n11: "N11",
  ideasoft: "IDEASOFT",
  gg: "GG",
  pazarama: "PAZARAMA",
  eptt: "EPTT",
  mirakl_koctas: "MIRAKL_KOCTAS",
  idefix: "IDEFIX",
  amazon: "AMAZON",
  ciceksepeti: "CICEKSEPETI",
  temu: "TEMU",
  mirakl_teknosa: "MIRAKL_TEKNOSA",
  shopphp: "SHOPPHP",
  manual: "MANUAL",
};
function normalizeChannel(raw: string | null): string {
  if (!raw) return "UNKNOWN";
  const key = raw.trim().toLowerCase();
  return CHANNEL_MAP[key] ?? raw.trim().toUpperCase();
}

// ── Tarih parse (M/d/yy formatı: "5/19/26" → 2026-05-19) ────────────────────
function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const [, mo, da, yr] = m;
  const year = yr.length === 2 ? 2000 + parseInt(yr, 10) : parseInt(yr, 10);
  // Eğer yıl gelecekte ise (örn. 26 → 2026) zaten doğru; sadece güvenlik
  if (year < 2018 || year > 2030) return null;
  const d = new Date(Date.UTC(year, parseInt(mo, 10) - 1, parseInt(da, 10)));
  return isNaN(d.getTime()) ? null : d;
}

function parseDecimal(s: string | null): number | null {
  if (!s) return null;
  const n = parseFloat(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function parseInt0(s: string | null): number {
  if (!s) return 0;
  const n = parseInt(String(s), 10);
  return Number.isFinite(n) ? n : 0;
}

interface ExcelRow {
  ID?: string | null;
  "Sipariş Numarası"?: string | null;
  "Platform Ref. No"?: string | null;
  Tarih?: string | null;
  Entegrasyon?: string | null;
  "Durum Adı"?: string | null;
  Firma?: string | null;
  "Fatura Adı"?: string | null;
  "Fatura Şehir"?: string | null;
  "Vergi Dairesi"?: string | null;
  "Vergi No"?: string | null;
  "TC Kimlik"?: string | null;
  "Müşteri Kodu"?: string | null;
  Toplam?: string | null;
  Vergi?: string | null;
  "Genel Toplam"?: string | null;
  "Komisyon Tutarı"?: string | null;
  "Komisyon Oranı"?: string | null;
  PazaryerindenGelenOdemeTutar?: string | null;
  "Ürün Adı"?: string | null;
  store_stock_name?: string | null;
  "Ürün Kodu"?: string | null;
  Model?: string | null;
  "Toplam Miktar"?: string | null;
  "Toplam Desi"?: string | null;
  "Kargo Firması"?: string | null;
  "Kargo Kodu"?: string | null;
}

// ── Product matching ─────────────────────────────────────────────────────────
interface ProductLite {
  id: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  brand: string | null;
  normName: string;
}

function tokenize(s: string): Set<string> {
  return new Set(
    norm(s).split(/[\s\-_./()]+/).filter((t) => t.length >= 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersect = 0;
  for (const x of a) if (b.has(x)) intersect++;
  return intersect / (a.size + b.size - intersect);
}

function matchProduct(
  excel: ExcelRow,
  products: ProductLite[],
  bySku: Map<string, ProductLite>,
  byBarcode: Map<string, ProductLite>,
): string | null {
  const sku = (excel["Ürün Kodu"] ?? "").trim();
  if (sku) {
    const exact = bySku.get(sku.toLowerCase());
    if (exact) return exact.id;
  }
  const model = (excel.Model ?? "").trim();
  if (model) {
    const exact = bySku.get(model.toLowerCase()) ?? byBarcode.get(model.toLowerCase());
    if (exact) return exact.id;
  }
  const productName = (excel.store_stock_name ?? excel["Ürün Adı"] ?? "").trim();
  if (productName.length > 5) {
    const tokens = tokenize(productName);
    if (tokens.size >= 3) {
      let best: { p: ProductLite; score: number } | null = null;
      for (const p of products) {
        const score = jaccard(tokens, tokenize(p.name));
        if (score >= 0.5 && (!best || score > best.score)) {
          best = { p, score };
        }
      }
      if (best) return best.p.id;
    }
  }
  return null;
}

// ── Ana akış ─────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Mode: ${APPLY ? "APPLY (write)" : "DRY-RUN"}`);
  console.log(`Reading Excel: ${EXCEL_PATH}`);
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets["sayfa"];
  const rows = XLSX.utils.sheet_to_json<ExcelRow>(ws, { defval: null, raw: false });
  console.log(`Total rows: ${rows.length.toLocaleString("tr-TR")}\n`);

  // 1) Existing Trendyol orderIds (dedup set)
  console.log("Loading existing Trendyol orderIds for dedup...");
  const existingTrendyolOrders = new Set<string>(
    (await prisma.trendyolSalesRecord.findMany({ select: { orderId: true } })).map((r) => r.orderId),
  );
  console.log(`  Existing Trendyol orderIds: ${existingTrendyolOrders.size}`);

  // 2) Existing Hepsiburada orderIds (currently empty, but defensive)
  const existingHbOrders = new Set<string>(
    (await prisma.hepsiburadaSalesRecord.findMany({ select: { orderId: true } })).map((r) => r.orderId),
  );
  console.log(`  Existing Hepsiburada orderIds: ${existingHbOrders.size}`);

  // 3) Existing MarketplaceSalesRecord keys (idempotency)
  const existingKeys = new Set<string>(
    (
      await prisma.marketplaceSalesRecord.findMany({
        select: { channel: true, orderNumber: true, externalLineId: true },
      })
    ).map((r) => `${r.channel}::${r.orderNumber}::${r.externalLineId ?? ""}`),
  );
  console.log(`  Existing MarketplaceSalesRecord keys: ${existingKeys.size}\n`);

  // 4) Load all active products for matching
  console.log("Loading product index for matching...");
  const productsRaw = await prisma.product.findMany({
    where: { isActive: true },
    select: { id: true, sku: true, barcode: true, name: true, brand: true },
  });
  const products: ProductLite[] = productsRaw.map((p) => ({
    id: p.id,
    sku: p.sku,
    barcode: p.barcode,
    name: p.name,
    brand: p.brand,
    normName: norm(p.name),
  }));
  const bySku = new Map<string, ProductLite>();
  const byBarcode = new Map<string, ProductLite>();
  for (const p of products) {
    if (p.sku) bySku.set(p.sku.toLowerCase(), p);
    if (p.barcode) byBarcode.set(p.barcode.toLowerCase(), p);
  }
  console.log(`  Products loaded: ${products.length}\n`);

  // ── Walk through Excel rows ───────────────────────────────────────────────
  const channelStats = new Map<string, { total: number; skipped: number; matched: number; noProduct: number }>();
  const toInsert: Array<{
    channel: string;
    orderNumber: string;
    platformRef: string | null;
    externalLineId: string | null;
    orderDate: Date;
    status: string | null;
    productName: string | null;
    productCode: string | null;
    modelNumber: string | null;
    storeStockName: string | null;
    productId: string | null;
    quantity: number;
    grossAmountTry: number | null;
    vatAmountTry: number | null;
    totalAmountTry: number | null;
    commissionTry: number | null;
    commissionPct: number | null;
    platformPaymentTry: number | null;
    customerCode: string | null;
    customerFirma: string | null;
    customerInvoiceName: string | null;
    customerVergiNo: string | null;
    customerTcKimlik: string | null;
    customerVergiDairesi: string | null;
    customerCity: string | null;
    cargoCompany: string | null;
    cargoTrackingNo: string | null;
    desiTotal: number | null;
  }> = [];

  let processed = 0;
  for (const r of rows) {
    processed++;
    if (processed % 10_000 === 0) {
      console.log(`  Processed: ${processed.toLocaleString("tr-TR")} / ${rows.length.toLocaleString("tr-TR")}`);
    }
    const channel = normalizeChannel(r.Entegrasyon ?? null);
    const stats = channelStats.get(channel) ?? { total: 0, skipped: 0, matched: 0, noProduct: 0 };
    stats.total++;

    const orderNumber = (r["Sipariş Numarası"] ?? "").trim();
    const platformRef = (r["Platform Ref. No"] ?? "").trim();
    const externalLineId = (r.ID ?? "").trim();
    const orderDate = parseDate(r.Tarih ?? null);

    if (!orderNumber || !orderDate) {
      stats.skipped++;
      channelStats.set(channel, stats);
      continue;
    }

    // Trendyol dedup: orderNumber composite "platformRef-apiOrderId" — match the
    // second part against TrendyolSalesRecord.orderId (API order ID).
    if (channel === "TRENDYOL") {
      const apiOrderId = orderNumber.includes("-") ? orderNumber.split("-").pop() : null;
      if (apiOrderId && existingTrendyolOrders.has(apiOrderId)) {
        stats.skipped++;
        channelStats.set(channel, stats);
        continue;
      }
    }
    // Hepsiburada dedup (existing table empty for now — defensive)
    if (channel === "HEPSIBURADA" && platformRef && existingHbOrders.has(platformRef)) {
      stats.skipped++;
      channelStats.set(channel, stats);
      continue;
    }

    // Idempotency (re-run safety)
    const key = `${channel}::${orderNumber}::${externalLineId}`;
    if (existingKeys.has(key)) {
      stats.skipped++;
      channelStats.set(channel, stats);
      continue;
    }
    existingKeys.add(key);

    // Match product
    const productId = matchProduct(r, products, bySku, byBarcode);
    if (productId) stats.matched++;
    else stats.noProduct++;

    toInsert.push({
      channel,
      orderNumber,
      platformRef: platformRef || null,
      externalLineId: externalLineId || null,
      orderDate,
      status: (r["Durum Adı"] ?? "").trim() || null,
      productName: (r["Ürün Adı"] ?? "").trim() || null,
      productCode: (r["Ürün Kodu"] ?? "").trim() || null,
      modelNumber: (r.Model ?? "").trim() || null,
      storeStockName: (r.store_stock_name ?? "").trim() || null,
      productId,
      quantity: Math.max(1, parseInt0(r["Toplam Miktar"] ?? null)),
      grossAmountTry: parseDecimal(r.Toplam ?? null),
      vatAmountTry: parseDecimal(r.Vergi ?? null),
      totalAmountTry: parseDecimal(r["Genel Toplam"] ?? null),
      commissionTry: parseDecimal(r["Komisyon Tutarı"] ?? null),
      commissionPct: parseDecimal(r["Komisyon Oranı"] ?? null),
      platformPaymentTry: parseDecimal(r.PazaryerindenGelenOdemeTutar ?? null),
      customerCode: (r["Müşteri Kodu"] ?? "").trim() || null,
      customerFirma: (r.Firma ?? "").trim() || null,
      customerInvoiceName: (r["Fatura Adı"] ?? "").trim() || null,
      customerVergiNo: (r["Vergi No"] ?? "").trim() || null,
      customerTcKimlik: (r["TC Kimlik"] ?? "").trim() || null,
      customerVergiDairesi: (r["Vergi Dairesi"] ?? "").trim() || null,
      customerCity: (r["Fatura Şehir"] ?? "").trim() || null,
      cargoCompany: (r["Kargo Firması"] ?? "").trim() || null,
      cargoTrackingNo: (r["Kargo Kodu"] ?? "").trim() || null,
      desiTotal: parseDecimal(r["Toplam Desi"] ?? null),
    });
    channelStats.set(channel, stats);
  }

  console.log(`\n── İmport özeti ──`);
  console.log(`  Will insert: ${toInsert.length.toLocaleString("tr-TR")} record`);
  console.log(`\n  Kanal başına:`);
  for (const [c, s] of [...channelStats.entries()].sort((a, b) => b[1].total - a[1].total)) {
    const inserted = s.total - s.skipped;
    console.log(
      `    ${c.padEnd(20)} total=${s.total.toString().padStart(7)} insert=${inserted.toString().padStart(7)} skip=${s.skipped.toString().padStart(6)} matched=${s.matched.toString().padStart(6)} noProduct=${s.noProduct.toString().padStart(6)}`,
    );
  }

  if (!APPLY) {
    console.log("\n[DRY-RUN] --apply ile yaz.");
    return;
  }

  // Bulk insert (createMany, 500 chunk)
  console.log("\nInserting...");
  let inserted = 0;
  const CHUNK = 500;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK);
    const result = await prisma.marketplaceSalesRecord.createMany({ data: chunk, skipDuplicates: true });
    inserted += result.count;
    if ((i / CHUNK) % 20 === 0) {
      console.log(`  Inserted: ${inserted.toLocaleString("tr-TR")} / ${toInsert.length.toLocaleString("tr-TR")}`);
    }
  }
  console.log(`\nDone. Inserted ${inserted.toLocaleString("tr-TR")} records.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
