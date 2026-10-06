import type { Momentum } from "./momentum";

// Category Fit (fit-v1) and Market Opportunity (opp-v1). Deterministic, versioned, explainable. Missing components contribute NOTHING
// and are listed — the headline score is points earned out of 100 (not re-normalised), shown next to coverage and a grade.
// Category Fit ≠ Market Opportunity. No state means BUY/ORDER; promotion to cfo_product_candidate / urun_aday is human-only.

export const CATEGORY_FIT_VERSION = "fit-v1";
export const CATEGORY_FIT_WEIGHTS = {
  existing_category_proximity: 25, product_similarity: 20, competitor_adoption: 15, market_momentum: 15,
  sourcing_feasibility: 10, margin_readiness: 10, logistics_compatibility: 5,
} as const;
export type FitComponent = keyof typeof CATEGORY_FIT_WEIGHTS;
export type FitInputs = Partial<Record<FitComponent, number | null>>; // each 0..1, null/undefined = UNKNOWN

export interface CategoryFit { version: typeof CATEGORY_FIT_VERSION; score: number; observedOnlyScore: number | null; coverage: number;
  grade: "B" | "C" | "D" | "UNKNOWN"; missing: FitComponent[]; components: Record<FitComponent, number | null> }

export function categoryFit(x: FitInputs): CategoryFit {
  let earned = 0, avail = 0;
  const components = {} as Record<FitComponent, number | null>, missing: FitComponent[] = [];
  for (const [k, w] of Object.entries(CATEGORY_FIT_WEIGHTS) as [FitComponent, number][]) {
    const v = x[k];
    if (v == null || !Number.isFinite(v)) { components[k] = null; missing.push(k); continue; }
    const c = Math.max(0, Math.min(1, v)); components[k] = c; earned += w * c; avail += w;
  }
  const coverage = avail / 100;
  const grade = coverage >= 0.8 ? "B" : coverage >= 0.6 ? "C" : coverage >= 0.3 ? "D" : "UNKNOWN";
  return { version: CATEGORY_FIT_VERSION, score: Math.round(earned * 10) / 10, observedOnlyScore: avail ? Math.round(earned / avail * 1000) / 10 : null,
    coverage, grade, missing, components };
}

/** Distinct watched sellers seen with the product family recently → 0..1 (null when no watchlist data exists at all). */
export const adoptionComponent = (sellers: number | null) => sellers == null ? null : sellers >= 3 ? 1 : sellers === 2 ? 0.7 : sellers === 1 ? 0.4 : 0;
/** Momentum → 0..1 only when a review series exists (otherwise UNKNOWN). */
export const momentumComponent = (m: Momentum | null) => m?.reviewVelocityPer7d == null ? null : Math.max(0, Math.min(1, m.reviewVelocityPer7d / 20));

export const OPPORTUNITY_VERSION = "opp-v1";
export const OPPORTUNITY_STATES = ["DISCOVERED", "WATCHING", "SOURCING_CANDIDATE", "COST_VERIFICATION_REQUIRED", "READY_FOR_HUMAN_REVIEW", "REJECTED"] as const;
export type OpportunityState = typeof OPPORTUNITY_STATES[number];
/** Allowed manual transitions (no automatic BUY/ORDER; READY only once a landed cost is verified). */
export const TRANSITIONS: Record<OpportunityState, OpportunityState[]> = {
  DISCOVERED: ["WATCHING", "SOURCING_CANDIDATE", "REJECTED"],
  WATCHING: ["SOURCING_CANDIDATE", "REJECTED", "DISCOVERED"],
  SOURCING_CANDIDATE: ["COST_VERIFICATION_REQUIRED", "WATCHING", "REJECTED"],
  COST_VERIFICATION_REQUIRED: ["READY_FOR_HUMAN_REVIEW", "SOURCING_CANDIDATE", "REJECTED"],
  READY_FOR_HUMAN_REVIEW: ["COST_VERIFICATION_REQUIRED", "REJECTED"],
  REJECTED: ["DISCOVERED"],
};
export function canTransition(from: OpportunityState, to: OpportunityState, ctx: { landedCostVerified: boolean }): boolean {
  if (!TRANSITIONS[from].includes(to)) return false;
  return to !== "READY_FOR_HUMAN_REVIEW" || ctx.landedCostVerified;
}

export type NextAction = "CAPTURE_MORE_OBSERVATIONS" | "FIND_SOURCING_CANDIDATE" | "VERIFY_SUPPLIER_AND_GTIP" | "HUMAN_REVIEW" | "NONE";
export interface OpportunityInputs { state: OpportunityState; fit: CategoryFit; momentum: Momentum | null; sourcingCandidates: number; landedCostVerified: boolean }
export interface OpportunityAssessment { version: typeof OPPORTUNITY_VERSION; categoryFit: number; categoryFitCoverage: number; marketMomentum: number | null;
  sourcingFeasibility: number | null; expectedMargin: null; recommendation: "PROMISING_SOURCING_CANDIDATE" | "WATCH" | "INSUFFICIENT_DATA" | "REJECTED";
  nextAction: NextAction; rankKey: number }

export function assessOpportunity(x: OpportunityInputs): OpportunityAssessment {
  const mom = momentumComponent(x.momentum);
  const sourcing = x.sourcingCandidates > 0 ? 1 : null;
  const nextAction: NextAction = x.state === "REJECTED" ? "NONE"
    : x.momentum == null || x.momentum.points < 2 ? "CAPTURE_MORE_OBSERVATIONS"
    : x.sourcingCandidates === 0 ? "FIND_SOURCING_CANDIDATE"
    : !x.landedCostVerified ? "VERIFY_SUPPLIER_AND_GTIP" : "HUMAN_REVIEW";
  const recommendation = x.state === "REJECTED" ? "REJECTED" : x.fit.coverage < 0.3 ? "INSUFFICIENT_DATA"
    : x.fit.score >= 50 && (mom ?? 0) >= 0.3 ? "PROMISING_SOURCING_CANDIDATE" : "WATCH";
  // ranking key: earned fit points + momentum (never margin, which is UNKNOWN until verified)
  const rankKey = x.state === "REJECTED" ? -1 : x.fit.score + 20 * (mom ?? 0) + (sourcing ? 5 : 0);
  return { version: OPPORTUNITY_VERSION, categoryFit: x.fit.score, categoryFitCoverage: x.fit.coverage, marketMomentum: mom == null ? null : Math.round(mom * 100),
    sourcingFeasibility: sourcing == null ? null : 100, expectedMargin: null, recommendation, nextAction, rankKey };
}
