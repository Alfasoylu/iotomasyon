-- cfo_tahsilat_tahmini — tahmini tahsilatın TEK mekanizması (Cowork CFO kararı 2026-10-08).
-- Sorun: cfo_odeme_gunluk (cfo_yaklasan_odeme üzerinden) alacak ufku dışındaki tahsilatı yalnız cfo_cash_event.inflowTry'daki
-- ELLE boyutlandırılmış model kayıtlarından (ce_model_tahsilat_*) görüyordu; cfo_nakit_projeksiyon ise aynı dönemi kendi kanal
-- temposuyla (tah) hesaplıyordu. İki dip tesadüfen yakındı; panel uzadıkça elle kayıtlar sessizce bayatlayıp alacakla çift sayıyordu.
-- Çözüm (iki nesne, tek mekanizma):
--   alacak ufku içinde  (her kanalın kendi son açık vadesine kadar) : yalnız cfo_receivable
--   alacak ufku dışında                                             : yalnız kanal temposu (bu görünüm)
-- Bu görünüm cfo_nakit_projeksiyon(gun) içindeki `kanal` + `tah` CTE'lerinin BİREBİR aynısıdır (ufuk 120 gün = varsayılan gun);
-- eşitlik testle korunur (__tests__/cfo-tahsilat-tahmini.test.ts). cfo_yaklasan_odeme'ye dördüncü kol olarak (günlük toplam,
-- 'Tahmini tahsilat', kesinlik TAHMINI, id 'tahmin:<tarih>') eklenir; cfo_odeme_gunluk ve cfo_nakit_dibi otomatik görür.
-- ⚠️ SIRA: bu migration uygulandığı AYNI oturumda 16 ce_model_tahsilat_* kaydı silinmeli (Cowork) — yoksa ufuk ötesi iki kez sayılır.
-- Tablo değişmez, veri yazılmaz. cfo_yaklasan_odeme'nin sütunları ve tipleri aynı kalır (tutar numeric(14,2)).
-- Geri alma: cfo_yaklasan_odeme'yi dördüncü kol olmadan yeniden tanımla (aşağıdaki gövdeden son UNION ALL kolunu çıkar), sonra
--   DROP VIEW public.cfo_tahsilat_tahmini;
CREATE OR REPLACE VIEW public.cfo_tahsilat_tahmini WITH (security_invoker = true) AS
WITH kanal AS (
  SELECT channel,
         coalesce(max("dueDate") FILTER (WHERE NOT "isCollected" AND "dueDate" >= current_date)::date, current_date - 1) AS son_d,
         coalesce(sum("amountTry") FILTER (WHERE "dueDate" BETWEEN current_date AND current_date + 30), 0) / 30.0 AS gunluk
  FROM public.cfo_receivable
  WHERE "dueDate" >= current_date - 30
  GROUP BY channel
), takvim AS (
  SELECT generate_series(current_date, current_date + 120, '1 day')::date AS d
)
SELECT t.d AS tarih, k.channel AS kanal, k.son_d AS alacak_ufku, k.gunluk AS tutar
FROM takvim t JOIN kanal k ON t.d > k.son_d AND k.gunluk > 0;

COMMENT ON VIEW public.cfo_tahsilat_tahmini IS 'Alacak ufku dışı tahmini tahsilat (kanal temposu = önümüzdeki 30 gün hakedişi / 30; her kanal kendi son açık vadesinden sonra). cfo_nakit_projeksiyon tah ile birebir. 2026-10-08.';
REVOKE ALL ON public.cfo_tahsilat_tahmini FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON public.cfo_tahsilat_tahmini FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON public.cfo_tahsilat_tahmini FROM authenticated; END IF;
END $$;

CREATE OR REPLACE VIEW public.cfo_yaklasan_odeme AS
 WITH nakit AS (
         SELECT COALESCE(sum(cfo_bank_account."balanceTry"), 0::numeric) AS b
           FROM cfo_bank_account
          WHERE cfo_bank_account."isActive" = true
        ), hareket AS (
         SELECT e.id,
            e."eventDate"::date AS tarih,
            'CIKIS'::text AS yon,
                CASE e.kind::text
                    WHEN 'KREDI_TAKSITI'::text THEN 'Kredi taksiti'::text
                    WHEN 'KART_ODEMESI'::text THEN 'Kart ödemesi'::text
                    WHEN 'SABIT_GIDER'::text THEN 'Sabit gider'::text
                    WHEN 'VERGI_GUMRUK'::text THEN 'Vergi / Gümrük'::text
                    ELSE initcap(replace(e.kind::text, '_'::text, ' '::text))
                END AS tur,
            e.description AS aciklama,
            e.bank AS banka,
            e."outflowTry" AS tutar,
            e.certainty::text AS kesinlik,
            e."isSettled" AS odendi,
            e.note
           FROM cfo_cash_event e
          WHERE COALESCE(e."outflowTry", 0::numeric) > 0::numeric
        UNION ALL
         SELECT r.id,
            r."dueDate"::date AS "dueDate",
            'GIRIS'::text,
            'Pazaryeri tahsilatı'::text,
            r.channel || ' hakediş'::text,
            r.channel,
            r."amountTry",
            r.certainty::text AS certainty,
            r."isCollected",
            r.note
           FROM cfo_receivable r
        UNION ALL
         SELECT e.id,
            e."eventDate"::date AS "eventDate",
            'GIRIS'::text,
            'Diğer tahsilat'::text,
            e.description,
            e.bank,
            e."inflowTry",
            e.certainty::text AS certainty,
            e."isSettled",
            e.note
           FROM cfo_cash_event e
          WHERE COALESCE(e."inflowTry", 0::numeric) > 0::numeric
        UNION ALL
         SELECT 'tahmin:'::text || t.tarih::text,
            t.tarih,
            'GIRIS'::text,
            'Tahmini tahsilat'::text,
            'Kanal temposu, alacak ufku dışı: '::text || string_agg(t.kanal, ', '::text ORDER BY t.kanal),
            NULL::text,
            round(sum(t.tutar), 2)::numeric(14,2),
            'TAHMINI'::text,
            false,
            NULL::text
           FROM cfo_tahsilat_tahmini t
          GROUP BY t.tarih
        )
 SELECT id,
    tarih,
    yon,
    tur,
    aciklama,
    banka,
    tutar,
    kesinlik,
    odendi,
    note,
    tarih - CURRENT_DATE AS kalan_gun,
        CASE
            WHEN odendi THEN 'ODENDI'::text
            WHEN tarih < CURRENT_DATE THEN 'GECIKMIS'::text
            WHEN tarih = CURRENT_DATE THEN 'BUGUN'::text
            WHEN tarih <= (CURRENT_DATE + 3) THEN 'ACIL'::text
            WHEN tarih <= (CURRENT_DATE + 7) THEN 'BU_HAFTA'::text
            WHEN tarih <= (CURRENT_DATE + 30) THEN 'BU_AY'::text
            ELSE 'ILERIDE'::text
        END AS aciliyet,
        CASE
            WHEN yon = 'CIKIS'::text THEN - tutar
            ELSE tutar
        END AS net_etki,
    (( SELECT nakit.b
           FROM nakit)) + sum(
        CASE
            WHEN odendi THEN 0::numeric
            WHEN yon = 'CIKIS'::text THEN - tutar
            ELSE tutar
        END) OVER (ORDER BY tarih, yon DESC, id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS kalan_nakit
   FROM hareket
  WHERE tarih >= CURRENT_DATE OR odendi = false
  ORDER BY tarih, yon DESC;
