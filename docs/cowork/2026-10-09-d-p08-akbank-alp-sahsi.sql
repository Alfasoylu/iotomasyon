-- D-P08 (Alperen, 2026-10-09): "Akbank Alp" hesabı ŞAHSİ; "Garanti Alp" FİRMA hesabı (değişmez).
-- Etki (salt-okuma ölçümü 09.10): şirket boş genel KMH 1.809.300 → 1.559.300; genel ticari kaynak 1.960.853 → 1.710.853;
-- şahsi KMH (son çare) 1.100.000 → 1.350.000; "her şey dahil" açık değişmez (−52.145).
-- Hesap türü metni ELLE YAZILMAZ: cfo_nakit_kapisi / cfo_kaynak_yeterliligi / cfo_onucus_temel tam "ŞAHSİ" yazımını arar (ILIKE);
-- ASCII'ye çevrilirse ("SAHSI") hesap şirket sayılmaya devam eder. Değer, zaten şahsi olan "Garanti Alperen (şahsi)" satırından kopyalanır.
-- Tek satır değişir; koşullar yanlış satıra dokunmayı engeller. Geri alma: aynı UPDATE, "accountType" = 'Vadesiz + KMH'.

UPDATE public.cfo_bank_account AS a
   SET "accountType" = s."accountType", "updatedAt" = now()
  FROM (SELECT "accountType" FROM public.cfo_bank_account WHERE name = 'Garanti Alperen (şahsi)' AND "isActive" LIMIT 1) AS s
 WHERE a.id = '6a9d9f79-2b10-43f2-8a4c-dd8355c1cede' AND a.name = 'Akbank Alp' AND a."accountType" = 'Vadesiz + KMH';

INSERT INTO public.cfo_change_log (id, area, item, "oldValue", "newValue", source, kind, note)
SELECT gen_random_uuid()::text, 'banka', 'Akbank Alp hesap türü', 'Vadesiz + KMH', a."accountType", 'Kullanıcı', 'karar',
       'D-P08 (Alperen 2026-10-09): Akbank Alp şahsi, Garanti Alp firma. Şirket genel KMH -250.000, şahsi KMH +250.000.'
  FROM public.cfo_bank_account a WHERE a.id = '6a9d9f79-2b10-43f2-8a4c-dd8355c1cede'
   AND NOT EXISTS (SELECT 1 FROM public.cfo_change_log l WHERE l.item = 'Akbank Alp hesap türü' AND l.kind = 'karar');

-- Doğrulama (beklenen: Akbank Alp şahsi türde; bos_kmh_try 1.559.300; Sahsi KMH 1.350.000)
SELECT name, "accountType" FROM public.cfo_bank_account WHERE name IN ('Akbank Alp', 'Garanti Alp');
SELECT bos_kmh_try FROM public.cfo_nakit_kapisi;
SELECT kalem, tutar FROM public.cfo_kaynak_yeterliligi() WHERE kalem ILIKE 'Sahsi%' OR kalem ILIKE 'Bos GENEL%';
