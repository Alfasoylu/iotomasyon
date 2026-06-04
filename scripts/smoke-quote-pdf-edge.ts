/**
 * Faz 3 edge case smoke:
 *   - Uzun teklif (15 kalem → multi-page kontrol)
 *   - Ön söz yok (cover'da ÖN SÖZ kartı görünmemeli)
 *   - BOTH currency mode (USD + TRY iki satır)
 *   - Uzun firma adı (truncation kontrol)
 */
import Module from "node:module";
import path from "node:path";
import { writeFile } from "node:fs/promises";

const projectRoot = path.resolve(__dirname, "..");
const noopServerOnly = path.resolve(__dirname, "_server-only-noop.cjs");

const M = Module as unknown as {
  _resolveFilename: (req: string, ...rest: unknown[]) => string;
};
const original = M._resolveFilename;
M._resolveFilename = function (request: string, ...rest: unknown[]) {
  if (request === "server-only") return noopServerOnly;
  if (request.startsWith("@/")) {
    return original.apply(this, [path.join(projectRoot, request.slice(2)), ...rest]);
  }
  return original.apply(this, [request, ...rest]);
};

async function main() {
  const { buildQuotePdf } = await import("../lib/quote-pdf/index");

  // 15 kalem ile multi-page, BOTH currency, uzun firma adı, ön söz YOK
  const items = Array.from({ length: 15 }, (_, i) => {
    const isUsd = i % 3 === 0; // her 3'üncü kalem USD
    const unitPrice = isUsd ? 50 + i * 10 : 1000 + i * 250;
    const qty = 1 + (i % 5);
    const subtotal = unitPrice * qty;
    const tax = subtotal * 0.2;
    return {
      description: `${i % 2 === 0 ? "Detaylı açıklama satırı 1 — ürün özellikleri" : "Kısa not"} — kalem ${i + 1}`,
      quantity: qty,
      unitPrice: unitPrice.toString(),
      discount: "0.00",
      tax: tax.toString(),
      total: (subtotal + tax).toString(),
      currency: isUsd ? "USD" : "TRY",
      product: i === 5 ? null : {
        name: `Test Ürün ${i + 1} — uzun model adı`,
        sku: `SKU-TEST-${1000 + i}`,
      },
    };
  });

  const subtotal = items.reduce((s, it) => s + Number(it.unitPrice) * it.quantity, 0);
  const taxTotal = subtotal * 0.2;
  const total = subtotal + taxTotal;

  const fakeQuote = {
    quoteNumber: "QT-2026-EDGE-CASE-MULTIPAGE",
    status: "SENT",
    createdAt: new Date("2026-05-21T10:00:00Z"),
    validityDate: new Date("2026-07-21T10:00:00Z"),
    notes: null, // ÖN SÖZ yok
    paymentTerms: "%50 sipariş, %50 teslimat. Geçerli vade dolduğunda yeni fiyat geçerlidir ve bu doğrultuda sipariş güncellemesi gerekir.",
    deliveryTerms: "Stoklu ürünlerde 1-3 iş günü içinde sevkiyat. İthal kalemlerde 4-6 hafta tedarik süresi.",
    warrantyTerms: "2 yıl üretici garantisi. Ek 1 yıllık extended garanti opsiyoneldir.",
    subtotal: subtotal.toString(),
    discountTotal: "0.00",
    taxTotal: taxTotal.toString(),
    total: total.toString(),
    currencyMode: "BOTH",          // ← BOTH mode test
    exchangeRate: "34.20",
    customer: {
      name: "Mehmet Ali Yıldız",
      company: "Çok Uzun İsimli Profesyonel Güvenlik Sistemleri ve Çözümleri Anonim Şirketi", // ← truncation
      phone: "+90 543 555 44 33",
      email: "mehmetali.yildiz@cokuzunisimliprofesyonel.com.tr",
    },
    items,
  };

  console.log("Building EDGE CASE PDF: 15 items, BOTH currency, no notes, long names...");
  const t0 = Date.now();
  const bytes = await buildQuotePdf({ quote: fakeQuote as Parameters<typeof buildQuotePdf>[0]["quote"] });
  const ms = Date.now() - t0;
  await writeFile("test-quote-faz3-edge.pdf", bytes);
  console.log(`PDF generated in ${ms}ms · ${(bytes.length / 1024).toFixed(1)} KB → test-quote-faz3-edge.pdf`);
  console.log(`Sayfa sayısı tahmini: ~${Math.ceil(15 / 9) + 1} (cover + content)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
