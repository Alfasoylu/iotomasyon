-- D-P08 (Alperen, 2026-10-09; Garanti ekranları 12:34-12:35):
--   1) "Akbank Alp" hesabı ŞAHSİ.
--   2) "Garanti Alp" banka hesabı GERÇEKTE YOK → pasif. Garanti'de yalnız 286-6293619 (Alfa Soylu Ltd., KMH 500.000 = kayıttaki
--      "Garanti", birebir) ve 286-6673313 (Alperen Aydın, şahsi, KMH 150.000 = kayıttaki "Garanti Alperen (şahsi)") var.
--      Şahsi bakiye takip edilmez (Alperen). "Garanti Alp" adlı KART kaydı ve takvimdeki kart ödemeleri ayrı — dokunulmaz.
-- Etki (salt-okuma ölçümü 09.10): şirket boş genel KMH 1.809.300 → 1.359.300 (−250.000 Akbank Alp, −200.000 Garanti Alp);
-- genel ticari kaynak 1.960.853 → 1.510.853; şahsi KMH (son çare) 1.100.000 → 1.350.000; "her şey dahil" açık −52.145 → −252.145.
-- Hesap türü metni ELLE YAZILMAZ: cfo_nakit_kapisi / cfo_kaynak_yeterliligi / cfo_onucus_temel tam "ŞAHSİ" yazımını arar (ILIKE);
-- ASCII'ye çevrilirse ("SAHSI") hesap şirket sayılmaya devam eder. Değer, zaten şahsi olan "Garanti Alperen (şahsi)" satırından kopyalanır.
-- İki satır değişir; koşullar yanlış satıra dokunmayı engeller; tekrar çalıştırmak etkisiz. Geri alma: Akbank Alp "accountType" = 'Vadesiz + KMH';
-- Garanti Alp "isActive" = true.

UPDATE public.cfo_bank_account AS a
   SET "accountType" = s."accountType", "updatedAt" = now()
  FROM (SELECT "accountType" FROM public.cfo_bank_account WHERE name = 'Garanti Alperen (şahsi)' AND "isActive" LIMIT 1) AS s
 WHERE a.id = '6a9d9f79-2b10-43f2-8a4c-dd8355c1cede' AND a.name = 'Akbank Alp' AND a."accountType" = 'Vadesiz + KMH';

INSERT INTO public.cfo_change_log (id, area, item, "oldValue", "newValue", source, kind, note)
SELECT gen_random_uuid()::text, 'banka', 'Akbank Alp hesap türü', 'Vadesiz + KMH', a."accountType", 'Kullanıcı', 'karar',
       'D-P08 (Alperen 2026-10-09): Akbank Alp şahsi, Garanti Alp firma. Şirket genel KMH -250.000, şahsi KMH +250.000.'
  FROM public.cfo_bank_account a WHERE a.id = '6a9d9f79-2b10-43f2-8a4c-dd8355c1cede'
   AND NOT EXISTS (SELECT 1 FROM public.cfo_change_log l WHERE l.item = 'Akbank Alp hesap türü' AND l.kind = 'karar');

-- 2) "Garanti Alp" banka hesabı pasif (silinmez; geçmiş kalır). Bakiye 0, KMH kullanılmamış (10.09 teyidi).
UPDATE public.cfo_bank_account
   SET "isActive" = false, "updatedAt" = now()
 WHERE id = '72a9a26e-2fdc-49dd-8b0d-cb3374e6b294' AND name = 'Garanti Alp' AND "isActive";

INSERT INTO public.cfo_change_log (id, area, item, "oldValue", "newValue", source, kind, note)
SELECT gen_random_uuid()::text, 'banka', 'Garanti Alp banka hesabı', 'aktif (KMH 200.000)', 'pasif', 'Kullanıcı', 'karar',
       'D-P08 (Alperen 2026-10-09, Garanti ekranları): böyle bir hesap yok; Garanti = 286-6293619 şirket (KMH 500.000) + 286-6673313 şahsi (KMH 150.000). Şirket genel KMH -200.000.'
 WHERE NOT EXISTS (SELECT 1 FROM public.cfo_change_log l WHERE l.item = 'Garanti Alp banka hesabı' AND l.kind = 'karar');

-- Doğrulama (beklenen: Akbank Alp şahsi türde; Garanti Alp pasif; bos_kmh_try 1.359.300; Sahsi KMH 1.350.000)
SELECT name, "accountType", "isActive" FROM public.cfo_bank_account WHERE name IN ('Akbank Alp', 'Garanti Alp');
SELECT bos_kmh_try FROM public.cfo_nakit_kapisi;
SELECT kalem, tutar FROM public.cfo_kaynak_yeterliligi() WHERE kalem ILIKE 'Sahsi%' OR kalem ILIKE 'Bos GENEL%';
