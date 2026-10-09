# Ürün maliyet Excel'i → sistem ürünleri eşleştirme + GTİP/gümrük önerisi (2026-10-10)

> **UYGULANDI 2026-10-10 (Alperen: "muhtemeller doğru, kesinler doğru, conflictler doğru; deniz/havaya ithalat öneri motoru karar vermeli")** — KESİN + MUHTEMEL 343 satır → 336 ürün (aynı ürüne düşen satırlarda SKU birebir satır esas). Yazılan: `sourceCostRmb` 176 değişiklik (160 zaten aynıydı), `weightKg` 172, `customsRatePct` 335 (GTİP yasal yükü, `cfo_gtip_tarife`, sistem tanımı KDV+ÖTV dahil; FT232RL tarifesiz → değişmedi), `gtip1` 49, `importPaymentFeePct` = 5 (324), `shippingMethodPref` → NULL (35; deniz/hava kararını `lib/importer-cost.ts resolveShipping` yıllık ROI ile verir, kur aylık kur tablosundan). 1091 alan değişikliği `cfo_change_log`'da (area `maliyet`, eski → yeni). Eşzamanlılık korumalı (alan yalnız okunan eski değerdeyse yazıldı). Doğrulama: 336 ürünün son değerlerinin md5 özeti yerel beklenenle birebir (f06de57d…). **Değişmeyen:** `unitCostUsd` / `unitCostTry` (CFO marj/LCNRV/net sermaye — RF-033 kararı), CONFLICT 27 satır. Uygulama dosyası `docs/cowork/2026-10-10-maliyet-excel-uygulama.sql`.

> **Analiz (önce salt-okunur yapıldı).** Hiçbir maliyet, ağırlık, GTİP veya ürün kaydı yazılmadı. Öneriler `2026-10-10-maliyet-excel-eslestirme-oneri.json`'da (CFO kanıtı / yapılandırılmış öneri); uygulama ayrı onay + veri yazım adımı ister.

## Kaynak

- Dosya: `CFO_Urun_Maliyetleri_Ortalama.xlsx` (Alperen, 2026-10-10), sha256 `aa05993717457e409d0850829791b5015b9e32e59a9a04eeb767bb857cdd93f2`; sayfa "Ürün Maliyetleri", 964 veri satırı (+2 dipnot satırı).
- Excel parametreleri: RMB/USD 6,7 · kart/transfer masrafı %5 (alış USD = RMB ÷ 6,7 × 1,05) · deniz navlun 1 USD/kg · hava kargo 8 USD/kg. Aynı SKU'nun farklı RMB fiyatlarının aritmetik ortalaması (dipnot).
- 9 satırda ağırlık boş (navlun bilinmiyor): `1450`, `4550`, `46113`, `ASE4555INOX`, `ASE5040SIYAH`, `AURA-41K`, `EVY304SS5040K`, `EVY304SS6045K`, `EVY304SS7545`.
- Excel'deki gümrük bilgisi **kullanılmadı** (dipnot da aynısını söylüyor): gümrük, ürünün GTİP'inden `cfo_gtip_tarife` ile hesaplandı.

## Özet

| Sonuç | Satır | Anlam |
|---|---:|---|
| **KESİN (HIGH)** | 273 | SKU birebir; ya da yalnız biçim farkı / barkod / pazaryeri eşleme kaydı; ya da 10+ haneli kod grup öneki dışında birebir; ya da muhtemel eşleşme sistemdeki RMB veya satış kaydıyla teyitli |
| **MUHTEMEL (MEDIUM)** | 70 | sondaki sıfır farkı, kod+ek, grup kodu (harfli), satış kaydı — tek ürün, çelişki yok; nedeni satırda |
| **CONFLICT** | 27 | birden fazla ürün, renk uyuşmazlığı, ya da farklı RMB/kg'li iki Excel satırı aynı ürüne |
| **EŞLEŞMEDİ (UNKNOWN)** | 594 | sistemde güvenilir aday yok (19 satırda zayıf aday notu var, zorla eşleştirilmedi) |
| **Toplam** | 964 | |

Yöntem dağılımı (KESİN + MUHTEMEL): EX/HIGH 248, TZ/MEDIUM 50, SW/MEDIUM 15, PF/HIGH 9, TZ/HIGH 9, SL/MEDIUM 3, PF/MEDIUM 2, MP/HIGH 2, NO/HIGH 2, SW/HIGH 2, SL/HIGH 1.
Kısaltmalar: EX SKU birebir · NO biçim farkı · MP pazaryeri eşleme · PF grup kodu · SL satış kaydı · TZ sondaki sıfır · SW sistem SKU'su kod+ek.

Eşleşenlerin **52** tanesinde sistemde RMB/USD maliyet **hiç yok** — Excel bu ürünlere ilk maliyet kanıtını getiriyor.

## Eşleştirme kuralları (öncelik sırası)

1. **SKU birebir** (`Product.sku`) → KESİN.
2. **Biçim farkı**: büyük/küçük harf, boşluk, tire, nokta, Türkçe harf (İ→I) — `cfo_norm` + katlama → KESİN, nedeni yazılır.
3. **Barkod** (`Product.barcode`) ve **pazaryeri eşleme kaydı** (`MarketplaceProductMapping.platformSku/platformBarcode`) → KESİN.
4. **Açıklamalı hücre**: `11872600845 (GTIP KESINLEŞTIR)`, `TTLOCK… 490467695447` gibi hücrelerden kod ayrıştırılır → MUHTEMEL.
5. **Farklı/eksik grup kodu**: Excel `AKR-`, `426M-`, `4403-`, `ART…`, `CSF-`, `KBB-` gibi öneklerle; sistemde `T-`, `AH-`, `TE-`, `MUS-`, `AH - ` (boşluklu). Önek atılıp gövde karşılaştırılır; gövde 10+ haneli sayıysa KESİN, harfli ise MUHTEMEL.
6. **Satış kaydı**: `MarketplaceSalesRecord.modelNumber/productCode`, `TrendyolSalesRecord.merchantSku/barcode` bu kodla satılmış ve kayıt bir ürüne bağlı (productId) → MUHTEMEL.
7. **Sondaki sıfır farkı**: sayısal kodlarda Excel `20496000` ↔ sistem `204960000` (sistemde aynı kodun farklı sıfır dolgulu kopyaları var) → MUHTEMEL; birden fazla aday → CONFLICT.
8. **Kod + ek**: sistem SKU'su Excel kodu ile başlıyor ve ad/grup/renk eki taşıyor (`54036000-T-TS101`) → MUHTEMEL; birden çok varyant → CONFLICT.
9. Ad veya içerme yoluyla bulunan adaylar **zayıf** sayılır → EŞLEŞMEDİ + not (zorla eşleştirilmedi).

Ek kontroller: (a) seçilen seviyede >1 ürün → CONFLICT; (b) başka güçlü yöntem farklı ürüne işaret ediyorsa → CONFLICT (birebir SKU'da yalnız "olası mükerrer ürün kartı" notu); (c) renk kelimesi uyuşmazlığı (Excel SİYAH ↔ ürün SILVER) → CONFLICT; (d) aynı ürüne birden fazla Excel satırı düşüyorsa RMB/kg aynıysa not, farklıysa birebir SKU satırı esas, diğerleri CONFLICT; (e) MUHTEMEL eşleşme sistemdeki RMB ile ±%3 uyumluysa ya da satış kaydıyla teyitliyse KESİN'e yükselir.

## CONFLICT satırları (27) — karar Alperen'de

| Satır | Excel SKU | Neden |
|---:|---|---|
| 6 | `426M-1006G` | sistem SKU'su Excel kodu + ek (grup/ad/renk) ile başlıyor · aynı ürüne satır 10 (1006G) de eşleşti ve RMB/kg farklı |
| 7 | `426M-4267192047364` | baştaki grup kodu farklı/eksik, gövde kod aynı · aynı ürüne satır 832 (ART4267192047364) de eşleşti ve RMB/kg farklı |
| 10 | `1006G` | sistem SKU'su Excel kodu + ek (grup/ad/renk) ile başlıyor · aynı ürüne satır 6 (426M-1006G) de eşleşti ve RMB/kg farklı |
| 69 | `22093000` | sayısal kodda sondaki sıfır sayısı farklı · aynı ürüne satır 266 (220930000) de eşleşti ve RMB/kg farklı |
| 83 | `23695000` | sayısal kodda sondaki sıfır sayısı farklı → 2 ürün: 236950000, 2369500000 |
| 90 | `24756000` | sayısal kodda sondaki sıfır sayısı farklı · aynı ürüne satır 358 (24756000000) de eşleşti ve RMB/kg farklı |
| 120 | `26985000` | sayısal kodda sondaki sıfır sayısı farklı · aynı ürüne satır 274 (269850000) de eşleşti ve RMB/kg farklı |
| 163 | `50835000` | sayısal kodda sondaki sıfır sayısı farklı · ürün kartına bağlı olmayan 37 satış kaydı (son 2025-05-06): 50835000 · aynı ürüne satır 278 (508350000) de eşleşti ve RMB/kg farklı |
| 223 | `56876000` | satış kaydında bu kodla satılan ürüne bağlı (productId) → T-REFRAKTOMETRE; diğer yöntemler → 568760000 · ürün kartına bağlı olmayan 3 satış kaydı (son 2025-02-12): 56876000 |
| 227 | `56952000` | sayısal kodda sondaki sıfır sayısı farklı → 2 ürün: 569520000, 5695200000 |
| 261 | `58931000` | sayısal kodda sondaki sıfır sayısı farklı · aynı ürüne satır 296 (589310000) de eşleşti ve RMB/kg farklı |
| 264 | `215800000` | pazaryeri eşleme kaydı (platformSku/barkod) · aynı ürüne satır 53 (21580000) de eşleşti ve RMB/kg farklı |
| 321 | `5373930300` | sayısal kodda sondaki sıfır sayısı farklı · aynı ürüne satır 192 (53739303) de eşleşti ve RMB/kg farklı |
| 358 | `24756000000` | sayısal kodda sondaki sıfır sayısı farklı · aynı ürüne satır 90 (24756000) de eşleşti ve RMB/kg farklı |
| 499 | `202620240222` | sistem SKU'su Excel kodu + ek (grup/ad/renk) ile başlıyor → 6 ürün: 202620240222GRI2METRE, 202620240222MAVI2METRE, 202620240222MOR2METRE, 202620240222PEMBE2METRE, 202620240222SARI2METRE, 202620240222SIYAH2METRE |
| 579 | `401038372810` | sayısal kodda sondaki sıfır sayısı farklı · aynı ürüne satır 687 (4010383728100) de eşleşti ve RMB/kg farklı |
| 612 | `482029373635` | satış kaydında bu kodla satılan ürüne bağlı (productId) · ürün kartına bağlı olmayan 1 satış kaydı (son 2025-02-18): Mutfak Evye Bataryası Dual Flow Su  · aynı ürüne satır 834 (ART48202937363534) de eşleşti ve RMB/kg farklı |
| 794 | `AKR-44108965254` | baştaki grup kodu farklı/eksik, gövde kod aynı · aynı ürüne satır 413 (44108965254) de eşleşti ve RMB/kg farklı |
| 796 | `AKR-4411475436910` | baştaki grup kodu farklı/eksik, gövde kod aynı · aynı ürüne satır 728 (4411475436910) de eşleşti ve RMB/kg farklı |
| 797 | `AKR-4411975325809` | baştaki grup kodu farklı/eksik, gövde kod aynı · aynı ürüne satır 729 (4411975325809) de eşleşti ve RMB/kg farklı |
| 802 | `AL-PTZ` | sistem SKU'su Excel kodu + ek (grup/ad/renk) ile başlıyor → 4 ürün: AL-PTZ01, AL-PTZ02, AL-PTZ03, AL-PTZ04 |
| 832 | `ART4267192047364` | baştaki grup kodu farklı/eksik, gövde kod aynı · aynı ürüne satır 7 (426M-4267192047364) de eşleşti ve RMB/kg farklı |
| 834 | `ART48202937363534` | baştaki grup kodu farklı/eksik, gövde kod aynı · aynı ürüne satır 612 (482029373635) de eşleşti ve RMB/kg farklı |
| 924 | `MD3003B1` | biçim farkı (büyük/küçük harf, boşluk, tire, nokta, Türkçe harf) · aynı ürüne satır 927 (MD-3003B1) de eşleşti ve RMB/kg farklı |
| 943 | `TE-964` | sistem SKU'su Excel kodu + ek (grup/ad/renk) ile başlıyor → 2 ürün: TE-9640CANAKANTIKMUSLUK, TE-964CANAKANTIKMUSLUK |
| 945 | `TE-1005` | sistem SKU'su Excel kodu + ek (grup/ad/renk) ile başlıyor → 2 ürün: TE-1005SIYAHGOLD360MUSLUK, TE-1005VINTAGEMUSLUK |
| 949 | `TTLOCKKAPIKOLUSIYAH1 490456584336` | renk uyuşmazlığı: Excel ['SIYAH'] ↔ ürün ['SILVER'] (TTLOCKKAPIKOLUSILVER) |

## MUHTEMEL eşleşmeler (70) — onaydan önce göz atılmalı

| Satır | Excel SKU | Sistem SKU | Yöntem | Not |
|---:|---|---|---|---|
| 5 | `5T-USBMGPMACH3` | `T-USBMGPMACH3` | grup kodu farklı/eksik | baştaki grup kodu farklı/eksik, gövde kod aynı · sistem GTİP'i 85.37.10.99.00 eski/eksik → öneri 8471.60.70.90.19 (ORTA) |
| 35 | `20496000` | `204960000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 84.71.80.00.00 eski/eksik → öneri 8471.80.00.00.00 (YUKSEK) |
| 38 | `20753000` | `207530000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 85.44.42.90.00 eski/eksik → öneri 8517.62.00.90.19 (YUKSEK) |
| 39 | `20756000` | `207560000000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · RMB farkı: sistem 5 → Excel 3.665 · ağırlık farkı: sistem 0.03 → Excel 0.0175 |
| 40 | `20793000` | `207930000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · RMB farkı: sistem 10 → Excel 11.4 · ağırlık farkı: sistem 0.1 → Excel 0.05 |
| 41 | `20865000` | `208650000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · aynı ürüne satır 298 (2086500000) de eşleşti; RMB/kg aynı · sistem GTİP'i 84.71.80.00.00 eski/eksik → öneri 8471.70.98.90.00 (YUKSEK) |
| 42 | `20896000` | `208960000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 84.71.80.00.00 eski/eksik → öneri 8471.70.98.90.00 (YUKSEK) |
| 43 | `20965000` | `209650000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 85.04.40.84.00 eski/eksik → öneri 8543.70.90.00.19 (DUSUK) |
| 56 | `22078000` | `220780000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 85.44.42.90.00 eski/eksik → öneri 8536.69.90.00.18 (ORTA) |
| 57 | `22079000` | `220790000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı |
| 59 | `22081000` | `220810000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 85.44.42.90.00 eski/eksik → öneri 8536.69.90.00.18 (ORTA) |
| 60 | `22082000` | `220820000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 85.44.42.90.00 eski/eksik → öneri 8543.70.90.00.19 (ORTA) |
| 62 | `22084000` | `220840000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 85.44.42.90.00 eski/eksik → öneri 8536.69.90.00.18 (ORTA) |
| 63 | `22085000` | `220850000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı |
| 65 | `22087000` | `220870000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 85.44.42.90.00 eski/eksik → öneri 8543.70.90.00.19 (ORTA) |
| 85 | `24061000` | `240610000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · RMB farkı: sistem 35 → Excel 40.25 · ağırlık farkı: sistem 0.2 → Excel 0.2167 |
| 89 | `24708000` | `247080000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 84.71.70.50.00 eski/eksik → öneri 8543.70.90.00.19 (DUSUK) |
| 91 | `24784000` | `247840000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 85.44.42.90.00 eski/eksik → öneri 8517.62.00.90.19 (YUKSEK) |
| 96 | `25468000` | `254680000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 84.71.80.00.00 eski/eksik → öneri 8471.70.98.90.00 (YUKSEK) |
| 99 | `25477000` | `254770000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 84.71.80.00.00 eski/eksik → öneri 8543.70.90.00.19 (ORTA) |
| 101 | `25654000` | `256540000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 85.44.42.90.00 eski/eksik → öneri 8536.69.90.00.18 (ORTA) |
| 106 | `25804000` | `258040000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · RMB farkı: sistem 52 → Excel 57.5 · ağırlık farkı: sistem 0.15 → Excel 0.125 |
| 108 | `25895000` | `2589500000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 85.44.42.90.00 eski/eksik → öneri 8543.70.90.00.19 (YUKSEK) |
| 114 | `26658000` | `26658000-TE-HDMITOSCART` | sistem SKU'su kod+ek | sistem SKU'su Excel kodu + ek (grup/ad/renk) ile başlıyor · RMB farkı: sistem 11 → Excel 12.25 · ağırlık farkı: sistem 0.2 → Excel 0.075 |
| 115 | `26804000` | `268040000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 85.44.42.90.00 eski/eksik → öneri 8543.70.90.00.19 (ORTA) |
| 123 | `27765000` | `277650000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 85.44.42.90.00 eski/eksik → öneri 8543.70.90.00.19 (DUSUK) |
| 126 | `28096000` | `2809600000` | satış kaydı ürün bağlantısı | satış kaydında bu kodla satılan ürüne bağlı (productId) · ürün kartına bağlı olmayan 16 satış kaydı (son 2025-02-01): 7 In 1 Usb/type-c To Usb A+usb C-us · RMB farkı: sistem 11 → Excel 13.7333 · ağırlık farkı: sistem 0.15 → Excel 0.07 |
| 139 | `45256000` | `452560000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 90.30.33.00.00 eski/eksik → öneri 9030.33.70.90.00 (YUKSEK) |
| 161 | `50741000` | `50741000AH-150WDCVOLTAJ` | sistem SKU'su kod+ek | sistem SKU'su Excel kodu + ek (grup/ad/renk) ile başlıyor · sistem GTİP'i 85.04.40.55.00 eski/eksik → öneri 8504.40.95.90.19 (YUKSEK) |
| 166 | `50872000` | `508720000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 85.18.40.30.00 eski/eksik → öneri 8517.62.00.90.19 (ORTA) |
| 167 | `50875000` | `50875000-T-HEXV2` | sistem SKU'su kod+ek | sistem SKU'su Excel kodu + ek (grup/ad/renk) ile başlıyor · RMB farkı: sistem 50 → Excel 69.5 |
| 170 | `50899000` | `508990000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · ürün kartına bağlı olmayan 1 satış kaydı (son 2026-10-01): Ft 232Rl Smd 00903, one size · sistem GTİP'i 85.43.70.90.00 eski/eksik → öneri 8542.39.90.00.00 (ORTA) · GTİP 85.43.70.90.00 tarife tablosunda yok — gümrük hesaplanamadı |
| 171 | `50953008` | `509530080` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 90.30.33.00.00 eski/eksik → öneri 9031.80.80.90.19 (YUKSEK) |
| 176 | `51257000` | `512570000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 90.30.33.20.00 eski/eksik → öneri 9030.33.70.90.00 (YUKSEK) |
| 177 | `51258000` | `512580000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 90.30.33.20.00 eski/eksik → öneri 9030.33.70.90.00 (YUKSEK) |
| 181 | `52147000` | `521470000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 85.44.42.90.00 eski/eksik → öneri 8543.70.90.00.19 (YUKSEK) |
| 182 | `52317000` | `523170000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 85.36.50.19.00 eski/eksik → öneri 8537.10.91.00.00 (YUKSEK) |
| 183 | `52365000` | `523650000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 90.30.33.00.00 eski/eksik → öneri 9030.33.70.90.00 (YUKSEK) |
| 191 | `53735809` | `537358090` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 90.30.33.00.00 eski/eksik → öneri 9027.10.10.00.00 (YUKSEK) |
| 193 | `53804000` | `538040000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 85.43.70.90.00 eski/eksik → öneri 8537.10.91.00.00 (YUKSEK) |
| 194 | `54036000` | `54036000-T-TS101` | sistem SKU'su kod+ek | sistem SKU'su Excel kodu + ek (grup/ad/renk) ile başlıyor · sistem GTİP'i 85.15.11.00.00 eski/eksik → öneri 8515.11.00.00.00 (YUKSEK) |
| 195 | `54096000` | `54096000-T-FNB58USB` | sistem SKU'su kod+ek | sistem SKU'su Excel kodu + ek (grup/ad/renk) ile başlıyor · sistem GTİP'i 90.30.33.20.00 eski/eksik → öneri 9030.33.70.90.00 (YUKSEK) |
| 196 | `54136000` | `5413600000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 84.71.80.00.00 eski/eksik → öneri 8471.80.00.00.00 (YUKSEK) |
| 197 | `54160000` | `54160000-AH-MEGA2560` | sistem SKU'su kod+ek | sistem SKU'su Excel kodu + ek (grup/ad/renk) ile başlıyor · sistem GTİP'i 85.43.70.90.00 eski/eksik → öneri 8537.10.91.00.00 (YUKSEK) |
| 207 | `54783000` | `547830000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 85.43.70.90.00 eski/eksik → öneri 8517.62.00.90.19 (YUKSEK) |
| 215 | `56325807` | `5632580700` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 84.71.80.00.00 eski/eksik → öneri 8471.90.00.00.00 (YUKSEK) |
| 216 | `56520471` | `565204710` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 90.15.80.91.00 eski/eksik → öneri 9015.80.80.00.00 (ORTA) |
| 217 | `56525000` | `565250000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 85.43.70.90.00 eski/eksik → öneri 8471.90.00.00.00 (YUKSEK) |
| 220 | `56590906` | `56590906-T-AS803LUXMETER` | sistem SKU'su kod+ek | sistem SKU'su Excel kodu + ek (grup/ad/renk) ile başlıyor · sistem GTİP'i 90.27.50.00.00 eski/eksik → öneri 9027.50.00.00.19 (ORTA) |
| 221 | `56786000` | `56786000-T-1014D` | sistem SKU'su kod+ek | sistem SKU'su Excel kodu + ek (grup/ad/renk) ile başlıyor · sistem GTİP'i 90.30.20.00.00 eski/eksik → öneri 9030.20.00.90.00 (YUKSEK) |
| 225 | `56878000` | `568780000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 85.04.40.55.00 eski/eksik → öneri 8504.40.95.90.19 (YUKSEK) |
| 230 | `57096000` | `570960000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 85.07.60.00.00 eski/eksik → öneri 8504.40.60.90.19 (ORTA) |
| 236 | `57496000` | `574960000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 85.43.70.90.00 eski/eksik → öneri 8471.90.00.00.00 (YUKSEK) |
| 238 | `57598000` | `57598000-T-SESREZONATÖRÜ` | sistem SKU'su kod+ek | sistem SKU'su Excel kodu + ek (grup/ad/renk) ile başlıyor · RMB farkı: sistem 35 → Excel 26.5 · ağırlık farkı: sistem 0.2 → Excel 0.15 |
| 240 | `57807000` | `57807000-T-USBDIGITALTESTER3.1` | sistem SKU'su kod+ek | sistem SKU'su Excel kodu + ek (grup/ad/renk) ile başlıyor · sistem GTİP'i 90.30.33.20.00 eski/eksik → öneri 9030.33.70.90.00 (YUKSEK) |
| 251 | `58542000` | `585420000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 85.43.70.90.00 eski/eksik → öneri 8471.90.00.00.00 (YUKSEK) |
| 257 | `58741000` | `587410000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 84.13.70.81.00 eski/eksik → öneri 8537.10.98.00.19 (ORTA) |
| 259 | `58753000` | `587530000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 85.25.60.00.00 eski/eksik → öneri 8526.92.00.90.19 (YUKSEK) |
| 260 | `58917000` | `589170000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · RMB farkı: sistem 7 → Excel 5.7 · ağırlık farkı: sistem 0.04 → Excel 0.03 |
| 298 | `2086500000` | `208650000` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · aynı ürüne satır 41 (20865000) de eşleşti; RMB/kg aynı · sistem GTİP'i 84.71.80.00.00 eski/eksik → öneri 8471.70.98.90.00 (YUKSEK) |
| 399 | `40103737292` | `401037372920` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · RMB farkı: sistem 4.5 → Excel 6.8 · ağırlık farkı: sistem 0.2 → Excel 0.13 |
| 426 | `47473737363` | `47473737363-SIYAH` | sistem SKU'su kod+ek | sistem SKU'su Excel kodu + ek (grup/ad/renk) ile başlıyor |
| 638 | `585150852366` | `5851508523660` | sondaki sıfır farkı | sayısal kodda sondaki sıfır sayısı farklı · sistem GTİP'i 85.37.10.99.00 eski/eksik → öneri 8471.80.00.00.00 (YUKSEK) |
| 646 | `2026111130111` | `2026111130111YESIL` | sistem SKU'su kod+ek | sistem SKU'su Excel kodu + ek (grup/ad/renk) ile başlıyor · RMB farkı: sistem 2.1 → Excel 2 · ağırlık farkı: sistem 0.05 → Excel 0.03 |
| 799 | `AL-BULB02` | `AL-BULB02-CIFTLENSAMPUL` | sistem SKU'su kod+ek | sistem SKU'su Excel kodu + ek (grup/ad/renk) ile başlıyor · RMB farkı: sistem 45 → Excel 32 · ağırlık farkı: sistem 0.35 → Excel 0.4 |
| 800 | `AL-CAM01` | `AL-CAM01-BEBEK-KAMERA` | satış kaydı ürün bağlantısı | satış kaydında bu kodla satılan ürüne bağlı (productId) · ürün kartına bağlı olmayan 1 satış kaydı (son 2026-07-14): Wifi Bebek İzleme Kamerası Ses Kayı · RMB farkı: sistem 30 → Excel 23.5 · ağırlık farkı: sistem 0.3 → Excel 0.275 |
| 894 | `BF442` | `MUS-BF442BATARYA` | sistem SKU'su kod+ek | sistem SKU'su Excel kodu + ek (grup/ad/renk) ile başlıyor |
| 917 | `KBB-1005VINTAGEMUSLUK` | `TE-1005VINTAGEMUSLUK` | grup kodu farklı/eksik | baştaki grup kodu farklı/eksik, gövde kod aynı |
| 930 | `MUS-XR8890C` | `MUS-XR8890CBATARYA` | sistem SKU'su kod+ek | sistem SKU'su Excel kodu + ek (grup/ad/renk) ile başlıyor · RMB farkı: sistem 200 → Excel 245 |
| 946 | `TE-7888GOLD360MSLK` | `7888GOLD` | satış kaydı ürün bağlantısı | satış kaydında bu kodla satılan ürüne bağlı (productId) · ürün kartına bağlı olmayan 1 satış kaydı (son 2025-08-21): Gold Antik Fiskiyeli 360 Derece Dön · RMB farkı: sistem 150 → Excel 68 (BÜYÜK FARK — teyit) · ağırlık farkı: sistem 2 → Excel 1.5 |

## Büyük RMB farkı (>%40) olan eşleşmeler — teyit

| Satır | Excel SKU | Sistem SKU | Fark |
|---:|---|---|---|
| 49 | `21475000` | `21475000` | RMB farkı: sistem 6 → Excel 11.3383 (BÜYÜK FARK — teyit) |
| 152 | `46523000` | `46523000` | RMB farkı: sistem 200 → Excel 110 (BÜYÜK FARK — teyit) |
| 413 | `44108965254` | `44108965254` | RMB farkı: sistem 8.5 → Excel 17 (BÜYÜK FARK — teyit) |
| 729 | `4411975325809` | `4411975325809` | RMB farkı: sistem 8.5 → Excel 17 (BÜYÜK FARK — teyit) |
| 946 | `TE-7888GOLD360MSLK` | `7888GOLD` | RMB farkı: sistem 150 → Excel 68 (BÜYÜK FARK — teyit) |

## Eşleşmeyenler

- **Zayıf adaylı (19)** — ad/içerme/bağlantısız satış izi; zorla eşleştirilmedi:

| Satır | Excel SKU | Not |
|---:|---|---|
| 58 | `22080000` | zayıf aday (kod içerme (zayıf)): 220800000 — zorla eşleştirilmedi |
| 68 | `22090000` | zayıf aday (kod içerme (zayıf)): 220900000 — zorla eşleştirilmedi |
| 71 | `22460000` | zayıf aday (kod içerme (zayıf)): 224600000 — zorla eşleştirilmedi |
| 102 | `25680000` | zayıf aday (kod içerme (zayıf)): 25680000568 — zorla eşleştirilmedi |
| 150 | `46032000` | ürün kartına bağlı olmayan 32 satış kaydı (son 2024-12-15): 46032000 |
| 172 | `50963000` | ürün kartına bağlı olmayan 9 satış kaydı (son 2025-03-13): BLDC 5-36V 15A Fırçasız Motor Sürüc |
| 185 | `52380000` | zayıf aday (kod içerme (zayıf)): 523800000 — zorla eşleştirilmedi |
| 200 | `54360000` | zayıf aday (kod içerme (zayıf)): 543600000 — zorla eşleştirilmedi · ürün kartına bağlı olmayan 1 satış kaydı (son 2024-11-03): 54360000 |
| 206 | `54782000` | zayıf aday (kod içerme (zayıf)): 54782000111 — zorla eşleştirilmedi |
| 209 | `54840000` | zayıf aday (kod içerme (zayıf)): 548400000 — zorla eşleştirilmedi |
| 232 | `57290000` | ürün kartına bağlı olmayan 5 satış kaydı (son 2025-08-21): 57290000 |
| 258 | `58742000` | ürün kartına bağlı olmayan 13 satış kaydı (son 2024-10-30): 58742000 |
| 276 | `458089000` | zayıf aday (kod içerme (zayıf)): 4580890002 — zorla eşleştirilmedi |
| 299 | `2114085236` | ürün kartına bağlı olmayan 3 satış kaydı (son 2026-09-15): 90 Derece HDMI Çevirici Dönüştürücü |
| 300 | `2158000000` | zayıf aday (kod içerme (zayıf)): 21580000 — zorla eşleştirilmedi |
| 318 | `5085650000` | ürün kartına bağlı olmayan 6 satış kaydı (son 2025-05-13): ESP32-S3-DevKitM-1 Geliştirme Kartı |
| 634 | `568018373666` | zayıf aday (kod içerme (zayıf)): 56801837366 — zorla eşleştirilmedi |
| 814 | `AN1028MN` | zayıf aday (yalnız ürün adında kod geçiyor): 1028MN, PERPA1028MN — zorla eşleştirilmedi |
| 929 | `MUS-XR8890B` | zayıf aday (kod içerme (zayıf)): MUS-SIYAHXR8890BBATARYA — zorla eşleştirilmedi |

- **Adaysız (575)**: sistemde bu kodla ürün kartı, eşleme ya da satış kaydı yok. Büyük kısmı 8–15 haneli sayısal kodlar (ör. `4322546587892…99`, `4007509507501…12` serileri) ve `AURA-*`, `AS304*`, `AK726*`, `XHN-*`, `QUNZH-*`, `SPMM1-*`, `ARP700*`, `BMB*`, `EVY304SS*` aileleri — sistemde ürün kartı açılmamış (yeni/henüz listelenmemiş ürünler olabilir). Tam liste CSV'de (`sonuc = ESLESMEDI`).

## GTİP ve gümrük

- GTİP kaynağı: ürünün `gtip1` alanı (433 maliyetli ürün 2026-10-09'da 12 haneliye düzeltildi). Eşleşen ürünlerden **50'sinin GTİP'i eski 10 haneli biçimdeydi** (önceki düzeltme yalnız maliyetli ürünleri kapsıyordu) → aşağıdaki öneriler, emsal: `docs/gtip/gtip-siniflandirma.json`.
- Oranlar `cfo_gtip_tarife` (2026, Çin menşei; GV = İthalat Rejimi Kararı, İGV = 3351 Ek-1; kaynak ddp.com.tr / Resmî Gazete) — sistem aynı GTİP'li tüm ürünlerde **bu tabloya bakar** (en uzun ön ek eşleşmesi, `cfo_gtip_yuk`). Yani "GTİP başına vergi notu" sistemde zaten tek yerde: yeni GTİP gerekiyorsa bu tabloya satır eklenir.
- Hesap (birim, USD): matrah = RMB ÷ 6,7 + navlun (kart masrafı matraha girmez) · GV+İGV = matrah × (GV+İGV)% · ÖTV = (matrah+GV+İGV) × ÖTV% · ithalat KDV = (matrah+GV+İGV+ÖTV) × KDV% (**indirilebilir, maliyete girmez**) · **iniş maliyeti (KDV hariç) = alış USD (kart masraflı) + navlun + GV + İGV + ÖTV** (deniz ve hava ayrı).

### Eski GTİP → öneri (50 ürün)

| Sistem SKU | Öneri GTİP | Güven | Gerekçe |
|---|---|---|---|
| `T-USBMGPMACH3` | 8471.60.70.90.19 | ORTA | PC'ye USB ile bağlanan CNC MPG el çarkı = ABİM giriş birimi |
| `204960000` | 8471.80.00.00.00 | YUKSEK | USB ekran genişletici; emsal Type-C HDMI görüntü aktarım 8471.80 |
| `207530000` | 8517.62.00.90.19 | YUKSEK | USB-Ethernet adaptör = ağ kartı; emsal 10 ürün 8517.62 |
| `208650000` | 8471.70.98.90.00 | YUKSEK | kart okuyucu; emsal 6 ürün 8471.70.98 |
| `208960000` | 8471.70.98.90.00 | YUKSEK | kart okuyucu; emsal 8471.70.98 |
| `254680000` | 8471.70.98.90.00 | YUKSEK | kart okuyucu; emsal 8471.70.98 |
| `5632580700` | 8471.90.00.00.00 | YUKSEK | 125 kHz RFID okuyucu/kopyalayıcı; emsal Alfas RFID okuyucu 8471.90 |
| `209650000` | 8543.70.90.00.19 | DUSUK | USB-C ses + PD şarj adaptörü (aktif DAC'lı çevirici); teyit |
| `220780000` | 8536.69.90.00.18 | ORTA | DP→HDMI adaptör; emsal 5 ürün 8536.69.90.00.18 |
| `220810000` | 8536.69.90.00.18 | ORTA | DP→DVI adaptör; emsal DP adaptörleri 8536.69 |
| `220820000` | 8543.70.90.00.19 | ORTA | DP→HDMI/DVI/VGA 3'ü 1 (VGA aktif çevirici); emsal DP→VGA 8543.70 |
| `220840000` | 8536.69.90.00.18 | ORTA | Mini DP→HDMI adaptör; emsal 8536.69 |
| `220870000` | 8543.70.90.00.19 | ORTA | MiniDP→VGA/HDMI/DVI (VGA aktif); emsal 8543.70 |
| `2589500000` | 8543.70.90.00.19 | YUKSEK | aktif DP→HDMI 4K çevirici; emsal 8543.70 |
| `521470000` | 8543.70.90.00.19 | YUKSEK | Wii→HDMI aktif çevirici; emsal 8543.70 |
| `247840000` | 8517.62.00.90.19 | YUKSEK | USB 3.0 RJ45 Ethernet adaptör = ağ kartı |
| `247080000` | 8543.70.90.00.19 | DUSUK | telefon soğutucu (termoelektrik); emsal Tec1 8543.70; fanlı ise 8414.59 — teyit |
| `254770000` | 8543.70.90.00.19 | ORTA | HDMI dağıtıcı (aktif); emsal 12 ürün 8543.70 |
| `256540000` | 8536.69.90.00.18 | ORTA | HDMI erkek→çift dişi pasif adaptör; emsal 8536.69 |
| `268040000` | 8543.70.90.00.19 | ORTA | HDMI tekrarlayıcı (aktif sinyal yükseltici) |
| `277650000` | 8543.70.90.00.19 | DUSUK | USB güçlü HDMI 4K cihaz (aktif); ad kesik — teyit |
| `452560000` | 9030.33.70.90.00 | YUKSEK | temassız voltaj test kalemi; emsal 9030.33.70 |
| `523650000` | 9030.33.70.90.00 | YUKSEK | temassız voltaj dedektör kalemi |
| `509530080` | 9031.80.80.90.19 | YUKSEK | dijital eğim ölçer; emsal dijital protraktör 9031.80.80 |
| `512570000` | 9030.33.70.90.00 | YUKSEK | volt-amper-wattmetre; emsal FNB48P 9030.33.70 |
| `512580000` | 9030.33.70.90.00 | YUKSEK | volt-amper metre |
| `54096000-T-FNB58USB` | 9030.33.70.90.00 | YUKSEK | FNB58 USB test cihazı; emsal FNB48P |
| `57807000-T-USBDIGITALTESTER3.1` | 9030.33.70.90.00 | YUKSEK | USB volt-ampermetre |
| `537358090` | 9027.10.10.00.00 | YUKSEK | gaz kaçak analiz dedektörü; emsal AS8700A 9027.10 |
| `50741000AH-150WDCVOLTAJ` | 8504.40.95.90.19 | YUKSEK | DC-DC yükseltici; emsal 6 ürün 8504.40.95 |
| `568780000` | 8504.40.95.90.19 | YUKSEK | DC-DC 250W yükseltici |
| `508720000` | 8517.62.00.90.19 | ORTA | Bluetooth ses alıcı modülü; emsal kablosuz alıcı-verici 8517.62 |
| `508990000` | 8542.39.90.00.00 | ORTA | FT232RL entegre devre (SMD çip) — tarifede satır yok (öneri: GV 0, İGV 0, KDV 20; ITA) |
| `538040000` | 8537.10.91.00.00 | YUKSEK | ESP8266 OLED geliştirme kartı; emsal 8537.10.91 |
| `54160000-AH-MEGA2560` | 8537.10.91.00.00 | YUKSEK | Arduino Mega; emsal Arduino UNO 8537.10.91 |
| `547830000` | 8517.62.00.90.19 | YUKSEK | HC-05 Bluetooth modül (veri alıcı-verici) |
| `565250000` | 8471.90.00.00.00 | YUKSEK | AVR ISP programlayıcı; emsal 3 ürün 8471.90 |
| `574960000` | 8471.90.00.00.00 | YUKSEK | EZP2020 EEPROM programlayıcı |
| `585420000` | 8471.90.00.00.00 | YUKSEK | USBasp programlayıcı |
| `5851508523660` | 8471.80.00.00.00 | YUKSEK | USB-PPI PLC kablosu; emsal 6ES7972 USB-MPI 8471.80 |
| `5413600000` | 8471.80.00.00.00 | YUKSEK | M.2 NVMe→PCIe adaptör; emsal 8471.80 |
| `523170000` | 8537.10.91.00.00 | YUKSEK | WiFi 4 kanal akıllı röle; emsal ESP8266 röle 8537.10.91 |
| `565204710` | 9015.80.80.00.00 | ORTA | anemometre (rüzgar hızı ölçer) — meteorolojik alet |
| `56590906-T-AS803LUXMETER` | 9027.50.00.00.19 | ORTA | lüksmetre (optik ışınlı ölçüm) |
| `56786000-T-1014D` | 9030.20.00.90.00 | YUKSEK | osiloskop; emsal 4 ürün 9030.20 |
| `54036000-T-TS101` | 8515.11.00.00.00 | YUKSEK | elektrikli havya; emsal 8515.11 |
| `570960000` | 8504.40.60.90.19 | ORTA | 18650 pil şarj modülü (pil yok) = şarj edici; eski 85.07.60 pil kodu yanlış |
| `587410000` | 8537.10.98.00.19 | ORTA | su seviyesi röle kontrol modülü; eski 84.13 pompa kodu yanlış |
| `587530000` | 8526.92.00.90.19 | YUKSEK | 433 MHz uzaktan kumandalı röle; emsal 8526.92 (ÖTV %20 dahil) |

`8542.39.90.00.00` (FT232RL entegre devre) `cfo_gtip_tarife`'de yok → tarife satırı önerisi: GV %0, İGV %0, KDV %20 (Bilgi Teknolojisi Anlaşması ürünü; **doğrulanmalı**). Bu ürünün gümrüğü hesaplanmadı.

### Eşleşen ürünlerde kullanılan GTİP'ler ve oranlar

| GTİP | Ürün | GV % | İGV % | ÖTV % | KDV % | Tanım |
|---|---:|---:|---:|---:|---:|---|
| 7324.10.00.00.00 | 1 | 2.7 | 25 | 0 | 20 | Paslanmaz çelikten evye ve lavabolar |
| 8203.20.00.00.11 | 4 | 1.7 | 25 | 0 | 20 | Pense/kerpeten — kablo kesme-sıkma |
| 8205.59.80.00.19 | 2 | 2.7 | 25 | 0 | 20 | Başka yerde belirtilmeyen el aletleri — diğerleri |
| 8301.40.11.00.00 | 2 | 2.7 | 20 | 0 | 20 | Silindirli kapı kilitleri |
| 8301.40.19.00.19 | 4 | 2.7 | 20 | 0 | 20 | Kapı kilitleri — diğerleri (akıllı/elektronik) |
| 8302.10.00.00.19 | 1 | 2.7 | 15 | 0 | 20 | Menteşeler — diğerleri |
| 84.81.80.11.00 | 1 | 2.2 | 25 | 0 | 20 | Sıhhi tesisat — karıştırıcı valfler (batarya) |
| 84.81.80.19.00 | 1 | 2.2 | 25 | 0 | 20 | Sıhhi tesisat — karıştırıcı valfler (batarya) |
| 8471.60.70.90.19 | 1 | 0 | 0 | 0 | 20 | Giriş/çıkış birimleri – diğerleri |
| 8471.70.30.90.00 | 1 | 0 | 0 | 0 | 20 | Optik disk sürücüleri |
| 8471.70.98.90.00 | 10 | 0 | 0 | 0 | 20 | Bellek birimleri — diğerleri |
| 8471.80.00.00.00 | 31 | 0 | 0 | 0 | 20 | ABİM diğer birimleri |
| 8471.90.00.00.00 | 8 | 0 | 0 | 0 | 20 | 8471 — diğerleri (kart okuyucular vb.) |
| 8479.89.97.90.19 | 1 | 1.7 | 0 | 0 | 20 | Kendine özgü fonksiyonlu makine – diğerleri |
| 8481.80.11.00.00 | 39 | 2.2 | 25 | 0 | 20 | Sıhhi tesisat — karıştırıcı valfler (batarya) |
| 8481.80.19.00.09 | 2 | 2.2 | 25 | 0 | 20 | Sıhhi tesisat — musluklar (diğer) |
| 8481.90.00.00.29 | 4 | 2.2 | 25 | 0 | 20 | Musluk/valf aksamı — diğerleri |
| 8504.31.80.90.11 | 1 | 3.7 | 0 | 0 | 20 | Küçük güçlü transformatörler (video balun) |
| 8504.40.60.90.19 | 2 | 3.3 | 0 | 0 | 20 | Akümülatör şarj ediciler — diğer |
| 8504.40.83.90.19 | 2 | 3.3 | 11 | 0 | 20 | Redresörler — AC/DC adaptör, USB şarj adaptörü |
| 8504.40.95.90.19 | 13 | 3.3 | 5 | 0 | 20 | Statik konvertörler — diğer (DC-DC) |
| 8515.11.00.00.00 | 2 | 2.7 | 7 | 0 | 20 | Lehim havyaları ve tabancaları |
| 8517.62.00.10.00 | 2 | 0 | 0 | 0 | 20 | Veri alım-iletim — hücresel |
| 8517.62.00.90.19 | 38 | 0 | 0 | 0 | 20 | Ağ cihazları: switch, router, PoE, WiFi AP |
| 8517.69.10.00.00 | 1 | 0 | 0 | 0 | 20 | Görüntülü kapı telefonları |
| 8517.69.90.90.24 | 7 | 0 | 0 | 20 | 20 | Amatör telsiz cihazları |
| 8518.40.00.00.00 | 7 | 4.5 | 0 | 20 | 20 | Ses frekans yükselteçleri (amplifikatör) |
| 8519.81.00.00.00 | 2 | 9.5 | 0 | 6.7 | 20 | Ses kayıt/çalma cihazları |
| 8521.90.00.00.00 | 1 | 13.9 | 0 | 6.7 | 20 | Video kayıt/gösterme — diğer |
| 8523.51.10.00.00 | 4 | 0 | 0 | 0 | 20 | Katı hal depolama (microSD, USB flash) — boş |
| 8525.89.00.00.00 | 6 | 4.9 | 0 | 20 | 20 | Diğer TV/dijital kameralar (IP/WiFi kamera) |
| 8526.92.00.90.19 | 1 | 3.7 | 0 | 20 | 20 | Radyo ile uzaktan kumanda |
| 8532.29.00.00.00 | 1 | 0 | 0 | 0 | 20 | Sabit kondansatörler — diğer |
| 8536.69.90.00.18 | 19 | 2.3 | 0 | 0 | 20 | Diğer fiş/soket/konnektörler |
| 8536.70.00.10.00 | 3 | 3 | 0 | 0 | 20 | Optik lif konnektörleri |
| 8537.10.91.00.00 | 15 | 2.1 | 0 | 0 | 20 | Programlanabilir kumanda cihazları |
| 8537.10.98.00.19 | 4 | 2.1 | 0 | 0 | 20 | ≤1000 V kumanda cihazları – diğer |
| 8541.29.00.00.00 | 1 | 0 | 0 | 0 | 20 | Transistörler — diğer |
| 8542.31.90.00.00 | 2 | 0 | 0 | 0 | 20 | Entegre devreler — işlemci/denetleyici |
| 8542.39.90.00.00 | 1 | — | — | — | — | tarifede yok |
| 8543.20.00.00.00 | 2 | 3.7 | 0 | 0 | 20 | Sinyal jeneratörleri |
| 8543.70.90.00.11 | 5 | 3.7 | 20 | 0 | 20 | Maden (metal) dedektörleri |
| 8543.70.90.00.15 | 1 | 3.7 | 0 | 20 | 20 | Kızılötesi uzaktan kumandalar |
| 8543.70.90.00.19 | 34 | 3.7 | 0 | 0 | 20 | Diğer elektrikli cihazlar |
| 8544.42.90.00.19 | 13 | 3.3 | 15 | 0 | 20 | Konnektörlü kablolar ≤1000 V (HDMI, USB) |
| 8544.70.00.00.00 | 2 | 0 | 0 | 0 | 20 | Fiber optik kablolar |
| 9002.11.00.00.00 | 1 | 6.7 | 0 | 0 | 20 | Objektifler (telefon lensi) |
| 9005.80.00.10.00 | 1 | 4.2 | 0 | 0 | 20 | Monoküler / teleskop |
| 9013.80.40.00.00 | 1 | 0 | 0 | 0 | 20 | Diğer optik cihazlar (PLC splitter) |
| 9015.80.80.00.00 | 1 | 3.7 | 0 | 0 | 20 | Jeofizik alet ve cihazlar |
| 9025.80.40.90.00 | 1 | 3.2 | 0 | 0 | 20 | Higrometre vb. elektronik |
| 9026.20.20.90.00 | 1 | 0 | 0 | 0 | 20 | Basınç ölçerler — elektronik |
| 9027.10.10.00.00 | 1 | 2.5 | 0 | 0 | 20 | Gaz/duman analiz cihazları |
| 9027.50.00.00.19 | 2 | 0 | 0 | 0 | 20 | Optik ışınlı diğer cihazlar (refraktometre) |
| 9027.89.90.00.00 | 2 | 0 | 0 | 0 | 20 | Fiziksel/kimyasal analiz cihazları — diğer |
| 9030.20.00.90.00 | 5 | 4.2 | 0 | 0 | 20 | Osiloskoplar |
| 9030.33.70.90.00 | 10 | 4.2 | 5.8 | 0 | 20 | Diğer kaydedicisiz ölçü aletleri |
| 9030.40.00.90.00 | 2 | 0 | 0 | 0 | 20 | Telekomünikasyon ölçüm cihazları |
| 9031.80.80.90.19 | 5 | 4 | 0 | 0 | 20 | Diğer ölçme/kontrol alet ve cihazları |
| 9032.10.20.90.00 | 1 | 2.8 | 6 | 0 | 20 | Termostatlar — elektronik |
| 9504.50.00.00.00 | 1 | 0 | 20 | 20 | 20 | Video oyun konsolları (gamepad) |
| 9620.00.91.00.00 | 3 | 6 | 0 | 0 | 20 | Monopod/tripod (selfie çubuğu) |

## Bulgu: sistemdeki USD maliyet hava kargo + KDV dahil gümrük varsayımıyla uyumlu

Eşleşen ve sistemde `unitCostUsd` olan 290 üründe, Excel'den hesaplanan maliyetin sistemdekine oranı (medyan, çeyrekler):

| Varsayım | Medyan | Ç1–Ç3 |
|---|---:|---|
| yalnız alış USD | 0,64 | 0,54–0,67 |
| deniz, KDV hariç | **0,68** | 0,62–0,75 |
| deniz, KDV dahil | 0,82 | 0,74–0,90 |
| hava, KDV hariç | 0,83 | 0,74–0,99 |
| **hava, KDV dahil** | **0,99** | 0,89–1,18 |

Sistemdeki birim USD maliyet büyük olasılıkla **hava kargo + ithalat KDV'si dahil** kurulmuş. Mal deniz yoluyla geliyorsa ve ithalat KDV'si indiriliyorsa, KDV hariç gerçek iniş maliyeti sistemdekinin **≈%68'i** (sistem ≈%46 yüksek) → marj olduğundan düşük, LCNRV/stok değeri olduğundan yüksek görünür. CFO-007 (KDV esası) ve CFO-025 (maliyet çarpanı 1,27–84) bulgularıyla tutarlı. **Karar Alperen'de**: hangi ürünler deniz/hava; maliyet KDV hariç mi tutulacak. Bu analiz hiçbir şeyi değiştirmedi.

## Veri kalitesi notları

- Sistemde aynı kodun farklı sıfır dolgulu kopyaları var (ör. `236950000` + `2369500000`, `569520000` + `5695200000`) → mükerrer ürün kartı adayı.
- Birebir eşleşen bazı ürünlerin `PERPA…` önekli ikiz kartları var (`1024MN`/`PERPA1024MN`, `1028MN`/`PERPA1028MN`, `10316KE`, `10324KE`, `XR0150W`/`MUS-XR0150W`).
- Excel'de aynı ürün için iki satır, farklı RMB ile (ör. `44108965254` 8,5 ↔ `AKR-44108965254`): birebir SKU satırı esas alındı, diğeri CONFLICT.
- Bağlantısız satış: bazı kodlar satılmış ama satış kaydı ürüne bağlı değil (ör. `46032000` 32 satış, `50835000` 37 satış) → ürün kartı/eşleme eksik.

## Dosyalar

- `docs/maliyet/2026-10-10-maliyet-excel-eslestirme.csv` — 964 satırın tamamı: belge SKU, eşleşen sistem ürünü, yöntem, güven, çakışma/not, Excel RMB/USD/kg/deniz/hava, sistem RMB/USD/kg, GTİP + kaynağı, GV/İGV/ÖTV/KDV, matrah, vergiler, iniş maliyeti (deniz/hava, KDV hariç).
- `docs/maliyet/2026-10-10-maliyet-excel-eslestirme-oneri.json` — KESİN + MUHTEMEL 343 satır için yapılandırılmış öneri (kanıt: dosya sha256 + satır; önerilen ↔ mevcut; tarife). Durum: ÖNERİ, uygulanmadı.

## Sonraki adım (onay gerekir)

1. Alperen: 27 CONFLICT + 70 MUHTEMEL kararı; deniz/hava ve maliyet KDV esası kararı.
2. Onaydan sonra: KESİN (+ onaylanan MUHTEMEL) satırlar için `sourceCostRmb`, `weightKg`, `importPaymentFeePct` ve GTİP önerilerinin değişiklik günlüklü, eski değer korumalı veri yazımı; `cfo_gtip_tarife`'ye `8542.39.90.00.00` satırı.
3. Excel dosyası `/cfo/belgeler`'e KDV/maliyet kanıtı olarak yüklenebilir (kategori: Tedarikçi faturası / proforma).

