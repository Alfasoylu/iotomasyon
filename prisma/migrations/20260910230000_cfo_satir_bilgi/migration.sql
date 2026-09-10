-- Satır bazında soru-cevap ve ürün kararı.
--
-- SORUN: panel bir şeyi bilmediğinde bunu ya sessizce atlıyordu ("maliyet yok" →
-- satır tutara girmiyor) ya da bir rozetle geçiştiriyordu ("oran güveni: düşük").
-- Alperen'in cevabı bu eksiği kapatacak bilgiye sahip ama cevabı yazacak yer yoktu.
-- Aynı şekilde "bu ürünü bir daha getirmek istemiyorum" bilgisi hiçbir yere
-- kaydedilmiyordu; her yeni parti taramasında ürün tekrar öneriye giriyordu.
--
-- ÇÖZÜM: iki yön de kalıcı hale gelir ve HEM panel HEM Cowork'teki CFO ajanı
-- aynı yerden okur:
--   1) Soru-cevap → mevcut `cfo_question` tablosuna satır kimliği eklenir.
--      Yeni tablo AÇILMAZ: CFO zaten bu tabloyu okuyor ve /cfo/sorular ekranı
--      buna bağlı. Sadece "hangi satır hakkında" bilgisi eksikti.
--   2) Ürün kararı → `cfo_urun_karar`. Kalıcıdır, parti değişse de yaşar.
--
-- NOT: `cfo_question.status` canlıda karışık yazılmış ('ACIK' / 'acik' /
-- 'CEVAPLANDI' / 'cevaplandi'). Sorgular büyük-küçük harfe takılmasın diye
-- tek seferlik normalize ediliyor.

-- 1) Soruya satır kimliği ---------------------------------------------------
alter table cfo_question
  add column if not exists scope      text,
  add column if not exists entity_key text,
  add column if not exists code       text;

comment on column cfo_question.scope is
  'Sorunun bağlı olduğu ekran/satır türü: ITHALAT_SATIRI, KAZANAN_SATIRI. Boş = genel soru.';
comment on column cfo_question.entity_key is
  'Satırın kimliği. ITHALAT_SATIRI için "MOD|SKU", KAZANAN_SATIRI için "AY|SKU".';
comment on column cfo_question.code is
  'Sorunun türü (MALIYET_YOK, ORAN_GUVENI_DUSUK, ...). Aynı satıra aynı soru iki kez açılmasın diye.';

update cfo_question set status = upper(status) where status <> upper(status);

create index if not exists cfo_question_entity_idx
  on cfo_question (scope, entity_key);

-- Aynı satır + aynı soru türü için AÇIK ikinci bir kayıt olmasın. Cevaplanmış
-- eskiler serbest: aynı soru ileride tekrar sorulabilir (fiyat değişir, kanal değişir).
create unique index if not exists cfo_question_acik_tekil_idx
  on cfo_question (scope, entity_key, code)
  where status = 'ACIK' and scope is not null and entity_key is not null and code is not null;

-- 2) Ürün kararı ------------------------------------------------------------
create table if not exists cfo_urun_karar (
  sku            text primary key,
  karar          text not null check (karar in ('ALMA', 'AL', 'BEKLE')),
  sebep          text not null,
  -- null = süresiz. Doluysa o tarihten sonra karar kendiliğinden düşer;
  -- "bu sefer alma" ile "bir daha alma" farkı böyle kayda geçer.
  gecerli_bitis  date,
  kaynak         text,
  karar_veren    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table cfo_urun_karar is
  'Ürün bazında kalıcı ithalat kararı. ALMA = öneriye girmesin. Parti değişse de yaşar.';
comment on column cfo_urun_karar.sebep is
  'Zorunlu. Karar kadar gerekçesi de bilgidir — altı ay sonra "neden almamıştık" sorusunun cevabı burada.';

-- 3) Öneri görünümü kararı tanır --------------------------------------------
-- Sütun eklendiği için create-or-replace yetmez; sıralı drop + create.
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
  -- Alperen'in kalıcı kararı. Süresi geçmiş karar yok sayılır.
  ka.karar                                                as karar,
  ka.sebep                                                as karar_sebep,
  ka.gecerli_bitis                                        as karar_bitis,
  -- coalesce şart: karar satırı yoksa ka.karar NULL olur, (NULL = 'ALMA') da NULL
  -- döner ve özetteki `where not haric` TÜM satırları eler.
  coalesce(ka.karar = 'ALMA', false)                      as haric,
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
      and (ka.gecerli_bitis is null or ka.gecerli_bitis >= current_date);

comment on view cfo_ithalat_oneri is
  'Sıradaki ithalat siparişi — satır bazında. Kaynak: cfo_order_line. haric = Alperen ALMA dedi.';

-- Özet yalnız hariç tutulmayanları sayar: "alma" denen kalem tutara da,
-- minimum ithalat eşiğine de girmemeli.
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
  where not haric
  group by mod
),
haric_sayim as (
  select mod, count(*)::int as haric_satir from cfo_ithalat_oneri where haric group by mod
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
  coalesce(h.haric_satir, 0)                        as haric_satir,
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
left join haric_sayim h on h.mod = t.mod;

comment on view cfo_ithalat_oneri_ozet is
  'Sıradaki ithalat siparişi — parti özeti. Hariç tutulan (ALMA) kalemler tutara ve eşiğe girmez.';
