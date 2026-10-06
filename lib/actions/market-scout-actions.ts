"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkPermission, requireUser } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prismaDb, ensureSeller, idemKey, createOpportunity, insertGeneratedQueries, transitionOpportunity } from "@/lib/market/store";
import { recordManualCapture, recordManualSourcing } from "@/lib/market/providers/manual";
import { fetchSellerDirectory, resolveSeller } from "@/lib/market/providers/trendyol-sitemap";
import { fitInputsFor } from "@/lib/market/hunter";
import { categoryFit, CATEGORY_FIT_VERSION, OPPORTUNITY_STATES, OPPORTUNITY_VERSION, type OpportunityState } from "@/lib/market/scoring";
import { generateSourcingQueries } from "@/lib/market/sourcing-query";
import { MOMENTUM_VERSION } from "@/lib/market/momentum";

// Market Scout server actions — human-initiated only (MARKET_SCOUT_WRITE). They write ONLY market_* tables: never PurchaseOrder,
// cfo_order_line, ImportDecisionSnapshot, cfo_urun_karar, cfo_product_candidate, urun_aday, Product or Forecast V2 state.
const PATH = "/admin/market-scout";
async function writer() {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.MARKET_SCOUT_WRITE))) redirect(`${PATH}?err=forbidden`);
  return user;
}
const done = (tab: string, q: string): never => { revalidatePath(PATH); redirect(`${PATH}?tab=${tab}&${q}`); };
const f = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" ? v : null; };
const errCode = (e: unknown) => e instanceof z.ZodError ? "invalid_input" : e instanceof Error && /^[a-z_:>-]{3,80}$/i.test(e.message) ? e.message : "failed";

export async function addWatchlistAction(fd: FormData) {
  const user = await writer();
  const db = prismaDb(prisma);
  let resolved;
  try {
    const name = z.string().trim().min(2).max(200).parse(f(fd, "sellerName"));
    const url = z.union([z.string().trim().max(600), z.null()]).parse(f(fd, "sellerUrl")) || null;
    const brands = (f(fd, "brandSlugs") ?? "").split(",").map(s => s.trim().toLowerCase()).filter(s => /^[a-z0-9-]{2,100}$/.test(s)).slice(0, 20);
    const priority = z.coerce.number().int().min(1).max(5).catch(3).parse(f(fd, "priority") ?? 3);
    let directory = null, etag: string | null = null;
    try { const d = await fetchSellerDirectory(); directory = d.sellers; etag = d.etag; } catch { /* sitemap unavailable → URL parse / UNRESOLVED */ }
    resolved = resolveSeller({ name, url }, directory, etag);
    let sellerId: string | null = null;
    if (resolved.sellerId) {
      sellerId = await ensureSeller(db, { provider: "TRENDYOL", externalId: resolved.sellerId, slug: resolved.sellerSlug, url: resolved.sellerUrl,
        source: resolved.resolution === "SITEMAP" ? "TRENDYOL_SITEMAP" : "MANUAL_BROWSER_CAPTURE" });
      await db.query(`insert into public.market_seller_observation (seller_id, source, observed_at, seller_name, slug, url, data_grade, evidence, idempotency_key)
        values ($1,$2,now(),$3,$4,$5,$6,$7::jsonb,$8) on conflict (idempotency_key) do nothing`, [sellerId,
        resolved.resolution === "SITEMAP" ? "TRENDYOL_SITEMAP" : "MANUAL_BROWSER_CAPTURE", name, resolved.sellerSlug, resolved.sellerUrl,
        resolved.resolution === "SITEMAP" ? "A" : "B", JSON.stringify(resolved.evidence), idemKey("seller-obs", resolved.sellerId, etag ?? url ?? name)]);
    }
    await db.query(`insert into public.market_watchlist (provider, seller_name, seller_url, seller_slug, seller_external_id, seller_id, resolution, resolution_evidence,
        declared_brand_slugs, priority, notes, added_by) values ('TRENDYOL',$1,$2,$3,$4,$5,$6,$7::jsonb,$8::text[],$9,$10,$11)`,
      [name, resolved.sellerUrl ?? url, resolved.sellerSlug, resolved.sellerId, sellerId, resolved.resolution,
        JSON.stringify({ ...resolved.evidence, candidates: resolved.candidates }), brands, priority, (f(fd, "notes") ?? "").slice(0, 1000) || null, user.email]);
  } catch (e) { done("watchlist", `err=${errCode(e)}`); }
  done("watchlist", `ok=watchlist_${resolved?.resolution ?? "UNRESOLVED"}`);
}

export async function setWatchlistActiveAction(fd: FormData) {
  await writer();
  const id = z.string().uuid().parse(f(fd, "id")), active = f(fd, "active") === "true";
  await prisma.$executeRawUnsafe(`update public.market_watchlist set active = $2, updated_at = now() where id = $1::uuid`, id, active);
  done("watchlist", "ok=watchlist_updated");
}

export async function manualCaptureAction(fd: FormData) {
  const user = await writer();
  let r;
  try {
    r = await recordManualCapture(prismaDb(prisma), Object.fromEntries(["productUrl", "sellerName", "sellerUrl", "title", "price", "currency", "rating",
      "reviewCount", "publicSalesSignal", "badge", "ranking", "availability", "imageUrl", "notes", "observedAt"].map(k => [k, f(fd, k)])) as never, user.email);
  } catch (e) { done("observations", `err=${errCode(e)}`); }
  done("observations", `ok=${r!.inserted ? "capture_saved" : "capture_duplicate"}`);
}

export async function manualSourcingAction(fd: FormData) {
  const user = await writer();
  try {
    await recordManualSourcing(prismaDb(prisma), Object.fromEntries(["sourceUrl", "supplierName", "supplierLocation", "title", "displayedPriceMin", "displayedPriceMax",
      "currency", "moq", "material", "dimensions", "imageUrl", "notes", "opportunityId", "observedAt"].map(k => [k, f(fd, k)])) as never, user.email);
  } catch (e) { done("sourcing", `err=${errCode(e)}`); }
  done("sourcing", "ok=sourcing_saved");
}

/** Human creates an opportunity from a captured observation; fit inputs are computed deterministically as of now and stored with versions. */
export async function createOpportunityAction(fd: FormData) {
  const user = await writer();
  const db = prismaDb(prisma);
  let id: string | null = null;
  try {
    const observationId = z.string().uuid().parse(f(fd, "observationId"));
    const o = (await db.query<{ product_id: string; observed_at: string; raw_title: string | null }>(`select product_id, observed_at::text, raw_title
      from public.market_product_observation where id = $1`, [observationId])).rows[0];
    if (!o) throw new Error("observation_not_found");
    const asOf = new Date().toISOString();
    const live = await fitInputsFor(db, o.product_id, asOf);
    const fit = categoryFit(live.inputs);
    id = await createOpportunity(db, { title: (f(fd, "title") || o.raw_title || live.title || "Untitled").slice(0, 300), firstObservedAt: o.observed_at,
      scoringVersion: `${CATEGORY_FIT_VERSION}+${MOMENTUM_VERSION}+${OPPORTUNITY_VERSION}`, evidenceSnapshotIds: [observationId],
      categoryFit: { ...fit, inputs: live.inputs, evidence: live.evidence, asOf }, momentum: live.momentum, createdBy: user.email });
    const queries = generateSourcingQueries(o.raw_title || live.title || "");
    if (queries.length) await insertGeneratedQueries(db, "OPPORTUNITY", id, queries);
  } catch (e) { done("hunter", `err=${errCode(e)}`); }
  done("hunter", "ok=opportunity_created");
}

export async function transitionOpportunityAction(fd: FormData) {
  const user = await writer();
  try {
    const id = z.string().uuid().parse(f(fd, "id"));
    const to = z.enum(OPPORTUNITY_STATES).parse(f(fd, "to")) as OpportunityState;
    const reason = z.string().trim().min(2).max(1000).parse(f(fd, "reason"));
    const verified = (await prisma.$queryRawUnsafe<{ n: number }[]>(`select count(*)::int as n from public.market_sourcing_candidate where opportunity_id = $1::uuid
      and landed_cost_status = 'VERIFIED'`, id))[0].n > 0;
    await transitionOpportunity(prismaDb(prisma), id, to, user.email, reason, verified);
  } catch (e) { done("hunter", `err=${errCode(e)}`); }
  done("hunter", "ok=state_changed");
}
