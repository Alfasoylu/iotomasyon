# Financial Memory Acceptance Report — Step 1A–1F (FİNAL, 2026-10-05)

Kapsam: AI CFO V2 Step 1. Ham kaynaklar değiştirilmedi/silinmedi; üretimde yalnız yeni `fm_*` nesneleri + reader güvenlik düzeltmesi.

## 1. Canonical revenue reconciliation
| Kalem | Satır | Tutar (TL, KDV dahil) |
|---|---|---|
| COUNTED · M_PRIMARY | 94.331 | 52.441.361 |
| COUNTED · SINGLE_SOURCE | 43.207 | 28.588.694 |
| COUNTED · T_GAP_FILL (Şubat 2026 deliği) | 775 | 844.816 |
| COUNTED · T_PRIMARY (2026-05-04+) | 8.216 | 5.742.726 |
| **Canonical gelir** | **146.529** | **87.617.597,19** |
| DEDUP_DROPPED | 8.533 | 6.000.898 |
| EXCLUDED_RETURN | 7.694 | 2.627.286 |
| EXCLUDED_CANCELLED | 334 | 303.720 |
| EXCLUDED_TEST | 1 | 2 |

Kimlik: ham = Σ disposition (test'te kilitli). Hafıza toplamı = canonical = 87.617.597,19; 75 ayın hepsinde company-day / channel-month / sku-month / adet farkı **0**. Ham kaynaktan açıklanamayan sapma yok (>%1 eşiği tetiklenmedi).

## 2. Duplicate elimination
Trendyol'da Marketplace+Trendyol toplanmaz: 8.533 satır DEDUP_DROPPED (6,0 M TL, çift sayım olurdu). 2026-05-04 öncesi Marketplace birincil (T yalnız eksik anahtarı doldurur), sonrası Trendyol birincil (Marketplace yalnız yedek). Şüpheli çapraz kaynak benzerleri silinmez, `possible_cross_source_duplicate` ile işaretlenir. IDEASOFT sanity: 0 sipariş tekrarı, 1 test siparişi (2 TL, hariç), 3 kanallar-arası benzer (2,4 bin TL) → dahil, eski view farkı belgeli.

## 3. Coverage by year / channel (hafıza, TL KDV dahil)
| Yıl | Gelir | Başlıca kanallar |
|---|---|---|
| 2020 (Ağu-) | 0,47 M | Trendyol, N11, Hepsiburada, GG |
| 2021 | 2,90 M | Hepsiburada, Trendyol, N11, GG, IDEASOFT |
| 2022 | 5,57 M | Trendyol, Hepsiburada, N11, IDEASOFT |
| 2023 | 19,49 M | Trendyol 12,49 M, Hepsiburada 4,99 M |
| 2024 | 17,45 M | Trendyol 12,96 M, Hepsiburada 3,35 M |
| 2025 | 24,08 M | Trendyol 18,24 M, Hepsiburada 3,15 M, EPTT, Koçtaş |
| 2026 (-Eki) | 17,66 M | Trendyol 10,95 M, Hepsiburada 2,84 M, EPTT 1,13 M |
Satır sayıları: company_day 2.251 · channel_month 455 · sku_month 12.272 · sku_day (son 400 gün) 11.812; stale sürüm 0.

## 4. SKU mapping coverage
Ciro ağırlıklı eşleşme %93,9 (82,26 M / 87,62 M); sku_month satırı 9.836/12.272. Yıllara göre ciro eşleşmesi: 2020 %62, 2021 %86, 2022 %79, 2023 %89, 2024 %96, 2025 %99, 2026 %97. Eşleşmeyenler `R:<ham kod>` anahtarıyla ayrı tutulur (uydurma eşleşme yok). Legacy tekstil (Armine) 1.001 sku_month satırı / 3,38 M TL `legacy_business` ile ayrıldı, ALFAS ürün performansına karışmaz.

## 5. Kalite dereceleri (politika)
Gelir: 2020-08..2021-12 **C**, 2022-01..2026-05-03 **B**, 2026-05-04+ **A**. İade **U** (hep; iade tabloları boş, Marketplace durumu yalnız sinyal). Geçmiş maliyet/katkı kârı 2026-08-24 öncesi **U**, sonrası **D**. Stok adedi 2026-05-17 öncesi **U**, sonrası **B**. Net sermaye/borç/alacak 2026-09-11 öncesi **U**, sonrası **C**. Nakit ≤2025-09 **U**, 2025-10..2026-04 **C**, 2026-05+ **B**. USD/TRY 2020-08..2026-09 **A**, 2026-10+ **U**. Numeric confidence yok.

## 6. Backfill satır sayıları
Satış 75 ay (2020-08 → 2026-10) yukarıdaki satır sayılarıyla; stok 3.215 SKU-gün + 142 şirket-günü; bakiye 105 satır (21 gün × 5 metrik); FX 74 ay.

## 7. FX coverage
TCMB USD ForexBuying, 2020-08 → 2026-09: **74/74** doğrulandı (26 ay 15'i iş günü olmadığı için önceki bülten). Ekim 2026 pending (15'i gelmedi) → U. Non-TCMB fallback yok.

## 8. Stock coverage
XmlStockChangeLog 2026-05-17 → 2026-10-05, 274 ürün, zincir kopukluğu 0, delta tutarsızlığı 0. 273/274 ürünün zincir sonu = `Product.stockQuantity`. **443 adetlik fark tek üründe: `AL-CAM03`** (zincir 1.497, Product 1.940) ve **zincir problemi değil, logsuz manuel düzeltme**: XML'de bu ürün için tek log var (2026-06-21 02:36, 0→1.497); `lastStockSyncAt` 2026-07-10; `Product.updatedAt` 2026-09-12 05:11; `stockSource = MANUAL`. `cfo_change_log` (2026-09-12 05:12, *"AL-CAM03 fiziki sayim: defter 1.497 → gercek 1.940"*, kaynak: Alperen fiziki sayımı 11.09.2026) 443 adedi doğrudan açıklıyor; `StockAdjustmentLog`'da kayıt yok (sayım bu loga yazılmamış). Yani fark, son XML logundan **82 gün sonra** yapılan sayım düzeltmesidir. Etki: şirket toplamı 2026-09-12'den itibaren 443 adet eksik. Kural: sayım düzeltmeleri XML zincirinde değil ayrı bir "sayım" katmanında tutulmalı (öneri; uygulanmadı). Aktif 1.311 üründen yalnız 274'ü loglu → toplam `stock_unlogged_products_excluded` ile okunur; 2026-05-17 öncesi stok geçmişi yok (U).

## 9. Balance / net-capital coverage
cfo_snapshot v2 yalnız: 2026-09-11 → 2026-10-04, 21 gün (09-19, 09-27/28 vb. boş = bilinmiyor, carry-forward yok). v1 tanımı (≤2026-09-10 19:38) hafızaya alınmadı. Banka hareketinden nakit serisi üretilmedi (aşağıda).

## 10. Bilinmeyen metrikler (U — 0 sayılmadı)
Gerçek iade, geçmiş birim maliyet/katkı kârı (2026-08-24 öncesi), 2026-09-11 öncesi borç/alacak/net sermaye, 2026-05-17 öncesi stok adedi/değeri, 2025-09 öncesi nakit, Ekim 2026 kuru, snapshot'sız günler.

## 11. Testler
`cfo-reader-security`, `fm-canonical-sales`, `fm-memory-schema`, `fm-sales-backfill`, `fm-tcmb-fx`, `fm-fx-monthly`, `fm-stock-balance`, `cfo-kargo-tarife`, `migration-clean-apply` (PGlite, gerçek PostgreSQL) hepsi geçti; `tsc` temiz; `npm run build` geçti (sandbox'ta DATABASE_URL/DIRECT_URL/SESSION_SECRET dummy ile); değiştirilen dosyalarda eslint temiz (repo genelinde 36 önceden var olan lint hatası bu işten bağımsız). PR #148 `validate` CI işi GitHub'da "queued" kaldı — yeşil teyit edilemedi.

## 12. Production ↔ repo migration parity
Ayrıntı: `docs/SCHEMA-DRIFT-REPORT.md`. Eski 99 migration ad+checksum birebir; Step 1'in 7 migration'ı (1A–1F + kargo) üretim gerçeğiyle **21 parmak izi grubunda birebir eşit** olduktan sonra `_prisma_migrations`'a işlendi; repo'da 5 sapma düzeltildi (cfo_secret policy semantiği, fonksiyon yorumları, 1E anon/authenticated revoke, 1A policy DROP→ALTER, defter kaydı). Temiz DB'ye uygulama bir CI testiyle kilitli (`migration-clean-apply`). **Açık:** repo migration'ları Step 1'den önce de boş DB'ye uygulanamıyordu (10 migration, 58 migration'sız üretim ilişkisi) — baseline-capture migration'ı için onay gerekir.

## 13. Reader security verification
`cfo_acceptance_reader` (üretim, katalog düzeyinde doğrulandı — doğrudan bağlantı bu sandbox'tan kurulamadığı için `has_*_privilege`/`pg_policies`/`pg_roles` ile): superuser/bypassrls/createrole/createdb/replication **false**, login true, hiçbir rolün üyesi değil, `default_transaction_read_only=on`, `public` şemasında CREATE yok, hiç nesne sahibi değil. 125 ilişkide SELECT; **hiçbir ilişkide INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER yok**. `cfo_secret`: tablo+kolon SELECT **yok**, policy `USING (false)`. Veri yazan 5 fonksiyonda ve fm_* yazıcılarında EXECUTE yok (yalnız trigger fonksiyonu `cfo_xml_urun_degisim_trg` görünür; doğrudan çağrılamaz). Uygulama rolleri `postgres`/`service_role` BYPASSRLS + yetkili → etkilenmedi (testte `app_like` rolüyle kanıtlı). Kabul testi: **reader → cfo_secret = erişilemez** ✔ (`__tests__/cfo-reader-security.test.ts`). ⚠ Reader'ın SELECT'i olup RLS'i kapalı 3 tablo var (bkz. drift raporu §2.2-D; anon da erişebiliyor — onay bekliyor).

## 14. Banka nakdi — BLOKER
Ham banka satırlarına dokunulmadı. `docs/BANK-DATA-FORENSICS.md`: erken import'ların %100'ü (68/68) tam-geçmiş import'un tekrarı (hash farklı); Ziraat `hesap=NULL` = `96172849-5001` (aynı hesap); ₺232.637 farkı 3 metodoloji hatasıydı (gün içi sıra: +136.150, mükerrer Ziraat serisi +35.127, USD'nin TL gibi toplanması) — düzeltilince bugünkü `cfo_bank_account` toplamıyla fark **₺16,76** (YKB ekstre sonrası hareket). 10-03 snapshot'ı (72.484) `cfo_bank_account` geçmişi tutulmadığı için ₺2.132,68 açıklanamıyor. Enpara/Garanti/Ziraat TL serileri %100 süreklilikli ve kapanışları doğru; **YKB 59/127 kopuk (₺3,75 M boşluk)**, 3 şirket hesabının ekstresi yok → şirket geneli `cash_try` geçmişi hafızaya **girmedi**.

## 15. TCMB Ekim 2026 neden bekliyor
Kural: ayın 15'i (yoksa önceki TCMB bülteni). Bugün 2026-10-05; 2026-10-15 henüz gelmedi → `pending`, satır yazılmadı, kalite **U**, sessiz fallback yok. 2026-10-15 (Perşembe) bülteni yayımlandıktan sonra `scripts/fm-fx-tcmb.ts 2026-10 2026-10` çalıştırılıp çıktı yüklenecek (politika satırı 2026-10-01+ U'dan A'ya güncellenecek).

## 16. Dışlanan çift gelir (özet)
Canonical'a **girmeyen** satırlar: DEDUP_DROPPED 8.533 satır / ₺6.000.898 (Trendyol çift kaynak), EXCLUDED_RETURN 7.694 / ₺2.627.286, EXCLUDED_CANCELLED 334 / ₺303.720, test 1 / ₺2. Ham 96.549.503,09 = canonical 87.617.597,19 + bunlar (kimlik testte kilitli).

## 17. Bilinmeyen metrikler (U — 0 sayılmadı)
Gerçek iade; 2026-08-24 öncesi geçmiş maliyet/katkı kârı; 2026-09-11 öncesi borç/alacak/net sermaye; 2026-05-17 öncesi stok adedi/değeri; 2025-09 öncesi nakit ve şirket geneli nakit geçmişi (bkz. §14); Ekim 2026 kuru; snapshot'sız günler (09-19, 09-27/28).

## 18. Kalan zayıflıklar
1. Banka nakdi (§14) — YKB eksiksiz export + 3 hesap ekstresi + `cfo_bank_account` geçmişi gerekli.
2. Stok yalnız 274/1.311 ürünü kapsıyor; sayım düzeltmeleri zincirde yok (AL-CAM03 +443); 2026-05-17 öncesi yok.
3. İade verisi yok → net gelir/katkı kârı güvenilir değil (`returns_unknown`); geçmiş maliyet yok → tarihsel marj hesaplanamaz.
4. 2020–2022 gelirleri C/B (durum snapshot'ları bayat); 2020'de SKU eşleşmesi %62.
5. Migration'sız (out-of-band) 58 üretim ilişkisi + 10 uygulanamayan migration (drift raporu §2.2); RLS'siz 3 tablo + anon yetkileri (§2.2-D) — onay bekliyor.
6. 2025→2026 arası kargo tarifesi ara güncellemeleri bilinmiyor (`docs/KARGO-TARIFE.md`).
