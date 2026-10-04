# AI CFO V1 finansal sözleşme — v4

Bu sözleşme yalnız `lib/cfo-agent/` için geçerlidir. Eski dashboard, CFO motoru,
servet defteri, Entegra stok otoritesi ve insan kararları değiştirilmez.

**Komisyon, kargo, hizmet ve ceza oranları KDV DÂHİL brüt tutar üzerinden uygulanır.
`revenue_ex_vat` yalnızca raporlama içindir, marj paydası olarak kullanılmaz.**

## Tanımlar

| Metric | Tanım |
| --- | --- |
| Gross revenue | Geçerli satışların düzeltilmiş KDV dahil tutarı; sipariş cirosu yalnız `cfo_satis_siparis`, SKU tutarı yalnız `cfo_satis_birim_duz.tutar_duz` |
| Revenue ex VAT | Kaynakta ölçülen VAT düşülmüş gross; VAT bilinmiyorsa null; sabit %20 varsayılmaz |
| VAT | Kaynakta açıkça ölçülmüş vergi; contribution hesabında tekrar düşülmez |
| Refund | Gerçekleşmiş iade tutarı; gross zaten iadeyi netleştiriyorsa tekrar düşülmez. Claim açılması refund değildir |
| Product cost | Bilinen birim maliyet × düzeltilmiş adet; güncel maliyet tarihsel maliyet olmadığı için estimated. KARMA/BILINMIYOR satırları bilinmeyen maliyet taşır |
| Commission | 120 günlük ölçüm penceresi: kanal NULL kapsamı ≥%90, SKU ayıklama sonrası ≥10 geçerli ölçüm. Kanal+SKU medyanı + MAD ile ayıklama (eşik max(5 puan, 3×MAD)), ardından sum(commissionTry)/sum(totalAmountTry). Farklı SKU'ların meşru oran farkı aykırı sayılmaz. Bugün yalnız TRENDYOL/HEPSIBURADA ölçüm kanalı kabul edilir. Küçük örneklemde kanal komisyon ortalaması kullanılmaz; diğer kanallarda null. Koçtaş contribution null kalır. HB sabit %18 de varsayılmaz; ölçülen tutar kullanılır |
| Shipping | `cfo_kargo_tarife` bandından sipariş başına; tablo/kolon eşleşmezse null, sabit kargo katsayısı yok |
| Advertising | Aynı dönem/kanala güvenilir atfedilmiş harcama; atıf yoksa null. Meta rapor cirosu satış cirosuna eklenmez |
| Other variable costs | Sipariş başına işlem 12,29 TL, hizmet/ceza 10 TL; ambalaj ≤0,5 kg 10 TL, üstü 18,74 TL. Bunlar ölçülmüş politika tahminidir, gerçekleşmiş gider değildir |
| Return reserve | Sipariş başına 13,36 TL tahmini. Gerçek refund ve rezerv birlikte çıkarılmaz. Gerçekleşmiş refund kapsamı bilinmiyorsa contribution eksik kalır |
| Contribution profit | Gross − product cost − commission − shipping − advertising − refund (bir kez) − diğer doğrudan değişken maliyetler. Gerekli bir alan bilinmiyorsa null |
| Contribution margin | Contribution profit / gross; gross ≤0 veya kâr bilinmiyorsa null; tüm oranlar basis=gross_incl_vat |

## Grain ve bilinmeyenler

- Ham MarketplaceSalesRecord quantity/totalAmountTry/modelNumber SKU hesabında kullanılmaz.
- Sipariş masrafları tek yerde, düzeltilmiş pozitif SKU ciro payına göre dağıtılır.
  Sipariş anahtarı, tam satır kapsamı veya güvenilir tutar yoksa dağıtım null olur.
- Kanonik view'lar tek satış otoritesidir; API ve Entegra tabloları UNION ile eklenmez.
  Aynı canonical sipariş/SKU satırı birden çok gelirse finansal sonuç engellenir.
- AMAZON_FBA düzeltilmiş satışlara dahildir; FBA envanteri varlıklara eklenmez.
- Kukla stok {500,998,999,1000,9999,10000} ve cfo_stok_istisna elenir.
- Entegra adetleri corrected canonical görünümden tüm kanallar için toplanır; XML adet30 ve ihtiyatlı hız ayrı okunur. Tam 30 günlük satış kapsamı varsa hız min(Entegra adet/30, XML ihtiyatlı hız); eksik Entegra döneminde Entegra adet/30 demand kabul edilmez ve XML ihtiyatlı hız kullanılır. Ham XML adet/30 veya iki kaynağın max değeri kullanılmaz. Adet farkı/max(adetler)>%30 ise DATA_QUALITY oluşur. Stock days mevcut ihtiyatlı görünümden gelir.
- SET maliyeti yalnız cfo_set_bilesen_maliyet; eksik bileşende null. SET kârı yalnız
  cfo_set_fiyat. Eksik set bileşeni dataQuality olur, finansal alarm olmaz.
- Eksik, bayat, doğrulanmamış veya tanımı bilinmeyen alanlar null + reason taşır.
  Bilinen sıfır ayrı durumdur. Kısmi stok maliyet toplamı ayrıca kapsamıyla gösterilir.

## Fiyat tabanı ve etki

Taban=(birim maliyet + sipariş kargosu + ambalaj + 13,36 + 12,29 + 10)/(1-komisyon).
Bu **tek adetlik sipariş senaryosudur**, gerçekleşmiş contribution değildir ve estimated
etiketi taşır. Çözüm her kargo bandında tekrar kontrol edilir; bandı aşan taban yeni
bandın kargosu ile hesaplanır. <200 TL için komisyon=0 duyarlılık testi ayrıca saklanır.
200–243,70 ve 350–365,50 aralıkları fiyat ölü bantlarıdır.

Impact=ölçülen birim kâr × ölçülen günlük hız × etkilenen gün.
Kâr/hız bilinmiyorsa impact null. Formula, inputs, basis, estimated saklanır.
AI bu değerleri hesaplayamaz veya finansal etki yazamaz.

## Güncellik, nakit ve evidence

- Kaynak başına max(orderDate) ve max(syncedAt/importedAt) ayrı tutulur.
  Tek MAX senkron durdu teşhisi değildir; dakika batch'leri ve gün sürekliliği ayrıca ölçülür.
- Satış verisi >48 saat bayat veya eşit dönem/gün kapsamı eksikse finansal alarm yok.
  Gün karşılaştırması aynı hafta günüyle, 7/30 gün karşılaştırması 7/35 gün kaydırmayla yapılır.
- Tarih kolonunun gerçek PostgreSQL tipi katalogdan kontrol edilir. Prisma ve Entegra'nın UTC sakladığı timestamp-without-zone önce UTC anına, sonra İstanbul yerel saatine çevrilir; timestamptz doğrudan İstanbul saatine çevrilir. Yerel timestamp dönem sınırı yerel timestamp ile karşılaştırılır. 65/120 günlük kaynak taramalarının alt sınırı İstanbul gün başlangıcıdır; gün içi kesilme önceki dönemin ilk gününü eksiltmez. Desteklenmeyen tarih tipi unknown/dataQuality olur.
- Nakit yalnız mevcut salt okunur CFO view/fonksiyonlarından okunur. Banka girdisi
  >7 gün bayatsa nakit alarmı yok. KMH ve amaca bağlı limit nakit değildir.
- Projeksiyon net pozisyonu −3.000.000 TL altındaysa critical; kolon anlamı doğrulanamıyorsa null.
- Evidence={id,source,query,value,unit,asOf,measured}; query sabit denetlenebilir sorgu
  referansıdır, ham SQL/user input değildir. measured=false içeren insight TAHMİNİ etiketi taşır.

Canlıda tanımı repoda olmayan kaynaklar runtime kolon sözleşmesi ile kontrol edilir.
Eksik kaynak yeni tabloyla yeniden yaratılmaz. Üretim öncesi adapter sözleşmesi CFO
tarafından pg_get_viewdef/information_schema üzerinden doğrulanmalıdır.

## 03.10.2026 — komisyon kapsamı düzeltmesi

cfo_kanal_net_oran yalnız YÜKSEK güvenli, 0<oran<1 banka-ekstresi ölçümlerinde TAHMİNİ net tahsilat=gross×net_oran üretir. Net oran komisyon değildir. Kesintilerin kapsamı (kargo/iade/işlem/hizmet/ambalaj/reklam) doğrulanmadan bu tahsilattan contribution türetilmez; aksi halde giderler iki kere düşülebilir. Koçtaş contribution kabul gereği null kalır. Oranların sayısal referansları koda sabitlenmez; kaynak görünümü okunur.

Kabul referansları yalnız 03.10.2026 ledger snapshot'ı içindir; mevcut mutable bakiye/stok alanlarıyla geçmiş gün yeniden oluşturulamaz.

## 03.10.2026 — CFO dönem kararı: son 120 gün

İşletme sahibi komisyonların kampanyalarla değişmesi nedeniyle **son 120 gün**
penceresini seçti. Aktif v3 hesap bu pencereyi zaten kullanır; tüm geçmişe
fallback yapılmaz, sabit oran eklenmez. Bu ölçüm güncel kampanyanın garanti
komisyonu değil, dönem içindeki gerçekleşmiş ağırlıklı orandır.

03.10.2026 18:47 UTC ölçümünde MD-3003B1/TRENDYOL son 120 gün: 37 kayıt,
%10,4710; tarihsiz tüm geçmiş: 43 kayıt, %12,8758. Dönem seçimi eski altın
referansı kendiliğinden değiştirmez. Dönem, asOf ve örneklem aynı olan bağımsız
referansla kabul doğrulanmalıdır; canlı çıktının beklenen değer olarak kopyalanması
kabul testi değildir. XML/hız/mevcut stok referanslarının zamanı ayrıca uzlaştırılır.

## 04.10.2026 — v4 canlı source sözleşmesi

`AI_CFO_SOURCE_PROFILE=alfas_2026_10_04` canonical satış view'ları, nakit kapısı
ve mevcut cfo_nakit_projeksiyon(integer) tanımlarının hash'ini kontrol eder.
Doğrulanmış pozisyon nakit_try'den başlar; KMH/amaca bağlı kapasiteyi nakde eklemez.
Değişmiş/eksik tanımda canonical finansal sinyal ve projeksiyon yorumu engellenir;
mevcut SQL motoru yeniden yazılmaz. Bayat banka kapısı yine geçerlidir.

Kargoda alt_sinir/ust_sinir/**toplam** kullanılır; tarife tek başına ek_maliyet'i
dışlar. Pazaryeri ve satış tarihi için geçerli son band sürümü seçilir; fiyat
tabanında analiz günü kullanılır. İade/kusurlu gönderilerde alt sınır yoktur ve
normal satış kargosuna katılmaz. Başka kanalın tarifesi, gelecekteki geçerlilik
tarihi, bilinmeyen kanal/tarih veya çakışan bantlar unknown üretir.

Canlı SET bileşen tablosundaki kanal **kamera sayısıdır**; set_sku/BOM bağlantısı
yoktur. Birden fazla disk/NVR alternatifinden SKU adına veya serbest note
metnine göre reçete uydurulmaz. cfo_set_fiyat'tan tanınan SET, Product'ta
MAIN_STOCK görünse de bilinmeyen bileşen maliyeti yerine Product.unitCostTry
kullanamaz. Aynı SKU için birden çok kâr satırı da unknown olur. Eksik bileşen
dataQuality'dir. 120 günlük komisyon ve altın referanslar değiştirilmez.
