---
last_updated: 2026-10-10 11:47 TR
current_main_commit: 459edd9
current_phase: "Faz 1 — Metrik sözleşmesi (net sermaye/borç tek tanım üretimde; v3 Goal doğrulaması 10.10)"
current_score: 61/100
next_action: "RF-006 otomasyon kanıtı: 13:xx UTC motor cron’u (doğrulama 14:10 UTC) + 11.10 06:xx UTC döngü (doğrulama 07:10 UTC) → RF-038 + CFO-001/CFO-002/CFO-017 v3 doğrulaması (12:35 UTC; düzeltilmiş net sermaye 1.383.530,52 ile) → CFO-031 kalanı: 1.000+ adetlik 3 SKU gerçekliği (Alperen) → CFO-008 kapanışı: AI CFO koşusunda tek kaynak gözlemi → CFO-003 SQL kalanı: migration 120000 (Alperen) → CFO-012 ilk otomatik ölçüm (31.10/01.11)"
open_critical: 1
open_high: 5
score_change: "60→61 — RF-036 RESOLVED: migration 130000 üretimde (Alperen açık onayı) — sanal stok (40005100051) net sermayeden çıktı, 2.401.170 → 1.383.531 TL, kimlik farkı 0; finansal doğruluk 8→9 (RF-036 ile düşen puan geri). RF-006 otomasyonu hâlâ kanıtlanmadı"
---

# CFO SCORECARD

## Metodoloji (sabit — değişiklik ancak gerekçeyle ve DECISION-LOG kaydıyla)

100 puan, 10 boyut. Her puan **kanıt** (dosya:satır / test / metrik / üretim gözlemi) ister. "Özellik var" tam puan değildir:
özellik mevcut ama veri kalitesi, tutarlılık veya kapsama zayıfsa kısmi puan. Bir boyutun puanı, o boyuttaki en zayıf halka ile sınırlanır
(ör. motor doğru ama sayfalar başka tanım gösteriyorsa "tutarlılık" kırılır).

| # | Boyut | Ağırlık | Tam puan için gereken |
|---|---|---|---|
| 1 | Financial accuracy & reconciliation | 20 | Her ekonomik metrik tek tanım; mutabakat testleri (satış, nakit, stok, bilanço kimliği) yeşil; çoklu tanım yok |
| 2 | Cash / liquidity / debt intelligence | 15 | Tek nakit yolu, kapasite, kademeli faiz (ölçülmüş oranlar), borç tek tanım + güncel hedef, ödeme alarmları güvenilir |
| 3 | Capital allocation quality | 15 | Fırsat maliyeti (eşik getiri), marjinal tahsis, doğru tabanlı (KDV hariç, kapsam ≥ %95), kararlara bağlı |
| 4 | Revenue / profitability intelligence | 10 | Tek ciro tanımı, KDV hariç katkı marjı, iade/komisyon/kargo ölçülmüş, marj kuralları açık |
| 5 | Inventory / procurement intelligence | 10 | Hız, stockout, ölü stok (tek kural), ithalat önerisi, yoldaki mal tek kaynak |
| 6 | Decision memory & calibration | 10 | Öneriler beklenen değerle kaydedilir, sonuç ölçülür, isabet skoru izlenir |
| 7 | Data quality / provenance | 7 | UNKNOWN≠0, measured/estimated doğru, kaynak + ölçüm anı her sayıda, bayatlık kapıları |
| 8 | Automation / observability | 5 | Güvenilir zamanlama, sessiz hata yok, alarm teslimi bağımsız |
| 9 | Cost efficiency | 4 | Runtime AI maliyeti ~0 ve ölçülü; altyapı maliyeti bilinir |
| 10 | Security / operational safety | 4 | En az yetki, yazma yolları yazma izniyle, audit izlenebilir, secret güvenliği |

Seviye ölçeği (her boyut): 0–20% yok/yanlış · 20–40% parçalı, çelişkili · 40–60% çalışıyor ama tutarsız/eksik veri · 60–80% doğru ve
tutarlı, küçük boşluk · 80–100% doğru, tutarlı, testli, üretimde gözlenmiş.

## Hard gate'ler (90+ için ayrıca hepsi gerekli)

| # | Gate | 2026-10-08 | Kanıt |
|---|---|---|---|
| H1 | Kritik mutabakat problemi yok | ❌ | RF-001 net sermaye 3 tanım |
| H2 | Açıklanamayan duplicate finansal metrik yok | ❌ | nakit 4, borç 5, kur 4, ciro 7, marj 5 tanım |
| H3 | Kritik UNKNOWN kararlar gizlenmiyor | ❌ | RF-016 (eski motor null→0, sabit kur yedekleri) |
| H4 | Nakit/borç riskleri görünür | ✅ | CASH_CRITICAL (faizli dip tetiği), kapasite alarmı, `cfo_gun_ozeti` (borç tanımı ayrıca H2'de) |
| H5 | Sermaye tahsisi fırsat maliyeti içeriyor | ✅ | `capital-efficiency.ts` eşik getiri, tasfiye başabaş, marjinal tahsis |
| H6 | CFO kararları sonuçla ölçülebiliyor | ❌ | RF-014 (15 kararın 3'ünde beklenen değer; ölçüm tablosu boş) |
| H7 | Önemli sayılar provenance taşıyor | ❌ | eski motor sayfaları kaynak/ölçüm anı taşımıyor; tahminler measured=true |
| H8 | Site sayfaları aynı finansal gerçeği gösteriyor | ❌ | Master Plan §C |
| H9 | Kritik finansal işlem otomatik/kontrolsüz yapılmıyor | ✅ | Ödeme/sipariş/fiyat yolu yok; yazma yolları izinli (bkz. RF-012 kısmi) |
| H10 | Sistem AI olmadan temel CFO görevlerini yapıyor | ✅ | Runtime LLM yok; deterministik motor 3+/gün `completed` |
| H11 | Runtime AI maliyeti düşük ve ölçülüyor | ✅ | LLM çağrısı 0; Cowork abonelik (sitede maliyet yok) |
| H12 | Açık P0 red flag yok | ❌ | RF-001…005 |

**Gate durumu: 5/12.** Skor 90'ı geçse bile gate'ler geçmeden sistem "mükemmel" sayılmaz.

## Puan — güncel (2026-10-10; başlangıç 2026-10-08 = 48)

| # | Boyut | Ağırlık | Puan | Kanıt (artı) | Kanıt (eksi) |
|---|---|---|---|---|---|
| 1 | Financial accuracy & reconciliation | 20 | **9** | Kanonik satış + aylık mutabakat (`fm_sales_reconciliation_monthly`); maliyet kapsamı tek tanım + kova toplamı = ciro testi; projeksiyon eşlik testi (downside parity); mükerrer anahtar düzeltildi | Net sermaye ve borç tek tanım üretimde, v3 Goal doğrulaması 10.10 bekliyor; kur 4, ciro 7, marj 5 tanım; atıf kimliği bozuk (migration 230000 onay bekliyor); RF-036 ✓ RESOLVED 10.10 (migration 130000 üretimde: sanal stok net sermayeden çıktı, 2.401.170 → 1.383.531 TL); 1.000+ adetlik 3 SKU'nun (1,18M TL) gerçekliği teyitsiz (RF-037) |
| 2 | Cash / liquidity / debt | 15 | **12** | TEK NAKİT YOLU üretimde (CFO-013, 10.10: projeksiyon dibi = takvim dibi, günlük fark ≤0,52 TL, her gün eşitlik testli; vadesi geçmiş kalem bugüne); şirket/şahsi tek kural TS + SQL + ödeme kapasitesi (CFO-006 ✅); ödeme alarmı tek kaynak (takvim) + defter↔takvim boşluk ve mükerrer taksit alarmı (CFO-010); 120 gün projeksiyon, tek tahsilat mekanizması, kademeli faiz, kapasite alarmı, CASH_CRITICAL faizli tetik | takvimde mükerrer taksit (RF-029, veri); 8 limitin oranı ölçülmemiş (RF-018, veri); KMH kapasitesi iki ayrıştırma (RF-035 latent: kaynak yeterliliği eksi bakiyede kullanımı iki kez düşer; bugün etki 0) |
| 3 | Capital allocation | 15 | **8** | Eşik getiri (en pahalı kapatılabilir borç), SKU sınıfları, tasfiye başabaş, marjinal tahsis, stres açığı önceliği | kapsam %87,5; aynı sayfada eski `buildAllocation` düz oranla; öneriler kararlara bağlanmıyor |
| 4 | Revenue / profitability | 10 | **6** | TEK CİRO KAYNAĞI (CFO-008, 10.10): manşet ciro tüm CFO yüzeylerinde Goal Engine satırlarından (`lib/cfo/revenue.ts`, tamlık sınırlı, testli); KDV hariç ciro üretimde ölçülüyor (not B, türetme kaynağı bayrakta); hedef hızı yalnız tam kaynaklı günlerden; ölçülmüş komisyon medyanı, kargo bant tarifesi, katkı marjı, gelir kaldıraçları; EPTT komisyonu kanal marjında (Entegra oranı × toplam, tahmini işaretli, CFO-028) | Marj kuralları susuyor (kapsam); marj henüz KDV hariç değil (D-P06); iade marja bağlı değil; 6 kanal + FBA komisyonu UNKNOWN (oran belgesi yok); EPTT tahmini ölçülmemiş (~0,4 puan düşük) |
| 5 | Inventory / procurement | 10 | **6** | XML stok hafızası + hız, stockout, ölü stok, ithalat önerisi, yoldaki kapsam; GTİP 433/433 + yasal gümrük yükü ve `duty_gap` alarmı | 4 ölü stok kuralı; 2 yoldaki mal kaynağı; 3 stok değerleme yöntemi |
| 6 | Decision memory & calibration | 10 | **4** | `cfo_hamle` + beklenen/gerçekleşen ekranı; goal attribution; CFO-012 (10.10): yeni karar yalnız beklenen SAYI + başlangıç + ölçülebilir metrik + tarih ile (form + sunucu doğrulaması; kural tarihinden sonra eksik kayıt "Beklenen değer eksik" bayrağı), kontrol noktası ölçümleri her gece `cfo_hamle_olcum`'a (o günün borç/kamu/FBA değeri, kart/KMH bugünkü bakiye; tekrar yazmaz; PGlite testli), kalibrasyon skoru (isabet, hata, eğilim, kapsam) sayfa + AI CFO kanıtında, sermaye motorunun borç kapama adımları karar taslağı (onayla kaydedilir) | Otomatik ölçüm üretimde henüz gözlenmedi (ilk kontrol noktası 31.10); eski 12 kararın beklenen SAYI'sı yok (kalibrasyon kapsamı 3/15); stok/likidite önerileri 6 metrikle ölçülemiyor; atıf kimliği bozuk |
| 7 | Data quality / provenance | 7 | **5** | Motorda evidence + measured bayrağı, UNKNOWN disiplini, bayatlık kapısı (önemlilik eşikli), source_dead alarmları, şema parmak izi | Eski motorda UNKNOWN→0 (CFO-018; yan modüller kısım 1'de düzeldi); elle defterler; 66 açık soru, karışık durum sözlüğü |
| 8 | Automation / observability | 5 | **4** | 2 güvenilir Vercel cron + 3×/gün GitHub; slot anahtarı/idempotency; `cfo_gun_ozeti` | Alarm teslimi GitHub e-postası; SAĞLIK alarmı (takılan/başarısız/bayat motor) kodda, üretimde migration 150000 bekliyor; yetim `cfo-cycle` |
| 9 | Cost efficiency | 4 | **4** | Runtime LLM yok; deterministik; Vercel Hobby | — |
| 10 | Security / operational safety | 4 | **3** | RLS + REVOKE kalıpları, salt-okunur okuyucu rol, CRON_SECRET sabit-zamanlı, yazma eylemlerinde CFO_WRITE | Düz metin API anahtarları, Cowork ayrıcalıklı yazma rolü, uygulama bypassrls ile bağlanıyor |
| | **TOPLAM** | **100** | **61** | | |

## Skor geçmişi

Kural (CFO-GOVERNANCE-DRIFT, 2026-10-09): her merge bir satır ekler — commit sütunu = belgelerin `current_main_commit`'i, skor = TOPLAM; skor değişmediyse frontmatter `score_change: "unchanged — <gerekçe>"` (bilinçli kayıt), değiştiyse `"<eski>→<yeni> — <gerekçe>"`. CI testi `cfo-governance-drift`.

| Tarih | Commit | Skor | Gate | Not |
|---|---|---|---|---|
| 2026-10-08 | 422a6db | 48 | 5/12 | İlk tam denetim (başlangıç çizgisi) |
| 2026-10-08 | CFO-001 PR-A | 48 | 5/12 | Ölçüm + karar memosu; tanım değişmedi → puan değişmedi (mutabakat görünür ama tek tanım yok). Yeni RF-025 (HIGH), RF-026, RF-027 |
| 2026-10-09 | CFO-004 + CFO-005 | 49 | 5/12 | Düz KMH oranı TS katmanında kalktı (borclar satır=toplam, hayali KMH tasarrufu yok); kredi override hatası düzeltildi (üretimde migration bekliyor) |
| 2026-10-09 | CFO-005b + CFO-009 | 50 | 5/12 | Takılan koşu / kilit hatası görünür, başarısız dilim yeniden denenir (8. boyut 3→4); kart erteleme kart faiziyle (üretimde migration bekliyor) |
| 2026-10-09 | Üretim senkronu (200000 + 100000) | 50 | 5/12 | Kredi borcu üretimde kalan anapara (RF-005 RESOLVED; H12 hâlâ RF-001…004 nedeniyle ❌). Puan artışı yok: 1. boyut tek tanım eksikliğiyle sınırlı |
| 2026-10-09 | CFO-010 kısım 2 | 51 | 5/12 | Ödeme durumu tek kaynak (takvim), çift alarm yok, boşluk + mükerrer taksit görünür (2. boyut 9→10). Projeksiyon 99.832 TL fazla çıkış içeriyor (RF-029, veri) |
| 2026-10-09 | Üretim senkronu (110000/120000/130000) | 52 | 5/12 | KDV hariç ciro + hedef kaynak tazeliği üretimde (4. boyut 4→5); RF-004, RF-025 RESOLVED; H12 hâlâ ❌ (RF-001…003) |
| 2026-10-09 | c0823f9 | 58 | 5/12 | Yeniden puanlama (PR #237–#243 + üretim 150000–220000): 1. boyut 8→9 net sermaye/borç tek tanım + KDV esası (LCNRV KDV hariç) üretimde, v3 Goal doğrulaması 10.10; 2. 10→11 borç sözleşmesi + 5M sabiti kalktı + tek nakit tabanı; 3. 7→8 LCNRV KDV hariç taban, eşik faiz %4 varsayılanı yok; 5. 5→6 GTİP 433/433 + yasal gümrük yükü + `duty_gap`; 7. 4→5 UNKNOWN→0 kısım 1 + measured bayrakları; 10. 2→3 yazma yolları yazma izni. Değişmeyen (bilinçli): 4 (marj KDV hariç değil, 7 ciro formülü), 6 (atıf kimliği migration 230000 onay bekliyor), 8 (WhatsApp teslimi yapılandırılmadı), 9 (tavan). Gate 5/12: H1/H2 (kur 4 + ciro tanımları), H3 (RF-016 kısım 2), H12 (RF-001/002 v3 doğrulaması) hâlâ ❌ |
| 2026-10-10 | ed3c0c9 | 58 | 5/12 | Değişmedi (bilinçli): PR #244 yönetişim CI'ı ve CFO-027 belge kütüphanesi (kod + test; migration 230000 + 240000 aynı akşam üretimde — atıf etkisi ilk bileşenli snapshot ve 2. v3 gününden sonra, belge kütüphanesi boş) hiçbir boyutun üretim davranışını değiştirmedi. Komisyon kaydı boşluğu (RF-032, MEDIUM) 4. boyutun (marj) mevcut puanında zaten yansıyor |
| 2026-10-10 | aa561f4 | 58 | 5/12 | Değişmedi (bilinçli): CFO-006 SQL tek kural üretimde (sayılar birebir aynı); kaynak yeterliliği açığındaki 151.470 TL çift sayım düzeltildi — likidite boyutu CFO-013 ile birlikte yeniden puanlanacak |
| 2026-10-10 | c9da41f | 58 | 5/12 | Değişmedi (bilinçli): maliyet Excel'i eşleştirmesi salt-okunur (veri yazılmadı); RF-033 (maliyet hava+KDV dahil görünüyor) MEDIUM — doğrulanınca 1./3. boyut yeniden puanlanır |
| 2026-10-10 | e1d8eda | 58 | 5/12 | Değişmedi (bilinçli): maliyet Excel'i 336 üründe ithalat motoru girdileri olarak yazıldı; CFO maliyeti (unitCostTry) ve net sermaye aynı — RF-033 kararıyla yeniden puanlanır |
| 2026-10-10 | e1d8eda | 58 | 5/12 | Değişmedi (bilinçli): 335 üründe CFO maliyeti motor maliyetine çekildi (net sermaye −138.411 TL, doğru yönde); otomatik türetme (CFO-029) bitince 1./3. boyut yeniden puanlanır |
| 2026-10-10 | 6a2d888 | 58 | 5/12 | Değişmedi (bilinçli): maliyeti eksik 20 ürün Alperen verisiyle yazıldı (8 ithal motor, 6 yurt içi USD+KDV, 7 NO_REORDER); net sermaye +206.152 TL çünkü 7 SKU ilk kez stok değerine girdi (179.044 TL'si başarısız 4K kamera, NRV ile sınırlı). Maliyet kapsamı arttı ama CFO-011 eşiği (%95) ve CFO-029 bitmeden 1./3. boyut yeniden puanlanmaz |
| 2026-10-10 | 6283500 | 58 | 5/12 | Değişmedi (bilinçli): CFO-029 kodu (motordan otomatik maliyet, GTİP gümrüğü, korumalı yazma, `cost_jump` alarmı) test edildi ama üretimde henüz koşmadı; 1./3. boyut ilk koşu kuru çalıştırmayla doğrulanınca yeniden puanlanır |
| 2026-10-10 | 81ed6dc | 58 | 5/12 | Değişmedi (bilinçli): PR #250 — CFO-029 otomatik maliyet + RMB/USD tek kaynak (6,7, sabit yedek yok; 335 ürün düzeltildi, net sermaye +7.405,67 TL) üretimde, ilk otomatik koşu 10.10 05:00 TR; CFO-013 tek nakit yolu kodu hazır, DDL onayı bekliyor. 1./3. boyut ilk koşu ve CFO-013 uygulanınca yeniden puanlanır |
| 2026-10-10 | bc29fdd | 58 | 5/12 | Değişmedi (bilinçli): PR #251 CFO-013 tek nakit yolu kodu (migration 110000 bekletilen, üretim DDL onayı bekliyor; eski motor ve hash geçişi yayında) üretim davranışını değiştirmedi; CFO-028 ölçümü salt-okunur. Likidite (CFO-013 uygulanınca) ve marj (CFO-028 kararıyla) boyutları yeniden puanlanacak |
| 2026-10-10 | ff42814 | 59 | 5/12 | 58→59: CFO-013 tek nakit yolu üretimde (migration 110000, Alperen onayı; projeksiyon dibi = takvim dibi) + CFO-006 son parçası (ödeme kapasitesi tek kural) → likidite 11→12; RF-010 (HIGH) ve RF-015 RESOLVED. Gate'ler değişmedi (H2/H8 diğer metriklerde açık) |
| 2026-10-10 | 1d41775 | 59 | 5/12 | Değişmedi (bilinçli): CFO-028 kararları — EPTT tahmini komisyon (oran × toplam, measured=false) kanal marjına girdi, SKU oran ölçümü değişmedi; 2 belge kategorisi düzeltildi. 6 kanal + FBA UNKNOWN kaldığı için marj boyutu aynı |
| 2026-10-10 | ed52e04 | 59 | 5/12 | Değişmedi (bilinçli): CFO-003 kod kalanı (eski motor kur tek kaynaktan, kur yoksa BİLİNMİYOR) yayında; SQL sabit kur yedekleri migration 120000 bekletilen — üretime uygulanınca RF-003 RESOLVED ve 1. boyut yeniden puanlanır |
| 2026-10-10 | 0ffbb2c | 60 | 5/12 | 59→60: CFO-008 tek ciro kaynağı (Goal Engine satırları) /cfo, /cfo/ayarlar, gelir kaldıraçları, hedef kartı, /admin/sermaye, borç tahmini ve Alfashome kanıtında; üretim: Eylül 1.931.793 (eski kart 1.777.442), aylık 2.015.623 (eski 1.859.349), /admin/sermaye 90g 6.046.869 (eski yalnız Trendyol 4.104.926) → gelir boyutu 5→6. Gate'ler aynı (H2/H8 AI CFO günlük satış karşılaştırması ve SQL görünümleri nedeniyle açık) |
| 2026-10-10 | 80485f5 | 61 | 5/12 | 60→61: CFO-012 karar hafızası — beklenen SAYI'lı karar kaydı (form + doğrulama + eksik kayıt bayrağı), gece kontrol noktası ölçümü (`cfo_hamle_olcum`, yalnız ekleme), kalibrasyon skoru (isabet/hata/eğilim/kapsam), motor borç kapama önerisi → karar taslağı → karar hafızası 3→4. H6 gate ❌ kalır: ilk otomatik ölçüm 31.10/01.11'de gözlenecek, eski kararlar beklenen SAYI'sız |
| 2026-10-10 | eb5595c | 61 | 5/12 | Değişmedi (bilinçli): CFO-008 kalanı — AI CFO satış dönemleri ve REVENUE_DEVIATION karşılaştırması tek ciro kaynağından (yalnız tam günler; tahmini gün tam sayılmaz). Gelir boyutu tek ciro adımında (0ffbb2c) sayıldı; ilk üretim AI CFO koşusu gözlenince RF-009 RESOLVED + H2 yeniden değerlendirilir |
| 2026-10-10 | c1e8413 | 60 | 5/12 | 61→60: RF-036 (CRITICAL, yeni) — net sermaye sanal stok istisnasını uygulamıyordu (40005100051, 1.025.723 TL; düzeltme migration 130000 bekletilen) → finansal doğruluk 9→8; H1/H12 ❌ kalır. CFO-029 ilk üretim koşusu kuru çalıştırmayla tutarlı (153/440, +26.334 TL KDV dahil) ama net sermayeye gerçek etkisi −65.470 TL (M-BANYOMİX 1.194 adet, %120 elle gümrük → %52,6 yasal); etki toplamı/alarm net sermaye kuralına hizalandı (RF-037). RF-033/034 RESOLVED |
| 2026-10-10 | 6d05a8e | 60 | 5/12 | Değişmedi (bilinçli): RF-038 (HIGH) — CFO çalışma döngüsü 09.10'dan beri bağlam aşamasında 3B001 ile düşüyordu; aynı PR'da düzeltildi (sorgular sıraya alındı, gerçek PostgreSQL regresyon testi). Otomasyon boyutu ilk başarılı üretim döngüsü gözlenince yeniden değerlendirilir |
| 2026-10-10 | e40f257 | 60 | 5/12 | Değişmedi (bilinçli): RF-006 kısmı — motorun kendi Vercel cron'u (03:xx/13:xx UTC) ve çalışma döngüsü cron'u (06:xx UTC); senkron zincirinde motor süre bütçesine sığmıyordu (174–190 sn). Otomasyon boyutu ilk cron koşuları gözlenince ve WhatsApp alarm teslimi yapılandırılınca yeniden değerlendirilir |
| 2026-10-10 | cb66df1 | 60 | 5/12 | Değişmedi (bilinçli): CFO-023 kısım 1 — beş sayfa sabiti motorun kaynağına bağlandı (`/cfo/olu-stok` eşiği `deadStockSalesRatioPct`, `/cfo/kazananlar` kapsam eşiği motorun `minCostCoveragePct`'i, `/admin/yeni-urunler` marjı güncel kur, `/cfo/sermaye` + `/cfo/calisan` hedefi `monthlyRevenueTargetUsd`) + statik eşlik testi `cfo-page-parity`; değer eşliği CFO-001/002/008 üretim doğrulamalarıyla tamamlanınca tutarlılık yeniden değerlendirilir |
| 2026-10-10 | 19e4e78 | 60 | 5/12 | Değişmedi (bilinçli): RF-020 MITIGATED — ödenmemiş gümrük/navlun (3,79M) borç ve net sermaye sözleşmesinde yalnız bilgi satırı (üretimde doğrulandı); CFO-018 kısım 1: gümrük rezervi ödeme takviminin dilimlerinden (elle tek tarih 09.10 yerine 14.10/21.10/10.11). Veri farkları (ROMANYA-2408 500k↔400k, `cfo_import_project` 24.08'den bayat) insanda |
| 2026-10-10 | 7093c47 | 60 | 5/12 | Değişmedi (bilinçli): Durum kaydı mutabakatı — RED-FLAGS açık özet satırı eski CRITICAL 1 · HIGH 4'tü, Durum kaydından yeniden sayıldı (CRITICAL 2 · HIGH 5) ve drift testine bağlandı. Otomasyon boyutu bilerek yükseltilmedi: bağımsız cron'dan henüz koşu yok (ilk 13:xx UTC); RF-036 sanal stok net sermayede duruyor (migration 130000 açık onay bekliyor) |
| 2026-10-10 | 459edd9 | 61 | 5/12 | 60→61: RF-036 RESOLVED — migration 130000 üretimde (Alperen açık onayı "Evet, uygula"; checksum 32b55afe…): sanal stok 40005100051 net sermayeden çıktı, stok 3.336.031 → 2.318.391, net sermaye 2.401.170,03 → 1.383.530,52 TL, kimlik farkı 0 → finansal doğruluk 8→9. Otomasyon boyutu bilerek aynı (cron koşusu henüz yok) |
