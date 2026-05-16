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
- inventory intelligence complete (Phase 7 ✓)
- profitability engine complete: per-channel net profit, margin %, ROI %, losing product detection (Phase 8 ✓)
- sales potential engine complete (Phase 9 ✓): investment score 0–100, BUY/WAIT/DO_NOT_BUY signal
- capital allocation engine complete (Phase 10 ✓)
- XML inventory sync complete (Phase 11 ✓)
- marketplace listing registry complete (Phase 12 ✓): /marketplace, 8 platforms, create/edit/delete, product + responsible links
- marketplace monitoring complete (Phase 13 ✓): /marketplace/monitoring, gap/problem/stale alerts, auto task creation
- Trendyol API integration complete (Phase 14 ✓): /admin/trendyol config page, /marketplace/trendyol live orders+returns dashboard, singleton config, save+test server actions
- marketplace profit dashboard complete (Phase 15 ✓): /marketplace/profit, platform breakdown, winners/losers/missing-data/high-stock alerts
- marketplace operations expansion complete (Phase 16 ✓): Q&A module (fetch + inline answer with audit log), Return Action Center (approve/reject claims with issue reasons), Product Mapping registry, Monthly Exchange Rate management, 4 DB tables, 6 new permissions
- quote professionalization 2.0 complete (Phase 18 ✓): reusable quote templates (QuoteTemplate + QuoteTemplateItem), /quotes/templates management page, template loading into quote form, product auto price-fill from sellingPriceTry, 2 new permissions (quoteTemplates.read/write)

This means the product is operationally useful for internal CRM, quote workflows (with templates), and active Trendyol marketplace operations. Ready for multi-user rollout.
Not yet ready for:
- owner-grade executive KPI dashboard (Phase 22)
- procurement intelligence (Phases 19–21)
- marketplace sync/write architecture (Phase 17, DEFERRED)

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

### Priority 1 — Phase 19: Procurement Intelligence

Why:
Phase 18 (quote professionalization) is complete. The next high-value gap is procurement decision support — giving the owner actionable signals on when and what to buy based on stock levels, investment scores, lead times, and supplier data.

Deliverables:
- procurement signal engine: reorder urgency per product (low stock + high demand + lead time)
- supplier-aware reorder recommendations
- expected cash conversion time per purchase
- actionable purchasing assistant output page (/admin/procurement or similar)

Acceptance:
- procurement page renders ranked purchase candidates with urgency signals
- reorder urgency accounts for stockQuantity, reorderLeadTime, investmentScore, demand estimates
- page is admin/EXECUTIVE_READ only
- tsc clean, Vercel deploy READY, browser-tested

### Priority 2 — Phase 20+: Supplier Intelligence / Executive KPI

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
- Phase 8 ✓ complete — per-channel profitability engine is production-active.
- Phase 9 ✓ complete — investment score and BUY/WAIT/DO_NOT_BUY signal are production-active.
- Phase 10 ✓ complete — admin capital allocation page with ranked purchase suggestions and reserve safety.
- Phase 11 ✓ complete — XML inventory sync is production-active.
- Phase 12 ✓ complete — Marketplace listing registry is production-active.
- Phase 13 ✓ complete — Marketplace monitoring dashboard is production-active.
- Phase 14 ✓ complete — Trendyol API integration (read-only) is production-active.
- Phase 15 ✓ complete — Marketplace profit dashboard is production-active.
- Phase 16 ✓ complete — Marketplace Operations Expansion is production-active.
- Phase 18 ✓ complete — Quote Professionalization 2.0 is production-active.
- Phase 11 provides real stock feed data that improves allocation accuracy.
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
