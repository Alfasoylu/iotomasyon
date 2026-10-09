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
| — | RMB/USD bilinmiyor (`MonthlyExchangeRate`'te RMB yok) ya da USD/TRY "varsayılan" | hiçbir şey yazılmaz, günlüğe `arastirma` satırı |

- Kur: `lib/fx/current.ts` önbelleksiz `loadCurrentFx`. USD/TRY sırası `cfo_kur` → ayar → elle. RMB/USD **tek kaynak** elle girilen aylık kur (`MonthlyExchangeRate`); sabit yedek yok, kayıt yoksa yazma yok.
- Motor düzeltmesi: `resolveShipping` Türkçe tercihi tanır. `deniz`/`DENIZ`/`DENİZ` deniz, `hava` hava sayılır (üretimde 29 ürün). Önceden ROI'ye düşüyordu; bir üründe tercihe rağmen hava seçiliyordu.
- Yazma: tek SQL ifadesi (`APPLY_COST_SQL`). Ürün yalnız okunan eski gümrük %/USD/TL değerlerindeyse güncellenir. Her alan
  `cfo_change_log`'a yazılır (area `maliyet`, kind `duzeltme`, source `CFO-029 maliyet türetme`). Koşu başına bir özet satırı (kind `analiz`) eklenir.
  Değişiklik yoksa hiçbir şey yazılmaz.
- Alarm `cost_jump` (`lib/cfo-agent/health.ts`): son 26 saatte otomatik türetme şu durumlardan birini yarattıysa çıkar:
  - stoklu (1–999) bir üründe birim TL maliyet ≥ %25 değiştiyse;
  - değerlenen stok maliyeti toplamı ±50.000 TL'den fazla oynadıysa.

  Anahtar gün bazlıdır; bildirim (e-posta/WhatsApp) yalnız yeni alarmda gider.

## Kuru çalıştırma — RMB/USD tek kaynak 6,7 ile (üretim verisi, 2026-10-10 ~02:55 TR; USD/TRY 48,98 `cfo_kur 2026-10`, RMB/USD 6,7 `MonthlyExchangeRate` 2026-10)

> İlk kuru çalıştırma (~02:15 TR) 6,8 (elle 2026-06) ile yapılmıştı: 143 ürün / 422 alan, +15.417 TL. Alperen'in RMB/USD 6,7 kuralı ve tek kaynak
> düzeltmesinden sonra yeniden hesaplandı (`docs/maliyet/2026-10-10-rmb-6-7-tek-kaynak.md`). Maliyet Excel'inin 335 ürünü 6,7'ye elle düzeltildi;
> CFO-029 onlara dokunmaz (0 değişiklik).

- 493 aday: 341 değişmez, **149 ürün değişir** (hepsi ithal), 3 atlanır (gümrük bilinmiyor: `508990000` FT232RL, `COPYAL-CAM04`,
  `PERPA23658000111SIYAH`).
- 436 alan değişir. Gruplar:
  - eksik-20 listesinin 8 ithal ürünü: 6,8 → 6,7, stok maliyeti +4.269,83 TL;
  - Excel dışı 141 ürün: gümrük % GTİP'e, maliyet motora; 112'sinde gümrük boştu, 29'unda elle girilen oran farklıydı; stok maliyeti +21.731,61 TL.
- Değerlenen stok maliyeti farkı (KDV dahil, stok × ΔTL): **+26.001,44 TL**. LCNRV'ye etkisi ÷ 1,2 ve NRV tavanıyla daha az.
- En büyük etkiler:

| SKU | Stok | TL (önce → sonra) | Değişim | Gümrük % | Stok etkisi |
|---|---:|---:|---:|---|---:|
| AL-PTZ04 | 68 | 3.390,83 → 3.977,14 | +17,3% | 40 → 51,1 (8525.89, ÖTV dahil) | +39.869 |
| TE-UV82TELSIZ | 33 | 972,91 → 695,00 | −28,6% | 40 → 44,0 | −9.171 |
| 4140404044444 | 66 | 3.449,02 → 3.491,67 | +1,2% | 51,1 (6,8 → 6,7) | +2.815 |
| ANUNNAKI-POINTER | 166 | 292,21 → 282,17 | −3,4% | boş → 48,4 | −1.667 |
| 490345764 | 257 | 24,06 → 19,59 | −18,6% | boş → 25,6 | −1.149 |
| GRI-60W-TYPE-C-SARJ-KABLOSU | 512 | 27,16 → 25,28 | −6,9% | boş → 42,0 | −963 |

- `cost_jump` ilk koşudan sonra çıkar (TE-UV82TELSIZ −%28,6, stok 33). Bu beklenen tek seferlik bildirimdir.
