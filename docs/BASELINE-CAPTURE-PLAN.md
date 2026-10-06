# BASELINE CAPTURE PLAN (yalnız plan — uygulanmadı; onay bekliyor)

Amaç: üretim şemasını repodan **yeniden üretilebilir** yapmak; üretim davranışını değiştirmemek; mevcut tarihsel migration'ları körlemesine yeniden yazmamak.

## 1. Mevcut durum (2026-10-05, üretimden ölçüldü)
- `prisma migrate deploy` geçmişi sağlam (99 migration ad+checksum eşit); **boş veritabanına sıfırdan uygulama** ise 107 migration'dan **10'unda** hata verir (`cfo_olu_stok_kendi_takvimi`, `cfo_ithalat_oneri`, `cfo_servet`, `cfo_satir_bilgi`, `cfo_yoldaki_kalem`, `cfo_alacak_borc`, `olu_stok_satis_orani`, `xml_satis_sinyali`, `olu_stok_xml_sinyali`, `urun_mensei_garanti_kutu`). Hata sınıfları: *eksik ilişki* (cfo_order_line, cfo_satis_birim_duz, cfo_yoldaki_mal, cfo_servet_kalem) ve *eksik kolon* (next_review_at, importAirLeadDays, deadStockSalesRatioPct) ve *view kolon adı çakışması* (`fatura_sku`→`kaynak`). Hepsinin kökü: SQL editörü/`db push` ile **migration'sız** yaratılmış nesneler.
- Üretimde migration'ın yaratmadığı **58 ilişki** (tablo/view): 
  - tablolar (34): `HepsiburadaConfig/ReturnRecord/SalesRecord`, `QuoteTemplate(Item)`, `candidates`, `decisions`, `scores`, `signals_daily`, `cfo_ay_kazanan`, `cfo_backfill_trendyol_pid_20260922`, `cfo_banka_hareket`, `cfo_fba_aday`, `cfo_hamle`, `cfo_hamle_olcum`, `cfo_import_cost`, `cfo_kanal_gecikme`, `cfo_kanal_net_oran`, `cfo_kargo_tarife`, `cfo_kart_taksit`, `cfo_kilometre_tasi`, `cfo_kur`, `cfo_order_batch`, `cfo_order_line`, `cfo_pay_obs`, `cfo_secret`, `cfo_set_bilesen_maliyet`, `cfo_set_fiyat`, `cfo_statement_import`, `cfo_stok_istisna`, `cfo_stok_sicrama`, `cfo_urun_karar`, `cfo_xml_urun_degisim`, `cfo_yoldaki_kalem`, `cfo_yoldaki_mal`
  - view'lar (24): `candidate_board`, `cfo_alacak_borc`, `cfo_ay_kazanan_ozet`, `cfo_aylik_urun_kar`, `cfo_ciro_hedef`, `cfo_hamle_erken_uyari`, `cfo_hamle_hikaye`, `cfo_ithalat_oneri(_ozet)`, `cfo_kur_etkisi`, `cfo_nakit_mutabakat`, `cfo_olu_stok(_ozet)`, `cfo_satis_atfedilmemis`, `cfo_satis_birim(_duz)`, `cfo_satis_kapsam`, `cfo_satis_siparis`, `cfo_servet(_kalem/_likidite)`, `cfo_stok_deger`, `cfo_stok_hareket_hiz`, `cfo_stok_sicrama_durum`, `cfo_xml_hareket/_kalibrasyon/_urun_hareket`, `cfo_yolda_sku`, `cfo_yoldaki_kapsam`
  - **14 migration'sız fonksiyon**: `cfo_ay_kazanan_yaz`, `cfo_defter_denetim`, `cfo_google`, `cfo_gumruk_dilim`, `cfo_kar_kopru`, `cfo_kart_karari`, `cfo_kaynak_yeterliligi`, `cfo_kilometre_yaz`, `cfo_model_hakedis`, `cfo_nakit_projeksiyon`, `cfo_onucus`, `cfo_onucus_temel`, `cfo_onucus_v19`, `urun_kutu_tahmin`
  - Eşit/yönetilen: 32 enum, 15 sequence, 418 indeks, 305 kısıt, 77 public policy, 2 trigger, storage bucket'ları (`cfo-files`, `ip-set`, `urun-gorsel`; üçü de `public=true` — ayrıca gözden geçirilmeli).
- Üç tabloda (`MarketplaceProductMapping`, `MonthlyExchangeRate`, `SupplierProduct`) kolon varsayılanı/indeks adı sürüklenmesi (`db push` kaynaklı).

## 2. Strateji seçenekleri
| | Yaklaşım | Artı | Eksi |
|---|---|---|---|
| A | Eski migration'lara geriye dönük "eksik nesne" ekleyip her birini düzeltmek | tek yol, tarih korunur | körlemesine yeniden yazım; her migration'ın "o günkü" şeması bilinmiyor; üretim checksum'ları bozulur ❌ |
| B | Geriye tarihli (zaman damgası 10 hatalı migration'dan önce) bir "OOB yakalama" migration'ı | boş DB'de akış devam eder | nesneler sonradan değişti (ALTER'lar); o günkü hâli yeniden kurmak imkânsız; üretim geçmişine "araya girmiş" migration ❌ |
| **C (önerilen)** | **Prisma baselining**: üretimin **bugünkü** public şemasının deterministik bir dökümü `prisma/baseline/<tarih>.sql` olarak repoya girer; boş ortam *baseline'ı uygular + mevcut tüm migration'ları `migrate resolve --applied` ile işaretler*, sonrası normal `migrate deploy`. Tarihsel migration'lara **dokunulmaz**; üretim hiç etkilenmez | üretim davranışı değişmez; tarihsel dosyalar/checksum'lar korunur; Prisma'nın resmî baselining yöntemi | `migrate dev` gölge DB'si tarihçeyi yeniden oynatamaz → geliştirme akışı için `db:bootstrap` + `migrate diff` kullanılır (aşağıda) |
| D | Uzun vadede: tarihçiyi tek `0_baseline` migration'ına ezmek (squash) | tertemiz | üretim `_prisma_migrations` ile uyuşmaz, ayrı onay/geçiş planı gerekir |
Öneri: **C**, D'ye geçiş seçeneği açık bırakılarak.

## 3. C'nin adımları
1. **Envanter üreteci** (salt-okunur, deterministik): `scripts/schema-baseline/inventory.sql` — üretimden tablolar/kolonlar/varsayılanlar/kısıtlar/indeksler/policy'ler/view/fonksiyon/trigger/enum/sequence/grant listesi (`pg_get_*def`). Çıktı repoya **dökümün kaynağı** olarak girer.
2. **Döküm** `prisma/baseline/2026-10-05.sql`: `CREATE … IF NOT EXISTS` / `CREATE OR REPLACE`; bağımlılık sırasıyla (enum → tablo → kısıt/indeks → fonksiyon → view → trigger → policy/grant); veri yok (yalnız şema + sözlük/tohum tabloları için ayrı `seed` dosyası); `cfo_secret` içeriği **asla** girmez.
3. **Bootstrap**: `npm run db:bootstrap` = baseline'ı uygula → `prisma migrate resolve --applied <her migration>` → `prisma migrate deploy` (yalnız baseline sonrası yeni migration'lar).
4. **Üretim**: hiçbir şey çalıştırılmaz. Üretimin `_prisma_migrations`'ı zaten tam.
5. **Kapı (CI)**: yeni test `schema-baseline.test.ts` (PGlite): (a) bootstrap'ı boş DB'de çalıştırır, **0 hata**; (b) tam-şema parmak izi (Step 1 testinin genişletilmişi: tüm public tablo/kolon/kısıt/indeks/policy/view/fonksiyon/grant) **üretimden alınan hash'lerle birebir**; (c) 107 migration'ın hepsinin `applied` işaretlenmiş olduğunu doğrular.
6. Sürüklenmeler (3 tabloda varsayılan/indeks adı): baseline **üretimin hâlini** kodlar (repo = production); Prisma `schema.prisma` ile farkları `prisma migrate diff` raporuna yazılır, düzeltme ayrı onaylı migration.

## 4. Kabul planı (temiz veritabanı)
| Kontrol | Beklenen |
|---|---|
| Boş DB'de bootstrap | 0 hata |
| Tam-şema parmak izi | üretimle **birebir** (tablo 141, view 52+MV 1, fonksiyon 30, indeks 418, kısıt 305, policy 77, enum 32, trigger 2) |
| `migrate status` | tüm migration'lar applied, bekleyen yalnız yeni olanlar |
| Üretim | **hiçbir yazma**; yalnız katalog SELECT'leri |
| Hassas veri | `cfo_secret` ve diğer veri dökülmez; yalnız şema |
| Test | mevcut `migration-clean-apply` (10 bilinen hata) **kaldırılır**, yerine `schema-baseline` |

## 5. Riskler
- Döküm hatası: parmak izi kapısı yakalar. Üretimde `pg_get_viewdef` çıktısı ile yeniden-yaratım farkı: view'lar `CREATE OR REPLACE` + aynı kolon sırası.
- `vector` eklentisi `public` şemasında (advisor: extension_in_public) — baseline aynı şemada kurar; taşınması ayrı iş.
- 40 security-definer view baseline'a **olduğu gibi** girer; güvenlik düzeltmesi ayrı onaylı PR (`SCHEMA-DRIFT-REPORT.md` §6).

## 6. Karar
Onay verilirse: önce yalnız adım 1–2 (üreteç + döküm + parmak izi testi) ayrı PR'da; üretime dokunmadan.
