---
last_updated: 2026-10-09 02:50 TR
current_main_commit: ac761e1
current_phase: "Faz 1 — Metrik sözleşmesi (D-P01…03 kararlandı)"
current_score: 51/100
next_action: "KDV hariç ciro (migration 20261009120000, Cowork) → sabit kurun 433 maliyetli üründe etkisi → CFO-001 PR-D / CFO-002; bekleyen D-P04…D-P07"
---

# CFO DECISION LOG

İki tür kayıt: (1) **sistem tasarım kararları** (kim, ne, neden, alternatif, geri alma), (2) **bekleyen kararlar** (karar sahibi, seçenekler,
etki). Finansal iş kararları (hamleler) `cfo_hamle` tablosunda tutulur; buraya yalnız sistemin nasıl ölçtüğünü/çalıştığını değiştiren
kararlar yazılır. Append-only; değişen karar yeni satırla "supersedes" gösterir.

## Bekleyen kararlar (karar sahibi: Alperen; Cowork önerir/itiraz eder; Code seçeneklerin TL etkisini ölçer)

| ID | Soru | Seçenekler | Etki (üretim 08.10) | Bağlı backlog |
|---|---|---|---|---|
| D-P01 | Net sermaye hedefi (G2) hangi tanımla ölçülür? | (a) DAR: nakit + alacak + rafta stok − borç (yoldaki mal hariç) · (b) GENİŞ: + yoldaki malın ödenmiş kısmı | (a) 2,56M TL ≈ 52,7k USD · (b) 6,27M TL ≈ 127,9k USD | CFO-001 |
| D-P02 | Stok net sermayeye hangi değerle girer? | (a) maliyet · (b) KDV hariç net gerçekleşebilir değer · (c) KDV dahil NRV (bugünkü servet) | maliyet 4,32M · NRV(KDV dahil) 7,24M · (b) ölçülecek | CFO-001, CFO-007 |
| D-P03 | Borç hedefi (G3) kapsamı | kredi (kalan / erken kapama) · kart (toplam / devreden) · kullanılan KMH · yoldaki malın ödenmemiş vergi/navlunu · şahsi kart/KMH | bugünkü sistem 9,28M (KMH hariç, yoldaki dahil); yoldaki hariç ≈ 5,50M | CFO-002 |
| D-P04 | Stratejik kur | (a) TCMB aylık döviz alış (Goal Engine, önceki ay) · (b) ay başı ölçüm `cfo_kur` · (c) günlük | 48,56 · 48,98 · ~49,2 | CFO-003 |
| D-P05 | Ciro hedefi (G1) KDV ve kanal kapsamı | KDV dahil / hariç · Alfashome dahil mi · IDEASOFT / eski tekstil dahil mi | KDV dahil ≈ 33,7k USD/ay tahmini · hariç ≈ 28k | CFO-008 |
| D-P06 | `Product.unitCostTry` KDV dahil mi hariç mi? | dahil / hariç | marj ve NRV esası buna bağlı | CFO-007 |
| D-P07 | Alarm teslim kanalı | e-posta · WhatsApp (mevcut altyapı) · ikisi | — | CFO-009 |

CFO önerileri (2026-10-08, PR-A; Alperen onaylayana kadar öneri):
D-P01 → GENİŞ (yoldaki ödenmiş mal dahil) · D-P02 → LCNRV (maliyet ile KDV hariç NRV'nin düşüğü) · D-P03 → finansal borç (kredi kalan + kart toplam
+ kullanılan KMH; yoldaki vergi/navlun ayrı taahhüt) · D-P04 → TCMB döviz alış (ayın 15'i), yoksa önceki ay işaretli, yoksa UNKNOWN ·
D-P05 → KDV hariç, iade düşülmüş, tüm kanallar (Alfashome dahil, eski tekstil hariç) — veri hazır olana kadar KDV dahil etiketli · D-P06 → teyit gerekli.

## Alınan tanım kararları (Alperen, Cowork aracılığıyla, 2026-10-09)

| ID | Karar | Sayı (üretim 08.10) | Gerekçe (karar sahibinin) | Uygulama |
|---|---|---|---|---|
| D-P01 | Net sermaye = **GENİŞ** tanım (yoldaki malın ödenmiş kısmı dahil) | — | — | CFO-001 PR-D |
| D-P02 | Stok = **maliyet ile KDV hariç NRV'nin düşüğü (LCNRV)** | net sermaye **2.973.814 TL ≈ 61,2k USD** | "Stoku satış fiyatıyla değerlemek yanlıştı" | CFO-001 PR-D |
| D-P03 | Borç = **krediler + kartlar + kullanılan KMH** (finansal borç). Yoldaki malın gümrüğü defterde iki taraflı (varlık + borç, net 0) kalır | ≈ 5,89M TL ≈ 121,3k USD (PR-A ölçümü; yeniden ölçülecek) | "doğru muhasebe o" | CFO-002 |
| D-P04 | Stratejik kur = **TCMB döviz alış, ayın 15'i bülteni**; o ayın kuru yoksa önceki ay (işaretli, kalite B); hiç yoksa BİLİNMİYOR. Hedef ölçen tüm USD dönüşümleri bunu kullanır; `cfo_kur` / `cfo_settings.usdTryRate` yalnız operasyonel (ithalat/maliyet) | Eylül 48,5585 (Ekim bülteni 15.10'da) | Alperen onayı 2026-10-09 ("Onaylıyorum") | CFO-003 |
| — | **Öncelik sırası:** önce KDV hariç ciro (RF-025), sonra sabit kurun 433 maliyetli üründeki etkisi ("marjın tabanı orada") | — | Cowork: maliyet doğrulamasında karşılaştırılabilen 8 üründen 4'ünde bulgu doğrulandı; kalan 433 maliyetli üründe yaygınlık bağımsız kaynakla ölçülemedi | CFO-025 (yeni) |

| D-P08 | **"Akbank Alp" ŞAHSİ; "Garanti Alp" banka hesabı GERÇEKTE YOK → pasif** (Alperen 2026-10-09, Garanti ekranları: 286-6293619 Alfa Soylu Ltd. KMH 500.000 = "Garanti"; 286-6673313 Alperen şahsi KMH 150.000 = "Garanti Alperen (şahsi)"). Şahsi bakiye takip edilmez | şirket genel KMH 1.809.300 → 1.359.300; şahsi KMH 1.100.000 → 1.350.000; "her şey dahil" açık −52.145 → −252.145 | veri düzeltmesi Cowork: `docs/cowork/2026-10-09-d-p08-akbank-alp-sahsi.sql` | CFO-006 |

Hâlâ bekleyen: D-P05 (ciro hedefi KDV/kanal kapsamı), D-P06 (`unitCostTry` KDV esası), D-P07 (alarm kanalı).

## Sistem tasarım kararları (bu oturuma kadar, özet)

| Tarih | Karar | Kim | Gerekçe | Geri alma |
|---|---|---|---|---|
| 2026-10-07 | Sitede LLM yok; deterministik motor + Cowork yorum katmanı | Alperen | maliyet, doğrulanabilirlik | — |
| 2026-10-08 | Production migration'ları Cowork uygular (karar "C"); Code SQL'i aynen + checksum verir | Cowork | erişim/güvenlik ayrımı | — |
| 2026-10-08 | Tek tahsilat mekanizması (`cfo_tahsilat_tahmini`) | Cowork | çift sayım | migration geri alma |
| 2026-10-08 | Maliyet kapsamı tek tanım (`cfo_maliyet_kapsami_at`); motor kendi sayısını hesaplamaz | Cowork | iki sayı çelişkisi | migration geri alma |
| 2026-10-08 | Trendyol senkronu 15:00 TR (motor 16:49 Cowork okumasından önce) | Cowork (A) | okuma tazeliği | vercel.json |
| 2026-10-08 | Banka bayatlık kapısına önemlilik eşiği (10.000 TL) | Cowork | 419 TL'lik hesap ACİL'i susturuyordu | config |
| 2026-10-08 | Mükerrer satır şirket çapında kapı değil; anahtar `externalLineId` içerir | Alperen (A) + Cowork ölçümü | 419 yanlış pozitif → 0 | migration |
| 2026-10-08 | KMH: önce kapasite alarmı → sonra kademeli faiz (ölçülmüş oran, ölçülmemiş UNKNOWN, kapasite üstü faizsiz) → en son kural bağlama | Cowork | küresel %4,50 yanlış | PR #206–#208 |
| 2026-10-08 | CFO geliştirme Markdown üzerinden yönetilir (MASTER-PLAN/BACKLOG/SCORECARD/RED-FLAGS/DECISION-LOG); skor 90+ ve hard gate'ler hedefi | Alperen (protokol) | sürekli, denetlenebilir iyileştirme | — |
| 2026-10-08 | Hedefler güncellendi: ciro ≥100k USD/ay, net sermaye ≥300k USD, **borç <100k USD** (eski: <5M TL) | Alperen | — | `fm_goal` v2 (CFO-002) bekliyor |
| 2026-10-08 | Scorecard ağırlıkları önerilen başlangıç ağırlıklarıyla aynen kabul edildi (değiştirme gerekçesi bulunmadı) | Claude Code | protokol | DECISION-LOG kaydıyla değişir |
| 2026-10-09 | KDV hariç ciro: kaynakta yoksa SKU'nun pazaryeri KDV oranından (2023-07-10 sonrası, baskın ≥ %80), yoksa %20 varsayılanla türetilir; türetme yolu bayrakla (`ex_vat_derived_sku` / `ex_vat_default_rate`); kalite notu U → B | Code (Alperen sırası) | pazaryeri cirosunun %99,7'si %20; Trendyol API'de KDV yok; XML KDV okuyucu rolüne açık değil ve Trendyol ürünlerinde fark yaratmıyor | migration 20261009120000 geri alma |
| 2026-10-09 | Ciro hedefi hızı yalnız tüm satış kaynaklarının tamam olduğu günlerden; gözlenen MTD aynen; eksik gün 0 ya da tahmin sayılmaz | Code | eksik günler hızı %12 düşürüyordu (RF-025) | migration 20261009130000 geri alma |
| 2026-10-09 | Şema parmak izi davranışı karşılaştırır: fonksiyon gövdesi SQL yorumları olmadan, `fm_quality_policy` serbest metin `reason` olmadan | Code | Cowork'ün uygulama yolu yorumları siliyor ve Türkçe karakteri ASCII'ye çeviriyor; yürütülen kod birebir; aksi halde her uygulamada sahte sapma | scripts/schema-baseline/fingerprint.sql + step1-fingerprint.sql eski hali |
| 2026-10-09 | Cowork'ün üretimdeki migration'sız fonksiyon düzeltmeleri aynı gün capture migration ile repo'ya alınır (üretim tanımı aynen) | Code | tek doğru kaynak = repo + üretim parmak izi | — |
| 2026-10-09 | Senkron sonrası motor yalnız fonksiyon süresinden ≥150 sn kaldıysa başlar; 15 dk'dan eski `running` motor koşusu bir sonraki koşuda `failed`/`killed_timeout` kapatılır; `cfo_gun_ozeti` SAĞLIK satırı motor arızasında ACİL | Code (Cowork bulgusu) | 09.10 ölü koşu 4+ saat `running` kaldı, özet bilgi satırında kaldı | migration 20261009150000 geri alma; `ENGINE_MIN_BUDGET_MS` |
| 2026-10-09 | Kart vergi çarpanı ×1,20 (KKDF %15 + BSMV %5); ×1,30 kaldırıldı — TS `CARD_TAX` + `cfo_kart_karari` | Alperen (Cowork itirazı) | BSMV %5; ×1,30 kart maliyetini ~%8 fazla gösteriyordu (devreden 1,98M TL'de 109.627 → 101.194 TL/ay) | migration 20261009160000 geri alma; `CARD_TAX` |
| 2026-10-09 | Nakit tabanı (`netPositionFloorTry`) −3.000.000 TL kalır; ticari kapasite (−1.960.853 TL) taban yapılmaz | Alperen | Cowork: kart kararı açığı kapasiteye göre 1.039.147 TL düşük gösteriyor — bilinçli kabul; kapasite aşımı ayrı alarm (kapasite) ile izlenir | `cfo_settings` |
| 2026-10-09 | Net sermaye sözleşmesi uygulaması: satan ama birim maliyeti olmayan stok LCNRV'ye girmez (BILINMIYOR, üst sınır KDV hariç NRV ayrı satırda); maliyet+satış kanıtı olmayan stok BILINMIYOR (0 değil); nakit = artı bakiyeler, KMH = eksi bakiyeler (çift sayım yok) | Code (D-P02 uygulaması) | LCNRV maliyetsiz hesaplanamaz; ihtiyatlılık; UNKNOWN disiplini | migration 20261009170000 |
| 2026-10-09 | Goal Engine bakiye hedefleri yalnız en yeni tanım sürümünden (net_capital_try v3 = sözleşme); eğilim sürüm karıştırmaz (ilk 14 gün `goal_short_history`) | Code | v2 (DAR) ile v3 aynı seri değil | migration 20261009170000 geri alma |
| 2026-10-09 | Borç hedefi ayardan: `cfo_settings.debtTargetUsd` (100.000 USD); TL eşiği = hedef × TCMB aylık döviz alış (Goal ile aynı kur); sipariş kapısı aynı eşik ve `cfo_metrik_borc()`; hedef/kur yoksa kapı kapalı (sabit eşiğe düşmez) | Code (Alperen hedefi 2026-10-08 + D-P03) | 5M TL sabiti eski hedef; iki yerde ayrı tanım | migration 20261009180000 geri alma |
