# BASELINE CAPTURE (strateji C — uygulandı)

Plan: `docs/BASELINE-CAPTURE-PLAN.md`. Amaç: üretimin **bugünkü** `public` şemasını repodan boş bir PostgreSQL'e yeniden üretilebilir yapmak; **üretime yazmadan**, **tarihsel migration'ları değiştirmeden**.

## Ne yapıldı
| Parça | Dosya |
|---|---|
| Salt-okunur envanter/DDL üreteci (katalog SELECT'leri; veri okumaz) | `scripts/schema-baseline/inventory.sql` |
| Şema dökümü (yalnız şema; bağımlılık sıralı; mümkün olduğunca idempotent) | `prisma/baseline/2026-10-06.sql` |
| Sözlük tohumları (migration'ların kendi INSERT'lerinden birebir kopya) | `prisma/baseline/2026-10-06.seed.sql` (`scripts/schema-baseline/build-seed.sh`) |
| Baseline yapılandırması (cutoff migration) | `prisma/baseline/baseline.json` |
| Bootstrap | `scripts/schema-baseline/bootstrap.ts`, `npm run db:bootstrap` |
| Tam-şema parmak izi + üretimden ölçülen beklenen değerler | `scripts/schema-baseline/fingerprint.sql`, `fingerprint.expected.txt` |
| CI kapısı (PGlite) | `__tests__/schema-baseline.test.ts` (`cfo-readonly-validation.yml`'e eklendi) |

Sıra: preamble (`check_function_bodies=off`, `search_path=public`, eksikse rol oluşturma) → extension (`vector`, `public`) → enum → sequence → tablolar (PK/UNIQUE/CHECK satır içi) → sequence sahipliği → FK'ler (tek `DO` bloğu, adı varsa atlar; 5 `NOT VALID` FK üretimdeki gibi) → fonksiyonlar (tablo satır tipi döndüren `cfo_take_snapshot` nedeniyle tablolardan sonra) → view/matview (`pg_depend` ile topolojik; `security_invoker` seçenekleri korunur) → indeksler (kısıt-dışı 265) → trigger (`CREATE OR REPLACE`) → RLS açma → policy'ler (yoksa oluştur) → grant'lar (önce `REVOKE ALL`, sonra üretimdeki grant'lar gruplanmış; `anon/authenticated/service_role/cfo_acceptance_reader/PUBLIC`).

## Bootstrap
```
npm run db:bootstrap -- --url=postgres://...   # boş veritabanı; DIRECT_URL/DATABASE_URL de olur
```
1. `public` şemasının **boş** olduğunu doğrular (değilse reddeder); Supabase/üretim host'unu reddeder.
2. Baseline + seed'i uygular (tek istemci oturumu).
3. `baseline.json.cutoffMigration` dahil, ondan önceki **her** `prisma/migrations` dizinini `_prisma_migrations`'a uygulanmış olarak yazar (`prisma migrate resolve --applied` anlamı: `migration.sql`'in sha256'sı, `finished_at`, 1 adım).
4. Cutoff'tan yeni migration varsa `prisma migrate deploy` çalıştırır (`--skip-deploy` ile atlanır).

Cutoff: `20261006110000_cfo_google_lockdown` (baseline, bu migration'lar üretimde uygulandıktan sonra çekildi: `cfo_files_private` + `cfo_google_lockdown` dahil).

### Üretimde olmayan migration'lar (`notAppliedInProduction`)
`prisma/baseline/baseline.json` → `notAppliedInProduction` (şu an `20261005190000_ai_cfo_v1`): repoda olan ama üretime bilerek **uygulanmamış**
(ayrı onay bekleyen) migration'lar. Bootstrap bunları kaydetmez; `pending` olarak raporlar (`prisma migrate deploy` uygular). Parmak izi
karşılaştırması yalnız üretimin sahip olduğu migration'larla yapılır; ardından bu migration'ların temiz uygulandığı ayrıca test edilir.
(Düzeltme 2026-10-06: önceki sürüm `ai_cfo_v1`'i yanlışlıkla "uygulandı" kaydediyordu; tablolar baseline'da olmadığı için temiz DB'de hiç oluşmayacaktı.)

## Yeniden üretme (yeni baseline)
1. Salt-okunur: `psql "$PROD_URL" -X -At -f scripts/schema-baseline/inventory.sql > prisma/baseline/<tarih>.sql` (JWT benzeri sabitler `REDACTED` olur; tablo verisi okunmaz).
2. `fingerprint.sql`'i üretimde çalıştır → `fingerprint.expected.txt`'e yaz; `baseline.json`'ı güncelle (`cutoffMigration` = üretimde uygulanmış son migration).
3. `__tests__/schema-baseline.test.ts` yeşil olmalı. Üreteç doğrulaması: önyüklenmiş veritabanında `inventory.sql` çalıştırılıp çıktı boş veritabanına uygulandığında parmak izi aynı çıktı (round-trip doğrulandı).
4. Geri alma: dosyalar silinir (`prisma/baseline`, `scripts/schema-baseline`, test, npm script, CI satırı). Üretim etkisi yoktur.

## Kabul tablosu (ölçülen)
Üretim: Supabase `frbxpodiostxuwlrubkt`, yalnız katalog SELECT'leri (2026-10-06; `cfo_files_private` + `cfo_google_lockdown` uygulandıktan sonra, bitişte tekrar doğrulandı). Boş-DB: PGlite (PostgreSQL 17.5) + vector.

| Kontrol | Sonuç |
|---|---|
| Boş DB'de bootstrap hata sayısı | **0** |
| Üretim yazma sayısı | **0** (yalnız SELECT) |
| `_prisma_migrations` kaydı | **113 / 113** migration dizini (113 baseline cutoff'a kadar; bekleyen 0) |
| Tarihsel migration yeniden yazımı | **0** |

| Tür | Adet (üretim = boş-DB) | Hash (üretim = boş-DB) |
|---|---|---|
| tablo (`rel:r`) | 143 | 8a1ec88289 |
| view (`rel:v`) | 55 | 0e054e5d27 |
| materialized view (`rel:m`) | 1 | 0ad09bf43e |
| view tanımı (`view`, v+m) | 56 | 3a48d3b95d |
| fonksiyon (`fn`) | 31 | 131612c700 |
| fonksiyon ACL (`fnacl`) | 95 | cf88d54e64 |
| indeks (`idx`) | 420 | ab1a01f7e0 |
| kısıt (`con`) | 312 | 6ee399cd5a |
| policy (`pol`) | 78 | 1403a43f0c |
| RLS bayrakları (`rls`) | 143 | 9d65d2604c |
| enum | 32 | ac59222f85 |
| trigger | 2 | 90b8397906 |
| sequence / sequence ACL | 15 / 45 | cda7319017 / f50bb889a9 |
| tablo+view ACL (`acl`) | 440 | fcca79c4ee |
| şema USAGE ACL | 3 | 45e3344ecd |
| extension (`vector`, public) | 1 | 56e042523e |

Ek: `scripts/schema-drift/step1-fingerprint.sql` (21 grup, tohum satırları dahil) bootstrap edilmiş veritabanında üretimde doğrulanmış değerlerle birebir eşit.

Not: plan §4'teki sayılar (141/52+1/30/418/305/77) 2026-10-05 ölçümüydü; üretim o günden beri büyüdü (143 tablo, 55+1 view, 31 fonksiyon, 420 indeks, 312 kısıt, 78 policy — ör. `cfo_question_file_url_backup`, yeni fm_* nesneleri). Baseline **bugünkü** üretimi kodlar.

## Bilinçli dışarıda bırakılanlar / normalizasyonlar
- Nesne sahipleri, yorumlar (`COMMENT`), sequence'ların güncel değerleri (veri), extension sürümü: karşılaştırılmaz/taşınmaz.
- `vector`'ün kendi fonksiyon/operatörleri (extension'a ait) parmak izinde yok. Diğer extension'lar (`pgcrypto`, `uuid-ossp`, `pg_stat_statements`, `supabase_vault`, `http`) Supabase tarafından yönetilir ve `extensions`/`vault` şemalarındadır; baseline yalnız `public`'teki `vector`'ü kurar. `cfo_google` gövdesi `extensions.http*` çağırır (plpgsql; çalıştırma anında Supabase ortamı gerekir, oluşturma anında değil).
- `auth`, `storage`, `realtime`, `graphql`, `extensions`, `vault` şemaları ve **storage bucket'ları** (`cfo-files` artık private, `ip-set`, `urun-gorsel`) Supabase-yönetimli; baseline'a girmez. Bucket tanımları ilgili migration'larda kalır (ör. `urun_aday`, `cfo_files_private`).
- `ALTER DEFAULT PRIVILEGES` (Supabase'te `postgres`/`supabase_admin` için `public`'te service_role vb.) dökülmez; baseline her nesne için grant'ları **açıkça** yazar, varsayılan yetkilere bağımlı değildir. Yeni migration nesneleri Supabase'teki varsayılanları alır.
- Fonksiyon/view gövdeleri parmak izinde boşlukları daraltılmış ve JWT biçimli sabitler `REDACTED` olacak şekilde normalize edilir. Güncel `cfo_google` gövdesinde zaten JWT yoktur (`cfo_google_lockdown`); sızıntıya karşı test ayrıca baseline/seed/envanterde JWT desenini reddeder. Üretimde yalnız bu iş için `cfo_secret` içeriği **okunmadı**; yalnız şeması dökülür.
- Veri yok (tohumlar hariç). Tohumlar migration INSERT'lerinden birebir alınır: `fm_metric`, `fm_quality_flag`, `fm_source_priority`, `fm_quality_policy`, `cfo_kargo_barem`, `cfo_kargo_kanal_varsayim`, `cfo_kargo_desi_tarife`; (CompanySettings/CatalogProfile/ProductCategory gibi uygulama verisi migrasyonları tohum değildir, dışarıda).
- Bir yuvarlama-turu (round-trip) düzeltmesi: `cfo_yaklasan_odeme` view'ında UNION'un ilk-olmayan kollarındaki üç sabit (`'GIRIS'`, `'Pazaryeri tahsilatı'`, `'Diğer tahsilat'`) üretimde otomatik `?column?` etiketi taşır; düz metinden yeniden yaratılınca `AS text` olurdu. Baseline bunları `AS "?column?"` ile sabitler (üreteç aynı düzeltmeyi yapar) → `pg_get_viewdef` üretimle birebir.

## §3.6 sürüklenme (MarketplaceProductMapping / MonthlyExchangeRate / SupplierProduct)
Baseline **üretimin hâlini** kodlar (kolon varsayılanı/indeks adı `db push` kaynaklı farkları dahil): repo = production. `schema.prisma` ile farkın düzeltilmesi ayrı onaylı migration işidir (`prisma migrate diff` raporu bu PR'da yok).

## Sonraki adımlar (bu PR dışı)
- `migration-clean-apply.test.ts` (10 bilinen hata) baseline kanıtlandıktan sonra kaldırılacak (plan §4); şimdilik korunuyor.
- 56 tabloda anon/authenticated grant'ın kaldırılması (`ANON-GRANTS-FUNCTIONS-AUDIT.md` §5) — baseline artık bu grant'ları olduğu gibi taşır (görünür), düzeltme ayrı migration.
