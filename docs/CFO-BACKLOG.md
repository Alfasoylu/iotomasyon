---
last_updated: 2026-10-09 09:50 TR
current_main_commit: ac761e1
current_phase: "Faz 0 — İlk tam sistem denetimi tamamlandı; Faz 1 (Metrik sözleşmesi) sırada"
current_score: 52/100
next_action: "Cowork: 20261009120000 (KDV hariç ciro) + 110000 → CFO-025 (sabit kur, 433 ürün) → CFO-001 PR-D / CFO-002"
---

# CFO BACKLOG

Sıralama: **(ekonomik değer + risk azaltımı + hedef etkisi) − (karmaşıklık + veri belirsizliği + operasyonel risk)**, her bileşen 1–5.
Skor = (EV + RR + GI) − (CX + DU + OR). Durumlar: DISCOVERED · VALIDATED · PLANNED · IN_PROGRESS · BLOCKED · DONE · REJECTED · DEPRECATED.
**Tamamlanma kuralı (2026-10-09):** %100 biten madde "✅ TAMAMLANDI YYYY-AA-GG — kısa not (PR/migration)" olarak işaretlenir;
kısmen biten madde TAMAMLANDI yazılmaz (biten/kalan ayrı yazılır). Faz 0 öncesi biten işler en altta "Tamamlanan" listesinde.
Öncelik: P0 finansal doğruluk/güvenlik · P1 büyük ekonomik etki · P2 karar kalitesi · P3 optimizasyon · P4 nice-to-have.
AI runtime maliyeti: tüm maddeler deterministik (SQL/TS) → **0** (LLM yok). Uygulama maliyeti S/M/L.

## Özet (öncelik sırası)

| Sıra | ID | Başlık | P | Hedef | EV | RR | GI | CX | DU | OR | Skor | Maliyet | Durum | RF |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | CFO-001 | Metrik sözleşmesi: net sermaye tek tanım (+ karar memosu, mutabakat testi) | P0 | G2,G3 | 5 | 5 | 5 | 3 | 3 | 2 | **7** | L | PLANNED (PR-A ✓; D-P01 GENİŞ + D-P02 LCNRV kararlandı 2026-10-09 → PR-D, CFO-025 ölçümünden sonra) | 001,011 |
| 2 | CFO-004 | `remainingOverride` TL olarak kullanılmasın | P0 | G2,G3 | 3 | 5 | 3 | 1 | 1 | 1 | **8** | S | ✅ TAMAMLANDI 2026-10-09 — kalan anapara; PR #213 + migration 100000 üretimde | 005 |
| 3 | CFO-003 | Stratejik kur tek kaynak; sabit yedekler → UNKNOWN | P0 | G1,G2,G3 | 3 | 4 | 4 | 2 | 2 | 1 | **6** | M | VALIDATED | 003 |
| 4 | CFO-002 | Borç tek tanım + hedef <100k USD + sabitler tek konfigürasyona | P0 | G3 | 5 | 4 | 5 | 3 | 2 | 2 | **7** | M | PLANNED (D-P03 kararlandı 2026-10-09: kredi + kart + kullanılan KMH; hedef <100k USD) | 002,019,020 |
| 5 | CFO-005 | Düz %4,5 KMH oranını kaldır (borclar, gumruk, allocation, kart kararı, capital-eff.) | P1 | G3 | 4 | 4 | 3 | 2 | 1 | 1 | **7** | M | ✅ TAMAMLANDI 2026-10-09 — düz %4,5 kalktı: TS (PR #214) + kart kararı kart faiziyle (PR #215, migration 110000 üretimde) | 004 |
| 6 | CFO-006 | Şirket/şahsi tek sınıflama; nakit/kapasite/borç bunu kullansın | P1 | G2,G3 | 4 | 4 | 3 | 3 | 1 | 2 | **5** | M | VALIDATED | 010 |
| 7 | CFO-009 | Alarm teslimi GitHub'dan bağımsız; takılan koşu + kilit hatası alarmı; cfo-cycle bağla | P1 | tümü | 3 | 5 | 2 | 2 | 1 | 2 | **5** | M | IN_PROGRESS (takılan koşu/kilit/yeniden deneme ✓; ölü koşu süpürme + süre bütçesi + SAĞLIK alarmı ✓ kod, migration 150000 Cowork bekliyor; teslim kanalı D-P07 bekliyor) | 006 |
| 8 | CFO-010 | Defter bakım yolu: kredi/kart vade devri, alacak/ödeme girişi | P1 | tümü | 4 | 4 | 2 | 3 | 1 | 2 | **4** | L | ✅ TAMAMLANDI 2026-10-09 — ödeme durumu tek kaynak (takvim); defter↔takvim boşluk + mükerrer taksit alarmı; Borçlar takvimden; yetim cfo-actions silindi | 007,028,029 |
| 9 | CFO-007 | KDV esası kararı + marj/NRV KDV hariç | P1 | G1,G2 | 4 | 4 | 4 | 3 | 3 | 2 | **4** | M | DISCOVERED | 008 |
| 10 | CFO-008 | Ciro hedefi tanımı (KDV, kanal kapsamı) + tek ciro fonksiyonu | P1 | G1 | 3 | 3 | 5 | 3 | 2 | 1 | **5** | M | IN_PROGRESS (KDV hariç ciro + hedef kaynak tazeliği üretimde 2026-10-09; kalan: hedef tanımı D-P05) | 009,023 |
| 11 | CFO-011 | Maliyet kapsamı ≥ %95 (8 SKU veri + migration 200000) | P1 | G1 | 4 | 3 | 3 | 1 | 1 | 1 | **7** | S (veri) | BLOCKED (veri: Alperen; Code ✓ PR #210, migration 200000 üretimde 2026-10-08) | 013 |
| 12 | CFO-015 | Ölçülmemiş KMH/gümrük/şahsi faiz oranlarını gir | P1 | G3 | 4 | 3 | 3 | 1 | 1 | 1 | **7** | S (veri) | BLOCKED (veri: Alperen) | 018 |
| 13 | CFO-012 | Karar hafızası: beklenen değer zorunlu, `cfo_hamle_olcum` yazımı, kalibrasyon | P2 | tümü | 3 | 2 | 3 | 2 | 2 | 1 | **3** | M | VALIDATED | 014 |
| 14 | CFO-014 | UNKNOWN→0 süpürmesi + measured bayrak düzeltmesi | P2 | tümü | 2 | 4 | 2 | 2 | 1 | 1 | **4** | M | VALIDATED | 016 |
| 15 | CFO-013 | Vadesi geçmiş kalemler: tek nakit yolu (projeksiyon = takvim) | P2 | taban | 2 | 3 | 2 | 2 | 1 | 1 | **3** | S | VALIDATED | 015 |
| 16 | CFO-016 | Güvenlik: yazma izinleri, yetkisiz action, sunucu tarafı audit kaynağı, Cowork salt-okunur rol + görünüm izni | P2 | — | 2 | 4 | 1 | 2 | 1 | 2 | **2** | M | VALIDATED | 012 |
| 17 | CFO-023 | Sayfa-motor eşlik testi (aynı metrik tüm sayfalarda aynı) | P2 | tümü | 3 | 4 | 2 | 3 | 1 | 1 | **4** | M | DISCOVERED | 001-010 |
| 18 | CFO-017 | Atıf kimliği: tek snapshot yazarı, bileşenler toplamı = net sermaye | P2 | G2 | 2 | 3 | 3 | 2 | 1 | 1 | **4** | S | VALIDATED | 011 |
| 19 | CFO-019 | Held-back migration'ları deploy'dan koru | P3 | — | 1 | 4 | 1 | 1 | 1 | 1 | **3** | S | ✅ TAMAMLANDI 2026-10-09 — `npm run db:migrate:deploy` bekletilen migration ve Supabase hedefini açık izin olmadan reddeder | 017 |
| 20 | CFO-018 | Eski `computeCfo` sayfalarını sözleşmeye taşı, sonra emekli et | P3 | tümü | 3 | 3 | 2 | 4 | 1 | 3 | **0** | L | DISCOVERED | 004,010,024 |
| 21 | CFO-020 | Ölü stok tek kural + eşikler konfigürasyondan | P3 | G2 | 2 | 2 | 2 | 2 | 1 | 1 | **2** | S | DISCOVERED | 019 |
| 22 | CFO-022 | Nakit tahmini kalibrasyonu (Goal Engine gözlemleri, 2–4 hafta veri sonrası) | P3 | taban | 3 | 3 | 2 | 2 | 3 | 1 | **2** | M | PLANNED (veri birikiyor) | — |
| 23 | CFO-021 | CI düzeltmesi (yml:113, alfashome testi) + eski UI metinleri | P4 | — | 1 | 2 | 1 | 1 | 1 | 1 | **1** | S | VALIDATED | 021,022 |
| 9a | CFO-025 | Sabit kurun 433 maliyetli üründe maliyete etkisi (marj tabanı) — Alperen sırası: KDV hariç cirodan hemen sonra | P0 | G1,G2 | 4 | 4 | 3 | 2 | 3 | 1 | **5** | S (ölçüm) | IN_PROGRESS (ölçüm ✓ 2026-10-09: sabit kur 48,50 → marj etkisi 0,43 puan; asıl belirsizlik USD maliyet/çarpan — Cowork 8 ürün ayrıntısı bekleniyor) | 030 |
| 24 | CFO-024 | Ölü bileşen temizliği (`cfo_model_hakedis`, `cfo_insight/usage`, ölü ayar alanları, yetim route) | P4 | — | 1 | 1 | 1 | 1 | 1 | 2 | **−1** | S | DISCOVERED | 024 |

Not: CFO-004 skoru en yüksek ama tek başına küçük; CFO-001'in PR-B'si olarak sıraya alındı. CFO-011/015 Code işi değil, veri işi —
BLOCKED değil "insan tarafında"; Code yalnız eksik listesini üretir (CFO-011 listesi PR #210 ile motorda).

---

## Maddeler

### CFO-001 — Metrik sözleşmesi: net sermaye tek tanım
- **neden:** Net sermaye 3 farklı sayı (2,56M / 6,27M / 6,32M TL), G2 ilerlemesi %17,6 ↔ %42,6. Stok 3 yöntemle değerleniyor.
- **hedef:** G2 (ve G3 ile birlikte bilanço) · **ekonomik etki:** tüm sermaye kararlarının tabanı doğru olur; hedef açığı belirsizliği ±%60 → 0.
- **risk azaltımı:** RF-001 CRITICAL kapanır; RF-011.
- **bağımlılık:** CFO-003 (kur), CFO-007 (KDV esası) kararı; Alperen kararları: dar/geniş, stok esası (maliyet / KDV hariç NRV), yoldaki mal, şahsi varlık dahil mi.
- **uygulama:** PR-A karar memosu + salt-okunur mutabakat testi (bugünkü tüm tanımları ölçer, farkları TL ile yazar); PR-D `cfo_metrik_net_sermaye` + tek snapshot yazarı + Goal/sayfa/motor aynı kaynak.
- **kabul:** Goal Engine `wealth_usd` = `/cfo` servet kartı = snapshot (aynı tarih, aynı kur) 1 TL içinde; eşlik testi CI'da.
- **AI maliyeti:** 0 · **durum:** IN_PROGRESS · **PR:** PR-A (memo `docs/CFO-METRIC-CONTRACT.md` + `scripts/cfo/metric-reconciliation.sql` + CI kontrolü) · **tamamlanma:** —
- **PR-A sonucu (2026-10-08):** önerilen net sermaye 2.973.814 TL ≈ 61,2k USD (LCNRV, geniş); önerilen borç 5.889.904 TL ≈ 121,3k USD (+3,79M taahhüt ayrı); KDV hariç ciro ölçülemiyor (yeni RF-025).

### CFO-002 — Borç tek tanım + hedef <100k USD
- **neden:** Hedef 5M TL (eski); 5 borç formülü; KMH yok; yoldaki mal vergisi borçta; şahsi kartlar karışık; 5M sabiti SQL+TS'de.
- **hedef:** G3 · **etki:** sipariş kapısı ve borç hedefi doğru eşikle; açık belirsizliği 13k–91k USD → tek sayı.
- **bağımlılık:** CFO-003, CFO-006; Alperen kararı: yoldaki mal ödenmemiş vergi borç mu (hedef açısından), şahsi borç dahil mi.
- **uygulama:** `cfo_metrik_borc` (bileşenli: kredi kalan/erken kapama, kart toplam/devreden, kullanılan KMH, yoldaki mal, şirket/şahsi); `fm_goal` v2 (`debt_below_100k_usd`), `debt-policy` aynı konfigürasyondan.
- **kabul:** grep'te 5000000/5_000_000 yalnız tek konfigürasyonda; Goal yeni hedefi ölçer; `/cfo/borclar` toplamı = sözleşme.
- **AI maliyeti:** 0 · **durum:** VALIDATED

### CFO-003 — Stratejik kur tek kaynak
- **neden:** 4 kaynak (48,56 / 48,98 / 49,20) + yedek sabitler 1/45/48,5 + snapshot kur döngüsü.
- **hedef:** G1–G3 · **etki:** USD hedef ölçümleri tutarlı.
- **bağımlılık:** karar (TCMB aylık döviz alış vs ay başı ölçüm `cfo_kur`); `lib/fx/current.ts` tek okuyucu.
- **kabul:** CFO modüllerinde sabit kur yok; kur yoksa UNKNOWN; tüm sayfalar aynı kur.
- **AI maliyeti:** 0 · **durum:** VALIDATED

### CFO-004 — `remainingOverride` TL olarak kullanılmasın
- **neden:** Taksit sayısı TL'ye karışıyor (LATENT). **uygulama:** `cfo_servet_kalem`, `cfo_kilometre_yaz` migration (Cowork uygular), PGlite testi.
- **kabul:** override=12 iken borç değişmez. **maliyet:** S · **durum:** ✅ TAMAMLANDI 2026-10-09 — PR #213; migration `20261009100000_cfo_kredi_kalan_anapara` (sha256 2de5c7bb…ebca7) Cowork 2026-10-08 21:25 UTC uyguladı; üretimde Krediler satırı = −3.373.797,12 = kalan anapara, `cfo_kilometre_yaz` override kullanmıyor; PGlite testi `ai-cfo-source-mapping`; parmak izi yeniden ölçüldü.

### CFO-005 — Düz %4,5 KMH oranını kaldır
- **neden:** 5 yerde düz oran; borclar satırları toplamı tutmuyor; kart erteleme KKDF/BSMV'siz.
- **uygulama:** hesap başına ölçülmüş oran (yoksa UNKNOWN) — downside ile aynı yardımcı; `cfo_kart_karari` → card-cost; `cfo_loan.interestRatePct` şema yorumu "yıllık".
- **kabul:** `kmhMonthlyRatePct` yalnız ayarlar sayfasında (gösterim); borclar satır toplamı = toplam. **durum:** ✅ TAMAMLANDI 2026-10-09 — (ek 2026-10-09: kart vergi çarpanı ×1,30 → ×1,20, Alperen kararı; TS bu PR, SQL migration 20261009160000 Cowork bekliyor) migration 20261009110000 Cowork tarafından uygulandı (05:57 UTC; checksum 99359b09…); üretimde Enpara ertelemesi 36.000 TL → ~1.989 TL/ay kart faiziyle. Önceki: TS katmanı tamam (2026-10-09; testler `cfo-engine-forecast`, `cfo-downside`); CFO-005b (2026-10-09): `cfo_kart_karari` kart akdi × 1,30 (migration 20261009110000, sha256 99359b09…7314) + şema yorumu YILLIK — Cowork uygulayınca DONE.

### CFO-006 — Şirket/şahsi tek sınıflama
- **neden:** 4 nakit + 4 kapasite tanımı; regex/ILIKE/LIKE karışık. **uygulama:** `cfo_bank_account`/`cfo_credit_card` için sahiplik alanı (SIRKET/SAHSI) veya tek SQL fonksiyonu; tüm tüketiciler.
- **kabul:** dip ve kapasite tüm sayfalarda aynı. **durum:** VALIDATED

### CFO-007 — KDV esası
- **neden:** marj ve NRV KDV dahil; vergi borcu yok. **bağımlılık:** `unitCostTry` esası teyidi (Alperen). **uygulama:** karar memosu; KDV hariç katkı marjı; NRV KDV hariç; isteğe bağlı KDV yükümlülüğü satırı.
- **durum:** DISCOVERED (karar bekliyor)

### CFO-008 — Ciro hedefi tanımı + tek ciro fonksiyonu
- **neden:** KDV dahil ölçüm; 7 ciro formülü; Alfashome hariç, IDEASOFT/tekstil dahil. **uygulama:** karar → `cfo_metrik_ciro(gün aralığı, kdv)`; tüm sayfalar.
- **durum:** IN_PROGRESS — kısım 1 (2026-10-09, Alperen sırası 1): KDV hariç ciro ölçülebilir hale geliyor — migration `20261009120000_fm_kdv_haric_ciro` (kaynakta yoksa SKU'nun pazaryeri KDV oranı 2023-07-10 sonrası, yoksa %20 bayraklı; kalite U → B), Cowork uygulayacak + 2026-05..08 tek seferlik hafıza tazelemesi. Üretim ölçümü (salt-okuma): Eylül KDV hariç 1.604.768 TL (dahil 1.925.721). Kısım 1 ve 2 ÜRETİMDE (2026-10-09, Cowork; 120000 06:16 + tazeleme 06:16:53, 130000 05:48 UTC): Nisan–Ekim KDV hariç ciro boş gün yok (not B), Eylül 1.604.768 TL; hedef hızı 58.318 TL/gün, projeksiyon 1.807.851 TL, bayrak goal_sources_partial. Kısım 2 ayrıntı: hedef motoru kaynak tazeliği — migration `20261009130000_fm_goal_kaynak_tazeligi`: hız / projeksiyon / gereken hız yalnız her kaynağın (Trendyol senkronu, Entegra içe aktarımı) o gün bittikten sonra okunduğu günlerden; gözlenen MTD aynen; bayrak `goal_sources_partial`. Üretim 09.10: tam gün 04.10'a kadar → hız 51.941 → 58.318 TL/gün, aylık projeksiyon 1.610.158 → 1.807.851 TL (33,2k → 37,2k USD). Test `fm-goal-kaynak`. Kalan: hedef tanımı D-P05 (KDV/kanal), günlük hafıza satırının kendi notu (gün bazında kaynak kapsamı) — hedef seviyesinde çözüldü.

### CFO-025 — Sabit kurun maliyete etkisi (433 maliyetli ürün)
- **neden:** Cowork (2026-10-09): karşılaştırılabilen 8 üründen 4'ünde maliyetin sabit kurla hesaplandığı doğrulandı; kalan 433 maliyetli üründe yaygınlık bağımsız kaynakla ölçülemedi. Marjın, LCNRV'nin ve kâr kurallarının tabanı `unitCostTry`.
- **uygulama:** salt-okunur ölçüm — her maliyetli ürün için maliyetin hangi kurla üretildiği (kaynak USD maliyet × kur ↔ `unitCostTry`), bugünkü kurla fark (TL, ciro ağırlıklı), etkilenen marj/LCNRV; sonra düzeltme önerisi (veri yazımı insan onayı).
- **sıra:** Alperen: KDV hariç cirodan hemen sonra. **AI maliyeti:** 0 · **durum:** IN_PROGRESS
- **ölçüm (2026-10-09, üretim salt-okuma):** 433 maliyetli ürünün 431'inde `unitCostTry = unitCostUsd × 48,50` (404 ürün tam 48,50; 26'sı 48,49–48,52 yuvarlama); kayıtlar 28.08–08.10 arasında yeniden yazılmış. 48,50 ≈ TCMB Eylül (48,5585). Bugünkü kurla fark: `cfo_kur` 48,98 → rafta stok maliyeti +24.634 TL (%0,57); `cfo_settings` 49,20 → +43.920 TL. Son 30 gün satılan maliyet farkı 4.475 TL → **marj etkisi 0,43 puan** (KDV hariç ciro üzerinden). Tek sapma: M-BANYOMİX (50,36; 8 USD → 402,85 TL; stok 1.205 → 485k TL — 4.537 TL kur kaynaklı fark).
- **asıl belirsizlik kurda değil USD maliyette:** `unitCostUsd / (sourceCostRmb / 6,72)` = ithalat çarpanı 1,27 ile 84,6 arasında; 253 ürün 1,52–1,74; 16 ürün > 3 (küçük RMB'li ürünlerde birim navlun normal) — **TE-RINGFILLLIGHT 16 RMB → 201,37 USD (84×), maliyet 9.767 TL: veri hatası** (stok 0; satılırsa marjı bozar). RF-030.
- **sonraki adım:** Cowork'ün 8 ürünlük karşılaştırmasındaki 4 sapmanın kaynağı (kur mu, USD maliyet mi, çarpan mı) — kur ise etkisi ölçüldüğü gibi küçük; USD/çarpan ise 433 ürün için çarpan dağılımı + fatura örneklemi. Düzeltme: TL maliyet saklanmasın, `unitCostUsd × stratejik kur` (D-P04) çalışma anında; veri yazımı insan onayı.

### CFO-009 — Alarm teslimi ve gözlemlenebilirlik
- **uygulama:** sağlık değerlendirmesini Vercel cron'larının `after()` zincirine de ekle; `running` > 15 dk → başarısız say; kilit hatasında `cfo_run` satırı; `cfo-cycle`'ı mevcut cron'a bağla; teslim kanalı (e-posta/WhatsApp — mevcut WhatsApp altyapısı) karar: Alperen.
- **kabul:** GitHub işi olmadan alarm üretilir; takılan koşu testi. **durum:** IN_PROGRESS — kısım 1 bitti 2026-10-09 (PR #216: `stuck_run` alarmı, kilit hatası `cfo_run` satırı, başarısız/takılı dilim yeniden denenir); kısım 2 kod 2026-10-09 (Cowork 09.10 bulgusu: xml-sync `after()` koşusu 300 sn sınırında öldü, 4+ saat `running`): ölü koşu süpürmesi (`sweepStuck` → `failed`/`killed_timeout`), senkron sonrası motor süre bütçesi (≥150 sn yoksa başlamaz, değişiklik günlüğüne iz), `cfo_gun_ozeti` SAĞLIK satırı ACİL (TAKILDI / BAŞARISIZ / BAYAT; migration `20261009150000`, Cowork uygulayacak). Kalan: `cfo-cycle`, teslim kanalı (D-P07).

### CFO-010 — Defter bakım yolu
- **uygulama:** kredi/kart için ay dönümü devri (ödenen ay → sonraki vade), `currentMonthState` sıfırlama; alacak/ödeme girişi için kontrollü form veya içe aktarma; `cfo-actions.ts` bağlanır ya da silinir.
- **kabul:** ay dönümünde `payment_unmarked` doğru tetiklenir. **durum:** ✅ TAMAMLANDI 2026-10-09 — kısım 1 (PR #216) + kısım 2: ödeme durumunun TEK kaynağı takvim (`cfo_cash_event` taksit satırı + `isSettled`, projeksiyonla aynı); `currentMonthState` alarmda/sayfada okunmuyor → ay dönümü devri ve `paidAt` gereksiz; `ledger_stale` = aktif kredi/kartın takvimde bekleyen ödemesi yok; yeni `schedule_duplicate` (banka × ay taksit > aktif kredi; üretimde Yapı Kredi Kas–Oca, RF-029); `/cfo/borclar` "takvimde sonraki ödeme"; ödeme girişi `/cfo/odemeler` (loglu); yetim `cfo-actions.ts` silindi. Üretim salt-okuma: boşluk 0, mükerrer 3 ay. Kalan veri işi: RF-029 satırları (Cowork/Alperen).

### CFO-011 — Maliyet kapsamı ≥ %95
- **durum:** BLOCKED — veri (6 SKU maliyeti, anunnaki-pointer eşlemesi, 2827456501236 set tanımı; Alperen). Code tarafı ✅ TAMAMLANDI 2026-10-08 (PR #210; migration 20261008200000 Cowork 2026-10-08 20:26 UTC uyguladı, satır toplamı = ciro üretimde doğrulandı).

### CFO-012 — Karar hafızası kalibrasyonu
- **uygulama:** yeni hamlede `beklenen_deger` + `olcum_metrigi` zorunlu; motor/sermaye önerileri hamle önerisi olarak kaydedilir (onay akışı); ölçüm `cfo_hamle_olcum`'a; kalibrasyon skoru. **durum:** VALIDATED

### CFO-013 — Tek nakit yolu
- **uygulama:** vadesi geçmiş ödenmemiş kalemler projeksiyonda "bugün"e taşınır (ya da takvimden ayrı gösterilir); iki dip tek dip. **durum:** VALIDATED

### CFO-014 — UNKNOWN→0 süpürmesi
- **uygulama:** listelenen yollar (RF-016) UNKNOWN taşır; tahmin kanıtları `measured=false`. **durum:** VALIDATED

### CFO-015 — Ölçülmemiş faiz oranları
- **durum:** BLOCKED — veri (Garanti, Garanti Alp, Akbank Alp, Ziraat amaca bağlı, 4 şahsi KMH ekstre oranları; Alperen).

### CFO-016 — Güvenlik
- **uygulama:** yazma yollarına CFO_WRITE/uygun yazma izni; `openQuestionCount` auth; audit `source` sunucu tarafında; Cowork için `cfo_gun_ozeti`/`cfo_run` SELECT'li salt-okunur rol (Cowork'ün migration/veri yazımı ayrı, kayıtlı yol). **durum:** VALIDATED

### CFO-017 — Atıf kimliği · CFO-001'in parçası olarak tek snapshot yazarı. **durum:** VALIDATED
### CFO-018 — Eski motoru emekli et · CFO-001..006 sonrası. **durum:** DISCOVERED
### CFO-019 — Held-back migration koruması · `prisma migrate deploy` uygulamasın (ayrı dizin veya guard). **durum:** ✅ TAMAMLANDI 2026-10-09 — `scripts/schema-baseline/guard-deploy.mjs`: `db:migrate:deploy` önce korumayı çalıştırır; baseline.json `notAppliedInProduction` boş değilse (bugün 3: market_scout, drop_legacy_backup_tables, 110000) `ALLOW_HELD_BACK_MIGRATIONS` listeyi aynen saymadıkça, hedef Supabase ise `ALLOW_PRODUCTION_MIGRATE_DEPLOY=1` olmadıkça reddeder. Sınır: `npx prisma migrate deploy` doğrudan çağrılırsa atlanır (belgelendi). Test `migrate-deploy-guard` (CI).
### CFO-020 — Ölü stok tek kural + eşikler konfigürasyondan. **durum:** DISCOVERED
### CFO-021 — CI yml:113 + alfashome testi + eski UI metinleri. **durum:** VALIDATED
### CFO-022 — Nakit tahmini kalibrasyonu (eski PDKS yol haritası #5). **durum:** PLANNED (veri birikiyor; ~2026-10-25 sonrası)
### CFO-023 — Sayfa-motor eşlik testi · CFO-001..008 tamamlandıkça genişler. **durum:** DISCOVERED
### CFO-024 — Ölü bileşen temizliği. **durum:** DISCOVERED

---

## Tamamlanan

Faz 0 sonrası (backlog maddesi):
- ✅ TAMAMLANDI 2026-10-09 — **CFO-004** kredi borcu = kalan anapara (PR #213 + migration 20261009100000 üretimde; RF-005 kapandı).
- ✅ TAMAMLANDI 2026-10-08 — **CFO-001 PR-A** metrik sözleşmesi memosu + salt-okunur mutabakat SQL'i (PR #212). CFO-001'in kendisi karar bekliyor.
- ✅ TAMAMLANDI 2026-10-08 — **Faz 0 ilk tam denetim** + 5 yönetim dosyası (PR #211).
- ✅ TAMAMLANDI 2026-10-09 — **CFO-009 kısım 2 (kod)** ölü koşu süpürmesi + motor süre bütçesi + SAĞLIK alarmı (migration 20261009150000 Cowork bekliyor). Madde açık (teslim kanalı, cfo-cycle).
- ✅ TAMAMLANDI 2026-10-09 — **CFO-009 kısım 1** takılan koşu alarmı, kilit hatası izi, başarısız dilim yeniden denenir (PR #216). Madde açık (teslim kanalı).
- ✅ TAMAMLANDI 2026-10-09 — **CFO-005** düz %4,5 KMH oranı kalktı: TS (PR #214) + `cfo_kart_karari` kart faiziyle (PR #215; migration 110000 üretimde 2026-10-09).
- ✅ TAMAMLANDI 2026-10-09 — **CFO-019** held-back migration koruması (`db:migrate:deploy` guard; RF-017 RESOLVED).
- ✅ TAMAMLANDI 2026-10-09 — **CFO-010** defter bakım yolu: ödeme durumu tek kaynak = takvim; boşluk + mükerrer taksit alarmı; Borçlar takvimden; yetim `cfo-actions.ts` silindi (PR #216 + bu PR; RF-028 RESOLVED, RF-029 açıldı).
- ✅ TAMAMLANDI 2026-10-09 — **CFO-005 TS katmanı**: düz %4,5 KMH oranı kalktı, banka başına ölçülmüş oran, kademeli (PR #214). SQL kısmı (PR #215) migration bekliyor.

Faz 0 öncesi (referans; ayrıntı PDKS.md / CHANGELOG.md):
- ✅ TAMAMLANDI 2026-10-08 — PR #210: maliyet kapsamı bulgusu açığı kapatan en kısa SKU listesini veriyor (migration 200000 üretimde).
- ✅ TAMAMLANDI 2026-10-08 — PR #209: kart sütunları + mükerrer anahtar düzeltmesi üretimde, parmak izi yeniden ölçüldü.
- ✅ TAMAMLANDI 2026-10-08 — PR #208: CASH_CRITICAL KMH faizi dahil dipte de tetikleniyor.
- ✅ TAMAMLANDI 2026-10-08 — PR #207: kademeli KMH faizi (yalnız KMH ile fonlanan kısma, ölçülmüş banka oranı).
- ✅ TAMAMLANDI 2026-10-08 — PR #206: mükerrer satır anahtarı platform satır kimliği + KMH kapasite alarmı.
- ✅ TAMAMLANDI 2026-10-08 — PR #205: CASH_CRITICAL kanıtında KMH faizi dahil dip.
- ✅ TAMAMLANDI 2026-10-08 — PR #204: mükerrer kanonik satış satırları marj kurallarını şirket çapında susturmuyor.
- ✅ TAMAMLANDI 2026-10-08 — PR #203: banka bayatlık kapısına önemlilik eşiği (10.000 TL).
- ✅ TAMAMLANDI 2026-10-08 — PR #202: Trendyol senkronu 12:00 UTC (motor Cowork'ün 16:49 okumasından önce koşar).
- ✅ TAMAMLANDI 2026-10-08 — PR #201: kart borç maliyeti (faiz yalnız devreden bakiyeye, akdi oran + KKDF/BSMV).
- ✅ TAMAMLANDI 2026-10-08 — PR #200: `cfo_maliyet_kapsami` üretimde, parmak izi yeniden ölçüldü.
- ✅ TAMAMLANDI 2026-10-08 — PR #199: tek tahsilat mekanizması, motor günde 3 koşu, tek maliyet kapsamı tanımı.
- ✅ TAMAMLANDI 2026-10-08 — PR #198: `cfo_gun_ozeti` İstanbul saati + sıfır stoklu bulgularda "stokta yok".
- ✅ TAMAMLANDI 2026-10-08 — PR #197: sitede LLM yok — deterministik CFO motoru + Cowork günlük görünümü.
- ✅ TAMAMLANDI 2026-10-07 — PR #196: aşağı yön senaryoları (nakit dibinin taşıyabileceği şok).
- ✅ TAMAMLANDI 2026-10-07 — PR #195: gelir kaldıraçları (100k USD/ay açığını kapatma yolları sıralı).
- ✅ TAMAMLANDI 2026-10-07 — PR #194: Decision Memory + hedef açığı atfı.
- ✅ TAMAMLANDI 2026-10-07 — PR #193: sermaye verimliliği + marjinal tahsis, Value of Information motoru, kredi faizi düzeltmesi.
- ✅ TAMAMLANDI 2026-10-07 — PR #192: CFO panel defterlerini (Trendyol kesinti, banka hareketi, teklif) okuyor.
- ✅ TAMAMLANDI 2026-10-07 — PR #191: tek kur kaynağı (`cfo_kur`) + 2 üretim tablosunun migration kaydı.
