# Maliyeti eksik 20 ürün — Alperen'in doldurduğu liste uygulandı (2026-10-10)

> **UYGULANDI 2026-10-10 (Alperen: "Tam yetkilisin")** — Claude Code'un çıkardığı "maliyeti bilinmesi en önemli ama bilinmeyen 20 ürün" listesi
> (son 90 gün cirosu, satışı yoksa stokta bağlı değer sırası) Alperen tarafından dolduruldu. 20 ürün, 86 alan değişikliği,
> hepsi `cfo_change_log`'da (area `maliyet`, kind `duzeltme`, eski → yeni). Koruma: tek alan bile okunan eski değerde değilse
> (özel not için md5) işlemin tamamı iptal. Yerel PGlite provası: koruma tetiklendi (md5 farkı → iptal), doğru eski değerle 86 değişiklik.
> Uygulama dosyası: `docs/cowork/2026-10-10-maliyet-eksik-20-uygulama.sql`.

## Sonuç (üretim, uygulama öncesi → sonrası)

| Kalem | Önce | Sonra | Fark |
|---|---:|---:|---:|
| Stok (rafta) LCNRV | 3.201.849,48 | 3.408.001,80 | +206.152,32 |
| **NET SERMAYE** | **2.266.988,72** | **2.473.141,04** | **+206.152,32** |
| Maliyeti bilinmeyen satan stok (toplama girmeyen, KDV hariç NRV üst sınırı) | 19 SKU · 255.275,69 | 15 SKU · 66.746,42 | −4 SKU |
| Değeri bilinmeyen stok (maliyet ve satış kanıtı yok) | 29 SKU · 328 adet | 26 SKU · 240 adet | −3 SKU |
| Stok değerine giren SKU | 116 | 123 | +7 |

Maliyet kapsamı (`cfo_maliyet_kapsami`, son 30 tam gün ciro, uygulama sonrası): **%88,7** — maliyetsiz 69.473 TL, güvenilmez satır
79.442 TL, eşleşmeyen 29.613 TL. CFO-011 hedefi %95.

Artışın **179.044 TL**'si tek üründen: `4140404044444` 4K 6MP 36x zoom kamera, 66 adet. KDV hariç maliyeti 189.696 TL,
LCNRV son satış fiyatı (4.950 TL) üzerinden NRV'ye (179.044 TL) indirildi. Alperen bu ürünü "başarısız, zararına sattık"
diye işaretledi. Tasfiye fiyatı 4.950 TL'nin altına inerse NRV ve net sermaye de düşer (fiyat değiştikçe sözleşme kendiliğinden
izler; ayrı bir değer düşüklüğü kaydı yapılmadı).

## 1. İthal ürünler (8) — ithalat motoru

Girdi Alperen'den (RMB, kg). Gümrük GTİP'ten (`cfo_gtip_tarife` yasal yükü, KDV+ÖTV dahil, 1 hane — 2026-10-10 Excel
uygulamasıyla aynı tanım). Kart/transfer masrafı %5. `shippingMethodPref` boş: deniz/hava kararını
`lib/importer-cost.ts calcImportCost` (yıllık ROI; Trendyol fiyatı yoksa ≥5 kg deniz) verir. Birim maliyet =
RMB ÷ 6,8 × 1,05 + navlun (deniz 1 / hava 8 USD/kg) + gümrük; TL = × 48,98 (`cfo_kur` 2026-10).

| SKU | Ürün | RMB | kg | GTİP | Gümrük % | Motor | USD | TL (önce → sonra) |
|---|---|---:|---:|---|---:|---|---:|---:|
| 21037294719 | AN305 Cat6 305 m | 130 | 5 | 8544.49.20.00.00 | 20,0 | deniz | 30,0882 | 1.746,00 → 1.473,72 |
| 5179816227750 | Scuba PI-iking 750 pinpointer | 310 | 1 | 8543.70.90.00.11 (yeni) | 48,4 | deniz | 72,5196 | — → 3.552,01 |
| 4140404044444 | 4K 6MP 36x zoom kamera | 250 | 1 | 8525.89.00.00.00 (yeni) | 51,1 | hava¹ | 70,4170 | — → 3.449,02 |
| MUS-XR7872BATARYA | Antika retro batarya | 75 | 0,6 | 8481.80.11.00.00 | 52,6 | deniz | 18,5880 | 1.940,00 → 910,44 |
| 236980001 | DP → HDMI çevirici | 1,9 | 0,04 | 8543.70.90.00.19 (yeni) | 24,4 | deniz | 0,4147 | — → 20,31 |
| TTLOCKSILVERKAPISILINDIR | TTLock silindir (silver) | 275 | 0,6 | 8301.40.19.00.19 (85.36.50.19.00'dan) | 47,2 | deniz | 63,3891 | — → 3.104,80 |
| TTLOCKSIYAHKAPISILINDIR | TTLock silindir (siyah) | 275 | 0,6 | 8301.40.19.00.19 | 47,2 | deniz | 63,3891 | 2.861,50 → 3.104,80 |
| TYPEC1M | Type-C kablo 1 m | 2,1 | 0,04 | 8544.42.90.00.19 (yeni) | 42,0 | deniz | 0,5173 | — → 25,34 |

¹ Trendyol fiyatı yok → ROI hesaplanamadı → ağırlık kuralı (< 5 kg hava).

- GTİP seçimi sistemdeki emsallerle aynı: pinpointer = "Anunnaki Pointer" (maden dedektörü), DP→HDMI aktif çevirici =
  8543.70.90.00.19, Type-C kablo = 8544.42.90.00.19, PTZ kamera = 8525.89. TTLock silver'ın eski kodu (8536.50 — anahtar/şalter)
  siyah varyantla aynı kapı kilidi koduna (8301.40.19.00.19) çekildi.
- `21037294719` önceden `IC_PIYASA` (36 USD) kayıtlıydı; Alperen RMB verdiği için ithal olarak motora bırakıldı.
- Alperen'in not sütunundaki 1688 bağlantıları `source1688Url1`'e yazıldı (5179816227750, MUS-XR7872BATARYA, 236980001).

## 2. Yurt içi tedarik (6) — USD + KDV

Alperen: İstoç / Euromix armatürcülerinden "X USD + KDV". Sözleşme D-P06 (maliyet KDV dahil kayıtlı; LCNRV ÷ 1,2) ve
`422433343411`'in mevcut kaydıyla aynı esas: `unitCostUsd` = USD × 1,2, `unitCostTry` = × 48,98. `supplier` yazıldı,
`shippingMethodPref` = `IC_PIYASA` (ithalat motoru bu ürünleri hesaplamaz; RMB yok).

| SKU | Ürün | Tedarikçi | Alış | USD (önce → sonra) | TL (önce → sonra) |
|---|---|---|---|---:|---:|
| 4224333434117 | Krom batarya kare tepe | Euromix Armatür | 13 USD + KDV | — → 15,60 | — → 764,09 |
| 422433343411 | PVC duş hortumu 150 cm | İstoç — Birkay Armatür | 1 USD + KDV | 1,20 → 1,20 | 58,20 → 58,78 |
| MIXMUTFAKMUSLUK | Mix mutfak bataryası | İstoç — Beyazsu Armatür | 7 USD + KDV | 9,60 → 8,40 | 465,60 → 411,43 |
| QUA-1001 | Krom lavabo bataryası | İstoç — Beyazsu Armatür | 11 USD + KDV | 14,00 → 13,20 | 679,00 → 646,54 |
| 422433343414 | 3 fonksiyonlu duş başlığı | İstoç — Diclemix Armatür | 0,25 USD + KDV | — → 0,30 | — → 14,69 |
| 4153390000102 | Robot duş seti | İstoç — Beyazsu Armatür | 11 USD + KDV | — → 13,20 | — → 646,54 |

## 3. Tekrar getirilmeyecek (7) — `CFO_POLICY:NO_REORDER`

Alperen: "Başarısız ürün. Tekrar getirilmeyecek olarak işaretle. Satışını ölü stok olduğu için zararına yaptık."
Sistemdeki yapısal işaret `Product.privateNote` içindeki `CFO_POLICY:NO_REORDER` (`lib/cfo-agent/product-policy.ts`):
AI CFO bu ürünlere sipariş/tedarik araştırması önermez, yalnız mevcut stoğun eritilmesini izler; maliyet sorusu da sorulmaz.
Mevcut not korunur, işaret sona eklenir; günlüğe notun içeriği değil md5'i yazıldı.

| SKU | Ürün | Stok | Maliyet |
|---|---|---:|---|
| 52710373520 | Icom A3 Next | 0 | yok (önceki "TEKRAR GETIRILMEYECEK" notu politika kalıbına uymuyordu → artık uyar) |
| 2102039373730SIYAH | Gaming boş kasa | 1 | yok |
| 543600000 | Pickit3 | 1 | yok |
| 4140404044444 | 4K 6MP 36x zoom kamera | 66 | var (yukarıda, RMB 250) |
| 4Q0055916 | Lxs-p1 su arıtma | 1 | yok |
| 4921447644875 | 4G solar kamera | 0 | yok |
| 21173887234122 | Balık gözü lens | 125 | yok — 125 adet değer dışı kalmaya devam ediyor |

## Kalan

- `21173887234122` (125 adet), `4Q0055916`, `543600000`, `2102039373730SIYAH`: alış fiyatı verilmedi → "maliyeti bilinmeyen
  satan stok" satırında kalır (net sermayeye girmez).
- 4K kamera: tasfiye fiyatı belirlenirse NRV ondan hesaplanır.
- Yurt içi alış fiyatları sabit USD; kur değişince TL'nin yeniden hesaplanması CFO-029 (otomatik türetme) kapsamında.
