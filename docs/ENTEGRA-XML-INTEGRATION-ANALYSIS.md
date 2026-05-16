# Entegra XML Integration Analysis

## Purpose

This document explains how the Entegra XML export screen can be used as a future input for IOTOMASYON roadmap phases.

This is not an implementation document.

It is a planning and data-governance analysis based on:
- the observed Entegra XML form UI
- current IOTOMASYON roadmap direction
- current schema and product/CRM scope

---

## What Was Observed

The Entegra XML form appears to support configurable product feed generation with:

- XML name
- XML file name
- XML header/body/footer templating
- category separator
- category filter
- brand filter
- custom SQL filtering
- stock rules
- critical stock rules
- price multiplier
- variant sale price calculation
- image group selection
- image SQL option
- warehouse/depot selection
- decimal precision
- automatic XML inclusion
- gzip output
- e-commerce send flag
- target/feed presets such as:
  - Akakçe
  - Merchant
  - Eptt
  - Sitemap
  - Son Teklif
  - Evidea
  - Modanisa
  - Toptantr
  - Capsule

Important observed signal:
- the UI exposes a strong custom SQL layer
- the UI description suggests filtering against `product` and `productCompatibles`
- the UI appears capable of producing different feed variants from the same product base

---

## Strategic Interpretation

This is not just a simple XML export feature.

Operationally, it behaves like a feed-generation engine.

That means it can become a source for:
- inventory visibility
- listing registry
- marketplace eligibility
- data hygiene checks
- feed governance
- channel-specific product distribution

For IOTOMASYON, the XML layer is valuable because it sits between:
- internal product data
- stock visibility
- marketplace/channel outputs
- operational rules

---

## Roadmap Fit

### Phase 11 — XML Inventory Sync

This is the most direct roadmap match.

Potential use:
- register XML sources generated from Entegra
- fetch XML periodically
- parse stock/price/product payloads
- compare source feed vs internal product records
- build sync logs and failed-sync alerts

Most realistic scope:
- read-only XML ingestion first
- no automatic destructive writes
- preview/diff before applying updates

Why it matters:
- stock and price information may already be operationally shaped in Entegra
- this can accelerate Phase 11 without building a full native feed system first

---

### Phase 12 — Marketplace Listing Registry

Potential use:
- track which product set belongs to which XML feed
- track channel-oriented XML configurations
- map one operational product catalog to multiple channel outputs

Example:
- one product may appear in:
  - general merchant feed
  - Akakçe feed
  - wholesale feed
  - category-specific feed

Useful future model:
- listing/feed profile ownership by channel

---

### Phase 13 — Marketplace Monitoring

Potential use:
- compare products that should appear in a feed vs products that actually appear
- identify products excluded by stock/category/brand/filter conditions
- detect feed coverage gaps

Example alert candidates:
- stock exists but product is excluded from XML feed
- product should be in marketplace feed but missing
- product is still exported despite invalid stock rule
- stale XML profile not updated recently

---

### Phase 14 — Trendyol API Integration (Read Only)

Potential use:
- enrich read-only marketplace analytics with feed membership context
- identify whether a missing listing is caused by:
  - missing XML inclusion
  - invalid category/brand filter
  - stock exclusion
  - data quality issue

This would improve marketplace intelligence before any write-side automation.

---

### Phase 15 — Marketplace Profit Dashboard

Indirect use:
- channel feed membership can later be connected with sales/profitability data
- this helps answer:
  - which feed groups produce revenue
  - which exported products do not convert
  - which channels expose inventory without enough margin

This phase should not depend on XML alone, but XML feed membership can become a useful signal.

---

### Phase 23 — Data Hygiene / SKU Governance

This is one of the strongest future uses.

Potential use:
- identify missing category data
- detect broken feed logic
- detect products excluded because of incomplete attributes
- validate which products are not export-ready

Examples:
- missing barcode
- missing category
- invalid price
- stock below threshold but still exported
- wrong warehouse mapping
- image group missing

The custom SQL/filter layer suggests Entegra already has operational logic for product readiness.

That can be audited and gradually formalized inside IOTOMASYON.

---

## What We Can Probably Use From This Screen

### 1. Feed Profile Concept

This screen strongly suggests that Entegra supports multiple named XML profiles.

That means IOTOMASYON should eventually model:
- feed profile name
- output filename
- intended channel
- target warehouse
- category/brand scope
- stock rule set
- pricing rule set
- active/inactive state

This is more powerful than treating XML as a single global source.

---

### 2. Product Eligibility Logic

The screen contains multiple exclusion/inclusion levers:
- stock filters
- critical stock rules
- category filters
- brand filters
- warehouse selection
- SQL rules

This means feed membership is not trivial.

Future value:
- IOTOMASYON can model why a product is included or excluded
- this can become marketplace readiness logic later

---

### 3. Custom SQL as Operational Intelligence

The custom SQL field is the most powerful and risky part.

Strategic value:
- it allows highly targeted product sets
- it may already encode business logic that is not visible elsewhere

Future use:
- reverse-map important XML SQL rules into governed application rules
- convert fragile hidden filters into documented business logic

Risk:
- SQL-defined business logic can become invisible technical debt

Recommendation:
- if XML integration begins later, every XML profile should store:
  - SQL text
  - human-readable purpose
  - owner
  - risk note

---

### 4. Multi-Channel Feed Variants

The visible preset buttons suggest different channel or consumer outputs already exist.

This supports future:
- marketplace listing registry
- feed-to-channel mapping
- channel readiness scoring
- monitoring by target output

IOTOMASYON should not assume one XML = one business purpose.

It should assume:
- many XML profiles
- many rules
- many consumers

---

## Recommended Future Data Model

This is not a current schema instruction.

It is a future planning model.

### XMLFeedProfile

Potential fields:
- `id`
- `name`
- `sourceSystem`
- `sourceType` (`entegra_xml`)
- `xmlUrl`
- `fileName`
- `targetChannel`
- `categoryFilterText`
- `brandFilterText`
- `customSql`
- `warehouseCode`
- `stockRule`
- `criticalStockRule`
- `priceMultiplier`
- `variantPriceMode`
- `imageGroup`
- `decimalPrecision`
- `gzipEnabled`
- `isActive`
- `lastFetchedAt`
- `lastSuccessAt`
- `lastErrorAt`
- `lastErrorMessage`
- `ownerUserId`

### XMLFeedRun

Potential fields:
- `id`
- `feedProfileId`
- `startedAt`
- `finishedAt`
- `status`
- `sourceHash`
- `productCount`
- `warningCount`
- `errorCount`
- `logSummary`

### XMLFeedProductSnapshot

Potential fields:
- `id`
- `feedRunId`
- `externalSku`
- `externalBarcode`
- `title`
- `stock`
- `price`
- `currency`
- `categoryText`
- `brandText`
- `rawItemHash`
- `isIncluded`
- `exclusionReason`

### XMLFeedRuleAudit

Potential fields:
- `id`
- `feedProfileId`
- `ruleType`
- `ruleValue`
- `humanPurpose`
- `riskLevel`

---

## Recommended Implementation Order

### Step 1 — Read-Only Registry

Do first:
- register XML profile metadata
- no writes into product master yet
- store URL and purpose only

Goal:
- know which XMLs exist and why

### Step 2 — Fetch + Parse

Do next:
- fetch XML
- parse items
- log run results

Goal:
- observability before mutation

### Step 3 — Diff / Preview

Do next:
- compare parsed XML products with internal products
- show missing/mismatched records

Goal:
- safe operational visibility

### Step 4 — Controlled Sync Rules

Do later:
- define which fields may update
- define approval boundaries
- no silent overwrite

Goal:
- safe synchronization

This order matches the roadmap philosophy:
- read before write
- visibility before automation
- governance before destructive actions

---

## Risks

### Hidden SQL Logic Risk

If important business logic only exists in XML SQL fields:
- it becomes undocumented operational debt
- it is difficult to audit
- feed behavior becomes fragile

### Feed Drift Risk

If Entegra XML profile settings change outside IOTOMASYON:
- product coverage can change silently
- marketplace exposure can drift
- reporting can become misleading

### Stock Meaning Risk

Observed stock controls suggest exported stock may not equal physical stock.

Examples:
- critical stock offsets
- warehouse-specific stock
- threshold-based exclusion

This means future inventory intelligence must distinguish:
- physical stock
- export stock
- marketplace-visible stock

### Pricing Semantics Risk

Price multiplier and variant pricing imply:
- exported price may differ from internal base price
- profitability logic must not trust XML price blindly

### Channel Ambiguity Risk

A feed profile may target:
- Google Merchant
- comparison sites
- wholesale partner
- internal sitemap/export consumer

Different feed purposes should not be mixed into one generic integration model.

---

## Recommended Future Questions Before Implementation

Before Phase 11 starts, answer:

1. How many active XML profiles exist today?
2. Which channels consume them?
3. Which profiles are business-critical?
4. Which profiles use custom SQL?
5. Which fields are stable across all XML outputs?
6. Is XML primarily:
   - product catalog export
   - stock export
   - price export
   - marketplace feed
   - all of the above
7. Which stock number is authoritative:
   - product stock
   - warehouse stock
   - export-adjusted stock
8. Are XML URLs public, authenticated, or local-network only?
9. Who currently owns XML profile maintenance?
10. Which fields must never be overwritten automatically?

---

## Minimum Safe Future Phase Scope

If work begins later, the safest first XML phase should be:

- XML profile registry
- read-only fetch
- feed run logs
- parsed item preview
- mismatch reporting

Not in first step:
- automatic stock overwrite
- automatic price overwrite
- automatic marketplace write sync
- destructive product rewrites

---

## Summary

The Entegra XML area appears to be a configurable feed engine, not a simple export button.

For IOTOMASYON, this can become a strong source for:
- Phase 11 XML Inventory Sync
- Phase 12 Listing Registry
- Phase 13 Monitoring
- Phase 23 Data Hygiene

Best future approach:
- treat each XML as a governed feed profile
- ingest read-only first
- log and diff before any write-side sync
- never trust hidden SQL/filter logic without documenting it
