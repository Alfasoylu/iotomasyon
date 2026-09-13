-- Yeni ürün adayları — ilan açılacak, katalogda olmayan ürünler.
--
-- 07.26sea konteynerinde 152 kalem var, 149'u katalogda YOK. 05.10'da rafa
-- girecekler ve Trendyol/Hepsiburada/Amazon'da ilan açılması gerekiyor. İlan
-- için gereken bilgi (Türkçe ad, açıklama, görsel, barkod, desi) hiçbir yerde
-- toplu durmuyordu.
--
-- GÖRSEL TÜRÜ KRİTİK: tedarikçi görsellerinin bir kısmı ÇİNCE bilgi görselidir.
-- İlana konulamaz (pazaryeri reddeder, müşteri okuyamaz) ama silinemez de —
-- ölçü ve montaj şeması çoğu zaman yalnız orada. Tür zorunlu, CHECK ile sınırlı,
-- ilan çıktısı CINCE_BILGI olanı hiç görmez.

create table if not exists urun_aday (
  id              text primary key default gen_random_uuid()::text,
  -- Bizim katalog SKU'muz — düzenlenebilir. Faturadaki orijinal kod
  -- `fatura_sku`da sabit kalır; parti bağı (cfo_yoldaki_kalem.sku) oradan kurulur,
  -- yeniden adlandırma o bağı koparmaz.
  sku             text not null unique,
  fatura_sku      text,
  kaynak          text,
  invoice_ad      text,
  ad_tr           text,
  marka           text,
  kategori        text,
  aciklama        text,
  aciklama_1688   text,
  ozellikler      jsonb not null default '{}'::jsonb,
  barkod          text,
  mensei          text,
  garanti_ay      integer,
  adet            integer,
  alis_rmb        numeric(12,4),
  birim_usd       numeric(12,4),
  gumruklu_usd    numeric(12,4),
  agirlik_kg      numeric(10,3),
  kutu_en_cm      numeric(8,2),
  kutu_boy_cm     numeric(8,2),
  kutu_yuk_cm     numeric(8,2),
  satis_try       numeric(12,2),
  kargo_try       numeric(10,2),
  link_1688       text,
  durum           text not null default 'TASLAK'
                  check (durum in ('TASLAK', 'HAZIR', 'LISTELENDI', 'REDDEDILDI')),
  red_sebep       text,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table urun_aday is 'İlan açılacak yeni ürünler. Puanı 90+ olmadan ilan oluşturulmaz.';
comment on column urun_aday.ad_tr is 'Pazaryeri başlığı. Hepsiburada kuralı: marka ile başlamalı.';

create table if not exists urun_aday_gorsel (
  id          bigserial primary key,
  aday_id     text not null references urun_aday(id) on delete cascade,
  url         text not null,
  tur         text not null check (tur in ('URUN', 'CINCE_BILGI', 'INFO_TR', 'PAKET')),
  sira        integer not null default 0,
  dosya_adi   text,
  boyut_bayt  bigint,
  created_at  timestamptz not null default now()
);

create index if not exists urun_aday_gorsel_aday_idx on urun_aday_gorsel (aday_id, tur, sira);

comment on column urun_aday_gorsel.tur is
  'CINCE_BILGI ilana ASLA girmez. İlan/Excel çıktısı yalnız URUN, INFO_TR, PAKET alır.';
-- Sıra aday GENELİNDE tek tutulur, tür bazında değil. Sebep: pazaryerleri
-- "Görsel 1"i ana görsel sayar, dolayısıyla ANA GÖRSEL = ilan sırasının ilki.
-- Ayrı bir `ana_gorsel` bayrağı tutsaydık bayrak ile sıra çelişebilirdi.
comment on column urun_aday_gorsel.sira is
  'Aday içinde TEK sıra. İlan sırası = CINCE_BILGI hariç, sira artan. Ana görsel = ilki.';

-- Puanlama: ağırlıklar "ilanı fiilen ne bloke ediyor"a göre. Görselsiz ilan hiç
-- açılmaz (17), marjı hesaplanamayan ürün fiyatlanamaz (10).
-- BARKOD PUANLANMAZ: 151 ürünün hiçbirinde yok; kimsenin sağlayamadığı bir şart
-- herkesi eşit bloke eder, ayırt etmez. Alan formda durur, sadece puana girmez.
-- Toplam 100; eşik 90 — en çok 10 puanlık eksik affedilir.
drop view if exists urun_aday_skor;
drop view if exists urun_aday_puan;

create view urun_aday_puan as
with g as (
  select aday_id,
         count(*) filter (where tur in ('URUN', 'PAKET'))  as urun_gorsel,
         count(*) filter (where tur = 'CINCE_BILGI')       as cince_gorsel,
         count(*) filter (where tur = 'INFO_TR')           as info_gorsel
    from urun_aday_gorsel group by aday_id
)
select
  a.*,
  coalesce(g.urun_gorsel, 0)   as urun_gorsel,
  coalesce(g.cince_gorsel, 0)  as cince_gorsel,
  coalesce(g.info_gorsel, 0)   as info_gorsel,
  (case when length(coalesce(a.ad_tr, '')) >= 20 then 12 else 0 end)          as p_ad,
  (case when coalesce(a.marka, '') <> '' then 5 else 0 end)                   as p_marka,
  (case when coalesce(a.kategori, '') <> '' then 9 else 0 end)                as p_kategori,
  (case when length(coalesce(a.aciklama, '')) >= 400 then 15
        when length(coalesce(a.aciklama, '')) >= 150 then 7 else 0 end)       as p_aciklama,
  (case when coalesce(g.urun_gorsel, 0) >= 1 then 17 else 0 end)              as p_ana_gorsel,
  (case when coalesce(g.urun_gorsel, 0) >= 3 then 10 else 0 end)              as p_gorsel3,
  (case when coalesce(a.satis_try, 0) > 0 then 10 else 0 end)                 as p_fiyat,
  (case when coalesce(a.birim_usd, 0) > 0 and coalesce(a.agirlik_kg, 0) > 0
        then 10 else 0 end)                                                   as p_maliyet,
  (case when coalesce(a.kutu_en_cm, 0) > 0 and coalesce(a.kutu_boy_cm, 0) > 0
         and coalesce(a.kutu_yuk_cm, 0) > 0 then 6 else 0 end)                as p_kutu,
  (case when coalesce(a.mensei, '') <> '' and coalesce(a.garanti_ay, 0) > 0
        then 6 else 0 end)                                                    as p_mensei
from urun_aday a
left join g on g.aday_id = a.id;

create view urun_aday_skor as
select
  p.*,
  (p.p_ad + p.p_marka + p.p_kategori + p.p_aciklama + p.p_ana_gorsel + p.p_gorsel3
   + p.p_fiyat + p.p_maliyet + p.p_kutu + p.p_mensei)::int as puan,
  -- Eksikler adıyla listelenir: "puan 62" tek başına ne yapılacağını söylemez.
  array_remove(array[
    case when p.p_ad = 0        then 'Türkçe ad (en az 20 karakter)' end,
    case when p.p_marka = 0     then 'Marka' end,
    case when p.p_kategori = 0  then 'Kategori' end,
    case when p.p_aciklama < 15 then 'Açıklama (400+ karakter)' end,
    case when p.p_ana_gorsel = 0 then 'Ürün görseli' end,
    case when p.p_gorsel3 = 0   then 'En az 3 ürün görseli' end,
    case when p.p_fiyat = 0     then 'Satış fiyatı' end,
    case when p.p_maliyet = 0   then 'Birim maliyet + ağırlık' end,
    case when p.p_kutu = 0      then 'Kutu ölçüsü (desi)' end,
    case when p.p_mensei = 0    then 'Menşei + garanti süresi' end
  ], null) as eksikler
from urun_aday_puan p;

comment on view urun_aday_skor is
  'Ürün adayı hazırlık puanı (0-100) ve eksik kalemler. 90+ olmadan ilan açılmaz.';

-- Görsel kovası (Supabase Storage). Panelden yükleme service_role ile yapılır;
-- anonim yazma politikası BİLEREK açılmadı — kova herkese okunur olur.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('urun-gorsel', 'urun-gorsel', true, 10485760,
        array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;
