---
last_updated: 2026-10-09 01:10 TR
current_main_commit: 9bd5bd9
current_phase: "Faz 0 — İlk tam sistem denetimi"
current_score: 50/100
next_action: "CFO-001 (RF-20261008-001 CRITICAL'ı kapatır)"
---

# CFO RED FLAGS (append-only)

Kural: kayıtlar silinmez; çözülünce `status: RESOLVED (tarih, PR)` yazılır. Yeni göreve başlarken açık CRITICAL/HIGH'lar okunur.
Severity: CRITICAL · HIGH · MEDIUM · LOW · INFO.

**Açık özet (2026-10-09, üretim senkronu sonrası):** RF-004, RF-005, RF-017, RF-025, RF-028 RESOLVED · RF-007 HIGH→MEDIUM (kısmen) · CRITICAL 1 · HIGH 7 · MEDIUM 12 (RF-029) · LOW 6 (RF-030, yeni RF-031 MITIGATED) · INFO 1 · toplam 31.

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
- **severity:** MEDIUM · **status:** IN_PROGRESS (2026-10-09: yazma yolları okuma + yazma izni, openQuestionCount oturumlu, sistem not kaynağı korumalı; kalan API anahtarı şifreleme, Cowork salt-okunur rol, bypassrls bağlantı) · **commit:** 422a6db
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
- **severity:** MEDIUM · **status:** IN_PROGRESS (2026-10-09 kısım 1: hurdle %4, downside startCash, goal-attribution 0 + sürüm karışması, ciro 0, ölçüm bayrakları, /cfo 30 gün nakit; kalan eski motor → CFO-018) · **commit:** 422a6db
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
- **severity:** MEDIUM · **status:** IN_PROGRESS (2026-10-09: 5.000.000 kaldırıldı — CFO-002; iki taban kaynağı tekleşti — alarm/motor `cfo_settings`; 100000 yedeği `revenue-levers-data` + `/cfo/kazananlar`'dan kalktı; kalan ORAN_ESIGI, 50.000 uyarı, KPI renk eşikleri) · **commit:** 422a6db
- **finding:** 5.000.000 (SQL + TS + metin), 100000 yedeği 6+ yerde, "aylık 100.000 USD" sayfa metni, `ORAN_ESIGI=0.2`, 50_000 uyarı, KPI renk eşikleri, iki taban kaynağı (env `AI_CFO_CASH_FLOOR_TRY` ↔ `cfo_settings.netPositionFloorTry`).
- **recommended_fix:** CFO-002 + CFO-020.

### RF-20261008-020 — Yoldaki mal iki kaynakta ve hem varlık hem borç
- **severity:** MEDIUM · **status:** OPEN · **commit:** 422a6db
- **finding:** engine `cfo_import_project` ↔ servet `cfo_yoldaki_mal`; ödenmemiş vergi/navlun hem varlık (satır 6) hem borç (satır 9) → net sıfır ama borç hedefini/kapıyı 3,79M şişiriyor.
- **recommended_fix:** CFO-002 kapsamında.

### RF-20261008-021 — CI satırı yanıltıcı (`node a b c` yalnız ilk dosyayı koşar)
- **severity:** LOW · **status:** RESOLVED (2026-10-09, CFO-021) · **commit:** 422a6db
- **evidence:** `.github/workflows/cfo-readonly-validation.yml:113` (diğer iki test ayrıca 83-84'te koşuyor). `alfashome.test.ts` CI'da yok.
- **recommended_fix:** CFO-021.

### RF-20261008-022 — Eskimiş UI metni / doküman drift'i
- **severity:** LOW · **status:** RESOLVED (2026-10-09, CFO-021; %85 eşiği ve tarihsel PDKS kayıtları bilerek korundu) · **commit:** 422a6db
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

---

## 2026-10-08 — CFO-001 PR-A (metrik mutabakatı) RED FLAG PASS

### RF-20261008-001 — güncelleme (kayıt değişmez, açıklama eklenir)
- Mutabakat SQL'i (`scripts/cfo/metric-reconciliation.sql`) gösterdi: "üç sayı" aslında **iki tanım + ölçüm anı farkı** (DAR 2.507.805 canlı / 2.617.204 Goal sabah gözlemi; GENİŞ 6.266.139 = DAR + yoldaki ödenmiş 3.758.334). Severity aynı (CRITICAL): hedef DAR'ı, sayfa GENİŞ'i, ikisi de KDV dahil NRV stokla gösteriyor. Önerilen sözleşme: 2.973.814 TL (LCNRV, geniş) — `docs/CFO-METRIC-CONTRACT.md`.

### RF-20261008-025 — Ciro hedefi eksik günleri "A" notuyla tam sayıyor; KDV hariç ciro hiç ölçülmüyor
- **date:** 2026-10-08 · **commit:** cde8760 · **severity:** HIGH · **status:** OPEN
- **finding:** `fm_memory_sales_company_day` 07.10 = 5.288 TL (tipik gün 55–75k; Entegra yüklemesi 05.10'da) ama `revenue_grade = 'A'`; Goal Engine run-rate'i bu günleri tam sayıyor (`complete_through 2026-10-07`). `revenue_ex_vat_try` tüm günlerde NULL (grade U) → KDV hariç ciro ölçülemiyor.
- **evidence:** üretim sorgusu (25.09–07.10 günlük satırlar); mutabakat `ciro_mtd_kdv_haric = NULL`.
- **economic_risk:** G1 gidişi olduğundan kötü görünüyor (aylık tahmin 33,7k USD eksik günlerle); ekonomik ciro hedefi tanımlanamıyor.
- **affected_component:** fm sales memory, `fm_goal_evaluate`, revenue goal.
- **recommended_fix:** CFO-008 (kaynak tazeliği ile "tamamlanmış gün" sınırı; satır KDV'sinden `revenue_ex_vat_try`).

### RF-20261008-026 — TCMB Ekim kuru NULL; kur betiği elle çalışıyor
- **date:** 2026-10-08 · **commit:** cde8760 · **severity:** MEDIUM · **status:** OPEN
- **finding:** `fm_memory_fx_monthly` 2026-10 satırı `usd_try_forex_buying = NULL` (grade U); Goal Engine önceki ay kurunu (48,5585) kullanıyor (`goal_fx_prior_month`). `scripts/fm-fx-tcmb.ts` yalnız SQL üretiyor, elle uygulanıyor.
- **recommended_fix:** CFO-003 (kur otomasyonu + tek kaynak).

### RF-20261008-027 — 39 SKU KDV sonrası maliyetin altında satılıyor; 32 SKU değersiz (0) sayılıyor
- **date:** 2026-10-08 · **commit:** cde8760 · **severity:** INFO (ekonomik bulgu) / MEDIUM (32 SKU UNKNOWN→0, RF-016 kapsamı) · **status:** OPEN
- **finding:** `stok × (birim_net_deger − birim_fiyat/6) < maliyet_degeri` olan 39 SKU (gerçekleşen fiyat, banka net oranı, kargo ve çıktı KDV'si sonrası); 32 SKU maliyetsiz + satışsız → `cfo_stok_deger` 0 (336 adet).
- **economic_risk:** zararına satış (fiyat/tasfiye kararı); 336 adetlik stok değeri bilinmiyor ama 0 görünüyor.
- **recommended_fix:** CFO-007 (KDV hariç marj, sermaye motoruna FIX_PRICE girdisi) + CFO-014 (DEGERSIZ → UNKNOWN).

---

## 2026-10-09 — CFO-004 RED FLAG PASS

### RF-20261008-005 — güncelleme: FIX READY (migration 20261009100000, Cowork uygulayacak)
- `cfo_servet_kalem` "Krediler" ve `cfo_kilometre_yaz` artık yalnız `remainingTry` toplar. PGlite testi: override = 12 taksit olan 500.000 TL'lik kredi borcu 500.000 artırır. Üretim sayıları değişmez (override 0 kredide). Status üretimde uygulanınca RESOLVED olacak.

### RF-20261008-014 — düzeltme (kayıt değişmez, açıklama eklenir)
- "`cfo_hamle_olcum` hiç yazılmıyor" ifadesi eksik: `cfo_kilometre_yaz` aylık kapanışta yalnız `H01-MARJ-DONUSU` için yazıyor. Diğer hamleler için ölçüm yazımı yok — bulgunun özü (kalibrasyon yapılamıyor) geçerli.

### Bağımsız inceleme (CFO-004)
- Aynı para iki kez sayılıyor mu? Hayır — satır yalnız kalan anapara. Yeni teknik borç: kilometre fonksiyonu baseline metniyle kopyalandı (tek kaynak = migration). Güvenlik: yetkiler CREATE OR REPLACE ile korunur (`cfo_acceptance_reader` SELECT dahil). Look-ahead / kur / UNKNOWN etkisi yok. **Yeni red flag yok.**

---

## 2026-10-09 — CFO-005 RED FLAG PASS

### RF-20261008-004 — güncelleme: KISMEN ÇÖZÜLDÜ (CFO-005, TS katmanı)
- Düz `cfo_settings.kmhMonthlyRatePct` artık hiçbir hesapta kullanılmıyor: eski motor KMH faizi hesap başına ölçülmüş oran (yoksa "faizi bilinmiyor" tutarı ayrı), gümrük açığı faizi ve `buildAllocation` (gümrük rezervi / KMH azaltma) kademeli çekiliş sırasıyla (`tieredDrawInterest`, downside ile aynı dilim mantığı), capital-efficiency KMH yedeği kaldırıldı (UNKNOWN). `/cfo` rozet, `/cfo/borclar` satırları (artık toplamı tutar; oransız hesap "oran yok"), `/cfo/gumruk`, `/cfo/sermaye` metinleri ölçülmüş oran aralığını gösterir.
- Şahsi KMH'ye eski motorun eklediği ×1,30 KKDF/BSMV çarpanı kaldırıldı: `monthlyRatePct` ekstreden ölçülen **efektif** oran olarak tanımlandı (downside ile tutarlı); bugün hiçbir şahsi hesapta oran yok → sayısal etki 0.
- **Açık kalan:** SQL `cfo_kart_karari` kart erteleme maliyetini hâlâ KMH oranıyla (KKDF/BSMV'siz) fiyatlıyor → CFO-005b (migration). `cfo_loan.interestRatePct` şema yorumu "aylık" → "yıllık" düzeltmesi CFO-005b ile.
- **Bağımsız inceleme:** KMH kullanılmıyorken "KMH azaltma" getirisi artık 0 (eskiden 4.500 TL/ay hayali tasarruf gösteriyordu). Yeni UNKNOWN taşıma: oranı ölçülmemiş dilime düşen getiri `dataOk=false`. Look-ahead/kur/çift sayım etkisi yok. Yeni red flag yok.

---

## 2026-10-09 — CFO-005b RED FLAG PASS

### RF-20261008-004 — güncelleme: SQL katmanı FIX READY (migration 20261009110000, Cowork uygulayacak)
- `cfo_kart_karari` asgariye çekilen kart bakiyesinin faizini artık eşleşen kartın akdi aylık oranı × 1,30 (KKDF %15 + BSMV %15; `lib/cfo/card-cost.ts` ile aynı) ile hesaplıyor; kartın oranı yoksa `aylik_faiz` NULL + "BILINMIYOR". `cfo_settings.kmhMonthlyRatePct` kodda yalnız ayarlar sayfasında gösterim olarak kaldı. Şema yorumu: `cfo_loan.interestRatePct` YILLIK.
- Üretim etkisi (uygulanınca): 6 kartın hepsinde akdi oran 4,25 → erteleme faizi 4,5 yerine 4,25 × 1,30 = **5,525%/ay** (eskisi %23 düşük gösteriyordu). Bugün taban deliniyor (−3,37M) ama karar listesi hangi kalemlerin ertelendiğine bağlı; sıralama mantığı değişmedi.
- Bağımsız inceleme: aynı faiz iki kez sayılmıyor (karar fonksiyonu yalnız öneri; engine card carry ayrı). Kart eşleme `description ILIKE %bank%` — aynı bankada birden çok kart varsa `sortOrder` ilkini alır (mevcut davranış, asgari tutarla tutarlı). Yeni red flag yok. RF-004 üretimde uygulanınca RESOLVED.

---

## 2026-10-09 — CFO-009 RED FLAG PASS

### RF-20261008-006 — güncelleme: KISMEN ÇÖZÜLDÜ
- Takılmış koşu artık görünür: 15 dakikadan uzun `running` kalan motor koşusu `stuck_run` alarmı verir ve ardışık hata sayımına girer (eskiden hiç sayılmıyordu).
- Kilit yapılandırma hatası (`LockError`) artık `engine:<dilim>:<kod>` satırıyla `failed` kaydedilir (eskiden iz bırakmıyordu).
- Aynı dilimde başarısız ya da takılmış koşu yeniden denenebilir (eskiden aynı saat içinde `duplicate` dönüyordu); tamamlanmış ya da taze `running` koşu tekrar açılmaz.
- **Açık kalan:** bildirim kanalı hâlâ GitHub işi kırmızı → e-posta (güvenilmez zamanlayıcı). Alarmlar her motor koşusunda `cfo_gun_ozeti` ALARM satırlarına yazılıyor (Vercel cron'ları güvenilir) → Cowork günde iki kez görüyor; arada anlık iletim için kanal kararı D-P07 (e-posta / WhatsApp) bekleniyor. `/api/cron/cfo-cycle` yetim: Vercel Hobby 2 cron sınırı nedeniyle ayrı zamanlayıcı eklenmedi; döngü iki sync cron'unun `after()` zincirinde zaten çalışıyor (yorum düzeltilecek, CFO-024).
- Bağımsız inceleme: yeniden deneme güncellemesi `where: { id, status }` ile koşullu (iki eşzamanlı deneme aynı satırı alamaz; kilit de var). Yeni red flag yok.

---

## 2026-10-09 — CFO-010 (kısım 1) RED FLAG PASS

### RF-20261009-028 — Kredi/kart ödeme alarmı geçen ayın "ODENDI" işaretiyle körleşmişti (YENİ, HIGH → FIX READY)
- **date:** 2026-10-09 · **commit:** ed008cb+ · **severity:** HIGH · **status:** FIX READY (CFO-010 PR)
- **finding:** `currentMonthState` ay dönümünde sıfırlanmıyor; 08.10'da 5 kredinin 5'i, 6 kartın 5'i "ODENDI" — bir önceki taksitten kalma (örn. Garanti ticari kredi vade 16.10, son güncelleme 16.09). `payment_unmarked` yalnız `state <> 'ODENDI'` ise tetiklendiği için 16.10, 21.10, 24.10, 25.10 kredi taksitleri ve kartların çoğu ödenmese bile alarm vermeyecekti.
- **evidence:** üretim salt-okuma; simülasyon (16.10 öğleden sonra): eski kural yalnız Ziraat şirket kartını, yeni kural Garanti kredisini de yakalıyor.
- **economic_risk:** kaçan kredi/kart taksiti → gecikme faizi, KKB notu, kart limit blokesi.
- **fix:** "ODENDI" yalnız bu döngüde işaretlendiyse sayılır (`lastUpdatedAt > vade − 25 gün`); vade geçip ödendi işaretli ama sonraki vade girilmemişse `ledger_stale` alarmı; vadesi geçmiş kredi/kart artık sabah koşusunda da alarm verir (eskiden yalnız vade günü 15:00 sonrası).
- **sınır (bilinçli):** `lastUpdatedAt` satırdaki her güncellemede değişir — döngü içinde başka alan güncellenirse yanlışlıkla "ödendi" sayılabilir; kalıcı çözüm ödeme işaretinin kendi tarihi (`paidAt`) — CFO-010 kısım 2 (defter yazma yolu) ile.

---

## 2026-10-09 — Üretim senkronu (migration 200000 + 100000) RED FLAG PASS

### RF-20261008-005 — güncelleme: RESOLVED (2026-10-09)
- Migration `20261009100000_cfo_kredi_kalan_anapara` (checksum 2de5c7bb…) Cowork tarafından 2026-10-08 21:25 UTC uygulandı.
  Üretim salt-okuma: `cfo_servet_kalem` Krediler satırı = −3.373.797,12 TL = `cfo_loan.remainingTry` toplamı; `cfo_kilometre_yaz`
  gövdesinde `remainingOverride` yok. Parmak izi yeniden ölçüldü (fn 36, fnacl 53, view 60) ve repo ile eşit.

### RF-20261008-013 — güncelleme: Code tarafı üretimde
- Migration `20261008200000_cfo_maliyet_kapsami_satir` (checksum 76abb7a0…) 2026-10-08 20:26 UTC uygulandı; satır fonksiyonu toplamı = ciro,
  ACL yalnız postgres/service_role. Kapsam (pencere kaydı) %87,3 — açık kalan veri işi (Alperen), durum değişmedi.

### Bağımsız inceleme
- Parmak izi farkı yalnız beklenen nesnelerde (yeni `cfo_maliyet_kapsami_satir` fonksiyonu + ACL'i, değişen görünüm/fonksiyon gövdeleri);
  rel/acl/pol/idx değişmedi → beklenmeyen şema sürüklenmesi yok. `20261009110000` hâlâ üretimde değil (Cowork uyguluyor) — RF-004 SQL kısmı FIX READY kalır.
  Yeni red flag yok.

---

## 2026-10-09 — CFO-010 (kısım 2) RED FLAG PASS

### RF-20261009-028 — güncelleme: RESOLVED (2026-10-09, CFO-010 kısım 2)
- Ödeme alarmı artık yalnız ödeme takviminden (`cfo_cash_event`, taksit başına satır + `isSettled`) — projeksiyonla aynı defter.
  `currentMonthState` hiçbir alarmda ve Borçlar sayfasında okunmuyor; kısım 1'deki `lastUpdatedAt` sınırı (döngü içi başka güncelleme
  yanlış "ödendi" sayılabilir) ortadan kalktı. Kısım 1 kuralı 16.10'da Garanti taksiti için takvimle **ikinci** bir alarm üretecek ve takvim
  satırı işaretlendikten sonra da susmayacaktı (üretim salt-okuma simülasyonu) — bu çift alarm kaldırıldı.

### RF-20261008-007 — güncelleme: KISMEN ÇÖZÜLDÜ, HIGH → MEDIUM
- Ekonomik risk (ödeme kaçırma, alarmın sessizce durması) kapandı: ödeme durumu takvimden; `ledger_stale` artık "aktif kredi/kartın takvimde
  bekleyen sonraki ödemesi yok" (projeksiyon o ödemeyi görmüyor) demek; ödeme işaretleme yolu `/cfo/odemeler` (CFO_WRITE + `cfo_change_log`).
  Yetim `lib/actions/cfo-actions.ts` silindi (UI çağıranı yoktu; ikinci snapshot yazarıydı — RF-011'e katkı).
- **Açık kalan:** takvim/defter satırı OLUŞTURMA hâlâ Cowork SQL ile (tasarım gereği); kayıtlı yazma rolü CFO-016.

### RF-20261009-029 — Yapı Kredi taksiti Kasım–Ocak takvimde iki kez (YENİ, MEDIUM, veri)
- **date:** 2026-10-09 · **commit:** 90af323+ · **severity:** MEDIUM · **status:** OPEN (veri düzeltmesi insan/Cowork)
- **finding:** her ay doğru satır (25'i, 33.112 TL, KESIN) + 26.08 düzeltme notunda "ödeme günü 28 değil 25; tutar 33.277,20 değil 33.112,46"
  denen eski kaydın devamı (28'i, 33.277 TL, TAHMINI): `8ab7fc76-3e55-4a3c-a098-92ea132d6564` (2026-11-28), `9dd414e3-499a-4530-a7b8-e9baab4f6f02`
  (2026-12-28), `1f20c74c-7c5a-4081-80f0-0c755ef180b4` (2027-01-28). Aktif Yapı Kredi kredisi 1.
- **evidence:** üretim salt-okuma (`scheduleDuplicateSql`); `cfo_loan` YKB notu.
- **economic_risk:** projeksiyon 120 günde 99.832 TL fazla çıkış; 01.12 dibi −3.578.121 yerine −3.544.844 TL olmalı (33.277 TL kötü). Taban yine deliniyor.
- **fix:** kod — `schedule_duplicate` alarmı her koşuda yakalar (banka × ay bekleyen taksit > aktif kredi). Veri — 3 satırın kapatılması/silinmesi
  Cowork/Alperen kararı (üretim verisine Code dokunmaz). Garanti Ekim kart satırları (5.000 kapatma + 1.000 asgari, Alp) olası mükerrer, düşük tutar; kart kuralı yok.

### Bağımsız inceleme
- Aynı ödeme iki kez sayılıyor mu? Alarmda hayır (tek kaynak). Projeksiyonda evet → RF-029. Yeni UNKNOWN: kart eşleşmesi yalnız banka
  (aynı bankada iki kart varsa biri takvimde yoksa görülmez — Garanti ana/ek tek satırda ödeniyor, bilinçli). Güvenlik: SQL'ler `today`'i
  YYYY-AA-GG doğrulamasıyla gömüyor (enjeksiyon testi var); yazma yolu eklenmedi, biri silindi.

---

## 2026-10-09 — CFO-019 RED FLAG PASS

### RF-20261008-017 — güncelleme: RESOLVED (2026-10-09, CFO-019)
- `npm run db:migrate:deploy` artık `scripts/schema-baseline/guard-deploy.mjs` ile başlar: bekletilen migration (bugün 3, biri `DROP TABLE`)
  ve Supabase hedefi açık izin değişkeni olmadan reddedilir (çıkış 1, prisma hiç başlamaz). Test `migrate-deploy-guard` CI'da.
- **Kalan sınır (bilinçli):** `npx prisma migrate deploy` doğrudan çağrılırsa koruma atlanır; yönetişim kuralı (Master Plan: üretimde deploy yok,
  Cowork SQL uygular) geçerli. Yeni red flag yok.

---

## 2026-10-09 — CFO-008 kısım 1 (KDV hariç ciro) RED FLAG PASS

### RF-20261008-025 — güncelleme: KISMEN FIX READY (KDV hariç yarısı; migration 20261009120000, Cowork uygulayacak)
- `fm_sales_canonical` kaynakta KDV hariç tutar olmayan satırda (Trendyol API, Amazon FBA) tutarı türetir: SKU'nun pazaryeri satırlarındaki baskın
  KDV oranı (yalnız 2023-07-10 sonrası — öncesi %18; ≥ %80 baskınlık), yoksa %20 varsayılan; bayrak `ex_vat_derived_sku` / `ex_vat_default_rate`.
  Kaynak değer korunur; görünümün diğer tüm sütunları aynı (PGlite eşlik testi `fm-kdv-haric`). Kalite notu U → B.
- Üretim ölçümü (anlık görüntü üzerinde aynı mantık, salt-okuma): Mayıs–Ekim her ay KDV payı %16,67 (tümü %20). Eylül KDV hariç 1.604.768 TL;
  Ekim varsayılan oran payı %38,9 (yeni SKU'ların Entegra geçmişi yok; oran yine %20 — tutar etkilenmez, köken bayrakta).
- **Açık kalan (ikinci yarı):** eksik günlerin "A" notuyla tam sayılması (07.10 = 5.288 TL) — kaynak tazeliği sınırı ayrı iş.

### Bağımsız inceleme
- Aynı KDV iki kez düşülüyor mu? Hayır: türetme yalnız kaynakta KDV hariç tutar YOKSA; kimlik testi KDV hariç + KDV = KDV dahil. Eski oranla
  (%18) türetme riski 2023-07-10 filtresiyle kapatıldı (üretimde 8 SKU'nun medyanı %18'e düşüyordu). XML KDV kullanılmadı: okuyucu rolünün
  `XmlProductData` yetkisi yok (security_invoker görünüm onu kırardı) ve Trendyol ürünlerinde %10 ürün yok. Yeni red flag yok.

---

## 2026-10-09 — CFO-025 ölçüm RED FLAG PASS

### RF-20261009-030 — Ürün maliyetinde ithalat çarpanı 84×: TE-RINGFILLLIGHT (YENİ, LOW, veri)
- **date:** 2026-10-09 · **severity:** LOW (stok 0) · **status:** OPEN (veri düzeltmesi insan)
- **finding:** `sourceCostRmb` 16 → `unitCostUsd` 201,37 (FOB'un 84,6 katı; tipik 1,5–1,8) → `unitCostTry` 9.767 TL. Satılırsa marj/kâr kuralları
  yanlış alarm üretir. 433 ürünün 16'sında çarpan > 3 (çoğu küçük RMB'li ürün; birim navlun payı — makul).
- **economic_risk:** bugün 0 (stok yok); yeniden stoklanırsa fiyat tabanı yanlış.

### Ölçüm notu (kayıt değişmez): sabit kur
- Cowork'ün "sabit kur" bulgusu üretimde doğrulandı: 431/433 ürün 48,50. Ancak etkisi küçük: marj 0,43 puan, rafta stok maliyeti +24,6k TL (cfo_kur 48,98).
  Ayrı bir red flag açılmadı; kalıcı çözüm D-P04 (stratejik kur) ile birlikte (TL maliyet çalışma anında). Bağımsız inceleme: yeni CRITICAL/HIGH yok.

---

## 2026-10-09 — CFO-008 kısım 2 (hedef kaynak tazeliği) RED FLAG PASS

### RF-20261008-025 — güncelleme: FIX READY (iki yarı da; migration 20261009120000 + 20261009130000, Cowork uygulayacak)
- İkinci yarı: `fm_goal_evaluate` "tamamlanmış gün"ü yalnız hafıza tazeleme anından alıyordu. Entegra haftalık, Trendyol günde bir okunuyor;
  09.10'da 05–08.10 kısmi (08.10 = 2.943 TL) ama hıza giriyordu. Artık hız/projeksiyon/gereken hız yalnız tüm kaynakların tamam olduğu
  günlerden (known_at → İstanbul günü − 1); gözlenen MTD aynen; `goal_sources_partial` bayrağı, kalite en iyi B (hiç tam gün yoksa C).
- Üretim etkisi (salt-okuma, aynı kural): hız 51.941 → 58.318 TL/gün; aylık projeksiyon 1.610.158 → 1.807.851 TL (≈ 33,2k → 37,2k USD).
  G1 gidişi %12 kötü görünüyordu.

### Bağımsız inceleme
- Eksik gün 0 sayılmıyor, tahminle de doldurulmuyor (yalnız hız penceresinden çıkıyor). Kaynak bir daha hiç gelmezse (Entegra durursa) pencere
  daralır ve ay başında tam gün kalmaz → eski davranış + C notu + bayrak; `source_dead` alarmı ayrıca uyarır. Yeni red flag yok.

---

## 2026-10-09 — Üretim senkronu (110000 + 120000 + 130000, Cowork) RED FLAG PASS

### RF-20261008-004 — güncelleme: RESOLVED (2026-10-09)
- `cfo_kart_karari` üretimde kart akdi oranı × 1,30 ile; düz `kmhMonthlyRatePct` hiçbir hesapta yok. Üretim: Enpara 36.000 TL ertelemesi ~1.989 TL/ay.

### RF-20261008-025 — güncelleme: RESOLVED (2026-10-09)
- KDV hariç ciro: Nisan–Ekim her gün dolu (not B); Eylül 1.604.768 TL (KDV dahil 1.925.721). Hedef: hız yalnız tam kaynaklı günlerden
  (58.318 TL/gün, projeksiyon 1.807.851 TL, rate_through 04.10, bayrak goal_sources_partial).

### RF-20261009-031 — Cowork üretimde migration'sız değişiklik + uygulanan metin repo'dan farklı (YENİ, LOW, süreç)
- **date:** 2026-10-09 · **severity:** LOW · **status:** MITIGATED
- **finding:** (1) `cfo_gumruk_dilim` üretimde migration'sız düzeltildi ("09.10.2026 duzeltmesi": ödeme günü bugünse NULL; SINIR 2'de nakit çift
  sayımı, fark 151.553,36 TL) — doğru düzeltme, ama repo'da yoktu → parmak izi kırıldı. (2) 110000/130000 yorum satırları silinerek, 120000'deki
  `fm_quality_policy.reason` Türkçe karakterleri ASCII'ye çevrilerek uygulandı; `_prisma_migrations` checksum'ları repo dosyasınınki.
  Yürütülen kod birebir (yorumsuz gövde hash'i eşit).
- **mitigation:** capture migration `20261009140000_cfo_gumruk_dilim_capture` (üretim tanımı aynen; `_prisma_migrations` kaydı için Cowork'e
  tek satırlık INSERT); parmak izi fonksiyon gövdesini SQL yorumları olmadan, `fm_quality_policy`'yi serbest metin `reason` olmadan karşılaştırır
  (davranış farkı yine yakalanır). Kural önerisi: Cowork üretimde fonksiyon değiştirirse SQL'i Code'a da iletsin (capture aynı gün).

### RF-20261008-006 — güncelleme (2026-10-09, Cowork bulgusu; HIGH, OPEN → kısmen FIX READY)
- **olay:** 09.10 02:34 UTC `engine:2026-10-09T05:sync_xml` (xml-sync `after()`) Vercel 300 sn sınırında öldü; satır 4+ saat `running` kaldı.
  `stuck_run` alarmı yalnız motorun kendisi koşunca üretiliyordu ve `cfo_gun_ozeti` SAĞLIK satırı aciliyetsizdi → 08:00 Cowork okuması bayat
  karar setini güncel sanabilirdi.
- **düzeltme (kod, bu PR):** ölü koşu süpürmesi (`sweepStuck`, 15 dk), senkron sonrası motor süre bütçesi (≥150 sn), SAĞLIK satırı
  ACİL (TAKILDI / BAŞARISIZ / BAYAT) — migration `20261009150000_cfo_gun_ozeti_saglik_alarm` Cowork uygulayınca üretimde.
- **kalan:** teslim kanalı GitHub e-postası (D-P07), `cfo-cycle` yetim.

### RF-20261008-004 — ek (2026-10-09): kart vergi çarpanı ×1,30 → ×1,20 (Alperen kararı; FIX READY)
- Cowork itirazı: kart faizine BSMV %5 uygulanır (%15 değil); KKDF %15 → ×1,20. TS (`CARD_TAX`) bu PR'la; SQL `cfo_kart_karari`
  migration `20261009160000_cfo_kart_karari_bsmv` (Cowork uygulayınca). Üretim etkisi: devreden 1.984.192 TL'nin aylık maliyeti
  109.627 → 101.194 TL (−8.433 TL/ay modelde; nakit etkisi yok). Taban −3M TL kalır (Alperen; karar kaydı).

### RF-20261008-001 — güncelleme (2026-10-09, CFO-001 PR-D; CRITICAL, OPEN → FIX READY)
- Tek tanım `cfo_metrik_net_sermaye()` (GENİŞ + LCNRV + KMH; Alperen D-P01..03); snapshot `contractNetWorthTry` → `fm_balance_day` v3 →
  Goal `wealth_usd`; `/cfo` manşeti aynı fonksiyon. Migration `20261009170000` Cowork uygulayınca + ilk sözleşme snapshot'ında
  üç yer TL olarak eşit olur → RESOLVED. Kalan fark yalnız USD kuru (CFO-003 / D-P04). Üretim bugün 2.900.562 TL ≈ 59,7k USD (48,56).
- Yeni görünür bilinmeyen: satan ama birim maliyeti olmayan 24 SKU (KDV hariç NRV ≤ 256.990 TL) eskiden LCNRV'de sessizce 0'dı; artık
  BILINMIYOR satırı (maliyet girilince toplama girer — CFO-011 veri işiyle aynı liste).

### RF-20261008-002 — güncelleme (2026-10-09, CFO-002; HIGH, OPEN → FIX READY)
- Tek tanım `cfo_metrik_borc()` (kredi kalan + kart toplam + kullanılan KMH; gümrük taahhüdü hedef dışı, bilgi satırında); hedef
  `cfo_settings.debtTargetUsd` (100.000 USD) × TCMB → Goal `debt_below_usd` ve sipariş kapısı aynı kaynaktan. Migration `20261009180000`
  Cowork uygulayınca + eski 5M TL yolu silinince RESOLVED. Üretim bugün 5.889.904 TL ≈ 121,3k USD → hedefe 21,3k USD.

### RF-20261008-003 — güncelleme (2026-10-09, CFO-003; HIGH, OPEN → MITIGATED)
- D-P04 (Alperen onayı): stratejik kur = TCMB döviz alış (15'i), yoksa önceki ay işaretli, yoksa BİLİNMİYOR. `lib/fx/strategic.ts` tek okuyucu:
  sipariş kapısı, ciro hedefi (sabit 45 kalktı), `/cfo` servet USD'si ve Goal Engine aynı kur. TCMB ayı otomatik kaydedilir (xml-sync after()).
- Kalan (RESOLVED için): eski motor `usdTryRate || 1` yedeği (CFO-018), SQL eski alanları (`cfo_servet.kur`, snapshot `usdTryRate` döngüsü) — hedef ölçmüyorlar.

### RF-20261008-010 — güncelleme (2026-10-09, CFO-006 TS; HIGH, OPEN → kısmen FIX READY)
- TS'de tek kural (`lib/cfo/ownership.ts`); SQL görünümleri henüz kendi ifadeleriyle (migration bekliyor). Yeni bulgu: "Akbank Alp" ve
  "Garanti Alp" banka hesapları türü "Vadesiz + KMH" (şirket) — sahibi "Alp" olan kartlar ise şahsi. Hesaplar şahsiyse şirket KMH
  kapasitesi 450.000 TL fazla görünüyor (taban/kapasite alarmları). Karar: D-P08 (Alperen).

### RF-20261008-010 — güncelleme 2 (2026-10-09, D-P08 kararı)
- Alperen: "Akbank Alp" şahsi; "Garanti Alp" banka hesabı gerçekte yok (Garanti ekranlarıyla doğrulandı) → pasif. Şirket KMH kapasitesi
  450.000 TL fazla görünüyordu (veri düzeltmesi Cowork); "her şey dahil" açık **−403.698** (Cowork düzeltmesi 2026-10-09: önceki
  −252.145 hesabı `cfo_kaynak_yeterliligi` genel ticari kaynağında (1.960.853) nakdi iki kez sayıyordu). Kaldıraç önerileri bu rakamla
  sıkılaştırılmalı; `cfo_kaynak_yeterliligi` mükerrer sayımı ayrı düzeltme (CFO-006 SQL kalanıyla).
  Veritabanı görünümleri (`cfo_nakit_kapisi`, `cfo_kaynak_yeterliligi`, `cfo_onucus_temel`) yalnız tam "ŞAHSİ" yazımını tanır (ILIKE) —
  ASCII "SAHSI" yazılırsa hesap şirket kalır; görünümlerin `personalAccountSql` kuralına bağlanması (migration) bu riski kapatır.

### Gözlem (kayıt değişmez): nakit dibi
- `cfo_kart_karari` bugün en dibi −3.862.998 TL (2027-01-01) gösteriyor (08.10: −3.578.121, 01.12). Ufuk 120 gün kaydıkça Ocak ödemeleri girdi;
  ayrıca incelenecek (CFO-013 / RF-029 Yapı Kredi mükerrer satırları hâlâ projeksiyonda).

