/**
 * /api/command-palette — ⌘K global search endpoint
 *
 * Aranan kaynaklar (paralelde):
 *   - Müşteriler (ad, şirket, telefon, e-posta, vergi no)
 *   - Teklifler (quoteNumber, müşteri adı)
 *   - Ürünler (ad, sku, barcode)
 *
 * Sonuç: max 5 per kaynak, 15 toplam.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface CommandResult {
  id: string;
  resource: "customer" | "quote" | "product";
  title: string;
  subtitle: string | null;
  href: string;
  metaHint: string | null;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentSession();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ results: [] as CommandResult[] });
  }

  const limit = 5;

  const [customers, quotes, products] = await Promise.all([
    prisma.customer.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { company: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
          { whatsapp: { contains: q } },
          { email: { contains: q, mode: "insensitive" } },
          { taxNumber: { contains: q } },
          { city: { contains: q, mode: "insensitive" } },
        ],
        isActive: true,
      },
      select: { id: true, name: true, company: true, city: true, phone: true },
      take: limit,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.quote.findMany({
      where: {
        OR: [
          { quoteNumber: { contains: q, mode: "insensitive" } },
          { customer: { name: { contains: q, mode: "insensitive" } } },
        ],
      },
      select: {
        id: true,
        quoteNumber: true,
        status: true,
        total: true,
        currencyMode: true,
        customer: { select: { name: true } },
      },
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.product.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { sku: { contains: q, mode: "insensitive" } },
          { barcode: { contains: q } },
        ],
      },
      select: { id: true, name: true, sku: true, brand: true, stockQuantity: true },
      take: limit,
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const results: CommandResult[] = [
    ...customers.map((c) => ({
      id: `customer-${c.id}`,
      resource: "customer" as const,
      title: c.name,
      subtitle: c.company,
      href: `/customers/${c.id}`,
      metaHint: [c.city, c.phone].filter(Boolean).join(" · ") || null,
    })),
    ...quotes.map((q) => ({
      id: `quote-${q.id}`,
      resource: "quote" as const,
      title: q.quoteNumber,
      subtitle: q.customer.name,
      href: `/quotes/${q.id}`,
      metaHint: `${q.status} · ${Number(q.total).toLocaleString("tr-TR")} ${q.currencyMode ?? "TRY"}`,
    })),
    ...products.map((p) => ({
      id: `product-${p.id}`,
      resource: "product" as const,
      title: p.name,
      subtitle: [p.brand, p.sku].filter(Boolean).join(" · ") || null,
      href: `/products/${p.id}`,
      metaHint: `Stok: ${p.stockQuantity}`,
    })),
  ];

  return NextResponse.json({ results });
}
