# GTİP + gümrük yükü analizi (2026-10-09)

Alperen (2026-10-09): "Gümrük vergilerini sen de hesaplayabilirsin; ürünlerin GTİP'lerini belirle, mevzuatı araştır."

Dosyalar: `gtip-siniflandirma.json` (433 maliyetli ürün → 12 haneli GTİP, gerekçe, güven), `gtip-gruplar.json` (126 grup), `gtip-oranlar-2026.json` (57 GTİP: GV/İGV/KDV/ÖTV/anti-damping, kaynaklı), `ithalat-vergi-rejimi-2026.md` (rejim, formül, Resmî Gazete kaynakları). Bu dosyalar araştırmadır; üretim verisine yazılmadı.

## Sonuçlar

1. **Mevcut GTİP'ler büyük ölçüde yanlış:** 433 üründen 317 ürünün kodu değişiyor; 116'sı aynı kodun 12 haneye tamamlanması. Örnek: kamera/PoE switch/microSD/kablo `85.25.81.99` (2026 tarifesinde yok) altındaydı; metal dedektörleri `90.15.80.91` ("meteoroloji") → `8543.70.90.00.11` ("maden dedektörleri", İGV %20); Arduino/ESP32 → `8537.10.91.00.00` (BTB TR340000240011). Güven: 202 yüksek, 203 orta, 28 düşük.

2. **Formül (ticari ithalat):** CIF = mal + navlun + sigorta → GV = CIF×GV% → İGV = CIF×İGV% → (ÖTV, IV sayılı liste) → KDV matrahı = CIF + GV + İGV + ÖTV + KKDF (vadeli ödemede %6) + damga + tescile kadar KDV'siz giderler → KDV %20. Çin = "7 = Diğer ülkeler" sütunu. Türkiye ITA-2'ye taraf olmadığı için AB'de %0 olan bazı elektroniklerde GV var (8525.89 %4,9 vb.).

3. **Hızlı kargo rejimi ticari ithalatta kullanılamaz;** 06.02.2026'dan (CB Kararı 10813) beri %30/%60 tek-maktu vergi yalnız reçeteli ilaç/takviye gıdada; diğer gönderiler normal GTİP oranlarıyla. Hava kargo da normal beyanla aynı yükü taşır.

4. **190000 (LCNRV'de maliyet ÷ 1,2):** ithalat KDV'si = %20 × (CIF + GV + İGV); masrafsız yasal maliyetin tam olarak 1/6'sı (oranlardan bağımsız). Kayıtlı maliyette masraf payı varsa KDV payı 1/6'nın biraz altına iner → ÷1,2 küçük bir üst sınır; GTİP oranları bu yaklaşımı doğruluyor.

5. **Kayıtlı gümrük % ile yasal yük farklı** (aşağıdaki tablo; yasal % = GV + İGV + KDV, masrafsız, ÖTV hariç):
   - **Eksik maliyet riski (kayıtlı < yasal → marj fazla görünür):** metal dedektörü (kayıtlı %30, yasal %48,4), HDMI/USB/DAC kabloları (%30 / %42), LED aydınlatma (%40 / %59,2), krone aleti.
   - **Fazla (masraf dahil olabilir):** bataryalar (kayıtlı medyan %80, yasal %52,6), el telsizi (%40 / %20), ağ/PC ekipmanı (%30 / %20).
   - **ÖTV riski:** IP kamera (%20 ÖTV muhtemel → yasal ~%51), oyun kolu, amfi, kulaklık, telsiz — BTB/GİB teyidi gerekir.

6. **Batarya RMB alanı güvenilir değil:** 66 karıştırıcı bataryanın yaklaşık dörtte birinde kayıtlı maliyet (RMB/7,1 + navlun)'dan bile düşük (çarpan 0,55–0,8) → `sourceCostRmb` güncel alış fiyatı değil ya da maliyet başka kaynaktan (fatura) girilmiş.


## Grup tablosu (stok değerine göre ilk 30; stok 0<adet<1000)

| Grup | Önerilen GTİP | Ürün | Stok USD | GV % | İGV % | Yasal yük % | Kayıtlı gümrük % (medyan, n) | ÖTV? |
|---|---|---|---|---|---|---|---|---|
| IP/WiFi güvenlik kamerası | `8525.89.00.00.00` | 11 | 7.016 | 4.9 | 0.0 | 25.9 | %40 (5) | muhtemel |
| Karıştırıcı batarya (lavabo/eviye/banyo) | `8481.80.11.00.00` | 66 | 4.171 | 2.2 | 25.0 | 52.6 | %80 (27) |  |
| Mouse jiggler | `8479.89.97.90.19` | 1 | 2.470 | — | — | — | — |  |
| Metal dedektörü (define/güvenlik/pinpointer) | `8543.70.90.00.11` | 10 | 2.106 | 3.7 | 20.0 | 48.4 | %30 (4) |  |
| PoE switch (ağ anahtarı) | `8517.62.00.90.19` | 5 | 1.939 | 0.0 | 0.0 | 20.0 | %30 (3) | muhtemel |
| HDMI splitter/switch/extender/ses ayırıcı | `8543.70.90.00.19` | 6 | 1.062 | 3.7 | 0.0 | 24.4 | %30 (2) |  |
| Cat6 LAN kablosu (makara. konnektörsüz) | `8544.49.20.00.00` | 1 | 1.044 | — | — | — | — |  |
| El telsizi (Baofeng vb.) | `8517.62.00.90.19` | 8 | 1.016 | 0.0 | 0.0 | 20.0 | %40 (4) | muhtemel |
| Geliştirme kartı (Arduino/ESP32/STM32/Pico) | `8537.10.91.00.00` | 9 | 859 | — | — | — | %30 (2) |  |
| Akıllı kapı kilidi / kapı kolu | `8301.40.19.00.19` | 5 | 847 | 2.7 | 20.0 | 47.2 | %40 (1) |  |
| Frekans/rezonans jeneratörü (wellness) | `8543.70.90.00.19` | 1 | 673 | 3.7 | 0.0 | 24.4 | %30 (1) |  |
| USB/Type-C şarj-data kablosu | `8544.42.90.00.19` | 15 | 664 | 3.3 | 15.0 | 42.0 | %30 (1) |  |
| Hafıza kartı okuyucu | `8471.70.98.90.00` | 9 | 496 | 0.0 | 0.0 | 20.0 | %30 (1) |  |
| Kablosuz gitar verici-alıcı | `8517.62.00.90.19` | 3 | 462 | 0.0 | 0.0 | 20.0 | — | muhtemel |
| PoE extender/repeater | `8517.62.00.90.19` | 5 | 457 | 0.0 | 0.0 | 20.0 | %30 (1) | muhtemel |
| Saç/saç derisi fırçası | `9603.29.30.00.00` | 1 | 430 | — | — | — | — |  |
| KVM / USB paylaşım switch | `8471.80.00.00.00` | 3 | 315 | 0.0 | 0.0 | 20.0 | %30 (1) |  |
| HDMI/DP/VGA video kablosu | `8544.42.90.00.19` | 11 | 265 | 3.3 | 15.0 | 42.0 | %30 (1) |  |
| Telefon kılıfı | `3926.90.97.90.29` | 2 | 195 | 6.5 | 10.0 | 39.8 | — |  |
| Fiber optik adaptör/konnektör | `8536.70.00.10.00` | 3 | 167 | 3.0 | 0.0 | 23.6 | — |  |
| Duvar tarayıcı (metal/kablo/çivi dedektörü) | `9031.80.80.90.19` | 1 | 154 | 4.0 | 0.0 | 24.8 | %40 (1) |  |
| Sıkma pensesi (RJ45) | `8203.20.00.00.11` | 4 | 152 | 1.7 | 25.0 | 52.0 | %50 (4) |  |
| Flex bağlantı hortumu | `4009.22.00.90.00` | 1 | 129 | — | — | — | — |  |
| 9V pil | `8506.10.98.00.00` | 1 | 128 | — | — | — | — |  |
| Fiber optik patch kablo | `8544.70.00.00.00` | 2 | 115 | 0.0 | 0.0 | 20.0 | %30 (1) |  |
| Duş hortumu | `3917.33.00.00.00` | 1 | 112 | — | — | — | — |  |
| USB hub / Type-C çoklayıcı (dock) | `8471.80.00.00.00` | 9 | 101 | 0.0 | 0.0 | 20.0 | %30 (2) |  |
| RJ45 coupler / pasif ethernet ayırıcı | `8536.69.90.00.18` | 3 | 94 | 2.3 | 0.0 | 22.8 | — |  |
| Video wall controller | `8543.70.90.00.19` | 3 | 92 | 3.7 | 0.0 | 24.4 | — |  |
| Mini ethernet switch/çoklayıcı (aktif) | `8517.62.00.90.19` | 1 | 86 | 0.0 | 0.0 | 20.0 | — | muhtemel |

Oran bulunan ürün: 348/433 (stok değerinin %81'i). Oran satırı olmayan kodlar (ör. 8537.10, 8479.89, 9603.29, 4009.22) ikinci turda.


## Belirsizlikler ve sonraki adım
- Teyit (müşavir/BTB): el telsizi 8517.62 / 8525.60, kart okuyucu 8471.70 / 8471.80, mouse jiggler, PoE splitter, kamera ÖTV kapsamı, telefon kılıfı 3926 / 4202.
- Anti-damping taraması kapsamlı değil (menteşe 1,35 USD/kg teyitli; mekanik silindirli kilit 0,74 USD/adet).
- Üretime yazım (Alperen onayı + Cowork): `Product.gtip1` düzeltmesi (317 ürün) ve GTİP oran tablosu; yasal iniş maliyeti modeli (kayıtlı maliyetle yan yana, sapma alarmı).


## Teyit turu ve üretim uygulaması (2026-10-09, Alperen: "cevabını sen bul, GTİP düzeltmelerini sen yap, tam yetkilisin")

Kaynak: `gtip-teyit.json` (Ocak 2026 GV listesi, RG 11506/11507, Bakanlık Temmuz 2026 konsolide İGV, ÖTV IV sayılı liste).

- **El telsizi → `8517.69.90.90.24`** ("CB, 49 MHz ve diğer amatör telsiz cihazları"). GV 0, İGV 0, **ÖTV %20**, TAREKS telsiz denetimi. 8525.60 yayın vericisi; 8517.62.00.90.xx 2026/36 ile ÖTV listesinde yalnız akıllı saat. 8517.62 ile beyan → ÖTV + faiz + ceza riski. BTB başvurusu önerilir.
- **Kart okuyucu → `8471.70.98.90.00`** (bellek birimi; CBP N035358, AB rehberi); hub/OTG ağırlıklı 3 ürün `8471.80.00.00.00` (Türk BTB emsali). Üçünde de GV/İGV/ÖTV 0 — seçim vergi yükünü değiştirmez.
- **IP kamera ÖTV: belirsiz.** IV listesi "yalnız TV kameraları ve dijital kameralar" (eski 8525.80.11/19/30); görüntü kaydedici kameralar (eski 8525.80.91/99) dışarıda. microSD'ye kayıt yapan kameralar için dışarıda kalma argümanı güçlü (ABAD C-435/15 GROFA); kayıtsız ağ kamerası TV kamerası sayılır → %20. GİB özelgesi önerilir.
- **ÖTV %20 kesin:** hoparlör/kulaklık/amfi (85.18, amfi kartları dahil), konsol/oyun kolu (9504.50; yalnız PC gamepad'i BTB TR340000230015 emsaliyle 8471.60.70.90.19 → ÖTV yok), IR kumanda (8543.70.90.00.15), **RF kumanda (8526.92 — yeni bulgu)**.
- **Düşük güvenli 28 ürün:** tek kod + gerekçe (20 orta, 8 düşük). Kamera braketi 8302.50 (İGV %15 + anti-damping 1,35 USD/kg — ikinci kaynakla yeniden okunmadı), buat/siperlik 3926.90, akrobat musluk ucu 8481.90.00.00.29, motor hız kartı 8537.10.98.
- **Üretim:** `Product.gtip1` 433/433 maliyetli üründe 12 haneli (405 ilk tur + 39 teyit turu; her değişiklik `cfo_change_log`, eski değer korumalı). Oran tablosu (migration 20261009210000, 97 satır) uygulanmayı bekliyor.
