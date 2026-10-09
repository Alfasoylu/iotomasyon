# RMB/USD tek kaynak + maliyet Excel'i 335 ürün düzeltmesi (6,8 → 6,7) — 2026-10-10

> **UYGULANDI 2026-10-10 (Alperen: "Maliyet Excel'i için açık kural RMB/USD = 6,7 idi. PR #248 üretimde 6,8 kullanmış ve
> importer-cost.ts içinde 7,2 fallback de bulunuyor ... tek kaynağa bağlanmalı; bilinmeyende hard-coded fallback kullanılmamalı ...
> salt-okunur ölç ... ardından kontrollü düzelt. CFO-029 da aynı tek kur kaynağını kullanmalı.")**
> Uygulama dosyası: `docs/cowork/2026-10-10-rmb-6-7-tek-kaynak-duzeltme.sql`.

## 1. İnceleme — RMB/USD'nin dört ayrı değeri vardı

| Kaynak | Değer | Kim kullanıyordu |
|---|---|---|
| Alperen kuralı (maliyet Excel'i) | **6,7** | `docs/maliyet/2026-10-10-maliyet-excel-eslestirme.md` analizi (matrah = RMB ÷ 6,7). Sistemde kayıtlı değildi |
| `MonthlyExchangeRate` 2026-06 (elle) | 6,8 | `lib/fx/current.ts` (1. sıra) → PR #248'in 335 ürün türetmesi, eksik-20 listesinin 8 ithal ürünü, CFO-029 kuru çalıştırması, ithalatçı görünümü, sermaye sağlığı |
| `cfo_settings.usdRmbRate` | 6,72 | `lib/fx/current.ts` 2. sıra. Arayüzde düzenleme yeri yok |
| Kod sabitleri | 7,2 / 7,0 | `DEFAULT_RMB_USD_RATE` (`lib/importer-cost.ts`): kur yok ya da 0 ise `rmbToUsd` / `calcImportCost` sessizce 7,2 kullanıyordu. `lib/fx/current.ts` varsayılanı da 7,2 idi. Ürün liste/detay sayfalarında 7,0, ithalatçı görünümü istemcisinin ilk değeri 7,2 |

Doğrulama: 335 ürün 6,8 ile yeniden türetildiğinde 334'ü kuruşu kuruşuna tuttu (1'i USD'nin 4. hanesinde yuvarlama). PR #248 6,8 kullanmış.

## 2. Tek kaynak (kod, bu PR)

- **RMB/USD = yalnız `MonthlyExchangeRate`** (RMB'nin arayüzden girildiği tek yer: `/admin/exchange-rates`). RMB'si dolu en yeni ay kullanılır.
  Kayıt yoksa `rmbPerUsd = null` olur ve kaynak "bilinmiyor" görünür. `cfo_settings.usdRmbRate` ve tüm sabit yedekler kaldırıldı.
- `lib/fx/pick.ts`, `lib/fx/current.ts`: RMB zinciri tek adım; `CurrentFx.rmbPerUsd: number | null`.
- `lib/importer-cost.ts`: `DEFAULT_RMB_USD_RATE` silindi. RMB kuru null ya da 0 ise `calcImportCost` ve `rmbToUsd` **null** döner (7,2'ye düşmez).
- Tüketiciler null-güvenli hale getirildi. Kur yoksa "—" ya da "RMB kuru yok" gösterilir, kâr hesaplanmaz:
  - ithalatçı görünümü (API + istemci),
  - ürün listesi ve detayı (7,0 kaldırıldı),
  - `/admin/sermaye`, `/admin/exchange-rates`, sermaye sağlığı, `pricing-engine` tipi.
- **CFO-029** (`lib/cfo/cost-derivation.ts`) aynı `loadCurrentFx` kaynağını kullanır. RMB bilinmiyorsa hiçbir maliyet yazılmaz (`kur_bilinmiyor`).
- Testler:
  - `__tests__/fx-current.test.ts`: RMB yalnız elle girilen kurdan gelir; yoksa null; 6,7 kaydı 6,8'in önüne geçer. Kodda RMB sabit yedeği (`DEFAULT_RMB_USD_RATE`, `rmbPerUsd ?? <sayı>`, `rmbUsdRate: <sayı>`) kalırsa CI kırılır.
  - `__tests__/cfo-cost-derivation.test.ts`: RMB null → yazma yok; motor null/0 kurda null döner.

## 3. Salt-okunur ölçüm (uygulama öncesi, üretim)

335 ürün 6,7 ile `calcImportCost` üzerinden yeniden türetildi. Gümrük % değişmedi. Deniz/hava kararını motor verdi: 2 ürün (24317000, 265443215807) havadan denize geçti.

| | 335 Excel ürünü | Eksik-20 listesinin 8 ithal ürünü (bilgi) |
|---|---:|---:|
| Birim TL değişimi | medyan +%1,4 (en fazla +%1,5; denize geçen 2 üründe −%0,3 / −%11,8) | +%1,2…+%1,5 |
| Stoklu SKU (LCNRV'ye giren) | 78 | 7 |
| Stok maliyeti, KDV dahil (önce → sonra) | 740.014,29 → 749.656,45 | 334.881,51 → 339.151,34 |
| **LCNRV (KDV hariç, NRV tavanlı) farkı** | **+7.405,67 TL** (6 SKU NRV tavanında) | +1.212,44 TL (1 SKU NRV tavanında) |
| En büyük LCNRV etkisi | 240610000 +1.351 · 484039203958 +1.325 · 272726161636 +878 · AL-SOLAR01 +575 · 5410214596365 +461 | 21037294719 +426 · TTLock silver +381 · TTLock siyah +343 |

6,7 ile 1 RMB'nin dolar karşılığı artar (÷6,7 > ÷6,8). Bu yüzden maliyet ~%1,5 yükselir. LCNRV maliyetle değerlendiği için stok değeri ve net sermaye **artar**.

## 4. Uygulama (tek işlem, korumalı)

1. `MonthlyExchangeRate` 2026-10 eklendi: RMB/USD **6,7**, USD/TRY 48,98 (`cfo_kur` 2026-10 ile aynı; USD zinciri zaten önce `cfo_kur` okur).
   Ekim kaydı zaten olsaydı işlem iptal olurdu. Günlüğe yazıldı: `cfo_change_log` area `kural`, kind `karar`.
2. 335 ürünün `unitCostUsd` / `unitCostTry` alanları 6,7 ile türetilen değerlere çekildi. Koruma: ürün yalnız okunan eski USD ve TL değerindeyse yazılır;
   335'in tamamı yazılamasaydı işlemin tamamı iptal olurdu. Yerel PGlite provasında üç durum denendi: başarılı akış, bir ürün arada değişmiş (iptal),
   Ekim kaydı zaten var (iptal). 670 alan + 1 özet + 1 kural satırı yazıldı, source `Alperen (RMB/USD 6,7 kuralı) + Claude Code`.

## 5. Doğrulama (üretim, uygulama sonrası)

- Günlük: 672 satır (670 `duzeltme` + özet + kural). 335 ürünün `unitCostTry` değeri günlükteki yeni değerle birebir aynı.
- `MonthlyExchangeRate` 2026-10: 6,7000 / 48,98.
- `cfo_metrik_net_sermaye()`: stok LCNRV **3.408.001,80 → 3.415.407,47**, **NET SERMAYE 2.473.141,04 → 2.480.546,71 TL (+7.405,67)**.
  Salt-okunur ölçümle kuruşuna kadar aynı.
- CFO-029 tek kaynakla yeniden türetme (salt-okunur): 335 ürünün **hiçbiri değişmez**. Gece koşusu bu düzeltmeyi geri almaz.

## 6. Kalan (CFO-029 ilk koşusu, aynı tek kaynak)

- Eksik-20 listesinin 8 ithal ürünü 6,8 ile yazılmıştı. İlk CFO-029 koşusu bunları 6,7'ye çeker (stok maliyeti +4.269,83 TL KDV dahil, LCNRV ≈ +1.212 TL).
- Excel dışı 141 ürün GTİP gümrüğü ve 6,7 ile türetilir (+21.731,61 TL KDV dahil). Ayrıntı: `docs/maliyet/2026-10-10-cfo-029-otomatik-maliyet.md`.
- `cfo_settings.usdRmbRate` (6,72) şemada kalır ama okunmaz. Sütunun kaldırılması ayrı bir DDL işi.
