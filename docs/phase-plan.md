# Phase Plan

## Planning Principle

Execution rules:
- build dependency-first
- no premature marketplace sync
- no financial intelligence before cost model
- no write operations before read intelligence
- no multi-user rollout before RBAC
- Phase 24 is not only a late roadmap phase; it is also a recurring safety discipline

Additional principle:
- roadmap order is strategic
- implementation order must respect dependencies, not just numbering
- no new finance, import, or marketplace pricing layer should be built on top of unresolved field-sprawl

Precondition for later finance phases:
- operator-facing product finance fields must be consolidated before continuing deeper work on marketplace margin policy, import economics, holding governance, or marketplace pricing normalization

---

## Parallel Safety Track

Phase 24 must run in parallel before every schema-heavy phase, especially before:
- Phase 5 RBAC
- Phase 7 Inventory Intelligence
- Phase 8 Profitability Engine
- Phase 11 XML Sync
- Phase 12 Marketplace Listing Registry
- Phase 14 Trendyol API Integration

Rule:
Every schema/migration task must include:
- pre-migration checklist
- production backup confirmation
- rollback note
- migration risk note
- build/typecheck validation
- production write approval when needed

This means Phase 24 is not only a late roadmap phase.
It is also a recurring safety discipline that must be applied throughout execution.

---

## Recommended Execution Order

### Phase 5

Why now:
- safe multi-user rollout is impossible without permissions

Dependency:
- existing single internal auth foundation

Risk:
- weak permission design will create security and ownership confusion later

Completion signal:
- role model exists
- permission matrix exists
- server-side permission enforcement exists
- sidebar visibility is permission-aware

### Phase 6

Why now:
- customer records already exist, but sales intelligence does not

Dependency:
- customer CRM foundation

Risk:
- without segmentation, CRM remains operationally shallow

Completion signal:
- customer type and opportunity context become actionable

### Phase 7

Why now:
- inventory intelligence is required before profitability or procurement logic

Dependency:
- product and category foundations

Risk:
- weak inventory memory will poison later financial intelligence

Completion signal:
- stock data becomes traceable and operationally trustworthy

### Phase 8

Why now:
- profit logic should come after inventory/cost memory

Dependency:
- Phase 7

Risk:
- profitability before cost accuracy will produce false decisions

Completion signal:
- losing products become identifiable through real metrics

### Phase 11

Why now:
- external stock intelligence should arrive before deep marketplace analysis

Dependency:
- Phase 7

Risk:
- poor XML architecture can destabilize product/inventory trust

Completion signal:
- XML sync becomes observable, reviewable, and safe

### Phase 12

Why now:
- listing visibility should exist before listing monitoring or integrations

Dependency:
- product identity and inventory foundations

Risk:
- weak listing registry makes every marketplace layer unreliable

Completion signal:
- the system knows where products are live and how listings relate to SKUs

### Phase 13

Why now:
- once listings are known, they can be monitored

Dependency:
- Phase 12

Risk:
- monitoring without a trusted registry creates noisy alerts

Completion signal:
- listing gaps and stale states become detectable

### Phase 14

Why now:
- read intelligence is the safe first integration step

Dependency:
- Phase 12 and Phase 13

Risk:
- integrating too early creates write-side pressure before visibility is stable

Completion signal:
- Trendyol data can be read without any write-side operations
- orders are persisted locally with trusted newest-first visibility
- returns are persisted locally and can be linked back to order rows

### Phase 15

Why now:
- marketplace profitability needs marketplace read data

Dependency:
- Phase 14

Risk:
- fake profitability conclusions if order/return/commission data is incomplete

Completion signal:
- per-platform profitability becomes visible
- standard vs. override marketplace cost policy is explicit
- realized margin can be ranked without workbook fallback

### Phase 9

Why now:
- sales potential should follow profitability and data quality improvements

Dependency:
- Phase 7 and Phase 8

Risk:
- demand scoring without cost truth becomes misleading

Completion signal:
- product investment scoring begins to make operational sense

### Phase 10

Why now:
- capital allocation is a later decision system, not a base feature

Dependency:
- Phase 8 and Phase 9

Risk:
- dangerous owner-facing recommendations if built on weak assumptions

Completion signal:
- admin receives explainable capital suggestions with approval gating

### Phase 18

Why now:
- quote workflow v1 exists, so quote workflow v2 optimization can be justified later

Dependency:
- stable quote workflow v1

Risk:
- polishing speed too early instead of building business intelligence

Completion signal:
- quote creation becomes faster and more reusable

### Phase 19

Why now:
- procurement needs inventory, profitability, supplier, and demand context

Dependency:
- Phase 7, Phase 8, Phase 9, Phase 20

Risk:
- procurement suggestions become irresponsible without reliable data

Completion signal:
- procurement assistant outputs become actionable
- import recommendations can explain AIR/SEA choice and capital-at-risk with trusted landed-cost inputs

### Phase 20

Why now:
- supplier intelligence supports procurement quality

Dependency:
- stable product and cost direction

Risk:
- supplier logic without real landed-cost context will be shallow

Completion signal:
- suppliers can be compared by reliability and commercial value
- supplier-specific import defaults can feed the landed-cost engine

### Phase 21

Why now:
- pre-purchase import evaluation supports capital and procurement decisions

Dependency:
- supplier and cost direction

Risk:
- weak calculator assumptions create false buy decisions

Completion signal:
- admin can evaluate landed cost before buying
- RMB-first import formula is implemented exactly
- payment commission and freight profile defaults are visible and auditable

### Phase 22

Why now:
- executive dashboards should aggregate trustworthy systems, not replace them

Dependency:
- multiple earlier intelligence phases

Risk:
- dashboards become pretty but strategically false if built too early

Completion signal:
- admin can understand business health quickly from one screen
- executive KPIs reflect the same landed-cost truth as procurement and import decisions

### Phase 23

Why now:
- automation and intelligence will fail if data governance is weak

Dependency:
- broader data model maturity

Risk:
- duplicate/broken data undermines every later system

Completion signal:
- bad product data becomes visible before it damages decisions

### Phase 24

Why now:
- migration and production safety must exist before the system becomes more complex, and the same rules must be reused as a recurring discipline before every schema-heavy phase

Dependency:
- none, but operationally urgent before deep later phases

Risk:
- production risk grows with schema complexity

Completion signal:
- production changes become safer and more governable

### Phase 16

Why now:
- after the first marketplace read-intelligence stack stabilizes

Dependency:
- Phase 12 to Phase 15

Risk:
- adding multiple platforms too early multiplies complexity

Completion signal:
- additional marketplaces become visible without destabilizing architecture
- explicit marketplace product mapping becomes persistent and backfillable
- unmatched records can be resolved without repetitive manual rematching

### Phase 25

Why now:
- the owner needs a better daily product operations surface before asking the system to absorb even more intelligence layers

Dependency:
- stable product list foundation
- trusted product identity and primary-image behavior

Risk:
- if product triage remains clumsy, the owner keeps falling back to manual scanning habits

Completion signal:
- product list supports fast search, stock-only filtering, and operational sorting without clutter

### Phase 26

Why now:
- once product operations are smoother, the next bottleneck is ranking products by recent commercial performance

Dependency:
- Phase 25
- trustworthy sales snapshot / aggregation inputs

Risk:
- fake 30-day ranking logic will create false confidence and bad buying decisions

Completion signal:
- products can be ranked by recent sales, revenue, and trusted realized margin

### Phase 27

Why now:
- after list operations and ranking improve, the owner needs native control over product media and product content

Dependency:
- Phase 25
- safe media/storage strategy

Risk:
- rich content work without storage and deletion rules will create broken product pages and asset sprawl

Completion signal:
- multi-image and rich description workflows are manageable inside IOTOMASYON without external workarounds

### Phase 28

Why now:
- once products are easier to search, rank, and edit, the system must protect private sourcing intelligence and curated product truth

Dependency:
- Phase 5
- Phase 25
- Phase 27
- clear XML field-governance rules

Risk:
- without governance, imports overwrite curated content and sensitive sourcing notes leak to the wrong users

Completion signal:
- private notes, supplier context, edit permissions, and XML overwrite boundaries are operationally trustworthy

### Phase 30

Why now:
- the current import decision cockpit is useful but not yet aligned with the owner's real landed-cost formula
- field consolidation must happen first so RMB-first import inputs are not buried under overlapping legacy cost fields

Dependency:
- product finance field consolidation
- Phase 19
- Phase 20
- Phase 21

Risk:
- if RMB-first math is wrong or incomplete, procurement, capital, and import recommendations all become misleading
- if overlapping cost fields remain operator-visible, the owner will continue reconciling multiple truths manually

Completion signal:
- the owner formula is represented exactly
- default freight fallback works correctly
- import-cost logic becomes reusable across modules

### Phase 31

Why now:
- once the formula is correct, governance and auditability become the next bottleneck

Dependency:
- product finance field consolidation
- Phase 30

Risk:
- without snapshots and approval controls, import decisions drift as rates and defaults change

Completion signal:
- import decisions are historically explainable and governable at holding level

### Phase 32

Why now:
- once import and marketplace margin logic are normalized, marketplace-specific effective pricing needs its own canonical truth layer

Dependency:
- product finance field consolidation
- Phase 15
- Phase 30

Risk:
- if XML prices, manual overrides, shipping, and commission stay fragmented, marketplace revenue numbers cannot be trusted
- if generic product-level marketplace fields remain the daily workflow, per-marketplace normalization will stay confusing even if the backend logic is correct

Completion signal:
- XML and manual marketplace prices are governed separately
- active marketplace price is derived consistently
- per-marketplace net remaining revenue is visible and trustworthy
- one canonical marketplace pricing engine is reused across modules

### Phase 17

Why now:
- only after read-side visibility and governance are proven

Dependency:
- Phase 12 to Phase 16 and explicit architecture review

Risk:
- write-side marketplace control is dangerous if introduced prematurely

Completion signal:
- only start after approval; not a default next step

---

## Dangerous Execution Paths

Avoid these mistakes:
- building marketplace sync too early
- building profitability before cost accuracy
- building procurement before reliable inventory and profitability data
- building capital recommendations before approval controls
- building write-side marketplace controls before read intelligence stabilizes
- adding image uploads without storage strategy
- building product revenue rankings before trustworthy sales snapshots exist
- letting XML overwrite curated product content after manual editing begins
- mixing private supplier intelligence with shared product notes
- pretending roadmap phases are implemented because the names exist
- treating live Trendyol API windows as a complete order archive
- building marketplace margin ranking before order/return persistence and effective-cost policy are trustworthy
- forcing operators to rematch the same marketplace barcode/SKU repeatedly instead of using persistent mapping
- treating the import cockpit as complete before RMB/USD, payment commission, and freight-profile logic are implemented
- allowing procurement and executive dashboards to diverge from the canonical landed-cost engine
- allowing marketplace price, shipping, commission, and net revenue logic to diverge across multiple files or screens

---

## AI Execution Rules

Codex / AI rules:
- read `ROADMAP.md` first
- read `PROGRESS.md` second
- never assume roadmap means implemented
- update docs when reality changes
- do not mark incomplete work as complete
- respect dependency-first execution
