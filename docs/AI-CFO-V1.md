# AI CFO V1 — kurulum ve sınırlar

Mevcut CFO tabloları, SQL motoru ve dashboard hesapları değiştirilmez. Yeni katman yalnız işletme verilerini okur ve `cfo_run`, `cfo_insight`, `cfo_usage` yazar. Finansal sözleşme: [AI-CFO-FINANCIAL-CONTRACT.md](AI-CFO-FINANCIAL-CONTRACT.md).

## Varsayılanlar

`AI_CFO_ENABLED=false`, `AI_CFO_MONITOR_ENABLED=false`, `AI_CFO_PROVIDER=disabled`. Credential eksikliği uygulamayı çökertmez. Monitor açılıp AI kapalı bırakılabilir. `/admin/ai-cfo` CFO_READ ve EXECUTIVE_READ ister. Cron endpointleri mevcut authorizeCron kullanır. V1 push göndermez; uyarılar Control Center'da gösterilir.

## Production öncesi zorunlu doğrulama

1. Additive `20261003000000_ai_cfo_v1` migration'ını staging'de, ardından normal migration süreciyle uygulayın. Bu çalışma production migration veya deploy yapmaz. Üç yeni snake_case tabloda RLS açıktır; anon/authenticated erişimi kaldırılmıştır. Sunucu DB rolünün gerekli erişimini doğrulayın.
2. Canlı Supabase kaynaklarının kolonlarını ve view tanımlarını CFO ile inceleyin. Repo tüm canlı SQL tanımlarını içermiyor. `AI_CFO_SOURCE_COLUMNS_JSON` yalnız allowlist kaynaklarda kolon adlarını eşler; SQL ifadeleri kabul edilmez. Beklenen normalize kolonlar `lib/cfo-agent/sources.ts` ve snapshot'ın `catalog.require/rows` çağrılarındadır. Örnek: `{"cfo_kargo_tarife":{"min_try":"gercek_alt_sinir","max_try":"gercek_ust_sinir","kargo_try":"gercek_kargo"}}`. Eşleme eksikse değer unknown olur, finansal veri tahmin edilmez.
3. `cfo_satis_birim_duz` adet_duz/tutar_duz grain'i, guven, SKU+kanal komisyon tabanı ve `cfo_satis_siparis` order grain'ini doğruladıktan sonra `AI_CFO_CANONICAL_SALES_VALIDATED=true` yapın. AMAZON_FBA bu canonical kaynağa dahil olmalıdır; FBA deposu varlık toplamına eklenmez.
4. Gerçekleşmiş iade kolonunun ve reklam maliyetinin kapsamını doğrulayın. `AI_CFO_GROSS_INCLUDES_REFUNDS=true|false` yalnız canonical brütün iade dahil olup olmadığı kesinleşince girilir. Bu alanlar bilinmiyorsa contribution null kalır. Aktif ürünün bugünkü maliyeti geçmiş satışı maliyetlerken TAHMİNİ'dir; set kârı yalnız cfo_set_fiyat'tan alınır.
5. `AI_CFO_PROJECTION_POSITION_COLUMN` mevcut 120 günlük motor çıktısındaki gerçek net nakit pozisyonu kolonuna bağlanmalıdır. Kullanılabilir limit nakit değildir. Amaca bağlı limit ayrı taşınır. SQL fonksiyonları yalnız STABLE/IMMUTABLE ise kısa READ ONLY transaction içinde çağrılır; VOLATILE tanımlar yürütülmez. Kaynak yeterliliği/kart/gümrük/denetim çıktılarında V1 serbest metin yerine kayıt sayısını taşır; bunlardan yeni nakit rakamı türetmez.
6. `AI_CFO_LOCK_DATABASE_URL` için direct veya **session-mode** PostgreSQL bağlantısı ve `AI_CFO_LOCK_SESSION_MODE=true` ayarlayın. Transaction pool (6543) kabul edilmez. Advisory lock tek fiziksel pg bağlantısında alınır/bırakılır; LLM sırasında transaction açık değildir.
7. Deterministic monitor'u staging'de açıp snapshot, freshness ve mevcut üç kuyrukla dedup davranışını CFO'ya doğrulatın. AI yalnız canlı 12/12 kabul, migration, 7 günlük gölge hafta ve CFO onayı sonrasında açılabilir.

## AI ve maliyet

Anthropic V1 adapter: `AI_CFO_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `AI_CFO_MODEL=claude-sonnet-4-6`. Model config ile değişebilir; diğer provider'lar arayüzü implemente etmelidir. Anomali taraması deterministiktir, Haiku için ikinci çağrı yapılmaz. Opus haftalık/aylık analiz V1 kapsamında değildir. System prompt ephemeral caching kullanır.

Zorunlu billing config: `AI_CFO_INPUT_PRICE_USD_PER_MILLION`, `AI_CFO_OUTPUT_PRICE_USD_PER_MILLION`, `AI_CFO_BILLING_USD_TRY`. Güncel fiyat/kur operatörce doğrulanmalıdır; yoksa AI engellenir. Cache tokenları ayrıca kaydedilir. Timeout'ta bilinmeyen fatura en kötü durum rezerviyle bütçede tutulur.

Sınırlar: `AI_CFO_MAX_CALLS_PER_DAY=6`, `AI_CFO_MAX_INPUT_TOKENS_PER_RUN=4500` (en fazla 8000), `AI_CFO_MAX_OUTPUT_TOKENS=800`, `AI_CFO_MONTHLY_BUDGET_TRY=3000`. Önce byte sınırı, sonra provider'ın count_tokens sonucu kullanılır. En fazla 8 anomali, 5 ilgili memory, 3 insight; ham order/customer/log gönderilmez. Budget aşımı usage'a blocked_by_budget kaydedilir; deterministic monitor devam eder. Engellenen çağrı ve tahmini TL tasarrufu run'da tutulur.

## Zamanlama

Mevcut repo deployment notlarında Vercel Hobby günlük cron kapasitesi vardır; vercel.json'a saatlik cron eklenmedi. V1 için seçilen alternatif **Supabase pg_cron + pg_net**. Operatör pg_cron/pg_net'i etkinleştirip uygulama URL ve CRON_SECRET'i Supabase Vault'ta saklamalı, Vault'tan Authorization Bearer başlığı oluşturup net.http_get ile aşağıdaki endpointleri çağırmalıdır. Secret SQL migration'a veya repository'ye yazılmaz.

- Monitor `/api/cron/ai-cfo-monitor`: UTC `0 * * * *`.
- Morning `/api/cron/ai-cfo-morning`: UTC `30 6 * * *` = İstanbul 09:30.

Morning daha erken çağrılırsa çalışmaz. İstanbul gün/saat idempotency anahtarları ve shared advisory lock her iki endpointte geçerlidir. pg_net HTTP yanıtlarını ve başarısız job'ları mevcut operasyon izlemesine bağlayın. Retry aynı dönem için ikinci AI faturası üretmez; başarısız dönemi manuel DB müdahalesiyle tekrar açmadan önce usage rezervini inceleyin.

## Sinyaller ve dürüst sınırlar

Nakit kritik −3m, iteratif fiyat tabanı, ölü fiyat bandı, düşük fiyat sıfır-komisyon testi, eşit hafta günü ciro sapması, marj düşüşü, SKU/kanal negatif katkı, ihtiyatlı stockout, mevcut ölü stok, yeterli örneklem iade ve procurement. Bayat/eksik finansal veri DATA_STALE/DATA_QUALITY üretir. 72 saat cooldown; TL etki %50 kötüleşirse yeniden açılır. Mevcut dead-stock, stock-spike ve açık question kuyruğu aynı bulguyu engeller. Eksik kuyruk verisinde AI fail-closed davranır.

Mevcut stok hızı ihtiyatlı XML motorundan gelir; XML düşüşü satış olarak yazılmaz. Snapshot ürün listesi 12, ölü stok listesi 5 öğeye sınırlandırılmıştır; tüm katalog için eksiksiz öneri garantisi yoktur. FBA envanteri bilinmiyor olarak işaretlenir. Canlı finansal doğruluk ve provider faturalaması bu çalışma ortamında doğrulanmamıştır.

## Doğrulama

`npm run check:cfo-agent`: PGlite gerçek PostgreSQL sorguları/migration ile 36 kontrol. `npx tsc --noEmit`, hedefli eslint ve production build ayrıca çalıştırılır. Provider timeout/concurrency/bütçe testleri kontrollü fake provider/store kullanır; canlı API çağrısı veya production DB yazımı yapılmaz.

## Kabul kapıları — 03.10.2026 güncellemesi

Sıra: kalıcı kod yedeği/push → CI build+typecheck → canlı 12/12 kabul → additive migration → 7 gün deterministic AÇIK / AI KAPALI gölge çalışma → CFO yanlış alarm incelemesi → AI bütçeyle açılış. Bu çalışma production'a geçiş onayı değildir.

Üç bağımsız manuel attestasyon yoksa runner release_gates_pending kaydeder ve AI çağırmaz:
`AI_CFO_CI_BUILD_VERIFIED=true`, `AI_CFO_LIVE_ACCEPTANCE_VERIFIED=true`, `AI_CFO_SHADOW_WEEK_APPROVED=true`. Bunlar kendiliğinden set edilmez. Yalnız kanıtlar ve CFO onayı arşivlendikten sonra operatör ayarlar. AI_CFO_ENABLED tek başına yeterli değildir. Staging test fixture'ları bu attestasyonları test için inject eder; canlı kapıları geçmez.

### Canlı kabul — migration'dan önce

Environment'a (sohbete veya log'a değil) `AI_CFO_READ_DATABASE_URL` read-only role bağlantısı, doğrulanmış kolon eşlemeleri, canonical flag ve `AI_CFO_ACCEPTANCE_AS_OF` referans snapshot içindeki kesin 03.10.2026 zamanını girin. `npm run check:cfo-acceptance` 12 sabit referansı snapshot üzerinden kontrol eder, `/tmp/ai-cfo-acceptance.json` dosyasına gerçek/ beklenen değer ve snapshotHash yazar. `AI_CFO_ACCEPTANCE_REPORT_PATH` ile kalıcı özel hedef seçin. 12/12 dışındaki sonuç exit 1. DB READ ONLY REPEATABLE READ; run/usage oluşturmaz, migration/flag değiştirmez, LLM çağırmaz. Güncel ledger tarihsel snapshot değilse referansların değişmiş olması test başarısı sayılmaz.

Nakit görünümü kolonları: nakit_try, bos_kmh_try; purpose amac_kmh mevcut doğrulanmış kolona map edilir. Kart toplamı cfo_credit_card.totalDebtTry ve 6 aktif kart şartıyla kontrol edilir. Komisyon 120 günlük robust weighted ölçümdür; XML adet30 ile canonical 30 günlük adet birlikte taşınır. Kabul komutu snapshot ürün limiti olmadan çalışır.

### Gölge hafta

`AI_CFO_MONITOR_ENABLED=true`, `AI_CFO_ENABLED=false`. `AI_CFO_SHADOW_START=YYYY-MM-DD` ve read-only bağlantı ile `npm run check:cfo-shadow` çalıştırın. Migration bu adımdan önce uygulanmış olmalı. Rapor 7 İstanbul günü, her gün 24 farklı saatlik monitor slotu, başarı durumları, sıfır billable/reserved AI çağrısı ve günlük benzersiz fingerprint'leri kontrol eder. Gecikmeli/eksik cron günü kapıyı geçmez.

CFO rapordaki bulguları ayrı özel JSON dosyada şöyle işaretler: `[{"date":"2026-10-03","fingerprint":"rapordaki-deger","verdict":"real"}]` veya `false_alarm`. Dosyayı `AI_CFO_SHADOW_REVIEWS_PATH` ile bağlayın. İncelenmemiş/çelişkili bulgu, herhangi bir gün >3 yanlış alarm, AI çağrısı veya tamamlanmamış 7 gün exit 1 üretir. `AI_CFO_SHADOW_REPORT_PATH` kalıcı özel rapor hedefidir. Script onay bayrağı açmaz; CFO kararını operatör uygular.

### CI ve yedek

`.github/workflows/ai-cfo-validation.yml` PR/feature branch push/manual tetikte npm ci, Prisma validate, typecheck, CFO/RBAC/Entegra testleri, lint ve production build çalıştırır. Validation/build job'ına canlı credential verilmez; deploy adımı yoktur. Ayrı `live_access` job'ı yalnız trusted `feat/ai-cfo-v1` push'larında salt okunur secret kullanır. Mevcut modül import/prerender gereksinimleri için yalnız localhost `DATABASE_URL`/`DIRECT_URL` ve her job'da yeni üretilen, loglarda maskelenen `SESSION_SECRET` kullanılır. [03.10.2026 CI](https://github.com/Alfasoylu/iotomasyon/actions/runs/37131301344) build, typecheck ve tüm kontrolleri geçti (`66b17dc`). GitHub push için repository Contents Read & Write gerekir; yeni workflow dosyasını push etmek için fine-grained PAT'de ilgili repo Workflows Write izni de gerekebilir. Token yalnız environment'a konur, git remote URL'e/sohbete/log'a yazılmaz.

Kod `feat/ai-cfo-v1`, ilk patch ayrıca `handoff/ai-cfo-v1` branch'inde saklanır. Patch/bundle kullanıcının doğrulanmış [özel Drive klasörüne](https://drive.google.com/drive/folders/1NBGhAOtSdnkvZv82bWkMpRST4Pd4uoBo) yedeklendi. Sandbox dosyası kalıcı yedek sayılmaz. Tam [teslim raporu](AI-CFO-HANDOFF.md).

### Mobil kurulum — GitHub Secret bağlantı kontrolü

Repository Settings → Secrets and variables → Actions altında `AI_CFO_READ_DATABASE_URL` saklanır. Değer session pooler URI'sidir: yalnız `cfo_acceptance_reader.PROJECT_REF`, port 5432 ve postgres database kabul edilir. URI/şifre sohbete veya repository'ye yazılmaz.

`live_access`, validation başarılı olduktan sonra yalnız `Alfasoylu/iotomasyon` feature branch push'unda çalışır; PR/fork/main job'larına secret verilmez. Credential yalnız connection-check adımının environment'ındadır; npm install/build sırasında mevcut değildir. CLI TLS sertifika doğrulamasını zorunlu tutar; kullanıcı rolünü, read-only default/transaction'ı, kaynak okuma/yazma yetkilerini ve Product RLS görünürlüğünü kontrol eder. Yalnız allowlist kolon/fonksiyon metadata'sı loglanır; ham URI, parola, driver hata mesajı, sipariş/müşteri/finansal satırlar gönderilmez.

Bu kontrol 12/12 finansal kabul değildir; migration/flag/provider çalıştırmaz. Bağlantıdan sonra gerçek kolon/grain anlamı ve referans timestamp ayrıca doğrulanır. Kabul tamamlandığında geçici erişim secret'ını kaldırma veya şifreyi döndürme operatörün normal credential yönetimine tabidir.

#### Reader'a özel RLS okuma politikaları

[03.10.2026 canlı bağlantı kontrolü](https://github.com/Alfasoylu/iotomasyon/actions/runs/37138690210/job/111251706721) başarılı; Product satırları reader'a RLS nedeniyle görünmüyor. Boş sonuç finansal olarak sıfır stok/maliyet demek değildir. Supabase SQL Editor'de yönetici rolüyle [manuel reader RLS sorgusu](../scripts/ai-cfo-reader-rls.sql) çalıştırılır. Sorguda değiştirilecek şifre/placeholder yoktur; tekrar çalıştırılabilir. Mevcut SELECT yetkili, RLS açık public CFO tablolarına ve yedi e-ticaret kaynağına yalnız `TO cfo_acceptance_reader FOR SELECT USING (true)` ekler. `cfo_run/insight/usage`, PDKS, SELECT yetkisiz kaynaklar ve mevcut politikalar değişmez. RLS devre dışı bırakılmaz, BYPASSRLS/yazma yetkisi verilmez. Farklı aynı adlı politika veya güvensiz rol/yazma yetkisi varsa tüm transaction geri alınır. Mevcut restrictive politikalar varsa aynen kalır; sorgu bunları aşmaz.

Bu SQL bir Prisma migration değildir ve workflow tarafından otomatik yürütülmez. Operatör çalıştırdıktan sonra yalnız `live_access` kontrolü yeniden çalıştırılıp gerçek satır görünürlüğü doğrulanır. Sonraki kapı gerçek kaynak eşlemeleriyle 12 finansal kabul testidir; AI flag'leri kapalı kalır.

#### Supabase TLS trust

GitHub runner'ın varsayılan CA listesi Supabase Root 2021 CA'yı içermeyebilir. `lib/cfo-agent/certs/supabase-root-2021.crt` yalnız connection-check adımında NODE_EXTRA_CA_CERTS ile eklenir; sertifika/hostname doğrulaması açık kalır. Sertifika public CA'dır, private key/credential değildir. Resmi Supabase dashboard source: `apps/studio/hooks/custom-content/custom-content.json`, `ssl:certificate_url`; download: https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt. PEM SHA256: `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`; sertifika fingerprint SHA256 `807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA`; geçerlilik 26.04.2031'e kadar. Rotation normal code review ile yapılır; TLS doğrulaması devre dışı bırakılmaz.
