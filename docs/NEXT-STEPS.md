# NEXT STEPS

## Mission

This file defines execution priority from current state.

It answers one operational question:

What should be built next, in what order?

`ROADMAP.md` defines the target architecture.

`PROGRESS.md` defines the factual implementation state.

`NEXT-STEPS.md` defines the immediate execution stack between those two documents.

---

## Current Reality

Current reality:
- CRM foundation exists
- quote workflow v1 exists
- relationship engine exists
- task and outreach foundations exist
- Turkish location layer exists
- RBAC complete and production-active (Phase 5 ✓)
- customer intelligence fields live: customerType, monthlySalesPotential, platformNotes (Phase 6 ✓)
- inventory intelligence complete: barcode, imageUrl, supplier, stockSource/Confidence, lastStockSyncAt, lastStockCountBy, reorderLeadTime, shippingCost, marketplaceCommission (Phase 7 ✓)
- financial intelligence systems do not exist yet

This means the product is operationally useful for internal CRM and quote workflows and is ready for multi-user rollout.
Not yet ready for:
- owner-grade financial intelligence
- marketplace intelligence
- procurement intelligence
- capital allocation intelligence

---

## Immediate Priority Stack

### Priority 0 — Safety and Data Governance Baseline

Why:
Schema-heavy phases should not proceed without minimum migration and data-governance safety rules.

Includes:
- migration safety checklist
- backup/rollback discipline
- duplicate SKU/barcode awareness
- missing cost/category/link reports as future checks
- no destructive production operations without explicit approval

Clarification:
- this does not mean fully implementing Phase 23 and Phase 24 now
- it means maintaining minimum safety rules as Phase 7+ implementation proceeds

### Priority 1 — Phase 8: Profitability Engine

Why:
The system must know whether products make money before it can make recommendations.

Deliverables:
- unit cost model
- shipping and packaging cost logic
- marketplace service fee model
- payment fee model
- VAT impact model
- defect/return reserve model
- landed cost history
- margin and ROI calculations

Acceptance:
- products can show meaningful profitability metrics
- losing products can be identified
- profitability is consistent enough to support later planning phases

### Priority 2 — Phase 11: XML Inventory Sync

Why:
Inventory intelligence should connect to real external inventory signals before marketplace analytics grows.

Deliverables:
- XML source configuration
- scheduled sync architecture
- sync logs
- failed sync alerts
- manual override protection
- price update preview before applying

Acceptance:
- XML source can be configured safely
- sync operations are observable
- external updates do not blindly overwrite trusted manual data

### Priority 3 — Phase 12–15: Marketplace Read Intelligence

Why:
Read-side marketplace visibility should exist before any write-side marketplace operations are considered.

Deliverables:
- listing registry
- listing monitoring
- Trendyol read-only integration
- marketplace profitability dashboard

Acceptance:
- the system knows where products are live
- broken or missing listings can be identified
- marketplace orders/returns/commissions can be read
- channel visibility exists without write-side risk

### Priority 4 — Phase 9–10: Decision Intelligence

Why:
Demand scoring and capital allocation should only be built after inventory and profitability data become reliable.

Deliverables:
- sales potential engine
- projected revenue and profit model
- investment score
- capital reserve rules
- allocation engine with admin approval

Acceptance:
- product investment scoring becomes defensible
- capital suggestions are explainable
- no automated capital deployment occurs without admin approval

### Priority 5 — Phase 19+: Procurement / Executive Intelligence

Why:
These phases are high-value but depend on reliable data from earlier phases.

Deliverables:
- procurement assistant logic
- supplier intelligence
- import cost calculator
- executive KPI dashboard
- data hygiene/governance
- migration safety rules

Acceptance:
- procurement signals are based on real inputs
- supplier comparison is meaningful
- admin can evaluate imports before buying
- executive dashboard reflects business health quickly
- production data safety controls are documented and enforced

---

## Blockers

Phase dependencies:

- Phase 5 ✓ complete — multi-user rollout is now safe.
- Phase 6 ✓ complete — customer intelligence fields are production-active.
- Phase 7 ✓ complete — inventory intelligence fields are production-active.
- Phase 8 depends on Phase 7 because profitability depends on inventory cost structure.
- Phase 9 depends on Phase 8 because investment scoring without profitability is weak.
- Phase 10 depends on Phase 8 and Phase 9 because capital allocation without cost and demand quality is dangerous.
- Phase 11 should arrive before deep marketplace intelligence because external stock feeds affect listing accuracy.
- Phase 12 and Phase 13 should exist before any marketplace automation because visibility must come before control.
- Phase 14 must remain read-only until listing registry and monitoring are stable.
- Phase 15 depends on Phase 14 because marketplace profitability requires marketplace read data.
- Phase 19 depends on Phase 7, Phase 8, Phase 9, and Phase 20 because procurement logic needs inventory, profitability, demand, and supplier inputs.
- Phase 22 depends on multiple earlier phases because executive KPIs are only useful if underlying systems are trustworthy.
- Phase 23 and Phase 24 should not be ignored because data quality and production safety can invalidate later intelligence work.
- Priority 0 should be treated as a baseline operating rule before schema-heavy work expands.

---

## Anti-Scope Rules

DO NOT start:
- marketplace write sync
- ERP complexity
- public auth
- SaaS multi-tenant ideas
- capital automation without admin approval
- profitability features before cost structure is trustworthy
- procurement intelligence before inventory and profitability foundations are ready

---

## Working Rule

When execution priority changes:
- update `PROGRESS.md` if reality changed
- update `ROADMAP.md` if target architecture changed
- update `NEXT-STEPS.md` if immediate build order changed
