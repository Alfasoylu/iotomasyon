-- Ölü stok: yeni kural — son 90 günlük satış, stok değerinin %20'sinden düşükse.
--
-- Alperen'in kuralı (11.09.2026). Mevcut iki kural "30 günde hiç satmadı" ve
-- "stok örtüsü > 180 gün"dü. Bunlar HIZ ölçüyor; yeni kural ORANI ölçüyor:
-- bağlı sermayenin ne kadarını 90 günde geri döndürebiliyoruz?
--
-- KURAL NEYİ EKLİYOR (ölçüldü, varsayılmadı): 28 ürünü yakalıyor, 23'ü zaten
-- listedeydi. Gerçekten yeni olan 5 ürünün 4'ünün `unitCostTry`'si YOK —
-- eski görünüm maliyeti olmayan ürünü hiç görmüyordu, çünkü bağlı sermayeyi
-- yalnız maliyetten hesaplıyordu. 1.299 üründe maliyet 76'sında dolu olduğuna
-- göre bu kör nokta kuralın kendisinden daha büyüktü.
--
-- Bu yüzden stok değeri artık `cfo_stok_deger`den okunuyor: maliyet varsa
-- maliyet, yoksa 90 günde GERÇEKLEŞEN satış fiyatı (komisyon ve kargo düşülmüş).
-- Böylece maliyeti girilmemiş ürün de tartılabiliyor.
--
-- İSTİSNA LİSTESİ AYNEN GEÇERLİ. Kuralın yakaladığı en büyük kalem
-- (40005100051, 2.769 adet, 1,98 M TL) `cfo_stok_istisna`da: stok SANAL,
-- gerçek bağlı sermaye 9.700 TL — Alperen 31.08'de beyan etti, 07.09'da
-- uygulamada teyit edildi. İstisnayı çiğneseydik insanın cevapladığı soruyu
-- yeniden sormuş olurduk. Kuralın net katkısı bu kalem hariç 4 ürün.

alter table cfo_settings
  add column if not exists "deadStockSalesRatioPct" numeric(5,2) not null default 20.00;

comment on column cfo_settings."deadStockSalesRatioPct" is
  'Ölü stok kuralı: son 90 günlük satış tutarı, stok değerinin bu yüzdesinden '
  'düşükse ürün ölü stok listesine girer. Alperen kuralı 11.09.2026: %20.';

-- Özet görünüm bunun üstünde duruyor; ikisi birlikte yeniden kurulur.
drop view if exists cfo_olu_stok_ozet;
drop view if exists cfo_olu_stok;

create view cfo_olu_stok as
with esik as (
  select coalesce(max("deadStockSalesRatioPct"), 20) / 100.0 as oran from cfo_settings
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
         -- Oran kuralının payı: 90 günde bu üründen ne kadar CİRO döndü.
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
    -- Bağlı sermaye maliyet öncelikli (eski rakamlarla süreklilik için);
    -- maliyet yoksa net gerçekleşebilir değere düşer.
    round(coalesce(p."stockQuantity"::numeric * p."unitCostTry", sd.net_deger)) as bagli_sermaye,
    -- Oran kuralının paydası: maliyet varsa maliyet değeri, yoksa satıştan
    -- türetilen net değer. İkisi de yoksa ürün tartılamaz, oran NULL kalır.
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
         then round(p."stockQuantity"::numeric / (a.a90::numeric / 90.0)) end as ortu_gun
  from "Product" p
  left join a on a.prod = p.id
  left join cfo_stok_deger sd on sd.sku = p.sku
  where p."stockQuantity" >= 1
    and p."stockQuantity" <> all (array[500, 998, 999, 1000, 9999, 10000])
    -- Maliyeti olmayan ama satıştan değerlenebilen ürün de tartılır.
    and (p."unitCostTry" is not null or coalesce(sd.net_deger, 0) > 0)
    and not exists (select 1 from cfo_stok_istisna i where i.sku = p.sku)
),
o as (
  select x.*,
         case when x.stok_deger > 0 then x.satis_90g_try / x.stok_deger end as satis_stok_orani
    from x
)
select
  o.sku, o.ad, o.stok, o.birim_maliyet, o.bagli_sermaye,
  o.stok_deger, o.deger_kaynagi, o.satis_90g_try, o.satis_stok_orani,
  o.adet_30g, o.adet_90g, o.adet_400g, o.fba_90g,
  o.son_satis, o.gecen_gun, o.ortu_gun,
  case
    when (o.adet_30g = 0 or o.ortu_gun > 365) and o.bagli_sermaye >= 50000 then 'KIRMIZI'
    -- Oran kuralı büyük sermayede tek başına kırmızıdır: 90 günde değerinin
    -- beşte birini bile döndüremeyen yüklü stok, yavaş değil, sıkışmıştır.
    when o.satis_stok_orani < (select oran from esik) and o.bagli_sermaye >= 50000 then 'KIRMIZI'
    when o.adet_30g = 0 or o.ortu_gun > 180 then 'SARI'
    when o.satis_stok_orani < (select oran from esik) then 'SARI'
    else 'YESIL'
  end as alarm,
  case
    when o.adet_30g = 0 and o.adet_90g = 0 then '90 gunde hic satmadi'
    when o.adet_30g = 0 then '30 gunde hic satmadi'
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
where o.adet_30g = 0
   or o.ortu_gun > 180
   or o.satis_stok_orani < (select oran from esik);

comment on view cfo_olu_stok is
  'Ölü stok adayları. Üç kural: 30 günde hiç satmadı · stok örtüsü > 180 gün · '
  '90 günlük satış stok değerinin %20''sinden düşük (eşik cfo_settings). '
  'cfo_stok_istisna''daki SKU''lar hariç — orada insan kararı var.';

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
  -- Yeni kuralın tek başına getirdiği kalemler ayrı sayılır ki katkısı ölçülebilsin.
  count(*) filter (where adet_30g > 0 and coalesce(ortu_gun, 0) <= 180)      as sadece_oran_kurali,
  round(sum(bagli_sermaye) filter (where adet_30g > 0
                                     and coalesce(ortu_gun, 0) <= 180))      as sadece_oran_bagli
from cfo_olu_stok;
