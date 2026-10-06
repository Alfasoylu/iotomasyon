# Market Scout (PR3) — Pazar İstihbaratı / Ürün Avcısı Temeli

Kuzey yıldızı: **KEŞFET → DOĞRULA → ÖLÇ → ÖNER**. Asla KEŞFET → VARSAY → SATIN AL değil.

Durum (2026-10-06): kod + migration hazır, **üretime uygulanmadı**, hiçbir toplayıcı zamanlanmadı, ENV değişmedi.
Forecast V2'ye, `PurchaseOrder`'a, `cfo_order_line`'a ve ithalat önerilerine yazma yolu **yok**.

## 1. Veri kaynakları (yalnız meşru yollar)

| Kaynak | Kod | Derece | Durum | Not |
|---|---|---|---|---|
| Trendyol Buybox (resmi Seller API) | `TRENDYOL_OFFICIAL_API` | A | yapılandırma yoksa UNAVAILABLE; son OK çalıştırma yoksa LIMITED; ancak OK çalıştırmadan sonra AVAILABLE | Yalnız BİZİM barkodlarımız; rakip satışı DEĞİL. `storeFrontCode` TR değeri dokümanda yok → `MARKET_SCOUT_TRENDYOL_STOREFRONT_CODE` gerekli |
| Trendyol sitemap (robots izinli) | `TRENDYOL_SITEMAP` | A (yalnız kimlik) | LIMITED | Ürün ID/marka/slug/görsel; satıcı, fiyat, puan, yorum, satış YOK (DB CHECK) |
| Trendyol mağaza/ürün sayfası | — | — | **BLOCKED** | Cloudflare 403 + robots `/sr?`, `?mid=`, `/magaza/profil`. Aşma yapılmaz |
| Manuel tarayıcı capture | `MANUAL_BROWSER_CAPTURE` | B | AVAILABLE | Kullanıcının kendi tarayıcısında gördüğü; sunucu sayfayı çekmez |
| Google Trends (resmi API alpha) | `GOOGLE_OFFICIAL` | A | UNAVAILABLE → sinyal UNKNOWN | `MARKET_SCOUT_GOOGLE_TRENDS_ACCESS=granted` olmadan çalışmaz; ilgi endeksi ≠ arama hacmi |
| Google otomatik tamamlama | `GOOGLE_AUTOCOMPLETE_EXPERIMENTAL` | D | EXPERIMENTAL (kapalı) | Yalnız anahtar kelime keşfi; `monthly_searches` ÜRETMEZ (`searchVolume: "UNKNOWN"`) |
| Alibaba arama | `ALIBABA_OFFICIAL` | — | UNAVAILABLE | robots `/trade/` yasak; resmi Open Platform başvurusu yok |
| Manuel tedarik (Alibaba/1688/MIC linki) | `MANUAL_SOURCING` | B | AVAILABLE | Görünen fiyat ≠ iniş maliyeti; iniş maliyeti UNKNOWN (DB CHECK) |
| Lisanslı sağlayıcı | `LICENSED_PROVIDER` | — | LEGAL_REVIEW_REQUIRED | Arayüz açık; hukuki inceleme olmadan bağlanmaz |
| Eski scout içe aktarımı | `LEGACY_SCOUT_IMPORT` | C | salt-okunur adaptör | `legacy_writer = UNKNOWN` |

Yasak (bu PR ve sonrası için): Cloudflare/anti-bot aşma, sahte UA, residential proxy, CAPTCHA aşma, Apify vb. üçüncü taraf scraper, login gerektiren rakip verisi.
Kaynak sağlığı `lib/market/sources.ts → sourceHealth()`; `scheduled` her zaman `false` (zamanlayıcı yok).

## 2. Şema (`20261007100000_market_scout_foundation`)

Yalnız yeni `market_*` nesneleri; mevcut hiçbir tabloya dokunmaz. Tekrar uygulanabilir (idempotent).

| Tablo | Rol | Append-only |
|---|---|---|
| `market_seller` / `market_seller_observation` | satıcı kimliği / gözlemi | ✔ |
| `market_watchlist` | izlenen mağazalar (çözüm: SITEMAP / URL_PARSE / UNRESOLVED; beyan edilen marka slug'ları) | — (aktif/pasif) |
| `market_product` | ürün kimliği (`first_known_at` = sistemimizin ilk gördüğü an, Trendyol'un oluşturma tarihi DEĞİL) | ✔ |
| `market_product_observation` | sitemap / manuel / lisanslı / legacy gözlemleri | ✔ |
| `market_buybox_observation` | resmi buybox (derece yalnız A, satış kolonu yok) | ✔ |
| `market_keyword` / `market_keyword_observation` | Trends ilgi endeksi (0–100) veya otomatik tamamlama listesi; hacim kolonu yok | ✔ |
| `market_sourcing_candidate` | tedarik adayı; `landed_cost_status` UNKNOWN/VERIFIED (VERIFIED kanıt ister; MANUAL_SOURCING daima UNKNOWN) | ✔ (düzeltme = `supersedes_id`) |
| `market_generated_query` | `kind = GENERATED_QUERY`; gözlem değil | ✔ |
| `market_product_match` | eşleşme sonucu + kanıt + sürüm; `LLM_ASSISTED` → derece D | ✔ |
| `market_opportunity` | fırsat; durumlar DISCOVERED / WATCHING / SOURCING_CANDIDATE / COST_VERIFICATION_REQUIRED / READY_FOR_HUMAN_REVIEW / REJECTED (BUY/ORDER yok); `cfo_product_candidate_id`, `urun_aday_sku`, `legacy_ref` | durum değişir, geçmiş olayda |
| `market_opportunity_event` | durum geçişleri (aktör + gerekçe) | ✔ |
| `market_collection_run` | toplayıcı çalıştırmaları (MANUAL / SCHEDULED / TEST) | — |

Ortak alanlar: `source`, `observed_at` (kaynakta görüldüğü an), `known_at` (sunucu `now()`), `data_grade` (A/B/C/D/UNKNOWN), `evidence jsonb`, `idempotency_key` (sha256, `ON CONFLICT DO NOTHING`).
`CHECK (observed_at <= known_at + 5 dk)`: gelecekten gözlem yok. Replay okuması `known_at <= as_of AND observed_at <= as_of` (no look-ahead).
Güvenlik: 14 tabloda RLS açık; PUBLIC/anon/authenticated yetkisi yok; `cfo_acceptance_reader` yalnız SELECT politikası; `market_append_only()` yalnız postgres/service_role.

## 3. Kod haritası

- `lib/market/sources.ts` — kaynak sözlüğü + sağlık matrisi.
- `lib/market/safe-fetch.ts` — SSRF-sertleştirilmiş dış istek: https/443, tam host allowlist (`www.trendyol.com`, `apigw.trendyol.com`, `cdn.dsmcdn.com`), IP literal/kimlik bilgisi/port reddi, bağlantı anında her DNS cevabının özel/yerel aralık kontrolü, her yönlendirme adımında yeniden doğrulama (≤3), zaman aşımı, boyut sınırı, content-type allowlist.
- `lib/market/trendyol-url.ts` — ürün/mağaza URL'si ve sitemap ayrıştırma (fetch yok).
- `lib/market/normalize.ts`, `matching.ts` (`match-v1`), `momentum.ts` (`momentum-v1`), `scoring.ts` (`fit-v1`, `opp-v1`), `sourcing-query.ts` (`template-v1`), `hunter.ts`, `image-similarity.ts` (mevcut `ProductImage.embedding` + `lib/hf-clip.ts`), `legacy-scout.ts`, `store.ts`.
- `lib/market/providers/{trendyol-buybox,trendyol-sitemap,manual,registry}.ts`.
- `lib/actions/market-scout-actions.ts` (MARKET_SCOUT_WRITE; yalnız `market_*` yazar), `app/(app)/admin/market-scout/page.tsx` (MARKET_SCOUT_READ).
- `scripts/market/{sitemap-benchmark,buybox-collect,legacy-import}.ts` — varsayılan salt-okunur/dry-run; `--apply` için `MARKET_SCOUT_DATABASE_URL` gerekir; kimlik bilgileri yazdırılmaz.

## 4. Puanlama ve eşleştirme

- **Eşleştirme `match-v1`** (deterministik): başlık 30, kategori 15, malzeme 10, ölçü 15, model/spec 15, görsel 15. EXACT_LIKELY için skor ≥85 + görsel dışı ≥2 güçlü sinyal + kapsam ≥0,55. Kategori uyuşmazlığı en fazla WEAK. **Görsel benzerlik tek başına EXACT olamaz.** Terfi edilebilen yalnız EXACT_LIKELY/SIMILAR. LLM yalnız gerekirse, sonuç derece D ve deterministik gerçek gibi saklanmaz.
- **Kategori uyumu `fit-v1`**: mevcut kategori yakınlığı 25, ürün benzerliği 20, rakip benimsemesi 15, pazar momentumu 15, tedarik uygunluğu 10, marj hazırlığı 10, lojistik 5. Başlık skoru = kazanılan puan / 100 (eksik bileşen yeniden normalize EDİLMEZ); ayrıca `observedOnlyScore`, `coverage`, derece (B ≥0,8 · C ≥0,6 · D ≥0,3 · aksi UNKNOWN). Kategori uyumu ≠ pazar fırsatı.
- **Momentum `momentum-v1`**: 60 gün pencere, ≥2 gözlem; yorum hızı, fiyat değişimi, görünen satış sinyali alt sınırı (kesin satış değil). Satış verisi yoksa UNKNOWN.
- **Fırsat `opp-v1`**: beklenen marj `null` (iniş maliyeti doğrulanmadan hesaplanmaz); sonraki adım CAPTURE_MORE_OBSERVATIONS / FIND_SOURCING_CANDIDATE / VERIFY_SUPPLIER_AND_GTIP / HUMAN_REVIEW. READY_FOR_HUMAN_REVIEW yalnız doğrulanmış iniş maliyetiyle. Otomatik terfi yok.
- Akış (gelecek): Fırsat → İNSAN İNCELEMESİ → onaylı tedarik → `cfo_product_candidate` / `urun_aday` → doğrulama → Decision Memory → Sermaye Tahsisi.

## 5. Sitemap ölçümü (2026-10-06, salt HEAD/GET, throttle'lı)

- Ürün sitemap'i: **333 dosya**, ~24,15 bin URL/dosya (~8,0 M URL), ham **13,89 GB** (309 dosya ölçüldü), gzip ~5,77 MB/dosya → **~1,9 GB tam geçiş**.
- İndirme 1,5–2 sn/dosya (aykırı 33–68 sn). ~3 istek/sn'de 429 (333 HEAD'in 24'ü) → 1,5 sn aralık + Retry-After geri çekilme.
- Ürün ID'leri dosyalara düzgün dağılmış ve sırasız → **ID ile dosya-düzeyi artımlı yöntem yok**; yeni ürün tespiti tam geçiş ister.
- Her dosyada ETag + Last-Modified; `If-None-Match`/`If-Modified-Since` → 304 çalışıyor; byte range destekleniyor.
- Tüm dosyalar günlük ~16:39–16:41 UTC yeniden üretiliyor. **24 saatlik ETag değişim oranı henüz ölçülmedi.**
- ALFAS ile ilgili ~200 URL/dosya (marka/anahtar kelime filtresi). Mağaza sitemap'i: 5.264 mağaza, sayısal ID.
- Karar: güvenilir artımlı yöntem kanıtlanmadığı için **sitemap toplayıcısı etkin değil**. Sağlayıcı hazır; ETag değişimi ölçülünce yeniden değerlendirilir.

## 6. Buybox

`POST https://apigw.trendyol.com/integration/product/sellers/{sellerId}/products/buybox-information`, gövde `{"barcodes":[≤10]}`, `storeFrontCode` başlığı, sınır 1000/dk.
~130 aktif barkod → 13 istek/gün (250 ms aralık). Saklanan: barkod, observed_at, our_buybox_rank, buybox_price, multiple_sellers, second/third price, derece A.
Bu PR'de gerçek çağrı yapılmadı (üretim kimlik bilgileri okunmadı); örnek yalnız fixture/DEMO. Gerçek ilk çalıştırma kullanıcı onayı + storeFrontCode doğrulaması ister.

## 7. Eski scout tabloları

`candidates`, `signals_daily`, `scores`, `decisions`, `candidate_board` **silinmez/deprecate edilmez/DROP edilmez**. `lib/market/legacy-scout.ts` yalnız SELECT okur ve eşler (`legacy-v1`):
- 200 aday: `rejected` 107 → REJECTED, `saved` 93 → WATCHING (eski `buy` → COST_VERIFICATION_REQUIRED, üretimde yok).
- 3 insan kararı (hansgrohe, reddedilmiş) → `LEGACY_HUMAN_DECISION` olayları, notlar aynen.
- `legacy_ref`: `legacy_candidate_id`, `legacy_writer: "UNKNOWN"`, skorlar, sinyaller, karar ID'leri. İçe aktarım idempotent (`legacy_candidate_id` tekil indeks).

## 8. İşletme maliyeti

- Buybox: ~13 istek/gün, ücretsiz (Seller API), saniyeler.
- Sitemap tam geçiş: ~1,9 GB gzip indirme, throttle ile 10–20 dk; koşullu GET kontrolü (333 × 304) birkaç dakika ve ihmal edilebilir bant.
- LLM: bu PR'de kullanılmıyor (sorgu üretici şablon tabanlı). Görsel gömme mevcut HF CLIP yolu.

## 9. Çalıştırıcı önerisi (ölçüme göre)

- Buybox: GitHub Actions (günlük, kısa, mevcut WhatsApp cron deseniyle aynı) — onaydan sonra.
- Sitemap: GitHub Actions 6 saat sınırına sığar ama ~1,9 GB/geçiş + 429 riski nedeniyle Railway worker daha uygun; ETag değişimi ölçülmeden karar verilmez.
- Bu PR'de üretim zamanlayıcısı **yok**.

## 10. Yayına alma adımları (her biri ayrı onay)

1. Migration onayı → üretime uygula → `_prisma_migrations` kaydı + baseline yenileme.
2. Legacy içe aktarım: `scripts/market/legacy-import.ts` dry-run → sonuç incelemesi → `--apply`.
3. `MARKET_SCOUT_TRENDYOL_STOREFRONT_CODE` doğrula → tek manuel buybox çalıştırması (`scripts/market/buybox-collect.ts`) → sağlık AVAILABLE.
4. Sitemap ETag değişimini 24–72 saat ölç (yalnız HEAD/304) → artımlı strateji kararı.
5. Çalıştırıcı kararı (GitHub Actions / Railway) → zamanlama.
6. Google Trends alpha erişimi gelirse sağlayıcıyı bağla; lisanslı sağlayıcı için hukuki inceleme.
