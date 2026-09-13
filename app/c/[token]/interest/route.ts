/**
 * Faz 4 — POST /c/[token]/interest
 *
 * Müşteri public katalog içinde "İlgilendim" butonuna basınca çağrılır.
 * - CatalogProductInterest event kaydı
 * - Ana ProductInterest oluştur (yoksa)
 * - Sales rep'e 24h sonra takip görevi (sadece bir kere)
 *
 * Güvenlik (public, auth yok):
 * - IP başına basit bellek içi hız sınırı (10 dakikada 30 istek) → 429
 * - productId boş olamaz; ürün var olmalı VE paylaşılan kataloğun kapsamında
 *   olmalı (service tarafında doğrulanır) → aksi halde 404
 */

import { NextResponse } from "next/server";

import { getShareByToken, recordCatalogInterest } from "@/services/catalog-share-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_ACTIONS = new Set(["INTERESTED", "ADD_TO_CART", "VIEWED_LONG"]);

// ── Basit in-memory IP rate-limit (sabit pencere) ────────────────────────────
// lib/login-rate-limit.ts ile aynı desen. Serverless örnekleri arasında
// paylaşılmaz; büyük abuse'ı yavaşlatır, kesin kota değildir.
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 30;
const RATE_MAX_ENTRIES = 10_000; // bellek tavanı — aşılırsa en eski kayıt atılır

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/** Sınır aşıldıysa kalan bekleme süresini (saniye) döner; aksi halde null. */
function checkRateLimit(ip: string): number | null {
  const now = Date.now();
  const current = buckets.get(ip);

  if (!current || current.resetAt <= now) {
    if (buckets.size >= RATE_MAX_ENTRIES) {
      const oldest = buckets.keys().next().value;
      if (oldest !== undefined) buckets.delete(oldest);
    }
    buckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return null;
  }

  if (current.count >= RATE_MAX) {
    return Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  }
  current.count += 1;
  return null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const retryAfter = checkRateLimit(getClientIp(request));
  if (retryAfter !== null) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const { token } = await params;
  const share = await getShareByToken(token);
  if (!share) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (share.expiresAt < new Date()) {
    return NextResponse.json({ error: "Expired" }, { status: 410 });
  }

  const body = await request.json().catch(() => null);
  const productId =
    body && typeof body.productId === "string" && body.productId.trim().length > 0
      ? body.productId.trim()
      : null;
  const action =
    body && typeof body.action === "string" && VALID_ACTIONS.has(body.action)
      ? body.action
      : "INTERESTED";

  if (!productId) return NextResponse.json({ error: "Missing productId" }, { status: 400 });

  const result = await recordCatalogInterest(
    share.id,
    productId,
    action as "INTERESTED" | "ADD_TO_CART" | "VIEWED_LONG",
  );

  if (!result.created) {
    // Ürün yok ya da bu kataloğun kapsamında değil — ayrım yapmadan 404.
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
