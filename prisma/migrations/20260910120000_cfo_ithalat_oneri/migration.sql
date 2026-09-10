-- İthalat sipariş önerisi — tek kaynak.
--
-- SORUN: "sıradaki sipariş için tespit edilen ürünler" panelde 8 ayrı yerde
-- görünüyordu (import-cockpit, import-decisions, procurement, capital, importer
-- görünümü, sermaye-saglik, executive, dashboard). Hepsi Trendyol satışından
-- kendi başına türetiyordu; hiçbiri CFO'nun karar verdiği gerçek parti listesini
-- (cfo_order_batch / cfo_order_line) okumuyordu. Sonuç: aynı soruya sayfa başına
-- farklı cevap.
--
-- ÇÖZÜM: karar tek yerde üretilir (bu iki view), tek yerde gösterilir
-- (/cfo/kazananlar → "İthalat Sipariş Önerisi"). Kaynak, CFO'nun karar defteri
-- olan cfo_order_line'dır — algoritma değil, verilmiş kararlar.
--
-- KURALLAR (Alperen 10.09.2026, cfo_settings'ten okunur, elle değiştirilebilir):
--   • Hava ve deniz için AYRI öneri.
--   • Minimum ithalat tutarı 10.000 USD (parti başına).
--   • Minimum sipariş adedi 5 (satır başına).
--   • Hedef aylık ciro 100.000 USD.
--   • Nakit kapısı (30.08 kuralı): yurtdışı sipariş yalnız NAKİT ile verilir.

-- 1) Kurallar cfo_settings'e taşınır ---------------------------------------
alter table cfo_settings
  add column if not exists "importAirLeadDays"       integer       not null default 22,
  add column if not exists "importSeaLeadDays"       integer       not null default 67,
  add column if not exists "importMinOrderUsd"       numeric(14,2) not null default 10000,
  add column if not exists "importMinLineQty"        integer       not null default 5,
  add column if not exists "monthlyRevenueTargetUsd" numeric(14,2) not null default 100000;

comment on column cfo_settings."importAirLeadDays" is
  'Hava kargo tedarik termini (gün). 28.08 partisinde ölçülen: 22 gün.';
comment on column cfo_settings."importSeaLeadDays" is
  'Deniz kargo tedarik termini (gün). 28.08 partisinde ölçülen: 67 gün.';
comment on column cfo_settings."importMinOrderUsd" is
  'Parti başına minimum ithalat tutarı. Altındaki parti verilmez, biriktirilir.';
comment on column cfo_settings."importMinLineQty" is
  'Satır başına minimum sipariş adedi.';
comment on column cfo_settings."monthlyRevenueTargetUsd" is
  'Hedef aylık brüt ciro (USD). Sipariş büyüklüğü bu hedefe göre ölçülür.';

-- Canlıda var olup şemada olmayan sütun (drift). Prisma şeması bu migration ile
-- hizalandığı için burada da bildiriliyor; değeri değiştirilmiyor.
alter table cfo_settings
  add column if not exists "netPositionFloorTry" numeric(14,2);

-- 2) Satır bazında öneri ----------------------------------------------------
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
-- Açık/planlanan partilerin bekleyen satırları. IPTAL satırları ve adedi 0 olan
-- ("şimdilik sipariş yok" kaydı) satırlar öneri değildir, alınmaz.
ham as (
  select l.*, b.transport_mode, b.status as batch_status, b.cash_gate, b.decision
    from cfo_order_line l
    join cfo_order_batch b on b.id = l.batch_id
   where l.status = 'BEKLIYOR'
     and coalesce(l.qty, 0) > 0
     and b.status in ('ACIK', 'PLANLANIYOR')
),
-- Aynı SKU aynı modda birden çok partide olabilir (parti bölündü). Bunlar gerçek
-- mükerrerdir: en son eklenen karar geçerlidir, tek satıra indirilir.
-- Aynı SKU'nun HAVA ve DENİZ'de birlikte olması ise mükerrer DEĞİL — kasıtlı
-- "hava köprüsü"dür (hava şimdi yetiştirir, deniz asıl stoğu getirir). O yüzden
-- mod kırılımı korunur, ayrıca kopru = true ile işaretlenir.
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
-- Son 3 ayın gerçekleşen birim satış fiyatı — ciro katkısını hesaplamak için.
fiyat as (
  -- brut_ciro double precision; round() double kabul etmiyor, kaynakta numeric'e çevriliyor.
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
  -- Minimum adet kuralı satır bazında burada uygulanır.
  greatest(t.qty, k.min_adet)                             as onerilen_adet,
  greatest(t.qty, k.min_adet) > t.qty                     as min_adet_uygulandi,
  t.unit_cost_usd                                         as birim_maliyet_usd,
  round(greatest(t.qty, k.min_adet) * t.unit_cost_usd, 2) as tutar_usd,
  (t.unit_cost_usd is null)                               as maliyet_eksik,
  t.monthly_sales                                         as aylik_satis,
  t.stock_now                                             as stok,
  -- Tükeniş tarihi kayıtlıysa o, değilse stok/hızdan türetilir.
  coalesce(
    t.stockout_date,
    current_date + ((coalesce(t.stock_now, 0) / nullif(t.monthly_sales, 0)) * 30)::int
  )                                                       as tukenis_tarihi,
  case when t.mod = 'HAVA' then k.air_lead else k.sea_lead end as termin_gun,
  -- Stoksuz kalmamak için siparişin verilmesi gereken EN GEÇ tarih.
  coalesce(
    t.stockout_date,
    current_date + ((coalesce(t.stock_now, 0) / nullif(t.monthly_sales, 0)) * 30)::int
  ) - (case when t.mod = 'HAVA' then k.air_lead else k.sea_lead end) as son_siparis_tarihi,
  (coalesce(
     t.stockout_date,
     current_date + ((coalesce(t.stock_now, 0) / nullif(t.monthly_sales, 0)) * 30)::int
   ) - (case when t.mod = 'HAVA' then k.air_lead else k.sea_lead end)) < current_date as gecikti,
  -- Bugün sipariş verilirse mal ne zaman rafa girer.
  current_date + (case when t.mod = 'HAVA' then k.air_lead else k.sea_lead end) as tahmini_varis,
  -- Önerilen adet mevcut hızda kaç ay yeter.
  round(greatest(t.qty, k.min_adet) / nullif(t.monthly_sales, 0), 1) as kapsam_ay,
  coalesce(t.wait_cost_try_monthly, 0)                    as aylik_risk_kar_try,
  round(f.birim_fiyat_try, 2)                             as birim_fiyat_try,
  round(t.monthly_sales * f.birim_fiyat_try / k.kur, 0)   as aylik_ciro_usd,
  (kp.sku is not null)                                    as kopru,
  row_number() over (
    partition by t.mod
    order by coalesce(t.wait_cost_try_monthly, 0) desc, t.priority, t.sku
  )::int                                                  as sira
from tekil t
cross join kural k
left join fiyat f on f.sku = t.sku
left join kopru kp on kp.sku = t.sku;

comment on view cfo_ithalat_oneri is
  'Sıradaki ithalat siparişi — satır bazında. Kaynak: cfo_order_line (CFO karar defteri). Hava/deniz ayrı.';

-- 3) Parti (mod) bazında özet + nakit kapısı --------------------------------
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
    -- ::int şart: PG bigint'i Prisma JS BigInt olarak döndürür ve BigInt'i
    -- number ile toplamak TypeError atar (sayfada reduce ediliyorlar).
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
  group by mod
),
-- Bugünkü nakit ve projeksiyon. Nakit kapısı kuralı (30.08): sipariş yalnız
-- NAKİT ile verilir; boş KMH ve kart limiti bu hesaba GİRMEZ.
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
  t.termin_gun,
  t.en_erken_tukenis,
  t.en_erken_son_siparis,
  -- Stok açısından ideal sipariş tarihi: en geç tarih geçtiyse "bugün".
  greatest(current_date, t.en_erken_son_siparis)     as ideal_siparis_tarihi,
  -- Minimum tutar kuralı.
  k.min_usd                                          as min_tutar_usd,
  k.min_adet                                         as min_adet_kural,
  (t.toplam_usd >= k.min_usd)                        as esik_karsilandi,
  greatest(k.min_usd - t.toplam_usd, 0)              as esige_kalan_usd,
  -- Nakit kapısı.
  b.nakit_try                                        as bugunku_nakit_try,
  greatest(round(t.toplam_usd * k.kur - b.nakit_try, 2), 0) as nakit_acigi_try,
  kp.nakit_kapisi_tarihi,
  kp.projeksiyon_sonu,
  round(kp.projeksiyon_en_yuksek_nakit, 2)           as projeksiyon_en_yuksek_nakit,
  -- Tavsiye edilen sipariş tarihi: stok ihtiyacı ile nakit kapısının geç olanı.
  -- Kapı projeksiyon boyunca hiç açılmıyorsa tarih verilemez (null) — bu bir
  -- hata değil, "bu parti bu nakitle verilemez" bilgisidir.
  case
    when kp.nakit_kapisi_tarihi is null then null
    else greatest(greatest(current_date, t.en_erken_son_siparis), kp.nakit_kapisi_tarihi)
  end                                                as tavsiye_siparis_tarihi,
  case
    when kp.nakit_kapisi_tarihi is null then null
    else greatest(greatest(current_date, t.en_erken_son_siparis), kp.nakit_kapisi_tarihi)
         + t.termin_gun
  end                                                as tahmini_varis,
  -- Tek kelimelik durum: en kötü koşul kazanır.
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
join kapi kp on kp.mod = t.mod;

comment on view cfo_ithalat_oneri_ozet is
  'Sıradaki ithalat siparişi — hava/deniz parti özeti, minimum tutar kuralı ve nakit kapısı.';

-- 4) Ciro hedefi ------------------------------------------------------------
drop view if exists cfo_ciro_hedef;

create view cfo_ciro_hedef as
with kural as (
  select coalesce(max("monthlyRevenueTargetUsd"), 100000) as hedef_usd,
         coalesce(max("usdTryRate"), 48.5)                as kur
    from cfo_settings
),
-- Son TAM ay. İçinde bulunulan ay eksik olduğu için hedefle kıyaslanamaz.
son_tam as (
  select ay, ay_str, sum(brut_ciro) as ciro_try, sum(adet) as adet
    from cfo_aylik_urun_kar
   where ay < date_trunc('month', current_date)
   group by ay, ay_str
   order by ay desc
   limit 1
)
select
  s.ay_str                                         as ay,
  round(s.ciro_try::numeric, 0)                    as ciro_try,
  round((s.ciro_try / k.kur)::numeric, 0)          as ciro_usd,
  k.hedef_usd,
  round((s.ciro_try / k.kur / nullif(k.hedef_usd, 0) * 100)::numeric, 1) as hedef_pct,
  round((k.hedef_usd - s.ciro_try / k.kur)::numeric, 0) as acik_usd,
  round((k.hedef_usd / nullif(s.ciro_try / k.kur, 0))::numeric, 2)       as gereken_kat,
  s.adet::int as adet
from son_tam s cross join kural k;

comment on view cfo_ciro_hedef is
  'Son tam ayın brüt cirosu ile hedef aylık ciro (cfo_settings.monthlyRevenueTargetUsd) karşılaştırması.';
