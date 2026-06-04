/**
 * Faz 2 smoke test: PDF üretimi gerçekten çalışıyor mu?
 *
 * server-only ve @/... import'larını çözmek için CommonJS resolver override
 * en başta uygulanır, ardından dinamik require ile generator çağrılır.
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
    const absolute = path.join(projectRoot, request.slice(2));
    return original.apply(this, [absolute, ...rest]);
  }
  return original.apply(this, [request, ...rest]);
};

async function main() {
  // Dinamik require — override aktif olduktan sonra modülü çöz
  const { buildQuotePdf } = await import("../lib/quote-pdf/index");

  const fakeQuote = {
    quoteNumber: "QT-2026-TEST",
    status: "DRAFT",
    createdAt: new Date("2026-05-21T10:00:00Z"),
    validityDate: new Date("2026-06-21T10:00:00Z"),
    notes:
      "Bu bir smoke test teklifidir. Yeni Geist Sans + Mono tipografi ve neutral palet doğrulanıyor.",
    paymentTerms: "%50 sipariş, %50 teslimat",
    deliveryTerms: "5-7 iş günü içinde, ücretsiz kargo",
    warrantyTerms: "2 yıl üretici garantisi",
    // Subtotal: 24500 + 29500 + 5000 + 7600 + 8400 = 75000
    // KDV: 4900 + 5900 + 1000 + 1520 + 1680 = 15000 (subtotal'ın %20'si)
    // Total: 75000 + 15000 = 90000
    subtotal: "75000.00",
    discountTotal: "0.00",
    taxTotal: "15000.00",
    total: "90000.00",
    currencyMode: "TRY",
    exchangeRate: "34.20",
    customer: {
      name: "Ahmet Yılmaz",
      company: "Test Bayi Elektronik Ltd. Şti.",
      phone: "+90 532 123 45 67",
      email: "ahmet@testbayi.com",
    },
    // KDV hesap kuralı: tax = quantity × unitPrice × 0.20 (subtotal'ın %20'si)
    // Bu sayede getStoredTaxRateDisplay doğru "%20" dönsün
    items: [
      {
        description:
          "8 kanal AHD kayıt cihazı, 4MP destekli, 2TB HDD dahil. Sertifikalı kurulum kılavuzu eklenmiştir.",
        quantity: 10,
        unitPrice: "2450.00",
        discount: "0.00",
        tax: "4900.00",        // 10 × 2450 × 0.20 = 4900
        total: "29400.00",     // 24500 + 4900 = 29400
        currency: "TRY",
        product: { name: "AHD HD 4K 2MP Set", sku: "AHD-2MP-4K" },
      },
      {
        description: "4MP IP bullet kamera, IR 30m gece görüşü, IP67 dış mekan, PoE",
        quantity: 25,
        unitPrice: "1180.00",
        discount: "0.00",
        tax: "5900.00",        // 25 × 1180 × 0.20 = 5900
        total: "35400.00",
        currency: "TRY",
        product: { name: "Hikvision DS-2CD1043G2-LIUF", sku: "HIK-1043G2" },
      },
      {
        description: "Manuel kalem — kurulum & test hizmeti, 3 gün on-site mühendis",
        quantity: 1,
        unitPrice: "5000.00",
        discount: "0.00",
        tax: "1000.00",
        total: "6000.00",
        currency: "TRY",
        product: null,
      },
      {
        description: "16 port PoE switch, gigabit, fanless, 5 yıl garanti",
        quantity: 2,
        unitPrice: "3800.00",
        discount: "0.00",
        tax: "1520.00",        // 2 × 3800 × 0.20 = 1520
        total: "9120.00",
        currency: "TRY",
        product: { name: "MikroTik CSS610-16P-2S+IN", sku: "MT-CSS610" },
      },
      {
        description: "8TB Surveillance HDD",
        quantity: 4,
        unitPrice: "2100.00",
        discount: "0.00",
        tax: "1680.00",        // 4 × 2100 × 0.20 = 1680
        total: "10080.00",
        currency: "TRY",
        product: { name: "WD Purple 8TB", sku: "WD-PURPLE-8TB" },
      },
    ],
  };

  console.log("Building test PDF with Faz 2 typography + colors...");
  const t0 = Date.now();
  const bytes = await buildQuotePdf({ quote: fakeQuote as Parameters<typeof buildQuotePdf>[0]["quote"] });
  const ms = Date.now() - t0;
  await writeFile("test-quote-faz2.pdf", bytes);
  console.log(`PDF generated in ${ms}ms · ${(bytes.length / 1024).toFixed(1)} KB → test-quote-faz2.pdf`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
