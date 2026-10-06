import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { createOpportunity, insertManualSourcing, observationsAsOf, transitionOpportunity, type Db } from "../lib/market/store";
import { recordManualCapture, recordManualSourcing } from "../lib/market/providers/manual";
import { scanProductSitemaps } from "../lib/market/providers/trendyol-sitemap";
import { collectBuybox } from "../lib/market/providers/trendyol-buybox";
import { applyLegacyImport, mapLegacyScout, readLegacyScout } from "../lib/market/legacy-scout";
import { fitInputsFor, productHunter, toMomentumPoints } from "../lib/market/hunter";
import { computeMomentum } from "../lib/market/momentum";
import { categoryFit } from "../lib/market/scoring";
import { embedExternalImage, nearestAlfasByImage } from "../lib/market/image-similarity";

// Market Scout on a real PostgreSQL (PGlite) with migration 20261007100000_market_scout_foundation: append-only + idempotent observations,
// observed_at / known_at no look-ahead (SQL read == TS momentum), DB-enforced semantics (sitemap has no seller, autocomplete has no volume,
// manual sourcing has no landed cost, no BUY state), collectors with fake transports (graceful failure, no credentials in stats), legacy
// scout import with provenance, Product Hunter, image similarity on pgvector, and zero writes to order / decision / forecast tables.
// All rows created here are TEST fixtures (captured_by "TEST"). Run with: node --import tsx __tests__/market-scout-db.test.ts
const MIG = readFileSync("prisma/migrations/20261007100000_market_scout_foundation/migration.sql", "utf8");
const fails = async (p: Promise<unknown>, re: RegExp, m: string) => { await assert.rejects(p, (e: Error) => re.test(e.message), m); };

async function main() {
  const pg = new PGlite({ extensions: { vector } });
  const db: Db = { query: async <T,>(sql: string, params?: unknown[]) => ({ rows: (await pg.query<T>(sql, params)).rows }) };
  try {
    await pg.exec(`create extension if not exists vector; create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create role cfo_acceptance_reader nologin;
      create table public."ProductCategory" (id text primary key, name text);
      create table public."Product" (id text primary key, sku text, name text, barcode text, "isActive" boolean default true, "categoryId" text);
      create table public."ProductImage" (id text primary key, "productId" text, embedding vector(512));
      create table public.fm_sales_canonical_snapshot (product_id text, disposition text, economic_date date, units_counted numeric);
      create table public."PurchaseOrder" (id text primary key, status text); create table public."PurchaseOrderItem" (id text primary key, "orderId" text, qty int);
      create table public.cfo_order_line (id text primary key, sku text, qty int, monthly_sales numeric, status text);
      create table public."ImportDecisionSnapshot" (id text primary key); create table public.cfo_urun_karar (sku text primary key, karar text);
      create table public.cfo_product_candidate (id bigserial primary key, product_name text); create table public.urun_aday (id text primary key, sku text);
      create table public.candidates (id uuid primary key, term text unique, title_en text, title_tr_terms text[], canonical_image_url text, source_url text, category text,
        risk_flags jsonb default '[]', status text, first_seen date, created_at timestamptz default now(), asin text, pref_score numeric, brand text);
      create table public.scores (candidate_id uuid, date date, total numeric, verdict text, demand_sub numeric, gap_sub numeric, source_sub numeric, confidence_mult numeric,
        velocity_bonus numeric, coverage numeric, subscores jsonb, missing text[], errors jsonb, reason text, primary key (candidate_id, date));
      create table public.signals_daily (candidate_id uuid, date date, amazon_bsr int, amazon_bsr_delta numeric, trends_us numeric, trends_tr numeric, tr_listing_count int,
        tr_review_count int, tr_review_velocity numeric, cn_unit_cost numeric, cn_moq int, primary key (candidate_id, date));
      create table public.decisions (id uuid primary key, candidate_id uuid, decided_at timestamptz, human_verdict text, bought boolean, outcome jsonb, notes text, rating int);
      insert into public."ProductCategory" values ('c1', 'Banyo & Mutfak Bataryası (Armatür)'), ('c2', 'CCTV & Kamera Sistemleri');
      insert into public."Product" (id, sku, name, barcode, "categoryId") values ('p1', 'B-1', 'Paslanmaz Mutfak Bataryası Spiralli', '8680000000011', 'c1'),
        ('p2', 'B-2', 'Banyo Lavabo Bataryası Krom', '8680000000028', 'c1'), ('p3', 'K-1', 'IP Kamera 4MP', '8680000000035', 'c2');
      insert into public.fm_sales_canonical_snapshot values ('p1', 'COUNTED', current_date - 10, 3);
      insert into public."PurchaseOrder" values ('o1', 'DRAFT'); insert into public."PurchaseOrderItem" values ('i1', 'o1', 5);
      insert into public.cfo_order_line values ('l1', 'B-1', 10, 4, 'BEKLIYOR'); insert into public.cfo_urun_karar values ('B-1', 'BEKLE');
      insert into public.candidates (id, term, title_en, status, first_seen, asin, category) values
        ('00000000-0000-0000-0000-000000000001', 'term-1', 'Shower head A', 'rejected', '2026-06-17', 'B01', 'armatür'),
        ('00000000-0000-0000-0000-000000000002', 'term-2', null, 'saved', '2026-06-18', 'B02', 'armatür'),
        ('00000000-0000-0000-0000-000000000003', 'term-3', 'Hose', 'rejected', '2026-06-18', 'B03', 'armatür');
      insert into public.scores (candidate_id, date, total, verdict) values ('00000000-0000-0000-0000-000000000001', '2026-06-18', 61, 'ALMA');
      insert into public.signals_daily (candidate_id, date, amazon_bsr) values ('00000000-0000-0000-0000-000000000001', '2026-06-18', 1500);
      insert into public.decisions values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-06-17 22:12:38+00', 'ALMA', null, null, 'çok rekabet', null),
        ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', '2026-06-17 23:13:01+00', null, null, null, 'alman markası', null),
        ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', '2026-06-17 23:13:08+00', null, null, null, 'alman markası 2', null);`);
    await pg.exec(MIG);
    await pg.exec(MIG); // idempotent re-apply
    const protectedSnapshot = async () => JSON.stringify((await db.query(`select (select json_agg(t) from public."PurchaseOrder" t) a, (select json_agg(t) from public."PurchaseOrderItem" t) b,
      (select json_agg(t) from public.cfo_order_line t) c, (select count(*) from public."ImportDecisionSnapshot") d, (select json_agg(t) from public.cfo_urun_karar t) e,
      (select count(*) from public.cfo_product_candidate) f, (select count(*) from public.urun_aday) g, (select json_agg(t order by id) from public.candidates t) h,
      (select json_agg(t) from public.scores t) i, (select json_agg(t) from public.signals_daily t) j, (select json_agg(t order by id) from public.decisions t) k,
      (select json_agg(t) from public."Product" t) l`)).rows);
    const before = await protectedSnapshot();

    // 1. manual capture → append-only observation; duplicate submit idempotent; a later capture appends and preserves the first
    const url = "https://www.trendyol.com/luxury-faucet/selale-mutfak-bataryasi-p-1075881149?merchantId=4242";
    const c1 = await recordManualCapture(db, { productUrl: url, sellerName: "Luxury Faucet", title: "Şelale Akışlı Paslanmaz Mutfak Bataryası", price: "2199", reviewCount: "10",
      rating: "4.5", publicSalesSignal: "50+ ürün satıldı", observedAt: "2026-09-07T10:00:00Z" }, "TEST", () => new Date("2026-09-07T10:01:00Z"));
    const dup = await recordManualCapture(db, { productUrl: url, sellerName: "Luxury Faucet", title: "Şelale Akışlı Paslanmaz Mutfak Bataryası", price: "2199", reviewCount: "10",
      rating: "4.5", publicSalesSignal: "50+ ürün satıldı", observedAt: "2026-09-07T10:00:00Z" }, "TEST", () => new Date("2026-09-07T10:02:00Z"));
    assert.equal(c1.inserted, true); assert.equal(dup.inserted, false); assert.equal(dup.observationId, c1.observationId);
    const firstRow = JSON.stringify((await db.query(`select * from public.market_product_observation where id = $1`, [c1.observationId])).rows[0]);
    for (const [i, d] of ["2026-09-14", "2026-09-21", "2026-09-28"].entries())
      await recordManualCapture(db, { productUrl: url, sellerName: "Luxury Faucet", title: "Şelale Akışlı Paslanmaz Mutfak Bataryası", price: String([2199, 2099, 2099][i]),
        reviewCount: String([18, 31, 54][i]), publicSalesSignal: ["50+", "100+ / son 3 gün", "100+"][i], observedAt: `${d}T10:00:00Z` }, "TEST", () => new Date(`${d}T10:05:00Z`));
    assert.equal((await db.query(`select count(*)::int as n from public.market_product_observation where product_id = $1`, [c1.productId])).rows[0].n, 4);
    assert.equal(JSON.stringify((await db.query(`select * from public.market_product_observation where id = $1`, [c1.observationId])).rows[0]), firstRow, "first observation unchanged");
    const row = (await db.query<{ seller_external_id: string; data_grade: string; source: string }>(`select seller_external_id, data_grade, source from public.market_product_observation where id = $1`, [c1.observationId])).rows[0];
    assert.deepEqual(row, { seller_external_id: "4242", data_grade: "B", source: "MANUAL_BROWSER_CAPTURE" });
    await fails(db.query(`update public.market_product_observation set price = 1 where id = $1`, [c1.observationId]), /market_append_only/, "UPDATE rejected");
    await fails(db.query(`delete from public.market_product_observation where id = $1`, [c1.observationId]), /market_append_only/, "DELETE rejected");

    // 2. no look-ahead: a row recorded later than asOf is invisible; SQL as-of read feeds the same momentum as the TS reference
    await db.query(`insert into public.market_product_observation (product_id, source, observed_at, known_at, review_count, data_grade, idempotency_key)
      values ($1, 'MANUAL_BROWSER_CAPTURE', '2026-09-30T10:00:00Z', '2026-11-01T00:00:00Z', 999, 'B', 'late-known')`, [c1.productId]);
    const asOf = new Date(Date.now() + 3_600_000).toISOString(); // known_at is stamped by the DB clock
    const rows = await observationsAsOf(db, c1.productId, asOf);
    assert.equal(rows.length, 4); assert.ok(rows.every(r => r.review_count !== 999));
    const all = (await db.query<{ observed_at: string; known_at: string; review_count: number | null; price: string | null; public_sales_signal: string | null }>(
      `select observed_at::text, known_at::text, review_count, price::text, public_sales_signal from public.market_product_observation where product_id = $1`, [c1.productId])).rows;
    const tsMomentum = computeMomentum(all.map(r => ({ observedAt: r.observed_at, knownAt: r.known_at, reviewCount: r.review_count, price: r.price == null ? null : Number(r.price),
      publicSalesSignal: r.public_sales_signal })), asOf);
    const sqlMomentum = computeMomentum(toMomentumPoints(rows), asOf);
    assert.deepEqual(sqlMomentum, tsMomentum, "SQL as-of == TS filter"); assert.equal(sqlMomentum.direction, "RISING"); assert.equal(sqlMomentum.points, 4);

    // 3. DB-enforced semantics
    await fails(db.query(`insert into public.market_product_observation (product_id, source, observed_at, seller_name, data_grade, idempotency_key)
      values ($1, 'TRENDYOL_SITEMAP', now(), 'Some Seller', 'A', 'sx')`, [c1.productId]), /check/i, "sitemap cannot carry a seller");
    await db.query(`insert into public.market_keyword (keyword) values ('mutfak bataryası')`);
    const kw = (await db.query<{ id: string }>(`select id from public.market_keyword`)).rows[0].id;
    await fails(db.query(`insert into public.market_keyword_observation (keyword_id, source, metric_kind, observed_at, interest_index, data_grade, idempotency_key)
      values ($1, 'GOOGLE_AUTOCOMPLETE_EXPERIMENTAL', 'AUTOCOMPLETE_SUGGESTIONS', now(), 55, 'B', 'k1')`, [kw]), /check/i, "autocomplete cannot carry a number");
    await fails(db.query(`insert into public.market_keyword_observation (keyword_id, source, metric_kind, observed_at, interest_index, data_grade, idempotency_key)
      values ($1, 'GOOGLE_AUTOCOMPLETE_EXPERIMENTAL', 'TREND_INTEREST_INDEX', now(), 55, 'B', 'k2')`, [kw]), /check/i, "autocomplete cannot be a trend index");
    const kwCols = (await db.query<{ column_name: string }>(`select column_name from information_schema.columns where table_name = 'market_keyword_observation'`)).rows.map(r => r.column_name);
    assert.ok(!kwCols.some(c => /volume|searches/.test(c)), "no search-volume column");
    await fails(db.query(`insert into public.market_sourcing_candidate (source, provider, observed_at, landed_cost_status, landed_cost_try, landed_cost_evidence, data_grade, idempotency_key)
      values ('MANUAL_SOURCING', 'ALIBABA', now(), 'VERIFIED', 100, '{}'::jsonb, 'B', 's1')`), /check/i, "manual sourcing cannot claim landed cost");
    await fails(db.query(`insert into public.market_sourcing_candidate (source, provider, observed_at, landed_cost_try, data_grade, idempotency_key)
      values ('MANUAL_SOURCING', 'ALIBABA', now(), 100, 'B', 's2')`), /check/i, "landed cost without verification rejected");
    await fails(db.query(`insert into public.market_opportunity (title, state, scoring_version, first_observed_at) values ('x', 'BUY', 'v', now())`), /check/i, "no BUY state");
    const bbCols = (await db.query<{ column_name: string }>(`select column_name from information_schema.columns where table_name = 'market_buybox_observation'`)).rows.map(r => r.column_name);
    assert.ok(!bbCols.some(c => /sales|sold|units/.test(c)), "buybox has no sales column");
    await fails(db.query(`insert into public.market_buybox_observation (barcode, observed_at, data_grade, idempotency_key) values ('x', now(), 'C', 'b1')`), /check/i, "buybox grade is A only");

    // 4. manual sourcing: displayed price stored as displayed, landed cost UNKNOWN; invalid range rejected
    const s1 = await recordManualSourcing(db, { sourceUrl: "https://www.alibaba.com/product-detail/waterfall-faucet_1.html", supplierName: "TEST Supplier", displayedPriceMin: "12.5",
      displayedPriceMax: "18", currency: "USD", moq: "50", material: "304 stainless" }, "TEST");
    const sRow = (await db.query<{ landed_cost_status: string; landed_cost_try: string | null; provider: string; data_grade: string }>(`select landed_cost_status, landed_cost_try, provider, data_grade
      from public.market_sourcing_candidate where id = $1`, [s1.id])).rows[0];
    assert.deepEqual(sRow, { landed_cost_status: "UNKNOWN", landed_cost_try: null, provider: "ALIBABA", data_grade: "B" });
    await assert.rejects(recordManualSourcing(db, { sourceUrl: "https://www.alibaba.com/x", displayedPriceMin: "20", displayedPriceMax: "10" }, "TEST"), /price_range_invalid/);
    await assert.rejects(recordManualSourcing(db, { sourceUrl: "javascript:alert(1)" }, "TEST"), /invalid_sourcing_url/);

    // 5. sitemap scan (fake transport): brand / keyword filter, seller stays NULL, idempotent per ETag, 304 → unchanged, failures degrade
    const xml = (ids: number[]) => `<urlset>${ids.map(i => `<url><loc>https://www.trendyol.com/${i % 2 ? "luxury-faucet" : "other-brand"}/${i % 3 ? "mutfak-bataryasi" : "kadin-ceket"}-p-${i}</loc>
      <image:image><image:loc>https://cdn.dsmcdn.com/x/${i}.jpg</image:loc></image:image></url>`).join("")}</urlset>`;
    let calls = 0;
    type R = { status: number; headers: Record<string, string>; body: Buffer };
    const fake = async (u: string, o: { headers?: Record<string, string> }): Promise<R> => { calls++;
      if (u.endsWith("3.xml")) return { status: 500, headers: {}, body: Buffer.alloc(0) };
      if (o.headers?.["If-None-Match"] === `"e-${u.slice(-6)}"`) return { status: 304, headers: {}, body: Buffer.alloc(0) };
      // like Cloudflare: gzip responses carry a WEAK etag, but only the STRONG form in If-None-Match yields 304 (W/"…" → full 200 again)
      return { status: 200, headers: { etag: `W/"e-${u.slice(-6)}"`, "content-type": "text/xml" }, body: Buffer.from(xml(u.endsWith("1.xml") ? [1, 2, 3, 4, 5, 6] : [7, 8, 9])) }; };
    const files = [1, 2, 3].map(n => `https://www.trendyol.com/sitemap_products${n}.xml`);
    const scan1 = await scanProductSitemaps(db, { files, brandSlugs: ["luxury-faucet"], keywordConcepts: ["faucet"], trigger: "TEST", fetcher: fake, sleep: async () => {} });
    assert.equal(scan1.status, "PARTIAL"); assert.equal(scan1.failed, 1); assert.equal(scan1.files, 2);
    // kept = brand luxury-faucet (odd ids) OR a faucet title (ids not divisible by 3); file 3 failed
    assert.equal(scan1.matched, [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(i => i % 2 === 1 || i % 3 !== 0).length);
    const sm = (await db.query<{ n: number; sellers: number }>(`select count(*)::int as n, count(seller_external_id)::int as sellers from public.market_product_observation where source = 'TRENDYOL_SITEMAP'`)).rows[0];
    assert.equal(sm.sellers, 0, "sitemap never yields a seller"); assert.equal(sm.n, scan1.matched);
    const scan2 = await scanProductSitemaps(db, { files: files.slice(0, 2), previousEtags: scan1.etags, brandSlugs: ["luxury-faucet"], keywordConcepts: ["faucet"], trigger: "TEST", fetcher: fake, sleep: async () => {} });
    assert.deepEqual([scan2.status, scan2.unchanged, scan2.newProducts], ["SKIPPED_UNCHANGED", 2, 0]);
    assert.ok(Object.values(scan1.etags).every(e => !e.startsWith("W/")), "validators stored in strong form");
    assert.equal((await db.query<{ n: number }>(`select count(*)::int as n from public.market_product_observation where source = 'TRENDYOL_SITEMAP'`)).rows[0].n, sm.n, "no duplicate rows");
    assert.ok(calls > 0);

    // 6. buybox (fake transport): A-grade rows, second batch fails → PARTIAL, credentials never stored
    const secret = "TEST-SECRET-xyz";
    let bbCall = 0;
    const bbFake = async (_u: string, o: { body?: string }): Promise<R> => { bbCall++;
      if (bbCall === 2) return { status: 503, headers: {}, body: Buffer.alloc(0) };
      const barcodes = JSON.parse(o.body ?? "{}").barcodes as string[];
      return { status: 200, headers: { "content-type": "application/json" }, body: Buffer.from(JSON.stringify({ buyboxInfo: barcodes.map((b, i) => ({ barcode: b, buyboxOrder: i + 1,
        buyboxPrice: 500 + i, hasMultipleSeller: i > 0, secondBuyboxPrice: 520, thirdBuyboxPrice: null })) })) }; };
    const bc = Array.from({ length: 13 }, (_, i) => `86800000${String(i).padStart(5, "0")}`);
    const bbRun = await collectBuybox(db, { sellerId: "123", apiKey: "k", apiSecret: secret, storeFrontCode: "TR" }, bc, { trigger: "TEST", fetcher: bbFake, sleep: async () => {} });
    assert.deepEqual([bbRun.status, bbRun.requests, bbRun.inserted], ["PARTIAL", 2, 10]);
    const runRow = JSON.stringify((await db.query(`select * from public.market_collection_run where id = $1`, [bbRun.runId])).rows[0]);
    assert.ok(!runRow.includes(secret) && !runRow.includes(Buffer.from(`k:${secret}`).toString("base64")), "no credentials in run stats");
    assert.equal((await db.query<{ n: number }>(`select count(*)::int as n from public.market_buybox_observation where data_grade = 'A' and source = 'TRENDYOL_OFFICIAL_API'`)).rows[0].n, 10);
    const broken = await collectBuybox(db, { sellerId: "123", apiKey: "k", apiSecret: secret, storeFrontCode: "TR" }, bc.slice(0, 3),
      { trigger: "TEST", fetcher: async (): Promise<R> => ({ status: 200, headers: {}, body: Buffer.from("<html>not json") }), sleep: async () => {} });
    assert.equal(broken.status, "FAILED", "malformed provider data → FAILED run, no throw, no rows");

    // 7. Product Hunter: human-created opportunity from a capture; fit with coverage; margin UNKNOWN; READY blocked until landed cost verified
    const live = await fitInputsFor(db, c1.productId, asOf);
    assert.equal(live.inputs.existing_category_proximity, 1); assert.ok((live.inputs.product_similarity ?? 0) > 0);
    assert.equal(live.inputs.competitor_adoption, undefined, "no watchlist → competitor adoption UNKNOWN");
    const opp = await createOpportunity(db, { title: "TEST Şelale mutfak bataryası", firstObservedAt: "2026-09-07T10:00:00Z", scoringVersion: "fit-v1+momentum-v1+opp-v1",
      evidenceSnapshotIds: [c1.observationId], categoryFit: { ...categoryFit(live.inputs), inputs: live.inputs }, createdBy: "TEST" });
    await insertManualSourcing(db, { provider: "ALIBABA", observedAt: "2026-10-01T00:00:00Z", sourceUrl: "https://www.alibaba.com/product-detail/y.html", displayedPriceMin: 10,
      displayedPriceMax: 14, currency: "USD", moq: 100, opportunityId: opp, createdBy: "TEST" });
    const cards = await productHunter(db, asOf, 10);
    const card = cards.find(c => c.id === opp)!;
    assert.ok(card && card.sourcing.landedCost === "UNKNOWN" && card.assessment.expectedMargin === null);
    assert.equal(card.assessment.nextAction, "VERIFY_SUPPLIER_AND_GTIP"); assert.equal(card.momentum?.direction, "RISING");
    assert.ok(card.fit.coverage < 1 && card.fit.missing.includes("margin_readiness"));
    await transitionOpportunity(db, opp, "SOURCING_CANDIDATE", "TEST", "has a supplier link", false);
    await transitionOpportunity(db, opp, "COST_VERIFICATION_REQUIRED", "TEST", "verify GTIP", false);
    await assert.rejects(transitionOpportunity(db, opp, "READY_FOR_HUMAN_REVIEW", "TEST", "skip", false), /transition_not_allowed/);
    assert.equal((await db.query<{ n: number }>(`select count(*)::int as n from public.market_opportunity_event where opportunity_id = $1`, [opp])).rows[0].n, 3);
    assert.deepEqual(await productHunter(db, asOf, 10), await productHunter(db, asOf, 10), "deterministic");

    // 8. legacy scout import: provenance, decisions preserved, idempotent, legacy tables untouched
    const legacy = await readLegacyScout(db);
    const mapped = mapLegacyScout(legacy);
    const imp1 = await applyLegacyImport(db, mapped, "TEST"), imp2 = await applyLegacyImport(db, mapped, "TEST");
    assert.deepEqual(imp1, { created: 3, skipped: 0, decisionEvents: 3 }); assert.deepEqual(imp2, { created: 0, skipped: 3, decisionEvents: 0 });
    const lr = (await db.query<{ state: string; writer: string; decisions: number }>(`select o.state, o.legacy_ref ->> 'legacy_writer' as writer,
      (select count(*)::int from public.market_opportunity_event e where e.opportunity_id = o.id and e.actor = 'LEGACY_HUMAN_DECISION') as decisions
      from public.market_opportunity o where o.legacy_ref is not null order by o.legacy_ref ->> 'legacy_candidate_id'`)).rows;
    assert.deepEqual(lr, [{ state: "REJECTED", writer: "UNKNOWN", decisions: 1 }, { state: "WATCHING", writer: "UNKNOWN", decisions: 0 }, { state: "REJECTED", writer: "UNKNOWN", decisions: 2 }]);
    const ev = (await db.query<{ notes: string }>(`select evidence -> 'legacy_decision' ->> 'notes' as notes from public.market_opportunity_event where actor = 'LEGACY_HUMAN_DECISION' order by occurred_at`)).rows;
    assert.deepEqual(ev.map(e => e.notes), ["çok rekabet", "alman markası", "alman markası 2"]);
    // provenance: every legacy column is carried verbatim (original_row = whole row, incl. columns the typed fields skip) with original ids/timestamps
    const prov = (await db.query<{ cand: Record<string, unknown>; score: Record<string, unknown>; dec: Record<string, unknown>; known: string; occurred: string }>(`select
      o.legacy_ref -> 'original_candidate_row' as cand, o.legacy_ref -> 'legacy_scores' -> 0 -> 'original_row' as score,
      (select e.evidence -> 'legacy_decision' -> 'original_row' from public.market_opportunity_event e where e.opportunity_id = o.id and e.actor = 'LEGACY_HUMAN_DECISION') as dec,
      o.created_at::text as known, (select e.occurred_at::text from public.market_opportunity_event e where e.opportunity_id = o.id and e.actor = 'LEGACY_HUMAN_DECISION') as occurred
      from public.market_opportunity o where o.legacy_ref ->> 'legacy_candidate_id' = '00000000-0000-0000-0000-000000000001'`)).rows[0];
    assert.equal(prov.cand.id, "00000000-0000-0000-0000-000000000001"); assert.equal(prov.cand.status, "rejected"); assert.equal(prov.cand.first_seen, "2026-06-17");
    assert.ok("created_at" in prov.cand && "risk_flags" in prov.cand, "whole candidate row kept");
    assert.ok(["demand_sub", "gap_sub", "source_sub", "confidence_mult", "velocity_bonus", "errors"].every(k => k in prov.score), "score columns outside the typed subset kept");
    assert.deepEqual([prov.dec.id, prov.dec.notes, prov.dec.human_verdict], ["10000000-0000-0000-0000-000000000001", "çok rekabet", "ALMA"]);
    assert.equal(Date.parse(prov.occurred), Date.parse("2026-06-17T22:12:38Z"), "decision keeps its original timestamp (occurred_at); known_at = import time");

    // 9. image similarity reuses pgvector embeddings; only allowlisted image hosts are fetched; similarity is evidence only
    const vec = (k: number) => Array.from({ length: 512 }, (_, i) => (i === k ? 1 : 0));
    await db.query(`insert into public."ProductImage" values ('img1', 'p1', $1::vector), ('img2', 'p3', $2::vector)`, [`[${vec(0)}]`, `[${vec(1)}]`]);
    const near = await nearestAlfasByImage(db, vec(0), 2);
    assert.deepEqual(near.map(n => [n.sku, n.similarity]), [["B-1", 1], ["K-1", 0]]);
    await assert.rejects(embedExternalImage("https://evil.com/x.jpg"), (e: { code?: string }) => e.code === "host_not_allowed");
    const emb = await embedExternalImage("https://cdn.dsmcdn.com/x/1.jpg", { fetcher: async () => ({ status: 200, headers: { "content-type": "image/jpeg" }, body: Buffer.from("img"), finalUrl: "" }),
      embed: async () => vec(0) });
    assert.equal(emb.length, 512);

    // 10. zero writes outside market_* (orders, decisions, product candidates, legacy tables, products)
    assert.equal(await protectedSnapshot(), before, "no order / decision / legacy / product mutation");

    // 11. static isolation: Market Scout never imports Forecast V2 and never writes protected tables; Forecast never imports Market Scout
    const walk = (d: string): string[] => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
    const marketFiles = [...walk("lib/market"), "lib/actions/market-scout-actions.ts", "app/(app)/admin/market-scout/page.tsx", ...walk("scripts/market")];
    for (const f of marketFiles) {
      const s = readFileSync(f, "utf8");
      assert.ok(!/from "[^"]*(lib\/forecast|\.\.\/forecast)/.test(s), `${f} must not import Forecast V2`);
      assert.ok(!/FORECAST_V2_ENABLED|onlineSalesPotential/.test(s), `${f} must not touch Forecast V2 / manual potentials`);
      assert.ok(!/(insert\s+into|update|delete\s+from)\s+(public\.)?"?(PurchaseOrder|PurchaseOrderItem|cfo_order_line|ImportDecisionSnapshot|cfo_urun_karar|cfo_product_candidate|urun_aday|candidates|scores|signals_daily|decisions|Product)"?\b/i.test(s),
        `${f} must not write protected tables`);
      assert.ok(!/purchaseOrder\.(create|update)|importDecisionSnapshot\.(create|update)/.test(s), `${f}: no Prisma order writes`);
    }
    for (const f of walk("lib/forecast")) assert.ok(!/from "[^"]*market/.test(readFileSync(f, "utf8")), `${f} must not import Market Scout`);
    console.log(`Market Scout DB: append-only + idempotent capture, no look-ahead (SQL == TS), DB-enforced semantics, sitemap/buybox collectors (graceful), Product Hunter,
  legacy import (3 decisions, writer UNKNOWN), pgvector image similarity, zero protected-table writes, Forecast V2 isolation — OK`);
  } finally { await pg.close(); }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
