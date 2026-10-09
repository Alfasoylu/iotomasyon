---
last_updated: 2026-10-09 09:50 TR
current_main_commit: 90af323
current_phase: "Faz 0 — İlk tam sistem denetimi"
current_score: 52/100 (hard gate 12/12 gerekiyor; bugün 5/12)
next_action: "CFO-014 (UNKNOWN→0 süpürmesi) / CFO-016; RF-029 veri düzeltmesi Cowork'te; D-P01…D-P07 kararları"
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

## Puan — 2026-10-08 (başlangıç)

| # | Boyut | Ağırlık | Puan | Kanıt (artı) | Kanıt (eksi) |
|---|---|---|---|---|---|
| 1 | Financial accuracy & reconciliation | 20 | **8** | Kanonik satış + aylık mutabakat (`fm_sales_reconciliation_monthly`); maliyet kapsamı tek tanım + kova toplamı = ciro testi; projeksiyon eşlik testi (downside parity); mükerrer anahtar düzeltildi | Net sermaye ve borç tek tanım kodda (CFO-001 PR-D / CFO-002, migration 170000/180000 Cowork bekliyor); kur 4, ciro 7, marj 5 tanım; KDV esası belirsiz; latent `remainingOverride`; atıf kimliği bozuk |
| 2 | Cash / liquidity / debt | 15 | **10** | Ödeme alarmı tek kaynak (takvim) + defter↔takvim boşluk ve mükerrer taksit alarmı (CFO-010); 120 gün projeksiyon, tek tahsilat mekanizması, kademeli faiz, kapasite alarmı, CASH_CRITICAL faizli tetik, ödeme takvimi | 4 nakit/4 kapasite tanımı; düz %4,5 beş yerde; borç hedefi eski; takvimde mükerrer taksit (RF-029, veri); 8 limitin oranı ölçülmemiş |
| 3 | Capital allocation | 15 | **7** | Eşik getiri (en pahalı kapatılabilir borç), SKU sınıfları, tasfiye başabaş, marjinal tahsis, stres açığı önceliği | KDV dahil NRV tabanı; kapsam %87,5; aynı sayfada eski `buildAllocation` düz oranla; öneriler kararlara bağlanmıyor |
| 4 | Revenue / profitability | 10 | **5** | KDV hariç ciro üretimde ölçülüyor (not B, türetme kaynağı bayrakta); hedef hızı yalnız tam kaynaklı günlerden; ölçülmüş komisyon medyanı, kargo bant tarifesi, katkı marjı, gelir kaldıraçları | Marj kuralları susuyor (kapsam); marj henüz KDV hariç değil (D-P06); 7 ciro formülü; iade marja bağlı değil |
| 5 | Inventory / procurement | 10 | **5** | XML stok hafızası + hız, stockout, ölü stok, ithalat önerisi, yoldaki kapsam | 4 ölü stok kuralı; 2 yoldaki mal kaynağı; 3 stok değerleme yöntemi |
| 6 | Decision memory & calibration | 10 | **3** | `cfo_hamle` + beklenen/gerçekleşen ekranı; goal attribution | 3/15 karar ölçülebilir; ölçüm tablosu hiç yazılmıyor; atıf kimliği bozuk |
| 7 | Data quality / provenance | 7 | **4** | Motorda evidence + measured bayrağı, UNKNOWN disiplini, bayatlık kapısı (önemlilik eşikli), source_dead alarmları, şema parmak izi | Eski motor/yan modüllerde UNKNOWN→0; tahminler measured=true; elle defterler; 66 açık soru, karışık durum sözlüğü |
| 8 | Automation / observability | 5 | **4** | 2 güvenilir Vercel cron + 3×/gün GitHub; slot anahtarı/idempotency; `cfo_gun_ozeti` | Alarm teslimi GitHub e-postası; SAĞLIK alarmı (takılan/başarısız/bayat motor) kodda, üretimde migration 150000 bekliyor; yetim `cfo-cycle` |
| 9 | Cost efficiency | 4 | **4** | Runtime LLM yok; deterministik; Vercel Hobby | — |
| 10 | Security / operational safety | 4 | **2** | RLS + REVOKE kalıpları, salt-okunur okuyucu rol, CRON_SECRET sabit-zamanlı, yazma eylemlerinde CFO_WRITE | Okuma izniyle yazma yolları, yetkisiz action, düz metin API anahtarları, Cowork ayrıcalıklı yazma rolü |
| | **TOPLAM** | **100** | **52** | | |

## Skor geçmişi

| Tarih | Commit | Skor | Gate | Not |
|---|---|---|---|---|
| 2026-10-08 | 422a6db | 48 | 5/12 | İlk tam denetim (başlangıç çizgisi) |
| 2026-10-08 | CFO-001 PR-A | 48 | 5/12 | Ölçüm + karar memosu; tanım değişmedi → puan değişmedi (mutabakat görünür ama tek tanım yok). Yeni RF-025 (HIGH), RF-026, RF-027 |
| 2026-10-09 | CFO-004 + CFO-005 | 49 | 5/12 | Düz KMH oranı TS katmanında kalktı (borclar satır=toplam, hayali KMH tasarrufu yok); kredi override hatası düzeltildi (üretimde migration bekliyor) |
| 2026-10-09 | CFO-005b + CFO-009 | 50 | 5/12 | Takılan koşu / kilit hatası görünür, başarısız dilim yeniden denenir (8. boyut 3→4); kart erteleme kart faiziyle (üretimde migration bekliyor) |
| 2026-10-09 | Üretim senkronu (200000 + 100000) | 50 | 5/12 | Kredi borcu üretimde kalan anapara (RF-005 RESOLVED; H12 hâlâ RF-001…004 nedeniyle ❌). Puan artışı yok: 1. boyut tek tanım eksikliğiyle sınırlı |
| 2026-10-09 | CFO-010 kısım 2 | 51 | 5/12 | Ödeme durumu tek kaynak (takvim), çift alarm yok, boşluk + mükerrer taksit görünür (2. boyut 9→10). Projeksiyon 99.832 TL fazla çıkış içeriyor (RF-029, veri) |
| 2026-10-09 | Üretim senkronu (110000/120000/130000) | 52 | 5/12 | KDV hariç ciro + hedef kaynak tazeliği üretimde (4. boyut 4→5); RF-004, RF-025 RESOLVED; H12 hâlâ ❌ (RF-001…003) |
