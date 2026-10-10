-- CFO-030 (RF-20261010-035, 2026-10-10): KMH KAPASITESI TEK AYRISTIRMA — kapasite = sirket pozisyonu + TAM ticari limit.
-- cfo_nakit_kapisi.nakit_try sirket hesaplarinin bakiye TOPLAMIDIR (eksi bakiye dahil; tek nakit yolunun acilisi, CFO-013 — degismez).
-- bos_kmh_try = limit - kullanilan. Ikisi toplaninca (kaynak yeterliligi "GENEL TICARI KAYNAK", ACIK satirlari = bos KMH + dip, on ucus
-- kaynak / acik_ticari, gumruk dilimi SINIR 2) eksi bakiyeli hesapta kullanilan KMH IKI KEZ duser: −200.000 bakiye, 500.000 limit →
-- kaynak 100.000 gorunur, gercek 300.000. /cfo/odemeler zaten dogru (pozisyon + tam limit, lib/cfo/payment-capacity.ts).
-- Duzeltme: cfo_nakit_kapisi'na kmh_limit_try (bakiyesi bilinen aktif sirket hesaplarinin tam KMH limiti; sona eklenen sutun) ve tuketiciler
-- pozisyon + kmh_limit_try ile hesaplar. bos_kmh_try gosterim icin kalir. Eksi bakiye yokken sonuc AYNI (10.10 uretim: limit = bos = 1.359.300).
-- 14.10 gumruk dilimi sonrasi pozisyon eksiye dusunce fark dogar (kullanilan KMH kadar). Yetkiler: CREATE OR REPLACE ACL'i korur.
-- Geri alma: 20261010100000 (cfo_nakit_kapisi, cfo_onucus_temel, cfo_kaynak_yeterliligi) + 20261009140000 (cfo_gumruk_dilim) tanimlari;
-- kmh_limit_try sutunu gorunumden ancak DROP VIEW ile kalkar (bagimli gorunumler) — geri almada sutun kalabilir, okuyani yoktur.

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
          WHERE NOT cfo_receivable."isCollected" AND cfo_receivable."dueDate"::date < CURRENT_DATE) AS vadesi_gecmis_alacak_try,
    ( SELECT COALESCE(sum(GREATEST(COALESCE(cfo_bank_account."kmhLimitTry", 0::numeric), 0::numeric)), 0::numeric) AS "coalesce"
           FROM cfo_bank_account
          WHERE cfo_bank_account."isActive" AND cfo_bank_account."balanceTry" IS NOT NULL AND NOT public.cfo_hesap_sahsi(cfo_bank_account."accountType")) AS kmh_limit_try;

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
kyn as (select (select kmh_limit_try from nak) + (select dip from proj) acik_ticari, -- dip nakitle baslar; nakit ikinci kez eklenmez (CFO-006)
               (select nakit_try+kmh_limit_try from nak) kaynak), -- CFO-030: pozisyon + tam limit (kullanilan KMH iki kez dusmez)
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
-- CFO-030 (2026-10-10, RF-035): kapasite = pozisyon (nakit_try, eksi bakiye dahil) + TAM ticari limit (kmh_limit_try); bos_kmh_try
-- (limit - kullanilan) pozisyonla toplanirsa eksi bakiyede kullanilan KMH iki kez duser. 'Bos GENEL KMH' satiri gosterim icin kalir.
with p as (select min(pozisyon) dip from cfo_nakit_projeksiyon(120)),
d as (select tarih from cfo_nakit_projeksiyon(120) where pozisyon=(select dip from p) order by tarih limit 1),
k as (select * from cfo_nakit_kapisi),
sahsi as (select coalesce(sum("kmhLimitTry"),0) v from cfo_bank_account where "isActive" and public.cfo_hesap_sahsi("accountType"))
select 'En dip ihtiyac'::text, -(select dip from p), ('En dusuk pozisyon '||(select tarih from d))::text
union all select 'Nakit (ticari)', (select nakit_try from k), 'Sirketin kendi parasi'
union all select 'Bos GENEL KMH', (select bos_kmh_try from k), 'Her ise kullanilabilir'
union all select 'GENEL TICARI KAYNAK', (select nakit_try+kmh_limit_try from k), 'Amaca bagli limit HARIC'
union all select 'ACIK (genel kaynak)', (select kmh_limit_try from k)+(select dip from p),
  (case when (select kmh_limit_try from k)+(select dip from p) < 0
        then 'NEGATIF — genel kaynaklarla yetmiyor' else 'Yeterli' end)::text
union all select 'Amaca bagli KMH (Ziraat/gumruk)', (select amacli_kmh_try from k),
  'YALNIZCA gumruk vergisi Ziraattten odenirse acilir'
union all select 'GUMRUK ANINDA TOPLAM KAYNAK', (select nakit_try+kmh_limit_try+amacli_kmh_try from k),
  'Genel + amaca bagli'
union all select 'ACIK (gumruk limiti dahil)',
  (select kmh_limit_try+amacli_kmh_try from k)+(select dip from p),
  (case when (select kmh_limit_try+amacli_kmh_try from k)+(select dip from p) < 0
        then 'NEGATIF — gumruk limiti dahil bile yetmiyor' else 'YETERLI' end)::text
union all select 'Sahsi KMH (son care)', (select v from sahsi), 'KKDF %15 + BSMV: ~14-19 puan pahali'
union all select 'ACIK (her sey dahil)',
  (select kmh_limit_try+amacli_kmh_try from k)+(select v from sahsi)+(select dip from p),
  (case when (select kmh_limit_try+amacli_kmh_try from k)+(select v from sahsi)+(select dip from p) < 0
        then 'HALA NEGATIF' else 'Ancak sahsi hesaplarla ve SIFIR TAMPONLA kapaniyor' end)::text;
$function$;

CREATE OR REPLACE FUNCTION public.cfo_gumruk_dilim(p_gumruk_tarih date DEFAULT NULL::date)
 RETURNS TABLE(kalem text, tutar numeric, aciklama text)
 LANGUAGE sql
 STABLE
AS $function$
with g_tarih as (
  select coalesce(
    p_gumruk_tarih,
    (select min("eventDate")::date from cfo_cash_event
      where not "isSettled" and kind = 'VERGI_GUMRUK'
        and "eventDate"::date >= current_date)
  ) as d
),
k as (select * from cfo_nakit_kapisi),
-- 09.10.2026 duzeltmesi: odeme gunu BUGUNSE d-1 projeksiyon penceresinin disinda
-- kalir ve eski sorgu NULL donerdi. pozisyon(d) - net(d) = pozisyon(d-1) kimligi
-- her d >= current_date icin gecerlidir; once d-1 denenir, yoksa bu kimlik kullanilir.
onceki as (
  select coalesce(
    (select pozisyon from cfo_nakit_projeksiyon(120)
      where tarih = (select d from g_tarih) - 1),
    (select pozisyon - net from cfo_nakit_projeksiyon(120)
      where tarih = (select d from g_tarih))
  ) as p
),
gumruk as (select coalesce(sum("outflowTry"),0) v from cfo_cash_event
           where not "isSettled" and "eventDate"::date = (select d from g_tarih)),
sonra7 as (select coalesce(sum("outflowTry"),0) v from cfo_cash_event
           where not "isSettled" and "eventDate"::date
                 between (select d from g_tarih)+1 and (select d from g_tarih)+7),
taban as (select "netPositionFloorTry" v from cfo_settings),
-- 09.10.2026 duzeltmesi: eski SINIR 2 nakit_try + pozisyon(d-1) topluyordu.
-- pozisyon(d-1) BUGUNUN NAKDINI ZATEN ICERIR (pozisyon current_date nakdinden
-- baslayip ileri yurur), yani nakit iki kez sayiliyordu. Dogru kapasite:
-- pozisyon(d-1) + BOS limitler. Bugun icin fark 151.553,36 TL.
sinir1 as (select (select v from taban)*-1 + (select p from onceki) as v),
-- CFO-030 (2026-10-10, RF-035): pozisyon(d-1) + TAM limitler (bos_kmh = limit - BUGUN kullanilan; pozisyon zaten kullanimi icerir).
sinir2 as (select (select kmh_limit_try + amacli_kmh_try from k)
                  + (select p from onceki) - (select v from sonra7) as v),
baglayici as (select least((select v from sinir1), (select v from sinir2)) as v)
select 'Gumruk oncesi pozisyon'::text, (select p from onceki),
       ((select d from g_tarih)-1)::text||' sonu'
union all select 'Gumruk odeme tarihi', null::numeric, (select d from g_tarih)::text
union all select 'Toplam gumruk tutari', (select v from gumruk), 'O gunun toplam cikisi'
union all select 'Genel ticari kaynak', (select nakit_try+kmh_limit_try from k), 'pozisyon + genel KMH limiti'
union all select 'Amaca bagli KMH (gumruk)', (select amacli_kmh_try from k), 'Ziraat, yalniz gumruk odemesinde'
union all select 'Odeme aninda toplam kaynak', (select p from onceki) + (select kmh_limit_try+amacli_kmh_try from k), 'Pozisyon(d-1) + limitler (nakit ve kullanilan KMH cift sayilmaz)'
union all select 'Sonraki 7 gunun cikislari', (select v from sonra7), 'Odeme sonrasi tampon'
union all select 'SINIR 1 — taban kurali', (select v from sinir1),
  'Taban -3.000.000 TL korunarak odenebilecek azami'
union all select 'SINIR 2 — fiziksel kaynak', (select v from sinir2),
  'Amaca bagli limit dahil, sonraki 7 gun ayrildiktan sonra'
union all select 'BAGLAYICI AZAMI ODEME', (select v from baglayici), 'Iki sinirin kucugu'
union all select 'CEKILEBILIR ORAN (%)',
  round(100.0 * (select v from baglayici) / nullif((select v from gumruk),0), 1),
  'Konteynerin bu orani cekilir';
$function$;
