-- CAPTURE (2026-10-09): Cowork CFO cfo_gumruk_dilim'i üretimde migration'sız düzeltti; bu dosya üretimdeki tanımı aynen repo'ya alır
-- (pg_get_functiondef, salt-okuma, 2026-10-09 ~06:40 UTC). Üretimde no-op (aynı tanım). İki düzeltme:
--   1) gümrük ödeme günü BUGÜNSE d-1 projeksiyon penceresinin dışında kalıyor ve "gümrük öncesi pozisyon" NULL dönüyordu;
--      pozisyon(d) − net(d) = pozisyon(d−1) kimliğiyle doldurulur.
--   2) SINIR 2 nakit_try + pozisyon(d−1) topluyordu; pozisyon(d−1) bugünün nakdini zaten içerir → nakit iki kez sayılıyordu
--      (09.10 farkı 151.553,36 TL). Doğru kapasite: pozisyon(d−1) + boş limitler.
-- Yetkiler değişmez (CREATE OR REPLACE ACL'i korur). Geri alma: prisma/baseline/2026-10-06.sql içindeki cfo_gumruk_dilim tanımı.
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
sinir2 as (select (select bos_kmh_try + amacli_kmh_try from k)
                  + (select p from onceki) - (select v from sonra7) as v),
baglayici as (select least((select v from sinir1), (select v from sinir2)) as v)
select 'Gumruk oncesi pozisyon'::text, (select p from onceki),
       ((select d from g_tarih)-1)::text||' sonu'
union all select 'Gumruk odeme tarihi', null::numeric, (select d from g_tarih)::text
union all select 'Toplam gumruk tutari', (select v from gumruk), 'O gunun toplam cikisi'
union all select 'Genel ticari kaynak', (select nakit_try+bos_kmh_try from k), 'nakit + genel KMH'
union all select 'Amaca bagli KMH (gumruk)', (select amacli_kmh_try from k), 'Ziraat, yalniz gumruk odemesinde'
union all select 'Odeme aninda toplam kaynak', (select p from onceki) + (select bos_kmh_try+amacli_kmh_try from k), 'Pozisyon(d-1) + bos limitler (nakit cift sayilmaz)'
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
