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

## Sonuçlar
_Üretim çalıştırmasından sonra eklenecek._
