/**
 * MarketplaceSalesRecord'dan tekrar alan ticari müşterileri (Vergi No'lu, ≥2 sipariş)
 * Customer tablosuna upsert et + ilgilendikleri ürünleri ProductInterest olarak ekle.
 *
 * Kurallar:
 *   - Vergi No != null (B2C TC Kimlik kayıtları atlanır)
 *   - Aynı Vergi No için en az 2 tekil orderNumber
 *   - Customer.taxNumber ile dedup (zaten varsa upsert, yoksa create)
 *   - Customer.customerType = TOPTAN (default — B2B kabul edilir)
 *   - Customer.source = "Entegra import (2026-05-20)"
 *   - Her customer'ın aldığı tekil productId'ler → ProductInterest (stage=ORDERED,
 *     status=NEW kapalı, quantity=toplam adet)
 *   - İade-İptal satırları kâr/adet sayımına dahil değil (status filter)
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/extract-commercial-customers.ts          # dry-run
 *   DATABASE_URL=... npx tsx scripts/extract-commercial-customers.ts --apply
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");
const SOURCE_TAG = "Entegra import (2026-05-20)";

interface VergiAgg {
  vergiNo: string;
  vergiDairesi: string | null;
  firma: string | null;
  invoiceName: string | null;
  city: string | null;
  orderNumbers: Set<string>;
  // productId → { qty, lastDate, sampleStatus, sampleChannel }
  products: Map<string, { qty: number; lastDate: Date; sampleStatus: string | null; sampleChannel: string }>;
  totalRevenueTry: number;
  channels: Set<string>;
}

async function main() {
  console.log(`Mode: ${APPLY ? "APPLY (write)" : "DRY-RUN"}\n`);

  console.log("Loading MarketplaceSalesRecord rows with vergiNo...");
  const rows = await prisma.marketplaceSalesRecord.findMany({
    where: { customerVergiNo: { not: null } },
    select: {
      channel: true,
      orderNumber: true,
      orderDate: true,
      status: true,
      productId: true,
      quantity: true,
      totalAmountTry: true,
      customerVergiNo: true,
      customerVergiDairesi: true,
      customerFirma: true,
      customerInvoiceName: true,
      customerCity: true,
    },
  });
  console.log(`  Rows with vergiNo: ${rows.length.toLocaleString("tr-TR")}\n`);

  // Aggregate by vergiNo
  const agg = new Map<string, VergiAgg>();
  for (const r of rows) {
    const vn = (r.customerVergiNo ?? "").trim();
    if (!vn) continue;
    let a = agg.get(vn);
    if (!a) {
      a = {
        vergiNo: vn,
        vergiDairesi: r.customerVergiDairesi,
        firma: r.customerFirma,
        invoiceName: r.customerInvoiceName,
        city: r.customerCity,
        orderNumbers: new Set(),
        products: new Map(),
        totalRevenueTry: 0,
        channels: new Set(),
      };
      agg.set(vn, a);
    }
    a.orderNumbers.add(r.orderNumber);
    a.channels.add(r.channel);
    if (r.totalAmountTry) a.totalRevenueTry += Number(r.totalAmountTry);

    // İade-İptal hariç ürün ilgileri toplanır
    const status = (r.status ?? "").toLowerCase();
    const isCancelled = status.includes("iptal") || status.includes("iade");
    if (!isCancelled && r.productId) {
      const ex = a.products.get(r.productId);
      if (ex) {
        ex.qty += r.quantity;
        if (r.orderDate > ex.lastDate) ex.lastDate = r.orderDate;
      } else {
        a.products.set(r.productId, {
          qty: r.quantity,
          lastDate: r.orderDate,
          sampleStatus: r.status,
          sampleChannel: r.channel,
        });
      }
    }

    // Best-effort: en güzel firma/şehir adını sakla
    if (!a.firma && r.customerFirma) a.firma = r.customerFirma;
    if (!a.invoiceName && r.customerInvoiceName) a.invoiceName = r.customerInvoiceName;
    if (!a.city && r.customerCity) a.city = r.customerCity;
    if (!a.vergiDairesi && r.customerVergiDairesi) a.vergiDairesi = r.customerVergiDairesi;
  }

  // Filter: en az 2 tekil sipariş
  const repeatCommercial = [...agg.values()].filter((a) => a.orderNumbers.size >= 2);

  console.log(`Toplam vergi no'lu müşteri: ${agg.size}`);
  console.log(`Tekrar alan (≥2 sipariş):  ${repeatCommercial.length}`);
  console.log(`\nTop 5 (sipariş sayısı):`);
  for (const a of [...repeatCommercial].sort((a, b) => b.orderNumbers.size - a.orderNumbers.size).slice(0, 5)) {
    console.log(
      `  ${a.orderNumbers.size.toString().padStart(3)} sipariş · ${a.products.size} farklı ürün · VN ${a.vergiNo.padEnd(12)} · ${a.firma || a.invoiceName}`,
    );
  }

  // Existing Customer index by taxNumber
  console.log("\nLoading existing Customer.taxNumber index...");
  const existing = new Map<string, string>(); // taxNumber → customerId
  const cs = await prisma.customer.findMany({
    where: { taxNumber: { not: null } },
    select: { id: true, taxNumber: true },
  });
  for (const c of cs) if (c.taxNumber) existing.set(c.taxNumber.trim(), c.id);
  console.log(`  Existing Customer with taxNumber: ${existing.size}\n`);

  let willCreate = 0;
  let willUpdate = 0;
  for (const a of repeatCommercial) {
    if (existing.has(a.vergiNo)) willUpdate++;
    else willCreate++;
  }
  console.log(`Will create: ${willCreate}`);
  console.log(`Will update (existing): ${willUpdate}`);

  // Estimated ProductInterest count
  let totalInterests = 0;
  for (const a of repeatCommercial) totalInterests += a.products.size;
  console.log(`Will create ProductInterest rows: ${totalInterests}\n`);

  if (!APPLY) {
    console.log("[DRY-RUN] --apply ile yaz.");
    return;
  }

  // Apply phase
  console.log("Upserting customers + interests...");
  let upserted = 0;
  let interestsCreated = 0;
  let interestsSkipped = 0;

  for (const a of repeatCommercial) {
    const displayName = a.firma || a.invoiceName || `VN ${a.vergiNo}`;
    const truncatedName = displayName.length > 200 ? displayName.slice(0, 200) : displayName;

    let customerId: string;
    const existingId = existing.get(a.vergiNo);
    if (existingId) {
      // Update minimal fields (don't overwrite owner/notes)
      await prisma.customer.update({
        where: { id: existingId },
        data: {
          taxOffice: a.vergiDairesi || undefined,
          company: a.firma || undefined,
          city: a.city || undefined,
          customerType: "TOPTAN",
        },
      });
      customerId = existingId;
    } else {
      const created = await prisma.customer.create({
        data: {
          name: truncatedName,
          company: a.firma,
          city: a.city,
          taxNumber: a.vergiNo,
          taxOffice: a.vergiDairesi,
          status: "WON", // satın almış müşteri
          customerType: "TOPTAN",
          source: SOURCE_TAG,
          platformNotes: `Toplam ${a.orderNumbers.size} sipariş, ${a.products.size} farklı ürün, ${a.channels.size} kanal (${[...a.channels].join(", ")}). Toplam ciro ≈ ${a.totalRevenueTry.toFixed(0)} ₺.`,
        },
      });
      customerId = created.id;
    }
    upserted++;

    // Link MarketplaceSalesRecord rows to this customer
    await prisma.marketplaceSalesRecord.updateMany({
      where: { customerVergiNo: a.vergiNo, customerId: null },
      data: { customerId },
    });

    // ProductInterest for each product
    for (const [productId, info] of a.products) {
      try {
        await prisma.productInterest.create({
          data: {
            customerId,
            productId,
            quantity: info.qty,
            stage: "ORDERED",
            status: "WON",
            source: SOURCE_TAG,
            interestNotes: `${info.qty} adet alındı (son: ${info.lastDate.toISOString().slice(0, 10)}, kanal: ${info.sampleChannel})`,
            lastContactedAt: info.lastDate,
            closedAt: info.lastDate,
          },
        });
        interestsCreated++;
      } catch (e: any) {
        // Customer already has this productId interest — skip
        if (e?.code === "P2002") {
          interestsSkipped++;
        } else {
          console.error(`  Interest create failed for customer=${customerId} product=${productId}:`, e.message);
        }
      }
    }

    if (upserted % 50 === 0) {
      console.log(`  Progress: ${upserted}/${repeatCommercial.length}  interests=${interestsCreated}`);
    }
  }

  console.log(`\nDone.`);
  console.log(`  Customers upserted:   ${upserted}`);
  console.log(`  Interests created:    ${interestsCreated}`);
  console.log(`  Interests skipped:    ${interestsSkipped} (zaten vardı)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
