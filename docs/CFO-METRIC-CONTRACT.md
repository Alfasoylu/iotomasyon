---
last_updated: 2026-10-10 17:40 TR
current_main_commit: e863f1e
current_phase: "Faz 2 — Veri kalitesi ve güvenlik (Faz 1 metrik sözleşmesi ✅ 10.10: net sermaye/borç/kur/KDV/ciro tek tanım üretimde doğrulandı)"
current_score: 67/100
next_action: "RF-006 / CFO-009 otomasyon + teslim kanıtı: 13:xx UTC motor cron’u (doğrulama 14:10 UTC) + 11.10 06:xx UTC döngü + WhatsApp teslimi (132001: iotomasyon WHATSAPP_PHONE_NUMBER_ID ↔ cfo_alarm şablonunun WABA’sı, Alperen) → CFO-017 2. v3 günü atıf (11.10 05:xx UTC snapshot) → CFO-020 50k/KPI eşikleri → CFO-018 eski motor → CFO-012 ilk otomatik ölçüm (31.10/01.11)"
---

# CFO METRİK SÖZLEŞMESİ — karar memosu (CFO-001 PR-A)

> **Durum 2026-10-09:** D-P01 GENİŞ, D-P02 LCNRV, D-P03 finansal borç kararlandı. **Net sermaye uygulandı (PR-D):** tek tanım
> `cfo_metrik_net_sermaye()` (migration `20261009170000`, Cowork uygulayacak) — Goal Engine (`fm_balance_day` `net_capital_try` v3),
> `cfo_snapshot.contractNetWorthTry` ve `/cfo` manşeti aynı fonksiyondan. Üretim 09.10: **2.900.562 TL**. Uygulama ayrıntısı: nakit = artı
> bakiyeler, KMH = eksi bakiyeler; satan ama maliyeti olmayan stok (24 SKU, ≤ 256.990 TL) ve değeri bilinmeyen stok (32 SKU) BILINMIYOR
> satırında, toplamda değil. Mutabakat SQL'i `net_sozlesme` sütunuyla bağımsız ikinci uygulamadır (CI eşitlik testi). **Borç uygulandı (CFO-002):** `cfo_metrik_borc()` (migration `20261009180000`) — kredi kalan + kart toplam +
> kullanılan KMH; hedef `cfo_settings.debtTargetUsd` × TCMB; Goal `debt_below_usd` ve sipariş kapısı aynı kaynak. Üretim 09.10: 5.889.904 TL.
> **Kur uygulandı (CFO-003, D-P04 onayı 2026-10-09):** `lib/fx/strategic.ts` — TCMB döviz alış 15'i, yoksa önceki ay (B), yoksa
> BİLİNMİYOR; TCMB ayı otomatik kaydedilir. Hedef ölçen tüm USD dönüşümleri (Goal, kapı, ciro hedefi, `/cfo`) aynı kur.

Amaç: stratejik hedeflerin (ciro, net sermaye, borç) ve nakdin **tek** tanımı. Bugün yaşayan tüm tanımlar
`scripts/cfo/metric-reconciliation.sql` ile tek satırda ölçülür (salt-okunur; CI'da üretim kopyasında koşar; Cowork da çalıştırabilir).
Aşağıdaki sayılar **2026-10-08 ~23:50 TR üretim** ölçümüdür.

Her metrik için: bugünkü tanımlar → CFO önerisi (gerekçeli) → karar sahibi. Öneriler Alperen kararıyla kesinleşir
(CFO-DECISION-LOG D-P01…D-P07); karar gelene kadar Goal Engine bugünkü tanımla ölçmeye devam eder ve sapma bu memoda görünür kalır.

---

## 1. Net sermaye (G2 ≥ 300.000 USD)

### Bugünkü tanımlar (TL)

| Tanım | Formül | Değer | USD (48,5585) | Kim kullanıyor |
|---|---|---|---|---|
| DAR (Goal Engine) | nakit + alacak + rafta stok (KDV dahil NRV) − kredi − kart | **2.507.805** (sabah gözlemi 2.617.204) | 51,6k | `fm_goal.wealth_usd`, `/admin/ai-cfo`, `/cfo/kararlar` |
| GENİŞ (`/cfo` servet kartı) | DAR + yoldaki malın ödenmiş kısmı | **6.266.139** | 129,0k | `cfo_servet.servet_try`, `/cfo`, `/admin/sermaye` |
| Geniş, stok maliyetle | | 3.344.640 | 68,9k | — |
| Geniş, stok KDV hariç NRV | | 4.356.038 | 89,7k | — |
| **Geniş, stok LCNRV, KMH dahil (öneri)** | nakit + alacak + **min(maliyet, KDV hariç NRV)** + yoldaki ödenmiş − kredi − kart − kullanılan şirket KMH | **2.973.814** | **61,2k** | — |

Stok (rafta) bileşenleri: maliyet 4.316.406 · KDV dahil NRV 7.237.906 · KDV hariç NRV ≈ 5.327.804 · **LCNRV 3.945.580**.
**39 SKU'nun KDV hariç NRV'si maliyetinin altında** (KDV + komisyon + kargo sonrası zararına satılıyor); **32 SKU DEGERSIZ** (maliyet ve satış
yok → bugün 0 sayılıyor, 336 adet; UNKNOWN olmalı).

### Neden fark var
1. **Yoldaki mal:** DAR, parası ödenmiş 3,76M TL'lik yoldaki malı hiç saymıyor → ödeme anında net sermaye yapay olarak düşüyor, mal rafa inince yükseliyor (ithalat kararını cezalandırır).
2. **Stok esası:** KDV dahil NRV = satış fiyatı × banka net oranı; banka net tutarı müşteriden alınan ve devlete ödenecek KDV'yi içerir → net sermaye KDV kadar şişik. Ayrıca gelecekteki kâr bugünden sermayeye yazılıyor.
3. **KMH:** kullanılan KMH ne borçta ne nakitte ayrı (bugün tüm hesaplar artıda, etkisi 0; eksiye düşünce nakdi azaltarak dolaylı giriyor).

### CFO önerisi (D-P01, D-P02)
**Net sermaye = GENİŞ + LCNRV esası:** nakit (şirket) + alacak + rafta stok **min(maliyet, KDV hariç NRV)** + yoldaki malın **ödenmiş** kısmı (maliyetle)
− kredi kalan anapara − kart toplam borcu − kullanılan KMH. Ödenmemiş yoldaki vergi/navlun iki tarafta da yok (taahhüt olarak ayrı satır).
- Gerekçe: muhasebe standardı (IAS 2 "maliyet ile net gerçekleşebilir değerin düşüğü"); KDV ve gelecekteki kâr sermayeye yazılmaz; ithalat ödemesi sermayeyi yapay düşürmez; ölçülmüş (maliyet) ve ihtiyatlı.
- **Sonuç: 2.973.814 TL ≈ 61,2k USD** → G2 ilerlemesi **%20,4** (bugünkü iki gösterim %17,2 ve %43,0 yerine).
- Yan göstergeler (karar değil, bilgi): "Potansiyel değer" = KDV hariç NRV ile geniş (4,36M); "Likidasyon değeri" (sermaye motoru tasfiye fiyatı).
- DEGERSIZ SKU'lar 0 değil **UNKNOWN** sayılır ve bulgu üretir.

## 2. Borç (G3 < 100.000 USD)

| Tanım | Formül | Değer TL | USD |
|---|---|---|---|
| Goal Engine / sipariş kapısı (bugün) | kredi kalan + kart toplam + **yoldaki ödenmemiş vergi/navlun** (KMH yok) | **9.676.976** (sabah 9.283.200) | 199,3k |
| **Finansal borç, şirket (öneri)** | kredi kalan + kart toplam + kullanılan şirket KMH | **5.889.904** | **121,3k** |
| Erken kapama tutarıyla, şahsi KMH dahil | kredi erken kapama + kart + tüm KMH | 6.030.908 | 124,2k |
| Ayrı taahhüt satırı | yoldaki ödenmemiş gümrük/navlun | 3.787.072 | 78,0k |

### CFO önerisi (D-P03)
**Borç = finansal borç:** kredi **kalan anapara** + kart **toplam** borcu (ekstre + dönem içi; faiz yalnız devredende — card-cost) + **kullanılan KMH**
(şirket; şahsi KMH/kart iş için kullanılıyorsa ayrı satır, hedefe dahil). Yoldaki malın ödenmemiş gümrük/navlunu **ticari taahhüt**tür, finansal borç değil:
hedefin dışında, nakit projeksiyonunda ve "taahhütler" satırında görünür.
- Gerekçe: hedef "kaldıraç azaltma"; gümrük vergisi malla birlikte gelen kısa vadeli ticari yükümlülük, ödenince stok maliyetine eklenir. Bugünkü tanım 3,79M'lik taahhüdü borç sayıp ödenmiş malı servetten düşürüyor — iki tarafta tutarsız.
- **Sonuç: 5,89M TL ≈ 121,3k USD** → hedefe **~21k USD** (bugünkü gösterim 99k USD açık).
- Sipariş kapısı (debt-policy 5M TL) aynı tanım + aynı konfigürasyondan okunur; 5M sabiti kalkar.

## 3. Kur (D-P04)

| Kaynak | Değer | Not |
|---|---|---|
| TCMB aylık döviz alış (`fm_memory_fx_monthly`) | 48,5585 (Eylül; **Ekim satırı NULL**, Goal önceki ayı kullanıyor) | resmî, tekrarlanabilir; ~1 ay gecikmeli |
| `cfo_kur` (ay başı tek ölçüm, dunya.com) | 48,98 | elle; "ay ortalaması değil" |
| `cfo_settings.usdTryRate` | 49,1976 | elle; `/cfo` rozeti, gümrük, kazananlar |
| `cfo_servet.kur` | 48,98 | son snapshot kuru (döngü riski) |

**CFO önerisi:** stratejik kur = **TCMB döviz alış, ayın 15'i bülteni** (bugünkü `fm_fx_monthly` yöntemi); ay içinde henüz yoksa önceki ay
(işaretli, grade B); hiç yoksa UNKNOWN (sabit 1/45/48,5 yedekleri kalkar). Tüm USD dönüşümleri (`lib/fx/current.ts` tek okuyucu) bunu kullanır;
`cfo_settings.usdTryRate` ve `cfo_kur` yalnız operasyonel (ithalat fiyatlama) kurdur, hedef ölçmez. Ekim satırının NULL kalması ayrı bulgu:
`scripts/fm-fx-tcmb.ts` elle çalışıyor (otomasyon CFO-003 kapsamında).

## 4. Ciro (G1 ≥ 100.000 USD/ay) (D-P05)

| Tanım | Bu ay (1–7 Ekim) TL | Not |
|---|---|---|
| Goal Engine `revenue_incl_vat_try` (fm kanonik) | **369.299** | KDV dahil; Entegra + Trendyol API; IDEASOFT ve eski tekstil dahil; Alfashome hariç |
| Goal Engine KDV hariç | **NULL** | `revenue_ex_vat_try` hiç doldurulmuyor (grade U) — **KDV hariç ciro bugün ölçülemiyor** |
| `cfo_satis_siparis` (motor) | 241.834 | yalnız Entegra (Trendyol API boşluğu ayrıca tahmin) |
| Diğer (revenue-levers 90g/3, `cfo_ciro_hedef` son tam ay, eski motor `last14dRevenueTry` 23.08) | — | 7 farklı formül |

**Ek bulgu:** son günler eksik ama "A" notlu: 07.10 = 5.288 TL (tipik gün 55–75k), çünkü Entegra yüklemesi 05.10'da kalmış. Goal Engine'in ay
tahmini (1,64M ≈ 33,7k USD) eksik günleri tam sayıyor → **ciro hedefi gidişi olduğundan kötü görünüyor** (RF-20261008-025).

**CFO önerisi:** hedef ciro = **KDV hariç, iade/iptal düşülmüş, tüm satış kanalları (Alfashome dahil, eski tekstil hariç)**, sipariş tarihine göre;
KDV dahil tutar yan gösterge. Gerekçe: KDV şirketin geliri değil; 100k USD hedefinin ekonomik anlamı net satış. Önkoşul: `revenue_ex_vat_try`
doldurulmalı (satır KDV'si `vatAmountTry` Entegra'da var). KDV hariç ölçülemediği sürece hedef KDV dahil ölçülür ve **"KDV dahil"** etiketiyle
gösterilir. Eksik günler (kaynak tazeliği) "A" değil "tamamlanmamış" sayılır ve run-rate'e girmez.

## 5. Nakit

| Tanım | Değer TL | Kullanan |
|---|---|---|
| Tüm hesaplar (şahsi dahil) | 151.553 | eski motor, `cfo_odeme_gunluk`, `cfo_servet` |
| Şirket (`cfo_nakit_kapisi`) | 151.553 | projeksiyon, motor, downside |

Bugün şahsi hesapların bakiyesi 0 olduğundan sayılar eşit; tanım farkı şahsi hesaba para girdiği gün ortaya çıkar. **Öneri (D-P01 ile):** şirket
nakdi tek tanım (`cfo_nakit_kapisi` mantığı, tek sınıflama alanıyla — CFO-006); şahsi bakiye ayrı "şahsi kaynak" satırı.

---

## Özet: önerilen sözleşme bugün ne gösterirdi

| Hedef | Bugünkü gösterim | Önerilen tanım | Hedef | Açık |
|---|---|---|---|---|
| G1 ciro | 33,7k USD/ay (KDV dahil, eksik günlerle) | KDV hariç — **ölçülemiyor** (önce veri) | 100k | — |
| G2 net sermaye | 51,6k (Goal) / 129,0k (`/cfo`) | **61,2k USD** | 300k | 238,8k |
| G3 borç | 199,3k USD | **121,3k USD** (+ 78,0k taahhüt ayrı) | <100k | 21,3k |

## Uygulama sırası (karar sonrası)
PR-B (CFO-004, kararsız yapılabilir) → PR-C kur → PR-D net sermaye (tek SQL fonksiyonu + tek snapshot yazarı + Goal/sayfa/motor) →
PR-E borç + `fm_goal` v2 → ciro ex-VAT verisi (CFO-008). Her PR sonunda bu memo "bugünkü ↔ sözleşme" tablosuyla güncellenir; mutabakat
SQL'i sözleşme fonksiyonlarıyla eşitlik testine dönüşür.
