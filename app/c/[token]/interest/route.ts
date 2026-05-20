/**
 * Faz 4 — POST /c/[token]/interest
 *
 * Müşteri public katalog içinde "İlgilendim" butonuna basınca çağrılır.
 * - CatalogProductInterest event kaydı
 * - Ana ProductInterest oluştur (yoksa)
 * - Sales rep'e 24h sonra takip görevi (sadece bir kere)
 */

import { NextResponse } from "next/server";

import { getShareByToken, recordCatalogInterest } from "@/services/catalog-share-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_ACTIONS = new Set(["INTERESTED", "ADD_TO_CART", "VIEWED_LONG"]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const share = await getShareByToken(token);
  if (!share) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (share.expiresAt < new Date()) {
    return NextResponse.json({ error: "Expired" }, { status: 410 });
  }

  const body = await request.json().catch(() => null);
  const productId = body && typeof body.productId === "string" ? body.productId : null;
  const action =
    body && typeof body.action === "string" && VALID_ACTIONS.has(body.action)
      ? body.action
      : "INTERESTED";

  if (!productId) return NextResponse.json({ error: "Missing productId" }, { status: 400 });

  await recordCatalogInterest(share.id, productId, action as "INTERESTED" | "ADD_TO_CART" | "VIEWED_LONG");

  return NextResponse.json({ ok: true });
}
