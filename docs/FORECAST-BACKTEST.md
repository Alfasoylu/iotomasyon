# Tahmin geri testi (PR1 — yalnız ölçüm altyapısı)

Amaç: satış tahmin motorlarını **sızıntısız, tekrarlanabilir** biçimde ölçmek ve bugünkü üretim çağrı yolundaki şişmeyi katmanlarına
ayırmak. **Üretim davranışı değişmez:** `lib/sales-forecast.ts` ve çağıranlar aynen kalır; migration yok, üretime yazma yok,
bayrak açılmaz. Model seçimi (Forecast V2) bu raporun verisiyle **ayrıca** yapılacak; bu PR kazanan seçmez.

## Bileşenler
- `lib/forecast/models.ts` — modeller. Adlandırma tahmin/talep ayrımını açık tutar:
  - `observed_sales_forecast_*`: gözlenen satış tahmini (stoksuzluk dahil). `legacy_fms` = üretimdeki `forecastMonthlySales()` fonksiyonunun **kendisi**, kesim anı `now` verilerek ve yalnız eğitim kovalarıyla çağrılır; `true30`, `true90` (/3), `blend_seasonal_no_max`.
  - `stock_adjusted_demand_estimate_30`: yalnız stok geçmişi pencereyi tam kapsıyorsa; stoklu günlerdeki satış / stoklu gün × 30; ≥10 stoklu gün yoksa **UNKNOWN** (stoksuz günler satışla doldurulmaz).
  - Üretim katmanları (kümülatif): `L0` kanonik gerçek 30 gün → `L1` eski `UNION ALL` (çift kaynak, doğru durum filtresi) → `L2` üretimdeki durum filtresi (Türkçe `İ` sızıntısı) → `L3` ay kovası penceresi (`last30dUnits`) → `L4` `max(last30, blend×mevsim)` = `monthlyUnits` → `L5` çağıran tarafı `max(tahmin, Product.onlineSalesPotential)` = `effectiveMonthlyUnits`.
- `lib/forecast/backtest.ts` — saf referans uygulama: kesim takvimi, eğitim dilimi, segmentler, metrikler, rapor meta verisi, `forecastSnapshot` (sızıntı testleri için kesim anındaki bilgi).
- `lib/forecast/backtest-sql.ts` — üretim için SQL portu (yalnız `SELECT`; `begin read only` + `set local enable_nestloop = off` ön eki, sonuç değil yalnız plan değişir). **PGlite üzerinde TS referansıyla birebir eşdeğer** (`__tests__/forecast-backtest-sql.test.ts`).
- `scripts/forecast-backtest.ts` — salt-okunur çalıştırıcı (`--print-sql <bölüm>` veya `FORECAST_BACKTEST_DATABASE_URL` ile READ ONLY işlem; bağlantı metni yazdırılmaz).

## Kurallar
- **Sızıntı yok:** kesim `c` için eğitim verisi `economic_date < c`. Segmentler, fiyat ağırlıkları ve tüm model girdileri yalnız eğitim verisinden; yalnız hedef (`[c, c+30)`) geleceğe bakar. Test edilen sızıntı yolları: kesim sonrası satış, stok, fiyat/ciro, eski kaynak satırları, manuel potansiyel; point-in-time modunda ayrıca sonradan öğrenilmiş alias/eşleme ve sonradan bilinmiş toplu import (`known_at`).
- **Etiket:** üretim çalışması **"economic-time backtest, not historical knowledge-state replay"**. Kanıt (üretim, salt-okunur): kanonik satırların en erken `known_at` değeri 2026-05-17; 50 kesimin 42'sinde eğitim birimlerinin %0'ı, kalanlarda en çok %94,9'u kesimden önce biliniyor (hiçbirinde ≥%99 değil). Eşlemeler bugünkü haliyle uygulanır.
- **Manuel potansiyel:** `Product.onlineSalesPotential` geçmişi yok → geri testte **UNKNOWN**; yalnız bugün için seviye (gerçekleşen yok) ölçülür. Bugünkü değer geçmişe uygulanmaz.
- **Sermaye ağırlıklı hata:** **UNKNOWN** — tarihsel birim maliyet yok (`Product.unitCostTry` yalnız güncel); bugünkü maliyet geçmişe uygulanmaz.
- **Durum filtresi:** üretimdeki `ILIKE '%iptal%'` sonucu DB yereline bağlı; üretim (`en_US.UTF-8`) `İ`'yi `i̇` yapar → `İade-İptal` satış sayılır. SQL bu davranışı yerel bağımsız taklit eder; üretimde gerçek ILIKE ile **0 uyuşmazlık** doğrulandı.

## Metrik tanımları
WAPE = Σ|f−a|/Σa (birim hacim ağırlıklı) · sapma = Σ(f−a)/Σa · MAE = Σ|f−a|/n · fazla/eksik tahmin oranı = f>a / f<a payı ·
**felaket fazla tahmin** = f > 2·a **ve** f−a ≥ 3 adet (düşük hacim gürültüsünü dışlamak için mutlak alt sınır) · ciro ağırlıklı WAPE/sapma =
her gözlem kesim öncesi gerçekleşen birim fiyatla (90 gün, yoksa 365 gün) ağırlıklı. Segmentler yalnız kesim öncesi bilgiyle:
hız (90 gün/3: A ≥30, B 5–30, C <5 adet/ay), iş kolu (çekirdek/eski tekstil), yaşam döngüsü (ilk satış <90 gün = yeni), ciro dilimi
(90 gün ciro sırası: ilk %20 / sonraki %30 / kalan), ilk 50 ciro, baskın 90 gün kanalı, C hariç; stok bazlı bölümde stok durumu.

## Üretim çalıştırması — 2026-10-06 (salt-okunur)
Yeniden üretim: sürüm `forecast-backtest-v1`, SQL sha256 `e74eac2aa4dad53150141b2734b75650540d48ca1ef4b9f14425ba5a5ec6e713`,
`productionSchedule("2026-10-06")`: uzun = 50 kesim, 14 günde bir 2024-10-08…2026-08-25; kısa = 12 kesim, haftalık 2026-06-16…2026-09-01;
bugün = 2026-10-06. Kaynak filigranları: kanonik 146.615 sayılan satır (2020-08-05…2026-10-06, son `known_at` 2026-10-06 06:11),
son ingest `311d7cec…` `sales_refresh` (2026-10-06 08:36 UTC), stok 3.242 satır / 275 ürün (2026-05-17…2026-10-06).
Çalıştırma: 2026-10-06 ~14:57–15:30 UTC. Not: `source_era` satırları aynı SQL'e yalnız `where dim = 'source_era'` çıktı süzgeci eklenerek alındı (hesap aynı).

### Uzun dönem karşılaştırma (gözlenen satış, tüm anahtarlar, n = 23.913)
| Model | WAPE | Sapma | Fazla tahmin | >2× felaket | Yüksek hız (A) WAPE / sapma | Ciro ağ. WAPE / sapma | Örneklem |
|---|---|---|---|---|---|---|---|
| `legacy_fms` (kanonik girdi) | %126,7 | +%53,5 | %49,8 | %19,8 | %104,9 / +%50,2 | %133,7 / +%54,1 | 23.913 |
| `true30` | %87,4 | +%5,0 | %21,5 | %8,1 | %84,1 / +%22,9 | %94,8 / +%6,5 | 23.913 |
| `true90` | %100,9 | +%3,1 | %38,0 | %9,4 | %99,3 / +%22,6 | %111,4 / +%5,8 | 23.913 |
| `blend_seasonal_no_max` | %117,7 | +%10,9 | %79,2 | %14,3 | %93,2 / +%0,8 | %124,2 / +%12,2 | 23.913 |
| **Üretim yolu `L4`** (eşlenmiş çekirdek) | %143,5 | +%79,7 | %54,2 | %23,8 | %126,2 / +%80,9 | %150,5 / +%79,7 | 21.142 |
| Üretim yolu `L0` (aynı evren) | %86,8 | +%4,5 | %22,5 | %8,7 | %84,1 / +%22,9 | %94,0 / +%5,9 | 21.142 |

Düşük hacim etkisi: C segmenti gözlemlerin %85,8'i, gerçekleşen birimlerin %19,5'i; mutlak hatanın `legacy_fms`'te %32,1'i,
`true30`'da %22,3'ü. C hariç: `legacy_fms` WAPE %106,9 / +%46,6; `true30` %84,4 / +%16,5. İlk 50 ciro: `legacy_fms` %105,6 / +%47,6;
`true30` %84,4 / +%19,3. Yüksek hız ve ilk 50'deki pozitif sapma tüm modellerde görülüyor (geçmiş satışa göre seçilen SKU'larda
ortalamaya dönüş) — V2 tasarımında dikkate alınmalı.

### Kısa dönem stok bazlı karşılaştırma (2026-06-16…09-01, n = 1.234; ayrı tutulur, uzunla birleştirilmez)
Dışlanan: stok kaydı pencereyi kapsamayan 4.085, eğitimde <10 stoklu gün 362; hedefte <10 stoklu gün 135 (yalnız stok-normalize hedeften).
| Model | Hedef | WAPE | Sapma | >2× | Stok kısıtlı (n) WAPE / sapma |
|---|---|---|---|---|---|
| `observed_sales_forecast_true30` | gözlenen satış | %77,1 | +%31,6 | %17,1 | (180) %229,6 / +%151,0 |
| `stock_adjusted_demand_estimate_30` | gözlenen satış | %79,8 | +%35,4 | %18,2 | (180) %316,6 / +%271,1 |
| `observed_sales_forecast_true30` | stok-normalize talep | %68,8 | +%22,1 | %14,3 | (79) %74,4 / −%19,5 |
| `stock_adjusted_demand_estimate_30` | stok-normalize talep | %68,4 | +%23,0 | %14,5 | (79) %63,9 / +%8,7 |

Yorum: stok düzeltmesi yalnız kısıtlı SKU'larda fark yaratıyor (79–180 gözlem); talep tahmininde daha iyi, gözlenen satışı tahmin
etmede daha kötü — ikisi farklı soruların cevabı olduğu için ayrı adlandırıldı.

### Tahmin şişme şelalesi (üretim çağrı yolu, eşlenmiş çekirdek ürünler)
Geri test, 50 kesim (n = 21.142, gerçekleşen 125.978 adet):
| Adım | Σ tahmin | Sapma | Marjinal | Toplam şişmedeki payı |
|---|---|---|---|---|
| L0 kanonik taban | 131.708 | +%4,5 | — | — |
| → çift kaynak (UNION ALL) | 152.561 | +%21,1 | +16,6 puan | %22,0 |
| → Türkçe-İ durum sızıntısı | 160.729 | +%27,6 | +6,5 puan | %8,6 |
| → ay kovası penceresi | 158.829 | +%26,1 | −1,5 puan | −%2,0 |
| → max/blend/mevsim | 226.378 | +%79,7 | +53,6 puan | %71,4 |
| → manuel override | **UNKNOWN** (geçmiş yok) | | | |

Tam Trendyol API penceresi (kesim ≥ 2026-06-03, 6 kesim, n = 2.840, gerçekleşen 15.345) — bugünkü duruma en yakın:
| Adım | Σ tahmin | Sapma | Marjinal | Pay |
|---|---|---|---|---|
| L0 | 16.187 | +%5,5 | — | — |
| → çift kaynak | 29.732 | +%93,8 | +88,3 puan | %60,7 |
| → durum sızıntısı | 30.476 | +%98,6 | +4,8 puan | %3,3 |
| → ay kovası | 31.405 | +%104,7 | +6,1 puan | %4,2 |
| → max/blend/mevsim | 38.506 | **+%150,9** (WAPE %198,5) | +46,3 puan | %31,8 |

Bugün (2026-10-06, 472 ürün; seviye, gerçekleşen yok): L0 1.768 → L1 3.512 (×1,99) → L2 3.567 → L3 4.214 (ayın 6'sında kova ≈ 36 gün)
→ L4 5.718 → **L5 7.201** (65 üründe manuel potansiyel > 0). Toplam ×4,07; şişmenin payı: çift kaynak %32,1, durum %1,0,
pencere %11,9, max/mevsim %27,7, manuel %27,3.

Not: katman sırası sabittir (kullanıcı tanımı); `max` doğrusal olmadığı için paylar sıraya bağlıdır. Ay kovası etkisi kesimin ayın
hangi gününe düştüğüne göre işaret değiştirir (ay başı +, ay sonu −); 2 yıllık ortalamada küçük görünür.

## Forecast V2 kabul kapısı için üretilen veri
WAPE, mutlak sapma, yüksek hız segmenti, felaket fazla tahmin oranı ve stok bazlı kısa pencere — hepsi model × segment satırı
olarak üretiliyor; V2 adayı aynı SQL/TS altyapısına model olarak eklenip **mevcut tabloya karşı** değerlendirilecek. Otomatik kazanan seçimi yok.

## Yeniden çalıştırma
`node --import tsx scripts/forecast-backtest.ts --today YYYY-MM-DD --print-sql long|waterfall|short|today|meta` → salt-okunur oturumda
çalıştır; ya da okuma yetkili bağlantıyla `FORECAST_BACKTEST_DATABASE_URL=… node --import tsx scripts/forecast-backtest.ts --today …`.
Aynı veri + aynı sürüm ⇒ aynı sonuç (TS tarafında `reportHash` ile test edilir; SQL metninin sha256'sı raporda).
