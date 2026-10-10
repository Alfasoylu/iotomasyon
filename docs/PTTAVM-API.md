# PttAVM API entegrasyonu (salt-okuma)

Durum: 2026-10-10 — istemci + teşhis ucu kodda; üretim bağlantısı Alperen ortam değişkenlerini girince `pazaryeri-api-test.yml`
ile doğrulanacak. Veritabanına sipariş YAZILMIYOR (PttAVM satışları zaten Entegra üzerinden EPTT kanalıyla geliyor; çift sayım
riski — kalıcı senkron ayrı karar).

## Kaynaklar
- Resmî: https://developers.pttavm.com/tr (Katalog, Listeleme, Sipariş, Kargo, Duyurular) + "API key documentation.docx".
- SOAP sözleşmesi: WSDL `https://ws.pttavm.com:93/service.svc?wsdl` (WSDL'den üretilmiş açık kaynak proxy ile çapraz kontrol).

## İki API
| | SOAP (eski) | REST (yeni) |
|---|---|---|
| Adres | `https://ws.pttavm.com:93/service.svc`, SOAPAction `http://tempuri.org/IService/<İşlem>` | `https://integration-api.pttavm.com/api/v1` (+ kargo `https://shipment.pttavm.com/api/v1`) |
| Kimlik | WS-Security `UsernameToken` (kullanıcı adı + şifre; gövdede alan yok, mağaza kimlikten) | Başlıklar `Api-Key`, `access-token`, `X-Correlation-Id` (her istekte yeni UUID) |
| Anahtar nereden | Entegra'da kullanılan "Api Bilgileri" kullanıcı adı/şifresi | Satıcı Paneli → Hesap Yönetimi → Entegrasyon Bilgileri → entegratör → Görüntüle |
| Gelecek | PttAVM: kullanıcı adı/şifre "kullanıcıların çoğunluğu geçince" kaldırılacak | Zorunlu yeni yöntem |

İstemci (`lib/pttavm/client.ts`): REST anahtarları tanımlıysa REST, yoksa SOAP.

## Ortam değişkenleri (Vercel → Production; değerler depoya/loglara yazılmaz)
- REST: `PTTAVM_API_KEY`, `PTTAVM_ACCESS_TOKEN` (önerilen)
- SOAP: `PTTAVM_USERNAME`, `PTTAVM_PASSWORD`
- Bilgi: `PTTAVM_SHOP_ID`

## Kurulan okumalar
| Alan | REST | SOAP |
|---|---|---|
| Bağlantı | `GET /shipping/cargo-profiles` | `GetVersion` |
| Sipariş arama | `GET /orders/search?startDate&endDate&isActiveOrders=false` (≤ 40 gün; istemci 30 günlük dilimler) | `SiparisKontrolListesiV2` |
| Sipariş detayı | `GET /orders/{id}` | `SiparisDetay` |
| Kargo bilgisi | `GET /orders/{id}/cargo-infos` | `KargoBilgiListesi` |
| Kargo profilleri | `GET /shipping/cargo-profiles` | `GetCargoProfiles` |
| Ürün/stok/fiyat listesi | `GET /products/search` (sayfalı) | `GetProductsWithVariants` |
| Barkod sorgusu | `POST /products/get-by-barcodes` (okuma) | `BarkodKontrol` |
| Kategoriler | `GET /categories/main` | `GetMainCategories` |
| Depolar | `POST shipment …/get-warehouse` (okuma) | — |

Sipariş satırında finansal alanlar: `kdvDahilToplamTutar`, `kdvHaricToplamTutar`, `komisyon` (birimi — tutar/oran — dokümanda yok;
ilk gerçek veride doğrulanacak), `indirimPttavm` / `indirimTedarikci`, `couponAmount`, siparişte `kargoTutari`.

## Bulunmayanlar (resmî kaynakta yok)
- **Hakediş / finans / ödeme** ucu yok → net alacak satır komisyonundan TAHMİN.
- **İade** ucu yok → iade yalnız satır durumunda: `iade`, `gondericisine_teslim_edildi`.
- Marka, kategori özelliği, müşteri soruları, mağaza bilgisi ucu yok.

## Yazma — yalnız ölü stok istisnası (Alperen kararı 2026-10-10; docs/AI-RULES.md İstisna)
`lib/pttavm/write.ts`: `POST /products/stock-prices` (fiyat/stok; ≤ 1000, KDV 0/1/10/20, fiyat > 1, indirim 0–70, stok 0–9999,
aynı istek 5 dk içinde tekrarlanmaz), `PUT /products/{id}/status` (aktif/pasif), `POST /products/tracking-result/{id}` (sonuç).
Yalnız REST anahtarları + `PTTAVM_WRITE_ENABLED=true` iken; tek çağıran `lib/actions/olu-stok-actions.ts` (insan onaylı,
`/cfo/olu-stok/eylem`). Test `pttavm-write`.

## Hâlâ KURULMAYANLAR
`POST /products/upsert` (yeni ürün/içerik — sonraki adım), `POST /orders/{id}/invoice`, kargo `create-barcode` /
`update-no-shipping-order`; SOAP yazma uçlarının tamamı (`StokGuncelle*`, `StokFiyatGuncelle*`, `UpdateProducts*`, `AktifYap`,
`SaveInvoince`, `OlmayanUrunAdetleriSifirla`). Salt-okuma istemcisi (`client.ts`) yazma uçlarını reddetmeye devam eder (test `pttavm-client`).

## Teşhis
Actions → "Pazaryeri API teşhisi" → kanal `pttavm`, gün 30 → `/api/cron/pttavm-tani`: bağlantı, son N gün sipariş özeti
(sipariş/satır sayısı, durum dağılımı, KDV dahil/hariç toplam, komisyon, indirimler, kargo, iade satırları — kişisel veri yok),
ürün listesi 1. sayfa adedi, kargo profilleri, ana kategoriler.

## Sıradaki
1. Bağlantı doğrulaması (Alperen değişkenleri girince).
2. Komisyon biriminin doğrulanması → CFO-028 EPTT komisyonu TAHMİNİ yerine ÖLÇÜLMÜŞ (satır komisyonu).
3. Kalıcı senkron kararı (Entegra EPTT satırlarıyla çift sayım olmadan; migration gerekir).
4. Koçtaş (Shop Key) ve N11 (Api Key + Secret) aynı kalıpla.
