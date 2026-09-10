-- Yoldaki malın İÇERİĞİ — sipariş önerisi artık gelecek malı biliyor.
--
-- SORUN (Alperen 10.09.2026): "ekim başı gelecek ürünlerin listesi bir yerlerde
-- olmalı, birçok üründe giriş olacak ama bu ithalat içeriği yok sayılıyor."
-- Doğru. `cfo_yoldaki_mal` yalnız PARA tutuyordu (ödenmiş/ödenmemiş tutar);
-- konteynerin İÇİNDE NE OLDUĞU hiçbir tabloda yoktu — yalnız serbest metin notta
-- ve orada da sadece ciro bakımından ilk 7 kalem adıyla geçiyordu.
--
-- Sonuç: `cfo_ithalat_oneri` 15.10'da rafa girecek malı yok sayıyor ve aynı ürünü
-- yeniden sipariş etmeyi önerebiliyor. 07.26sea konteynerinde 152 kalem /
-- 29.420 adet var; bunlar görünmeden verilen "sıradaki sipariş" kararı eksik.
--
-- ÇÖZÜM: içerik satır satır `cfo_yoldaki_kalem`e girer, öneri görünümü bunu
-- düşer. Liste henüz girilmediği sürece ekran bunu SAKLAMAZ — kapsama oranını
-- yazar, çünkü "yoldaki mal yok" ile "yoldaki mal bilinmiyor" farklı şeylerdir.

-- 1) Partinin beklenen büyüklüğü (kapsama ölçmek için) ----------------------
alter table cfo_yoldaki_mal
  add column if not exists kalem_sayisi integer,
  add column if not exists adet_toplam  integer;

comment on column cfo_yoldaki_mal.kalem_sayisi is
  'Faturadaki toplam kalem sayısı. cfo_yoldaki_kalem''e kaç satır girildiğini ölçmek için.';
comment on column cfo_yoldaki_mal.adet_toplam is
  'Faturadaki toplam adet.';

-- Bilinen değerler (07.26sea faturası, cfo_note 0156d42f).
update cfo_yoldaki_mal set kalem_sayisi = 152, adet_toplam = 29420 where kod = '07.26sea';

-- 2) Yoldaki malın kalemleri ------------------------------------------------
create table if not exists cfo_yoldaki_kalem (
  id                bigserial primary key,
  kod               text not null references cfo_yoldaki_mal(kod) on delete cascade,
  sku               text,
  urun_adi          text not null,
  adet              integer not null check (adet > 0),
  birim_maliyet_usd numeric(12,4),
  gtip              text,
  -- Faturadaki SKU kataloğumuzda olmayabilir (07.26sea'da 152'nin 148'i yoktu).
  -- Eşleşmeyen satır da tutulur; sku boş kalır, urun_adi ile aranır.
  katalogda         boolean generated always as (sku is not null) stored,
  note              text,
  created_at        timestamptz not null default now()
);

create index if not exists cfo_yoldaki_kalem_kod_idx on cfo_yoldaki_kalem (kod);
create index if not exists cfo_yoldaki_kalem_sku_idx on cfo_yoldaki_kalem (sku) where sku is not null;

comment on table cfo_yoldaki_kalem is
  'Yoldaki/gümrükteki partilerin kalem kalem içeriği. Sipariş önerisi bunu düşer.';

-- 3) SKU bazında yolda ne var ----------------------------------------------
drop view if exists cfo_yolda_sku;

create view cfo_yolda_sku as
select
  k.sku,
  sum(k.adet)::int                       as yolda_adet,
  min(m."etaDate"::date)                  as en_yakin_eta,
  string_agg(distinct k.kod, ', ')       as partiler
from cfo_yoldaki_kalem k
join cfo_yoldaki_mal ym on ym.kod = k.kod
left join cfo_import_project m on m.code = k.kod
where k.sku is not null
  -- Adli süreçteki parti "gelecek mal" sayılmaz: mülkiyeti bizde değil.
  and ym.risk <> 'RISKLI'
group by k.sku;

comment on view cfo_yolda_sku is
  'SKU bazında yoldaki adet ve en yakın varış. RISKLI partiler (Romanya 1.) hariç.';

-- 4) Parti içeriğinin ne kadarı girilmiş ------------------------------------
drop view if exists cfo_yoldaki_kapsam;

create view cfo_yoldaki_kapsam as
select
  m.kod,
  m.aciklama,
  m.durum,
  m.risk,
  p."etaDate"::date                                          as eta,
  m.kalem_sayisi                                             as beklenen_kalem,
  m.adet_toplam                                              as beklenen_adet,
  count(k.id)::int                                           as girilen_kalem,
  coalesce(sum(k.adet), 0)::int                              as girilen_adet,
  count(k.id) filter (where k.sku is not null)::int          as eslesen_kalem,
  case
    when coalesce(m.kalem_sayisi, 0) = 0 then null
    else round(count(k.id)::numeric / m.kalem_sayisi * 100, 1)
  end                                                        as kapsam_pct
from cfo_yoldaki_mal m
left join cfo_yoldaki_kalem k on k.kod = m.kod
left join cfo_import_project p on p.code = m.kod
group by m.kod, m.aciklama, m.durum, m.risk, p."etaDate", m.kalem_sayisi, m.adet_toplam;

comment on view cfo_yoldaki_kapsam is
  'Yoldaki partinin içeriğinin ne kadarı sisteme girilmiş. Kapsam düşükse öneriler eksik bilgiyle veriliyor demektir.';

-- 5) Öneri görünümü yoldaki malı tanır --------------------------------------
drop view if exists cfo_ithalat_oneri_ozet;
drop view if exists cfo_ithalat_oneri;

create view cfo_ithalat_oneri as
with kural as (
  select
    coalesce(max("importAirLeadDays"), 22)        as air_lead,
    coalesce(max("importSeaLeadDays"), 67)        as sea_lead,
    coalesce(max("importMinLineQty"), 5)          as min_adet,
    coalesce(max("usdTryRate"), 48.5)             as kur
  from cfo_settings
),
ham as (
  select l.*, b.transport_mode, b.status as batch_status, b.cash_gate, b.decision
    from cfo_order_line l
    join cfo_order_batch b on b.id = l.batch_id
   where l.status = 'BEKLIYOR'
     and coalesce(l.qty, 0) > 0
     and b.status in ('ACIK', 'PLANLANIYOR')
),
tekil as (
  select distinct on (transport_mode, sku)
         transport_mode as mod, sku, product_name, qty, unit_cost_usd,
         monthly_sales, stock_now, stockout_date, wait_cost_try_monthly,
         priority, data_tag, batch_id, reason
    from ham
   order by transport_mode, sku, added_at desc nulls last, id desc
),
kopru as (
  select sku from ham group by sku having count(distinct transport_mode) > 1
),
fiyat as (
  select sku, (sum(brut_ciro) / nullif(sum(adet), 0))::numeric as birim_fiyat_try
    from cfo_aylik_urun_kar
   where ay >= date_trunc('month', current_date) - interval '3 month'
   group by sku
)
select
  t.mod,
  t.sku,
  t.product_name,
  t.priority,
  t.data_tag,
  t.batch_id                                              as kaynak_parti,
  t.reason,
  t.qty                                                   as parti_adedi,
  greatest(t.qty, k.min_adet)                             as onerilen_adet,
  greatest(t.qty, k.min_adet) > t.qty                     as min_adet_uygulandi,
  t.unit_cost_usd                                         as birim_maliyet_usd,
  round(greatest(t.qty, k.min_adet) * t.unit_cost_usd, 2) as tutar_usd,
  (t.unit_cost_usd is null)                               as maliyet_eksik,
  t.monthly_sales                                         as aylik_satis,
  t.stock_now                                             as stok,
  coalesce(
    t.stockout_date,
    current_date + ((coalesce(t.stock_now, 0) / nullif(t.monthly_sales, 0)) * 30)::int
  )                                                       as tukenis_tarihi,
  case when t.mod = 'HAVA' then k.air_lead else k.sea_lead end as termin_gun,
  coalesce(
    t.stockout_date,
    current_date + ((coalesce(t.stock_now, 0) / nullif(t.monthly_sales, 0)) * 30)::int
  ) - (case when t.mod = 'HAVA' then k.air_lead else k.sea_lead end) as son_siparis_tarihi,
  (coalesce(
     t.stockout_date,
     current_date + ((coalesce(t.stock_now, 0) / nullif(t.monthly_sales, 0)) * 30)::int
   ) - (case when t.mod = 'HAVA' then k.air_lead else k.sea_lead end)) < current_date as gecikti,
  current_date + (case when t.mod = 'HAVA' then k.air_lead else k.sea_lead end) as tahmini_varis,
  round(greatest(t.qty, k.min_adet) / nullif(t.monthly_sales, 0), 1) as kapsam_ay,
  coalesce(t.wait_cost_try_monthly, 0)                    as aylik_risk_kar_try,
  round(f.birim_fiyat_try, 2)                             as birim_fiyat_try,
  round(t.monthly_sales * f.birim_fiyat_try / k.kur, 0)   as aylik_ciro_usd,
  (kp.sku is not null)                                    as kopru,
  ka.karar                                                as karar,
  ka.sebep                                                as karar_sebep,
  ka.gecerli_bitis                                        as karar_bitis,
  coalesce(ka.karar = 'ALMA', false)                      as haric,
  -- ── Yoldaki mal ────────────────────────────────────────────────────────
  coalesce(y.yolda_adet, 0)                               as yolda_adet,
  y.en_yakin_eta                                          as yolda_eta,
  y.partiler                                              as yolda_parti,
  -- Yoldaki mal stoksuzluğu KAPATIYOR mu? İki koşul birden gerekir:
  -- (a) tükenişten önce rafa girecek, (b) adedi en az bir aylık satışı karşılıyor.
  -- Sadece "yolda bir şeyler var" demek yetmez; 3 adet gelen 40 adet/ay satan
  -- ürünü kurtarmaz.
  (
    y.yolda_adet is not null
    and y.en_yakin_eta is not null
    and y.en_yakin_eta <= coalesce(
          t.stockout_date,
          current_date + ((coalesce(t.stock_now, 0) / nullif(t.monthly_sales, 0)) * 30)::int)
    and y.yolda_adet >= coalesce(t.monthly_sales, 0)
  )                                                       as yolda_yeterli,
  row_number() over (
    partition by t.mod
    order by coalesce(t.wait_cost_try_monthly, 0) desc, t.priority, t.sku
  )::int                                                  as sira
from tekil t
cross join kural k
left join fiyat f on f.sku = t.sku
left join kopru kp on kp.sku = t.sku
left join cfo_urun_karar ka
       on ka.sku = t.sku
      and (ka.gecerli_bitis is null or ka.gecerli_bitis >= current_date)
left join cfo_yolda_sku y on y.sku = t.sku;

comment on view cfo_ithalat_oneri is
  'Sıradaki ithalat siparişi — satır bazında. haric = Alperen ALMA dedi. yolda_yeterli = zaten yolda, tekrar sipariş etme.';

-- Özet: hariç tutulan VE yoldaki malla kapanan kalemler tutara girmez.
create view cfo_ithalat_oneri_ozet as
with kural as (
  select
    coalesce(max("importMinOrderUsd"), 10000)      as min_usd,
    coalesce(max("importMinLineQty"), 5)           as min_adet,
    coalesce(max("usdTryRate"), 48.5)              as kur,
    coalesce(max("monthlyRevenueTargetUsd"), 100000) as hedef_ciro_usd
  from cfo_settings
),
toplam as (
  select
    mod,
    count(*)::int                                  as satir,
    sum(onerilen_adet)::int                        as toplam_adet,
    round(sum(tutar_usd), 2)                       as toplam_usd,
    count(*) filter (where maliyet_eksik)::int     as maliyet_eksik_satir,
    count(*) filter (where gecikti)::int           as gecikmis_satir,
    count(*) filter (where kopru)::int             as kopru_satir,
    round(sum(aylik_ciro_usd), 0)                  as aylik_ciro_usd,
    round(sum(aylik_risk_kar_try), 0)              as aylik_risk_kar_try,
    min(son_siparis_tarihi)                        as en_erken_son_siparis,
    min(tukenis_tarihi)                            as en_erken_tukenis,
    max(termin_gun)                                as termin_gun
  from cfo_ithalat_oneri
  where not haric and not yolda_yeterli
  group by mod
),
disarida as (
  select mod,
         count(*) filter (where haric)::int          as haric_satir,
         count(*) filter (where yolda_yeterli)::int  as yolda_satir
    from cfo_ithalat_oneri group by mod
),
bugun as (
  select coalesce((select nakit_try from cfo_nakit_kapisi), 0) as nakit_try
),
kapi as (
  select
    t.mod,
    (select min(g.tarih) from cfo_odeme_gunluk g
      where g.tarih >= current_date
        and g.gun_sonu_nakit >= t.toplam_usd * k.kur) as nakit_kapisi_tarihi,
    (select max(g.tarih) from cfo_odeme_gunluk g)     as projeksiyon_sonu,
    (select max(g.gun_sonu_nakit) from cfo_odeme_gunluk g
      where g.tarih >= current_date)                  as projeksiyon_en_yuksek_nakit
  from toplam t cross join kural k
)
select
  t.mod,
  t.satir,
  t.toplam_adet,
  t.toplam_usd,
  round(t.toplam_usd * k.kur, 2)                    as toplam_try,
  t.maliyet_eksik_satir,
  t.gecikmis_satir,
  t.kopru_satir,
  coalesce(d.haric_satir, 0)                        as haric_satir,
  coalesce(d.yolda_satir, 0)                        as yolda_satir,
  t.termin_gun,
  t.en_erken_tukenis,
  t.en_erken_son_siparis,
  greatest(current_date, t.en_erken_son_siparis)     as ideal_siparis_tarihi,
  k.min_usd                                          as min_tutar_usd,
  k.min_adet                                         as min_adet_kural,
  (t.toplam_usd >= k.min_usd)                        as esik_karsilandi,
  greatest(k.min_usd - t.toplam_usd, 0)              as esige_kalan_usd,
  b.nakit_try                                        as bugunku_nakit_try,
  greatest(round(t.toplam_usd * k.kur - b.nakit_try, 2), 0) as nakit_acigi_try,
  kp.nakit_kapisi_tarihi,
  kp.projeksiyon_sonu,
  round(kp.projeksiyon_en_yuksek_nakit, 2)           as projeksiyon_en_yuksek_nakit,
  case
    when kp.nakit_kapisi_tarihi is null then null
    else greatest(greatest(current_date, t.en_erken_son_siparis), kp.nakit_kapisi_tarihi)
  end                                                as tavsiye_siparis_tarihi,
  case
    when kp.nakit_kapisi_tarihi is null then null
    else greatest(greatest(current_date, t.en_erken_son_siparis), kp.nakit_kapisi_tarihi)
         + t.termin_gun
  end                                                as tahmini_varis,
  case
    when t.toplam_usd < k.min_usd            then 'ESIK_ALTI'
    when kp.nakit_kapisi_tarihi is null      then 'KAPI_KAPALI'
    when kp.nakit_kapisi_tarihi > current_date then 'NAKIT_BEKLIYOR'
    when t.en_erken_son_siparis < current_date then 'GECIKMIS'
    else 'HAZIR'
  end                                                as durum,
  t.aylik_ciro_usd,
  t.aylik_risk_kar_try,
  k.hedef_ciro_usd
from toplam t
cross join kural k
cross join bugun b
join kapi kp on kp.mod = t.mod
left join disarida d on d.mod = t.mod;

comment on view cfo_ithalat_oneri_ozet is
  'Parti özeti. Hariç tutulan (ALMA) ve yoldaki malla kapanan kalemler tutara ve eşiğe girmez.';
