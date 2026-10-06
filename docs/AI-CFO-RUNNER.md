# AI CFO Runner (V1 yeniden inşası adım 4/9 + V2 Goal Engine)

Model çağıran katmanın orkestrasyonu. **Hiçbir route/cron'dan çağrılmaz** (cron + `/admin/ai-cfo` = adım 5); bütün bayraklar varsayılan kapalı.
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

## Testler
- `__tests__/ai-cfo-runner.test.ts` — orkestrasyon (enjekte store/kilit/sağlayıcı): kapılar, çağrısız yollar, bütçe/limit, token kapısı, zaman aşımı, soğuma, açık kuyruk, idempotency/eşzamanlılık, sabah saati, hedef anomaly'leri, çıktı denetimi.
- `__tests__/ai-cfo-store.test.ts` — gerçek Prisma + PostgreSQL (PGlite): baseline + üretim migration'ları + **bekleyen** `ai_cfo_v1` (adım 8'in dağıtım yolu); tekil dönem anahtarı, kullanım toplamları, CHECK kısıtları, soğuma hatırlama.

## Sonraki adımlar (her biri ayrı onay)
5 cron + `/admin/ai-cfo` UI · 6 test/CI tamamlama · 7 kargo/SET/nakit-projeksiyon kolon eşlemesi · 8 `ai_cfo_v1` üretime + shadow week + AI'ı açma.
Adım 8 notu: yeni tablolar üretimde `postgres` varsayılan yetkileriyle anon'a kapalı oluşur (#152); `security-defense-in-depth` CI kapısı migration üretimde kabul edildiğinde bunu ayrıca doğrular.
Model: `AI_CFO_MODEL` varsayılanı `claude-sonnet-4-6` (adım 3'te belirlendi). Daha yeni bir modele geçilirse (ör. düşünmesi kapatılamayan modeller) `AI_CFO_MAX_OUTPUT_TOKENS` üst sınırı (800) yeniden değerlendirilmeli — adım 8 kararı.
