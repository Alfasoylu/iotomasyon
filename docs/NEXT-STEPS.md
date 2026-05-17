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
- RBAC is production-active
- inventory, profitability, XML import, marketplace read intelligence, supplier intelligence, import calculator, executive dashboard, and import decision engine all exist in some form

This means the product is already useful for:
- internal CRM operations
- quote workflows
- XML-driven inventory intake
- Trendyol read-side operations
- pre-purchase import evaluation
- owner-grade executive review
- import buy/skip decisions replacing the old workbook

Not yet ready for:
- marketplace sync/write architecture
- advanced product operations UX that can replace manual catalog triage habits
- sales-ranked product list behavior driven by recent performance data
- rich product media/content authoring inside the native product workflow
- owner-only product intelligence with stricter curated-field protection

---

## Immediate Priority Stack

### Priority 0 - Safety and Data Governance Baseline

Why:
Schema-heavy phases should not proceed without minimum migration and data-governance safety rules.

Includes:
- migration safety checklist
- backup/rollback discipline
- duplicate SKU/barcode awareness
- missing cost/category/link reports as future checks
- no destructive production operations without explicit approval

Clarification:
- this does not mean fully redoing Phase 23 and Phase 24
- it means keeping those rules active while the next product-heavy phases are built

### ✓ Phase 25: Product Operations UX — DONE (2026-05-17)

Delivered:
- thumbnail column 48×48 with lazy loading and 📦 fallback
- live search debounced 300ms, fires at ≥2 chars, no submit button, case-insensitive on SKU/name/brand/model/barcode
- compact filter pills: Durum (Tümü/Aktif/Pasif) + Stok (Tümü/Stokta var/Düşük stok)
- sort dropdown: son güncellenen, stok ↓↑, fiyat ↓↑, marj ↓, isim A–Z
- health cues per row: Düşük stok, Görsel yok, Maliyet yok, Fiyat yok, XML bayat
- product count shown, "Filtreyi temizle" when filters active
- browser-verified 2026-05-17: 651 ürün, all features confirmed ✓

### ✓ DONE - Phase 26: Product Performance Ranking
Delivered 2026-05-17:
- TrendyolSalesRecord model + migration (orderId/lineId unique, FK to Product SET NULL)
- syncTrendyolSalesAction: 4×90-day windows, barcode/SKU matching, upsert dedup, page-0 error surfacing
- /admin/product-performance: sync card, top-20 tables (30d qty, 30d revenue, all-time revenue), 3 signal cards
- Per-product KPI card on /products/[id]: 4 tiles + color-coded realized margin badge
- Cancelled order filtering (isCancelled helper)
- Browser-verified ✓

### ✓ DONE - Phase 27: Product Media and Content Studio
Delivered 2026-05-17:
- ProductImageManager: multi-image grid, URL-add (Enter clears input), delete, set-primary (sortOrder 0)
- RichTextEditor (Tiptap): H2/H3, Bold, Italic, Bullet/Ordered lists, SSR-safe, HTML output
- XML description governance: XML source card with "Editöre taşı" opt-in button; XML sync never overwrites existing description
- Supabase Storage upload action (REST API, no SDK) — ready when SUPABASE_URL/KEY env vars are added
- Browser-verified: URL add → DB persist → reload confirmed ✓

### Priority 1 - Phase 28: Product Governance and Private Intelligence

Why:
Curated product truth should be protected while private sourcing knowledge stays private.

Deliverables:
- owner-only product private note field
- product edit activation limited to approved permission groups
- XML import only updates allowed fields such as stock/price
- preferred supplier and sourcing context visibility
- supplier workflow polish on top of the existing multi-supplier foundation
- clear source governance between:
  - XML data
  - curated product truth
  - private owner intelligence

Acceptance:
- private sourcing notes are invisible to other users
- curated product fields stop being unintentionally overwritten by source imports
- supplier and permission rules become operationally trustworthy

---

## Blockers

Phase dependencies:

- Phase 25 depends on stable product list/query performance and trusted primary-image behavior.
- Phase 26 depends on a sales snapshot / aggregation layer; product ranking should not fake 30-day revenue logic from incomplete data.
- Phase 27 depends on a safe media/storage strategy and an editor choice that does not break current product forms.
- Phase 28 depends on Phase 5 RBAC foundations plus clear XML field-governance rules.
- Phase 17 remains deferred even if product UX improves; write-side marketplace control still requires separate architecture review.

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
- revenue-based product ranking before sales snapshots are trustworthy
- rich media workflow without a clear storage/delete strategy
- XML overwriting curated product content after the owner has edited it manually

---

## Working Rule

When execution priority changes:
- update `PROGRESS.md` if reality changed
- update `ROADMAP.md` if target architecture changed
- update `NEXT-STEPS.md` if immediate build order changed
