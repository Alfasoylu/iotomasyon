# Çin menşeli eşya ithalatı — Türkiye vergi rejimi (durum: 09.10.2026)

Amaç: ürün bazında iniş maliyeti (landed cost) ve ithalat KDV'sini hesaplamak.
Kapsam: ticari ithalat (serbest dolaşıma giriş beyannamesi) + posta/hızlı kargo rejimi.
Oran tablosu: `gtip-oranlar.json` (57 satır).

> Not: Bu çalışma araştırma amaçlıdır. Beyan öncesinde 12 haneli GTİP ve oranlar gümrük müşaviri
> ile ya da Bağlayıcı Tarife Bilgisi (BTB) başvurusuyla teyit edilmelidir. "Doğrulanmadı" işaretli
> kalemlerde tahmin üretilmemiştir.

---

## 0. Yöntem ve birincil kaynaklar

| Kaynak | Ne için kullanıldı | Yürürlük |
|---|---|---|
| RG 31.12.2025 / 33124 (3. Mük.) — **CB Kararı 10791** (İGV Kararı 3351'in Ek-1/2/3 tablolarını **tamamen** değiştirir) — https://www.resmigazete.gov.tr/eskiler/2025/12/20251231M3-2.pdf | İGV oranları. Sayfalar tek tek görsel olarak okundu. | 01.01.2026. Geçiş: 31.01.2026'ya kadar tescil edilen beyannamelerde eski oran |
| RG 11.07.2026 / 33307 — **CB Kararı 11508** (İGV değişikliği) — https://www.resmigazete.gov.tr/eskiler/2026/07/20260711-9.pdf | Temmuz 2026 İGV değişiklikleri (Liste 1–4) | 11.07.2026. Geçiş: 30 gün içinde tescil edilen beyannamelerde eski oran |
| RG 31.12.2025 / 33124 (3. Mük.) — **CB Kararı 10790** (2026 İthalat Rejimi Kararı listeleri) — https://www.resmigazete.gov.tr/eskiler/2025/12/20251231M3-1.pdf ; Excel listeleri: https://www.ddp.com.tr/TR/wp-content/uploads/2026/01/ith-rejim-karari.zip | Gümrük vergisi (GV) "7 = Diğer Ülkeler (DÜ)" sütunu ve GTS ülke listesi (Ek-1) | 01.01.2026 |
| RG 11.07.2026 / 33307 — **CB Kararı 11506** (İRK değişikliği) ve **11507** (TGTC alt pozisyon değişikliği) — https://www.resmigazete.gov.tr/eskiler/2026/07/20260711-7.pdf , https://www.resmigazete.gov.tr/eskiler/2026/07/20260711-8.pdf | Ortada bölünen yeni GTİP'ler (8517.62, 8518.30, 8536.50, 8481.80.81, 3926.90.97.90.23 vb.) | 11.07.2026 |
| AB TARIC (Türkiye Gümrük Birliği gereği sanayi ürünlerinde AB Ortak Gümrük Tarifesini uygular) — https://ec.europa.eu/taxation_customs/dds2/taric/ | GV için ikinci kaynak (çapraz kontrol) | — |
| KDV Kanunu 3065 md. 21 (mevzuat.gov.tr metni) — https://www.mevzuat.gov.tr/mevzuatmetin/1.5.3065.pdf | KDV matrahı | md. 21/ç eki: 20.07.2025 tarihli ve 7555 sayılı Kanun |
| RG 07.01.2026 / 33130 — **CB Kararı 10813** — https://www.resmigazete.gov.tr/eskiler/2026/01/20260107-3.pdf | Posta ve hızlı kargo rejimi | Yayımdan 30 gün sonra, yani 06.02.2026 |

**Çin hangi sütunda?** İthalat Rejimi Kararı II sayılı listede sütunlar şöyle: 1 = AB/STA,
2 = Katar, 3 = BAE, 4 = EAGÜ, 5 = ÖTDÜ, 6 = GYÜ (4–6 GTS ülkeleri), **7 = DÜ (Diğer Ülkeler)**.
2026 Ek-1 GTS listesinde (GYÜ, ÖTDÜ ve EAGÜ listeleri) Çin yer almıyor. Bu nedenle Çin menşeli
eşyaya **7. sütun (DÜ)** uygulanır. İGV tablosunda da aynı 1–7 sütun düzeni kullanılıyor. İncelenen
sanayi ürünlerinde İGV oranları 4–7. sütunlarda aynı. Çin DTÖ üyesi olduğu için "DTÖ üyesi olmayan
ülkeler" dipnotları uygulanmaz.

**Önemli bulgu (ITA-2 farkı):** Türkiye 2015'teki Bilgi Teknolojileri Anlaşması genişlemesine
(ITA-2) katılmadı. Bu yüzden AB TARIC'te %0 görünen bazı kalemlerde Türkiye oranı daha yüksek:
- 8525.89: %4,9
- 8517.71 ve 8517.79: %5
- 8518.40 ve 8518.22: %4,5
- 8504.40.83: %3,3
- 9030.31 ve 9030.33: %4,2
- 8543.70.01–.09: %3,7
- 8523.51.90: %3,5

Elektronikte AB TARIC oranları **vekil kaynak olarak kullanılamaz**. Türkiye listesine bakılmalıdır.

---

## A1. Gümrük vergisi (GV) matrahı ve hesap

- **Matrah = gümrük kıymeti (CIF).** Bileşenler: eşya bedeli (işlem değeri), Türkiye gümrük
  bölgesine giriş yerine kadar navlun, sigorta, varsa ilgili komisyon/royalty eklemeleri. Dayanak:
  4458 sayılı Gümrük Kanunu md. 24–27 (kıymet hükümleri; metin bu çalışmada ayrıca okunmadı).
- Navlun faturasında varış sonrası kalemler (ör. liman ve THC gibi Türkiye'deki masraflar) ayrıca
  gösterilmişse kıymete girmez. Bunlar aşağıdaki KDV 21/c kuralına göre değerlendirilir.
- **GV = CIF × GV%(DÜ sütunu).** Bazı satırlarda maktu/min-max oran bulunur (ör. 91. fasıl
  saatler). İncelenen gruplarda böyle bir satır yok.

## A2. İlave Gümrük Vergisi (İGV)

- Dayanak: 3351 sayılı İthalatta İGV Uygulanmasına İlişkin Karar (RG 31.12.2020, yürürlük
  01.01.2021). Tablolar şu kararlarla değişti:
  - **10791:** 01.01.2026'dan itibaren Ek-1'i tamamen yeniledi. Yaklaşık 4.300+ satır içeriyor;
    oranlar %48'e kadar çıkıyor.
  - **11508:** 11.07.2026'dan itibaren geçerli.
  - **11274 (RG 01.05.2026):** Yalnız 6658 sayılı bir kararın yürürlük maddesini değiştirdi. Oran
    değişikliği içermiyor.
  - Ağustos–Ekim 2026 arasında yeni bir İGV kararı bulunamadı.
- İGV **yalnız Ek-1'de sayılan GTİP'lere** uygulanır. Listede olmayan GTİP'te İGV = 0.
- **Matrah:** gümrük kıymeti. İGV, GV ile aynı usulde tahakkuk ettirilir; Karar md. 2'ye göre genel
  GV hükümleri uygulanır.
- **İGV uygulanmayan haller (3351 md. 4):**
  - Dahilde işleme rejimi ve ihracat
  - Nihai kullanımda %0
  - Tarife kontenjanı
  - V veya VI sayılı listede yer alan eşya
  - **Gümrük vergisi muafiyetiyle yapılan ithalat** (11508 ile 11.07.2026'dan itibaren açıkça)
- 3351 md. 2'ye göre GV + İGV toplamı 474 sayılı Kanun üst sınırlarını aşamaz.
- **Çin'e özgü ayrı bir elektronik İGV listesi yok.** Oranlar DÜ sütunu üzerinden tüm "diğer
  ülkelere" uygulanır. Ayrıca yalnız Çin'e özel bir İGV vardır: 8703 binek otomobil (%40 veya
  asgari 7.000 USD/adet, 2024). Bu çalışmanın kapsamı dışındadır.
- **2026 değişikliklerinin bu gruplara etkisi:**
  - 10791 (01.01.2026) ile **8481.80 musluk/batarya/vana %25**, **8301.40 kilitler %20**,
    **8302.10/.50 menteşe ve askılık %15**, **8544.42.90 konnektörlü kablolar %15**,
    **9405 LED aydınlatma %30 (parçalar %20)**, **8516 ısıtıcılar %30**, **9504.50 konsollar %20**,
    **9506 fitness/spor %20**, **8205 el aletleri %25**, **4202.32 kılıf/çanta %39**,
    **3926.90.97 plastik eşya %10**. 8504.40 redresör/konvertörlerde oranlar %4,3–11.
  - 11508 (11.07.2026) bu gruplarda sınırlı değişiklik getirdi:
    - 8481.80.81 ve 8481.90 yeni alt kodlara ayrıldı, oran %25 olarak kaldı.
    - 8301.10.00.00.12 asma kilit için %20 eklendi.
    - 3926.90.97.90.23 (contalar) için %10 eklendi.
    - 8302.42.00.00.11 (koltuk amortisörleri) İGV listesinden çıkarıldı.
    - 8507.60.00.00.21 Li-ion akümülatörler %30, ancak 31.12.2026'ya kadar %0 uygulanır.
    - 9503 oyuncaklar %15–25.
    - Basında geçen "elektronik %10–30, LED %10–20, kablo %5–15" ifadeleri tüm rejimin
      özetidir. 11508 tablolarında bu gruplara yeni satır yok.
  - **8517, 8518, 8525, 8471, 8473, 8523.51 ve 8544.70 Ek-1'de yok → İGV 0.**

## A3. KDV matrahı ve oranı

**KDV Kanunu md. 21 (birincil metin):** İthalatta matrah aşağıdakilerin toplamıdır.
- a) GV tarhına esas kıymet. Kıymet esaslı GV yoksa veya mal muafsa sigorta ve navlun dahil CIF
  değer.
- b) **İthalat sırasında ödenen her türlü vergi, resim, harç ve paylar.** Buna GV, İGV, AD vergisi,
  ÖTV, KKDF ve beyanname damga vergisi girer.
- c) **Gümrük beyannamesinin tescil tarihine kadar yapılan diğer giderler ve ödemelerden
  vergilendirilmeyenler** ile mal bedeli üzerinden hesaplanan fiyat farkı ve kur farkı.
- ç) (20.07.2025 tarihli ve 7555 sayılı Kanunla eklendi) ÖTV Kanunu 16/4 uyarınca teminat
  karşılığı ithal edilen malın teminatına esas ÖTV tutarı.

**Hangi masraf matraha girer?**

| Masraf | KDV matrahına girer mi? | Gerekçe |
|---|---|---|
| Yurt dışı navlun ve sigorta (TR giriş yerine kadar) | **Evet** | 21/a (CIF kıymetin parçası) |
| GV, İGV, AD vergisi, ÖTV, KKDF, beyanname damga vergisi | **Evet** | 21/b |
| Tescilden önceki ardiye (geçici depolama ve antrepo ardiyesi KDVK 17/4-ö ile istisna, faturası KDV'siz) | **Evet** | 21/c ("vergilendirilmeyen" gider) |
| Tescilden önce yapılan ama KDV'li faturalanan hizmetler (liman ve tahmil-tahliye hizmetleri gibi) | Hayır | Zaten KDV'ye tabi. 21/c yalnız vergilendirilmeyenleri kapsar. Yorum gerektirir: GİB'in ardiye konusundaki güncel görüşü tartışmalı, müşavirle teyit edin. |
| Gümrük müşavirlik ücreti | Genelde **hayır** | Ayrı KDV'li yurt içi hizmet faturası. Tescil sonrası faturalanır ve vergilendirilmiştir. |
| Gümrük sonrası yurt içi nakliye | **Hayır** | Tescilden sonra; kendi KDV'si var |
| Tescilde tutarı belli olmayan depolama, tahmil-tahliye ve liman giderleri | Sonradan | Muhasebe kaydını izleyen ayın 26'sına kadar beyan edilir (03.01.2023 düzenlemesi, ikincil kaynak) |

**KDV oranları:**
- Genel oran **%20**. Dayanak: 7346 sayılı CBK, RG 07.07.2023/32241, yürürlük 10.07.2023. 2026'da
  genel oranda değişiklik bulunamadı.
- İndirimli oranlar %10 ve %1, I ve II sayılı listelerdeki mallar için geçerli.
- **Bu çalışmadaki tüm ürün grupları %20 KDV'ye tabidir.** İndirimli listede bu gruplardan kalem
  yok. Ticari ithalatçı için ithalat KDV'si indirilebilir; maliyet değil, nakit akışı kalemidir.

**ÖTV (IV) sayılı liste — "diğer" sütununda belirtildi:**
- **85.18 hoparlör, kulaklık ve amplifikatör: %20**
- **95.04 oyun konsolları: %20**
- **85.16 ısıtıcılar: %6,7**
- 8543.70.90.00.15 IR kumanda: %20
- **TV ve dijital kameralar: %20.** IP kameralar için muhtemel ancak doğrulanmadı. GİB'in
  24.03.2022 tarihli yazısına göre 2022 GTİP değişikliğine rağmen vergilendirme sürüyor.
- Kristal avize: %20
- Amatör/CB telsiz: %20 (eski GTİP ile listede)

Liste kaynağı: orgtr.org'daki konsolide IV listesi, 24.10.2025 değişikliği işlenmiş hâli (ikincil).
ÖTV matrahı ithalatta ÖTV Kanunu md. 11/1-c'ye göre KDV matrahı esas alınarak hesaplanır, KDV
matraha girer (kanun metni bu çalışmada ayrıca okunmadı).

## A4. Diğer yükler

- **Damga vergisi (gümrük beyannamesi, maktu):** 2026 için **1.605,80 TL**. Özet beyan için
  119,40 TL. Dayanak: 71 Seri No'lu DV Genel Tebliği, RG 31.12.2025/33124 (5. Mük.). KPMG bülteni
  ve ikincil bir kaynak aynı tutarı veriyor.
- **KKDF:**
  - **Kabul kredili, vadeli akreditif ve mal mukabili ödemede %6.**
  - **Peşin ödemede yok.** Bedelin serbest dolaşım beyannamesi tarihinde veya öncesinde transfer
    edildiği belgelenmelidir.
  - **Matrah: fatura bedeli** (gümrük kıymeti değil). FOB faturada navlun ve sigorta eklenmez.
    Dayanak: TCMB 05.08.1996 tarihli 96/2 sayılı yazı (ikincil kaynak: candurmus.com.tr). Güncel
    oran tablosu: dengeakademi KKDF 2026 PDF, güncelleme 06.01.2026.
  - DİİB ve yatırım teşvik kapsamındaki ithalatta %0.
  - Görüldüğünde ödemeli akreditif mevzuatta vadeli yöntemler arasında sayılmıyor, bu yüzden
    KKDF'siz kabul ediliyor. Bu durum açıkça doğrulanmadı.
- **Gümrük müşavirliği asgari ücreti 2026:** RG 30.12.2025/33123, yürürlük 01.01.2026. Tutarlara
  KDV ayrıca eklenir.
  - İTH-1 hava yolu: 3.320 TL; kara yolu: 3.390 TL.
  - İTH-2 deniz/liman: 4.670 TL.
  - 10'dan fazla kalem varsa 11. ve sonraki her kalem için 70 TL.
  - İTH-13 kademeli ek ücret: 15.000 USD'yi aşan CIF kısmı için binde 3; 225.000 USD üstü için
    binde 1; 2 milyon USD üstü için on binde 1.
  - Kaynak: KPMG bülteni PDF'i (tablo okundu).
- **TRT bandrolü (3093 sayılı Kanun):** Yalnız radyo/TV yayını alabilen cihazlar için geçerli.
  - Ticari ithalatta oranlar (CB Kararı 5610, RG 26.05.2022/31847):
    - TV, radyo ve video: %16
    - SIM kartlı telefon ve akıllı saat: %12
    - Ekransız alıcılar (uydu alıcısı, set üstü kutu): %12
    - Bilgisayar ve tablet: %4
    - "Diğer cihazlar" (radyolu/TV'li ışıldak, kulaklık, fotoğraf makinesi, navigasyon vb.): %14
    - Diğer yayın alabilen cihazlar: %0
  - **Bu çalışmadaki ürünlerin çoğu (IP kamera, switch, kablo, valf, kilit, ölçü aleti) yayın
    alıcısı değildir → bandrol yok.** Radyo/TV alıcısı olan bir ses cihazı ya da tablet ithal
    edilirse bandrol hesaba katılmalıdır.
  - 2022 sonrası oran değişikliği taranmadı → doğrulanmadı.
  - Yolcu beraberi cihazlarda maktu ücretler 2026'da değişmedi: CB Kararı 11065, RG 17.03.2026.
- **Gözetim:** 2026'da 192 gözetim tebliği var. Gözetim, yeni bir vergi değil; birim kıymet
  eşiğin altındaysa gözetim belgesi gerekir. Bu gruplara (8481, 8301, 9405, 8544, 85xx) özel 2026
  tebliği aramalarda çıkmadı. Kapsamlı tarama yapılamadığı için **doğrulanmadı**.
- **Ek mali yükümlülük (EMY):**
  - 7480 sayılı karar (BAE altın) 01.02.2026'da kaldırıldı ve İGV'ye taşındı.
  - Diğer EMY'ler "DTÖ üyesi olmayan ülkeler" içindir; Çin'e uygulanmaz.
- **Ürün güvenliği (TAREKS/CE denetimi):** Vergi değildir ama elektronikte süre ve maliyet
  doğurabilir.

## A5. Hızlı kargo / posta (e-ithalat) rejimi

**Tarihçe:**

| Dönem | Değer sınırı | Tek ve maktu vergi |
|---|---|---|
| 21.08.2024'ten önce | 150 € | AB %20, diğer ülkeler %30 |
| **21.08.2024 – 05.02.2026** | **CB Kararı 8787 (RG 06.08.2024/32624):** ticari olmayan, gerçek kişiye gelen eşyada **30 €** | **AB'den doğrudan %30, diğer ülkelerden (Çin dahil) %60.** ÖTV (IV) listesindeki eşyaya **+%20.** |
| **06.02.2026'dan itibaren** | **CB Kararı 10813** (RG 07.01.2026/33130, yürürlük yayımdan 30 gün sonra): 30 € muafiyeti/eşiği kaldırıldı | **Tek ve maktu vergi yalnız sağlık kuruluşu raporu veya reçeteye dayanan, gerçek kişiye gelen, ticari olmayan, ≤1.500 € ilaç ve takviye edici gıdaya uygulanır:** AB %30, diğer %60, ÖTV-IV için +%20. Uygulama Kararı md. 126/1-b'den "30 Avro'yu aşan ancak" ibaresi çıkarıldı. |

**06.02.2026 sonrası, gerçek kişiye gelen diğer gönderiler:**
- Hızlı kargo operatörü ≤1.500 € gönderiyi dolaylı temsilci olarak normal usulde beyan eder.
- Vergiler genel hükümlere göre GTİP bazında alınır: GV + İGV + (ÖTV) + KDV.
- Ticaret Bakanlığı SSS (05.03.2026) ve EN Gümrük analizi bunu doğruluyor.
- Bazı bloglar hâlâ "%60 tek ve maktu" yazıyor. Bu, 10813'ün birincil metniyle çelişiyor ve
  güncel değil.

**Ticari ithalatta kullanılabilir mi? Hayır.**
- Rejim yalnız "ticari miktar ve mahiyet arz etmeyen", gerçek kişiye gelen eşya içindir.
- Bakanlık SSS'sine göre:
  - Kişi başına takvim ayında 5 gönderi sınırı var.
  - Brüt ağırlık 30 kg'ı geçemez.
  - Cep telefonu, kozmetik, alkol ve tütün hızlı kargo kapsamı dışında. Bireysel hızlı kargoda
    ayakkabı, oyuncak ve deri/saraciye eşya da hariç.
  - Ar-Ge numune istisnası: gönderi başına 30 €, ayda 5 gönderi.
- Şirket ithalatı, hızlı kargo veya hava kargo fark etmeksizin **normal serbest dolaşım
  beyannamesiyle** yapılır. Bu durumda:
  - GTİP bazında GV + İGV + AD + ÖTV + KKDF (vadeli ödemede) + damga vergisi + KDV ödenir.
  - Müşavir ücreti ve uygunluk denetimi gerekir.
  - KDV indirilebilir.

**Hava kargo (normal beyan) ile hızlı kargo farkı:**
- 2026'dan itibaren vergi oranı bakımından fark kalmadı. Fark yalnız işlem yolunda:
  - Hızlı kargoda operatör temsilci olarak beyan eder.
  - Hava kargoda müşavir veya kendi beyanınızla ve antrepo/ardiye süreciyle ilerlenir.
- Eski %60 tek-maktu oranı, düşük GV'li elektronikte (GV 0–5 + İGV 0) **çok daha pahalıydı**.
  Artık bireysel gönderiler de GTİP oranına tabi.

## A6. Anti-damping (AD) — bu gruplara değen, yürürlükte olduğu tespit edilenler

| GTİP | Ürün | Önlem (Çin) | Durum / kaynak |
|---|---|---|---|
| 8302.10.00.00.11 / .19, 8302.50.00.00.00 | Menteşe, sabit askılık | **1,35 USD/kg** | Tebliğ 2023/12, RG 06.04.2023/32155. 5 yıl, yaklaşık 04/2028'e kadar (KPMG). |
| 8302.42.00.00.19 | Mobilya donanımı (diğer) | **0,65 USD/kg** | Aynı tebliğ |
| 8301.40.11.00.00, 8301.60.00.00.19 | Silindirli mekanik kapı kilidi, kilit kasası | **0,74 USD/adet** | Önlem 27.03.2026'da sona erecekti. NGGS (Tebliğ 2026/8, Mart 2026) açıldı; soruşturma sürerken önlem yürürlükte. **Elektromekanik, elektromanyetik ve tam elektronik kilitler hariç** (akıllı kilit kapsam dışı). Kaynak: GAİB ve haber metinleri; RG metni okunmadı. |
| 8544.42.90.00.11 (+8544.60.10.00.11) | Güneş paneli bağlantı kutusu | Kesin önlem — Tebliğ 2026/29 | Oran haberlerde "CIF %38,23". **Doğrulanmadı.** |

Diğer gruplar aşağıda; bunlarda **TR'de Çin'e yönelik AD önlemi aramalarda bulunamadı**:
- 8481.80 batarya ve vana
- 8544.70 fiber kablo (AB'de AD var; TR'ye uygulanmaz)
- 4202 kılıf ve çanta
- 8203 ve 8205 el aletleri
- 8518, 9405, 8525 ve 8517

Kapsamlı bir "yürürlükteki önlemler" listesine (Ticaret Bakanlığı) erişilemedi. Bu nedenle
**"yok" değil, "bulunamadı / doğrulanmadı"** olarak işaretlendi.

---

## B. Hesap formülü (tek kalem)

```
CIF        = FOB + navlun(TR giriş yerine kadar) + sigorta            [gümrük kıymeti, TL'ye beyan kuru ile]
GV         = CIF × gv%                     (DÜ / 7. sütun)
İGV        = CIF × igv%                    (Ek-1'de yoksa 0)
AD         = tebliğe göre (CIF×% veya USD/kg, USD/adet)
KKDF       = fatura bedeli × %6            (yalnız kabul kredili / vadeli akreditif / mal mukabili; peşinde 0)
DV         = 1.605,80 TL                   (beyanname başına damga vergisi, 2026)
X          = tescile kadar yapılan, KDV'siz (vergilendirilmemiş) giderler + kur/fiyat farkı
ÖTV_mat    = CIF + GV + İGV + AD + KKDF + DV(+diğer harç) + X
ÖTV        = ÖTV_mat × ötv%                (yalnız IV sayılı listedeki mallar)
KDV_mat    = ÖTV_mat + ÖTV
KDV        = KDV_mat × %20
İniş maliyeti (KDV indirimli mükellef) = KDV_mat + müşavir ücreti + KDV'li liman/ardiye/THC + yurt içi nakliye + banka masrafları (+TRT bandrolü varsa)
Gümrükte ödenecek nakit = GV + İGV + AD + KKDF + DV + ÖTV + KDV
```

**Örnek 1 — lavabo bataryası (8481.80.11), peşin ödeme**
- FOB 10.000 USD; navlun 600; sigorta 40 → CIF 10.640
- GV %2,2 = 234,08
- İGV %25 = 2.660,00
- KKDF 0
- KDV_mat = 13.534,08 + DV + X
- KDV %20 = 2.706,82 (+DV/X payı)
- Gümrük vergisi yükü (GV + İGV): CIF'in %27,2'si

**Örnek 2 — IP kamera (8525.89), mal mukabili ödeme, FOB fatura**
- FOB 10.000 USD; navlun 600; sigorta 40 → CIF 10.640
- GV %4,9 = 521,36
- İGV 0
- KKDF %6 × 10.000 = 600
- ÖTV uygulanırsa (%20; doğrulanmadı):
  - ÖTV_mat = 11.761,36 (+DV/X) → ÖTV = 2.352,27
  - KDV_mat = 14.113,63 → KDV = 2.822,73
- ÖTV uygulanmazsa: KDV_mat = 11.761,36 → KDV = 2.352,27

---

## C. Belirsizlikler / doğrulanamayanlar

1. **ÖTV-IV kapsamı:**
   - IP/CCTV kameralar (8525.89) "televizyon kamerası" sayılırsa %20 ÖTV'ye tabi olur. Bu
     sınıflandırma ve ÖTV yükünü en çok değiştiren belirsizliktir; BTB veya GİB özelgesi önerilir.
   - El telsizleri (amatör/PMR) için de ÖTV %20 riski var.
2. **Sınıflandırma çatalları (vergi yükünü değiştirir):**
   - Telefon kılıfı: 3926.90.97.90.29 (GV 6,5 + İGV 10) veya 4202.32.10 (GV 9,7 + İGV 39)
   - Metal dedektörü: 8543.70.90.00.11 (GV 3,7 + İGV 20) veya 9015.80.80 (GV 3,7 + İGV 0)
   - El telsizi: 8525.60 veya 8517.62 (ikisi de 0/0)
   - Adaptör: 8504.40.83.90.19 (İGV 11) veya 8504.40.95.90.19 (İGV 5)
   - Geliştirme kartları: 8543.70 / 8471 / 8473 / 8542
   - Patch kablo: 8544.42.10 (0/0) veya 8544.42.90 (3,3/15)
3. **AD listesi** kapsamlı taranamadı:
   - Kilit önleminin tutarı ve kapsam ifadeleri ile güneş paneli bağlantı kutusu oranı (2026/29)
     RG'den okunmadı.
   - 2023/12 menteşe önlemi 2028'e kadar yürürlükte olmalı; erken bir değişiklik taranmadı.
4. **GV kaynağı:** Bakanlık Excel listelerinin Ocak 2026 sürümü bir müşavirlik firması
   aynasından alındı (10790'a ekli Excel). RG'nin kendisi taranmış görüntü olduğundan GV
   oranları Excel'den okundu.
   - AB dışı kalemlerde TARIC ile çapraz kontrol tutarlı (ör. 8544.42.90 %3,3; 8481.80 %2,2;
     8301.40 %2,7; 8543.70.90 %3,7).
   - Temmuz değişikliği 11506 ilgili kodlar için kontrol edildi.
   - Ocak–Ekim arası diğer İRK değişiklikleri tam taranmadı. 11206 yalnız gübreleri kapsıyor.
5. **KDV 21/c uygulaması:** Ardiyenin KDV'li ya da KDV'siz faturalanmasına göre GİB görüşleri
   tartışmalı. Müşavir ücreti genel uygulamada matraha eklenmiyor. Kesin görüş için YMM/özelge
   önerilir.
6. **KKDF:** Görüldüğünde ödemeli akreditifin KKDF dışı olduğu açıkça doğrulanmadı.
7. **TRT bandrol oranları** (5610, 2022) sonrasında değişiklik olup olmadığı taranmadı.
8. **Gözetim** tebliğlerinin bu GTİP'lere değip değmediği taranamadı.

---

## D. Kaynak listesi (ek)
- Ticaret Bakanlığı 2026 İthalat Rejimi duyurusu (02.01.2026): https://ticaret.gov.tr/haberler/ticaret-bakanliginin-hazirladigi-2026-yili-ithalat-rejimi-resmi-gazetede-yayinlandi
- İGV konsolide sayfası (3351): https://ticaret.gov.tr/ithalat/ithalat-mevzuati/ithalat-rejimi-karari-igv-karari-ve-ithalat-tebligleri/2-ithalatta-ilave-gumruk-vergisi-uygulanmasina-iliskin-karar-karar-sayisi-3351-karar-metni-ve-tablolar-konsolide-edilmis-olup-gunceldir
- İKV bilgi notu (11506/11507/11508): https://www.ikv.org.tr/images/files/ikv_bilgi_notu_2026_yili_ithalat_rejimine_iliskin_ara_degisiklikler_resmi_gazetede_yayimlandi_ahmet_emre_usta.pdf
- 10791 özet (alomaliye): https://www.alomaliye.com/2025/12/31/ithalatta-ilave-gumruk-vergisi-uygulanmasina-iliskin-kararda-degisiklik-karar-sayisi-10791/
- Posta/hızlı kargo SSS (Ticaret Bakanlığı, 05.03.2026): https://ticaret.gov.tr/gumruk-islemleri/sikca-sorulan-sorular/bireysel/posta-ve-hizli-kargo-muafiyeti
- 10813 analizi (EN Gümrük): https://engumruk.com/blog/posta-ve-hizli-kargo-tasimaciliginda-30-avro-limiti-kaldirildi-yurtdisi-kaynakli-internet-sitelerinden-yapilan-alisverisler
- 8787 (2024, 150→30 €, %60): https://www.alomaliye.com/2024/08/06/gumruk-kanununun-bazi-maddelerinin-uygulanmasi-hakkinda-kararda-degisiklik-karar-sayisi-8787/
- ÖTV (IV) konsolide liste: https://orgtr.org/iv-sayili-liste/ ; kamera GİB yazısı: https://kpmgvergi.com/yayinlar/mali-bultenler/gumruk/ozel-tuketim-vergisi-kanununa-ekli-iv-sayili-listede-otvye-tabi-olan-bazi-kameralarin-2022-yilinda-farkli-gtip-numaralarinda-yer-alsalar-dahivergilendirilmeye-devam-edilecegi-bildirilmistir/1466
- Damga vergisi 2026: https://kpmgvergi.com/yayinlar/mali-bultenler/vergi/2026-yilinda-uygulanacak-damga-vergisi-tutarlari/3349
- KKDF: https://dengeakademi.com/Files/Info/K.K.D.F%20Oranlar%C4%B1%202026.pdf ; https://candurmus.com.tr/kkdf/
- Müşavirlik asgari ücret 2026: https://kpmgvergi.com/yayinlar/mali-bultenler/gumruk/gumruk-musavirligi-ve-yetkilendirilmis-gumruk-musavirligi-asgari-ucret-tarifesine-iliskin-tebligde-degisiklik-yapilmasina-dair-teblig-yayimlanmistir/3369
- TRT bandrol 5610: https://yaklasim.com/haber/3093-sayili-turkiye-radyo-televizyon-kurumu-gelirleri-kanunu-uyarinca-radyo-televizyon-video-ve-birlesik-cihazlar-ile-gorsel-ve-veya-isitsel-yayinlari-alabilen-her-turlu-cihazdan-alinacak-bandrol-uc/
- Menteşe AD 2023/12: https://kpmgvergi.com/yayinlar/mali-bultenler/gumruk/cin-menseli-mentese-sabit-askilik-ve-mobilya-donanim-urunlerine-uygulanan-dampinge-karsi-onlem-miktari-degistirilmistir/1966
- Kapı kilidi NGGS 2026/8: https://www.gaib.org.tr/tr/hububat/duyurular/cin-menseli-kapi-kilitleri-ithalatina-sorusturma-8677.html
- TGTC 2026 tanımları (ikincil, Karar 10781 verisi): https://musavirlerkulubu.com.tr/araclar/embed/gtip-sorgulama
- ITA-2'ye Türkiye'nin katılmaması: DIGITALEUROPE AB-TR Gümrük Birliği pozisyon belgesi (2019): https://cdn.digitaleurope.org/uploads/2019/01/DIGITALEUROPE%20Position%20for%20a%20new%20EU-Turkey%20Costums%20Union.pdf
