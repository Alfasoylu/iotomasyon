---
last_updated: 2026-10-08 23:45 TR
current_main_commit: 422a6db
current_phase: "Faz 0 — İlk tam sistem denetimi"
current_score: 48/100
next_action: "Bekleyen tanım kararları D-P01…D-P06 — CFO önerileri ve TL etkileri: docs/CFO-METRIC-CONTRACT.md"
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
