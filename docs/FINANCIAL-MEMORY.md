# Financial Memory (AI CFO V2 — Step 1)

Bu belge Financial Memory'nin **kararlaştırılmış kurallarını** ve kanıtlarını tutar. Kod değişince
bu belge ve CHANGELOG birlikte güncellenir.

## İlkeler

- Ham kaynak tablolar **değiştirilmez**. Hafıza yalnız canonical katmandan beslenir.
- Aynı ekonomik satış canonical katmanda **yalnız bir kez** bulunur; iki kaynak **asla toplanmaz**.
- Bilinmeyen = `NULL`/`U` (unknown). Bilinmeyen iade 0 sayılmaz; bugünkü maliyet geçmişe uygulanmaz.
- Kalite = `A/B/C/D/U` + açık `quality_flags`. Sayısal "confidence" kalibre edilene kadar kullanılmaz.
- `economicDate` (satışın gerçekleştiği gün) ile `knownAt` (CFO'nun bilgiyi bilebileceği an) ayrıdır.
  2020–2026-04 geçmişi 2026-05-19'da toplu içe aktarılmıştır; bu yüzden geçmiş trend analizi ile
  "o gün CFO ne bilirdi" (decision replay) aynı şey değildir.

## Step 1B — Canonical Sales Layer

Migration: `prisma/migrations/20261005210000_fm_canonical_sales`. Yalnız VIEW (security_invoker;
anon/authenticated/PUBLIC yetkisiz; `cfo_acceptance_reader` SELECT).

| View | Görev |
|---|---|
| `fm_sales_source_rows` | `MarketplaceSalesRecord` + `TrendyolSalesRecord` satırlarını ortak şekle indirger (değer değişmez) |
| `fm_sales_dispositioned` | Kaynak önceliği, dedupe, durum sınıfı; her ham satıra TAM BİR `disposition` |
| `fm_sales_canonical` | Dedupe edilenler çıkar; sayılan satırlarda set/paket adet düzeltmesi |
| `fm_sales_reconciliation_monthly` | Ay × kanal × kaynak × disposition tutar dökümü (ham = Σ disposition) |

### Kaynak önceliği (yalnız Trendyol kanalı; diğer kanallar `SINGLE_SOURCE`)

Sipariş anahtarı: `MarketplaceSalesRecord.orderNumber` ikinci parçası = `TrendyolSalesRecord.orderId`.

| Dönem | Birincil | İkincil |
|---|---|---|
| `economic_date < 2026-05-04` | Marketplace (`M_PRIMARY`) | Trendyol yalnız Marketplace'te **olmayan** siparişleri doldurur (`T_GAP_FILL`; Şubat 2026 Entegra deliği) |
| `economic_date ≥ 2026-05-04` | Trendyol API (`T_PRIMARY`) | Marketplace yalnız Trendyol'da **olmayan** siparişler için yedek (`M_FALLBACK`) |

Çakışan sipariş ikincil kaynaktan `DEDUP_DROPPED` olur. Gap-fill satırı Marketplace'te
tarih+SKU+adet+tutar aynı bir satıra benziyorsa `possible_cross_source_duplicate` flag'i alır
(silinmez; Phase 0B'de kesin anahtar eşleşmesi olmayan örtüşme kanıtlanamadı).

### Disposition

`COUNTED` · `EXCLUDED_CANCELLED` (Trendyol `Cancelled`, Marketplace `Tedarik Edilemedi`) ·
`EXCLUDED_RETURN` (Marketplace `İade-İptal`/`İadesi Onaylanan`; Trendyol `UnDelivered*`; Marketplace durumu
eşleşen Trendyol siparişine işlenir — Trendyol `Delivered` gösterse bile) · `EXCLUDED_TEST` · `DEDUP_DROPPED`.
İade/iptal tutarı 0 kabul edilmez; ham tutar satırda kalır, gelir `revenue_incl_vat_try` yalnız `COUNTED`'da dolu.

### Gelir tanımı

Başlık gelir = **KDV dahil `totalAmountTry`** (`revenue_incl_vat_try`). KDV hariç (`amount_ex_vat_try`) ve KDV
(`vat_try`) yalnız kaynakta varsa (Marketplace); Trendyol API satırlarında `NULL` + `ex_vat_unknown`.
Gelir kâr değildir. Set/paket adet düzeltmesi (v1 `cfo_satis_birim_duz` mantığı) **yalnız adedi** değiştirir.

### IDEASOFT ve legacy tekstil

IDEASOFT dahildir (kontrol: sipariş no tekrarı 0, test siparişi 1 adet ₺2, çapraz kanal birebir çakışma 3 satır / ₺2,4 bin);
fark `ideasoft_v1_excluded` flag'iyle izlenir. Armine/AlinModest tekstil satırları `legacy_business='TEXTILE_ARMINE'`
(+`legacy_textile` flag'i) ile etiketlenir, silinmez; ALFAS ürün performansına karıştırılmaz.

### Üretim mutabakatı (2026-10-05)

| Kalem | TL |
|---|---|
| Ham `MarketplaceSalesRecord` | 89.095.225,50 |
| Ham `TrendyolSalesRecord` | 7.454.277,59 |
| Σ disposition (`fm_sales_dispositioned`) | **96.549.503,09** (ham toplama birebir eşit) |
| Canonical gelir (`COUNTED`) | **87.617.597,19** |
| İki kaynakta birden bulunan Trendyol siparişi | 0 |
| Tekrarlı canonical anahtar | 0 |

v1 (`cfo_satis_birim`, 83.691.031) → canonical köprüsü: − Trendyol'a geçen Marketplace satırları 5.707.145
+ Trendyol API (≥2026-05-04) 5.742.726 (**net +%0,04 kaynak geçişi**) + IDEASOFT 3.046.737 + Şubat gap-fill 844.816
− canonical'ın ek dışladığı 569 = 87.617.597. Açıklanamayan fark yok.

## Step 1A — Reader güvenliği

`20261005200000_cfo_reader_security`: `cfo_secret` reader'a kapalı; Step 1 için eksik 11 veri tablosu yalnız SELECT;
veri yazan 5 SQL fonksiyonunda PUBLIC EXECUTE kaldırıldı. Ayrıntı: CHANGELOG.
