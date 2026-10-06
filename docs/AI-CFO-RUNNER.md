# AI CFO Runner (V1 yeniden inşası adım 4/9 + V2 Goal Engine)

Model çağıran katmanın orkestrasyonu. Adım 5 ile zamanlama + `/admin/ai-cfo` bağlandı (aşağıda); bütün bayraklar varsayılan kapalı, kapalıyken runner ilk satırda `disabled` döner ve hiçbir şey yazmaz.
`cfo_run`/`cfo_insight`/`cfo_usage` tabloları (`20261005190000_ai_cfo_v1`) üretimde **yok** — uygulanması adım 8'dir ve ayrı onay ister.

## Akış (`lib/cfo-agent/runner.ts`)
1. `AI_CFO_MONITOR_ENABLED` kapalıysa hiçbir şey yazılmaz (`disabled`). Sabah özeti 09:30 İstanbul'dan önce çalışmaz.
2. Oturum düzeyinde advisory kilit (`AI_CFO_LOCK_DATABASE_URL`, session pooler; transaction pooler 6543 reddedilir) → eşzamanlı çalışma `locked`.
3. Dönem anahtarı (`monitor:YYYY-MM-DDTHH` / `morning:YYYY-MM-DD`) tekil → tekrar `duplicate`.
4. Deterministik girdi: `buildCfoAgentSnapshot` + `detectCfoAnomalies` + **Goal Engine** (`fm_memory_goal`, salt-okunur; `goal-anomalies.ts`).
5. Açık iş kaydı (soru/ölü stok/stok sıçraması) olan anomaly modele gitmez; 72 saat soğuma (`shouldReopen` yalnız etki ≥%50 kötüleşirse açar).
6. Kapılar sırasıyla: anomaly yok → `no_actionable_anomaly`; `AI_CFO_ENABLED` kapalı → `ai_disabled`; release kapıları (CI build + canlı kabul + shadow week) → `release_gates_pending`; anahtar/sağlayıcı yok → `provider_unavailable`; günlük çağrı/aylık bütçe → `blocked_by_*`; bayt/token sınırı → `blocked_by_input_*` (ücretli çağrıdan **önce**).
7. Çağrı öncesi en kötü durum maliyet rezervasyonu (`cfo_usage`), sonrası gerçek token/maliyet.
8. Çıktı denetimi (`validate-ai-output.ts`): JSON şeması (strict), anomaly/severity/category değişmez, kanıt kimliği uydurulamaz, **metindeki her sayı atıf yapılan kanıtta geçmeli** (TR/EN sayı biçimi toleranslı); C/D kalite kanıt → "TAHMİNİ" ve güven en çok `medium`. Finansal etki modelden değil koddan.
9. Hata: yalnız sabit kod kaydedilir (SDK gövdesi, URL, kimlik bilgisi, kaynak satırı yok); kilit her durumda bırakılır.

## Goal Engine entegrasyonu (V2)
`OFF_TRACK`/`AT_RISK`/`NOT_MET` + kalite A–D + `as_of` ≤ 2 gün → anomaly (`goal:<key>`, kategori ciro=`sales`, diğerleri=`cash`; taban ihlali `critical`).
Kanıt = Goal Engine'in kendi değerleri (gözlenen, hedef, ilerleme, açık, mevcut/gereken hız, projeksiyon, durum/bayraklar); bilinmeyen değer kanıta girmez (0 yazılmaz).
`UNKNOWN`, kalite `U` ve bayat gözlem modele gitmez.

## Zamanlama ve kontrol merkezi (adım 5)
- **Vercel Hobby:** yeni cron slotu yok. Monitor, mevcut günlük `xml-sync` (05:00 TR) ve `trendyol-sync` (09:00 TR) cron'larının `after()` işinde **CFO döngüsünden sonra** çalışır (`scheduleCfoCycle(trigger, { aiMonitor: true })`) → Goal Engine taze. Saatlik dönem anahtarı + oturum kilidi çift tetiklemeyi önler.
- **Sabah özeti** 09:30 İstanbul kuralı yüzünden mevcut cron saatlerinde otomatik çalışmaz: `/api/cron/ai-cfo-morning` (CRON_SECRET, harici zamanlayıcı) veya ekrandaki elle çalıştırma. `/api/cron/ai-cfo-monitor` da aynı şekilde mevcut.
- **`/admin/ai-cfo`** (CFO_READ + EXECUTIVE_READ; menü: CFO → AI CFO): kapı durumu (tablolar, monitor, AI, yayın kapıları, sağlayıcı+anahtar *yalnız var/yok*, fiyat/kur, oturum kilidi), model/limitler, hedefler (hangisinin modele gideceği), son snapshot, deterministik uyarılar, içgörüler + kanıt, aylık kullanım/tasarruf. Tablolar üretimde yokken (`to_regclass`) sorgu hatası yerine `installed:false` açıklaması.
- **Elle çalıştırma** `POST /api/admin/ai-cfo/runner` `{action:"monitor"|"morning"}`: ADMIN + CFO_READ + EXECUTIVE_READ + CFO_WRITE, aynı origin, yalnız production, gövde ≤1 KB (beyan + gerçek bayt), zod strict. Kapı saf fonksiyon `lib/cfo-agent/runner-request.ts` (sıra: yetki → origin → ortam → boyut → şema); gövde yalnız yetkili istekte okunur. Runner kendi kapılarını uygular.
- Adım 8 notu: cron `after()` işi `maxDuration=300` içinde senkron + CFO döngüsü + monitor'ü paylaşır; sağlayıcı zaman aşımı bu bütçe içinde kalmalı (yarıda kesilen çalışma `running` kalır, sonraki saat yeni dönem anahtarıyla devam eder). Shadow week'te gözlenecek.

## Testler
- `__tests__/ai-cfo-runner.test.ts` — orkestrasyon (enjekte store/kilit/sağlayıcı): kapılar, çağrısız yollar, bütçe/limit, token kapısı, zaman aşımı, soğuma, açık kuyruk, idempotency/eşzamanlılık, sabah saati, hedef anomaly'leri, çıktı denetimi.
- `__tests__/ai-cfo-runner-route.test.ts` — elle çalıştırma kapısı: yetki önce, aynı origin (eksik/yabancı/şema farkı), preview/development reddi, bayt sınırı (çok baytlı karakter), strict şema.
- `__tests__/ai-cfo-access.test.ts` — reader bağlantı seçenekleri (yalnız session pooler + reader rolü, yer tutucu parola reddi, TLS kapatılamaz) ve sabit hata etiketleri (sürücü metni dışarı çıkmaz). Canlı katalog kontrolü `cfo-reader-security`.
- `__tests__/ai-cfo-migration-security.test.ts` — adım 8 dağıtım yolu: üretim kopyası + **üretimin varsayılan ACL'i** (public/postgres → yalnız postgres+service_role; 2026-10-06 katalogdan) üzerinde `ai_cfo_v1`: RLS deny-all, politika 0, anon/authenticated/PUBLIC/reader yetkisi 0, service_role erişimi var, iki kez uygulanabilir; operatör kontrol betiği önce/sonra durumunu doğru raporluyor; negatif kontrol (anon'a veren varsayılan ACL yakalanır).
- `scripts/check-cfo-acceptance-route.mjs` (gerçek `next build` + `next start`): `ai-cfo-monitor`/`ai-cfo-morning` secret'sız/yanlış secret 401, doğru secret + bayraklar kapalı → 200 `{status:"disabled"}` **DB'ye dokunmadan** (build-only DB yok); runner POST yetkisiz 401 no-store, GET 405; `/admin/ai-cfo` oturumsuz → `/login`.
- `__tests__/ai-cfo-store.test.ts` — gerçek Prisma + PostgreSQL (PGlite): baseline + üretim migration'ları + **bekleyen** `ai_cfo_v1` (adım 8'in dağıtım yolu); tekil dönem anahtarı, kullanım toplamları, CHECK kısıtları, soğuma hatırlama; `loadCfoControlCenter` adım 8 öncesi `installed:false`, sonrası çalışma/içgörü/uyarı/kullanım.

## Sonraki adımlar (her biri ayrı onay)
~~5 cron + `/admin/ai-cfo` UI~~ · ~~6 test/CI~~ (tamam) tamamlama · 7 kargo/SET/nakit-projeksiyon kolon eşlemesi · 8 `ai_cfo_v1` üretime + shadow week + AI'ı açma.
Adım 8 notu: yeni tablolar üretimde `postgres` varsayılan yetkileriyle anon'a kapalı oluşur (katalog 2026-10-06: public/postgres varsayılan ACL'i yalnız postgres+service_role). Uygulama **`postgres` rolüyle** yapılmalı (supabase_admin'in varsayılanı anon'a verir). Önce ve sonra `scripts/ai-cfo-migration-check.sql` (salt-okunur) çalıştırılır: önce `role_ok`, `anon_free`, 3 tablo yok, migration kaydı yok (2026-10-06 doğrulandı); sonra 3 tablo exists, RLS açık, politika 0, `exposed=false`, `service_role_ok=true`, checksum = sha256(migration.sql).
Model: `AI_CFO_MODEL` varsayılanı `claude-sonnet-4-6` (adım 3'te belirlendi). Daha yeni bir modele geçilirse (ör. düşünmesi kapatılamayan modeller) `AI_CFO_MAX_OUTPUT_TOKENS` üst sınırı (800) yeniden değerlendirilmeli — adım 8 kararı.
