/**
 * Public Lookup API — Depo Arama (no-auth)
 *
 * GET /api/public/lookup?q=<query>
 *
 * Anonim erişime açıktır. iotomasyon.com kök sayfasındaki depo arama
 * ekranı tarafından çağrılır. Sadece foto + ad + SKU + barkod + stok adeti
 * döner — fiyat/maliyet/supplier/notes asla response'da bulunmaz.
 *
 * Yetki: yok (kullanıcı public).
 * Cache: no-store (stok adetleri canlı olmalı).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ products: [] }, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      OR: [
        { name:    { contains: q, mode: "insensitive" } },
        { sku:     { contains: q, mode: "insensitive" } },
        { barcode: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      sku: true,
      barcode: true,
      stockQuantity: true,
      minimumStock: true,
      imageUrl: true,
      images: { take: 1, orderBy: { sortOrder: "asc" }, select: { url: true } },
    },
    orderBy: { name: "asc" },
    take: 20,
  });

  const result = products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    barcode: p.barcode,
    stockQuantity: p.stockQuantity,
    minimumStock: p.minimumStock,
    imageUrl: p.images[0]?.url ?? p.imageUrl ?? null,
  }));

  return NextResponse.json({ products: result }, {
    headers: { "Cache-Control": "no-store" },
  });
}
