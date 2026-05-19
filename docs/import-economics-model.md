# Import Economics Model

## Purpose

This document defines the canonical import-cost logic for IOTOMASYON.

It exists so the owner can stop relying on spreadsheet-only landed-cost math.

---

## Canonical Example

Example inputs:
- source purchase price: `10 RMB`
- payment commission: `5%`
- weight: `0.2 kg`
- air freight: `8 USD/kg`
- sea freight: `1 USD/kg`
- customs multiplier: `30%`
- RMB/USD: `1 USD = 6.7 RMB`
- USD/TRY: `1 USD = 46 TRY`

Expected air landed cost:

`((10 / 6.7) * 1.05 + (8 * 0.2)) * 1.30 = 4.11731 USD`

Step breakdown:
1. RMB to USD: `10 / 6.7 = 1.492537`
2. Add payment commission: `1.492537 * 1.05 = 1.567164`
3. Add freight: `8 * 0.2 = 1.6`
4. Pre-customs subtotal: `1.567164 + 1.6 = 3.167164`
5. Apply customs multiplier: `3.167164 * 1.30 = 4.11731`

---

## Canonical Formula

For RMB-origin imports:

`((rmb_cost / rmb_usd_rate) * (1 + payment_fee_pct) + (freight_usd_per_kg * weight_kg)) * (1 + customs_pct)`

Where:
- `rmb_cost` = purchase price in RMB
- `rmb_usd_rate` = RMB per 1 USD
- `payment_fee_pct` = payment commission percentage expressed as a decimal uplift
- `freight_usd_per_kg` = air or sea cost per kg in USD
- `weight_kg` = unit weight
- `customs_pct` = customs / import commission percentage

---

## Default Freight Rules

If no override exists:
- `AIR = 8 USD/kg`
- `SEA = 1 USD/kg`

These defaults must remain overridable by:
1. product override
2. route/profile override
3. global default fallback

---

## Required Inputs

Minimum active-use inputs:
- source purchase currency
- source purchase cost
- RMB/USD monthly exchange rate
- USD/TRY monthly exchange rate
- payment commission percentage
- weight in kg
- customs percentage
- shipping method preference
- freight profile or product-specific freight override

---

## Governance Rules

- IOTOMASYON must have one canonical landed-cost engine.
- Spreadsheet logic must not remain the operational source of truth.
- Decision results must preserve the month and assumptions used.
- Procurement, capital allocation, import calculator, and executive reporting must share the same cost engine.

---

## Current Gap Summary

At the time of writing, the current import decision engine is not yet fully aligned with this model.

Known gaps:
- current engine expects USD source price instead of supporting RMB-first input directly
- no RMB/USD monthly rate layer
- no payment commission input in the decision engine
- no route/profile freight governance
- no holding-grade snapshot and approval flow

---

## Canonical Owner Score: ImportOpportunityScore

### Purpose

`ImportOpportunityScore` is the canonical owner-grade ranking metric for import
capital allocation.

It does not answer:
- "is this product operationally healthy?"
- "is this product profitable on a single unit basis?"
- "is this stock urgently low right now?"

It answers:
- "if we allocate fresh import capital to this product now, how fast and how
  safely will that capital grow?"

This distinction is mandatory.

Operational health, stock urgency, and unit profitability may remain separate
supporting signals, but they must not be treated as the same thing as capital
growth priority.

---

## What The Score Must Optimize

The score must rank products by incremental capital efficiency, not by current
stock position.

The primary optimization target is:

`new capital deployed -> expected recoverable net profit over a fixed horizon`

under confidence and stock-risk constraints.

The score must therefore reward:
- fast payback
- strong expected profit over a fixed horizon
- reliable realized demand
- acceptable return behavior
- manageable lead time

The score must penalize:
- weak or manual-only demand confidence
- excessive current stock coverage
- high return rates
- long lead times relative to demand velocity
- incomplete economics inputs

---

## Non-Goals

`ImportOpportunityScore` must not:
- use generic data-completeness points as if they were profit
- collapse stock urgency and capital efficiency into a single hidden formula
- over-reward extreme unit margins on products with tiny throughput
- hide strong out-of-stock products simply because current stock is zero
- rank on current-stock ROI when the decision is about a new order

---

## Canonical Inputs

The score specification assumes the following normalized inputs exist before
ranking starts:

- `effectiveDemandOnline30d`
- `effectiveDemandWholesale30d`
- `effectiveDemandInstaller30d`
- `effectiveDemandMonthly`
- `demandSource`
- `demandConfidenceScore`
- `resolvedSellingPriceTry`
- `resolvedPriceSource`
- `landedUnitCostTry`
- `netProfitPerUnitTry`
- `returnRate`
- `stockQuantity`
- `daysOfCoverage`
- `leadTimeDays`
- `moq`
- `targetCoverageDays`
- `currentDateWindowDays`

If these are not normalized first, downstream ranking is not trustworthy.

---

## Supporting Derived Metrics

Before computing the final score, the engine must calculate these derived
metrics per product.

### 1. Incremental Capital Required

Capital required for the next economically valid buy quantity.

Canonical concept:

`incrementalCapitalRequired = recommendedBuyQty * landedUnitCostTry`

Where `recommendedBuyQty` should already respect:
- target coverage policy
- lead-time consumption
- current stock on hand
- MOQ
- optional budget floor / order practicality rules

### 2. Expected Net Profit Over Horizon

Use a fixed horizon so products with different turnover profiles remain
comparable.

Initial canonical horizon:
- `90 days`

Formula:

`expectedNetProfit90d = expectedUnitsSold90d * netProfitPerUnitTry`

Where:

`expectedUnitsSold90d = min(orderableSellableUnitsWithin90d, demandDrivenUnits90d)`

The exact helper implementation may evolve, but the horizon must stay explicit.

### 3. Payback Days

Estimated number of days for deployed capital to recover from expected net unit
profit and realized demand velocity.

Suggested concept:

`paybackDays = incrementalCapitalRequired / expectedNetProfitPerDay`

Where:

`expectedNetProfitPerDay = (effectiveDemandMonthly / 30) * netProfitPerUnitTry`

If daily profit is zero or negative, payback is treated as invalid / infinite.

### 4. Capital Velocity

How much net profit is expected to be generated per unit of newly deployed
capital over the horizon.

Formula:

`capitalVelocity90d = expectedNetProfit90d / incrementalCapitalRequired`

This is one of the core ranking primitives.

### 5. Stock Penalty

Capital ranking must not aggressively recommend more inventory when current
coverage is already excessive.

Penalty input:
- `daysOfCoverage`
- `targetCoverageDays`

Penalty intent:
- no penalty when coverage is below target
- soft penalty when slightly above target
- strong penalty when materially above target

### 6. Return Penalty

High return rates reduce confidence in apparent profitability.

Penalty input:
- `returnRate`

Penalty intent:
- no penalty at very low return rates
- medium penalty in warning band
- severe penalty when return behavior threatens realized profit quality

### 7. Lead-Time Penalty

Long lead times increase forecast risk and slow capital rotation.

Penalty input:
- `leadTimeDays`
- `paybackDays`
- `effectiveDemandMonthly`

Penalty intent:
- longer lead time should reduce score when demand certainty is weak
- long lead time with low demand should be penalized harder than long lead time
  with strong realized velocity

### 8. Confidence Adjustment

The final score must be confidence-adjusted, not purely arithmetic.

Primary confidence inputs:
- matched realized orders available
- realized-data coverage window
- manual-only demand dependency
- volatility / return noise
- price-source quality

---

## Canonical Formula Shape

The final formula should stay interpretable and banded rather than becoming a
black box.

Recommended shape:

`ImportOpportunityScore = BaseGrowthScore * ConfidenceMultiplier - RiskPenalty`

Where:

`BaseGrowthScore` is driven by:
- `capitalVelocity90d`
- `paybackDays`
- `expectedNetProfit90d`

`ConfidenceMultiplier` is driven by:
- `demandConfidenceScore`
- realized price quality
- matched sales coverage

`RiskPenalty` is driven by:
- `stockPenalty`
- `returnPenalty`
- `leadTimePenalty`
- missing critical inputs

The implementation may normalize these terms to a 0-100 output, but the
semantic structure must remain visible in code and UI.

---

## Recommended Scoring Bands

The final owner-facing band labels should be:

- `CORE_IMPORT`
  - capital should preferentially flow here
  - fast payback, strong confidence, acceptable stock risk

- `TEST_IMPORT`
  - worth importing, but capital exposure should stay controlled
  - limited confidence or moderate operational risk

- `WATCHLIST`
  - monitor; do not prioritize for broad capital deployment yet
  - economics may be positive, but confidence/risk profile is not strong enough

- `DO_NOT_IMPORT`
  - unattractive or unsafe for fresh capital

These labels replace the idea that every score must collapse to a generic
BUY/WAIT/NO decision.

They are specifically designed for capital deployment decisions.

---

## Relationship To Existing Scores

Existing signals may remain, but their roles must be explicitly limited:

- `investmentScore`
  - keep only as a stock ROI visibility metric
  - do not use as primary import capital ranking

- `import decision score`
  - keep for air/sea import method economics and unit economics context
  - do not treat as the final owner capital priority

- `healthScore`
  - keep as importer workflow / data-health signal
  - do not use for capital growth ranking

- `procurement urgency`
  - keep for reorder timing
  - do not use as capital ranking by itself

---

## Explainability Contract

Every product score must be explainable in plain business language.

Minimum required explanation fields:
- score band
- payback days
- expected net profit over 90 days
- incremental capital required
- demand source
- confidence level
- return penalty applied or not
- stock penalty applied or not
- lead-time penalty applied or not
- missing-data warnings

The owner must be able to answer:
- why product A ranks above product B
- which assumption most influenced the result
- whether the weakness is economics, confidence, stock, or lead time

---

## Phase 80 Implementation Checklist

This checklist defines the acceptance path for the documentation-to-code
handoff.

### Phase 80A — Documentation Lock

- add this `ImportOpportunityScore` section to canonical docs
- ensure `NEXT-STEPS.md`, `ROADMAP.md`, `phase-plan.md`, and `current-state.md`
  all reference the same concept
- freeze terminology:
  - `effectiveDemand`
  - `demandConfidenceScore`
  - `incrementalCapitalRequired`
  - `expectedNetProfit90d`
  - `paybackDays`
  - `capitalVelocity90d`
  - `ImportOpportunityScore`

Exit:
- no semantic ambiguity remains in docs

### Phase 80B — Engine Interface Design

- define a new pure TypeScript engine contract
- proposed name:
  - `calculateImportOpportunity()`
- define input/output types
- explicitly separate:
  - base economics
  - demand normalization outputs
  - penalties
  - explainability fields

Exit:
- a developer can implement the engine without inventing business meaning

### Phase 80B Technical Contract

Proposed file:
- `lib/import-opportunity.ts`

This engine must be pure:
- no DB access
- no Prisma imports
- no auth/session dependency
- no UI formatting

It receives already-resolved business inputs and returns a fully explainable
ranking result.

#### Proposed TypeScript Enums

```ts
export type ImportOpportunityBand =
  | "CORE_IMPORT"
  | "TEST_IMPORT"
  | "WATCHLIST"
  | "DO_NOT_IMPORT";

export type DemandSource =
  | "actual_only"
  | "actual_online_plus_manual_b2b"
  | "manual_only"
  | "none";

export type PriceSource =
  | "trendyol_realized"
  | "marketplace_price"
  | "xml_price"
  | "manual_price"
  | "none";

export type PenaltyLevel = "none" | "low" | "medium" | "high";

export type MissingCriticalField =
  | "landedUnitCostTry"
  | "resolvedSellingPriceTry"
  | "netProfitPerUnitTry"
  | "effectiveDemandMonthly"
  | "stockQuantity"
  | "leadTimeDays"
  | "moq";
```

#### Proposed Input Contract

```ts
export interface ImportOpportunityInput {
  productId: string;
  sku?: string | null;
  productName?: string | null;

  // Demand
  effectiveDemandOnline30d: number;
  effectiveDemandWholesale30d: number;
  effectiveDemandInstaller30d: number;
  effectiveDemandMonthly: number;
  demandSource: DemandSource;
  demandConfidenceScore: number; // 0-100
  matchedOrderCount30d: number;
  matchedOrderCount90d: number;

  // Price + cost
  resolvedSellingPriceTry: number | null;
  resolvedPriceSource: PriceSource;
  landedUnitCostTry: number | null;
  netProfitPerUnitTry: number | null;

  // Inventory state
  stockQuantity: number;
  daysOfCoverage: number | null;
  targetCoverageDays: number;
  leadTimeDays: number | null;
  moq: number | null;

  // Risk inputs
  returnRate: number | null; // 0.00 - 1.00

  // Engine controls
  horizonDays?: number; // default 90
  minOrderQty?: number | null;
  budgetCapTry?: number | null;
}
```

#### Input Rules

- all quantity fields are unit counts, never currency
- all TRY fields are VAT/business-policy-resolved values ready for comparison
- `effectiveDemandMonthly` must already be normalized before this engine runs
- `demandConfidenceScore` must be supplied by the demand-normalization layer,
  not recomputed here from scratch
- `returnRate` is a decimal ratio:
  - `0.00` = no returns
  - `0.12` = 12% return rate
- `leadTimeDays` may be null, but null should reduce confidence and/or force a
  conservative result

#### Proposed Output Contract

```ts
export interface ImportOpportunityResult {
  hasCriticalData: boolean;
  missingCriticalFields: MissingCriticalField[];

  // Core ranking result
  score: number; // 0-100
  band: ImportOpportunityBand;

  // Suggested order economics
  recommendedBuyQty: number;
  incrementalCapitalRequiredTry: number | null;
  expectedUnitsSoldWithinHorizon: number | null;
  expectedNetProfitHorizonTry: number | null;
  expectedNetProfitPerDayTry: number | null;
  paybackDays: number | null;
  capitalVelocityHorizon: number | null;

  // Penalties / adjustments
  stockPenaltyLevel: PenaltyLevel;
  stockPenaltyPoints: number;
  returnPenaltyLevel: PenaltyLevel;
  returnPenaltyPoints: number;
  leadTimePenaltyLevel: PenaltyLevel;
  leadTimePenaltyPoints: number;
  confidenceMultiplier: number;

  // Explainability
  summaryReason: string;
  strengths: string[];
  risks: string[];
  warnings: string[];
}
```

#### Output Semantics

- `score` is the final owner ranking metric
- `band` is the owner-facing decision bucket
- `recommendedBuyQty` must respect MOQ and coverage logic
- `incrementalCapitalRequiredTry` is the fresh capital that would be tied to the
  recommended order
- `expectedUnitsSoldWithinHorizon` must never exceed plausible demand for the
  selected horizon
- `capitalVelocityHorizon` is expected profit / fresh capital over the horizon
- `summaryReason` is a 1-line human-readable reason for the result

#### Required Invariants

- if `netProfitPerUnitTry <= 0`, band must be `DO_NOT_IMPORT`
- if `effectiveDemandMonthly <= 0`, band must be `DO_NOT_IMPORT` or at most
  `WATCHLIST` depending on policy, but never `CORE_IMPORT`
- if critical cost/price fields are missing, `hasCriticalData` must be false
- `score` must be clamped to `0-100`
- `recommendedBuyQty` must never be negative
- `incrementalCapitalRequiredTry` must equal `recommendedBuyQty * landedUnitCostTry`
  when both values exist

#### Recommended Calculation Order

1. Validate critical fields
2. Resolve horizon days
3. Resolve recommended buy quantity
4. Compute incremental capital
5. Compute expected horizon sales
6. Compute expected horizon profit
7. Compute payback
8. Compute penalties
9. Apply confidence multiplier
10. Clamp score
11. Map score to band
12. Build explainability arrays

### Phase 80C — Test Matrix Definition

Define test cases before rollout:
- high velocity + high margin + low stock
- high margin + tiny demand
- strong demand + long lead time
- strong demand + high return rate
- manual-only demand
- overstocked but profitable
- out-of-stock but high-confidence winner
- missing cost inputs
- missing price inputs
- MOQ too high relative to safe capital

Exit:
- expected band and explanation fields are known for each case

### Phase 80C Concrete Test Matrix

The following table defines the minimum acceptance cases for the engine.

#### Case 1 — Fast winner, low stock

Input profile:
- high demand
- positive realized sales
- low days of coverage
- healthy margin
- low return rate
- reasonable lead time

Expected:
- `band = CORE_IMPORT`
- high score
- low or no penalties
- `summaryReason` mentions fast payback and strong demand confidence

#### Case 2 — High margin, tiny demand

Input profile:
- very high unit profit
- very low monthly demand
- low matched order count

Expected:
- not `CORE_IMPORT`
- likely `TEST_IMPORT` or `WATCHLIST`
- reason mentions weak throughput despite strong unit economics

#### Case 3 — Strong demand, long lead time

Input profile:
- high demand
- good margin
- long lead time

Expected:
- positive score
- lead-time penalty applied
- may remain `CORE_IMPORT` only if confidence and velocity are strong enough

#### Case 4 — Strong demand, high return rate

Input profile:
- strong realized sales
- acceptable unit margin
- high return rate

Expected:
- return penalty must materially reduce score
- band should degrade vs equivalent low-return product

#### Case 5 — Manual-only demand

Input profile:
- no matched sales history
- manual B2B/online estimate exists

Expected:
- confidence multiplier reduced
- cannot rank equal to equivalent realized-demand product
- likely `TEST_IMPORT` or `WATCHLIST`

#### Case 6 — Overstocked but profitable

Input profile:
- profitable
- high stock
- days of coverage well above target

Expected:
- stock penalty applied
- score suppressed even if margin is healthy
- likely `WATCHLIST`

#### Case 7 — Out of stock but high-confidence winner

Input profile:
- stock near zero
- strong realized demand
- healthy margin
- low return rate

Expected:
- must not be punished simply because current stock is zero
- should still score as `CORE_IMPORT` or strong `TEST_IMPORT`

#### Case 8 — Missing cost input

Input profile:
- no landed unit cost

Expected:
- `hasCriticalData = false`
- missing fields include `landedUnitCostTry`
- no positive band outcome

#### Case 9 — Missing selling price input

Input profile:
- no resolved price

Expected:
- `hasCriticalData = false`
- missing fields include `resolvedSellingPriceTry`
- band must not be `CORE_IMPORT`

#### Case 10 — Negative unit profit

Input profile:
- valid demand
- valid cost
- negative per-unit profit

Expected:
- `band = DO_NOT_IMPORT`
- score near floor
- reason must explicitly mention negative unit economics

#### Case 11 — MOQ too high

Input profile:
- promising unit economics
- MOQ forces too much capital exposure

Expected:
- capital required spikes
- score decreases
- warnings mention MOQ-driven capital risk

#### Case 12 — Lead time missing

Input profile:
- healthy economics
- `leadTimeDays = null`

Expected:
- score may remain positive but confidence and/or risk warnings must degrade result
- never treated as fully trusted `CORE_IMPORT` without policy approval

#### Case 13 — Very high confidence but medium margin

Input profile:
- strong matched sales
- medium margin
- low returns
- low lead time

Expected:
- can outrank a higher-margin but low-confidence product
- proves confidence matters in final ranking

#### Case 14 — One-order illusion

Input profile:
- one recent order
- extreme margin
- almost no history

Expected:
- must not receive winner-level score
- demand confidence suppression required

#### Case 15 — Safe B2B replenishment

Input profile:
- modest Trendyol demand
- stronger wholesale/installer demand
- low return exposure

Expected:
- score can still be healthy if effective monthly demand is strong
- explanation should show mixed-source demand, not marketplace-only logic

### Phase 80D — Migration Safety Planning

- identify whether snapshot v2 needs schema changes
- if yes, document additive-only migration plan
- define backfill stance:
  - no historical rewrite by default
  - old snapshots remain readable under old schema

Exit:
- later implementation cannot accidentally break historical explainability

---

## Updated Gap Summary

At the time of writing, the current system has enough import data to support
owner-grade ranking, but the canonical score is not yet implemented.

Known gaps now are:
- no canonical `ImportOpportunityScore` engine
- demand normalization is not yet unified across all decision surfaces
- landed-cost truth can still diverge across pages
- current capital ranking still depends too heavily on stock-bound investment scoring
- explainability and snapshot governance are not yet sufficient for the new score
