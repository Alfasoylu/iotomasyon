/**
 * Faz 5 — Quote PDF performance benchmark + ek edge case'ler.
 *
 * Hedef: P95 < 800ms render süresi.
 *
 * Senaryolar:
 *   1. minimal      — 1 kalem, no notes, single currency, kısa quote no
 *   2. typical      — 5 kalem, notes var, single currency
 *   3. large        — 50 kalem, multi-page (5 sayfa beklenir)
 *   4. both-mode    — 15 kalem, BOTH currency, USD/TRY karışık
 *   5. max-strings  — Çok uzun notes, çok uzun terms, çok uzun firma adı
 *
 * Her senaryo 10 kez render edilir, sonra:
 *   - min / mean / median / P95 / max süre
 *   - PDF boyutu
 *   - Sayfa sayısı
 *
 * Çalıştırma:
 *   npx tsx scripts/benchmark-quote-pdf.ts
 */
import Module from "node:module";
import path from "node:path";

const projectRoot = path.resolve(__dirname, "..");
const noopServerOnly = path.resolve(__dirname, "_server-only-noop.cjs");
const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
const original = M._resolveFilename;
M._resolveFilename = function (request: string, ...rest: unknown[]) {
  if (request === "server-only") return noopServerOnly;
  if (request.startsWith("@/")) {
    return original.apply(this, [path.join(projectRoot, request.slice(2)), ...rest]);
  }
  return original.apply(this, [request, ...rest]);
};

function makeItems(count: number, both = false) {
  return Array.from({ length: count }, (_, i) => {
    const isUsd = both && i % 3 === 0;
    const unitPrice = isUsd ? 50 + i * 7 : 1000 + i * 150;
    const qty = 1 + (i % 5);
    const subtotal = unitPrice * qty;
    const tax = subtotal * 0.2;
    return {
      description:
        i % 2 === 0
          ? "Detaylı açıklama satırı — ürün özellikleri burada"
          : "Kısa not",
      quantity: qty,
      unitPrice: unitPrice.toString(),
      discount: "0.00",
      tax: tax.toString(),
      total: (subtotal + tax).toString(),
      currency: isUsd ? "USD" : "TRY",
      product:
        i === 2
          ? null
          : { name: `Test Ürün ${i + 1}`, sku: `SKU-TEST-${1000 + i}` },
    };
  });
}

function makeQuote(opts: {
  number: string;
  items: ReturnType<typeof makeItems>;
  notes: string | null;
  mode: "TRY" | "USD" | "BOTH";
  customerCompany?: string;
  paymentTerms?: string;
}) {
  const subtotal = opts.items.reduce(
    (s, it) => s + Number(it.unitPrice) * it.quantity,
    0,
  );
  const taxTotal = subtotal * 0.2;
  return {
    quoteNumber: opts.number,
    status: "SENT",
    createdAt: new Date("2026-05-21T10:00:00Z"),
    validityDate: new Date("2026-06-21T10:00:00Z"),
    notes: opts.notes,
    paymentTerms:
      opts.paymentTerms ?? "%50 sipariş, %50 teslimat",
    deliveryTerms: "5-7 iş günü içinde",
    warrantyTerms: "2 yıl üretici garantisi",
    subtotal: subtotal.toString(),
    discountTotal: "0.00",
    taxTotal: taxTotal.toString(),
    total: (subtotal + taxTotal).toString(),
    currencyMode: opts.mode,
    exchangeRate: "34.20",
    customer: {
      name: "Mehmet Yılmaz",
      company: opts.customerCompany ?? "Test Bayi Elektronik Ltd. Şti.",
      phone: "+90 532 123 45 67",
      email: "test@bayifirma.com",
    },
    items: opts.items,
  };
}

const SCENARIOS = [
  {
    name: "minimal",
    desc: "1 kalem, no notes, single TRY",
    quote: makeQuote({
      number: "QT-MIN",
      items: makeItems(1),
      notes: null,
      mode: "TRY" as const,
    }),
  },
  {
    name: "typical",
    desc: "5 kalem, notes var, single TRY",
    quote: makeQuote({
      number: "QT-2026-0142",
      items: makeItems(5),
      notes:
        "Sayın müdürüm, görüşmemiz doğrultusunda hazırladığım bayi teklifimizi inceleyebilirsiniz.",
      mode: "TRY" as const,
    }),
  },
  {
    name: "large",
    desc: "50 kalem, multi-page, single TRY",
    quote: makeQuote({
      number: "QT-BIG-50",
      items: makeItems(50),
      notes: null,
      mode: "TRY" as const,
    }),
  },
  {
    name: "both-mode",
    desc: "15 kalem, BOTH currency, USD/TRY karışık",
    quote: makeQuote({
      number: "QT-BOTH-15",
      items: makeItems(15, true),
      notes: null,
      mode: "BOTH" as const,
    }),
  },
  {
    name: "max-strings",
    desc: "Çok uzun firma adı + max notes + max terms",
    quote: makeQuote({
      number: "QT-LONG-STR",
      items: makeItems(3),
      notes:
        "Sayın müdürüm, müşterimizin uzun bir açıklama yapmasına dair beklediği üzere geniş kapsamlı bir teklif hazırladık. " +
        "Bu teklifin geçerlilik süresi içinde tüm koşulları detaylıca inceleyiniz. " +
        "Ödeme planları konusunda esneklik gösterebiliriz, lütfen sorularınızı doğrudan iletin. " +
        "Stok durumu güncel ve sevkiyat hazırlığı yapılmıştır.",
      mode: "TRY" as const,
      customerCompany:
        "Anadolu Otomasyon ve Endüstriyel Güvenlik Sistemleri Sanayi ve Ticaret Limited Şirketi",
      paymentTerms:
        "%30 sipariş onayında, %30 sevkiyat öncesi havale, kalan %40 teslimat sonrası 30 gün vadeli çek. " +
        "Tüm ödemeler banka transferi ile yapılır, nakit kabul edilmez. Vade dolduğunda yeniden değerlendirme.",
    }),
  },
];

const ITERATIONS = 10;

async function main() {
  const { buildQuotePdf } = await import("../lib/quote-pdf/index");

  // Warm-up: ilk render font load + node JIT için, ölçüme katılmaz
  await buildQuotePdf({ quote: SCENARIOS[0].quote as Parameters<typeof buildQuotePdf>[0]["quote"] });

  console.log(`\nPDF Benchmark — ${ITERATIONS} iteration / senaryo\n`);
  console.log(
    "senaryo".padEnd(14) +
      "açıklama".padEnd(48) +
      "min".padStart(8) +
      "med".padStart(8) +
      "p95".padStart(8) +
      "max".padStart(8) +
      "size".padStart(9),
  );
  console.log("─".repeat(103));

  let allPassed = true;
  const P95_TARGET_MS = 800;

  for (const scenario of SCENARIOS) {
    const times: number[] = [];
    let lastBytes = 0;
    for (let i = 0; i < ITERATIONS; i++) {
      const t0 = Date.now();
      const bytes = await buildQuotePdf({
        quote: scenario.quote as Parameters<typeof buildQuotePdf>[0]["quote"],
      });
      const ms = Date.now() - t0;
      times.push(ms);
      lastBytes = bytes.length;
    }
    times.sort((a, b) => a - b);
    const min = times[0];
    const med = times[Math.floor(times.length / 2)];
    const p95 = times[Math.floor(times.length * 0.95)];
    const max = times[times.length - 1];
    const passes = p95 <= P95_TARGET_MS;
    if (!passes) allPassed = false;

    console.log(
      scenario.name.padEnd(14) +
        scenario.desc.padEnd(48) +
        `${min}ms`.padStart(8) +
        `${med}ms`.padStart(8) +
        `${p95}ms`.padStart(8) +
        `${max}ms`.padStart(8) +
        `${(lastBytes / 1024).toFixed(1)}KB`.padStart(9) +
        (passes ? "" : "  ← P95 > 800ms target"),
    );
  }

  console.log("─".repeat(103));
  console.log(
    `\n${allPassed ? "✓" : "✗"} P95 < ${P95_TARGET_MS}ms target — ${allPassed ? "TÜM SENARYOLAR GEÇTİ" : "Bazı senaryolar hedefin üstünde"}\n`,
  );

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
