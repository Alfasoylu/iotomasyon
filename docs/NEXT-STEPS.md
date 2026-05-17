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
- trustworthy marketplace order/return history that can replace manual Trendyol checking
- canonical mapping governance for unmatched marketplace records
- workbook-validated marketplace margin policy

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

### ✓ Priority 1 — Marketplace Data Reliability Closure (Phase 29, 2026-05-17)

Delivered:
- TrendyolReturnRecord model + migration (applied to production)
- syncTrendyolReturnsAction: 365-day sweep, barcode/SKU matching, upsert dedup
- /orders page: 5-tab local order ledger (Tümü/Teslim/İptal/İadeler/Eşleşmemiş), newest-first, 1.105 order lines, pagination, matched product links
- Unmatched inbox with amber hint + link to /admin/marketplace-mappings
- Siparişler sidebar link (EXECUTIVE_READ)
- Browser-verified 2026-05-17 ✓

Remaining open items (not required for Priority 1 completion):
- Historical backfill when a new mapping is approved (retroactively update TrendyolSalesRecord.productId)
- This is low-priority; the matching inbox + manual mapping page covers the workflow

### Priority 2 - Marketplace Margin Policy Normalization

Why:
Marketplace profitability should follow one trusted business rule, not scattered defaults and manual mental math.

Includes:
- standard shipping cost policy
- shipping override policy
- standard commission policy
- commission override policy
- effective value visibility
- validation against the owner workbook margin logic
- product and marketplace views that rank by trusted realized margin

Acceptance:
- the system shows which shipping/commission value is standard, override, and effective
- margin calculations are explainable
- owner can trust marketplace margin ranking without checking Excel

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

### ✓ DONE - Phase 29: Order Ledger and Return Claims Sync
Delivered 2026-05-17:
- TrendyolReturnRecord model + migration (claimId+orderLineId unique, nullable productId FK)
- syncTrendyolReturnsAction: 365-day sweep, barcode/SKU product matching, upsert TrendyolReturnRecord
- OrdersSyncButton: combined client component triggering both orders + returns sync in parallel
- /orders page: 5-tab local order ledger — Tümü(1.105)/Teslim(952)/İptal/İadeler/Eşleşmemiş(1.032)
- Newest-first sort, 100-row pages, matched product links, unmatched amber badges
- Unmatched tab: amber hint + link to /admin/marketplace-mappings
- Siparişler sidebar link (EXECUTIVE_READ)
- Browser-verified ✓

### ✓ DONE - Phase 28: Product Governance and Private Intelligence
Delivered 2026-05-17:
- Product.privateNote (TEXT, nullable) — safe additive migration applied to production
- updatePrivateNoteAction: EXECUTIVE_READ + PRODUCTS_UPDATE gated; separate from main form so non-owners cannot overwrite it
- PrivateNoteEditor: amber-accented standalone client component with char counter, save feedback, "🔒 Sadece sahip görebilir" badge
- Product edit page: EXECUTIVE_READ check → canViewPrivate → amber card renders only for owners
- Product detail page: "Tedarikçi Kaynağı" supplier summary card (★ Tercihli, cost/lead/MOQ); "🔒 Özel Not" read-only card gated by EXECUTIVE_READ
- description validation max raised 2000 → 10000 for Tiptap HTML
- normalizeProductData explicitly omits privateNote — XML sync cannot overwrite owner intelligence
- Browser-verified ✓

---

## Blockers

Phase dependencies:

- Marketplace Data Reliability Closure depends on stable Trendyol pagination, durable persistence, and trustworthy order/return identifiers.
- Marketplace Margin Policy Normalization depends on trusted order data plus a clear effective shipping/commission rule.
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
- pretending live API windows are a complete historical order source
- trusting weak barcode/SKU guesses when an explicit marketplace mapping should exist
- treating marketplace margin as trustworthy before the effective shipping/commission policy is normalized

---

## Working Rule

When execution priority changes:
- update `PROGRESS.md` if reality changed
- update `ROADMAP.md` if target architecture changed
- update `NEXT-STEPS.md` if immediate build order changed
