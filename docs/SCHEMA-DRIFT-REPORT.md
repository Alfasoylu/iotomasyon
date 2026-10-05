# PRODUCTION ↔ REPO SCHEMA DRIFT REPORT (2026-10-05)

Yöntem (tekrar üretilebilir): (1) üretimden salt-okunur katalog sorguları; (2) `prisma/migrations` tamamı boş bir PostgreSQL'e (PGlite + Supabase benzeri roller/varsayılan yetkiler) sırayla uygulanır; (3) iki taraf nesne düzeyinde parmak iziyle karşılaştırılır
(`scripts/schema-drift/step1-fingerprint.sql`, beklenen değerler `step1-fingerprint.expected.txt`, CI testi `__tests__/migration-clean-apply.test.ts`). Üretime yalnız aşağıda "uygulanan" maddeler yazıldı; hiçbir finansal veri DROP/TRUNCATE/DELETE/yeniden yaratma yapılmadı.

## 1. Migration geçmişi (`_prisma_migrations`)
| | Önce | Sonra |
|---|---|---|
| Üretimde başarılı satır (`finished_at` dolu, `rolled_back_at` boş) | 99 (+10 eski `rolled_back` deneme satırı, zararsız) | 106 |
| Repo migration klasörü | 107 | 107 |
| Eski 99 migration: ad + sha256 checksum | **birebir eşleşiyor** (0 sapma) | aynı |
| Repo'da olup üretim geçmişinde olmayan | `20261005190000_ai_cfo_v1` (PR #146, ana dalda, **uygulanmamış** — normal bekleyen migration) + Step 1'in 7 migration'ı (1A–1F + kargo) | yalnız `ai_cfo_v1` (bekleyen) |
Step 1 migration'ları (1A–1F + kargo) üretime elle uygulanmıştı; içerik üretim gerçekliğiyle **semantik olarak birebir** doğrulandıktan sonra `_prisma_migrations`'a checksum'larıyla "uygulandı" olarak işlendi (bkz. §3). `prisma migrate deploy` artık yalnız `ai_cfo_v1`'i uygular.

## 2. Bulgular
### 2.1 Step 1 kapsamı (bu işin nesneleri) — bulunan 4 sapma ve çözüm
| # | Sapma | Çözüm |
|---|---|---|
| D1 | Üretimde `cfo_secret.cfo_acceptance_reader_select` policy'si `USING (false)`; repo migration'ı policy'yi DROP ediyordu | Repo üretim gerçeğine çekildi: policy silinmez, varsa `ALTER POLICY … USING (false)`; `REVOKE ALL` korunur. Test: reader erişemez, BYPASSRLS uygulama rolü okur |
| D2 | `fm_backfill_sales_month` ve `fm_stock_refresh` gövdesinde repo'da SQL yorum satırları vardı, üretimdekinde yok (yalnız yorum farkı) | Yorumlar gövdeden çıkarıldı; fonksiyon hash'leri eşit |
| D3 | 1E migration'ı yeni fonksiyonlardan yalnız PUBLIC EXECUTE'u kaldırıyordu; üretimde anon/authenticated da kaldırılmıştı (Supabase varsayılan yetkileri taze kurulumda geri verirdi) | 1E'ye anon/authenticated REVOKE eklendi |
| D4 | 1C–1F + kargo üretim geçmişinde yoktu | §3'teki doğrulamadan sonra checksum'larla kaydedildi |
| D5 | 1A, 11 tabloda reader policy'sini DROP+CREATE ediyordu (yeniden uygulamada kısa süre policy'siz kalma) | Varsa `ALTER POLICY`, yoksa `CREATE POLICY` |

### 2.2 Step 1 DIŞI, daha önceden var olan sapmalar (düzeltilmedi — karar gerekir)
**A. Repo migration'ları boş veritabanına sıfırdan uygulanamıyor (Step 1'den önce de böyleydi).** 107 migration'dan 10'u hata verir: `20260829000000_cfo_olu_stok_kendi_takvimi`, `…910120000_cfo_ithalat_oneri`, `…910200000_cfo_servet`, `…910230000_cfo_satir_bilgi`, `…911000000_cfo_yoldaki_kalem`, `…911140000_cfo_alacak_borc`, `…912090000_olu_stok_satis_orani`, `…912140000_xml_satis_sinyali`, `…912150000_olu_stok_xml_sinyali`, `…913120000_urun_mensei_garanti_kutu`. Kök neden: Supabase SQL editöründen / `db push` ile **migration'sız** yaratılmış nesnelere (örn. `cfo_order_line`, `cfo_satis_birim_duz` view'ı, `cfo_yoldaki_mal`) bağımlılık. Test bu listeyi **dondurdu**: yeni bir başarısız migration CI'yı kırar.
**B. Üretimde var, hiçbir migration'ın yaratmadığı 58 ilişki** (tablo/view), örn. `cfo_secret`, `cfo_banka_hareket`, `cfo_kargo_tarife`, `cfo_statement_import`, `cfo_order_line/batch`, `cfo_satis_birim(_duz)`, `cfo_servet(_kalem)`, `HepsiburadaConfig/ReturnRecord/SalesRecord`, `QuoteTemplate(Item)`, `candidates/decisions/scores/signals_daily`, … (tam liste: temiz-uygulama farkı). `cfo_acceptance_reader` rolü de repo'da yaratılmıyor.
**C. Kolon/indeks sürüklenmesi (3 tablo):** `MarketplaceProductMapping` (üretimde `platformSku/platformBarcode/platformListingId` indeksleri, repo `sku/barcode/listingId` adlı), `MonthlyExchangeRate.usdTryRate numeric(65,30)` (repo: `numeric`), `MarketplaceProductMapping/MonthlyExchangeRate/SupplierProduct.updatedAt` varsayılanı üretimde yok (Prisma `@updatedAt` istemcide) — `db push` kaynaklı.
**D. 🔴 Güvenlik (MIGRATION-SAFETY değişmezi ihlali):** `cfo_xml_urun_degisim` (~33.8 bin satır), `cfo_stok_sicrama`, `cfo_backfill_trendyol_pid_20260922` tablolarında **RLS kapalı** ve `anon`/`authenticated` rollerinin SELECT+INSERT (+yazma) yetkisi var → Supabase Data API anahtarıyla okunup değiştirilebilir. Ayrıca `anon`/`authenticated`, 5 veri-yazan fonksiyonda (`cfo_take_snapshot`, `cfo_ay_kazanan_yaz`, `cfo_kilometre_yaz`, `cfo_sicrama_kapat`, `cfo_stok_sicrama_kaydet`) EXECUTE sahibi (SECURITY INVOKER; yazdıkları tablolarda RLS açık olduğundan fiilen engelli) ve 6 tabloda (`EntegraImportLog`, `trendyol_*`, `cfo_kargo_tarife`) tablo yetkisi var (RLS deny-all koruyor).
   Önerilen en dar düzeltme (uygulama yalnız Prisma/`postgres` ve `service_role` ile bağlı olduğundan etkilemez; **onay bekliyor, uygulanmadı**): `ALTER TABLE … ENABLE ROW LEVEL SECURITY; REVOKE ALL ON … FROM anon, authenticated;` (3 tablo) ve 5 fonksiyonda `REVOKE EXECUTE … FROM anon, authenticated`.
**E. Bekleyen:** `20261005190000_ai_cfo_v1` (cfo_run/cfo_insight/cfo_usage) üretimde yok.

## 3. Step 1 eşdeğerlik kanıtı (migration'ı "uygulandı" işaretlemeden önce)
Temiz uygulamadan çıkan ve üretimden alınan parmak izleri **21 grupta birebir eşit** (tablo kolonları, RLS, kısıt, indeks, policy, view/MV tanımı, tablo+fonksiyon yetkileri, fonksiyon gövdeleri, tohum verisi: `fm_metric`, `fm_quality_flag`, `fm_source_priority`, `fm_quality_policy`, `cfo_kargo_*`). Kapsam: 17 tablo + 12 view + 1 MV + 8 fonksiyon + 11 veri tablosunda reader grant/policy/RLS. Hash'ler `step1-fingerprint.expected.txt`'te; CI her çalışmada temiz-uygulama parmak iziyle karşılaştırır.

## 4. Üretime yazılanlar (tamamı)
`_prisma_migrations`'a 7 satır (checksum'lı; Step 1 migration'ları). Başka şema/veri değişikliği **yok** (fonksiyon/policy zaten üretimde repo ile aynıydı). Geri alma: `DELETE FROM _prisma_migrations WHERE migration_name IN (…7 ad…)` (yalnız defter kaydı).

## 5. Karar bekleyen
1. §2.2-D güvenlik düzeltmesi (3 tabloda RLS + anon/authenticated yetkileri, 5 fonksiyon).
2. §2.2-A/B/C: out-of-band nesneleri yakalayan bir "baseline capture" migration'ı (üretimden `pg_get_*def` ile üretilir, `IF NOT EXISTS`, üretimde "uygulandı" işaretlenir) — boş DB'den yeniden kurulabilirliği sağlar; ~58 ilişki + ~40 fonksiyon kapsar, ayrı PR önerilir.
