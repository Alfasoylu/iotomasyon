# Financial Memory Acceptance Report — Step 1A–1F (2026-10-05)

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
XmlStockChangeLog 2026-05-17 → 2026-10-05, 274 ürün, zincir kopukluğu 0, delta tutarsızlığı 0. Zincir toplamı 73.561 ≠ Product.stockQuantity 74.004 (1 üründe 443 adet logsuz değişiklik). Aktif 1.311 üründen yalnız 274'ü loglu → toplam `stock_unlogged_products_excluded` ile okunur. 2026-05-17 öncesi stok geçmişi yok (U).

## 9. Balance / net-capital coverage
cfo_snapshot v2 yalnız: 2026-09-11 → 2026-10-04, 21 gün (09-19, 09-27/28 vb. boş = bilinmiyor, carry-forward yok). v1 tanımı (≤2026-09-10 19:38) hafızaya alınmadı. Banka hareketinden nakit serisi üretilmedi (aşağıda).

## 10. Bilinmeyen metrikler (U — 0 sayılmadı)
Gerçek iade, geçmiş birim maliyet/katkı kârı (2026-08-24 öncesi), 2026-09-11 öncesi borç/alacak/net sermaye, 2026-05-17 öncesi stok adedi/değeri, 2025-09 öncesi nakit, Ekim 2026 kuru, snapshot'sız günler.

## 11. Testler
`cfo-reader-security`, `fm-canonical-sales`, `fm-memory-schema`, `fm-sales-backfill`, `fm-tcmb-fx`, `fm-fx-monthly`, `fm-stock-balance` (PGlite, gerçek PostgreSQL) hepsi geçti; `tsc` temiz; `npm run build` geçti (sandbox'ta DATABASE_URL/DIRECT_URL/SESSION_SECRET dummy ile); değiştirilen dosyalarda eslint temiz (repo genelinde 36 önceden var olan lint hatası bu işten bağımsız). PR #148 `validate` CI işi GitHub'da "queued" kaldı — yeşil teyit edilemedi.

## 12. Kalan zayıflıklar
1. Banka nakit serisi: Ziraat hareketleri iki kez yüklü (manuel id 53-68 ve ekstre id 1593+), alt hesaplar tek `banka` altında karışık, 10-03 toplamı snapshot nakdiyle uyuşmuyor (232.637 vs 72.484) → hesap kimliği temizlenmeden üretilmedi.
2. Stok yalnız 274/1.311 ürünü kapsıyor; 2026-05-17 öncesi yok.
3. İade verisi yok → net gelir/katkı kârı güvenilir değil (flag `returns_unknown`).
4. Geçmiş maliyet yok → tarihsel marj hesaplanamaz.
5. 2020-2022 gelirleri C/B (durum snapshot'ları bayat; iptal/iade eksik yakalanmış olabilir); 2020'de SKU eşleşmesi %62.
6. Prod/repo sapmaları: prod `cfo_secret` politikası `USING (false)` (repo migration'ı politikayı düşürür); 1C/1D/1E/1F üretimde DROP satırsız elle uygulandı (Prisma migration geçmişine işlenmedi).
7. Tek tasarım kısıtı nedeniyle PR #148 1A–1F'yi birlikte taşıyor (küçük ayrı PR'lar yapılamadı).
