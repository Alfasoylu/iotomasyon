import { createOpportunity, idemKey, type Db } from "./store";
import type { OpportunityState } from "./scoring";

// Read-only adapter + migration MAPPING for the pre-existing SQL-only scout (candidates / signals_daily / scores / decisions /
// candidate_board; 200 Amazon-BSR "armatür" candidates 2026-06-17…06-22, 3 human decisions; writer unknown). The legacy tables are only
// SELECTed — never updated or dropped. Import is idempotent (unique legacy_candidate_id) and keeps full provenance (legacy_writer = UNKNOWN).
// Legacy verdicts (AL / TEST ET / İZLE …) are preserved as history; they are NOT converted into new scores or into a BUY state.
export const LEGACY_MAPPING_VERSION = "legacy-scout-map-v1";

export interface LegacyCandidate { id: string; term: string; title_en: string | null; title_tr_terms: string[] | null; canonical_image_url: string | null;
  source_url: string | null; category: string | null; risk_flags: unknown; status: string; first_seen: string; created_at: string; asin: string | null;
  pref_score: string | null; brand: string | null }
export interface LegacyScore { candidate_id: string; date: string; total: string; verdict: string; coverage: string | null; reason: string | null; missing: string[] | null; subscores: unknown }
export interface LegacySignal { candidate_id: string; date: string; [k: string]: unknown }
export interface LegacyDecision { id: string; candidate_id: string; decided_at: string; human_verdict: string | null; bought: boolean | null; outcome: unknown; notes: string | null; rating: number | null }
export interface LegacySnapshot { candidates: LegacyCandidate[]; scores: LegacyScore[]; signals: LegacySignal[]; decisions: LegacyDecision[] }

export async function readLegacyScout(db: Db): Promise<LegacySnapshot> {
  const q = async <T,>(sql: string) => (await db.query<T>(sql)).rows;
  return {
    candidates: await q<LegacyCandidate>(`select id::text, term, title_en, title_tr_terms, canonical_image_url, source_url, category, risk_flags, status,
      first_seen::text, created_at::text, asin, pref_score::text, brand from public.candidates order by created_at, id`),
    scores: await q<LegacyScore>(`select candidate_id::text, date::text, total::text, verdict, coverage::text, reason, missing, subscores from public.scores order by candidate_id, date`),
    signals: await q<LegacySignal>(`select candidate_id::text as candidate_id, date::text as date, amazon_bsr, amazon_bsr_delta, trends_us, trends_tr, tr_listing_count,
      tr_review_count, tr_review_velocity, cn_unit_cost, cn_moq from public.signals_daily order by candidate_id, date`),
    decisions: await q<LegacyDecision>(`select id::text, candidate_id::text, decided_at::text, human_verdict, bought, outcome, notes, rating from public.decisions order by decided_at, id`),
  };
}

const STATE: Record<string, OpportunityState> = { new: "DISCOVERED", watch: "WATCHING", saved: "WATCHING", rejected: "REJECTED",
  // a legacy "buy" never becomes an order: landed cost is unknown → cost verification first
  buy: "COST_VERIFICATION_REQUIRED" };

export interface MappedOpportunity { legacyCandidateId: string; title: string; state: OpportunityState; firstObservedAt: string; legacyRef: Record<string, unknown>;
  decisions: LegacyDecision[] }
export function mapLegacyScout(s: LegacySnapshot): MappedOpportunity[] {
  return s.candidates.map(c => {
    const scores = s.scores.filter(x => x.candidate_id === c.id), signals = s.signals.filter(x => x.candidate_id === c.id);
    const decisions = s.decisions.filter(d => d.candidate_id === c.id);
    return {
      legacyCandidateId: c.id, title: c.title_en || c.term, state: STATE[c.status] ?? "DISCOVERED", firstObservedAt: `${c.first_seen}T00:00:00Z`, decisions,
      legacyRef: { mapping_version: LEGACY_MAPPING_VERSION, legacy_writer: "UNKNOWN", legacy_tables: ["candidates", "scores", "signals_daily", "decisions"],
        legacy_candidate_id: c.id, legacy_status: c.status, term: c.term, asin: c.asin, brand: c.brand, category: c.category, source_url: c.source_url,
        canonical_image_url: c.canonical_image_url, title_tr_terms: c.title_tr_terms, risk_flags: c.risk_flags, pref_score: c.pref_score, created_at: c.created_at,
        legacy_scores: scores, legacy_signals: signals, legacy_decision_ids: decisions.map(d => d.id), signal_sources: "AMAZON_BSR (legacy; not a Trendyol/Google/China observation)" },
    };
  });
}

/** Idempotent import into market_opportunity (+ append-only events for the human decisions). Legacy tables are untouched. */
export async function applyLegacyImport(db: Db, mapped: MappedOpportunity[], actor: string) {
  let created = 0, skipped = 0, decisionEvents = 0;
  for (const m of mapped) {
    const exists = (await db.query(`select 1 from public.market_opportunity where legacy_ref ->> 'legacy_candidate_id' = $1`, [m.legacyCandidateId])).rows.length;
    if (exists) { skipped++; continue; }
    const id = await createOpportunity(db, { title: m.title, state: m.state, firstObservedAt: m.firstObservedAt, scoringVersion: LEGACY_MAPPING_VERSION,
      evidenceSnapshotIds: [], legacyRef: m.legacyRef, createdBy: actor });
    created++;
    for (const d of m.decisions) {
      await db.query(`insert into public.market_opportunity_event (opportunity_id, from_state, to_state, actor, reason, evidence, occurred_at, idempotency_key)
        values ($1, $2, $2, 'LEGACY_HUMAN_DECISION', $3, $4::jsonb, $5, $6) on conflict (idempotency_key) do nothing`,
        [id, m.state, `legacy decision: ${d.human_verdict ?? "—"}`, JSON.stringify({ legacy_decision: d, legacy_writer: "UNKNOWN" }), d.decided_at, idemKey("legacy-decision", d.id)]);
      decisionEvents++;
    }
  }
  return { created, skipped, decisionEvents };
}
