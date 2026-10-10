# CFO-028 — Komisyonu kayıtsız kanallar: ölçüm ve karar önerisi (2026-10-10, salt-okunur)

> **KARAR 2026-10-10 (Alperen: "Onaylıyorum" — §5'teki üç öneri):**
> 1. EPTT tahmini komisyon = Entegra oranı × KDV dahil toplam, `measured=false`; SKU oran ölçümüne girmez; ham kayıt değişmez → uygulama aşağıda (§6).
> 2. Diğer kanallar oran belgesi ya da hakediş dökümü gelene kadar UNKNOWN; %20 yer tutucu kullanılmaz.
> 3. 2 belgenin kategorisi düzeltildi (üretim, 2026-10-10 ~00:40 UTC, korumalı tek işlem + `cfo_change_log` area `veri` kind `duzeltme` 2 satır):
>    "Garanti bankası kredi kartı ekstresi" (Haziran) `KOMISYON_ORANI` → `KART_EKSTRESI`; "Trendyol konisyon indirim" (IMG_9502) `PLATFORM_FATURASI` → `KOMISYON_ORANI`.

> Hiçbir veri yazılmadı. Kaynak: üretim `MarketplaceSalesRecord` (Entegra satış dışa aktarımı, `lib/entegra/parse.ts`:
> "Komisyon Tutarı" → `commissionTry`, "Komisyon Oranı" → `commissionPct`), son 90 gün (2026-07-13 … 2026-10-05),
> `cfo_belge` (CFO-027 belge kütüphanesi). Karar Alperen'de (motorun komisyon ölçüm kuralı 2026-10-06'da onaylandı:
> yalnız ölçülmüş tutar, tek adet + `guven=YUKSEK`, 120 gün, SKU başına ≥10 kayıt).

## 1. Kanal bazında komisyon alanları (90 gün)

| Kanal | Satır | Ciro (TL) | Tutar boş | Tutar 0 | Oran > 0 | Ölçülen oran |
|---|---:|---:|---:|---:|---:|---|
| TRENDYOL | 4.438 | 3.699.790 | 0 | 1 | 4.438 | %16,94 (ölçülü) |
| HEPSIBURADA | 1.191 | 961.045 | 0 | 0 | 1.191 | %16,62 (ölçülü) |
| **EPTT** | 328 | **615.857** | **275** | 0 | **328** (ort. %14,31; %8–20) | tutar yalnız 53 satırda |
| N11 | 159 | 196.324 | 115 | 44 | 0 | yok |
| IDEASOFT (kendi site) | 25 | 93.816 | 25 | 0 | 0 | pazaryeri değil (ödeme kuruluşu kesintisi ayrı) |
| AMAZON | 125 | 78.034 | 108 | 17 | 0 | yok |
| PAZARAMA | 79 | 67.453 | 59 | 20 | 0 | yok |
| MIRAKL_KOCTAS | 12 | 64.388 | 12 | 0 | 0 | yok |
| IDEFIX | 25 | 59.135 | 0 | 25 | 0 | yok |
| AMAZON_FBA | 18 | 11.406 | 18 | 0 | oran alanı da boş | yok |
| TEMU | 9 | 6.104 | 0 | 9 | 0 | yok |

- Bu kanallarda `platformPaymentTry` (platformun ödediği net) **0** yazılı. Kaynakta veri yok, gerçek değer değil.
- `MarketplacePlatformPolicy.standardCommissionPct` tüm kanallarda %20 (2026-05-18). Bu bir yer tutucu: ölçülen Trendyol %16,94 ve HB %16,62'den farklı.
  Onaylı kanal oranı olarak **kullanılamaz**.

## 2. EPTT: oran var, tutar yok

- Entegra'nın "Komisyon Oranı" EPTT'de her satırda dolu, "Komisyon Tutarı" 328 satırın 275'inde boş. Ocak 2026'dan beri her ay böyle;
  Ekim–Aralık 2025'te ikisi de boştu.
- Hem tutarın hem oranın dolu olduğu 125 satırda (Ocak–Ekim 2026):
  - ortalama oran **%14,02**;
  - gerçek tutarın KDV dahil toplama oranı **%14,42**;
  - satır bazında oran × toplam hiçbir satırda ±1 TL tutmuyor (tutar ek kesinti ya da farklı matrah içeriyor olabilir).

  Ortalamada oran gerçek komisyonu ~0,4 puan **düşük** gösteriyor.
- Belge (CFO-027, Cowork özeti 2026-10-09, `cfo_belge` "Pttavm komisyonlar"): PttAVM kategori oranları KDV dahil. Güvenlik kameraları %15,
  akıllı güvenlik %15, fotoğraf/kamera %10, yapı market banyo/güvenlik %16, vitrifiye %13, ev dekorasyon/banyo %20, elektronik üst
  kategori %25. Defterde ölçülen ePttAVM ortalaması %14,47 bu karışımla tutarlı.
- **Etki:** tutarı boş satırlarda oran × toplam = **75.903 TL / 90 gün (≈ 308.000 TL/yıl)**. Bu komisyon bugün marj raporlarında
  görünmüyor. Motor bu satırları ölçüm dışı (UNKNOWN) sayıyor, 0 saymıyor; `commissionTry` toplayan raporlar ise 0 gösteriyor.

## 3. Diğer 6 pazaryeri + Amazon FBA: kaynakta veri yok

- N11, Amazon, Pazarama, Koçtaş, Idefix, Temu, Amazon FBA: 90 günde **482.844 TL** ciro. Ne oran ne tutar var.
- %15–20 aralığında bir komisyonla ≈ 72–97 bin TL / 90 gün (≈ 290–390 bin TL/yıl) kayıtsız gider.
- Belge kütüphanesinde bu kanalların oran belgesi **yok**. Yalnız PttAVM (özetlendi) ve Trendyol komisyon ekranı (kuyrukta) var.
- Ödeme/hakediş dökümleri (settlement) bu kanallar için sistemde yok (Trendyol'un var: `trendyol_settlement_line`).

## 4. Belge kütüphanesi gözlemi (CFO-027)

- 12 belge var: 11'i Cowork okuma kuyruğunda, 1'i özetlendi (PttAVM).
- Kategorisi yanlış görünen 2 belge var (değiştirilmedi):
  - "Garanti bankası kredi kartı ekstresi" (`Haziran fatih garanti Donem Kredi Karti Ekstresi.pdf`) → `KOMISYON_ORANI` kayıtlı, `KART_EKSTRESI` olmalı;
  - "Trendyol konisyon indirim" (komisyon tarife ekranı, `IMG_9502.png`) → `PLATFORM_FATURASI` kayıtlı, `KOMISYON_ORANI` olmalı.

## 5. Karar önerisi (Alperen)

1. **EPTT (önerilen):** Tutar boşken Entegra oranı × KDV dahil toplam, **tahmini komisyon** sayılsın.
   - Bayrak `measured=false`, kaynak "Entegra Komisyon Oranı". Kanal marjına girer. SKU komisyon oranı ölçümüne (06.10 kuralı) **girmez**.
   - Bilinen sapma ~ −0,4 puan, kayıtta belirtilir.
   - Ham satış kaydı değişmez; türetme okuma katmanında yapılır.
2. **Diğer kanallar:** Her kanal için oran belgesi (`/cfo/belgeler`, kategori `KOMISYON_ORANI`) ya da hakediş dökümü yüklensin.
   O gelene kadar UNKNOWN kalır. %20 yer tutucu kullanılmaz.
3. **Belge kategorileri:** Yukarıdaki 2 belgenin kategorisi düzeltilsin. Onayla, günlüklü tek satır güncelleme.
