# Satış / Ciro Düşüşü Analizi

> Kaynak: `docs/urunler.xlsx` → `raw_ciro` sayfası (3.643 ürün, kümülatif tüm-zaman
> verisi + ürün-başı ilk/son satış tarihi). Analiz tarihi referansı (SNAP): **2026-04-15**
> (dosyadaki en yeni hareket 2026-04). Hesap scripti: session scratchpad `analyze.py`
> (xlsx repoda commit'li olduğu için tekrar üretilebilir).

## TL;DR — Düşüşün mekanik nedeni

Ciro düşüşü rastgele değil. İki eş-zamanlı arıza var:

1. **Tarihi kazananlar öldü ve yeniden stoklanmadı.** Tüm-zaman cironun en büyük
   20 ürününün **%52'si (15,2M TL) artık "sessiz"** — son satışı 60+ gün öncesinde.
   Bunların çoğu **stok = 0**'a düşüp bir daha alınmamış (yürüme bandı, spin bike,
   PS4/Xbox kolları, ring light). Bu bir talep kaybı değil, **ikmal/tedarik arızası.**
2. **Yeni kazanan pipeline'ı kurudu.** İlk kez satılan (yeni) ürün sayısı 2025 boyunca
   ayda ~30 iken, **2026-02'de 12, 2026-03'te 9, 2026-04'te 1'e** düştü. Eski ürünler
   ölürken yerlerini dolduracak yeni ürün girmiyor.

Eski kazananlar ölüm hızı > yeni kazanan doğum hızı ⇒ ciro mekanik olarak düşer.

## 1) Ciro aşırı yoğunlaşmış (kırılganlık)

| Dilim | Ciro | Toplam pay |
|---|---:|---:|
| Top 5 | 16,9M TL | %25,5 |
| Top 10 | 22,8M TL | %34,5 |
| Top 20 | 29,0M TL | %43,8 |
| Top 50 | 38,1M TL | %57,6 |
| Top 100 | 45,6M TL | %68,9 |

Toplam ~66,1M TL ciro, 3.643 üründen sadece 100 tanesi %69'unu üretiyor. Böyle bir
katalogda **1-2 hero ürünün ölmesi** ciroyu ciddi sarsar — nitekim olan bu.

## 2) Top-20 kahramanların yarısı sessiz

**Sessiz olanlar (60+ gündür satış yok) — 9 ürün / 15,2M TL (top-20'nin %52'si):**

| Ciro | Son satış | Sessiz gün | Stok | Ürün |
|---:|---|---:|---:|---|
| 4,38M | 2025-03-29 | 381 | 0 | Anunnaki Uzaktan Kumandalı Portatif Yürüme Bandı |
| 3,62M | 2025-01-29 | 440 | 0 | Anunnaki Spin Bike Kondisyon Bisikleti |
| 2,58M | 2025-06-04 | 314 | 0 | PC/PS4 Doubleshock Titreşimli Oyun Kolu |
| 1,25M | 2025-05-28 | 321 | 0 | Anunnaki Xbox 360 / PC Kumanda |
| 1,10M | 2025-07-19 | 269 | 0 | Anunnaki 10" Ring Light |
| 0,65M | 2025-11-27 | 138 | 0 | PC/PS4 Doubleshock Oyun Kolu (varyant) |
| 0,49M | 2025-07-18 | 270 | 0 | Anunnaki 3'ü1 Barfiks/Dips Aparatı |
| … | | | | (Gold duş seti, "Online Sipariş Ürün" dahil) |

Ortak payda: neredeyse hepsi **stok 0**. Yani ürünler talebi olduğu için değil,
**bittikleri ve yeniden alınmadıkları için** durdu.

**Hâlâ canlı olanlar (mevcut momentum) — 11 ürün / 13,8M TL:** Baofeng UV-82 telsiz
(4,1M), GP Pointer metal dedektör (2,2M, stok 192), Akıllı Eviye Seti (1,4M, stok 100),
taharet musluğu, mutfak/banyo armatürleri, 360 IP kamera, boks torbası, MD-3010ii
dedektör, Bluetooth ses alıcı. Katalog **oyun/fitness aksesuarından → hırdavat/armatür/
dedektör** eksenine kaymış; ciroyu bugün bu yeni set taşıyor.

## 3) Katalogun geneli yaşlanmış

Son satış tarihine göre tüm-zaman cironun ne kadarının "durgun" olduğu:

| Eşik | Ürün | Tüm-zaman cirosu | Pay |
|---|---:|---:|---:|
| 60+ gün sessiz | 3.386 | 41,6M TL | %62,9 |
| 90+ gün sessiz | 3.312 | 38,5M TL | %58,2 |
| 180+ gün sessiz | 3.206 | 33,0M TL | %50,0 |
| 365+ gün sessiz | 3.065 | 23,1M TL | %34,9 |

Ciroyu tarihte kuran ürünlerin **%63'ü son 2 aydır hiç satmıyor.** Bugünkü ciro çok
daha dar bir aktif çekirdeğe yaslanıyor.

## 4) Yeni ürün girişi çöktü (asıl erken uyarı)

İlk kez satılan ürün / ay (katalog tazeliği):

```
2025-07: 30   2025-10: 37   2026-01: 23
2025-08: 18   2025-11: 30   2026-02: 12
2025-09: 39   2025-12: 21   2026-03:  9   2026-04: 1
```

Yeni-ürün motoru 2025 sonunda ayda ~30'dan 2026'da tek haneye indi. Bu, cirodaki
düşüşün **öncü göstergesi**: yeni denemeler durunca, birkaç ay sonra ölen eski
kazananların yerini dolduracak kimse kalmıyor.

## 5) Kanal bağımlılığı riski

`ToplamDetay` kırılımından ciro payı:

| Kanal | Ciro | Pay |
|---|---:|---:|
| Trendyol | 45,0M | %68,1 |
| Hepsiburada | 12,6M | %19,1 |
| Kendi site (soyluelektronik) | 2,3M | %3,5 |
| n11 | 2,3M | %3,4 |
| ePTT / Koçtaş / Pazarama / GG / diğer | — | ~%5 |

**Trendyol + HB = %87.** Trendyol tarafında bir görünürlük/algoritma/ceza değişimi
tek başına toplam ciroyu düşürmeye yeter. Hero ürünlerin çoğunun da Trendyol ağırlıklı
olması bu riski büyütüyor.

## 6) Maliyet & borç yükü (bağlam)

Kaba toplamlar (ilgili sayfalar): Sabit gider ≈ 2,06M, Kredi kartı ≈ 2,17M,
Krediler ≈ 0,65M, Borçlar sayfası ≈ 2,42M. Ciro daralırken bu sabit yük, nakit
akışını hero ürünleri **yeniden stoklayamayacak** kadar sıkıştırıp kısır döngü
yaratıyor olabilir (stok 0 → satış yok → nakit yok → stoklanamıyor).

## Öneriler (etki sırasıyla)

1. **Ölü hero'ları yeniden stokla.** Yürüme bandı (4,4M), spin bike (3,6M), oyun
   kolları (2,6M+0,65M), ring light — hepsi talebi kanıtlı, sadece stok 0. En yüksek
   ROI'li ciro-kurtarma hamlesi bunların ikmali. Önce nakit yeten 2-3 tanesiyle başla.
2. **Yeni-ürün motorunu tekrar çalıştır.** Ayda ≥15-20 yeni ürün denemesi hedefle;
   pipeline kuruması cirodaki düşüşün kök nedeni.
3. **Kanal çeşitlendir.** Trendyol/HB %87 bağımlılığını kır; canlı hero'ları
   (dedektör, armatür, telsiz) n11/Pazarama/kendi site/Amazon'da güçlendir.
4. **Ölü stok temizle.** 60+ gün sessiz + stoklu SKU'ları eritip nakde çevir, o nakdi
   (1)'e aktar.
5. **Erken uyarı paneli.** "Hero ürün stok 0" ve "son satış > 30 gün" alarmları — bu
   analizde görülen çöküş aylar önce yakalanabilirdi.

## Veri sınırı & sonraki adım (dürüst not)

- Bu analiz **kümülatif tüm-zaman** verisi + ürün-başı **son satış tarihi** üzerine
  kurulu. Gerçek **aylık ciro zaman-serisi** xlsx'te yok (`Malidurum` sayfası boş,
  yalnız Mart/Nisan dolu). Dolayısıyla "bu ay X TL vs geçen yıl Y TL" **kesin** rakamı
  bu dosyadan verilemez; "sessiz gün" ve "yeni ürün/ay" metrikleri düşüşün yönünü ve
  nedenini gösterir, tutarını değil.
- Kesin aylık karşılaştırma uygulamanın veritabanındaki `MarketplaceSalesRecord`
  (`orderDate`) üzerinden `date_trunc('month', order_date)` ile alınmalı. Bu oturum
  interaktif olmadığından `execute_sql` onayı alınamadı; DB erişimi açıldığında aylık
  seri eklenip bu rapor "kesin rakam" katmanıyla güncellenmeli.
