# CFO-029 — CFO birim maliyeti ithalat motorundan otomatik türetme (2026-10-10)

> Kod + test hazır (bu PR). Üretimde ilk koşu: merge + deploy sonrası **ilk XML senkronu** (Vercel cron 02:00 UTC = 05:00 TR),
> TCMB kur adımından hemen sonra (`app/api/cron/xml-sync` → `after(safeEnsureTcmbFx → safeDeriveUnitCosts)`).
> Aşağıdaki "kuru çalıştırma" üretim verisiyle (salt-okunur) yerelde aynı kodla hesaplandı. Gerçekleşen, sabahki kontrolde
> bununla karşılaştırılır. Aradaki Trendyol fiyat değişimleri deniz/hava seçimini değiştirebilir; küçük fark beklenir.

## Kural (kod: `lib/cfo/cost-derivation.ts`, `lib/cfo/cost-derivation-data.ts`)

| Sınıf | Koşul | Türetme |
|---|---|---|
| İTHAL | `sourceCostRmb` > 0, `weightKg` > 0, `IC_PIYASA` değil | gümrük % = `cfo_gtip_tarife` en uzun önek yükü (GV+İGV, ÖTV, KDV dahil; 1 hane); tarife yoksa kayıtlı %; ikisi de yoksa **atla**. `unitCostUsd` = `calcImportCost` (deniz/hava: tercih → yoksa yıllık ROI → yoksa ≥5 kg deniz), `unitCostTry` = round(toplam USD × USD/TRY, 2) |
| YURTİÇİ | `shippingMethodPref` = `IC_PIYASA`, `unitCostUsd` > 0 | `unitCostTry` = round(USD × USD/TRY, 2) |
| — | kur kaynağı "varsayılan" | hiçbir şey yazılmaz, günlüğe `arastirma` satırı |

- Kur: `lib/fx/current.ts` (USD/TRY `cfo_kur` → ayar → elle; RMB/USD elle girilen aylık kur). Önbelleksiz `loadCurrentFx`.
- Motor düzeltmesi: `resolveShipping` Türkçe tercihi tanır. `deniz`/`DENIZ`/`DENİZ` deniz, `hava` hava sayılır (üretimde 29 ürün). Önceden ROI'ye düşüyordu; bir üründe tercihe rağmen hava seçiliyordu.
- Yazma: tek SQL ifadesi (`APPLY_COST_SQL`). Ürün yalnız okunan eski gümrük %/USD/TL değerlerindeyse güncellenir. Her alan
  `cfo_change_log`'a yazılır (area `maliyet`, kind `duzeltme`, source `CFO-029 maliyet türetme`). Koşu başına bir özet satırı (kind `analiz`) eklenir.
  Değişiklik yoksa hiçbir şey yazılmaz.
- Alarm `cost_jump` (`lib/cfo-agent/health.ts`): son 26 saatte otomatik türetme şu durumlardan birini yarattıysa çıkar:
  - stoklu (1–999) bir üründe birim TL maliyet ≥ %25 değiştiyse;
  - değerlenen stok maliyeti toplamı ±50.000 TL'den fazla oynadıysa.

  Anahtar gün bazlıdır; bildirim (e-posta/WhatsApp) yalnız yeni alarmda gider.

## Kuru çalıştırma (üretim verisi, 2026-10-10 ~02:15 TR; USD/TRY 48,98 `cfo_kur 2026-10`, RMB/USD 6,8 elle 2026-06)

- 493 aday: 347 değişmez, **143 ürün değişir** (hepsi ithal), 3 atlanır (gümrük bilinmiyor: `508990000` FT232RL, `COPYAL-CAM04`,
  `PERPA23658000111SIYAH`).
- 422 alan değişir: gümrük % 138 · USD 142 · TL 142. Yönü: 120 ürünün maliyeti düşer, 23'ünün artar.
- Bu ürünler 2026-10-10 Excel'inde yoktu. Maliyetleri elle/eski varsayımla girilmişti; 112'sinde gümrük % boştu (motor %30 varsayıyordu),
  29'unda elle girilen oran (%30/%40/%120) GTİP tarifesinden farklıydı.
- Değerlenen stok maliyeti farkı (KDV dahil, stok × ΔTL): **+15.417,48 TL** (stoklu 32 ürün). LCNRV'ye etkisi ÷ 1,2 ve NRV tavanıyla daha az.
- En büyük etkiler:

| SKU | Stok | TL (önce → sonra) | Değişim | Gümrük % | Stok etkisi |
|---|---:|---:|---:|---|---:|
| AL-PTZ04 | 68 | 3.390,83 → 3.920,29 | +15,6% | 40 → 51,1 (8525.89, ÖTV dahil) | +36.003 |
| TE-UV82TELSIZ | 33 | 972,91 → 685,40 | −29,6% | 40 → 44,0 | −9.488 |
| ANUNNAKI-POINTER | 166 | 292,21 → 278,35 | −4,7% | boş → 48,4 | −2.301 |
| 490345764 | 257 | 24,06 → 19,32 | −19,7% | boş → 25,6 | −1.218 |
| GRI-60W-TYPE-C-SARJ-KABLOSU | 512 | 27,16 → 24,96 | −8,1% | boş → 42,0 | −1.126 |

- `cost_jump` ilk koşudan sonra çıkar (TE-UV82TELSIZ %−29,6, stok 33). Bu beklenen tek seferlik bildirimdir.
