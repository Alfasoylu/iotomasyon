-- Ölü stok: XML hareket sinyalini kurallara bağla.
--
-- NEDEN: satış listesi haftalık yüklendiği için iki yükleme arasında sistem
-- satış görmüyor ve "hiç satmadı" diyor. 12.09 denetiminde bunun üç yanlış
-- kırmızı alarm ürettiği ölçüldü — en büyüğü AL-CAM03, 940.900 TL bağlı sermaye,
-- "90 günde hiç satmadı" etiketiyle listenin başındaydı ama son 30 günde satmıştı.
--
-- KURAL: "hiç satmadı" iddiası, XML o dönemde hareket gösteriyorsa KURULMAZ.
-- Stok azalması doğrudan kanıttır; satış verisinin yüklenmemiş olması ürünün
-- satmadığı anlamına gelmez.
--
-- Örtü ve oran kuralları aynen kalır: onlar "hiç satmadı" değil "yeterince hızlı
-- satmıyor" diyor; XML de bunu çürütmez, yalnız ölçüyü biraz eksik gösterir.
-- Bunu gizlemiyoruz: `veri_durumu` sütunu satış verisinin o ürün için taze olup
-- olmadığını söyler, panel bayat dönemi görünür kılar.

drop view if exists cfo_olu_stok_ozet;
drop view if exists cfo_olu_stok;

create view cfo_olu_stok as
with esik as (
  select coalesce(max("deadStockSalesRatioPct"), 20) / 100.0 as oran from cfo_settings
),
-- Satış verisinin nereye kadar dolu olduğu: bundan sonrası için XML söz sahibi.
kapsam as (
  select coalesce(max(gun) filter (where satis_verisi_var), current_date) as satis_son_gun
    from cfo_satis_kapsam
),
d as (
  select coalesce(s."productId", pm.id) as prod,
         s.adet_duz, s.tutar_duz, s."orderDate", s.channel
    from cfo_satis_birim_duz s
    left join "Product" pm on lower(pm.sku) = lower(s."modelNumber")
   where s."orderDate" >= current_date - 400
),
a as (
  select prod,
         coalesce(sum(adet_duz) filter (where "orderDate" >= current_date - 30), 0)  as a30,
         coalesce(sum(adet_duz) filter (where "orderDate" >= current_date - 90), 0)  as a90,
         coalesce(sum(adet_duz), 0)                                                  as a400,
         coalesce(sum(adet_duz) filter (where "orderDate" >= current_date - 90
                                          and channel = 'AMAZON_FBA'), 0)            as fba90,
         coalesce(sum(tutar_duz) filter (where "orderDate" >= current_date - 90), 0)::numeric as t90,
         max("orderDate")::date                                                      as son_satis
    from d where prod is not null group by prod
),
x as (
  select
    p.sku,
    left(p.name, 60)                                        as ad,
    p."stockQuantity"                                       as stok,
    round(p."unitCostTry"::numeric, 2)                      as birim_maliyet,
    round(coalesce(p."stockQuantity"::numeric * p."unitCostTry", sd.net_deger)) as bagli_sermaye,
    coalesce(nullif(sd.maliyet_degeri, 0), sd.net_deger)    as stok_deger,
    coalesce(sd.deger_kaynagi, case when p."unitCostTry" is not null
                                    then 'MALIYET' else 'DEGERSIZ' end) as deger_kaynagi,
    coalesce(a.a30, 0)                                      as adet_30g,
    coalesce(a.a90, 0)                                      as adet_90g,
    coalesce(a.a400, 0)                                     as adet_400g,
    coalesce(a.fba90, 0)                                    as fba_90g,
    round(coalesce(a.t90, 0))                               as satis_90g_try,
    a.son_satis,
    current_date - a.son_satis                              as gecen_gun,
    case when coalesce(a.a90, 0) > 0
         then round(p."stockQuantity"::numeric / (a.a90::numeric / 90.0)) end as ortu_gun,
    -- XML vekil ölçüsü
    coalesce(xh.xml_30g, 0)                                 as xml_30g,
    coalesce(xh.xml_90g, 0)                                 as xml_90g,
    xh.xml_son_satis,
    (select satis_son_gun from kapsam)                      as satis_verisi_son_gun,
    (current_date - (select satis_son_gun from kapsam))      as satis_verisi_bayat_gun
  from "Product" p
  left join a on a.prod = p.id
  left join cfo_stok_deger sd on sd.sku = p.sku
  left join cfo_xml_urun_hareket xh on xh.sku = p.sku
  where p."stockQuantity" >= 1
    and p."stockQuantity" <> all (array[500, 998, 999, 1000, 9999, 10000])
    and (p."unitCostTry" is not null or coalesce(sd.net_deger, 0) > 0)
    and not exists (select 1 from cfo_stok_istisna i where i.sku = p.sku)
),
o as (
  select x.*,
         case when x.stok_deger > 0 then x.satis_90g_try / x.stok_deger end as satis_stok_orani,
         -- "Hiç satmadı" ancak XML de sessizse söylenebilir.
         (x.adet_30g = 0 and x.xml_30g = 0) as gercekten_30g_sifir,
         (x.adet_90g = 0 and x.xml_90g = 0) as gercekten_90g_sifir,
         case when x.satis_verisi_bayat_gun > 2 then 'BOSLUK' else 'TAM' end as veri_durumu
    from x
)
select
  o.sku, o.ad, o.stok, o.birim_maliyet, o.bagli_sermaye,
  o.stok_deger, o.deger_kaynagi, o.satis_90g_try, o.satis_stok_orani,
  o.adet_30g, o.adet_90g, o.adet_400g, o.fba_90g,
  o.xml_30g, o.xml_90g, o.xml_son_satis,
  o.veri_durumu, o.satis_verisi_son_gun, o.satis_verisi_bayat_gun,
  o.son_satis, o.gecen_gun, o.ortu_gun,
  case
    when (o.gercekten_30g_sifir or o.ortu_gun > 365) and o.bagli_sermaye >= 50000 then 'KIRMIZI'
    when o.satis_stok_orani < (select oran from esik) and o.bagli_sermaye >= 50000 then 'KIRMIZI'
    when o.gercekten_30g_sifir or o.ortu_gun > 180 then 'SARI'
    when o.satis_stok_orani < (select oran from esik) then 'SARI'
    else 'YESIL'
  end as alarm,
  case
    when o.gercekten_90g_sifir then '90 gunde hic satmadi'
    when o.gercekten_30g_sifir then '30 gunde hic satmadi'
    -- Satış verisi sessiz ama XML hareket görmüş: iddiayı kurmuyoruz, sebebi yazıyoruz.
    when o.adet_30g = 0 and o.xml_30g > 0
      then 'satis verisi yuklenmemis; XML 30 gunde ' || o.xml_30g || ' adet hareket gormus'
    when o.ortu_gun > 365 then 'stok ortusu ' || o.ortu_gun || ' gun (1 yildan uzun)'
    when o.ortu_gun > 180 then 'stok ortusu ' || o.ortu_gun || ' gun'
    when o.satis_stok_orani < (select oran from esik)
      then '90 gunluk satis stok degerinin %'
           || round(100 * o.satis_stok_orani, 1) || ' i (esik %'
           || round(100 * (select oran from esik)) || ')'
    else 'normal'
  end as alarm_sebep,
  f.id as bulgu_id, f.status as bulgu_durum, f.action_taken as aksiyon,
  f.watch_note as kontrol_notu, f.next_review_at as sonraki_kontrol,
  f.next_review_at is not null and f.next_review_at < current_date as kontrol_gecikti,
  f.found_at as ilk_tespit, current_date - f.found_at as yas_gun,
  f.last_checked_at as son_kontrol,
  f.status = 'aksiyon_alindi' or f.action_taken is not null as aksiyon_var
from o
left join lateral (
  select g.* from cfo_dead_stock_finding g where g.sku = o.sku order by g.id desc limit 1
) f on true
where o.gercekten_30g_sifir
   or o.ortu_gun > 180
   or o.satis_stok_orani < (select oran from esik);

comment on view cfo_olu_stok is
  'Olu stok adaylari. Uc kural: 30 gunde hic satmadi · stok ortusu > 180 gun · '
  '90 gunluk satis stok degerinin %20''sinden dusuk (esik cfo_settings). '
  'XML HAREKETI VARSA "hic satmadi" IDDIASI KURULMAZ — stok azalmasi dogrudan '
  'satis kanitidir, satis verisinin yuklenmemis olmasi urunun satmadigi anlamina gelmez. '
  'cfo_stok_istisna''daki SKU''lar haric.';

create view cfo_olu_stok_ozet as
select
  count(*)                                                         as toplam_sku,
  count(*) filter (where alarm = 'KIRMIZI')                        as kirmizi,
  count(*) filter (where alarm = 'SARI')                           as sari,
  round(sum(bagli_sermaye))                                        as bagli_sermaye,
  round(sum(bagli_sermaye) filter (where alarm = 'KIRMIZI'))        as kirmizi_bagli,
  count(*) filter (where adet_30g = 0)                             as otuz_gun_sifir,
  count(*) filter (where adet_90g = 0)                             as doksan_gun_sifir,
  round(sum(bagli_sermaye) filter (where adet_90g = 0))             as doksan_gun_sifir_bagli,
  count(*) filter (where kontrol_gecikti)                          as kontrol_gecikti,
  count(*) filter (where adet_30g > 0 and coalesce(ortu_gun, 0) <= 180)  as sadece_oran_kurali,
  round(sum(bagli_sermaye) filter (where adet_30g > 0
                                     and coalesce(ortu_gun, 0) <= 180))  as sadece_oran_bagli,
  -- XML sayesinde yanlis alarmdan kurtulanlar: satis verisi sessiz ama urun hareketli.
  count(*) filter (where adet_30g = 0 and xml_30g > 0)             as xml_kurtardi,
  max(satis_verisi_bayat_gun)                                      as satis_verisi_bayat_gun
from cfo_olu_stok;