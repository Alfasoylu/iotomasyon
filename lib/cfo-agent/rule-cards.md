# AI CFO rule card'ları — SCHEDULED_CFO

> **Kaynak:** `handbook-core.md` (el kitabı v33 Blok A). Her paragraf el kitabından **BİREBİR** alıntıdır;
> kart yeni kural yazmaz. Planlı çağrıda bir anomali yalnız kendi kartını alır (en çok 2 kart / çağrı).
> Düzenleme: bu dosyayı değiştir → `npm run gen:handbook`. Test (`ai-cfo-rule-cards`): her paragraf
> `handbook-core.md`'nin alt dizesidir ve kart ≤ 1.250 bayttır (tutucu tahminle ≤ 500 token).

## CARD STOCKOUT — Stoksuzluk: kârlı hızlı satan ürün, stoksuzluk maliyeti ve yeniden sipariş için nakit kuralları

🔴 **CFO ÖZ ELEŞTİRİSİ 03.10 — MD-3003B1 birim kârı yanlış raporlandı: 160,32 ₺ değil
123,55 ₺.** Doğrusu: komisyon %16,83 (28 tek kalemli kayıt) → taban 627,57/(1−0,1683) =
**754,00 ₺**; gerçekleşen fiyat 903,23 ₺ → **birim kâr 123,55 ₺**. Stoksuzluk maliyeti
**658–914 ₺/gün** (5,33–7,40 adet/gün × 123,55).

- 🔴 **STOK DÜŞÜŞÜ SATIŞ DEĞİLDİR** (§4C, §9).
- **Kukla stok gerçek envanter değildir:** {500, 998, 999, 1000, 9999, 10000}.

- 🔴 **Gümrük ödemeleri NAKİT zorunludur.** Gümrükte **taksitlendirme ve teminat
  mektubuyla mal çekimi YOKTUR** (gümrük müşaviri 30.08.2026 kesin ret).
- 🔴 **Net nakit pozisyonu −3.000.000 ₺ altına inemez.**
- 🔴 **Yurtdışı sipariş YALNIZCA NAKİT ile verilir.** Nakit değildir: KMH · kart limiti ·
  nakit avans · şahsi hesaplar · tahsil edilmemiş hakediş.

## CARD DEAD_STOCK — Ölü stok: tasfiye merdivenin 6. basamağı, bağlı sermaye ve para maliyeti

🔴 **MERDİVENİN 1–6. BASAMAĞI TÜKENDİYSE 7. BASAMAK SAYIYLA RAPORLANIR (v31).**
`cfo_kart_karari()` "asgariye çekilecek 0 kalem · kaldıraç YETERSİZ" dediğinde geriye
**ölü stok tasfiyesi** kalır ve bu, raporun 1. maddesidir. Ölçülecek üç sayı:
(a) KIRMIZI ölü stokta bağlı sermaye, (b) en büyük kalemin payı, (c) maliyetin %50'sine
tasfiyenin açığa oranı. *04.10: KIRMIZI ölü stok 2.009.195 ₺ · AL-CAM03 tek başına
940.900 ₺ = %47 · %50'ye tasfiye 470.450 ₺ = açığın %32'si.*

> 🔴 **BİR SET İLANI, BİLEŞENİN ÖLÜ STOĞUNU ERİTME ARACI OLARAK SAYILMADAN ÖNCE
> SATTIĞI ADET ÖLÇÜLÜR** (v31). *04.10: 8'li kamera seti 120 günde 2 adet sattı =
> 16 kamera; AL-CAM03'ün 1.940 adedi için ~40 yıl.*

- **PARA MALİYETİ MERDİVENİ (aylık, 14.09 akşamı):** Ziraat Kredi 2 **%2,83** <
  Ziraat KGF **%3,08** < **taksitli nakit avans ~%3,74 efektif** ≈ Fibabanka **%3,76**
  < Ziraat KMH **%4,08** < YKB ticari **%4,18** < **Enpara kart alışveriş %4,25
  (ÖLÇÜLDÜ)** ≈ Enpara KMH %4,25 < Garanti ticari **%4,31** < YKB KMH **%4,50** <
  diğer kartlar **%4,50 (TAHMİNİ)** << **şahsi KMH ~%7 efektif**.

## CARD PRICE_FLOOR — Fiyat tabanı: ölü fiyat bantları, taban formülü, komisyon kapsamı, indirim ölçütü

> **Hiçbir ürün 200,00–243,70 ₺ veya 350,00–365,50 ₺ aralığında fiyatlanmaz.**
> 199 yap ya da 250 üstüne çık.

🔴 **Taban fiyat bir bant eşiğini aşıyorsa TABAN YENİDEN HESAPLANIR.**

```
TABAN = (birim maliyet + kargo [cfo_kargo_tarife] + ambalaj + iade 13,36
         + işlem 12,29 + hizmet/ceza payı 10,00) / (1 − komisyon)
```
**Ambalaj:** ≤0,5 kg → 10 ₺ · üstü → 18,74 ₺.

🔴 **Bu 8 kanalda taban fiyat "TAHMİNİ" olarak bile yazılamaz — YOKTUR.** O kanallarda
verilen her fiyat kararı (indirim, kampanya, yeni listeleme) ölçümsüzdür ve raporda
böyle etiketlenir. **180 günlük ciro payı: 1.076.152 ₺.**

Kayıt sayısı **10'un altındaysa** kanal ortalaması kullanılır ve taban **TAHMİNİ**
etiketlenir.

> Bir fiyat indiriminin işe yarayıp yaramadığı **sipariş adedinin artmasıyla** değil,
> yeni fiyatın **taban fiyata olan mesafesiyle** ölçülür.

Fiyat değişikliği **Alperen onayı** ister.

## CARD CASH_SHORTFALL — Nakit açığı: dip bandı, panel ufku, net pozisyon tabanı, nakit sayılmayanlar

**2. 🔴 Dip TEK SAYI DEĞİL BANT olarak raporlanır:**
```
ALT UÇ  = defter (panel rakamları, muhafazakâr)
ÜST UÇ  = defter + olgunlaşma payı (TAHMİNİ, açıkça etiketli)
```

**2c. 🔴 OLGUNLAŞMA BANDI, DİP GÜNÜ 35 GÜNDEN UZAKSA O DİBİ DÜZELTMEZ — 18.09.**
Panel yalnızca ~35 gün ileriyi gösterir. Dip günü bundan uzaktaysa o tarihe kadarki
hakediş akışının tamamı defterde yoktur; **iki ayrı dip ayrı raporlanır.**

**KURAL: panel ufkunun ötesi ya MODELLENİR (§2F-16) ya da o aralık için dip "ölçülemez"
yazılır. Sıfır giriş varsayılarak hesaplanmış bir dip raporlanamaz.**

**Net nakit pozisyonu −3.000.000 ₺'nin altına inemez.**

- 🔴 **Banka ekranındaki "kullanılabilir bakiye" NAKİT DEĞİLDİR.**
- 🔴 **Bayat bakiye, kullanılmış KMH'yi GÖRÜNMEZ yapar.**
- 🔴 **Vadesi geçmiş tahsil edilmemiş alacak GELECEK GİRİŞ SAYILMAZ.**
  🔴 **Ve İLERİ TARİHE DE ALINMAZ** (v27).

## CARD CAPITAL_ALLOCATION — Kaynak / kaldıraç merdiveni: basamak sırası ve şahsi hesap kuralı

Motor `YETERSIZ` derse kaldıraç merdiveni: kısmi çekim → antrepoda bekletme → Trendyol
erken ödeme → sabit gider kısma → borç yapılandırma → ölü stok tasfiyesi → şahsi hesaplar.

🔴 **Motor `YETERSIZ` dediğinde, merdivenin 1. basamağı SAYIYLA raporlanır.**
"Kısmi çekim yapılmalı" bir cümle değil bir **orandır**: `cfo_gumruk_dilim()`
çıktısındaki `CEKILEBILIR ORAN (%)`. Bu alan `null` dönüyorsa fonksiyon doğru günü
bulamıyordur — **önce onu düzelt, sonra raporla** (v27).

- 🔴 **Şahsi KMH son çaredir — iki kere pahalıdır** (KKDF %15 + BSMV %5, gider
  gösterilemez → ~1,6–1,8× pahalı).

- 🔴 **TAKSİTLİ NAKİT AVANS, ŞAHSİ KMH'DEN ÖNCE GELİR.**

## CARD DEBT_GATE — Borç kapısı: kapatma sırası, kart asgarisi, gümrük ve yurtdışı sipariş nakit kuralı

- 🔴 **BORÇ KAPATMA SIRASI, FAİZ ORANINA DEĞİL AYLIK ZORUNLU NAKİT ÇIKIŞINA GÖRE KURULUR** (v29).
  Oranlar birbirine yakınsa ayıran şey **asgari oranıdır**. Sıra (03.10, H12): Garanti Alp
  5.000 ₺ (13.10'da kapatılır) → **Akbank Alp 344.335,37 ₺** (15.10 konteyneri geçildikten
  sonra ilk serbest nakit) → sonra şirket kartları: Ziraat 746.276 > Garanti ana 618.576 >
  Enpara 523.978 > Garanti Fatih 127.852. **Şahsi kartlar şirket kartlarından önce gelir**:
  faizi gider yazılamaz (~1,33× pahalı) ve borç Alperen'in kredi notunu tutar.

- 🔴 **KART ASGARİSİ BİR KÖPRÜDÜR, POLİTİKA DEĞİLDİR.** *11.09 ÖLÇÜLDÜ: ayda 200.000 ₺
  yeni kart harcaması. Kart borcu 2.366.017 ₺ (03.10), aylık faiz %4,50 ≈ 106.471 ₺.*

- 🔴 **Gümrük ödemeleri NAKİT zorunludur.** Gümrükte **taksitlendirme ve teminat
  mektubuyla mal çekimi YOKTUR** (gümrük müşaviri 30.08.2026 kesin ret).

- 🔴 **Yurtdışı sipariş YALNIZCA NAKİT ile verilir.** Nakit değildir: KMH · kart limiti ·
  nakit avans · şahsi hesaplar · tahsil edilmemiş hakediş.

## CARD DATA_QUALITY — Veri kalitesi: grain, senkron teşhisi, beyan ve tek satış kuralları

**Genel kural:** bir sayıyı bölmeden önce payın ve paydanın **aynı taneye** ait
olduğunu doğrula.

> 🔴 **BİR SENKRONUN GÜNCEL VERİ GETİRMEMESİ, ÇALIŞMAMASIYLA AYNI ŞEY DEĞİLDİR.**
> Teşhis "senkron çalışıyor mu" değil **"getirdiği kayıtların tarihi ne"** sorusuyla konur.

- **Rakam uydurma.** Her veri: Kesin / Tahmini / Eski / Teyit edilmeli.

- 🔴 **BEYAN KANIT DEĞİLDİR — beyanın bırakması gereken İZ aranır** (§4E).
- 🔴 **TEK BİR SATIŞ, VEYA AYLAR ÖNCESİNE AİT BİR KAYIT, GÜNCEL FİYAT DEĞİLDİR.**
