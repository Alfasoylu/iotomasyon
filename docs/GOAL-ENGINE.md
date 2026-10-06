# Goal Engine (AI CFO V2 — Step 2)

Deterministik hedef motoru: hedefleri Financial Memory'den değerlendirir, sonucu kalite notu ve girdileriyle saklar.
LLM yok, tahmin uydurma yok. Kod değişince bu belge ve CHANGELOG birlikte güncellenir.

## Kararlar (kullanıcı, 2026-10-06)
| Konu | Karar |
|---|---|
| Hedefler | Aylık ciro (USD), toplam borç < 5M TL, servet (USD, tarihli), net pozisyon tabanı |
| Kur | TCMB aylık (`fm_memory_fx_monthly`, ayın 15'i Döviz Alış) — `cfo_settings.usdTryRate` **kullanılmaz** |
| Projeksiyon | Yalnız run-rate (gözlenen hız) |
| Entegrasyon | CFO iş akışının `goals` çıktısını doğrudan devralır |

## Bileşenler (migration `20261006130000_fm_goal_engine`)
- `fm_goal` — hedef tanımı, **sürümlü**. `fm_goal_sync()` `cfo_settings`'ten okur; değer değişirse eski sürüm `valid_to` ile kapanır, yeni sürüm açılır; ayar boşsa hedef emekliye ayrılır. Borç eşiği ayardan değil iş kuralından gelir (`NEW_ORDER_DEBT_LIMIT_TRY` = 5.000.000; test eşitliği doğrular).
- `fm_goal_observation` — değerlendirme geçmişi, yalnız ekleme. Aynı gün aynı girdi (input hash) → yeni satır yazılmaz (idempotent). Her satır `inputs` jsonb ile kaynaklarını taşır.
- `fm_goal_evaluate(as_of)` — tüm aktif hedefler; `as_of` İstanbul günü, "tamamlanmış gün" = `as_of`'tan önceki günler.
- `fm_memory_refresh_daily(today, interval)` — satış hafızası (önceki + bu ay; canonical snapshot yenilenir, ay ay yeniden yazılır, mutabakat kontrollü) ve bakiye hafızası. Son 6 saatte başarılı tazeleme varsa atlanır.
- `fm_memory_goal` — hedef başına son gözlem (CFO hot-path; reader SELECT).
- Uygulama: `lib/fm/goal-engine.ts` (`runGoalEngine`: tazele → değerlendir → oku; asla throw etmez), `lib/fm/goals.ts` (saf eşleme; zaman damgası içermez → değişmeyen döngüde workflow parmak izi sabit kalır). `runCfoCycle` her döngüde `goals` aşamasında çalıştırır; `/cfo/calisan` paneli gösterir.

## Durum kuralları
| Hedef | Gözlem | Durum |
|---|---|---|
| Aylık ciro | Ay başından tamamlanmış güne ciro (KDV dahil, canonical) | ACHIEVED (≥ hedef) · ON_TRACK (ay sonu run-rate ≥ hedef) · AT_RISK (≥ hedefin %90'ı) · OFF_TRACK · UNKNOWN |
| Borç < 5M | Son `debt_try` (≤3 gün) | ACHIEVED · NOT_MET (+ eğilim; eşik tarihi yalnız ufuk ≤ 4× eğilim aralığıysa) · UNKNOWN |
| Servet | Son `net_capital_try` (≤3 gün), hedef × TCMB | ACHIEVED · ON_TRACK/AT_RISK/OFF_TRACK (gözlenen hız vs gereken hız) · OFF_TRACK (tarih geçti) · UNKNOWN (eğilim yok) |
| Net pozisyon tabanı | `cfo_nakit_projeksiyon(120)` dibi | ACHIEVED (dip ≥ taban) · OFF_TRACK · UNKNOWN; kalite **D** (projeksiyon, hafıza değil) |

- Eğilim: son 30 gün, ≥5 gözlem ve ≥14 gün aralık; yoksa `goal_short_history`, değer projeksiyonu yok.
- **Uzun ufuk kuralı:** gözlenen eğilim aralığının 4 katından uzak bir tarih/değer üretilmez (`goal_projection_horizon_exceeded`). Durum hız karşılaştırmasıyla verilir.
- **Bilinmeyen bilinmeyendir:** satış hafızası dünü kapsamıyorsa (`goal_sales_memory_stale`), bakiye >3 gün eskiyse (`goal_balance_stale`), kur yoksa (`goal_fx_missing`) → UNKNOWN; eksik gün 0 sayılmaz.
- Kalite = girdilerin en kötüsü (ciro A, önceki ayın kuru → B; borç/servet C; taban D).
- Ayın ilk günü: önceki ayın nihai sonucu (`goal_previous_month_final`).
- Yeni sipariş kapısı (`debt-policy`) **ayrı bir kontroldür**; canlı `cfo_servet.borc` ve taze bakiye ister — Goal Engine onu değiştirmez.

## Üretim kabulü (2026-10-06)
Migration uygulandı + `_prisma_migrations` kaydı (checksum repo ile eşit). `fm_memory_refresh_daily` ilk çalıştırma: 2 ay, 110 bakiye satırı; Eyl/Eki mutabakat farkı **0**. Temiz DB (baseline + migration'lar) ↔ üretim parmak izi **17/17** ve Step 1 **21/21** birebir.

İlk değerlendirme (as_of 2026-10-06):
| Hedef | Durum | Kalite | Not |
|---|---|---|---|
| Aylık ciro 100k USD | OFF_TRACK | B | 5 gün: 309.927 TL; hedef 4.855.850 TL (TCMB Eylül 48,5585); run-rate 1,92M; gereken 174.843 TL/gün; `goal_short_window` |
| Borç < 5M TL | NOT_MET | C | 9.239.814 TL; eğilim −11.989 TL/gün (22 gözlem/25 gün); eşik tarihi ufuk dışında → üretilmedi |
| Servet 300k USD / 2027-12-31 | OFF_TRACK | C | 2.761.756 TL; gereken +26.177 TL/gün, gözlenen −33.152 TL/gün; değer projeksiyonu yok (ufuk) |
| Net pozisyon tabanı −3M | OFF_TRACK | D | 120 gün dibi −3.546.019 TL (2027-01-01) |

## Bilinen sınırlar
- Kaynak sistem gecikmesi (örn. bir pazaryeri importunun geç gelmesi) satır düzeyinde algılanmaz; ciro kalitesi A politikası çift kaynaklı doğrulamaya dayanır.
- Net sermaye ve borç serisi 2026-09-11'den başlar (C); öncesi bilinmiyor.
- Kur değişimi modellenmez (`goal_fx_constant_assumption`).
