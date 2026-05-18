/**
 * Phase 80 — İthalat Alanı Hızlı Düzenleme API
 *
 * PATCH /api/products/[id]/import-fields
 *
 * ADMIN-ONLY endpoint. Updates the five import-economics fields on a product.
 * Non-admin users receive 403. Null values clear the field; omitted keys are
 * not touched (partial update).
 *
 * Body (all optional):
 *   sourceCostRmb       number | null
 *   weightKg            number | null
 *   customsRatePct      number | null
 *   shippingMethodPref  "AIR" | "SEA" | null
 *   importPaymentFeePct number | null
 *
 * Returns: { id, sku, sourceCostRmb, weightKg, customsRatePct, shippingMethodPref, importPaymentFeePct }
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, isOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const VALID_SHIPPING = new Set(["AIR", "SEA", null]);

function parseDecimalField(val: unknown): number | null | undefined {
  if (val === undefined) return undefined; // omitted → don't touch
  if (val === null || val === "") return null; // explicit null → clear
  const n = Number(val);
  if (!isFinite(n) || n < 0) return undefined; // invalid → ignore
  return n;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // ── Security ───────────────────────────────────────────────────────────────
  const user = await getCurrentSession();
  if (!user) {
    return NextResponse.json({ error: "Oturum açılmamış" }, { status: 401 });
  }
  if (user.role !== "ADMIN" && !isOwner(user)) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok" }, { status: 403 });
  }

  const { id } = await params;

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON" }, { status: 400 });
  }

  // Build prisma data — only include keys that were present in the body
  const data: Record<string, unknown> = {};

  const sourceCostRmb = parseDecimalField(body.sourceCostRmb);
  if (sourceCostRmb !== undefined) data.sourceCostRmb = sourceCostRmb;

  const weightKg = parseDecimalField(body.weightKg);
  if (weightKg !== undefined) data.weightKg = weightKg;

  const customsRatePct = parseDecimalField(body.customsRatePct);
  if (customsRatePct !== undefined) data.customsRatePct = customsRatePct;

  const importPaymentFeePct = parseDecimalField(body.importPaymentFeePct);
  if (importPaymentFeePct !== undefined) data.importPaymentFeePct = importPaymentFeePct;

  if ("shippingMethodPref" in body) {
    const s = body.shippingMethodPref;
    if (s === null || s === "") {
      data.shippingMethodPref = null;
    } else if (typeof s === "string" && VALID_SHIPPING.has(s.toUpperCase())) {
      data.shippingMethodPref = s.toUpperCase();
    }
    // invalid value → skip silently
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Güncellenecek alan yok" }, { status: 400 });
  }

  // ── Update ─────────────────────────────────────────────────────────────────
  try {
    const updated = await prisma.product.update({
      where: { id },
      data,
      select: {
        id: true,
        sku: true,
        sourceCostRmb: true,
        weightKg: true,
        customsRatePct: true,
        shippingMethodPref: true,
        importPaymentFeePct: true,
      },
    });

    return NextResponse.json({
      id: updated.id,
      sku: updated.sku,
      sourceCostRmb: updated.sourceCostRmb != null ? Number(updated.sourceCostRmb) : null,
      weightKg: updated.weightKg != null ? Number(updated.weightKg) : null,
      customsRatePct: updated.customsRatePct != null ? Number(updated.customsRatePct) : null,
      shippingMethodPref: updated.shippingMethodPref,
      importPaymentFeePct: updated.importPaymentFeePct != null ? Number(updated.importPaymentFeePct) : null,
    });
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2025"
    ) {
      return NextResponse.json({ error: "Ürün bulunamadı" }, { status: 404 });
    }
    console.error("[import-fields PATCH]", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
