---
last_updated: 2026-10-10 23:00 TR
current_main_commit: accc576
current_phase: "Faz 2 — Veri kalitesi ve güvenlik (Faz 1 metrik sözleşmesi ✅ 10.10: net sermaye/borç/kur/KDV/ciro tek tanım üretimde doğrulandı)"
current_score: 67/100
next_action: "RF-006 / CFO-009 otomasyon + teslim kanıtı: 13:xx UTC motor cron’u (doğrulama 14:10 UTC) + 11.10 06:xx UTC döngü + WhatsApp teslimi (132001: iotomasyon WHATSAPP_PHONE_NUMBER_ID ↔ cfo_alarm şablonunun WABA’sı, Alperen) → CFO-017 2. v3 günü atıf (11.10 05:xx UTC snapshot) → CFO-020 50k/KPI eşikleri → CFO-018 eski motor → CFO-012 ilk otomatik ölçüm (31.10/01.11)"
open_critical: 0
open_high: 1
score_change: "unchanged — CFO-018 kısım 4: /cfo/borclar kart toplamı borç sözleşmesinden, şahsi kart kısmı ayrı (etiket \"şirket\" yanlıştı)"
---

# CFO RED FLAGS (append-only)

Kural: kayıtlar silinmez; çözülünce `status: RESOLVED (tarih, PR)` yazılır. Yeni göreve başlarken açık CRITICAL/HIGH'lar okunur.
Severity: CRITICAL · HIGH · MEDIUM · LOW · INFO.

**Açık özet:** CRITICAL 0 · HIGH 1 (RF-20261008-006) açık (RESOLVED dışı) — tek doğru kaynak aşağıdaki **Durum kaydı** tablosu; bu satır ve frontmatter `open_critical`/`open_high` CI'da (`cfo-governance-drift`) ondan yeniden sayılır.

---

## Durum kaydı (makine okunur — tek doğru kaynak; CI `cfo-governance-drift` açık CRITICAL/HIGH sayısını buradan sayar)

Kural: bir RF'nin durumu değişince BU tabloda güncellenir (metindeki tarihçe append-only kalır). Durumlar: OPEN · IN_PROGRESS · FIX_READY · MITIGATED · RESOLVED (yalnız RESOLVED kapalı sayılır).

| RF | Severity | Status | Not |
|---|---|---|---|
| RF-20261008-001 | CRITICAL | RESOLVED | 2026-10-10, CFO-001 ✅ — 12:35 UTC üretim doğrulaması: `fm_balance_day` 10.10 `net_capital_try` v3 = 2.401.170,03 (`cfo_snapshot.contractNetWorthTry`, 05:13 UTC) = o anki `cfo_metrik_net_sermaye()` sira 100 (130000 öncesi tanım); Goal `wealth_usd` v3 aynı değerle değerlendirildi (UNKNOWN: tek trend noktası); bileşen kimliği farkı 0,00. 130000 sonrası ilk satır 11.10 |
| RF-20261008-002 | HIGH | RESOLVED | 2026-10-10, CFO-002 ✅ — `fm_balance_day` 10.10 `debt_try` v3 = 5.889.903,80 = `cfo_metrik_borc()` sira 100 (birebir); Goal `debt_below_usd` v3 değerlendirildi (NOT_MET, hedef 4.855.850 TL) |
| RF-20261008-003 | HIGH | RESOLVED | 2026-10-10, CFO-003 ✅ — TS tek kaynak + migration 120000 üretimde (Alperen açık onayı; 28a1f877…): SQL 48,5 / 1 yedekleri ve snapshot kur döngüsü kalktı; servet/hedef TCMB 48,5585, ithalat işlem kuru 48,98 |
| RF-20261008-004 | HIGH | RESOLVED | 2026-10-09, 110000 + 160000 üretimde |
| RF-20261008-005 | HIGH | RESOLVED | 2026-10-09, 100000 üretimde |
| RF-20261008-006 | HIGH | IN_PROGRESS | sağlık + WhatsApp Vercel cron zincirinde; motorun kendi Vercel cron'u (03:xx/13:xx UTC) + döngü cron'u (06:xx UTC). **10.10 13:04 UTC: motorun Vercel cron'u üretimde ilk kez kendiliğinden koştu** (`engine:2026-10-10T16:scheduled`, completed, 2 dk 15 sn; aynı saatte GitHub koşusu yok → Vercel cron kanıtı); döngü 12:20 UTC tamamlandı (Trendyol zinciri). Kalan: 11.10 03:xx motor + 06:xx döngü cron'u (doğrulama 07:10 UTC) ve alarm teslimi — `cfo_alarm` şablonu Meta'da DEĞERLENDİRMEDE (132001 nedeni bu; onaylanınca deneme gönderimi) |
| RF-20261008-007 | MEDIUM | RESOLVED | HIGH→MEDIUM; CFO-010 ✅ 2026-10-09 (ödeme durumu tek kaynak takvim) |
| RF-20261008-008 | HIGH | RESOLVED | 2026-10-09, CFO-007 ✅ — 190000 üretimde (LCNRV KDV hariç), D-P06 |
| RF-20261008-009 | HIGH | RESOLVED | 2026-10-10, CFO-008 ✅ — üretim motor koşusu (10:37 UTC) `sales.comparisons` anahtarları `lastCompleteDay/last7CompleteDays/last30CompleteDays:2026-10-04`, değerler `fm_sales_canonical_snapshot` COUNTED toplamıyla birebir (66.936,93 · 455.393,63 · 1.901.040,26 TL) |
| RF-20261008-010 | HIGH | RESOLVED | 2026-10-10, CFO-006 ✅ — TS + SQL tek kural (100000), takvim/mutabakat açılışı şahsi hariç (110000), `/cfo/odemeler` kapasitesi `cfo_hesap_sahsi`; 2026-10-10 ek: eski motor manşet nakit/KMH da artık yalnız şirket (`/cfo` boş KMH 2,71M → 1,36M = `cfo_nakit_kapisi`) |
| RF-20261008-011 | MEDIUM | IN_PROGRESS | CFO-017: ilk bileşenli snapshot 10.10 05:13 UTC ✓ (nakit 151.553,36 + alacak 1.045.155,68 + stok 3.336.030,79 + yoldaki 3.758.334 − borç 5.889.903,80 = 2.401.170,03, fark 0,00); kalan: 2. v3 günü atıf (11.10) |
| RF-20261008-012 | MEDIUM | IN_PROGRESS | yazma yolları yazma izni (PR #242); API anahtarı şifreleme, Cowork rolü kalan |
| RF-20261008-013 | MEDIUM | OPEN | veri: 8 SKU maliyeti (CFO-011, Alperen) |
| RF-20261008-014 | MEDIUM | IN_PROGRESS | CFO-012 kod ✓ 10.10 (beklenen SAYI zorunlu, gece ölçümü, kalibrasyon, öneri→taslak); RESOLVED: ilk otomatik ölçüm üretimde (31.10/01.11) |
| RF-20261008-015 | MEDIUM | RESOLVED | 2026-10-10, CFO-013 ✅ — migration 110000 üretimde; projeksiyon dibi = takvim dibi |
| RF-20261008-016 | MEDIUM | IN_PROGRESS | CFO-014 kısım 1 (PR #240) + kısım 2 2026-10-10 (eski motor: kredi erken kapama/taksit, kart asgari %20, nakde dönüşüm %70, faaliyet nakdi, eski stok alanları, yedek haftalık tahmin, kaldıraç teslim süresi 67/22 → BİLİNMİYOR + Dikkat satırı; testli); kalan: `cfo_servet_kalem` COALESCE 0 (bilinmeyen banka bakiyesi sessiz düşer — migration) |
| RF-20261008-017 | MEDIUM | RESOLVED | 2026-10-09, CFO-019 |
| RF-20261008-018 | MEDIUM | OPEN | veri: ölçülmemiş faiz oranları (CFO-015, Alperen) |
| RF-20261008-019 | MEDIUM | RESOLVED | 5M + 100k yedeği + iki taban kalktı; 10.10 CFO-023: ORAN_ESIGI ayardan, "aylık 100.000 USD" metinleri ayardan, kazananlar kapsam eşiği = motor ✓; 10.10 CFO-020: KMH kartı = motor kapasite kuralı, /cfo/odemeler 50k → taban alarmı, kart rengi = devreden faiz ✓ |
| RF-20261008-020 | MEDIUM | RESOLVED | 2026-10-10 — hedef/kapı şişmesi yok (ödenmemiş gümrük/navlun sözleşmede yalnız bilgi satırı, D-P03, üretimde doğrulandı); gümrük rezervi ödeme takviminden (CFO-018 kısım 1); AI CFO borç tahmini artık `cfo_import_project.customsEstimateTry` / eski `cfo_servet_kalem` etiketine dayanmıyor — gümrük çıkışı borç kapatmaz, eksik veri üretmez (testli); veri: 07.26sea GUMRUKTE 3.287.072,31 = takvim dilimleri, ROMANYA-2408 400k defter = takvim |
| RF-20261008-021 | LOW | RESOLVED | 2026-10-09, CFO-021 |
| RF-20261008-022 | LOW | RESOLVED | 2026-10-09, CFO-021 |
| RF-20261008-023 | LOW | OPEN | latent |
| RF-20261008-024 | LOW | OPEN | CFO-024 |
| RF-20261008-025 | HIGH | RESOLVED | 2026-10-09, 120000 + 130000 üretimde |
| RF-20261008-026 | MEDIUM | MITIGATED | otomatik TCMB kaydı (CFO-003); Ekim kuru 15'inde, o zamana kadar önceki ay işaretli |
| RF-20261008-027 | MEDIUM | OPEN | ekonomik bulgu (INFO) + 32 SKU UNKNOWN→0 (MEDIUM) |
| RF-20261009-028 | HIGH | RESOLVED | 2026-10-09, CFO-010 kısım 2 |
| RF-20261009-029 | MEDIUM | OPEN | veri düzeltmesi (Cowork/Alperen) |
| RF-20261009-030 | LOW | OPEN | veri düzeltmesi (insan) |
| RF-20261009-031 | LOW | MITIGATED | capture migration kuralı |
| RF-20261010-033 | MEDIUM | RESOLVED | 335 + 8 üründe CFO maliyeti ithalat motorundan; CFO-029 otomatik türetme kodu hazır (Excel dışı 143 ürün dahil, ilk üretim koşusu 10.10 05:00 TR) — RESOLVED ilk koşu doğrulanınca |
| RF-20261009-032 | MEDIUM | IN_PROGRESS | 10.10 karar (Alperen): EPTT tahmini komisyon kanal marjında (measured=false) ✓; 6 kanal + FBA oran belgesine kadar UNKNOWN (%20 yer tutucu yok); kalan: oran belgeleri / hakediş dökümleri (CFO-027 yolu) |
| RF-20261010-034 | MEDIUM | RESOLVED | RMB/USD dört değer (kural 6,7 · elle 6,8 · ayar 6,72 · kod 7,2/7,0) → tek kaynak MonthlyExchangeRate (6,7), sabit yedek yok; 335 ürün düzeltildi (+7.405,67 TL); kalan: 8 + 141 ürün CFO-029 ilk koşusu |
| RF-20261010-035 | LOW | RESOLVED | 2026-10-10, CFO-030 ✅ — migration 140000 üretimde (Alperen açık onayı; c4e8595a…): kapasite = pozisyon + tam ticari limit (SQL 3 fonksiyon + kapasite alarmı + stres testi); bugün sayılar aynı |
| RF-20261010-036 | CRITICAL | RESOLVED | 2026-10-10, migration 130000 üretimde (Alperen açık onayı "Evet, uygula"; checksum 32b55afe…): 40005100051 `gercek_stok=false`, stok satırına yalnız beyan edilen bağlı 8.083,33 TL; net sermaye 2.401.170,03 → 1.383.530,52 (kimlik farkı 0) |
| RF-20261010-037 | MEDIUM | RESOLVED | 2026-10-10, CFO-031 ✅ — Alperen teyidi "3 ürün stok doğru": AL-CAM03 1.940 · M-BANYOMİX 1.194 · 272726161636 3.001 adet gerçek (`cfo_change_log` stok/teyit); gerçek stok tek kural `cfo_stok_deger.gercek_stok` |
| RF-20261010-038 | HIGH | RESOLVED | 2026-10-10 — üretimde döngü tamamlandı: 12:20 UTC `daily_trendyol` çıktıları (`cfo-workflow-v1` görev + hedef gözlemleri) yazıldı, `cycle_unavailable`/3B001 yok |

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
- **severity:** MEDIUM · **status:** IN_PROGRESS (2026-10-09: kod + migration 230000 hazır, üretim onayı bekliyor; o zamana kadar atıf açıklanamayan farkı gösterir) · **commit:** 422a6db
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

### RF-20261010-034 — RMB/USD kuru dört farklı değer; CFO maliyeti kuraldan farklı kurla (YENİ, MEDIUM, MITIGATED aynı gün)
- **date:** 2026-10-10 · **severity:** MEDIUM · **status:** MITIGATED
- **finding:** Alperen'in maliyet Excel'i kuralı RMB/USD 6,7. PR #248 335 ürünü 6,8 (MonthlyExchangeRate 2026-06) ile türetti. `lib/fx/current.ts` yedekleri cfo_settings 6,72 ve kod 7,2; `calcImportCost`/`rmbToUsd` kur yoksa sessizce 7,2; ürün sayfaları 7,0.
- **evidence:** 335 ürün 6,8 ile yeniden türetildiğinde 334'ü kuruşu kuruşuna tutuyor; ölçüm 6,7 → LCNRV +7.405,67 TL (78 SKU).
- **economic_risk:** maliyet ~%1,5 düşük, net sermaye 7,4k TL eksik (8 ithal ürün ile +1,2k). Kur girilmezse UI ve CFO-029 uydurma 7,2 ile maliyet üretebilirdi.
- **fix (2026-10-10):** RMB yalnız MonthlyExchangeRate'ten; yoksa null (maliyet hesaplanmaz); tüm sabit yedekler kaldırıldı + CI kontrolü (`fx-current.test.ts`); 2026-10 = 6,7 kaydı; 335 ürün korumalı düzeltildi (`docs/maliyet/2026-10-10-rmb-6-7-tek-kaynak.md`). Kalan: 8 + 141 ürün CFO-029 ilk koşusunda.

### RF-20261010-033 — Ürün USD maliyeti hava kargo + ithalat KDV'si dahil kurulmuş görünüyor (YENİ, MEDIUM, karar bekliyor)
- **date:** 2026-10-10 · **severity:** MEDIUM (doğrulanırsa HIGH) · **status:** OPEN
- **finding:** Alperen'in maliyet Excel'iyle eşleşen 290 üründe Excel'den hesaplanan iniş maliyetinin sistemdeki `unitCostUsd`'ye oranı (medyan): deniz/KDV hariç 0,68 · deniz/KDV dahil 0,82 · hava/KDV hariç 0,83 · **hava/KDV dahil 0,99**. Sistem maliyeti hava kargo + indirilebilir ithalat KDV'si dahil kurulmuş gibi. Mal deniz yoluyla geliyor ve ithalat KDV'si indiriliyorsa maliyet ≈%46 yüksek → marj düşük, stok/LCNRV yüksek.
- **evidence:** `docs/maliyet/2026-10-10-maliyet-excel-eslestirme.md` (Bulgu bölümü), CSV. CFO-007 (KDV esası) ve CFO-025 (çarpan 1,27–84) ile tutarlı.
- **fix:** Alperen kararı (ürün bazında deniz/hava; maliyet KDV hariç mi) → onaylı veri yazımı (CFO-011). Bu analiz veri değiştirmedi.
- **güncelleme 2 (2026-10-10, MITIGATED):** Alperen "tam yetkilisin" → 335 üründe `unitCostUsd/unitCostTry` motor maliyetine çekildi (257 deniz / 78 hava); net sermaye 2.405.400 → 2.266.989 TL. Kalan CFO-029.
- **güncelleme 2026-10-10:** Alperen: deniz/hava kararını ithalat öneri motoru versin. 336 üründe motor girdileri (RMB, ağırlık, GTİP gümrüğü, kart masrafı) yazıldı, tercih alanı boşaltıldı. CFO'nun kullandığı `unitCostTry` henüz eski (hava + KDV dahil görünen) değerde → kalan iş: `unitCostUsd/unitCostTry`'nin motor maliyetinden türetilmesi (net sermayeyi düşürür; ayrı onay).

### RF-20261009-032 — Komisyonu kayıtsız kanallar (YENİ, MEDIUM, veri)
- **date:** 2026-10-09 · **severity:** MEDIUM · **status:** OPEN
- **finding:** son 30 gün N11/Amazon/Pazarama/Idefix/Temu/Koçtaş 165 satır, 186.213 TL — komisyon çoğunlukla NULL; ePTT 98/128 NULL. Motor bu satırları UNKNOWN sayıyor (komisyon > 0 örneği yok → geçersiz), yani CFO sayısı uydurma 0 kullanmıyor; ama `commissionTry` toplayan raporlar 0 gösteriyor ve kanal marjı ölçülemiyor. Cowork tahmini ~312,6k TL/yıl.
- **neden HIGH değil:** motor UNKNOWN≠0 kuralına uyuyor (CFO-014); hata sayı değil kapsam. **fix:** CFO-028 (oran belgesi → onaylı oran; CFO-027 kanıt yolu).

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

## 2026-10-10 — Üretim senkronu (110000, CFO-013) + CFO-006 kapanışı RED FLAG PASS

### RF-20261008-015 — güncelleme: RESOLVED (2026-10-10, CFO-013 ✅)
- Migration `20261010110000_cfo_tek_nakit_yolu` üretimde (Claude Code, Alperen onayı; checksum dc105775…). Vadesi geçmiş ödenmemiş çıkış,
  tahsil edilmemiş alacak ve diğer tahsilat projeksiyonda BUGÜN ("GECIKMIS"); eski motor aynı kural. Üretim: projeksiyon dibi −3.743.079 =
  takvim dibi −3.743.078,66; 120 günde en büyük günlük fark 0,52 TL (tahmin kuruş yuvarlaması). Test `cfo-tek-nakit-yolu` her gün eşitliği doğrular.

### RF-20261008-010 — güncelleme: RESOLVED (2026-10-10, CFO-006 ✅)
- Bulgunun dört bileşeni: engine.ts (TS tek kural, 09.10) · `cfo_odeme_gunluk` açılışı şahsi dahil (110000 ile şirket nakdi) · `/cfo/odemeler`
  kapasitesi (`like '%ŞAHSİ%'` + şahsi bakiye dahil açılış → `cfo_hesap_sahsi`, `lib/cfo/payment-capacity.ts`; bakiyesi bilinmeyen hesabın limiti
  kapasiteye girmez) · `cfo_servet` nakdi şahsi dahil → bilinçli kapsam: net sermaye/borç hedef metrikleri D-P03 gereği şahsi kart/KMH'yi dahil
  eder, nakit simetrik dahil (bugün 83,29 TL); likidite (dip, kapasite, mutabakat) yalnız şirket. Üretim taraması: şahsi kalıbını kendi kuran
  görünüm/fonksiyon kalmadı; kod tabanında kalıp koruması `cfo-ownership` testinde (CI).

### RF-20261010-035 — KMH kapasitesi iki ayrıştırma: eksi bakiyede kullanım iki kez düşer (YENİ, LOW, latent)
- **date:** 2026-10-10 · **severity:** LOW (bugün etki 0) · **status:** OPEN
- **finding:** `cfo_nakit_kapisi.nakit_try` banka bakiyelerinin toplamıdır (eksi bakiye dahil), `bos_kmh_try` = limit − kullanılan. `cfo_kaynak_yeterliligi`
  ("GENEL TICARI KAYNAK" = nakit + boş KMH; "ACIK" = boş KMH + dip), `cfo_onucus_temel` ve `cfo_gumruk_dilim` ikisini toplar. Eksi bakiyeli hesapta
  (ör. −200.000, limit 500.000) kullanılan KMH hem nakitte hem boş limitte düşer: kaynak 100.000 görünür, gerçek 300.000. `/cfo/odemeler` doğru
  ayrıştırır (pozisyon + tam limit).
- **evidence:** üretim 10.10 tanım taraması; bugün eksi bakiyeli şirket hesabı yok → fark 0.
- **economic_risk:** yön temkinli (açık olduğundan derin) ama KMH kullanıldığı gün kaynak yeterliliği/ön uçuş gereksiz KIRMIZI verip siparişi durdurabilir.
- **recommended_fix:** CFO-030 — kapasite tek ayrıştırma (pozisyon + tam limit) tek görünümde; tüketiciler oradan okur (migration, onay gerekir).

## 2026-10-10 — CFO-028 kararları RED FLAG PASS

### RF-20261009-032 — güncelleme (2026-10-10, CFO-028 kararları; MEDIUM, OPEN → IN_PROGRESS)
- Alperen "Onaylıyorum": (1) EPTT tutarı boşken Entegra oranı × KDV dahil toplam = TAHMİNİ komisyon — `lib/cfo/commission-estimate.ts` (tek SQL kuralı + TS
  aynası), `lib/cfo-agent/snapshot.ts` kanal marjı (ölçülmüş SKU oranı yoksa; kayıtlı tutar önce; bir satırda oran da yoksa kanal komisyonu bilinmiyor),
  `/cfo/belgeler` ayrı "Tahmini" sütunu. SKU oran ölçümü (120 gün kuralı) yalnız `commissionTry` okumaya devam eder; ham kayıt değişmedi.
  Üretim (salt-okunur, son 30 gün EPTT): ciro 186.224, kayıtlı 4.466 (30 satır) + tahmini 20.445 (91 satır) = 24.911 TL (%13,4); bilinmeyen satır 0.
- (2) N11, Amazon, Pazarama, Koçtaş, Idefix, Temu, FBA: UNKNOWN kalır, %20 yer tutucu kullanılmaz. (3) 2 belge kategorisi düzeltildi (günlüklü).
- RESOLVED için: 6 kanal + FBA'nın onaylı oranı (belge) ya da hakediş dökümü.

## 2026-10-10 — CFO-003 kalan RED FLAG PASS

### RF-20261008-003 — güncelleme (2026-10-10, CFO-003 kalan; HIGH, MITIGATED kalır)
- **Kod (yayında):** eski motor (`lib/cfo/engine.ts`) USD/TRY'yi `lib/fx/current.ts` tek kaynağından alır (`lib/cfo/queries.ts`); kaynak sabit
  varsayılana düştüyse kur BİLİNMİYOR (null) ve USD'den türeyen eski alanlar (yoldaki ithalat TL'si, servet USD, hedef) null — önceden
  `cfo_settings.usdTryRate || 1` (kur yoksa 1 USD = 1 TL). `/cfo` rozeti "İşlem kuru · kaynak" (hedeflerin stratejik kuru servet kartında ayrı),
  `/cfo/gumruk` kur yoksa TL "bilinmiyor". Bugün etki: motor kuru 49,1976 (cfo_settings) → 48,98 (cfo_kur 2026-10; diğer sayfalarla aynı).
- **Yeni bulgu (SQL):** `cfo_ciro_hedef`, `cfo_ithalat_oneri`, `cfo_ithalat_oneri_ozet` `COALESCE(cfo_settings.usdTryRate, 48.5)`; `cfo_take_snapshot`
  `COALESCE(NULLIF(usdTryRate,0),1)`; `cfo_servet.kur` son snapshot'ın kuru (cfo_settings'ten gelen kur döngüsü). Migration
  `20261010120000_cfo_kur_tek_kaynak`: hedef/servet/snapshot STRATEJİK kur (TCMB, Goal Engine kuralı), ithalat önerisi İŞLEM kuru
  (lib/fx/pick ile aynı sıra, eşlik testli), kur yoksa NULL. Test `cfo-kur-tek-kaynak` (CI). **Üretim uygulaması bekliyor** (otomatik izin
  sınıflandırıcısı üretim DDL'ini durdurdu; Alperen izni ya da elle uygulama). Beklenen etki: servet USD 127.813 → ≈129.495, Eylül ciro
  USD 36.129 → ≈36.604, ithalat önerisi kuru 49,1976 → 48,98; TL tutarları değişmez.
- RESOLVED için: migration 120000 üretimde + parmak izi senkronu.

## 2026-10-10 — CFO-008 tek ciro kaynağı RED FLAG PASS

### RF-20261008-009 — güncelleme (2026-10-10, CFO-008; HIGH, IN_PROGRESS → MITIGATED)
- `lib/cfo/revenue.ts`: TEK ciro kaynağı = Goal Engine'in okuduğu satırlar (`fm_sales_canonical_snapshot`, disposition COUNTED — iptal/iade/tedarik
  edilemedi/test/mükerrer hariç; Trendyol API + Entegra (IDEASOFT dahil) + Alfashome; KDV dahil, KDV hariç yan gösterge), tamlık Goal Engine kuralıyla
  (hafıza tazeleme − 1, her kaynağın okunma günü − 1; eksik gün 0 sayılmaz). Migration yok (okuyucu rolünün okuma yetkisi zaten var).
- Bağlanan yüzeyler (önce → sonra, üretim 10.10 salt-okunur): `/cfo` + `/cfo/ayarlar` 14 gün (elle 1.147.735 @ 23.08 → 903.254, son tam gün 04.10);
  gelir kaldıraçları aylık (cfo_satis_birim_duz 1.859.349 → 2.015.623); `/cfo/kazananlar` hedef kartı Eylül (cfo_ciro_hedef, maliyetsiz SKU'lar hariç
  1.777.442 → 1.931.793; USD stratejik kurla); `/admin/sermaye` 90 gün (yalnız Trendyol 4.104.926 → tüm kanallar 6.046.869); borç tahmini (Entegra
  damgalı 30 gün → son 30 tam gün); AI CFO Alfashome kanıtı (ödeme durumu boş → 0 gösteriyordu; artık Goal kuralı, Ekim 3 sipariş 14.865 TL —
  kanonik snapshot bir sonraki hafıza tazelemesinde Alfashome satırlarını alacak).
- Doğrulama: 1–9 Ekim tek kaynak 479.615,74 = Goal hafızası (`fm_memory_sales_company_day`) 479.615,74. Test `cfo-revenue` (CI).
- RESOLVED için: AI CFO snapshot günlük satış karşılaştırması (REVENUE_DEVIATION, `/admin/ai-cfo` "Dün ciro") tek kaynağa; artık sayfa okumayan
  `cfo_ciro_hedef` görünümü kaldırılabilir (migration). Satır düzeyi kârlılık görünümleri (cfo_satis_birim_duz, cfo_aylik_urun_kar) bilinçli ayrı — manşet ciro değil.

## 2026-10-10 — CFO-012 karar hafızası RED FLAG PASS

### RF-20261008-014 — güncelleme (2026-10-10, CFO-012 kod; MEDIUM, OPEN → IN_PROGRESS)
- **Beklenen değer zorunlu:** yeni karar yalnız `/cfo/kararlar` formu → `createHamleAction` (CFO_READ + CFO_WRITE) ile; `validateNewHamle` ölçülebilir
  metrik + başlangıç + beklenen SAYI + tarih ister. Cowork doğrudan SQL ile yazarsa okuma tarafı yakalar: 10.10 sonrası açık karar eksikse
  "Beklenen değer eksik" (listenin başında, AI CFO kanıtında).
- **Ölçüm yazımı:** `safeMeasureDecisions` her gece (xml-sync after()) kontrol noktası gelen kararlar için `cfo_hamle_olcum`'a yalnız INSERT
  (borç/kamu/FBA o günün değeri; kart/KMH bugünkü bakiye, notlu). Tekrar koşu yazmaz (NOT EXISTS + advisory kilit); kapalı/elle ölçülen karar ve
  verisi olmayan gün atlanır (0 yazılmaz). Ham finansal veri değişmez; mevcut 14 ölçüm satırı ve karar satırları değişmez.
- **Kalibrasyon skoru:** isabet / ortalama hata / eğilim (iyimser–temkinli) / kapsam; açık kararda hedef tarihindeki ölçümden.
- **Motor önerileri:** sermaye planının borç kapama adımları onaylanınca beklenen değerli karar olarak kaydedilir (taslak; kaydedilmeyen öneri karar değil).
- Bağımsız inceleme: aynı ölçüm iki kez yazılır mı? Hayır — kontrol noktası ve sonrası tarihli satır varsa yazılmaz; iki checkpoint aynı koşuda
  ayrı satır. Canlı bakiye geçmiş tarihe yazılır mı? Hayır — tarih = ölçüm günü. Yetkisiz yazma? Form yazma izni ister (`rbac-write-paths`).
  Kalan risk: eski 12 karar beklenen SAYI'sız (kalibrasyon kapsamı 3/15) — geriye dönük uydurulmaz.
- RESOLVED için: ilk otomatik ölçümün üretimde gözlenmesi (H11 31.10 gecesi, H09/H10 01.11 gecesi).

## 2026-10-10 — CFO-008 kalan (AI CFO satış karşılaştırması) RED FLAG PASS

### RF-20261008-009 — güncelleme 2 (2026-10-10, CFO-008 kalan; HIGH, MITIGATED kalır → üretim gözleminde RESOLVED)
- AI CFO snapshot satış dönemleri (dün, son 7/30 gün, ay başından) ve REVENUE_DEVIATION karşılaştırması `cfo_satis_siparis` (yalnız Entegra)
  + Trendyol API tahmininden → TEK ciro kaynağına (`lib/cfo/revenue.ts` günlük serisi, `fm_sales_canonical_snapshot` COUNTED). Kanıt kaynağı da.
- **Yeni bulgu (düzeltildi):** eski yol tahmini dünü GERÇEK geçen haftayla karşılaştırıp "tam" sayıyordu → sahte sapma alarmı riski (üretim 09.10:
  tahmini 73.683 ↔ gerçek 50.953, +%45). Artık tahmini gün `complete=false`; karşılaştırma yalnız tüm kaynakların tam olduğu günlerde.
- Üretim ölçümü (10.10, salt-okunur): son tam gün 04.10 66.937 ↔ 66.179 (+%1,1); son 7 tam gün −%1,3; son 30 tam gün −%8,8.
- Bağımsız inceleme: Entegra haftalık yükleme gecikmesinde alarm susar mı? Evet, tam gün ilerlemez → karşılaştırma aynı dönem anahtarında kalır
  (`…:<son tam gün>`), yeni alarm üretmez; kaynak 8 günden eskiyse `sourceFresh=false`. Satır düzeyi kârlılık (`cfo_satis_birim_duz`,
  `cfo_satis_siparis` sipariş tutarı payı) bilinçli ayrı — manşet ciro değil.
- RESOLVED için: ilk üretim AI CFO koşusunda (10.10 04:17 UTC) karşılaştırma anahtarlarının `lastCompleteDay:2026-10-0x` ve değerlerin kanonik
  toplamla aynı olduğunun gözlenmesi. `cfo_ciro_hedef` (okuyan kod yok) CFO-024 ile kaldırılacak.

## 2026-10-10 — CFO-029 ilk üretim koşusu + sanal stok RED FLAG PASS

### RF-20261010-033 — güncelleme: RESOLVED (2026-10-10, CFO-029 ilk otomatik koşu)
- 10.10 02:32 UTC xml-sync sonrası CFO-029: 153 ürün (149 ithal + 4 yalnız USD — CFO-025) / 440 alan, değerlenen stok farkı +26.334,22 TL KDV dahil;
  kuru çalıştırma 149 / 436 / +26.001,44 (+4 yalnız USD ürün, +332,78 TL — CFO-025 aynı PR'da yayına girdi). Ürün değerleri kuru çalıştırma tablosuyla birebir
  (AL-PTZ04 3.977,14; TE-UV82TELSIZ 695,00; 4140404044444 3.491,67 …). USD maliyetli 494 ürünün 494'ü TL = USD × 48,98; 48,50'de kalan ürün yok.
  Hava + KDV dahil görünen maliyet artık motor maliyeti (her gece yeniden türetilir).

### RF-20261010-034 — güncelleme: RESOLVED (2026-10-10)
- Kalan 8 + 141 ürün ilk koşuda RMB/USD 6,7 (`MonthlyExchangeRate` 2026-10) ile türetildi; özet notu "RMB/USD 6.7 (elle 2026-10)". Dört değer → tek kaynak.

### RF-20261010-036 — Sanal stok net sermayede gerçek stok sayılıyor (YENİ, CRITICAL)
- **date:** 2026-10-10 · **severity:** CRITICAL · **status:** OPEN (FIX READY: migration `20261010130000_cfo_sanal_stok_istisna`, bekletilen)
- **finding:** `cfo_stok_istisna` (insan beyanı — 40005100051 Krom Banyo Bataryası: "Stok SANAL … bağlı sermaye SANAL", gerçek bağlı 9.700 TL;
  Alperen 31.08, uygulamada teyit 07.09) yalnız ölü stok kurallarında uygulanıyor. `cfo_stok_deger.gercek_stok` bu SKU'yu gerçek sayıyor →
  net sermaye sözleşmesi stok satırı (LCNRV), Goal Engine `net_capital_try` v3 ve hedef ilerlemesi, snapshot, sermaye verimliliği (fazla stok →
  "serbest bırakılabilir nakit" = plan bütçesi), sermaye sağlığı ve AI CFO bağlı sermaye kanıtı 2.513 sanal adeti değerliyor.
- **evidence (üretim, salt-okunur, 10.10 02:40 UTC):** 40005100051 LCNRV 1.025.723 TL (stok satırının %31'i). Net sermaye 2.401.170 → düzeltmeyle
  ≈1.383.531 TL (−1.017.640; TCMB 48,5585 ile ≈49,4k → ≈28,5k USD).
- **fix (kod, bu PR):** migration 130000 — `gercek_stok` istisna SKU'yu dışlar (tüm tüketiciler aynı kuraldan); `cfo_metrik_net_sermaye` stok
  satırına yalnız beyan edilen bağlı sermayeyi (/1,2) ekler (CFO-017 kimliği korunur). Test `cfo-sanal-stok` (PGlite, CI). **Üretim uygulaması
  Alperen onayı bekliyor** (otomatik izin sınıflandırıcısı üretim DDL'ini durduruyor).
- **açık soru (Alperen):** 40005100051 adedi XML senkronunda günde ~20 düşüyor (05.10 2.611 → 10.10 2.513); beyan "stok manuel tutuluyor,
  düşülmüyor" diyordu. Beyan hâlâ geçerli mi (stok sanal)? Migration beyanı uygular.

### RF-20261010-037 — Gerçek stok dört farklı kuralla belirleniyor (YENİ, MEDIUM)
- **date:** 2026-10-10 · **severity:** MEDIUM · **status:** IN_PROGRESS
- **finding:** "hangi stok gerçek" kuralı: (1) net sermaye / `cfo_stok_deger` — kukla adetler (500/998/999/1000/9999/10000) hariç ve ≤5.000;
  (2) AI CFO `isDummyStock` — yalnız kukla adetler; (3) CFO-029 etki toplamı ve `cost_jump` alarmı — yalnız 1–999; (4) ithalatçı
  (`lib/importer-cost.ts`) — ≥1.000 "sipariş üzerine temin" (dropship). CFO-029'un ilk koşusunda M-BANYOMİX (1.194 adet; %120 elle gümrük → %52,6
  GTİP yasal yükü, birim TL 402,85 → 318,50) net sermayeyi −83.928 TL değiştirdi ama (3) kuralı yüzünden ne kuru çalıştırma toplamında ne alarmda
  görüldü: koşunun net sermayeye gerçek etkisi −65.470 TL (kuru çalıştırmanın ima ettiği ≈ +21.900 değil).
- **fix (kod, bu PR):** CFO-029 etki toplamı ve `cost_jump` alarmı net sermayenin kuralından (`cfo_stok_deger.gercek_stok`) — tek kaynak.
- **açık soru (Alperen):** 1.000–5.000 adetlik 3 SKU net sermayede 1.175.248 TL LCNRV: AL-CAM03 1.940 adet (791.843 TL; XML'de yok, stok 10.07'den
  beri senkronlanmadı, 443 adet logsuz elle düzeltme), M-BANYOMİX 1.194 (316.908 TL), 272726161636 3.001 (66.497 TL). İthalatçı ≥1.000'i dropship
  sayıyor. Gerçek mi? Değilse `cfo_stok_istisna`'ya beyanla eklenir (migration 130000 sonrası net sermayeden otomatik çıkar).

## 2026-10-10 — CFO çalışma döngüsü 3B001 RED FLAG PASS

### RF-20261010-038 — CFO çalışma döngüsü her senkronda bağlam aşamasında düşüyor (YENİ, HIGH, MITIGATED aynı gün)
- **date:** 2026-10-10 · **severity:** HIGH · **status:** MITIGATED
- **finding:** `cfo_change_log` "CFO çalışma döngüsü — cycle_unavailable" 09.10 02:34, 09.10 12:20, 10.10 02:33; tanı `{"stage":"context","code":"P2010",
  "databaseCode":"3B001"}` (invalid_savepoint_specification). `loadOperatingContext` her sorguyu işlem içinde SAVEPOINT ile sarıyor; bağlam/sermaye
  yükleyicileri sorguları eşzamanlı çağırıyor (`Promise.all`) → savepoint'ler iç içe geçiyor: A'nın RELEASE'i B'nin savepoint'ini de siliyor,
  B'nin RELEASE'i 3B001. Sonuç: çalışma planı (gündem, iş kalemleri, cevap okuma) iki gündür üretilmiyor; Goal Engine adımı döngüden önce koştuğu için
  hedef değerlendirmeleri etkilenmedi. Ayrıca senkron sonrası motor süre bütçesinde atlandı (10.10 02:33: senkron 174 sn; 09.10 12:20: 190 sn —
  RF-006 kapsamı; GitHub zamanlaması saatlerce gecikiyor).
- **fix (kod):** `lib/cfo-agent/savepoint-source.ts` — sorgular SIRAYA alınır (tek bağlantıda zaten sıralı; yalnız savepoint sınırları korunur).
  Yerel PostgreSQL 16 + Prisma ile yeniden üretildi (eski sarmalayıcı: 3B001; yeni: 4 eşzamanlı sorgu doğru, hatalı sorgu yalnız kendini düşürür).
  Regresyon `cfo-workflow-postgres` (CI, gerçek PostgreSQL).
- RESOLVED için: üretimde ilk tamamlanan döngü (12:00 UTC trendyol-sync ya da GitHub zamanlaması).

## 2026-10-10 — CFO motoru ve çalışma döngüsü kendi cron'larında RED FLAG PASS

### RF-20261008-006 — güncelleme (2026-10-10; HIGH, IN_PROGRESS)
- **bulgu:** senkron sonrası `after()` zincirinde motor süre bütçesine sığmıyor: 09.10 12:20 (trendyol, senkron 190 sn) ve 10.10 02:33 (xml, 174 sn)
  "CFO motoru atlandı (süre bütçesi)". RF-038 düzeltmesiyle döngü artık tamamlanacağından zincir daha da uzayacak → motor sabahları hiç koşmayacaktı.
  GitHub zamanlaması saatlerce gecikiyor (09.10'daki "04:17" koşuları 11:20 / 16:31 / 18:45 UTC'de başladı). 10.10 sabahı motor koşusu yok.
- **düzeltme (kod):** `/api/cron/cfo-engine` — motor + sağlık/WhatsApp alarmı (önce/sonra) kendi Vercel cron'unda, tam 300 sn: 03:xx UTC (xml-sync
  sonrası, Cowork 08:00 TR okumasından önce) ve 13:xx UTC (trendyol-sync sonrası). Yetim `cfo-cycle` cron'a bağlandı: 06:xx UTC (sabah
  snapshot'ından sonra Goal v3 aynı sabah). Hobby planı: proje başına 100 cron, her biri günde bir, ±59 dk (Vercel belgesi). Aynı saat
  dilimindeki ikinci "scheduled" koşu runner dilim anahtarıyla tekrarlanmaz. Koruma testi `vercel-crons` (günlük ifade, route + CRON_SECRET,
  ≤300 sn, motor senkronlardan sonra).
- **kalan:** WhatsApp şablon + alıcı yapılandırması (D-P07, Alperen); ilk cron koşularının üretimde gözlenmesi.

## 2026-10-10 — CFO-023 sayfa-motor eşlik RED FLAG PASS

### RF-20261008-019 — güncelleme (2026-10-10, CFO-023; MEDIUM, IN_PROGRESS kalır)
- **düzeltme (kod):** `/cfo/olu-stok` `ORAN_ESIGI=0.2` → `cfo_settings.deadStockSalesRatioPct` (görünüm `cfo_olu_stok` ile aynı SQL ifadesi;
  üretim ayarı %20, görünüm ayarı okuyor — salt-okunur doğrulandı); `/cfo/sermaye` gelir kaldıraçları etiketi ve `/cfo/calisan` hedef metni
  "100.000 USD" → `cfo_settings.monthlyRevenueTargetUsd` (ayar yoksa bilinmiyor); `/cfo/kazananlar` maliyet kapsamı eşiği %85 → motorun
  `getCfoConfig().minCostCoveragePct` (%95). Üretim etkisi (salt-okunur): 2026-05 (%87,1) ve 2026-03 (%86,2) artık "güvenilir" değil — motor bu
  kapsamda marj/kâr kurallarını zaten susturuyordu; sayfa aynı ayı güvenilir gösteriyordu.
- **koruma:** `__tests__/cfo-page-parity.test.ts` (CI) — sabit kalıntılar yorum dışı kodda yasak + 8 kaynak bağı; eski kodda 5 ihlalin hepsi yakalandı.
- **kalan:** 50.000 TL uyarı (`/cfo/odemeler`), KPI renk eşikleri (`/cfo` boş KMH 1,5M / 750k) → CFO-020.

### RF-20261008-003 — güncelleme (2026-10-10, CFO-023; HIGH, MITIGATED kalır)
- `/admin/yeni-urunler/[sku]` tahmini marjı sabit 48,5 kurla hesaplıyordu ("Kur 48,50 varsayıldı") → güncel kur tek kaynağı (`lib/fx/current`
  `getCurrentFx`, kaynak etiketi sayfada). app/ altında yorum dışı 48,5 kalmadı (eşlik testi korur). SQL tarafı 48,5 / 1 yedekleri migration 120000'de
  (bekletilen) — RESOLVED onun üretim uygulamasıyla.
- Yeni red flag yok.

## 2026-10-10 — Yoldaki mal / gümrük rezervi tek kaynak RED FLAG PASS

### RF-20261008-020 — güncelleme (2026-10-10; MEDIUM, OPEN → MITIGATED)
- **ölçüm (üretim, salt-okunur):** ödenmemiş gümrük/navlun 3.787.072 TL `cfo_metrik_borc()` sira 90 ve `cfo_metrik_net_sermaye()` sira 91'de
  yalnız BİLGİ satırı — finansal borç (5.889.903,80) ve net sermaye toplamına girmiyor (D-P03). "Borç hedefini/kapıyı 3,79M şişiriyor" kısmı
  CFO-002 ile kapanmış. Aynı yükümlülük dört yerde: ödeme takvimi (`cfo_cash_event` VERGI_GUMRUK: 07.26sea 14.10 1.965.468 + 21.10
  1.321.604; ROMANYA-2408 10.11 400.000 "tutar kesin" 09.10), defter `cfo_yoldaki_mal` (07.26sea 3.287.072 = takvim ✓; ROMANYA-2408
  500.000 ✗), `cfo_import_project` (24.08'den beri güncellenmemiş: 07.26sea YOLDA / 3.031.250; ROMANYA-2408 500.000; ROMANYA-PARCA
  103.818) ve elle `cfo_settings.customsReserveTarget/Date` (3.287.072 / 09.10 — tek tarih).
- **bulgu:** `/cfo` ve `/cfo/gumruk` gümrük rezervi kartı elle girilen tek tarihten hesaplıyordu → bugün "ihtiyaç tarihi 09.10, −1 gün",
  14.10 ve 21.10 arasındaki tahsilatlar sayılmıyor, ROMANYA dilimi hiç yok.
- **düzeltme (kod, CFO-018 kısım 1):** rezerv ödeme takviminin ödenmemiş VERGI_GUMRUK dilimlerinden (CFO-013 tek nakit yolu); dilim başına
  birikimli açık, bağlayıcı dilim = en büyük açık; takvimde yoksa kart yok (elle yedek yok). Tek nakit yolunda (SQL projeksiyonu) pozisyon:
  14.10 −1.682.643, 21.10 −2.975.310 (taban −3.000.000'a 24.690 TL), 09.11 −3.069.134 (taban ihlali), dip 01.12 −3.724.848.
- **kalan (veri, insan/Cowork — üretim ham verisine Code yazmadı):** ROMANYA-2408 `cfo_yoldaki_mal.odenmemis_vergi_try` 500.000 → takvimdeki
  kesin 400.000 (bilgi satırı 100.000 fazla); `cfo_import_project` 07.26sea durum/gümrük tahmini güncellenmeli ya da tüketicileri (borç
  tahmini `importsPaid`/gümrük eşleştirmesi, `/cfo/gumruk` parti tablosu) takvim/deftere taşınmalı (CFO-018).
- Yeni red flag yok (taban ihlali zaten `floor_breach` alarmı + projeksiyon dibinde görünür).

## 2026-10-10 — Durum kaydı mutabakatı (Alperen: sanal stok · otomasyon kanıtı · özet tutarsızlığı)

- **Özet tutarsızlığı (düzeltildi):** frontmatter `open_critical: 2` / `open_high: 5` doğruydu; belge başındaki "Açık özet" satırı eski
  "CRITICAL 1 · HIGH 4" idi. Durum kaydından yeniden sayıldı: CRITICAL 2 (RF-20261008-001 IN_PROGRESS, RF-20261010-036 OPEN), HIGH 5
  (RF-20261008-002 IN_PROGRESS, RF-20261008-003 MITIGATED, RF-20261008-006 IN_PROGRESS, RF-20261008-009 MITIGATED, RF-20261010-038 MITIGATED).
  Özet satırı artık kimlikleri de taşır ve tarih taşımaz. Kalıcı koruma: `cfo-governance-drift` 3b — Açık özet satırı Durum kaydıyla
  sayı + kimlik olarak birebir; beş belgede başka sayı özeti ancak "tarihsel" etiketiyle (Master Plan'daki iki denetim-anı sayısı etiketlendi).
  Eski özet satırıyla test FAIL verdiği doğrulandı.
- **RF-20261008-006 — otomasyon kanıtlanmadı:** kod birleşti ve CI yeşil, fakat ilk gerçek zamanlanmış koşu henüz yok (yukarıdaki satır).
  RESOLVED/MITIGATED'e geçiş yalnız `cfo_run`'da cron kaynaklı tamamlanmış motor koşusu + `cfo-cycle` tamamlanması gözlenince.
- **RF-20261010-036 — sanal stok:** yeniden ölçüldü (yukarıdaki satır); migration 130000 yalnız Alperen'in açık üretim onayıyla uygulanır.

## 2026-10-10 — Sanal stok düzeltmesi üretimde RED FLAG PASS

### RF-20261010-036 — güncelleme: RESOLVED (2026-10-10, migration 130000)
- **onay:** Alperen açık onay ("Evet, uygula", 2026-10-10 ~08:50 UTC); 40005100051 sanal beyanı `cfo_stok_istisna` notunda (stok manuel, fiilen M-BANYOMİX gidiyor).
- **ön koşul (salt-okunur):** üretim `cfo_stok_deger` ve `cfo_metrik_net_sermaye()` gövdeleri migration'ın tabanıyla birebir (fark yalnız `NOT EXISTS` ve `i` CTE'si);
  bekletilen 120000 başka nesnelere dokunuyor (çakışma yok); görünüm reloptions yok, ACL'ler `CREATE OR REPLACE` ile korunur.
- **uygulama:** tek işlem — migration dosyası birebir + `_prisma_migrations` satırı (checksum 32b55afe… = repo dosyası sha256).
- **doğrulama:** 40005100051 `gercek_stok=false`; sira 3 stok 3.336.030,79 → 2.318.391,28 (beyan edilen 9.700 TL / 1,2 = 8.083,33 dahil); NET SERMAYE
  2.401.170,03 → **1.383.530,52 TL**; kimlik nakit 151.553,36 + alacak 1.045.155,68 + stok 2.318.391,28 + yoldaki 3.758.334,00 − kredi 3.373.797,12 − kart 2.516.106,68 = 1.383.530,52 (fark 0);
  görünüm ACL (service_role, cfo_acceptance_reader) ve fonksiyon ACL değişmedi; parmak izi yalnız fn/view satırlarında değişti (yeniden ölçüldü).
- **etki:** bir sonraki snapshot / Goal v3 tazelemesi düzeltilmiş net sermayeyi yazar (bugünkü 05:13 snapshot eski tanımla, 2.401.170,03 — tarihsel).
  Sermaye verimliliği / sağlığı ve AI CFO kanıtları aynı `gercek_stok` kuralından okur. RF-037 (1.000+ adetlik 3 SKU) ayrı, açık.

## 2026-10-10 — Kur tek kaynak (migration 120000) üretimde RED FLAG PASS

### RF-20261008-003 — güncelleme: RESOLVED (2026-10-10, CFO-003)
- **onay:** Alperen açık onay ("Evet, uygula", 2026-10-10).
- **ön koşul:** üretim kopyası (bootstrap + üretimde uygulanmış migration'lar) ile üretimde 5 nesnenin (cfo_servet, cfo_ciro_hedef, cfo_ithalat_oneri, cfo_ithalat_oneri_ozet,
  cfo_take_snapshot) normalize gövde hash'leri birebir; migration öncesi/sonrası farkı yalnız kur ifadeleri (sonraki migration'ların değişiklikleri korunuyor).
- **uygulama:** tek işlem, migration dosyası birebir + `_prisma_migrations` (28a1f877… = dosya sha256). Sonrası 5 hash üretim kopyasının "sonra" hash'leriyle birebir; ACL'ler korundu.
- **doğrulama:** `cfo_servet.kur` 48,5585 (TCMB Eylül; önceki: son snapshot'ın cfo_settings'ten gelen 49,1976'sı — döngü), servet_usd 97.879,93; `cfo_ciro_hedef`
  Eylül 1.777.442 TL = 36.604 USD (%36,6); ithalat önerisi DENİZ 11.882,60 USD = 582.009,75 TL ve HAVA 9.984,83 USD = 489.056,97 TL (işlem kuru 48,98, `cfo_kur`).
  Sonraki snapshot USD alanlarını stratejik kurla yazar.
- **kalan (CFO dışı, LOW not):** `/products/[id]` MonthlyExchangeRate yoksa 45 varsayılanı (üretimde kur kayıtlı, devreye girmiyor). Yeni red flag yok.

## 2026-10-10 — KMH kapasitesi tek ayrıştırma (migration 140000) RED FLAG PASS

### RF-20261010-035 — güncelleme: RESOLVED (2026-10-10, CFO-030)
- **onay:** Alperen açık onay ("Evet, uygula", 2026-10-10). Gerekçe zamanlaması: 14.10 gümrük dilimi (1.965.468 TL) sonrası şirket pozisyonu eksiye düşecek
  (projeksiyon −1.682.643); eski tanımla kaynak yeterliliği / ön uçuş tam o gün kullanılan KMH kadar fazla açık gösterecekti.
- **ön koşul:** 4 nesnenin (cfo_nakit_kapisi, cfo_kaynak_yeterliligi, cfo_onucus_temel, cfo_gumruk_dilim) normalize hash'i üretim kopyasıyla birebir; sonrası birebir.
- **uygulama + doğrulama:** tek işlem + `_prisma_migrations` (c4e8595a…). Bugün nakit 151.470,07 · boş KMH 1.359.300 · tam limit 1.359.300 (eksi bakiye yok → aynı);
  kaynak yeterliliği GENEL TİCARİ KAYNAK 1.510.770, ACIK −2.146.662 (dip ihtiyacı 3.505.962), ön uçuş 8 KIRMIZI; gümrük dilimi (14.10) BAĞLAYICI AZAMİ 823.107 TL
  (%42 çekilebilir). ACL korundu; AI CFO incelenmiş `cfo_nakit_kapisi` hash'i 31466cf0… koda işlendi (motor "reviewed_source_changed" düşmesin).
- **TS:** kapasite alarmı (`health.ts`) ve stres testi (`downside-data.ts`) yol pozisyonu + `kmh_limit_try` (önce `bos_kmh_try` — aynı çift düşüş).
- Yeni red flag yok.

## 2026-10-10 — CFO-020 KPI eşikleri motor kuralına bağlandı

### RF-20261008-019 — RESOLVED (2026-10-10, CFO-020/CFO-023)
- **düzeltme (kod):** `/cfo` "Boş KMH kapasitesi" kartı sabit 1.500.000 / 750.000 TL yerine motorun `capacity_breach` alarmıyla AYNI kural
  (`lib/cfo-agent/capacity.ts` `capacityStatus`: 120 günlük nakit yolu genel KMH'yi aşarsa sarı, şirket kapasitesini aşarsa kırmızı, yol
  bilinmiyorsa nötr); alarm (`health.ts`) aynı fonksiyonu ve aynı SQL'i kullanır. `/cfo/odemeler` nakit rengi sabit 50.000 TL sarısı yerine motorun
  `floor_breach` tabanı (`cfo_settings.netPositionFloorTry`). "Kredi kartı borcu" rengi sabit 1.000.000 TL yerine devreden faiz (motor) işliyor mu.
- **üretim etkisi (salt-okunur, 10.10):** yol 14.10'da şirket KMH kapasitesini (genel 1.359.300 + amaca bağlı 750.000) aşıyor (dip −3.505.962,
  01.12) → kart artık KIRMIZI (eski sabit eşikle 1,36M boş KMH SARI görünüyordu; motor aynı anda capacity_breach alarmı üretiyordu — ekran ↔ alarm
  çelişkisi kapandı).
- **koruma:** `cfo-page-parity` sabit TL KPI eşiği kalıbını yasaklar + 3 yeni bağ; `cfo-capacity` testi (CI).

