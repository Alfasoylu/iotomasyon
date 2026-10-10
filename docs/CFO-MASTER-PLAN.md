---
last_updated: 2026-10-10 03:20 TR
current_main_commit: bc29fdd
current_phase: "Faz 1 — Metrik sözleşmesi (net sermaye/borç tek tanım üretimde; v3 Goal doğrulaması 10.10)"
current_score: 58/100
next_action: "CFO-001/CFO-002 v3 doğrulaması + CFO-017 ilk bileşenli snapshot kimliği + CFO-029 ilk otomatik maliyet koşusu (10.10 06:00 UTC) → CFO-013 üretim DDL onayı (migration 110000, main'de bekletilen) → CFO-028 kararları (EPTT tahmini komisyon, diğer kanal oran belgeleri) → CFO-027 Cowork belge okuma (11 belge kuyrukta)"
open_critical: 1
open_high: 5
score_change: "unchanged — CFO-013 kodu main'de (DDL bekletilen, onay bekliyor); CFO-028 salt-okunur ölçüm: EPTT komisyon oranı var tutar yok (≈308k TL/yıl görünmüyor), 6 kanal + FBA veri yok (≈290–390k TL/yıl) — karar Alperen'de; 4. boyut (marj) karar uygulanınca yeniden puanlanır"
---

# ALFAS CFO — MASTER PLAN (ana sözleşme)

Bu belge CFO sisteminin ana sözleşmesidir. **Her görevden önce okunur.** Plan dışına çıkılırsa nedeni buraya yazılır.
Bağlı belgeler: [CFO-METRIC-CONTRACT](CFO-METRIC-CONTRACT.md) · [CFO-BACKLOG](CFO-BACKLOG.md) · [CFO-SCORECARD](CFO-SCORECARD.md) · [CFO-RED-FLAGS](CFO-RED-FLAGS.md) ·
[CFO-DECISION-LOG](CFO-DECISION-LOG.md) · çalışma günlüğü [PDKS](PDKS.md) · [CHANGELOG](CHANGELOG.md) · [GOAL-ENGINE](GOAL-ENGINE.md) ·
[AI-CFO-RUNNER](AI-CFO-RUNNER.md) · [CFO-WORKFLOW](CFO-WORKFLOW.md) · [CFO-GOREV](CFO-GOREV.md) (Cowork okuma sözleşmesi).

---

## 1. Şirket hedefleri (2026-10-08 Alperen protokolü)

| # | Hedef | Ölçü (bugün sistemde) | Sapma |
|---|---|---|---|
| G1 | **Aylık ciro ≥ 100.000 USD** | `fm_goal.revenue_month_usd` — KDV DAHİL (`revenue_incl_vat_try`), TCMB önceki ay kuru | KDV dahil/hariç kararı yok (RF-20261008-009) |
| G2 | **Net sermaye ≥ 300.000 USD** | `fm_goal.wealth_usd` — DAR net sermaye (`cfo_snapshot.netWorthTry`) | `/cfo` sayfası GENİŞ servet gösteriyor (2,4× fark, RF-20261008-001) |
| G3 | **Toplam borç < 100.000 USD** | `fm_goal.debt_below_5m_try` — **5.000.000 TL** (eski hedef), KMH hariç, yoldaki mal borcu dahil | Hedef ve tanım güncel değil (RF-20261008-002) |
| — | Nakit tabanı (operasyonel koruma) | `net_position_floor_try` −3.000.000 TL (120 gün projeksiyon dibi) | iki ayrı taban kaynağı (env + cfo_settings) |

**Kural:** hedefler uygulama koduna dağınık yazılmaz. Tek kaynak: `fm_goal` (versiyonlu) ← `cfo_settings` alanları. Bugün 5M TL hem SQL'de
(`fm_goal_sync`) hem TS'de (`lib/cfo-agent/debt-policy.ts:2`) sabit; 100000 yedeği 6+ yerde (CFO-002).
**FX:** stratejik kur = tek kaynak (CFO-003 kararına kadar Goal Engine TCMB aylık döviz alış `fm_memory_fx_monthly` esas alınır).

## 2. North Star

**RISK-ADJUSTED SUSTAINABLE NET CAPITAL GROWTH** — net sermayenin, nakit/borç riskini kontrol altında tutarak, sürdürülebilir büyümesi.
CFO; ölçer, sorgular, risk ve fırsat bulur, sermayeyi karşılaştırır, fırsat maliyetini hesaplar, karar verir, sonucu ölçer, kalibre olur.

## 3. Yetki modeli

| Alan | Kim | Sınır |
|---|---|---|
| Repo geliştirme, test, refactor, doküman, backlog, red flag, UI, deterministik motor | Claude Code — **tam yetki**, onay beklemez | CI yeşil olmadan merge yok |
| Production okuma | Claude Code — salt-okunur (`begin read only`) | ham finansal veriyi değiştirmez/silmez |
| Production migration uygulama | **Cowork** uygular (karar "C"); Code SQL'i aynen + checksum verir, sonra parmak izini ölçer | `prisma migrate deploy` çalıştırılmaz; destructive migration yok |
| Finansal karar (öneri + savunma) | CFO (motor + Cowork) bağımsız karar verir | — |
| **Dış icra** (transfer, kredi kullanma/kapama, sipariş, tedarikçi ödemesi, canlı fiyat, reklam harcaması) | **İnsan** (Alperen) | CFO yalnız önerir |
| Secret / credential | kimse değerini okumaz/yazmaz/loglamaz | `cfo_secret` → Vault taşıması yapılmaz |
| ENV değişikliği | yapılmaz (insan) | — |

## 4. Mimari prensipler

1. **Deterministik önce:** SQL → deterministik TypeScript → mevcut motor → saklı hesap → (yalnız muhakeme için) AI. Sitede çalışma zamanında LLM YOK (doğrulandı: hiçbir SDK çağrısı yok).
2. **Tek tanım:** her ekonomik metrik (nakit, borç, net sermaye, ciro, kur, faiz, stok değeri, marj) TEK bir SQL fonksiyonu/görünümünde tanımlanır; sayfalar, motor, Goal Engine ve Cowork aynı kaynağı okur. Bugün bu prensip **ihlal** ediliyor (bkz. §C, §F).
3. **UNKNOWN ≠ 0:** bilinmeyen değer 0'a, varsayılan orana ya da sabit kura düşmez; UNKNOWN olarak taşınır ve kararı kapatır/işaretler.
4. **Ölçülmüş ≠ tahmin:** her kanıt `measured` bayrağı taşır; tahmin ölçülmüş gibi gösterilmez.
5. **Provenance:** önemli her sayı kaynağını (view/fonksiyon, ölçüm anı, güven) taşır.
6. **Şirket ≠ şahsi:** şahsi hesap/kart/KMH tek bir sınıflama alanıyla ayrılır (bugün regex/ILIKE karışık).
7. **Geri alınabilirlik:** her migration'ın geri alma yolu yazılır; üretim parmak izi (`scripts/schema-baseline`) repo ile eşit tutulur.
8. **Sessiz hata yok:** her zamanlanmış iş sonucu (başarı/başarısızlık/takılma) gözlenebilir; alarm kanalı tek bir güvenilmez zamanlayıcıya bağlı olmaz.

## 5. Mevcut sistem haritası (B — System Architecture Map)

```
VERİ GİRİŞİ                         HAFIZA / TEK TANIMLAR                  MOTORLAR                         ÇIKTI
──────────────                      ───────────────────────                ────────                         ─────
Vercel xml-sync 05:xx ──┐           fm_sales_* (kanonik satış,            lib/cfo-agent (deterministik):   cfo_run.triggerReasons
Vercel trendyol 15:xx ──┤  ───────► mutabakat) · fm_stock_* · fm_fx_*     snapshot → anomalies → findings   → cfo_gun_ozeti (Cowork
Entegra yükleme (haftalık, elle) ┤   fm_balance_day ← cfo_snapshot         → health(alarm) → runner           08:00/16:49 okur)
Banka bakiye/hareket (elle) ─────┤   fm_goal / fm_goal_observation          Goal Engine (SQL fm_goal_evaluate) /admin/ai-cfo
Trendyol finans (elle) ──────────┤   cfo_nakit_projeksiyon(120)  ◄── tek    lib/cfo (yeni): capital-eff., VOI, /cfo/sermaye, kararlar,
cfo_receivable/cash_event/loan/  │   cfo_nakit_kapisi · cfo_odeme_gunluk    downside, decision-memory, goal-   sorular
card/yoldaki_mal/settings/kur ───┘   cfo_servet(_kalem) · cfo_stok_deger     attribution, revenue-levers, card
  (UI yazma yolu YOK — elle/Cowork)  cfo_maliyet_kapsami_at (tek tanım)     lib/cfo/engine.ts computeCfo      /cfo, borclar, nakit-akisi,
                                     cfo_tahsilat_tahmini (tek tahsilat)    (ESKİ, hâlâ 7 sayfa)              alacaklar, gumruk, ayarlar
                                                                            lib/capital/health (ayrı model)   /admin/sermaye, /dashboard
Zamanlama: Vercel Hobby 2 cron (güvenilir) + GitHub Actions 3×/gün (güvenilmez; alarm e-postası buna bağlı)
```

Modül haritası, 40+ SQL görünüm/fonksiyon listesi ve tüketiciler: denetim ekleri (bu belge §B-ek) — özet:
- **Yeni katman (lib/cfo/*, lib/cfo-agent/*):** UNKNOWN disiplini, provenance, testli; motor ve Cowork bunu okur.
- **Eski katman (`lib/cfo/engine.ts computeCfo`):** düz %4,5 KMH oranı, el ile `last14dRevenueTry`, `stockCostUsd` sabitleri, `num()` null→0; yine de `/cfo` ana sayfa dahil 7 sayfayı besliyor.
- **Üçüncü model (`lib/capital/health`, marketplace profit sayfaları):** liste fiyatı tabanlı marj; CFO ile bağsız.

## 6. Hedef sistem mimarisi

1. **Metrik sözleşmesi katmanı** (SQL): `cfo_metrik_*` tek tanımlar — nakit (şirket/şahsi ayrı), KMH kapasite, borç (bileşenli), net sermaye (dar/geniş açık adlı), stok değeri (maliyet + KDV hariç NRV), ciro (KDV dahil/hariç + kanal kapsamı), FX (stratejik), faiz (hesap başına ölçülmüş).
2. **Goal katmanı:** `fm_goal` yalnız sözleşme metriklerini ölçer; hedef değerleri tek konfigürasyondan.
3. **Motor:** snapshot sözleşme metriklerini okur; eski `computeCfo` sayfaları sözleşmeye taşınır, sonra emekliye ayrılır.
4. **Tutarlılık testi:** aynı metrik tüm sayfalarda aynı değeri verir (sayfa-motor eşlik testi CI'da).
5. **Karar döngüsü:** her öneri beklenen değerle `cfo_hamle`'ye; ölçüm `cfo_hamle_olcum`'a; kalibrasyon skora girer.
6. **Gözlemlenebilirlik:** motor/sağlık Vercel cron'dan da koşar; takılan koşu ve kilit hatası alarm üretir; alarm kanalı GitHub'a bağlı değil.

## 7. Geliştirme prensipleri ve çalışma sırası

HER ADIMDAN ÖNCE: (1) bu belgeyi + BACKLOG + RED-FLAGS oku, (2) main'i doğrula, (3) açık CRITICAL/HIGH red flag'leri değerlendir,
(4) duplicate iş olmadığını doğrula. HER ADIMDAN SONRA: (1) test, (2) üretimde salt-okunur doğrulama, (3) skoru yeniden hesapla,
(4) bağımsız RED FLAG PASS, (5) MD güncelle (PDKS delta + CHANGELOG + bu dosyalar), (6) sıradaki maddeyi yeniden değerlendir.
Döngü: AUDIT → GAP → BACKLOG → PRIORITIZE → IMPLEMENT → TEST → MEASURE → SCORE → RED FLAG → UPDATE MD → NEXT.
Skor 90+ VE tüm hard gate'ler geçene kadar sürer; yalnız skor için feature üretilmez.

## 8. Puanlama ve red flag protokolü

- Puanlama: [CFO-SCORECARD.md](CFO-SCORECARD.md) (sabit ağırlıklar, kanıt zorunlu, hard gate'ler).
- Red flag: [CFO-RED-FLAGS.md](CFO-RED-FLAGS.md) (append-only, `RF-YYYYMMDD-XXX`, CRITICAL/HIGH/MEDIUM/LOW/INFO). Yeni göreve başlarken açık
  CRITICAL/HIGH'lar okunur; gerekiyorsa backlog önceliği yükseltilir. Yeni feature açık önemli red flag'i görmezden gelmenin bahanesi değildir.

## 9. Roller (N — Responsibility Map)

| Sorumluluk | Claude Code | Claude Cowork | İnsan (Alperen) |
|---|---|---|---|
| Repo mimarisi, deterministik motor, SQL tek tanımlar, test, UI, gözlemlenebilirlik | **Sahibi** | — | — |
| Backlog, scorecard, red flag mühendisliği, dokümantasyon | **Sahibi** | girdi verir (meydan okur) | onay/öncelik itirazı |
| Production migration uygulama | SQL + checksum + doğrulama | **Uygular** | — |
| Sabah/akşam CFO değerlendirmesi (`cfo_gun_ozeti`), trade-off, yöneticiye meydan okuma | girdi üretir | **Sahibi** | karar |
| Metrik TANIM kararları (KDV dahil/hariç, dar/geniş servet, borç kapsamı, stratejik kur) | seçenek + etki ölçümü | öneri + itiraz | **son karar** |
| Veri girişi (banka ekran görüntüsü, kart devreden/oran, KMH oranları, ürün maliyeti, eşleme) | eksik listesini üretir | takip eder | **girer** |
| Dış icra (ödeme, kredi, sipariş, fiyat, reklam) | — | önerir | **yapar** |
| Kural: Cowork deterministik hesabı yeniden uydurmaz; Code'un ürettiği hesabı girdi olarak kullanır. Site Cowork/LLM olmadan çalışır. | | | |

---

# İLK TAM SİSTEM DENETİMİ (2026-10-08) — çıktılar A–P

Yöntem: 3 paralel salt-okunur kod taraması (sayfalar↔kaynaklar; motor ve finansal mantık; otomasyon/AI/güvenlik/veri girişi) +
üretim (Supabase `frbxpodiostxuwlrubkt`) salt-okunur ölçümleri. Kanıtlar dosya:satır ya da üretim sorgusuyla verilmiştir.

## 10. Fazlar (yönetişim; `current_phase` bu tablodan)

| Faz | Kapsam | Durum |
|---|---|---|
| Faz 0 | İlk tam sistem denetimi (A–P, 5 MD dosyası) | ✅ 2026-10-08 |
| Faz 1 | Metrik sözleşmesi: net sermaye, borç, kur, KDV esası, ciro tek tanım (CFO-001/002/003/007/008) | devam |
| Faz 2 | Veri kalitesi ve güvenlik: UNKNOWN≠0, şirket/şahsi, tek nakit yolu, eşikler, yetkiler (CFO-006/013/014/016/019/020/021) | kısmen |
| Faz 3 | Karar hafızası, atıf ve kalibrasyon (CFO-012/017/022/023) | — |
| Faz 4 | Eski motor emekliliği ve ölü bileşen temizliği (CFO-018/024) | — |

Yönetişim tutarlılığı (CFO-GOVERNANCE-DRIFT, 2026-10-09): MASTER-PLAN, BACKLOG, SCORECARD, RED-FLAGS, DECISION-LOG frontmatter'ı (`current_main_commit`, `current_score`, `current_phase`, `next_action`, `open_critical`, `open_high`, `score_change`) birebir aynı ve gerçek main ile tutarlı olmalı — CI testi `cfo-governance-drift` aksi halde FAIL.

## A. Executive CFO Assessment

ALFAS CFO sistemi **deterministik bir çekirdeğe sahip ve LLM'siz çalışıyor** (iyi): kanonik satış hafızası, tek nakit projeksiyonu, tek
tahsilat mekanizması, tek maliyet kapsamı tanımı, kademeli KMH faizi, kapasite alarmı, sermaye verimliliği, VOI ve karar hafızası var;
motor günde 3+ kez koşuyor ve Cowork bunu iki kez yorumluyor.

Ancak **stratejik üç hedefin ikisi tutarlı ölçülmüyor**:
- **Net sermaye üç farklı sayı:** Goal Engine 2,56M TL (≈52,7k USD), `/cfo` servet kartı 6,27M TL (≈127,9k USD), günlük snapshot "geniş" 6,32M TL.
  Fark 2,4×; stok üç ayrı yöntemle (maliyet 4,32M · KDV dahil NRV 7,24M · snapshot 14,5M) değerleniyor.
- **Borç hedefi eski ve tanımı çoklu:** sistem 5M TL ölçüyor (yeni hedef <100k USD ≈ 4,86M TL); borç beş ayrı formülle hesaplanıyor; KMH dahil değil, yoldaki malın ödenmemiş vergisi dahil.
- **Kur dört kaynaktan** (48,56 TCMB · 48,98 snapshot · 49,20 ayar · yedekler 1/45/48,5); bir yerde kendini besleyen döngü var.
- **Ciro KDV dahil** ölçülüyor ve en az yedi farklı formülle hesaplanıyor.

Ek olarak: düz %4,5 KMH oranı beş yerde yaşıyor; kredi/kart/alacak/ödeme defterlerinin uygulamada yazma yolu yok (elle/Cowork SQL);
alarm teslimi güvenilmez GitHub zamanlayıcısına bağlı; maliyet kapsamı %87,5 < %95 olduğu için marj kuralları susuyor; karar hafızasında
15 kararın yalnız 3'ünde beklenen değer var.

**Hüküm:** sistem karar *destek* seviyesinde güçlü, karar *doğruluğu* seviyesinde güvenilmez. İlk iş yeni özellik değil, **metrik sözleşmesi**
(net sermaye / borç / kur / ciro tek tanım) — bunlar düzelmeden hedef ilerlemesi, sermaye tahsisi ve borç kapısı yanlış sayılarla çalışır.
**Başlangıç skoru: 48/100. Açık red flag: 1 CRITICAL, 9 HIGH.**

## B. System Architecture Map — §5 + ek

Ek: modül → girdi → çıktı → tüketici (özet)

| Modül | Amaç | Girdi | Tüketici |
|---|---|---|---|
| `lib/cfo-agent/runner.ts` (+snapshot, anomalies, findings, health, context) | Deterministik motor; bulgu/alarm/metrik → `cfo_run` | satış görünümleri, nakit kapısı/projeksiyon, kapsam, downside, `fm_memory_goal` | `cfo_gun_ozeti` (Cowork), `/admin/ai-cfo` |
| Goal Engine (SQL `fm_goal_sync/evaluate`, `lib/fm/goal-engine.ts`) | 4 hedefin günlük ölçümü | `fm_memory_sales_company_day`, `fm_memory_balance_day`, `fm_memory_fx_monthly`, projeksiyon | runner, `/cfo/calisan`, `/admin/ai-cfo`, kararlar |
| `lib/cfo/capital-efficiency` | SKU sermaye sınıfları, eşik getiri, marjinal tahsis | `cfo_stok_deger`, loan, KMH, kart devreden, downside | `/cfo/sermaye`, VOI, revenue-levers |
| `lib/cfo/downside` | 120 gün stres, kademeli KMH faizi, tolerans | projeksiyon bileşenleri, banka limit/oran | snapshot (CASH_CRITICAL), `/cfo/sermaye` |
| `lib/cfo/voi` | Bilgi değeri sıralaması | capital-eff., bayatlık, sorular | `/cfo/sorular` |
| `lib/cfo/decision-memory` + `goal-attribution` | Karar beklenen↔gerçekleşen; net sermaye değişim atfı | `cfo_hamle`, `fm_balance_day` | `/cfo/kararlar` |
| `lib/cfo/revenue-levers` | Ciro açığı kaldıraçları | `cfo_satis_birim_duz` 90g/3, `cfo_kur` | `/cfo/sermaye` |
| `lib/cfo/card-cost` | Kart faizi yalnız devreden × akdi × (1+KKDF+BSMV) | kart | engine, capital-eff., VOI |
| `lib/cfo/engine.ts computeCfo` (ESKİ) | KPI, 7/30/60/90 ufuk, gümrük rezervi, borç servisi | Prisma tabloları + `cfo_tahsilat_tahmini` | `/cfo`, borclar, nakit-akisi, alacaklar, gumruk, ayarlar, sermaye(kısmen) |
| `lib/cfo/wealth.ts` | Servet görünümleri | `cfo_servet*`, `cfo_stok_deger` | `/cfo` servet kartı |
| `lib/capital/health.ts` | Ayrı sermaye sağlık modeli | `cfo_stok_deger.maliyet_degeri`, FX, importer-cost | `/admin/sermaye`, `/dashboard` |

## C. Page-to-Engine Consistency Matrix

| Sayfa | Ana metrikler | Kaynak | Motor | Tutarlılık sorunu |
|---|---|---|---|---|
| `/cfo` | Kur, KMH %, net banka, boş KMH, kart, 30 gün nakit, alacak, servet/hedef, gümrük rezervi | `computeCfo` + `cfo_servet*` | ESKİ + görünüm | Kur rozet `cfo_settings` 49,20 ↔ servet kartı snapshot 48,98; nakit şahsi dahil ↔ motor hariç; servet GENİŞ ↔ hedef DAR |
| `/cfo/borclar` | KMH tablosu, kart, kredi, planlı ödeme | `computeCfo` | ESKİ | Satır faizi düz %4,5 ↔ toplam banka oranlı → **satırlar toplamı tutmuyor**; kredi `earlyPayoffTry` ↔ servet `remainingTry` |
| `/cfo/nakit-akisi` | Ufuk tahmini, haftalık | `computeCfo` | ESKİ | Açılış nakdi şahsi dahil ↔ projeksiyon hariç |
| `/cfo/alacaklar` | Kanal alacakları | `computeCfo` | ESKİ | Metin "ciro/4" eskimiş (motor `cfo_tahsilat_tahmini`) |
| `/cfo/gumruk` | Rezerv, açık, faiz | `computeCfo` | ESKİ | Düz %4,5; ithalat maliyeti `cfo_settings.usdTryRate` |
| `/cfo/sermaye` | Downside, KMH dilimleri, gelir kaldıraçları, sermaye tahsisi, seçenek karşılaştırması | `lib/cfo/*` + `buildAllocation` | YENİ + ESKİ | Aynı sayfada downside hesap oranlı ↔ seçenek karşılaştırması düz %4,5 |
| `/cfo/kararlar` | Karar durumu, kalibrasyon, net sermaye atfı | decision-memory, goal-attribution | YENİ | Atıf bileşenleri net sermayeyi tutmuyor (iki snapshot yazarı) |
| `/cfo/sorular` | VOI, açık sorular | voi | YENİ | Sorular durum sözlüğü karışık (ACIK/OPEN, CEVAPLANDI/ANSWERED, KAPALI/KAPANDI) |
| `/cfo/kazananlar` | Aylık kazananlar, ciro hedefi, ithalat önerisi | `cfo_ay_kazanan*`, `cfo_ciro_hedef` | görünüm | Ciro hedefi `cfo_settings.usdTryRate` + son tam ay (Goal Engine TCMB + MTD); kapsam eşiği yorumda %85 ↔ motor %95; maliyetsiz SKU'yu kârdan düşürür |
| `/cfo/odemeler` | Haftalık giriş/çıkış, dip, kapasite, alacak-borç net | `cfo_odeme_gunluk`, `cfo_yaklasan_odeme`, `cfo_nakit_dibi` | görünüm | Açılış şahsi dahil + vadesi geçmiş ödenmemişler dahil ↔ projeksiyon bugünden itibaren; kapasite tam ticari limit + bakiyesi bilinmeyen bankanın limiti |
| `/cfo/olu-stok` | Ölü stok | `cfo_olu_stok*` | görünüm | Eşik `0.2` sayfada sabit ↔ `cfo_settings.deadStockSalesRatioPct`; 4 ayrı ölü stok kuralı |
| `/cfo/ayarlar` | Parametreler | `cfo_settings` | ESKİ | Ölü alanlar (`stockCostUsd`, `blockedStockUsd`); "KMH / kart aylık faiz" etiketi yanlış (kart kullanmıyor) |
| `/cfo/calisan`, `/cfo/calisma-durumu` | İş akışı, hedefler, borç tahmini; kapsam | agent | AGENT | "aylık 100.000 USD" metinde sabit |
| `/cfo/defter` | Notlar | `cfoNote` | — | — |
| `/admin/ai-cfo` | Dünkü ciro, ticari nakit, min projeksiyon, bulgular, hedefler | snapshot, `fm_memory_goal` | AGENT | Ticari nakit (şahsi hariç) ↔ `/cfo` (şahsi dahil) |
| `/admin/sermaye`, `/dashboard` | Toplam/kilitli/serbest sermaye, ROI, sağlık skoru | `lib/capital/health` | yok | Stok maliyetle ↔ servet NRV ile; marj liste fiyatı modeli |
| `/marketplace/profit`, `/realized-margin`, `/trendyol/finans` | Marj, komisyon | policy, settlement | yok | 4. ve 5. marj modeli; komisyon 3 kaynak |

**CFO kullanıyor ama kullanıcı göremiyor:** kanal/dönem katkı marjı, iade oranı, komisyon kapsamı, maliyet kapsamı + kapatan liste,
stockout riski, `minimumWithInterestTry`, 10 günlük giriş/çıkış. **Kullanıcı görüyor ama CFO kullanmıyor:** `computeCfo` çıktılarının
tamamı (gümrük rezervi, borç servisi oranı, ay sonu nakdi), servet likiditesi, `cfo_alacak_borc`, kazananlar, `/admin/sermaye` sağlık skoru.

## D. Data Utilization Matrix

| Veri | Sınıf | Not |
|---|---|---|
| `MarketplaceSalesRecord` → `cfo_satis_*`, `fm_sales_canonical` | USED_EFFECTIVELY | iki aile (cfo_satis vs fm_sales) farklı kapsam (IDEASOFT, iade durumları) — DUPLICATED tanım |
| `TrendyolSalesRecord` / `TrendyolReturnRecord` (API) | USED_PARTIALLY | iade kayıtları marj/iade oranına bağlı değil |
| `alfashome_order` | USED_PARTIALLY | Goal Engine cirosuna dahil değil |
| `trendyol_settlement_line` (finans) | DISPLAY_ONLY | ölçülmüş komisyon/kesinti; motor kendi medyanını kullanıyor |
| `cfo_bank_account` bakiye/limit/oran | USED_EFFECTIVELY | 4 nakit + 4 kapasite tanımı (DUPLICATED); 3 bankanın oranı UNKNOWN |
| `cfo_banka_hareket` | USED_PARTIALLY | VOI + rollforward; nakit mutabakatına bağlı değil |
| `cfo_receivable` | USED_EFFECTIVELY | UI yazma yolu yok (STALE riski); Pazarama/N11/EPTT eksik |
| `cfo_cash_event` | USED_EFFECTIVELY | oluşturma/düzenleme UI'ı yok |
| `cfo_loan` | USED_EFFECTIVELY | `nextPaymentDate`/`currentMonthState` dönmüyor (STALE); `remainingOverride` yanlış birimle kullanılıyor (latent) |
| `cfo_credit_card` (+ devreden/akdi oran) | USED_PARTIALLY | 1 kartın devreden bakiyesi yok |
| `cfo_yoldaki_mal` vs `cfo_import_project` | DUPLICATED | iki yoldaki mal kaynağı |
| `cfo_snapshot` → `fm_balance_day` | USED_EFFECTIVELY | iki yazar (TS + SQL) farklı formül → UNRELIABLE kimlik |
| `cfo_kur`, `cfo_settings.usdTryRate`, `fm_fx_monthly`, `MonthlyExchangeRate` | DUPLICATED | stratejik kur yok |
| `cfo_settings.last14dRevenueTry` (23.08), `stockCostUsd`, `blockedStockUsd`, `monthlyRevenueTarget1/2`, `stockCoverMonths` | STALE / DO_NOT_USE | eski motor dışında kullanılmamalı |
| `cfo_hamle` / `cfo_hamle_olcum` | USED_PARTIALLY / COLLECTED_BUT_UNUSED | ölçüm tablosu hiç yazılmıyor |
| `cfo_question` (299 kayıt, 66 açık) | USED_PARTIALLY | durum sözlüğü karışık |
| `XmlProductData` / stok hareketi | USED_EFFECTIVELY | hız, ölü stok, stockout |
| `fm_quality_flag`, `fm_stock_reconciliation` | USED_PARTIALLY | motor bulgusuna bağlı değil |
| `cfo_insight`, `cfo_usage` (LLM dönemi) | DO_NOT_USE | artık yazılmıyor |
| `cfo_model_hakedis` (sabit tarih 2026-09-08) | DO_NOT_USE | kullanılmıyor, sabit pencere |
| `market_*` (Market Scout) | UNKNOWN | migration üretimde yok |

## E. Missing Capabilities

1. Tek metrik sözleşmesi (net sermaye, borç, kur, ciro, nakit) ve sayfa-motor eşlik testi.
2. Güncel borç hedefi (<100k USD) ve tek borç tanımı (KMH dahil, şirket/şahsi ayrı).
3. KDV esası kararı: marj ve NRV KDV hariç.
4. Defter bakım yolları: kredi/kart taksit-vade devri, alacak/ödeme girişi (UI veya kontrollü içe aktarma).
5. GitHub'dan bağımsız alarm teslimi; takılan koşu/kilit hatası alarmı.
6. Karar sonucu ölçümü ve kalibrasyon (`cfo_hamle_olcum` yazımı, beklenen değer zorunluluğu).
7. Nakit tahmini kalibrasyonu (Goal Engine gözlemleriyle, 2–4 hafta veri birikince).
8. Vergi borcu (KDV/stopaj) — net sermayede hiç yok.
9. Ölçülmemiş faiz oranları (3 genel KMH + gümrük limiti + 4 şahsi KMH).

## F. Duplicate / Deprecated Components

- **Duplicate tanımlar:** nakit (4), boş KMH (4), KMH faizi (5), USD/TRY (6 kaynak), borç (5), kart borcu (5), aylık ciro (7), marj (5), stok değeri (6), net sermaye (3), ölü stok (4), kapsam eşiği (3), taban (2: env + cfo_settings).
- **İki snapshot yazarı:** `takeCfoSnapshotAction` (TS) ↔ `cfo_take_snapshot` (SQL) farklı FX ve stok tanımı.
- **İki "Sermaye" sayfası:** `/admin/sermaye` ↔ `/cfo/sermaye`.
- **Eski motor alanları:** `sellableStockTry`, `blockedStockTry`, `narrow/wideWorth*`, `target`, `totalFinancialDebtTry` (hesaplanıyor, gösterilmiyor).
- **Yetim:** `/api/cron/cfo-cycle` (hiçbir zamanlayıcı çağırmıyor); `cfo-actions.ts` dışa aktarımlarının UI çağıranı yok; `cfo_model_hakedis`; `cfo_insight/cfo_usage`.
- **Held-back migration'lar** `prisma/migrations` içinde (`prisma migrate deploy` uygular).

## G. Data Quality Problems

| Sorun | Kanıt |
|---|---|
| Maliyet kapsamı %87,5 < %95 → marj/kâr kuralları susuyor | `cfo_maliyet_kapsami`; 8 SKU açığı kapatır (CFO-011) |
| Entegra satışları haftalık elle → non-Trendyol kanallar 3+ gün geride | `MarketplaceSalesRecord` max orderDate 2026-10-05 |
| Kredi/kart vade ve "ödendi" durumu otomatik dönmüyor → ödeme alarmı sessizce durur | `health.ts` yalnız "bugün" eşleşmesi |
| 66 açık soru; durum sözlüğü 8 farklı değer | `cfo_question` |
| `cfo_settings.last14dRevenueTry` 23.08'de kalmış (eski motor borç servisi oranı bunu kullanıyor) | üretim |
| 3 genel KMH + gümrük + 4 şahsi KMH oranı ölçülmemiş → faiz alt sınır (~+421k bilinmiyor) | `cfo_bank_account.monthlyRatePct` |
| Pazarama/N11/EPTT/Amazon alacak defteri eksik | 2026-10-08 6(c) uzlaştırması |
| Ziraat USD bakiyesi bayat; `customsReserveDate` güncellendi (09.10) | üretim |
| 1 kartın devreden bakiyesi yok | `cfo_credit_card.revolvingTry` |

## H. Financial Logic Risks

1. **Net sermaye çoklu tanım** (dar 2,56M ↔ geniş 6,27M) + Goal ↔ sayfa farklı kur (RF-001).
2. **Borç:** KMH dahil değil; yoldaki mal ödenmemiş vergi/navlun hem varlık hem borç (borcu 3,79M şişiriyor); şahsi kart dahil; kredi `remainingTry` ↔ `earlyPayoffTry`; `remainingOverride` (taksit SAYISI) TL olarak toplanıyor — bugün 0 kredide set, LATENT (RF-002, RF-005).
3. **KDV:** katkı marjı = KDV dahil gelir − maliyet; NRV stok değeri KDV dahil net orandan; vergi borcu hiç yok → marj ve net sermaye şişik olabilir (`unitCostTry` esası teyit edilmeli) (RF-008).
4. **Faiz:** düz %4,5 (borclar satırı, gumruk, buildAllocation, `cfo_kart_karari` KKDF/BSMV'siz, capital-eff. yedeği); `cfo_loan.interestRatePct` şema yorumu "aylık" ↔ kod "yıllık" (RF-004).
5. **UNKNOWN→0:** `engine.ts num()`, revenue-levers (kur 45, hedef 100000, ciro 0), hurdle %4, goal-attribution, `cfo_servet_kalem` coalesce 0 (RF-016).
6. **Tahmin ölçülmüş gibi:** revenue-evidence, context servet, capital-config (RF-016).
7. **Vadesi geçmiş kalemler** projeksiyondan düşüyor, takvimde kalıyor → iki dip (RF-015).
8. **Şahsi/şirket karışımı:** nakit 4 tanım, servet nakdi şahsi dahil (RF-010).

## I. Current Goal Gap (üretim, 2026-10-08; kur TCMB Eylül 48,5585 — stratejik kur kararı bekliyor)

| Hedef | Bugün | Hedef | Açık | Gidiş |
|---|---|---|---|---|
| G1 Aylık ciro | MTD 369.299 TL / 7 gün → ay tahmini 1.635.466 TL ≈ **33,7k USD** (KDV dahil; KDV hariç ≈ 28k) | 100k USD = 4.855.850 TL | **≈ 66k USD/ay (×3)** | OFF_TRACK; gereken 186.940 TL/gün, olan 52.757 TL/gün |
| G2 Net sermaye | Dar 2.557.101 TL ≈ **52,7k USD** · geniş 6.266.139 TL ≈ 127,9k USD | 300k USD (2027-12-31) | **172k–247k USD** (tanıma göre) | OFF_TRACK; dar seri −23.088 TL/gün (26 gün) — **düşüyor** |
| G3 Toplam borç | 9.283.200 TL ≈ **191k USD** (KMH hariç, yoldaki mal 3,79M dahil; yoldaki hariç ≈ 5,50M TL ≈ 113k USD) | < 100k USD ≈ 4.855.850 TL | **≈ 91k USD** (yoldaki hariç ≈ 13k) | −10.174 TL/gün → bu hızla ~420 gün |
| Taban | 120 gün dibi −3.372.104 TL (01.12), faizli −3.645.356 | −3.000.000 | 372k–645k TL | OFF_TRACK; şahsi hesaplar gerekiyor |

Yorum: tanım belirsizliği hedef açığını ±%60 oynatıyor (G2 52,7k ↔ 127,9k; G3 191k ↔ 113k). **Önce tanım, sonra strateji.**

## J. Initial CFO Score — **48/100** (ayrıntı: CFO-SCORECARD.md). Hard gate: 12'den 5'i geçiyor (H4, H5, H9, H10, H11).

## K. Independent Red Flag Report — CFO-RED-FLAGS.md (24 kayıt: 1 CRITICAL, 9 HIGH, 10 MEDIUM, 4 LOW).

## L. Prioritized Backlog — CFO-BACKLOG.md (24 madde).

## M. PR-by-PR Action Plan

| PR | Backlog | Kapsam | Kabul kriteri |
|---|---|---|---|
| PR-A | CFO-001a | Metrik sözleşmesi karar memosu + mutabakat testi (bugünkü 3 net sermaye / 5 borç / 4 kur / 7 ciro tanımını ölçen salt-okunur betik + CI testi) | Her farkın TL karşılığı belgede; Alperen/Cowork 5 tanım kararını DECISION-LOG'a yazmış |
| PR-B | CFO-004 | `cfo_servet_kalem` + `cfo_kilometre_yaz`: `remainingOverride` TL olarak kullanılmasın (migration, Cowork uygular) | PGlite testi: override=12 iken borç değişmez; üretim parmak izi eşit |
| PR-C | CFO-003 | Stratejik kur tek kaynak; tüm modüller okur; yedek sabitler (1/45/48,5) kalkar → UNKNOWN; snapshot döngüsü kırılır | grep: modüllerde sabit kur yok; sayfalar aynı kuru gösterir |
| PR-D | CFO-001b | `cfo_metrik_net_sermaye` (dar/geniş adlı bileşenli), tek snapshot yazarı; Goal Engine + `/cfo` + snapshot aynı | eşlik testi: Goal = sayfa = snapshot |
| PR-E | CFO-002 | Borç tek tanım (bileşenli; KMH kullanılan dahil; şirket/şahsi ayrı; yoldaki mal ayrı satır) + `fm_goal` v2 borç hedefi <100k USD; 5M sabitleri tek konfigürasyona | Goal yeni hedefi ölçer; debt-policy ve SQL aynı kaynaktan |
| PR-F | CFO-005 | Düz %4,5 oranı kaldır (borclar, gumruk, buildAllocation, `cfo_kart_karari`, capital-eff. yedeği) | borclar satırları toplamı tutar; grep `kmhMonthlyRatePct` yalnız ayarlar sayfasında |
| PR-G | CFO-006 | Şirket/şahsi tek sınıflama alanı; nakit/kapasite/borç bunu kullanır | 4 nakit tanımı → 1 (şirket) + 1 (şahsi) |
| PR-H | CFO-009 | Sağlık kontrolü Vercel cron'da da; takılan `running` ve kilit hatası alarmı; `cfo-cycle` bağlantısı | takılan koşu testi; alarm GitHub olmadan üretilir |
| PR-I | CFO-010 | Kredi/kart vade devri + alacak/ödeme girişi yolu | ay dönümünde `payment_unmarked` doğru tetiklenir |
| PR-J | CFO-007/008 | KDV esası: marj ve NRV KDV hariç; ciro hedefi tanımı | karar memosu + testler |
| sonra | CFO-011…024 | backlog sırasıyla | — |

## N. Claude Code / Cowork Responsibility Map — §9.

## O. Top 10 Highest Economic Value Actions

| # | Aksiyon | Ekonomik değer (gerekçe) | Kim |
|---|---|---|---|
| 1 | Net sermaye/borç/kur tek tanım (CFO-001/002/003) | Hedef açığı ±%60 belirsiz → tüm sermaye kararları yanlış tabanda; düzeltme kararların kendisini doğru yapar | Code + Alperen kararı |
| 2 | 8 SKU maliyet/eşleme girişi → kapsam %95,5 (CFO-011) | Marj/kâr kuralları açılır; ~1,68M TL/ay cirosunun marj sinyali geri gelir | Alperen (veri) |
| 3 | Ölçülmemiş KMH oranlarını ekstreden gir (CFO-015) | 120 günde ~421k TL faiz görünmez; borç kapama sıralaması bu oranlara bağlı | Alperen |
| 4 | Borç hedefini <100k USD'ye ve KMH'yi borca dahil et (CFO-002) | Borç kapısı yeni siparişleri yanlış eşikle açıp kapatıyor | Code + karar |
| 5 | LIQUIDATE/TRIM stok nakde çevirme planı (sermaye motoru: LIQUIDATE ~1,15M, TRIM ~1,41M, eşik altı kayıp ~121k/ay) | Nakit dibi −3,37M; açığa çıkan nakit faizli KMH'yi azaltır | CFO önerir, Alperen icra |
| 6 | Gümrük ödemesi zamanlaması (15.10 ~3M + 21.10 1,32M) senaryoya göre | Dip ve kapasite aşımı tarihi buna bağlı (21.10 kapasite aşımı) | CFO önerir, Alperen icra |
| 7 | KDV esası kararı (CFO-007) | Marj ve NRV %20'ye kadar şişik olabilir → yanlış SCALE/fiyat kararları | Code + karar |
| 8 | Alarm teslimini GitHub'dan bağımsızlaştır (CFO-009) | Kaçan ödeme alarmı = gecikme faizi/itibar; bugün sessiz başarısızlık mümkün | Code |
| 9 | Kredi/kart vade devri + defter yazma yolu (CFO-010) | Ödeme alarmı ay dönümünde sessizce kör oluyor | Code |
| 10 | Karar ölçümü + beklenen değer zorunluluğu (CFO-012) | 15 kararın 3'ü ölçülebilir; CFO kalibre olamıyor | Code + Cowork |

## P. Current blockers to 90+

1. Açık CRITICAL red flag (RF-20261008-001 net sermaye çoklu tanım).
2. Hard gate'ler: açıklanamayan duplicate finansal metrik; site sayfaları tutarsız; önemli sayılarda provenance eksik (eski motor); UNKNOWN→0 yolları; karar sonuçları ölçülmüyor; alarm teslimi güvenilmez.
3. Veri: maliyet kapsamı %87,5; ölçülmemiş faiz oranları; elle defterler.
4. Kararlar (insan): KDV esası, dar/geniş servet, borç kapsamı, stratejik kur, ciro kanal kapsamı.
