# BANK DATA FORENSICS (salt-okunur; 2026-10-05)

Ham `cfo_banka_hareket` (3.402 satır) ve `cfo_bank_account` **değiştirilmedi**. Aşağıdakiler üretimde çalıştırılan SELECT sorgularının sonuçlarıdır.

## 1. Provenance (hepsi `import_id IS NULL`)
Hiçbir satır `cfo_statement_import`'a bağlı değil; kaynak yalnız `kaynak_dosya` adından anlaşılıyor.
| Hesap | Dosya (id aralığı) | Tarih | Satır |
|---|---|---|---|
| Enpara | `Enpara_29092026.xls` (1-52) · `Enpara ekranı 29.09` (66-67, ekran) · `Enpara Şirketim hesap hareketleri.xls` (69-1592, **tam geçmiş**) | 2024-10-04 → 2026-10-02 | 52 + 2 + 1.524 |
| Ziraat TL | `Ziraat_Hesap_Hareketleri_29092026.pdf` (53-65, hesap=`96172849-5001`) · `Ziraat ekranı` (68) · `Hesap_Hareketleri_4102026.xlsx` (1593-2657, hesap NULL) | 2025-10-06 → 2026-10-04 | 13 + 1 + 1.065 |
| Ziraat USD | aynı xlsx (2658-2664) | 2026-06-29 → 09-15 | 7 |
| YKB | `Hesap_Hareketleri_ALPEREN_AYDIN_202610…` (2665-2792) | 2026-05-25 → 10-01 | 128 |
| Garanti | `Belge-2026-10-04…xls` (2793-3402) | 2024-10-08 → 2026-10-01 | 610 |

## 2. Tekrarlar (aynı hareketin farklı import'ları)
- 29.09'da yüklenen erken satırların (id ≤ 68: 54 Enpara + 14 Ziraat) **%100'ünün** (68/68) 04.10 tam-geçmiş import'unda tarih+tutar+**koşan bakiye** eşi var → aynı banka hareketi, **farklı kaynak biçimi** (xls/pdf/ekran). `satir_hash` eşleşmiyor (0/68) çünkü hash dosya biçimine bağlı → mevcut mükerrer koruması bu durumu yakalamıyor.
- Aynı hash'li çift yok (0); `ref_no` yalnız Garanti'de dolu ve 73 ref tekrarı var (bölünmüş satırlar; tekrar sayılmamalı).
- ⚠ Dosya içinde (id > 68) aynı (hesap, tarih, tutar, bakiye) 16 grupta tekrar ediyor — bunlar **gerçek ayrı hareketler**: geçiş hesabı bakiyesi her seferinde aynı değere (0, 70.000, 100.000) dönüyor (ör. Ziraat 2026-02-21: −100.000/+100.000 iki kez, farklı açıklamalarla). Bu yüzden tekil anahtar `(hesap, tarih, tutar, bakiye, aynı-anahtar-içi sıra)` olmalı; yalnız ilk dört alan tekilleştirirse **gerçek hareket silinir**.

## 3. Hesap / alt hesap kimliği
- Ziraat `hesap=NULL` (xlsx) ile `96172849-5001` (PDF) **aynı hesap**: erken PDF satırlarının hepsi xlsx'te aynı koşan bakiyeyle bulundu; xlsx içinde 1.064/1.064 bakiye sürekliliği. Açıklamalarda `96172849-5001` 179 kez (kendi hesabına virman), `…-1002` 10, `…-1009` 25 kez (kredi hesapları, **karşı taraf**; ayrı bakiye serisi değil). Deterministik kimlik: **Ziraat = 96172849-5001 (TL vadesiz)**.
- Enpara: `cfo_bank_account` notunda IBAN `…0095 1854 50` (hesap 95185450); Garanti `286-6293619`; YKB `36457550` (not: dosya adı "ALPEREN AYDIN" — şirket/şahsi ayrımı dosyadan doğrulanamıyor).
- Ziraat USD: `bakiye_try` kolonunda **USD** değeri (8,65) var, TL değil.

## 4. Bakiye sürekliliği (dosyalar yeni→eski sıralı; kural: `bakiye[i] = bakiye[i+1] + tutar[i]`)
| Dosya | Çift | Tutan | |
|---|---|---|---|
| Enpara tam geçmiş | 1.523 | 1.523 | ✅ %100 |
| Garanti | 609 | 609 | ✅ %100 |
| Ziraat TL xlsx | 1.064 | 1.064 | ✅ %100 |
| Ziraat PDF / Enpara 29.09 / Ziraat USD | 12 / 51 / 6 | tamamı | ✅ |
| **Yapı Kredi** | 127 | **68** | ❌ 59 kopukluk, mutlak boşluk ₺3,75 M (net ₺2,0 M eksik giriş) — export eksik/parçalı; 2026-06-01 → 10-01 |
Aynı gün içinde satırlar **yeni→eski** sıralı: günün kapanış bakiyesi = o günün **en düşük id**'li satırı (en yüksek id = gün başı).

## 5. ₺232.637 ↔ ₺72.484 tam mutabakat
Önceki tutar (232.637,52) üç **metodoloji hatasının** toplamıydı (veri hatası değil):
| Kalem | Yanlış | Doğru | Fark |
|---|---|---|---|
| Garanti | 57.000,56 (gün başı satırı, en yüksek id) | **850,56** (gün kapanışı) | −56.150,00 |
| YKB | 81.005,98 (gün başı) | **1.005,98** | −80.000,00 |
| Ziraat 5001 (29.09 PDF/ekran) | 35.126,62 | aynı hesabın mükerrer serisi → **0** | −35.126,62 |
| Ziraat TL (as-of 10-03 yerine 10-01 sabit) | 29.309,99 | 36.409,42 (10-03 kapanış) | +7.099,43 |
| Ziraat USD | 8,65 (USD, TL gibi toplandı) | 419,53 TL (8,65×48,50) | +410,88 |
**Toplam: 232.637,52 → 68.871,21** (ekstreli hesaplar, 10-03). Snapshot nakdi `cfo_servet_kalem`'den = **Σ `cfo_bank_account.balanceTry`** (manuel/ekran bakiyeleri) ve ekstresi olmayan hesapları (YKB TL-2 8,70 · Fibabanka 246,40 · YKB USD 1.224,63 = 1.479,73) içerir → 70.350,94; kalan **2.132,68** farkı `cfo_bank_account` değerlerinin 03.10 05:11'deki hâlini bilmediğimiz için kapatılamıyor (tablo yerinde güncelleniyor, geçmişi yok).
**Bugünkü (10-04) durumda mutabakat kuruşu kuruşuna kapanıyor:** ekstre kapanışları Enpara 30.185,72 + Garanti 850,56 + YKB 1.005,98 + Ziraat 37.584,92 + Ziraat USD 419,53 + ekstresiz 1.479,73 = **71.526,44**; `cfo_bank_account` toplamı **71.509,68**; fark **16,76** = YKB ekstre sonrası hareket (ekstre 10-01'de bitiyor, bakiye 10-04 16:11'de güncellendi). Enpara, Garanti, Ziraat TL ekstre kapanışı = `cfo_bank_account` (fark 0,00).

## 6. Önerilen kanonik banka katmanı (tasarım — uygulanmadı, ham dokunulmaz)
1. `fm_bank_account(account_key, banka, hesap_no, para_birimi, şirket/şahsi, cfo_bank_account_id)` — Ziraat=`96172849-5001`; kimlik dosya adından değil açıklama/IBAN'dan.
2. `fm_bank_txn_canonical` (view): `row_number()` ile `(account_key, tarih, tutar_try, bakiye_try, sıra)` anahtarı; erken/ekran/PDF import'ları yerine **tam-geçmiş import tercih edilir** (kaynak önceliği: en yeni tam export > PDF > ekran); ham satır silinmez, `DEDUP_DROPPED` olarak etiketlenir (68 satır, net −23.286,59 TL).
3. `fm_bank_balance_eod`: günün **kapanış** bakiyesi = dosya sırasına göre son hareket (yeni→eski dosyada en düşük id); sıra yönü süreklilik testiyle (%100) otomatik doğrulanır.
4. `fm_bank_continuity`: dosya/hesap başına süreklilik skoru + kapanış↔`cfo_bank_account` farkı.
5. **Hafızaya kabul kuralı** (cash_try): hesap serisi yalnız (a) süreklilik %100 ve (b) kapanış=`cfo_bank_account` ise girer; döviz hesapları TCMB kuruyla (`fm_fx_monthly`) çevrilir; hesap seti eksikse metrik `cash_try` değil `bank_verified_balance_try` + `account_set_incomplete` bayrağıyla yazılır.

## 7. Karar: nakit geçmişi hâlâ BLOKE
Kabul edilebilir seriler: Enpara (2024-10-04→), Garanti (2024-10-08→), Ziraat TL (2025-10-06→). **Kabul edilemez:** YKB (59 kopukluk). **Ekstresi hiç yok:** YKB TL-2, YKB USD, Fibabanka (şirket) — toplam nakdin ~%2'si. Şirket-geneli `cash_try` serisi için gerekli: (1) YKB'nin eksiksiz yeniden export'u, (2) üç hesabın ekstresi, (3) `cfo_bank_account` değişiklik geçmişi. Bunlar olmadan Financial Memory'ye nakit geçmişi **girmedi**.
