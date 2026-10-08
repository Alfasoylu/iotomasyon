---
last_updated: 2026-10-08 23:45 TR
current_main_commit: 422a6db
current_phase: "Faz 0 — İlk tam sistem denetimi"
current_score: 48/100
next_action: "CFO-001 (RF-20261008-001 CRITICAL'ı kapatır)"
---

# CFO RED FLAGS (append-only)

Kural: kayıtlar silinmez; çözülünce `status: RESOLVED (tarih, PR)` yazılır. Yeni göreve başlarken açık CRITICAL/HIGH'lar okunur.
Severity: CRITICAL · HIGH · MEDIUM · LOW · INFO.

**Açık özet (2026-10-08):** CRITICAL 1 · HIGH 9 · MEDIUM 10 · LOW 4 · toplam 24.

---

## 2026-10-08 — İlk tam sistem denetimi (bağımsız dış denetçi bakışı)

### RF-20261008-001 — Net sermaye üç farklı sayı; hedef ile sayfa farklı ölçüyor
- **date:** 2026-10-08 · **commit:** 422a6db · **severity:** CRITICAL · **status:** OPEN
- **finding:** Stratejik hedef G2 (net sermaye ≥ 300k USD) tutarlı ölçülmüyor. Goal Engine `wealth_usd` DAR net sermayeyi (`cfo_snapshot.netWorthTry` → `fm_balance_day.net_capital_try`) TCMB kuruyla ölçüyor; `/cfo` servet kartı GENİŞ `cfo_servet.servet_try`'yi snapshot kuruyla gösteriyor; snapshot "wideWorth" üçüncü değer.
- **evidence:** üretim 08.10: snapshot netWorthTry 2.557.101 · cfo_servet.servet_try 6.266.139 (servet_usd 127.932) · wideWorthTry 6.315.435; stok üç ayrı değerde (cfo_stok_deger maliyet 4.316.406 · servet NRV 7.237.906 · snapshot stockTry 14.496.240). Kod: `lib/cfo/wealth.ts:119-129`, `prisma/migrations/20261005250000*:85-86`, `wealth-section.tsx:71-94`.
- **economic_risk:** Hedef ilerlemesi %17,6 mı %42,6 mı belirsiz; sermaye tahsisi, borç kapısı ve strateji yanlış tabanda. 2,4× fark.
- **affected_component:** Goal Engine, `cfo_servet*`, `cfo_snapshot` (2 yazar), `/cfo`, `/cfo/kararlar` atfı, `/admin/ai-cfo`.
- **recommended_fix:** CFO-001 — tek net sermaye sözleşmesi (dar/geniş açık adlı, bileşenli, stok esası kararlı), tek snapshot yazarı, tek kur; Goal + sayfa + motor aynı kaynaktan; eşlik testi.

### RF-20261008-002 — Borç hedefi eski (5M TL) ve borç beş ayrı formülle hesaplanıyor
- **date:** 2026-10-08 · **commit:** 422a6db · **severity:** HIGH · **status:** OPEN
- **finding:** Yeni hedef "toplam borç < 100.000 USD"; sistem `debt_below_5m_try` (5.000.000 TL, SQL `fm_goal_sync` + TS `debt-policy.ts:2` sabit) ölçüyor. Borç tanımları: engine.ts:267 (KMH + kart + earlyPayoff), `cfo_servet.borc` (kredi remaining + kart total + yoldaki mal ödenmemiş vergi; **KMH yok**), capital-efficiency (kart yalnız devreden), decision-memory (`card_kmh_try`), snapshot. Yoldaki malın 3,79M ödenmemiş vergi/navlunu borçta; şahsi kartlar dahil.
- **evidence:** üretim: Goal debt 9.283.200 TL; servet borc 9.676.976; yoldaki mal ödenmemiş 3.787.072.
- **economic_risk:** Yeni sipariş kapısı (5M) yanlış tanım ve eşikle açılıp kapanıyor; borç hedefi açığı 13k–91k USD arasında belirsiz.
- **affected_component:** `fm_goal`, `debt-policy.ts`, `debt-forecast.ts`, `cfo_servet`, `/cfo/borclar`.
- **recommended_fix:** CFO-002 — bileşenli tek borç tanımı (kredi, kart, kullanılan KMH, yoldaki mal ayrı satır; şirket/şahsi ayrı), `fm_goal` v2 hedef <100k USD (stratejik kurla), sabitler tek konfigürasyona.

### RF-20261008-003 — USD/TRY dört kaynaktan; yedek sabitler (1/45/48,5) ve kendini besleyen döngü
- **date:** 2026-10-08 · **commit:** 422a6db · **severity:** HIGH · **status:** OPEN
- **finding:** Goal Engine TCMB `fm_memory_fx_monthly` (48,5585); `cfo_servet.kur` = son snapshot kuru (48,98); `cfo_settings.usdTryRate` (49,1976) `/cfo` rozeti, gümrük, `cfo_ciro_hedef`; `cfo_kur` (48,98) revenue-levers; `lib/fx/current.ts` "tek kaynak" hiçbir CFO modülünde kullanılmıyor. Yedekler: engine.ts:222 `1`, revenue-levers 45, SQL 48,5. TS snapshot `usdTryRate`'i `cfo_servet.kur`'dan (önceki snapshot) yazıyor → kur donabilir.
- **evidence:** üretim üç kur değeri; `cfo-actions.ts:318,332`; baseline:5760, 6376-6383.
- **economic_risk:** Aynı USD hedefi sayfaya göre %1,3 farklı; yedek 1/45 yanlış kur ile sessiz hesap.
- **affected_component:** tüm USD dönüşümleri.
- **recommended_fix:** CFO-003 — stratejik kur tek kaynak (karar: TCMB aylık mı, ay başı ölçüm `cfo_kur` mu), sabit yedekler → UNKNOWN, döngü kırılır.

### RF-20261008-004 — Düz %4,5 KMH oranı beş yerde yaşıyor; `/cfo/borclar` satırları toplamı tutmuyor
- **date:** 2026-10-08 · **commit:** 422a6db · **severity:** HIGH · **status:** OPEN
- **finding:** Cowork "küresel 4,50 yanlış" dedi; kademeli faiz yalnız downside'da. Düz oran: borclar satır faizi (`borclar/page.tsx:69`), gümrük açığı faizi (engine.ts:396, `gumruk:45`), `buildAllocation` (engine.ts:479), `cfo_kart_karari` (kart ertelemeyi KKDF/BSMV'siz KMH oranıyla fiyatlıyor), capital-efficiency KMH yedeği. `cfo_loan.interestRatePct` şema yorumu "aylık", kod "yıllık".
- **evidence:** dosya:satır yukarıda; borclar TOPLAM `o.kmhInterestMonthlyTry` (banka oranlı) ≠ satırlar toplamı.
- **economic_risk:** Borç kapama / gümrük finansmanı / kart erteleme kararları yanlış maliyetle karşılaştırılıyor.
- **affected_component:** engine.ts, `/cfo/borclar`, `/cfo/gumruk`, `/cfo/sermaye` seçenek karşılaştırması, `cfo_kart_karari`.
- **recommended_fix:** CFO-005.

### RF-20261008-005 — `remainingOverride` (taksit SAYISI) TL tutarı yerine toplanıyor (LATENT)
- **date:** 2026-10-08 · **commit:** 422a6db · **severity:** HIGH · **status:** OPEN
- **finding:** `cfo_servet_kalem` Krediler satırı ve `cfo_kilometre_yaz` `COALESCE(remainingOverride::numeric, remainingTry)` kullanıyor; `remainingOverride` Int taksit sayısı (`schema.prisma:2048`, engine.ts:110-112).
- **evidence:** üretim görünüm tanımı `remainingOverride` içeriyor; bugün 5 aktif kredinin hiçbirinde override yok → şu an etkisiz.
- **economic_risk:** Bir kredide override girildiği an milyonlarca TL borç "12 TL" olur; net sermaye, borç hedefi ve sipariş kapısı sessizce yanlışlanır.
- **affected_component:** `cfo_servet*`, `cfo_snapshot`, `fm_balance_day`, Goal Engine, `debt-policy`.
- **recommended_fix:** CFO-004 (küçük migration).

### RF-20261008-006 — Alarm teslimi güvenilmez zamanlayıcıya bağlı; takılan koşu ve kilit hatası görünmez
- **date:** 2026-10-08 · **commit:** 422a6db · **severity:** HIGH · **status:** OPEN
- **finding:** Sağlık/alarm yalnız GitHub Actions işinde değerlendiriliyor (repo kendi notunda zamanlayıcıyı güvenilmez diyor); teslim = GitHub hata e-postası; secret eksikse iş sessizce yeşil. `running` kalan koşular `consecutive_failures`'a girmiyor; kilit hatası `cfo_run` satırı yazmıyor; aynı saatte başarısız koşunun tekrarı `duplicate` dönüyor. `/api/cron/cfo-cycle` hiçbir zamanlayıcıdan çağrılmıyor.
- **evidence:** `.github/workflows/ai-cfo-schedule.yml:14-65`, `health.ts:38,78-84`, `runner.ts:37-39`, `store.ts:44-50`, `workflow-trigger.ts:6`.
- **economic_risk:** Ödeme/taban/kapasite alarmı kaçabilir → gecikme faizi, KMH aşımı.
- **affected_component:** health, runner, store, workflows.
- **recommended_fix:** CFO-009.

### RF-20261008-007 — Kredi/kart/alacak/ödeme defterlerinin uygulamada yazma yolu yok; vade devri yok
- **date:** 2026-10-08 · **commit:** 422a6db · **severity:** HIGH · **status:** OPEN
- **finding:** `cfo_receivable`, `cfo_cash_event` (oluşturma), `cfo_loan`, `cfo_credit_card`, `cfo_yoldaki_mal`, `cfo_settings`, `cfo_kur` yalnız seed + elle/Cowork SQL. `nextPaymentDate`/`nextDueDate`/`currentMonthState` otomatik dönmüyor; `payment_unmarked` yalnız "bugün" eşleşmesiyle çalıştığından tarihler eskiyince alarm sessizce durur. `cfo-actions.ts` dışa aktarımlarının UI çağıranı yok.
- **evidence:** ops denetimi §5; `health.ts:50-51,98-103`.
- **economic_risk:** Ödeme kaçırma; nakit projeksiyonunun bayat defterle çalışması.
- **affected_component:** defterler, health, projeksiyon.
- **recommended_fix:** CFO-010.

### RF-20261008-008 — KDV esası: marj ve NRV stok değeri KDV dahil gelirle; vergi borcu yok
- **date:** 2026-10-08 · **commit:** 422a6db · **severity:** HIGH · **status:** OPEN
- **finding:** `contribution()` KDV'yi düşmüyor (calculations.ts:30-34, sözleşme "alfas-gross-v10 gross incl. VAT"); `cfo_stok_deger` NRV = KDV dahil gerçekleşen fiyat × banka net oranı (baseline:5390-5464); `borc`'ta KDV/vergi yükümlülüğü yok. `unitCostTry`'nin KDV esası teyit edilmedi.
- **evidence:** dosya:satır; NRV 7,24M ↔ maliyet 4,32M.
- **economic_risk:** Marj ve net sermaye %20'ye kadar şişik olabilir → yanlış SCALE/fiyat ve hedef ilerlemesi.
- **affected_component:** snapshot katkı marjı, capital-efficiency, `cfo_stok_deger`, `cfo_servet`.
- **recommended_fix:** CFO-007 (karar memosu + KDV hariç esas).

### RF-20261008-009 — Ciro hedefi KDV dahil ölçülüyor; ciro yedi formülle hesaplanıyor
- **date:** 2026-10-08 · **commit:** 422a6db · **severity:** HIGH · **status:** OPEN
- **finding:** `revenue_month_usd.metric_key = revenue_incl_vat_try`; Alfashome hariç, IDEASOFT ve eski tekstil dahil. Diğer yollar (`cfo_satis_*`, `cfo_ciro_hedef` son tam ay + ayar kuru + maliyetsiz SKU düşülmüş, revenue-levers 90g/3 + `cfo_kur`, eski motor `last14dRevenueTry` 23.08, `/admin/sermaye` yalnız Trendyol, debt-forecast 30g) farklı.
- **evidence:** üretim `fm_goal`; sayfa denetimi D6.
- **economic_risk:** G1 açığı ±%20 belirsiz; sayfalar farklı ciro gösteriyor.
- **affected_component:** Goal Engine, `/cfo/kazananlar`, `/cfo/sermaye`, `/cfo`, `/admin/sermaye`.
- **recommended_fix:** CFO-008 (karar + tek ciro fonksiyonu).

### RF-20261008-010 — Şirket ve şahsi kaynaklar karışıyor (nakit 4, boş KMH 4 tanım)
- **date:** 2026-10-08 · **commit:** 422a6db · **severity:** HIGH · **status:** OPEN
- **finding:** engine.ts nakdi ve KMH'yi şahsi dahil sayıyor; `cfo_nakit_kapisi` hariç; `cfo_odeme_gunluk` açılışı şahsi dahil + vadesi geçmişler dahil; `cfo_servet` nakdi şahsi dahil; `/cfo/odemeler` kapasitesi tam ticari limit + bakiyesi bilinmeyen bankanın limiti. Şahsi eşleme regex/ILIKE/LIKE (büyük-küçük harf duyarlı) karışık.
- **evidence:** sayfa denetimi D1/D1b.
- **economic_risk:** Dip ve kapasite sayfaya göre farklı; şahsi para şirket nakdi gibi görünebilir.
- **affected_component:** engine.ts, `cfo_odeme_gunluk`, `cfo_servet`, `/cfo/odemeler`.
- **recommended_fix:** CFO-006.

### RF-20261008-011 — Net sermaye atfı kimliği bozuk (iki snapshot yazarı)
- **severity:** MEDIUM · **status:** OPEN · **commit:** 422a6db
- **finding:** `fm_balance_day` bileşenleri (nakit + alacak + stok − borç) `net_capital_try`'yi vermiyor; TS ve SQL snapshot yazarları stok/borç ve kuru farklı tanımlıyor. `goal-attribution.ts` öncülü yanlış.
- **evidence:** 07.10: 59.693 + 1.042.702 + 14.556.343 − 9.283.200 = 6.375.538 ≠ 2.617.204.
- **economic_risk:** "Net sermaye neden düştü" cevabı yanlış bileşene atfedilir.
- **recommended_fix:** CFO-017 (CFO-001 ile birlikte tek yazar).

### RF-20261008-012 — Güvenlik boşlukları
- **severity:** MEDIUM · **status:** OPEN · **commit:** 422a6db
- **finding:** Yazma yolları okuma izniyle (EXECUTIVE_READ) korunuyor (Trendyol finans içe aktarma, satın alma siparişi, XML kaynak, API kimlik ayarları, toplu ürün içe aktarma); `openQuestionCount` yetkisiz server action; denetim `source` alanı çağıran tarafından verilebilir; pazaryeri API anahtarları düz metin sütunlarda; Cowork yazma yetkili ayrıcalıklı rolle bağlanıyor (okuyucu rol `cfo_gun_ozeti`'ni okuyamıyor); uygulama `postgres` (bypassrls) ile bağlanıyor.
- **evidence:** ops denetimi §4.
- **economic_risk:** yetkisiz finansal veri değişikliği; izlenemeyen düzeltmeler.
- **recommended_fix:** CFO-016.

### RF-20261008-013 — Maliyet kapsamı %87,5 < %95 → marj ve kâr kuralları susuyor
- **severity:** MEDIUM · **status:** OPEN · **commit:** 422a6db
- **evidence:** `cfo_maliyet_kapsami` 08.10; açık 125.642 TL; 8 SKU kapatır (PR #210).
- **recommended_fix:** CFO-011 (veri: Alperen; migration 20261008200000: Cowork).

### RF-20261008-014 — Karar hafızası kalibre edilemiyor
- **severity:** MEDIUM · **status:** OPEN · **commit:** 422a6db
- **finding:** `cfo_hamle` 15 karar; yalnız 3'ünde `beklenen_deger`; `cfo_hamle_olcum` hiç yazılmıyor; motor önerileri hamleye dönüşmüyor.
- **recommended_fix:** CFO-012.

### RF-20261008-015 — Vadesi geçmiş kalemler projeksiyondan düşüyor, takvimde kalıyor
- **severity:** MEDIUM · **status:** OPEN · **commit:** 422a6db
- **finding:** `cfo_nakit_projeksiyon` ve engine.ts yalnız `tarih ≥ bugün`; `cfo_yaklasan_odeme`/`cfo_odeme_gunluk` vadesi geçmiş ödenmemişleri taşıyor → iki dip. Bugün vadesi geçmiş ödenmemiş çıkış 0, alacak 1 (1.228 TL) — etkisi küçük ama yapısal.
- **recommended_fix:** CFO-013.

### RF-20261008-016 — UNKNOWN → 0 / varsayılan; tahmin "ölçülmüş" bayrağıyla
- **severity:** MEDIUM · **status:** OPEN · **commit:** 422a6db
- **finding:** `engine.ts num()` null→0 (earlyPayoff), kur yedeği 1, kart asgari %20, nakde dönüşüm %70; revenue-levers kur 45 / hedef 100000 / ciro 0; hurdle %4; goal-attribution eksik metrik 0; `cfo_servet_kalem` coalesce 0; downside `startCash ?? 0`. revenue-evidence, context servet, capital-config tahminleri `measured=true`.
- **recommended_fix:** CFO-014.

### RF-20261008-017 — Held-back migration'lar `prisma migrate deploy` ile uygulanabilir
- **severity:** MEDIUM · **status:** OPEN · **commit:** 422a6db
- **finding:** `market_scout_foundation`, `drop_legacy_backup_tables`, `cfo_maliyet_kapsami_satir` `prisma/migrations` içinde; `npm run db:migrate:deploy` hepsini uygular (drop dahil).
- **recommended_fix:** CFO-019.

### RF-20261008-018 — 3 genel KMH + gümrük limiti + 4 şahsi KMH oranı ölçülmemiş
- **severity:** MEDIUM · **status:** OPEN · **commit:** 422a6db
- **finding:** Kademeli faiz alt sınır (≥149.411 TL/120g); ölçülmemiş kullanım ~281M TL·gün (%4,5 varsayımıyla ≈ +421k).
- **recommended_fix:** CFO-015 (veri: Alperen).

### RF-20261008-019 — Hedefler ve eşikler kodda dağınık sabit
- **severity:** MEDIUM · **status:** OPEN · **commit:** 422a6db
- **finding:** 5.000.000 (SQL + TS + metin), 100000 yedeği 6+ yerde, "aylık 100.000 USD" sayfa metni, `ORAN_ESIGI=0.2`, 50_000 uyarı, KPI renk eşikleri, iki taban kaynağı (env `AI_CFO_CASH_FLOOR_TRY` ↔ `cfo_settings.netPositionFloorTry`).
- **recommended_fix:** CFO-002 + CFO-020.

### RF-20261008-020 — Yoldaki mal iki kaynakta ve hem varlık hem borç
- **severity:** MEDIUM · **status:** OPEN · **commit:** 422a6db
- **finding:** engine `cfo_import_project` ↔ servet `cfo_yoldaki_mal`; ödenmemiş vergi/navlun hem varlık (satır 6) hem borç (satır 9) → net sıfır ama borç hedefini/kapıyı 3,79M şişiriyor.
- **recommended_fix:** CFO-002 kapsamında.

### RF-20261008-021 — CI satırı yanıltıcı (`node a b c` yalnız ilk dosyayı koşar)
- **severity:** LOW · **status:** OPEN · **commit:** 422a6db
- **evidence:** `.github/workflows/cfo-readonly-validation.yml:113` (diğer iki test ayrıca 83-84'te koşuyor). `alfashome.test.ts` CI'da yok.
- **recommended_fix:** CFO-021.

### RF-20261008-022 — Eskimiş UI metni / doküman drift'i
- **severity:** LOW · **status:** OPEN · **commit:** 422a6db
- **finding:** `/cfo/alacaklar:74` "ciro/4"; `/cfo/ayarlar` "KMH / kart aylık faiz"; `/cfo/kazananlar` kapsam %85 yorumu; PDKS "6 saat / saatlik :05" (kod 20 saat, 3×/gün).
- **recommended_fix:** CFO-021.

### RF-20261008-023 — 'İadesi Onaylanan' / 'Tedarik Edilemedi' `cfo_satis_birim`'de ciro sayılır (LATENT)
- **severity:** LOW · **status:** OPEN · **commit:** 422a6db
- **evidence:** son 90 günde 0 satır (yalnız 'İade-İptal' var) → bugün etkisiz.
- **recommended_fix:** CFO-008 kapsamında tek ciro tanımı.

### RF-20261008-024 — Yetim / ölü bileşenler
- **severity:** LOW · **status:** OPEN · **commit:** 422a6db
- **finding:** `/api/cron/cfo-cycle` çağrılmıyor; `cfo_model_hakedis` sabit tarih penceresi; `cfo_insight`/`cfo_usage` yazılmıyor; eski motor alanları hesaplanıp gösterilmiyor; `cfo_settings` ölü alanları.
- **recommended_fix:** CFO-018/CFO-024.
