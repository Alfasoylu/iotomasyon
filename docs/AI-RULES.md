# AI Rules

## Document Read Order

1. `docs/PROGRESS.md`
2. `docs/current-state.md`
3. `docs/DATABASE-SCHEMA-STATE.md`
4. `prisma/schema.prisma`
5. `docs/ROADMAP.md`
6. `docs/phase-plan.md`
7. `docs/NEXT-STEPS.md`
8. `docs/PERMISSION-MODEL.md` (when created)

## Core Rules

- roadmap ≠ implemented
- progress = factual implementation only
- actual code/schema reality overrides documentation assumptions
- if docs conflict with code, code wins and docs must be corrected
- never assume missing schema exists
- never mark incomplete work complete
- dependency-first implementation only
- never create migrations without checking both `docs/DATABASE-SCHEMA-STATE.md` and `prisma/schema.prisma`
- role field ≠ RBAC implementation

## Dangerous Operations

Never do without explicit approval:
- destructive migrations
- schema deletions
- production data rewrites
- write-side marketplace integrations
- auth rewrites
- permission model replacement

## Marketplace Rules

**Mimari kural — değiştirilemez:**
Pazaryerlerine (Trendyol, Hepsiburada, Amazon, N11, Pazarama, Idefix, vb.)
ürün/stok/fiyat verisi **iotomasyon CRM üzerinden GÖNDERİLMEZ**.
Pazaryerlerine veri **Entegra** adlı ayrı yazılım üzerinden gönderilir.
iotomasyon CRM sadece pazaryerlerinden veri **ÇEKER** (read-only).

Allowed:
- read-only integrations (sipariş çekme, iade çekme, soru-cevap çekme, katalog
  okuma, fiyat okuma)

Forbidden — her durumda, açık onayla bile yapmayın (Entegra'nın işi):
- stock push (stok güncelleme)
- price push (fiyat güncelleme)
- listing updates (ürün ekleme/silme/güncelleme)
- order status writes (sipariş durumu yazma — kargo, iptal vb.)

Eski API endpoint'leri (örn. `/admin/trendyol-stock-sync` push sayfası)
kaldırılmıştır; tekrar eklenmemelidir.

## Documentation Rules

If implementation changes:
update:
- `docs/PROGRESS.md`
- `docs/current-state.md`
- `docs/CHANGELOG.md`

If architecture changes:
update:
- `docs/ROADMAP.md`
- `docs/phase-plan.md`

## Verification Rules

Before claiming done:
- build
- typecheck
- lint
- prisma validation
- route protection checks
