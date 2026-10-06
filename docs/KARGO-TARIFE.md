# Kargo tarifeleri (2025–2026) — maliyet analizi için

Kaynak: kullanıcının paylaştığı Trendyol anlaşmalı kargo fiyat listeleri (**KDV hariç**). Migration `20261005260000_cfo_kargo_desi_tarife`, ham CSV'ler `data/kargo/`, test `__tests__/cfo-kargo-tarife.test.ts` (CSV'nin her hücresi tabloda birebir doğrulanır).

| Tablo | İçerik |
|---|---|
| `cfo_kargo_desi_tarife` | taşıyıcı × geçerlilik × desi → KDV hariç fiyat. **3 Ocak 2025** (desi 0-56; Aras, Kolay Gelsin, MNG, PTT, Sürat, TEX, Yurtiçi, Borusan, CEVA, Horoz) ve **13 Temmuz 2026** (desi 0-92; Aras, DHL eCommerce, Kolay Gelsin, PTT, Sürat, TEX, Yurtiçi) |
| `cfo_kargo_barem` | küçük sipariş sabit kargo. 2023 <70 TL→20, 2024 <100→25, 2025 <100→30 (**kullanıcı hatırlaması, verified=false**); Trendyol Barem Destek ekran görüntüsü (tarihsiz, ≈2024) 0-124,99 / 125-199,99 TL, taşıyıcı grubuna göre (verified=true, tarihsiz → fonksiyon kullanmaz) |
| `cfo_kargo_kanal_varsayim` | `'*' → TRENDYOL_ANLASMALI`: **tüm pazaryerlerinde aynı kargo maliyeti varsayılır** (kullanıcı kararı) |
| `cfo_kargo_tahmin(gün, desi, taşıyıcı='TEX', sipariş_tutarı=NULL)` | KDV hariç/dahil (×1,20), dayanak (`DESI_TARIFE` / `BAREM_<id>`), tarife sürümü, `verified`. Desi yukarı yuvarlanır; tablo dışı desi veya ilk liste öncesi tarih → **satır yok (bilinmiyor)**, ekstrapolasyon yok |

## Doğrulama (gerçek Trendyol faturalarıyla)
`trendyol_invoice_line` tutarları KDV **dahil**: TEX desi 0-2 = 93,05 = 77,54×1,20; TEX desi 3 = 112,36 = 93,63×1,20; TEX desi 5 = 129,58 = 107,98×1,20; Aras desi 1 (Tem) = 106,76 ≈ 88,96×1,20; Aras desi 3/5 = 121,01 / 141,42 ✓ → 13 Temmuz 2026 listesi faturalarla birebir tutuyor.

## Bilinen sınırlar
- 2025 listesi 2026-07-12'ye kadar "son bilinen" olarak uygulanır; fakat Nisan-Haziran 2026 faturalarında Aras desi 1 = 100,72 (KDV dahil; 2025 listesinden yüksek) ve TEX 77,54 (2025: 61,04) görülüyor → 2025-2026 arası ara güncellemeler bilinmiyor. `verified=false` bu yüzden döner.
- Ağustos 2026 faturalarında TEX 98,34 (=81,95 KDV hariç, +%5,7) görülüyor; 13 Temmuz listesinde yok → yeni liste gelince eklenmeli.
- Bazı TEX desi 0 faturaları 78,99 (KDV hariç ≈65,83) — liste dışı bir bant; kaynağı belirlenemedi.
- Trendyol ayrıca sipariş başına işlem bedeli faturalıyor (`ISLEM_BEDELI`, ≈12,0–13,2 TL KDV dahil); desi tarifesine dahil değil (ölçülü değer `cfo_kargo_tarife.ek_maliyet`).
- Ürün tablosunda desi yok (`weightKg` var); desi = max(ağırlık, hacim) olduğundan `ceil(weightKg)` alt sınırdır.
- 2026 için sipariş-tutarı baremi (≤200 TL) belgesiz; ölçülü bantlar `cfo_kargo_tarife` (siparis <200 TL: 41,60+12,01).
- 2 Ocak 2024 listesi (desi 0-49) paylaşıldı fakat istenmediği için yüklenmedi.

## AI CFO kullanımı (2026-10-06)
AI CFO snapshot'ı sipariş-tutarı bantlarını (`cfo_kargo_tarife.toplam`) kullanır; `toplam` ölçülü işlem bedelini içerdiği için sabit işlem bedeli ayrıca eklenmez. Bantlar 2026-06-19'dan (ölçüm başlangıcı) itibaren geçerli sayılır. Kendi bandı olmayan kanallara `cfo_kargo_kanal_varsayim` gereği Trendyol bantları "TAHMİNİ" olarak uygulanır; `AMAZON_FBA` hariç (Amazon gönderir). Ayrıntı: `docs/AI-CFO-RUNNER.md` → "Kaynak kolon eşlemesi".
