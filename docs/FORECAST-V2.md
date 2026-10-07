# Forecast V2 (PR2) — aday modeller ve kabul kapısı

Bu belge **sonuçlar görülmeden önce** yazıldı (ön kayıt, `forecast-candidates-v1`). Formüller, sabitler ve kabul kapısı
`lib/forecast/candidates.ts` içinde donduruldu; üretim sonuçlarına bakıldıktan sonra değiştirilmez. Değişirse sürüm artar ve
yeniden çalıştırılır. Ölçüm altyapısı PR1 (`docs/FORECAST-BACKTEST.md`) ile aynıdır: kanonik satış, `economic_date < c` eğitim,
`[c, c+30)` hedef, 50 uzun kesim (14 günde bir, 2024-10-08 → 2026-08-25), 12 kısa stoklu kesim (haftalık, 2026-06-16 → 2026-09-01).
Etiket: **"economic-time backtest, not historical knowledge-state replay"**.

## Kanonik doğrulama (salt-okunur, 2026-10-06)
- `fm_sales_canonical_snapshot` (disposition `COUNTED`) `İade-İptal`, `İadesi Onaylanan`, Trendyol `Cancelled` ve iadeleri dışarıda bırakır.
- 2026-05-04 sonrası Trendyol için `MARKETPLACE` kaynaklı satır yok → çift sayım yok (`fm_source_priority`).
- Eşlenmemiş ham SKU payı 2025-10'dan beri birimlerin ≈%3,5'i (`R:` anahtarı ile ayrı izlenir); eski tekstil iş kolu ihmal edilebilir.
- Sonuç: Türkçe `İ` / `ILIKE` sorunu yalnız eski `UNION ALL` çağrı yolunda var; kanonik katmanda düzeltme gerekmez.

## Adaylar (hepsi gözlenen satış tahmini, `max(tahmin, başka)` tabanı yok)
| Model | Karmaşıklık | Formül |
|---|---|---|
| M0_true30 | 1 | U30 |
| M1_true90 | 1 | U90 / 3 |
| M2_weighted_30_90 | 2 | 0,5·U30 + 0,5·U90/3 |
| M3_ewma_hl30 | 3 | 30 · Σw·u / Σw, w = 2^(−yaş/30), gün aralığı max(c−180, ilk satış) → c (sıfır günler dahil) |
| M4_damped_trend | 3 | M1 · (1 + 0,5 · clamp((M0−M1)/M1, −0,5, +0,5)); M1 = 0 → 0 |
| M5_calibrated_true30 | 5 | k(c, hız) · M0; k = Σa / ΣM0, yalnız hedefi c'den önce bitmiş önceki kesimler (c' + 30 ≤ c); segment ≥300 gözlem ve ≥4 kesim, yoksa global, yoksa 1; clamp [0,6, 1,4] |
| M6_seasonal_true90 | 4 | M1 · clamp(U[c−365, c−335) / (U[c−455, c−365)/3), 0,8, 1,25) — yalnız geçmiş ≥455 gün ve taban ≥30 adet; yoksa M1 |

- **Mevsimsellik** yalnız yeterli örnekle, sınırlı (×0,8–×1,25) ve M1'e göre artımlı katkısı ayrıca raporlanır.
- **Soğuk başlangıç** (ilk satıştan kesime gün): `<7` → UNKNOWN; `7–29` → yalnız açık etiketli `P_partial_history_annualized` = U30/geçmiş·30
  (değerlendirme için); `≥30` → normal. Bulanık/YZ tahmini yok.
- **Talep tahmini ayrı:** `stock_adjusted_demand_estimate_30` stok kaydı pencereyi tam kapsamıyorsa UNKNOWN'dur ve gözlenen satış tahmininin
  yerine sessizce geçmez.
- **Manuel potansiyel** (`Product.onlineSalesPotential`) model seçiminde kullanılmaz (geçmişi yok).

## Sermaye güvenliği (maliyet olmadan)
`excessUnits` = Σmax(0, f−a), `excessRatio` = excessUnits / Σa, felaket fazla tahmin (>2× ve ≥3 adet). Varsayımsal fazla sipariş yalnız
açık ve sürümlü kural ile: **`reorder-v1: order = max(0, forecast − stock at cutoff); 30-day cover, no safety stock, no lead time, no inbound`**,
kesimdeki stok = kesimden önceki son gün sonu stoğu; `overOrderUnits` = Σmax(0, sipariş(f) − sipariş(a)).

## Kabul kapısı (taban M0_true30, uzun bölüm, `observed` hedef)
| Kapı | Koşul |
|---|---|
| G1 | WAPE_all ≤ taban + 0,5 pp |
| G2 | \|bias_all\| ≤ \|taban\| + 0,5 pp |
| G3 | WAPE (hız A) ≤ taban + 1 pp |
| G4 | felaket (>2×) oranı ≤ taban + 0,5 pp |
| G5 | WAPE (`source_era = trendyol_api_full_window`) ≤ taban + 1 pp |
| G6 | kısa stoklu bölüm, `availability_normalized` WAPE ≤ taban + 2 pp |

Karmaşık bir model M0'ı ancak **tüm kapıları geçer ve** şu iyileşmelerden en az birini sağlarsa yener: WAPE_all ≤ taban − 2 pp, veya
\|bias\| ≤ \|taban\| − 3 pp, veya WAPE_A ≤ taban_A − 3 pp (**karmaşıklık cezası**: fark küçükse true30 kazanır). Geçenler arasında önce en düşük
karmaşıklık, sonra en düşük WAPE seçilir. Segment bazlı seçim yalnız segmentin örneği yeterliyse (≥300 gözlem, ≥4 kesim) ve aynı kapılar
o segmentte geçerse önerilir; aksi halde global model.

## Doğrulama
`__tests__/forecast-candidates.test.ts`: sıfır / aralıklı / ani sıçrama / kısmi geçmiş / yetersiz mevsimsellik, kalibrasyonun yalnız önceki
kesimlerden öğrenmesi (gelecek satış ×7 + stok mutasyonu faktörü değiştirmez), satış ve stok sızıntısı, determinizm ve PGlite üzerinde
SQL (`lib/forecast/candidates-sql.ts`) == TS birebir eşdeğerlik. Üretim SQL: `node --import tsx scripts/forecast-backtest.ts --today 2026-10-06
--print-sql candLong|candShort|candHash`.

## Sonuçlar — üretim, 2026-10-06 (salt-okunur, economic-time)
`candidateSqlHash` = `6c1fc27e89feb76348e754e40585ebb1ae381a5c1394949c1c74bec03fcfdf53`. M0 PR1'deki `true30` ile birebir aynı (kontrol).

### Uzun bölüm (n = 23.913 gözlem, 50 kesim)
| Model | WAPE | Bias | Fazla tahmin | >2× | Hız A WAPE | API dönemi WAPE | Karmaşıklık | Kapı |
|---|---|---|---|---|---|---|---|---|
| M0_true30 | 87,4% | +5,0% | 21,5% | 8,1% | 84,1% | 75,8% | 1 | taban |
| M1_true90 | 100,9% | +3,1% | 38,0% | 9,4% | 99,3% | 83,4% | 1 | G1 G3 G4 G5 G6 ✗ |
| M2_weighted_30_90 | 90,4% | +4,0% | 39,0% | 8,5% | 87,0% | 74,4% | 2 | G1 G3 ✗ |
| M3_ewma_hl30 | 97,4% | +16,3% | 58,2% | 11,4% | 88,3% | 80,5% | 3 | G1–G5 ✗ |
| M4_damped_trend | 94,0% | +1,2% | 38,4% | 8,6% | 91,1% | 76,4% | 3 | G1 G3 G4 ✗ |
| M5_calibrated_true30 | 87,1% | +1,3% | 24,4% | 8,8% | 79,9% | 69,7% | 5 | **G4 ✗** (+0,7 pp > 0,5) |
| M6_seasonal_true90 | 101,1% | +1,9% | 37,9% | 9,4% | 99,8% | 83,9% | 4 | G1 G3 G4 G5 G6 ✗ |
| P_partial_history_annualized (7–29 gün, n = 877) | 106,9% | +35,0% | 82,8% | 37,4% | — | — | — | yalnız soğuk başlangıç |

Kısa stoklu bölüm, `availability_normalized` WAPE (n = 1.121): M0 68,9% · M1 74,1% · M2 67,6% · M3 68,4% · M4 68,0% · **M5 60,2%** · M6 74,6%;
`stock_adjusted_demand_estimate_30` (n = 1.099) 68,4%, stoksuz kalmış ürünlerde 63,9% (M0 75,5%). reorder-v1 fazla sipariş (birim, aynı hedef):
M0 726 · M5 609 · M2 721 · stok-düzeltilmiş 771.

**Ön kayıtlı karar: kazanan M0_true30.** Tüm kapıları geçen tek karmaşık aday yok; M5 G4'te kalıyor (felaket fazla tahmin 8,1% → 8,8%).

### Neden M5 G4'te kalıyor — kalibrasyon faktörleri (walk-forward)
k_A ≈ 0,75–0,85 (2025-06'dan beri kararlı: true30 hızlı ürünlerde ortalamaya dönüşü kaçırıyor), k_B ≈ 0,95–1,04 (etkisiz),
**k_C = 1,40 tavanında** (ham 1,7–2,6: seçim etkisi — U30 = 0 olan aralıklı ürünler sonra satıyor). C'yi büyütmek C'de felaket oranını 4,1% → 5,1%,
fazla birimi %28,8 → %43,9, ciro ağırlıklı WAPE'yi 110,8% → 127,4% kötüleştiriyor; toplam ciro ağırlıklı WAPE 94,8% → 98,1%.

### Segment kazananları / kaybedenleri (uzun, WAPE)
| Segment | n | M0 | En iyi | En kötü |
|---|---|---|---|---|
| Hız A (≥30/ay, birimlerin %56'sı) | 798 | 84,1% / +22,9% | M5 79,9% / +9,5%, >2× 39,3 → 35,8% | M6 99,8% |
| Hız B (5–30/ay) | 2.598 | 85,0% / +1,4% | M0 | M1 99,9% |
| Hız C (<5/ay, gözlemlerin %86'sı) | 20.517 | 100,2% / −42,6% | M0 | M3 125,7% |
| Yeni (<90 gün) | 3.232 | 90,5% | M2 88,3% (bias −17%) | M3 112,7% |
| İlk 50 ciro | 2.500 | 84,4% / +19,3% | M5 81,4% | M6 99,3% |
| Trendyol API tam pencere | 3.143 | 75,8% | M5 69,7% | M6 83,9% |
| API öncesi | 19.198 | 89,9% | M0 | M6 105,1% |
| Eski tekstil | 1.452 (164 adet) | 186,6% | M0 | M3 262,6% |

- **Mevsimsellik (M6 − M1):** WAPE +0,2 pp, \|bias\| −1,2 pp → ölçülebilir artımlı fayda yok; kullanılmaz.
- **Soğuk başlangıç:** `<7` gün (n = 214) M0 bias −72,9% → UNKNOWN doğru. `7–29` gün: yıllıklandırma (P) M0'dan kötü (106,9% / +35% / >2× 37,4%
  vs 87,3% / −19,6% / 18,4%) → açık yıllıklandırılmış tahmin önerilmez.

### Ön kayıt dışı gözlem (karar için kullanılmadı)
Yalnız A'ya M5 faktörü, B/C'ye M0 uygulansaydı (aynı veriden segment toplamlarıyla birebir hesap): WAPE 85,1% (−2,3 pp), bias −2,6%, >2× 7,97%,
fazla birim %41,2. Bu bileşim sonuçlar görüldükten sonra tasarlandığı için aynı 50 kesimde **kanıt sayılmaz**; ancak yeni bir ön kayıtla
(`M7_A_shrink`: k_A walk-forward, yalnız küçültme [0,6, 1,0], B/C = true30) ileriye dönük (2026-10-06 sonrası kesimler) gölge ölçümle sınanabilir.

## Uygulama (PR2) — `observed-sales-v2-true30`
Karar (kullanıcı onayı, 2026-10-06): üretim modeli **kanonik Financial Memory + global true30**. Daha karmaşık model yok; ekonomik kazanç
eski zincirdeki çift kaynak + max/mevsim + manuel taban hatalarının kaldırılmasından geliyor.

- **Bayrak:** `FORECAST_V2_ENABLED` (yalnız tam olarak `"true"` açar; varsayılan kapalı). Kapalıyken her tüketici eski ifadesini birebir
  çalıştırır (V2 sorgusu bile çalışmaz). Açıkken yalnız aşağıda MIGRATE_V2 işaretli tüketiciler V2'ye geçer. Merge sonrası otomatik açılmaz.
- **Model** (`lib/forecast/v2.ts`, yükleyici `v2-loader.ts`): yalnız `fm_sales_canonical_snapshot` (COUNTED, eşlenmiş `product_id`), gerçek
  `[as_of − 30, as_of)` penceresi (as_of = İstanbul bugünü, bugünün eksik günü hariç). Eski `UNION ALL` yok, `max()` yok, mevsim yok, manuel yok.
  Tek SELECT, üretimde 1.325 ürün için ≈0,27 sn; istek başına bir kez (React `cache`).
- **Çıktı sözleşmesi:** `sku, product_id, as_of, horizon_days (30), forecast_units, model_version, history_days, segment (A/B/C, kesim öncesi
  90 gün), data_grade (FULL/PARTIAL/UNKNOWN), estimated (false — gözlenen sayım), reason_flags, source_watermark, demand_estimate_units,
  manual_override_units, model_forecast, manual_override, effective_forecast`.
- **Soğuk başlangıç:** ilk kanonik satıştan `< 7` gün veya hiç satış yok → `forecast_units = null` (UNKNOWN); `7–29` gün → gözlenen true30,
  `PARTIAL` (yıllıklandırma yok); `≥ 30` → FULL. `decisionUnits()` yalnız FULL için değer döner; PARTIAL/UNKNOWN sipariş/sermaye motorlarına
  0 (“Veri Eksik”) olarak girer.
- **Talep tahmini ayrı:** `demand_estimate_units` = stoklu günlerdeki satış / stoklu gün × 30; 30 günün hepsinde stok bilinmiyorsa veya
  < 10 stoklu gün varsa UNKNOWN. Hiçbir tüketici bunu tahmin yerine kullanmaz (testle kilitli).
- **Manuel potansiyel:** `effective_forecast = model_forecast`; manuel değer yalnız karşılaştırma (UI'da gösterilir), satın alma/sermaye
  hesabına girmez; mevcut değerler silinmez/değişmez. Toptan/bayi manuel potansiyelleri de V2 açıkken karar talebine girmez.
- **Sessiz değişim yok:** V2 açıkken taşınan her ekranda uyarı bandı + `/admin/forecast-v2` gölge sayfası (eski/yeni, mutlak ve % fark,
  sipariş kuralı etkisi, açık siparişler). Saklı kayıtlar (taslak siparişler, `cfo_order_line`, ImportDecisionSnapshot) değiştirilmez.
  Otomatik sipariş üretilmez; 5 milyon TL borç kapısı (`lib/cfo-agent/debt-policy.ts`) aynen.

### Tüketici denetimi (kaynak: `lib/forecast/consumer-audit.ts`, testle zorlanır)
| Karar | Tüketici | Eski talep | V2 açıkken |
|---|---|---|---|
| MIGRATE_V2 | importer-view route + istemci | max(forecastMonthlySales(UNION), manuel) | FULL V2; manuel düzenleme talebi değiştirmez; eski ömür boyu adet ipucu gizli |
| MIGRATE_V2 | sermaye sağlığı (`lib/capital/health.ts` — /admin/sermaye + dashboard manşeti, 2026-10-07 birleşti) | max(forecastMonthlySales(UNION), manuel) | FULL V2 |
| MIGRATE_V2 | akıllı öneriler | max(Trendyol 30g, manuel) | FULL V2 |
| MIGRATE_V2 | ithalat kokpiti | max(Trendyol Delivered×(1−iade), manuel) + toptan + bayi; STOKSUZ_AL ömür boyu yedeği | FULL V2; STOKSUZ_AL sinyali kalır, eski kaynaklı adet yok |
| MIGRATE_V2 | sipariş formu ön doldurma (reorder) | manuel toplam × 2 − stok | FULL V2 × 2 − stok; 0 → minimum stok kuralı |
| MIGRATE_V2 | ürün detayı ithalat kararı, import snapshot | manuel toplam | FULL V2 (karar/puan büyüklükten bağımsız) |
| KEEP_LEGACY | sales-potential, import-decision, importer-cost motorları (capital-allocation 2026-10-07 kaldırıldı — tek çağıranı /admin/capital birleşti) | saf motorlar | girdiyi çağıran belirler |
| KEEP_LEGACY | stok sağlığı, marketplace kâr, ürün listesi hız sütunları | gözlem metrikleri | gösterim |
| KEEP_LEGACY | AI CFO (snapshot/iş planı), CFO ithalat planı | min(kanonik/30, XML) · saklı `monthly_sales` | kapsam dışı (zaten ihtiyatlı) |
| DEPRECATE | `lib/procurement.ts` (çağıran yok) | — | ayrı temizlik PR'ı (executive ölü seçimleri sayfa birleşmesiyle 2026-10-07 gitti) |

### Gölge karşılaştırma — üretim, 2026-10-06 (salt-okunur, `shadowSql`, PGlite'ta TS referansıyla birebir)
Aktif SKU 1.311: FULL 1.152 · PARTIAL 11 · UNKNOWN 148 (146 hiç kanonik satış yok, 2 < 7 gün) · talep tahmini bilinen 134 · kanonik filigran 2026-10-05.

| Aylık talep (adet) | Toplam |
|---|---|
| Eski importer/sermaye efektif = max(motor, manuel) | 7.529 |
| Eski motor (max/mevsim, manuel hariç) | 5.999 |
| Eski Trendyol 30g ∨ manuel (dashboard/öneriler/capital) | 4.399 |
| Eski kokpit | 4.544 |
| **V2 tahmin** (PARTIAL 35 dahil) | **1.747** |
| V2 karar (yalnız FULL) | 1.712 |

V2 ile eski efektif karşılaştırması (1.163 SKU; 148 UNKNOWN ayrı): **>%25 fark 377 SKU**, **>2× fark 150 SKU**, V2 daha düşük 384, daha yüksek 0.
Trendyol-tabanlı eski sinyale göre: >%25 123, >2× 62 (V2 80 SKU'da daha yüksek — tüm kanallar).

| Sipariş kuralı (yalnız talep kısmı) | Eski adet>0 SKU | V2 adet>0 | Değişen | Sıfıra düşen | Eski adet | V2 adet | Azalan adet | Artan adet |
|---|---|---|---|---|---|---|---|---|
| Kokpit 90 gün kapsam | 77 | 55 | 90 | 42 | 8.807 | 1.832 | 7.896 | 921 |
| İthalatçı 45 gün ihtiyaç | 325 | 43 | 317 | 282 | 5.964 | 832 | 5.132 | 0 |
| Sipariş formu 2× (stok ≤ min) | 1.093 | 1.093 | 60 | 0 | 4.761 | 2.242 | 3.213 | 694 |

Açık kayıtlar (değiştirilmedi): 1 DRAFT satın alma siparişi (25 kalem, 1.632 adet) — V2'ye göre 24 kalemde stok+sipariş 90 günü aşıyor
(eskiye göre 11), 16 kalemin V2 karar talebi yok. 34 BEKLIYOR CFO sipariş satırı (4.346 adet): satırdaki aylık satış toplamı 1.261,5,
V2 karar toplamı 450; 33 satırda >%25, 24 satırda >2× fark; 16 satırın V2 karar talebi yok.

**TL ifadesi:** tarihsel maliyet olmadığı için tarihsel TL tasarrufu hesaplanmaz. Yalnız *bugünkü* `Product.unitCostTry` ile ileriye dönük
maruziyet (433 SKU maliyetli): kokpit kuralında azalan 7.380 adet ≈ ₺2,72 M; ithalatçı kuralında 4.480 adet ≈ ₺2,48 M. Bu bir tahmin değil,
öneri adedi farkının bugünkü maliyetle çarpımıdır ve geri testten ayrıdır. Geri test (PR1/PR2, birim): üretim yolu L4 fazla birim oranı
≈ %111,6 → true30 ≈ %45,7 (gerçekleşen birime oranla).

### M7 A-shrink (yalnız gölge)
`shadow-m7-a-shrink-v1` (`lib/forecast/m7-shadow.ts`): A segmentinde k_A·U30, k_A walk-forward (yalnız küçültme [0,6, 1,0], ≥300 gözlem,
≥4 kesim), B/C = true30. Keşif kesimi **2026-10-06**: yalnız bu tarihten itibaren haftalık kesimler ve hedefi tamamen geçmiş olanlar
puanlanır (ilk puanlanabilir gün 2026-11-06); daha öncesini doğrulama olarak kullanmak kodla engellenir. Üretim kodu M7'yi import etmez
(testle kilitli). Telemetri: `--print-sql m7Forward` (M0 vs M7: WAPE, bias, >2×, fazla birim, n). Terfi otomatik değil; gelecekteki kapı:
≥12 ileri kesim, ≥150 A gözlemi, WAPE ≥3 pp iyileşme, |bias|/>2×/fazla birim kötüleşmez + ayrı PR ve onay.

### Geri alma
`FORECAST_V2_ENABLED` kaldır/`false` → bir sonraki istekte tüm tüketiciler eski formüle döner (veri/migration değişikliği yok). Kod geri
alımı gerekirse PR revert yeterli; hiçbir tablo yazılmadı.

### Testler
`forecast-v2` (sözleşme, soğuk başlangıç, manuel/talep izolasyonu, yükleyici SQL == referans, çift Trendyol/UNION/iptal/manuel değişikliğine
bağışıklık, M7 ileri SQL == TS, M7 V2'yi değiştirmez), `forecast-shadow` (gölge SQL == TS referansı), `forecast-consumers` (20 çağrı noktası
kayıtlı ve zorlanır, bayrak kapalı = eski, açık = yalnız FULL V2, borç kapısı etkilenmez), mevcut `forecast-backtest*`, `forecast-candidates`.
