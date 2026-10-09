-- CFO-006 (RF-010): sirket / sahsi TEK KURAL veritabaninda. TS lib/cfo/ownership.ts ile birebir:
--   banka hesabi SAHSI <=> "accountType" Turkce katlanmis (S/I/C/G/O/U) buyuk harfte "SAHSI" KELIMESI (ad kullanilmaz; NULL = sirket);
--   kart SAHSI <=> sahibi (holder) katlanmis "ALP".
-- Onceden 4 farkli ifade: cfo_nakit_kapisi / cfo_onucus_temel `!~~* '%ŞAHSİ%'` (ASCII "SAHSI" yazimini tanimiyordu, NULL hesabi disarida
-- birakiyordu), cfo_kaynak_yeterliligi `ilike`, cfo_metrik_borc `~* 'ŞAHSİ|SAHSI'` + `holder = 'Alp'`. Uretim 2026-10-09: 15 hesap / 6 kartta
-- sonuc ayni, NULL tipli aktif hesap yok → nakit/KMH/borc sayilari degismez.
-- Ek duzeltme: cfo_kaynak_yeterliligi ACIK satirlari ve cfo_onucus_temel 8. satir (KAYNAK YETERLILIGI acigi) ticari nakdi ikinci kez sayiyordu
-- (dip = cfo_nakit_projeksiyon pozisyonu, nakit_try ile baslar). Bugun etkisi: acik 151.470 TL daha derin (dogru deger).
-- Geri alma: onceki tanimlar 20261006 baseline / 20261009180000 migration'inda.
CREATE OR REPLACE FUNCTION public.cfo_hesap_sahsi(p_account_type text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT upper(translate(coalesce(p_account_type, ''), 'ŞşİıIiÇçĞğÖöÜü', 'SSIIIICCGGOOUU')) ~ '(^|[^A-Z])SAHSI([^A-Z]|$)'
$$;
CREATE OR REPLACE FUNCTION public.cfo_kart_sahsi(p_holder text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT upper(translate(btrim(coalesce(p_holder, '')), 'ŞşİıIiÇçĞğÖöÜü', 'SSIIIICCGGOOUU')) = 'ALP'
$$;

CREATE OR REPLACE VIEW public.cfo_nakit_kapisi AS
SELECT ( SELECT COALESCE(sum(cfo_bank_account."balanceTry"), 0::numeric) AS "coalesce"
           FROM cfo_bank_account
          WHERE cfo_bank_account."isActive" AND cfo_bank_account."balanceTry" IS NOT NULL AND NOT public.cfo_hesap_sahsi(cfo_bank_account."accountType")) AS nakit_try,
    ( SELECT COALESCE(sum(cfo_receivable."amountTry"), 0::numeric) AS "coalesce"
           FROM cfo_receivable
          WHERE NOT cfo_receivable."isCollected" AND cfo_receivable."dueDate"::date >= CURRENT_DATE AND cfo_receivable."dueDate"::date <= (CURRENT_DATE + 10) AND cfo_receivable.certainty::text = 'KESIN'::text) AS girecek_10g,
    ( SELECT COALESCE(sum(cfo_cash_event."outflowTry"), 0::numeric) AS "coalesce"
           FROM cfo_cash_event
          WHERE NOT cfo_cash_event."isSettled" AND cfo_cash_event."eventDate"::date >= CURRENT_DATE AND cfo_cash_event."eventDate"::date <= (CURRENT_DATE + 10)) AS cikacak_10g,
    ( SELECT COALESCE(sum(GREATEST(cfo_bank_account."kmhLimitTry" - GREATEST(- cfo_bank_account."balanceTry", 0::numeric), 0::numeric)), 0::numeric) AS "coalesce"
           FROM cfo_bank_account
          WHERE cfo_bank_account."isActive" AND cfo_bank_account."balanceTry" IS NOT NULL AND NOT public.cfo_hesap_sahsi(cfo_bank_account."accountType")) AS bos_kmh_try,
    ( SELECT COALESCE(sum(cfo_bank_account."purposeLimitTry"), 0::numeric) AS "coalesce"
           FROM cfo_bank_account
          WHERE cfo_bank_account."isActive" AND NOT public.cfo_hesap_sahsi(cfo_bank_account."accountType")) AS amacli_kmh_try,
    ( SELECT COALESCE(sum(cfo_receivable."amountTry"), 0::numeric) AS "coalesce"
           FROM cfo_receivable
          WHERE NOT cfo_receivable."isCollected" AND cfo_receivable."dueDate"::date < CURRENT_DATE) AS vadesi_gecmis_alacak_try;

CREATE OR REPLACE FUNCTION public.cfo_onucus_temel()
 RETURNS TABLE(sira integer, seviye text, kontrol text, deger text, ne_yapmali text)
 LANGUAGE sql
 STABLE
AS $function$
with tr as (select (now() at time zone 'Europe/Istanbul') t),
sat as (select max("orderDate")::date son, current_date - max("orderDate")::date gecikme from "MarketplaceSalesRecord"),
atf as (select (100.0*coalesce(sum("totalAmountTry"-tutar_duz),0)/nullif(sum("totalAmountTry"),0))::numeric(6,2) pay,
   coalesce(sum("totalAmountTry"-tutar_duz),0)::numeric(12,0) tl from cfo_satis_birim_duz where "orderDate">=current_date-90),
nak as (select * from cfo_nakit_kapisi),
banka as (select coalesce(max(current_date - "lastUpdatedAt"::date),0) bayat,
                 count(*) filter (where current_date - "lastUpdatedAt"::date > 2) n
          from cfo_bank_account where "isActive" and not public.cfo_hesap_sahsi("accountType")),
proj as (select min(pozisyon) dip, (select "netPositionFloorTry" from cfo_settings) taban from cfo_nakit_projeksiyon(120)),
dipt as (select tarih from cfo_nakit_projeksiyon(120) where pozisyon=(select dip from proj) order by tarih limit 1),
kyn as (select (select bos_kmh_try from nak) + (select dip from proj) acik_ticari, -- dip nakitle baslar; nakit ikinci kez eklenmez (CFO-006)
               (select nakit_try+bos_kmh_try from nak) kaynak),
kk as (select count(*) filter (where karar like 'ASGARIYE%' or karar like 'KORUMALI AMA%') n_asg,
              count(*) filter (where karar like 'YETERSIZ%') n_yetersiz from cfo_kart_karari()),
sip as (select count(*) n from cfo_order_batch b join cfo_order_line l on l.batch_id=b.id
        where b.status in ('ONAYLANDI','SIPARIS_VERILDI') and l.status in ('ONAYLANDI','SIPARIS_VERILDI')),
fot as (select max("takenAt") son, count(*) filter (where "takenAt">=current_date) bugun from cfo_snapshot),
log as (select max("changedAt") son from cfo_change_log),
soru as (select count(*) n from cfo_question where answer is not null and "processedAt" is null),
gec as (select count(*) n from cfo_gecikmis_karar), bek as (select count(*) n from cfo_bekleyen_karar),
ters as (select count(*) n from "Product" p where p."unitCostTry" is not null and p."sellingPriceTry" is not null and p."unitCostTry">p."sellingPriceTry"),
stok as (select count(*) n from (select p.sku from "Product" p join (
     select cfo_norm("modelNumber") ns, sum(adet_duz)/90.0 g from cfo_satis_birim_duz
     where "orderDate">=current_date-90 and "modelNumber" is not null group by 1 having sum(adet_duz)>=9) s
   on s.ns=cfo_norm(p.sku) where p."isActive" and p."stockQuantity" is not null and s.g>0 and p."stockQuantity"/s.g<30) x),
gecmis as (select count(*) n, coalesce(sum(coalesce("outflowTry",0)-coalesce("inflowTry",0)),0)::numeric(14,0) tl from cfo_cash_event where "eventDate"::date < current_date and not "isSettled"),
kaps as (select count(*) filter (where p."unitCostTry" is not null) var, count(*) tum from (
   select cfo_norm("modelNumber") ns, row_number() over (order by sum(tutar_duz) desc) r
   from cfo_satis_birim_duz where "orderDate">=current_date-90 and "modelNumber" is not null group by 1) s
   cross join lateral (select pp."unitCostTry" from "Product" pp where cfo_norm(pp.sku)=s.ns order by (pp."unitCostTry" is null), pp."isActive" desc, pp."stockQuantity" desc nulls last limit 1) p where s.r<=50)
select 1,'BILGI','Saat ve gun', to_char((select t from tr),'DD.MM.YYYY HH24:MI')||' TR · '||(array['Pazar','Pazartesi','Sali','Carsamba','Persembe','Cuma','Cumartesi'])[extract(dow from (select t from tr))::int+1],
  'Rotasyon: '||(array['karar kuyrugu','100K aday suzme','olu stok','listeleme kapsami','gorunurluk/SEO','alfashome donusumu','karar kuyrugu'])[extract(dow from (select t from tr))::int+1]||'. Tarihi BURADAN al.'
union all select 2, case when (select son from log)>now()-interval '20 hours' then 'SARI' else 'YESIL' end,'Baska kosu var mi',
  'son log '||coalesce(to_char((select son from log) at time zone 'Europe/Istanbul','DD.MM HH24:MI'),'-'),
  'SARI ise (1) cfo_change_log son 20 kaydini OKU, (2) claude/alfas-cfo-delta-'||to_char((select t from tr),'YYYY-MM-DD')||'.md belgesini project_read ile OKU. O belge VARSA UZERINE YAZMA - altina yeni bolum ekle. 01.09.2026da bir kosu bu belgeyi okumadan ezdi.'
union all select 3, case when (select gecikme from sat)>=2 then 'KIRMIZI' when (select gecikme from sat)=1 then 'SARI' else 'YESIL' end,
  'Satis verisi tazeligi','son kayit '||(select son from sat)||' ('||(select gecikme from sat)||' gun geride)','KIRMIZI ise rakamlari "Eski" etiketle.'
union all select 4, case when (select pay from atf)>=5 then 'KIRMIZI' when (select pay from atf)>=2 then 'SARI' else 'YESIL' end,
  'Atfedilmemis ciro','%'||(select pay from atf)||' ('||(select tl from atf)||' TL)','Birim analizde adet_duz + tutar_duz kullan.'
union all select 5, case when (select n from soru)>0 then 'KIRMIZI' else 'YESIL' end,'Islenmemis cevap',(select n from soru)||' cevap','Rotasyon isinden ONCE isle.'
union all select 6, case when (select n from gec)>0 then 'KIRMIZI' else 'YESIL' end,'Geciken karar',(select n from gec)||' geciken · '||(select n from bek)||' bekleyen','Bugun karara baglanir.'
union all select 7, case when (select nakit_try+girecek_10g-cikacak_10g from nak)<0 then 'KIRMIZI' else 'YESIL' end,'Nakit kapisi (10 gun)',
  'nakit '||round((select nakit_try from nak))||' + girecek '||round((select girecek_10g from nak))||' - cikacak '||round((select cikacak_10g from nak))||' = '||round((select nakit_try+girecek_10g-cikacak_10g from nak))||' TL',
  'Raporda BOS GECILEMEZ. KMH siparis kaynagi sayilmaz.'
union all select 8, case when (select acik_ticari from kyn)<0 then 'KIRMIZI' else 'YESIL' end,
  'KAYNAK YETERLILIGI',
  'ihtiyac '||round(-(select dip from proj))||' TL · ticari kaynak '||round((select kaynak from kyn))||' TL · acik '||round((select acik_ticari from kyn))||' TL',
  'KIRMIZI ise ODEME FIZIKSEL OLARAK YAPILAMAZ. select * from cfo_kaynak_yeterliligi(); Bu tabandan DAHA kritiktir - raporun 1. maddesi.'
union all select 9, case when (select dip from proj)<(select taban from proj) then 'KIRMIZI' else 'YESIL' end,
  'Net pozisyon tabani','dip '||round((select dip from proj))||' TL ('||(select tarih from dipt)||') · taban '||round((select taban from proj))||' TL',
  'KIRMIZI ise cfo_kart_karari() ciktisini UYGULA. Alperene sorma.'
union all select 10, case when (select n_asg from kk)>0 then 'KIRMIZI' when (select n_yetersiz from kk)>0 then 'SARI' else 'YESIL' end,
  'Kart karari','asgariye cekilecek '||(select n_asg from kk)||' kalem'||case when (select n_yetersiz from kk)>0 then ' · kaldirac YETERSIZ' else '' end,
  'KIRMIZI ise uygula. SARI ise kart kaldiraci tukendi - kaldirac merdivenini raporla (olu stok tasfiyesi 7. basamak).'
union all select 11, case when (select n from sip)>0 and (select nakit_try+girecek_10g-cikacak_10g from nak)<0 then 'KIRMIZI' else 'YESIL' end,
  'Nakitsiz onayli siparis',(select n from sip)||' satir','Yurtdisi siparis YALNIZCA nakitle.'
union all select 12, case when (select bugun from fot)=0 then 'KIRMIZI' else 'YESIL' end,'Bugunun fotografi',(select bugun from fot)||' adet','cfo_take_snapshot calistir.'
union all select 13, case when (select n from ters)>0 then 'SARI' else 'YESIL' end,'Maliyet > satis fiyati',(select n from ters)||' urun','Maliyet yanlis eslesmis olabilir.'
union all select 14, case when (select n from stok)>0 then 'KIRMIZI' else 'YESIL' end,'30 gunden az stok',(select n from stok)||' urun','ACIL: bildir. Nakit yoksa siparis verilmez.'
union all select 15, case when (select var from kaps)<(select tum from kaps)*0.9 then 'SARI' else 'YESIL' end,'Maliyet kapsami',(select var||'/'||tum from kaps),'Her kosuda en az 3 eksik maliyet doldurulur. Dropship SKUlarina maliyet YAZILMAZ.'
union all select 16, case when (select n from gecmis)>0 then 'KIRMIZI' else 'YESIL' end,'Gecmis tarihli odenmemis kalem',(select n||' kalem · '||tl||' TL net cikis' from gecmis),'KIRMIZI ise bu kalemler projeksiyondan SESSIZCE dusuyor — dip ihtiyaci oldugundan iyi gorunur. Her birini ya hesap hareketi/Alperen beyani ile isSettled=true yap, ya ILERI TARIHE al. Silme, teyitsiz settle etme. (02.09.2026 dersi: 303.400 TL boyle kaybolmustu.)'
union all select 17,
  case when (select bayat from banka) > 2 then 'KIRMIZI'
       when (select bayat from banka) > 0 then 'SARI' else 'YESIL' end,
  'Banka bakiyesi tazeligi',
  (select n from banka)||' hesap 2 gunden bayat · en eskisi '||(select bayat from banka)||' gun',
  'Bakiye bayatsa nakit ve bos KMH GERCEGINDEN IYI gorunur: yapilan bir odeme KMHden cikmissa defterde hic gorunmez. KIRMIZI ise nakit_try ve bos_kmh_try rakamlarini "Eski" etiketle, kaynak yeterliligi sonucunu KESIN sunma, Alperenden guncel bakiye iste. (05.09.2026 dersi: 04.09da 270.900 TL odendi, defter 03.09da duruyordu.)'
union all select 18,
  case when (select count(*) from cfo_receivable where not "isCollected" and "dueDate"::date < current_date) > 0 then 'KIRMIZI' else 'YESIL' end,
  'Vadesi gecmis tahsil edilmemis alacak',
  (select count(*)||' kalem · '||coalesce(sum("amountTry"),0)::numeric(14,0)||' TL · en eskisi '||coalesce(max(current_date - "dueDate"::date),0)||' gun' from cfo_receivable where not "isCollected" and "dueDate"::date < current_date),
  'KIRMIZI ise bu tutar ya TAHSIL EDILDI ve banka bakiyesine yazilmadi (cift sayim), ya da GERCEKTEN gelmedi (tahsilat sorunu). Ikisi de nakit kapisini iyimser gosterir. Her kalemi hesap hareketi/Alperen beyani ile isCollected=true yap ya da yeni vadeye al. Silme. (07.09.2026 dersi: 210.821 TL, 6-13 gun gecikmis, girecek_10g icinde GELECEK giris sayiliyordu.)'
order by 1;
$function$;

CREATE OR REPLACE FUNCTION public.cfo_kaynak_yeterliligi()
 RETURNS TABLE(kalem text, tutar numeric, aciklama text)
 LANGUAGE sql
 STABLE
AS $function$
-- CFO-006 (2026-10-10): dip = cfo_nakit_projeksiyon pozisyonu, nakit_try ile BASLAR → ACIK satirlarinda nakit ikinci kez eklenmez
-- (onceden ticari nakit iki kez sayiliyordu; Cowork bulgusu 2026-10-09). Sahsi hesap tek kural cfo_hesap_sahsi().
with p as (select min(pozisyon) dip from cfo_nakit_projeksiyon(120)),
d as (select tarih from cfo_nakit_projeksiyon(120) where pozisyon=(select dip from p) order by tarih limit 1),
k as (select * from cfo_nakit_kapisi),
sahsi as (select coalesce(sum("kmhLimitTry"),0) v from cfo_bank_account where "isActive" and public.cfo_hesap_sahsi("accountType"))
select 'En dip ihtiyac'::text, -(select dip from p), ('En dusuk pozisyon '||(select tarih from d))::text
union all select 'Nakit (ticari)', (select nakit_try from k), 'Sirketin kendi parasi'
union all select 'Bos GENEL KMH', (select bos_kmh_try from k), 'Her ise kullanilabilir'
union all select 'GENEL TICARI KAYNAK', (select nakit_try+bos_kmh_try from k), 'Amaca bagli limit HARIC'
union all select 'ACIK (genel kaynak)', (select bos_kmh_try from k)+(select dip from p),
  (case when (select bos_kmh_try from k)+(select dip from p) < 0
        then 'NEGATIF — genel kaynaklarla yetmiyor' else 'Yeterli' end)::text
union all select 'Amaca bagli KMH (Ziraat/gumruk)', (select amacli_kmh_try from k),
  'YALNIZCA gumruk vergisi Ziraattten odenirse acilir'
union all select 'GUMRUK ANINDA TOPLAM KAYNAK', (select nakit_try+bos_kmh_try+amacli_kmh_try from k),
  'Genel + amaca bagli'
union all select 'ACIK (gumruk limiti dahil)',
  (select bos_kmh_try+amacli_kmh_try from k)+(select dip from p),
  (case when (select bos_kmh_try+amacli_kmh_try from k)+(select dip from p) < 0
        then 'NEGATIF — gumruk limiti dahil bile yetmiyor' else 'YETERLI' end)::text
union all select 'Sahsi KMH (son care)', (select v from sahsi), 'KKDF %15 + BSMV: ~14-19 puan pahali'
union all select 'ACIK (her sey dahil)',
  (select bos_kmh_try+amacli_kmh_try from k)+(select v from sahsi)+(select dip from p),
  (case when (select bos_kmh_try+amacli_kmh_try from k)+(select v from sahsi)+(select dip from p) < 0
        then 'HALA NEGATIF' else 'Ancak sahsi hesaplarla ve SIFIR TAMPONLA kapaniyor' end)::text;
$function$;

CREATE OR REPLACE FUNCTION public.cfo_metrik_borc()
 RETURNS TABLE(sira integer, tur text, kalem text, tutar numeric, aciklama text)
 LANGUAGE sql
 STABLE
AS $function$
WITH k AS (
  SELECT round(COALESCE(sum(l."remainingTry"), 0), 2) AS kredi,
         round(COALESCE(sum(COALESCE(l."earlyPayoffTry", l."remainingTry")), 0), 2) AS erken,
         count(*) AS adet
    FROM public.cfo_loan l WHERE l.status::text = 'AKTIF'
), c AS (
  SELECT round(COALESCE(sum(cc."totalDebtTry"), 0), 2) AS kart,
         round(COALESCE(sum(cc."totalDebtTry") FILTER (WHERE public.cfo_kart_sahsi(cc.holder)), 0), 2) AS kart_sahsi,
         count(*) FILTER (WHERE cc."totalDebtTry" IS NULL) AS bilinmeyen
    FROM public.cfo_credit_card cc WHERE cc."isActive"
), h AS (
  SELECT round(COALESCE(sum(GREATEST(-b."balanceTry", 0)), 0), 2) AS kmh,
         round(COALESCE(sum(GREATEST(-b."balanceTry", 0)) FILTER (WHERE public.cfo_hesap_sahsi(b."accountType")), 0), 2) AS kmh_sahsi,
         count(*) FILTER (WHERE b."balanceTry" < 0) AS hesap
    FROM public.cfo_bank_account b WHERE b."isActive" AND b."balanceTry" IS NOT NULL
), y AS (
  SELECT round(COALESCE(sum(m.odenmemis_vergi_try + m.odenmemis_navlun_try), 0), 2) AS taahhut
    FROM public.cfo_yoldaki_mal m WHERE m.risk = 'NORMAL'
)
SELECT v.sira, v.tur, v.kalem, v.tutar, v.aciklama
FROM k, c, h, y, LATERAL (VALUES
  (1, 'BORC', 'Krediler (kalan anapara)', k.kredi, k.adet || ' aktif kredi; cfo_loan remainingTry (taksit sayisi degil)'),
  (2, 'BORC', 'Kredi kartlari (toplam borc)', c.kart,
     'cfo_credit_card totalDebtTry (ekstre + donem ici)' || CASE WHEN c.bilinmeyen > 0 THEN '; ' || c.bilinmeyen || ' kartin borcu BILINMIYOR (toplama girmedi)' ELSE '' END),
  (3, 'BORC', 'Kullanilan KMH', h.kmh, h.hesap || ' hesap eksi bakiyede'),
  (90, 'BILGI', 'Yoldaki mal - odenmemis gumruk/navlun (ticari taahhut, hedef disi)', y.taahhut,
     'Mal teslim alininca odenir ve stok maliyetine eklenir; nakit projeksiyonunda gorunur (D-P03)'),
  (91, 'BILGI', 'Krediler erken kapama tutariyla', k.erken, 'earlyPayoffTry, yoksa kalan anapara; hedef kalan anaparayla olculur'),
  (92, 'BILGI', 'Toplamin sahsi kismi (kart + KMH, hedefe dahil)', c.kart_sahsi + h.kmh_sahsi, 'Sahsi kart (holder Alp) + SAHSI hesap KMH; sirket/sahsi ayrimi CFO-006'),
  (100, 'TOPLAM', 'FINANSAL BORC', k.kredi + c.kart + h.kmh, 'Sozlesme (CFO-002; D-P03 borc = kredi kalan + kart toplam + kullanilan KMH)')
) AS v(sira, tur, kalem, tutar, aciklama)
ORDER BY v.sira;
$function$;


DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.cfo_hesap_sahsi(text), public.cfo_kart_sahsi(text) FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.cfo_hesap_sahsi(text), public.cfo_kart_sahsi(text) FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.cfo_hesap_sahsi(text), public.cfo_kart_sahsi(text) FROM authenticated; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cfo_acceptance_reader') THEN
    GRANT EXECUTE ON FUNCTION public.cfo_hesap_sahsi(text), public.cfo_kart_sahsi(text) TO cfo_acceptance_reader; END IF;
END $$;
