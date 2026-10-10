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

### İstisna — ölü stok (Alperen kararı 2026-10-10, docs/CFO-DECISION-LOG.md)

Yukarıdaki yasağın TEK istisnası: `cfo_olu_stok` listesindeki SKU'lar için Trendyol ve PttAVM'de
fiyat düşürme, Trendyol onaylı ürün içeriği (başlık/açıklama/görsel) ve Entegra'dan bağımsız yeni ilan
(ayrı SKU/barkod `ALFOS-…`, stok Entegra XML'den). Koşullar — hepsi zorunlu:
- Tek kapı `lib/actions/olu-stok-actions.ts`; istemciler `lib/trendyol/write.ts`, `lib/pttavm/write.ts`
  başka yerden çağrılmaz. AI CFO yazma YAPMAZ. Tek otomatik yazma: gece XML senkronundan sonra
  `lib/olu-stok/stock-sync.ts` — YALNIZ `olu_stok_bagimsiz_ilan`'daki `ALFOS-…` barkodlara, YALNIZ stok adedi,
  yalnız taze XML'den (≤ 36 saat), en fazla `OLU_STOK_BAGIMSIZ_STOK_TAVANI` adet (varsayılan 3; çift ilan fazla satış
  sınırı); fiyat ve içerik asla otomatik değişmez (Alperen onayı 2026-10-10).
- Bağımsız ilan mevcut ilanın kopyası olamaz: farklı SKU/barkod, başlık benzerliği ≤ %60, mevcut ürün/ilan
  görselleri kullanılamaz (yeni, AI ile üretilmiş görsel) — sunucuda zorlanır.
- Her eylem insan onaylı: `marketplaceListings.write` izni + "ONAYLIYORUM" + sunucuda başabaş tabanı
  kontrolü (taban bilinmiyorsa fiyat değişmez) + ±%50 üstü değişimde ikinci onay.
- Her eylem (hata dahil) `cfo_change_log`'a yazılır (kim, eski → yeni, işlem no).
- Ortam bayrağı kapalıyken (`TRENDYOL_WRITE_ENABLED`, `PTTAVM_WRITE_ENABLED`) hiçbir istek gitmez.
- Entegra'nın yönettiği ilanlarda stok ve sipariş durumu yazma yasağı aynen sürer.

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
