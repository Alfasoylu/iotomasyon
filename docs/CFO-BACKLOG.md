---
last_updated: 2026-10-08 23:45 TR
current_main_commit: 422a6db
current_phase: "Faz 0 — İlk tam sistem denetimi tamamlandı; Faz 1 (Metrik sözleşmesi) sırada"
current_score: 49/100
next_action: "CFO-004 (PR-B) — kararsız yapılabilir; paralelde Alperen kararları D-P01…D-P06 (CFO-METRIC-CONTRACT.md)"
---

# CFO BACKLOG

Sıralama: **(ekonomik değer + risk azaltımı + hedef etkisi) − (karmaşıklık + veri belirsizliği + operasyonel risk)**, her bileşen 1–5.
Skor = (EV + RR + GI) − (CX + DU + OR). Durumlar: DISCOVERED · VALIDATED · PLANNED · IN_PROGRESS · BLOCKED · DONE · REJECTED · DEPRECATED.
Öncelik: P0 finansal doğruluk/güvenlik · P1 büyük ekonomik etki · P2 karar kalitesi · P3 optimizasyon · P4 nice-to-have.
AI runtime maliyeti: tüm maddeler deterministik (SQL/TS) → **0** (LLM yok). Uygulama maliyeti S/M/L.

## Özet (öncelik sırası)

| Sıra | ID | Başlık | P | Hedef | EV | RR | GI | CX | DU | OR | Skor | Maliyet | Durum | RF |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | CFO-001 | Metrik sözleşmesi: net sermaye tek tanım (+ karar memosu, mutabakat testi) | P0 | G2,G3 | 5 | 5 | 5 | 3 | 3 | 2 | **7** | L | IN_PROGRESS (PR-A ✓; karar bekliyor) | 001,011 |
| 2 | CFO-004 | `remainingOverride` TL olarak kullanılmasın | P0 | G2,G3 | 3 | 5 | 3 | 1 | 1 | 1 | **8** | S | IN_PROGRESS (kod+test ✓; migration Cowork'te) | 005 |
| 3 | CFO-003 | Stratejik kur tek kaynak; sabit yedekler → UNKNOWN | P0 | G1,G2,G3 | 3 | 4 | 4 | 2 | 2 | 1 | **6** | M | VALIDATED | 003 |
| 4 | CFO-002 | Borç tek tanım + hedef <100k USD + sabitler tek konfigürasyona | P0 | G3 | 5 | 4 | 5 | 3 | 2 | 2 | **7** | M | VALIDATED | 002,019,020 |
| 5 | CFO-005 | Düz %4,5 KMH oranını kaldır (borclar, gumruk, allocation, kart kararı, capital-eff.) | P1 | G3 | 4 | 4 | 3 | 2 | 1 | 1 | **7** | M | IN_PROGRESS (TS ✓; SQL `cfo_kart_karari` migration 20261009110000 Cowork'te) | 004 |
| 6 | CFO-006 | Şirket/şahsi tek sınıflama; nakit/kapasite/borç bunu kullansın | P1 | G2,G3 | 4 | 4 | 3 | 3 | 1 | 2 | **5** | M | VALIDATED | 010 |
| 7 | CFO-009 | Alarm teslimi GitHub'dan bağımsız; takılan koşu + kilit hatası alarmı; cfo-cycle bağla | P1 | tümü | 3 | 5 | 2 | 2 | 1 | 2 | **5** | M | VALIDATED | 006 |
| 8 | CFO-010 | Defter bakım yolu: kredi/kart vade devri, alacak/ödeme girişi | P1 | tümü | 4 | 4 | 2 | 3 | 1 | 2 | **4** | L | VALIDATED | 007 |
| 9 | CFO-007 | KDV esası kararı + marj/NRV KDV hariç | P1 | G1,G2 | 4 | 4 | 4 | 3 | 3 | 2 | **4** | M | DISCOVERED | 008 |
| 10 | CFO-008 | Ciro hedefi tanımı (KDV, kanal kapsamı) + tek ciro fonksiyonu | P1 | G1 | 3 | 3 | 5 | 3 | 2 | 1 | **5** | M | DISCOVERED | 009,023 |
| 11 | CFO-011 | Maliyet kapsamı ≥ %95 (8 SKU veri + migration 200000) | P1 | G1 | 4 | 3 | 3 | 1 | 1 | 1 | **7** | S (veri) | BLOCKED (veri: Alperen; migration: Cowork) | 013 |
| 12 | CFO-015 | Ölçülmemiş KMH/gümrük/şahsi faiz oranlarını gir | P1 | G3 | 4 | 3 | 3 | 1 | 1 | 1 | **7** | S (veri) | BLOCKED (veri: Alperen) | 018 |
| 13 | CFO-012 | Karar hafızası: beklenen değer zorunlu, `cfo_hamle_olcum` yazımı, kalibrasyon | P2 | tümü | 3 | 2 | 3 | 2 | 2 | 1 | **3** | M | VALIDATED | 014 |
| 14 | CFO-014 | UNKNOWN→0 süpürmesi + measured bayrak düzeltmesi | P2 | tümü | 2 | 4 | 2 | 2 | 1 | 1 | **4** | M | VALIDATED | 016 |
| 15 | CFO-013 | Vadesi geçmiş kalemler: tek nakit yolu (projeksiyon = takvim) | P2 | taban | 2 | 3 | 2 | 2 | 1 | 1 | **3** | S | VALIDATED | 015 |
| 16 | CFO-016 | Güvenlik: yazma izinleri, yetkisiz action, sunucu tarafı audit kaynağı, Cowork salt-okunur rol + görünüm izni | P2 | — | 2 | 4 | 1 | 2 | 1 | 2 | **2** | M | VALIDATED | 012 |
| 17 | CFO-023 | Sayfa-motor eşlik testi (aynı metrik tüm sayfalarda aynı) | P2 | tümü | 3 | 4 | 2 | 3 | 1 | 1 | **4** | M | DISCOVERED | 001-010 |
| 18 | CFO-017 | Atıf kimliği: tek snapshot yazarı, bileşenler toplamı = net sermaye | P2 | G2 | 2 | 3 | 3 | 2 | 1 | 1 | **4** | S | VALIDATED | 011 |
| 19 | CFO-019 | Held-back migration'ları deploy'dan koru | P3 | — | 1 | 4 | 1 | 1 | 1 | 1 | **3** | S | VALIDATED | 017 |
| 20 | CFO-018 | Eski `computeCfo` sayfalarını sözleşmeye taşı, sonra emekli et | P3 | tümü | 3 | 3 | 2 | 4 | 1 | 3 | **0** | L | DISCOVERED | 004,010,024 |
| 21 | CFO-020 | Ölü stok tek kural + eşikler konfigürasyondan | P3 | G2 | 2 | 2 | 2 | 2 | 1 | 1 | **2** | S | DISCOVERED | 019 |
| 22 | CFO-022 | Nakit tahmini kalibrasyonu (Goal Engine gözlemleri, 2–4 hafta veri sonrası) | P3 | taban | 3 | 3 | 2 | 2 | 3 | 1 | **2** | M | PLANNED (veri birikiyor) | — |
| 23 | CFO-021 | CI düzeltmesi (yml:113, alfashome testi) + eski UI metinleri | P4 | — | 1 | 2 | 1 | 1 | 1 | 1 | **1** | S | VALIDATED | 021,022 |
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
- **kabul:** override=12 iken borç değişmez. **maliyet:** S · **durum:** IN_PROGRESS — migration `20261009100000_cfo_kredi_kalan_anapara` (sha256 2de5c7bb…ebca7) Cowork uygulayacak; PGlite testi `ai-cfo-source-mapping`.

### CFO-005 — Düz %4,5 KMH oranını kaldır
- **neden:** 5 yerde düz oran; borclar satırları toplamı tutmuyor; kart erteleme KKDF/BSMV'siz.
- **uygulama:** hesap başına ölçülmüş oran (yoksa UNKNOWN) — downside ile aynı yardımcı; `cfo_kart_karari` → card-cost; `cfo_loan.interestRatePct` şema yorumu "yıllık".
- **kabul:** `kmhMonthlyRatePct` yalnız ayarlar sayfasında (gösterim); borclar satır toplamı = toplam. **durum:** IN_PROGRESS — TS katmanı tamam (2026-10-09; testler `cfo-engine-forecast`, `cfo-downside`); CFO-005b (2026-10-09): `cfo_kart_karari` kart akdi × 1,30 (migration 20261009110000, sha256 99359b09…7314) + şema yorumu YILLIK — Cowork uygulayınca DONE.

### CFO-006 — Şirket/şahsi tek sınıflama
- **neden:** 4 nakit + 4 kapasite tanımı; regex/ILIKE/LIKE karışık. **uygulama:** `cfo_bank_account`/`cfo_credit_card` için sahiplik alanı (SIRKET/SAHSI) veya tek SQL fonksiyonu; tüm tüketiciler.
- **kabul:** dip ve kapasite tüm sayfalarda aynı. **durum:** VALIDATED

### CFO-007 — KDV esası
- **neden:** marj ve NRV KDV dahil; vergi borcu yok. **bağımlılık:** `unitCostTry` esası teyidi (Alperen). **uygulama:** karar memosu; KDV hariç katkı marjı; NRV KDV hariç; isteğe bağlı KDV yükümlülüğü satırı.
- **durum:** DISCOVERED (karar bekliyor)

### CFO-008 — Ciro hedefi tanımı + tek ciro fonksiyonu
- **neden:** KDV dahil ölçüm; 7 ciro formülü; Alfashome hariç, IDEASOFT/tekstil dahil. **uygulama:** karar → `cfo_metrik_ciro(gün aralığı, kdv)`; tüm sayfalar.
- **durum:** DISCOVERED (karar bekliyor)

### CFO-009 — Alarm teslimi ve gözlemlenebilirlik
- **uygulama:** sağlık değerlendirmesini Vercel cron'larının `after()` zincirine de ekle; `running` > 15 dk → başarısız say; kilit hatasında `cfo_run` satırı; `cfo-cycle`'ı mevcut cron'a bağla; teslim kanalı (e-posta/WhatsApp — mevcut WhatsApp altyapısı) karar: Alperen.
- **kabul:** GitHub işi olmadan alarm üretilir; takılan koşu testi. **durum:** VALIDATED

### CFO-010 — Defter bakım yolu
- **uygulama:** kredi/kart için ay dönümü devri (ödenen ay → sonraki vade), `currentMonthState` sıfırlama; alacak/ödeme girişi için kontrollü form veya içe aktarma; `cfo-actions.ts` bağlanır ya da silinir.
- **kabul:** ay dönümünde `payment_unmarked` doğru tetiklenir. **durum:** VALIDATED

### CFO-011 — Maliyet kapsamı ≥ %95
- **durum:** BLOCKED — veri (6 SKU maliyeti, anunnaki-pointer eşlemesi, 2827456501236 set tanımı; Alperen) + migration 20261008200000 (Cowork). Code tarafı DONE (PR #210).

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
### CFO-019 — Held-back migration koruması · `prisma migrate deploy` uygulamasın (ayrı dizin veya guard). **durum:** VALIDATED
### CFO-020 — Ölü stok tek kural + eşikler konfigürasyondan. **durum:** DISCOVERED
### CFO-021 — CI yml:113 + alfashome testi + eski UI metinleri. **durum:** VALIDATED
### CFO-022 — Nakit tahmini kalibrasyonu (eski PDKS yol haritası #5). **durum:** PLANNED (veri birikiyor; ~2026-10-25 sonrası)
### CFO-023 — Sayfa-motor eşlik testi · CFO-001..008 tamamlandıkça genişler. **durum:** DISCOVERED
### CFO-024 — Ölü bileşen temizliği. **durum:** DISCOVERED

---

## Tamamlanan (Faz 0 öncesi, referans)
- PR #199–#210 (2026-10-08): tek tahsilat mekanizması, tek maliyet kapsamı tanımı, kart maliyeti, bayatlık kapısı önemlilik eşiği,
  mükerrer anahtarı, kapasite alarmı, kademeli KMH faizi, CASH_CRITICAL faizli dibe bağlama, kapsam kapatan liste. Ayrıntı: PDKS.md.
