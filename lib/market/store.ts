import { createHash } from "node:crypto";
import { SOURCE_GRADE, type DataGrade, type MarketSource } from "./sources";
import { normalizeTitle } from "./normalize";
import { canTransition, type OpportunityState } from "./scoring";

// Market Scout persistence (raw parameterised SQL over the market_* tables of migration 20261007100000_market_scout_foundation).
// Observations are INSERT-only with an idempotency key (a duplicate submit returns the existing row; a later capture appends a new row).
// Reads are as-of: known_at <= asOf AND observed_at <= asOf (no look-ahead). Nothing here touches Forecast V2, orders or decisions tables.
export interface Db { query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> }
/** Prisma adapter (server only). */
export const prismaDb = (p: { $queryRawUnsafe<T = unknown>(q: string, ...v: unknown[]): Promise<T> }): Db =>
  ({ query: async <T,>(sql: string, params: unknown[] = []) => ({ rows: await p.$queryRawUnsafe<T[]>(sql, ...params) }) });

export const idemKey = (...parts: unknown[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");
type Provider = "TRENDYOL" | "ALIBABA" | "1688" | "MADE_IN_CHINA" | "OTHER";

async function insertReturning(db: Db, sql: string, params: unknown[], key: string, table: string): Promise<{ id: string; inserted: boolean }> {
  const r = await db.query<{ id: string }>(`${sql} on conflict (idempotency_key) do nothing returning id`, params);
  if (r.rows[0]) return { id: r.rows[0].id, inserted: true };
  const e = await db.query<{ id: string }>(`select id from public.${table} where idempotency_key = $1`, [key]);
  return { id: e.rows[0].id, inserted: false };
}

export async function ensureMarketProduct(db: Db, x: { provider: Provider; externalId: string; url?: string | null; brandSlug?: string | null;
  titleSlug?: string | null; source: MarketSource }): Promise<string> {
  await db.query(`insert into public.market_product (provider, external_id, url, brand_slug, title_slug, first_source) values ($1,$2,$3,$4,$5,$6)
    on conflict (provider, external_id) do nothing`, [x.provider, x.externalId, x.url ?? null, x.brandSlug ?? null, x.titleSlug ?? null, x.source]);
  return (await db.query<{ id: string }>(`select id from public.market_product where provider = $1 and external_id = $2`, [x.provider, x.externalId])).rows[0].id;
}
export async function ensureSeller(db: Db, x: { provider: Provider; externalId: string; slug?: string | null; url?: string | null; source: MarketSource }): Promise<string> {
  await db.query(`insert into public.market_seller (provider, external_id, slug, url, first_source) values ($1,$2,$3,$4,$5) on conflict (provider, external_id) do nothing`,
    [x.provider, x.externalId, x.slug ?? null, x.url ?? null, x.source]);
  return (await db.query<{ id: string }>(`select id from public.market_seller where provider = $1 and external_id = $2`, [x.provider, x.externalId])).rows[0].id;
}

export interface ProductObservationInput {
  productId: string; source: MarketSource; observedAt: string; sourceUrl?: string | null; sellerName?: string | null; sellerExternalId?: string | null;
  rawTitle?: string | null; price?: number | null; currency?: string | null; rating?: number | null; reviewCount?: number | null;
  publicSalesSignal?: string | null; badge?: string | null; ranking?: string | null; availability?: string | null; imageUrl?: string | null;
  evidence?: Record<string, unknown>; notes?: string | null; capturedBy?: string | null; idempotencyKey?: string; dataGrade?: DataGrade;
}
export async function insertProductObservation(db: Db, o: ProductObservationInput) {
  const key = o.idempotencyKey ?? idemKey("obs", o.productId, o.source, o.observedAt, o.price ?? null, o.reviewCount ?? null, o.rating ?? null,
    o.publicSalesSignal ?? null, o.badge ?? null, o.capturedBy ?? null);
  return insertReturning(db, `insert into public.market_product_observation (product_id, source, observed_at, source_url, seller_name, seller_external_id,
      raw_title, normalized_title, price, currency, rating, review_count, public_sales_signal, badge, ranking, availability, image_url, data_grade, evidence,
      notes, captured_by, idempotency_key)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20,$21,$22)`,
    [o.productId, o.source, o.observedAt, o.sourceUrl ?? null, o.sellerName ?? null, o.sellerExternalId ?? null, o.rawTitle ?? null,
      o.rawTitle ? normalizeTitle(o.rawTitle) : null, o.price ?? null, o.currency ?? null, o.rating ?? null, o.reviewCount ?? null, o.publicSalesSignal ?? null,
      o.badge ?? null, o.ranking ?? null, o.availability ?? null, o.imageUrl ?? null, o.dataGrade ?? SOURCE_GRADE[o.source], JSON.stringify(o.evidence ?? {}),
      o.notes ?? null, o.capturedBy ?? null, key], key, "market_product_observation");
}

export interface ObservationRow { id: string; product_id: string; source: string; observed_at: string; known_at: string; seller_name: string | null;
  seller_external_id: string | null; raw_title: string | null; price: string | null; currency: string | null; rating: string | null; review_count: number | null;
  public_sales_signal: string | null; badge: string | null; ranking: string | null; availability: string | null; image_url: string | null;
  data_grade: string; source_url: string | null; notes: string | null }
/** No look-ahead read: only what was observed AND recorded by `asOf`. */
export async function observationsAsOf(db: Db, productId: string, asOf: string): Promise<ObservationRow[]> {
  return (await db.query<ObservationRow>(`select id, product_id, source, observed_at::text, known_at::text, seller_name, seller_external_id, raw_title, price::text,
      currency, rating::text, review_count, public_sales_signal, badge, ranking, availability, image_url, data_grade, source_url, notes
    from public.market_product_observation where product_id = $1 and known_at <= $2::timestamptz and observed_at <= $2::timestamptz
    order by observed_at, known_at, id`, [productId, asOf])).rows;
}

export interface BuyboxRow { barcode: string; productRef?: string | null; observedAt: string; ourBuyboxRank: number | null; buyboxPrice: number | null;
  multipleSellers: boolean | null; secondPrice: number | null; thirdPrice: number | null; raw: Record<string, unknown> }
export async function insertBuyboxObservations(db: Db, rows: BuyboxRow[], runId: string) {
  let inserted = 0;
  for (const r of rows) {
    const key = idemKey("buybox", r.barcode, runId);
    const x = await insertReturning(db, `insert into public.market_buybox_observation (barcode, product_ref, observed_at, our_buybox_rank, buybox_price, multiple_sellers,
        second_price, third_price, run_id, evidence, idempotency_key) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
      [r.barcode, r.productRef ?? null, r.observedAt, r.ourBuyboxRank, r.buyboxPrice, r.multipleSellers, r.secondPrice, r.thirdPrice, runId,
        JSON.stringify({ raw: r.raw }), key], key, "market_buybox_observation");
    if (x.inserted) inserted++;
  }
  return inserted;
}

export interface SourcingInput { provider: "ALIBABA" | "1688" | "MADE_IN_CHINA" | "OTHER"; observedAt: string; sourceUrl?: string | null; supplierName?: string | null;
  supplierLocation?: string | null; title?: string | null; displayedPriceMin?: number | null; displayedPriceMax?: number | null; currency?: string | null;
  moq?: number | null; material?: string | null; dimensions?: string | null; imageUrl?: string | null; notes?: string | null; opportunityId?: string | null;
  supersedesId?: string | null; createdBy?: string | null }
/** MANUAL_SOURCING: landed cost is ALWAYS UNKNOWN here (DB-enforced); the displayed price is stored as displayed, nothing derived. */
export async function insertManualSourcing(db: Db, s: SourcingInput) {
  const key = idemKey("sourcing", s.provider, s.sourceUrl ?? null, s.observedAt, s.displayedPriceMin ?? null, s.displayedPriceMax ?? null, s.moq ?? null, s.createdBy ?? null);
  return insertReturning(db, `insert into public.market_sourcing_candidate (opportunity_id, supersedes_id, source, provider, observed_at, source_url, supplier_name,
      supplier_location, title, displayed_price_min, displayed_price_max, currency, moq, material, dimensions, image_url, notes, data_grade, evidence, created_by, idempotency_key)
    values ($1,$2,'MANUAL_SOURCING',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'B','{}'::jsonb,$17,$18)`,
    [s.opportunityId ?? null, s.supersedesId ?? null, s.provider, s.observedAt, s.sourceUrl ?? null, s.supplierName ?? null, s.supplierLocation ?? null, s.title ?? null,
      s.displayedPriceMin ?? null, s.displayedPriceMax ?? null, s.currency ?? null, s.moq ?? null, s.material ?? null, s.dimensions ?? null, s.imageUrl ?? null,
      s.notes ?? null, s.createdBy ?? null, key], key, "market_sourcing_candidate");
}

export async function insertGeneratedQueries(db: Db, subjectKind: "OPPORTUNITY" | "MARKET_PRODUCT", subjectId: string,
  qs: { language: "en" | "zh"; query: string; generator: string; generatorVersion: string; inputTerms: string[] }[]) {
  for (const q of qs) {
    const key = idemKey("query", subjectKind, subjectId, q.language, q.query, q.generatorVersion);
    await db.query(`insert into public.market_generated_query (subject_kind, subject_id, language, query, generator, generator_version, input_terms, idempotency_key)
      values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) on conflict (idempotency_key) do nothing`,
      [subjectKind, subjectId, q.language, q.query, q.generator, q.generatorVersion, JSON.stringify(q.inputTerms), key]);
  }
}

export async function insertMatch(db: Db, m: { leftKind: string; leftRef: string; rightKind: string; rightRef: string; method: "DETERMINISTIC" | "LLM_ASSISTED";
  classification: string; score: number; evidence: unknown; inputSnapshotIds: string[]; scoringVersion: string }) {
  const key = idemKey("match", m.leftKind, m.leftRef, m.rightKind, m.rightRef, m.method, m.scoringVersion, m.inputSnapshotIds);
  return insertReturning(db, `insert into public.market_product_match (left_kind, left_ref, right_kind, right_ref, method, classification, score, evidence,
      input_snapshot_ids, scoring_version, data_grade, idempotency_key) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::uuid[],$10,$11,$12)`,
    [m.leftKind, m.leftRef, m.rightKind, m.rightRef, m.method, m.classification, m.score, JSON.stringify(m.evidence), m.inputSnapshotIds, m.scoringVersion,
      m.method === "LLM_ASSISTED" ? "D" : "C", key], key, "market_product_match");
}

export async function createOpportunity(db: Db, o: { title: string; firstObservedAt: string; scoringVersion: string; evidenceSnapshotIds: string[];
  categoryFit?: unknown; momentum?: unknown; opportunityScore?: unknown; alfasCategoryRef?: string | null; createdBy: string; legacyRef?: Record<string, unknown> | null;
  state?: OpportunityState }) {
  const state = o.state ?? "DISCOVERED";
  const r = await db.query<{ id: string }>(`insert into public.market_opportunity (title, state, alfas_category_ref, category_fit, momentum, opportunity_score,
      evidence_snapshot_ids, scoring_version, first_observed_at, legacy_ref, created_by) values ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::uuid[],$8,$9,$10::jsonb,$11)
    returning id`, [o.title, state, o.alfasCategoryRef ?? null, JSON.stringify(o.categoryFit ?? null), JSON.stringify(o.momentum ?? null),
      JSON.stringify(o.opportunityScore ?? null), o.evidenceSnapshotIds, o.scoringVersion, o.firstObservedAt, o.legacyRef ? JSON.stringify(o.legacyRef) : null, o.createdBy]);
  const id = r.rows[0].id;
  await db.query(`insert into public.market_opportunity_event (opportunity_id, from_state, to_state, actor, reason, occurred_at, idempotency_key)
    values ($1, null, $2, $3, 'created', $4, $5)`, [id, state, o.createdBy, o.firstObservedAt, idemKey("opp-event", id, "created")]);
  return id;
}
/** Human-only state change (validated); the event log is append-only. Never creates orders or cfo_product_candidate rows. */
export async function transitionOpportunity(db: Db, id: string, to: OpportunityState, actor: string, reason: string, landedCostVerified: boolean) {
  const cur = (await db.query<{ state: OpportunityState }>(`select state from public.market_opportunity where id = $1`, [id])).rows[0];
  if (!cur) throw new Error("opportunity_not_found");
  if (!canTransition(cur.state, to, { landedCostVerified })) throw new Error(`transition_not_allowed:${cur.state}->${to}`);
  const now = new Date().toISOString();
  await db.query(`update public.market_opportunity set state = $2, updated_at = now() where id = $1`, [id, to]);
  await db.query(`insert into public.market_opportunity_event (opportunity_id, from_state, to_state, actor, reason, occurred_at, idempotency_key)
    values ($1,$2,$3,$4,$5,$6,$7)`, [id, cur.state, to, actor, reason, now, idemKey("opp-event", id, cur.state, to, now)]);
}

export async function startRun(db: Db, provider: string, trigger: "MANUAL" | "SCHEDULED" | "TEST") {
  return (await db.query<{ id: string }>(`insert into public.market_collection_run (provider, trigger) values ($1,$2) returning id`, [provider, trigger])).rows[0].id;
}
export async function finishRun(db: Db, id: string, status: "OK" | "PARTIAL" | "FAILED" | "SKIPPED_UNCHANGED", stats: unknown, errorCode?: string | null) {
  await db.query(`update public.market_collection_run set status = $2, stats = $3::jsonb, error_code = $4, finished_at = now() where id = $1`,
    [id, status, JSON.stringify(stats), errorCode ?? null]);
}
export async function lastRuns(db: Db): Promise<Record<string, { status: string; finishedAt: string | null }>> {
  const rows = (await db.query<{ provider: string; status: string; finished_at: string | null }>(`select distinct on (provider) provider, status, finished_at::text
    from public.market_collection_run where trigger <> 'TEST' order by provider, started_at desc`)).rows;
  return Object.fromEntries(rows.map(r => [r.provider, { status: r.status, finishedAt: r.finished_at }]));
}
