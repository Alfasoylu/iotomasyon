/**
 * Faz 4 — POST /api/catalogs/share
 *
 * Sales rep modal'da "WhatsApp ile Paylaş" deyince çağrılır.
 * CatalogShare token oluşturur ve URL döner.
 */

import { NextResponse } from "next/server";

import { getCurrentSession, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { createCatalogShare } from "@/services/catalog-share-service";
import { CATALOG_PROFILES, GENERAL_PROFILE, type CatalogPriceMode } from "@/lib/catalog-mapping";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRICE_MODES = new Set<CatalogPriceMode>(["wholesale", "retail", "hidden"]);

export async function POST(request: Request) {
  const user = await getCurrentSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await checkPermission(user, PERMISSIONS.CATALOGS_CREATE))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const customerId = String(body.customerId ?? "").trim();
  const profileSlug = String(body.profileSlug ?? "").trim();
  const priceMode = String(body.priceMode ?? "retail").trim() as CatalogPriceMode;
  const onlyStock = body.onlyStock !== false;
  const coverNote = typeof body.coverNote === "string" ? body.coverNote.slice(0, 500) : null;
  const brandFilter = Array.isArray(body.brandFilter)
    ? body.brandFilter.filter((b: unknown): b is string => typeof b === "string" && b.length > 0).slice(0, 50)
    : [];

  if (!customerId || !PRICE_MODES.has(priceMode)) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  // Validate profile exists (or fallback to general)
  if (profileSlug !== GENERAL_PROFILE.slug && !CATALOG_PROFILES[profileSlug]) {
    return NextResponse.json({ error: "Unknown profile" }, { status: 400 });
  }

  // Wholesale permission check
  let effectiveMode = priceMode;
  if (priceMode === "wholesale") {
    const canWholesale = await checkPermission(user, PERMISSIONS.CATALOGS_WHOLESALE_MODE);
    if (!canWholesale) effectiveMode = "retail";
  }

  const { token } = await createCatalogShare({
    customerId,
    sentById: user.id,
    profileSlug,
    priceMode: effectiveMode,
    brandFilter,
    onlyStock,
    coverNote: coverNote && coverNote.trim().length > 0 ? coverNote.trim() : null,
  });

  return NextResponse.json({
    ok: true,
    token,
    url: `/c/${token}`,
  });
}
