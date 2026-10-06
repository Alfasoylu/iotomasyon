import { concepts } from "./normalize";
import { matchProducts } from "./matching";
import { computeMomentum, type Momentum } from "./momentum";
import { adoptionComponent, assessOpportunity, categoryFit, momentumComponent, type CategoryFit, type FitInputs, type OpportunityAssessment,
  type OpportunityState } from "./scoring";
import { observationsAsOf, type Db, type ObservationRow } from "./store";

// Product Hunter: deterministic inputs → Category Fit, momentum, opportunity assessment; top 5–10 non-rejected opportunities.
// Missing data stays missing (UNKNOWN); no field is filled by an LLM.
const TYPE_IDS = ["faucet", "shower", "sink", "basin", "camera"];

export const toMomentumPoints = (rows: ObservationRow[]) => rows.filter(r => r.source !== "TRENDYOL_SITEMAP").map(r => ({ observedAt: r.observed_at, knownAt: r.known_at,
  price: r.price == null ? null : Number(r.price), reviewCount: r.review_count, rating: r.rating == null ? null : Number(r.rating),
  publicSalesSignal: r.public_sales_signal, availability: r.availability }));

/** Fit inputs for a market product as of `asOf` (no look-ahead). */
export async function fitInputsFor(db: Db, marketProductId: string, asOf: string): Promise<{ inputs: FitInputs; momentum: Momentum; title: string | null; evidence: string[] }> {
  const obs = await observationsAsOf(db, marketProductId, asOf);
  const title = [...obs].reverse().find(o => o.raw_title)?.raw_title
    ?? (await db.query<{ title_slug: string | null }>(`select title_slug from public.market_product where id = $1`, [marketProductId])).rows[0]?.title_slug?.replace(/-/g, " ") ?? null;
  const momentum = computeMomentum(toMomentumPoints(obs), asOf);
  const ev: string[] = [];
  const inputs: FitInputs = { market_momentum: momentumComponent(momentum), sourcing_feasibility: null, margin_readiness: null, logistics_compatibility: null };
  const types = title ? [...concepts(title)].filter(c => TYPE_IDS.includes(c)) : [];
  // ALFAS categories / products (current catalogue; category proximity is a structural fact, not a time series)
  const cats = (await db.query<{ name: string; active: number; sold90: number }>(`select c.name, count(p.id)::int as active,
      count(p.id) filter (where exists (select 1 from public.fm_sales_canonical_snapshot s where s.product_id = p.id and s.disposition = 'COUNTED'
        and s.economic_date >= current_date - 90))::int as sold90
    from public."ProductCategory" c join public."Product" p on p."categoryId" = c.id and p."isActive" group by c.name`)).rows;
  if (types.length) {
    const hit = cats.filter(c => [...concepts(c.name)].some(x => types.includes(x)));
    inputs.existing_category_proximity = hit.length ? (hit.some(c => c.sold90 > 0) ? 1 : 0.5) : 0;
    ev.push(hit.length ? `ALFAS category: ${hit.map(c => `${c.name} (${c.active} active, ${c.sold90} sold 90d)`).join("; ")}` : "no ALFAS category with this product type");
    const peers = (await db.query<{ name: string }>(`select name from public."Product" where "isActive" limit 2000`)).rows.filter(p => [...concepts(p.name)].some(x => types.includes(x)));
    if (peers.length) {
      const best = Math.max(...peers.map(p => matchProducts({ title: title! }, { title: p.name }).score));
      inputs.product_similarity = best / 100; ev.push(`best ALFAS title match ${best}/100 among ${peers.length} same-type products`);
    }
  } else ev.push("product type not recognised → category proximity UNKNOWN");
  const watched = (await db.query<{ n: number }>(`select count(*)::int as n from public.market_watchlist where active`)).rows[0].n;
  if (watched > 0 && types.length) {
    const sellers = (await db.query<{ n: number }>(`select count(distinct o.seller_external_id)::int as n from public.market_product_observation o
        join public.market_product mp on mp.id = o.product_id join public.market_watchlist w on w.active and w.seller_external_id = o.seller_external_id
      where o.known_at <= $1::timestamptz and o.observed_at >= $1::timestamptz - interval '60 days' and o.observed_at <= $1::timestamptz
        and o.source = 'MANUAL_BROWSER_CAPTURE' and mp.title_slug ~ $2`, [asOf, types.map(t => ({ faucet: "batarya|musluk|faucet", shower: "dus", sink: "evye|eviye|sink",
        basin: "lavabo|basin", camera: "kamera|camera" } as Record<string, string>)[t]).join("|")])).rows[0].n;
    inputs.competitor_adoption = adoptionComponent(sellers); ev.push(`${sellers} watched sellers captured with this product type in 60 days`);
  } else ev.push("no watchlist data → competitor adoption UNKNOWN");
  return { inputs, momentum, title, evidence: ev };
}

export interface HunterCard { id: string; title: string; state: OpportunityState; fit: CategoryFit; momentum: Momentum | null; assessment: OpportunityAssessment;
  sourcing: { count: number; best: { provider: string; displayedPriceMin: string | null; displayedPriceMax: string | null; currency: string | null; moq: number | null } | null;
    landedCost: "UNKNOWN" | "VERIFIED" }; queries: { language: string; query: string }[]; evidenceSnapshotIds: string[]; scoringVersion: string;
  firstObservedAt: string; legacy: boolean; whyNow: string[] }

/** Top opportunities (non-rejected), recomputed as of `asOf` from stored evidence. */
export async function productHunter(db: Db, asOf: string, limit = 10): Promise<HunterCard[]> {
  const opps = (await db.query<{ id: string; title: string; state: OpportunityState; category_fit: { inputs?: FitInputs } | null; evidence_snapshot_ids: string[];
    scoring_version: string; first_observed_at: string; legacy_ref: unknown }>(`select id, title, state, category_fit, evidence_snapshot_ids, scoring_version,
      first_observed_at::text, legacy_ref from public.market_opportunity where state <> 'REJECTED' and created_at <= $1::timestamptz order by created_at desc limit 200`, [asOf])).rows;
  const cards: HunterCard[] = [];
  for (const o of opps) {
    const products = o.evidence_snapshot_ids.length ? (await db.query<{ product_id: string }>(`select distinct product_id from public.market_product_observation
      where id = any($1::uuid[])`, [o.evidence_snapshot_ids])).rows.map(r => r.product_id) : [];
    const live = products[0] ? await fitInputsFor(db, products[0], asOf) : null;
    const src = (await db.query<{ provider: string; displayed_price_min: string | null; displayed_price_max: string | null; currency: string | null; moq: number | null;
      landed_cost_status: string }>(`select provider, displayed_price_min::text, displayed_price_max::text, currency, moq, landed_cost_status from public.market_sourcing_candidate
      where opportunity_id = $1 and known_at <= $2::timestamptz order by known_at desc`, [o.id, asOf])).rows;
    const inputs: FitInputs = { ...(o.category_fit?.inputs ?? {}), ...(live?.inputs ?? {}), sourcing_feasibility: src.length ? (src.some(s => s.moq != null && s.displayed_price_min != null) ? 1 : 0.5) : null };
    const fit = categoryFit(inputs);
    const landedCostVerified = src.some(s => s.landed_cost_status === "VERIFIED");
    const assessment = assessOpportunity({ state: o.state, fit, momentum: live?.momentum ?? null, sourcingCandidates: src.length, landedCostVerified });
    const queries = (await db.query<{ language: string; query: string }>(`select language, query from public.market_generated_query where subject_kind = 'OPPORTUNITY'
      and subject_id = $1 order by language`, [o.id])).rows;
    const whyNow: string[] = [];
    if (live?.momentum.direction === "RISING") whyNow.push(`momentum RISING (${live.momentum.points} captures, review velocity ${live.momentum.reviewVelocityPer7d?.toFixed(1) ?? "?"}/7d)`);
    if ((inputs.competitor_adoption ?? 0) > 0) whyNow.push("watched sellers carry this product type");
    if (o.legacy_ref) whyNow.push("legacy scout candidate (Amazon BSR, writer UNKNOWN)");
    cards.push({ id: o.id, title: o.title, state: o.state, fit, momentum: live?.momentum ?? null, assessment,
      sourcing: { count: src.length, best: src[0] ? { provider: src[0].provider, displayedPriceMin: src[0].displayed_price_min, displayedPriceMax: src[0].displayed_price_max,
        currency: src[0].currency, moq: src[0].moq } : null, landedCost: landedCostVerified ? "VERIFIED" : "UNKNOWN" },
      queries, evidenceSnapshotIds: o.evidence_snapshot_ids, scoringVersion: o.scoring_version, firstObservedAt: o.first_observed_at, legacy: o.legacy_ref != null, whyNow });
  }
  return cards.sort((a, b) => b.assessment.rankKey - a.assessment.rankKey || a.id.localeCompare(b.id)).slice(0, Math.max(1, Math.min(limit, 10)));
}
