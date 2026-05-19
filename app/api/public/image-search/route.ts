/**
 * Public Image Search API — Görselle Ürün Arama (Phase 91)
 *
 * POST /api/public/image-search
 * Content-Type: multipart/form-data
 * Body field "image" : File (jpeg/png/webp, max 4MB)
 *
 * İş akışı:
 *   1. multipart body'den image binary çıkar
 *   2. Hugging Face CLIP → 512-dim embedding
 *   3. pgvector cosine distance ile top 20 ürün
 *   4. Sadece public alanlar dön (id, name, sku, barcode, stock*, imageUrl,
 *      similarity)
 *
 * Yetki: yok (public, /api/public/lookup ile aynı pattern).
 * Rate-limit: 10 req/dk/IP (best-effort in-memory).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { embedImage, toVectorLiteral, HfEmbedError } from "@/lib/hf-clip";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // pgvector + Buffer için
export const maxDuration = 60;   // HF cold-start için 60s'e kadar tolere et

// ── Basit in-memory IP rate-limit ────────────────────────────────────────────
// Serverless cold-start'ta sıfırlanır; büyük abuse'ı yavaşlatır ama
// kararlı bir kota değil. Asıl koruma HF'in 1000/gün limiti.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const rateMap = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || entry.resetAt < now) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (entry.count >= RATE_LIMIT_MAX) return true;
  entry.count++;
  return false;
}

// ── Allowed MIME types ───────────────────────────────────────────────────────
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB

// ── Result row ───────────────────────────────────────────────────────────────
type ImageSearchRow = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  stockQuantity: number;
  minimumStock: number;
  imageUrl: string | null;
  similarity: number;
};

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Çok fazla istek — bir dakika bekleyin." },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }

  // ── Parse multipart ────────────────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Geçersiz form." }, { status: 400 });
  }
  const image = formData.get("image");
  if (!(image instanceof Blob)) {
    return NextResponse.json({ error: "image alanı gerekli." }, { status: 400 });
  }
  if (image.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Görsel çok büyük (en fazla 4 MB)." },
      { status: 413 },
    );
  }
  const contentType = (image.type || "image/jpeg").toLowerCase();
  if (!ALLOWED_TYPES.has(contentType)) {
    return NextResponse.json(
      { error: "Sadece JPEG, PNG veya WebP destekleniyor." },
      { status: 415 },
    );
  }

  // ── Embed via HF ───────────────────────────────────────────────────────────
  let embedding: number[];
  try {
    const buffer = Buffer.from(await image.arrayBuffer());
    embedding = await embedImage(buffer, contentType);
  } catch (err) {
    if (err instanceof HfEmbedError) {
      if (err.status === 429 || err.status === 503) {
        return NextResponse.json(
          { error: "Görsel servisi şu anda meşgul — biraz sonra tekrar deneyin." },
          { status: 503 },
        );
      }
      if (err.status === 0) {
        return NextResponse.json(
          { error: "Görsel servisi yapılandırılmamış." },
          { status: 500 },
        );
      }
    }
    const msg = err instanceof Error ? err.message : "Görsel işlenemedi.";
    return NextResponse.json({ error: msg.slice(0, 200) }, { status: 500 });
  }

  // ── Cosine search ──────────────────────────────────────────────────────────
  // pgvector "<=>" → cosine distance (0=identical, 2=opposite).
  // similarity = 1 - distance.
  // En küçük distance'a sahip ilk 20 ProductImage. Aynı ürün birden çok kez
  // görselse en yakını al (DISTINCT ON productId).
  const literal = toVectorLiteral(embedding);

  const rows = await prisma.$queryRaw<
    Array<{
      product_id: string;
      name: string;
      sku: string;
      barcode: string | null;
      stockquantity: number;
      minimumstock: number;
      url: string | null;
      distance: number;
    }>
  >`
    SELECT DISTINCT ON (pi."productId")
      pi."productId" AS product_id,
      p.name        AS name,
      p.sku         AS sku,
      p.barcode     AS barcode,
      p."stockQuantity" AS stockquantity,
      p."minimumStock"  AS minimumstock,
      pi.url        AS url,
      pi.embedding <=> ${literal}::vector AS distance
    FROM "ProductImage" pi
    JOIN "Product" p ON p.id = pi."productId"
    WHERE pi.embedding IS NOT NULL
      AND p."isActive" = true
    ORDER BY pi."productId", pi.embedding <=> ${literal}::vector ASC
    LIMIT 200
  `;

  // En yakın 20'yi (her ürün için en iyi mesafeye göre) işle
  const sorted = rows
    .sort((a, b) => Number(a.distance) - Number(b.distance))
    .slice(0, 20);

  const result: ImageSearchRow[] = sorted.map((r) => ({
    id: r.product_id,
    name: r.name,
    sku: r.sku,
    barcode: r.barcode,
    stockQuantity: r.stockquantity,
    minimumStock: r.minimumstock,
    imageUrl: r.url,
    similarity: 1 - Number(r.distance),
  }));

  return NextResponse.json(
    { products: result },
    { headers: { "Cache-Control": "no-store" } },
  );
}
