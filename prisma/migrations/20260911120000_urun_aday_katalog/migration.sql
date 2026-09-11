-- Ürün adaylarını KATALOGLA eşleştir.
--
-- HATA: "Yeni Ürünler" listesi 07.26sea konteynerindeki 151 kalemin hepsini
-- "yeni" sayıyordu. Katalog kontrolü hiç uygulanmamıştı — SKU'su BİREBİR aynı
-- olan 3 ürün bile listede duruyordu (4902837173724 "Dijital Akıllı Eviye Seti"
-- gibi). Alperen fark etti: "bizim zaten sattığımız ürün ama yeni gibi koymuşsun".
-- Gerçek sayı: 151 adayın 24'ü katalogda ve hepsi aktif.
--
-- NEDEN SÜTUN DEĞİL GÖRÜNÜM: eşleşmeyi `urun_aday`a yazılan bir sütunda
-- tutsaydık katalog değiştiğinde bayatlardı — asıl hata da zaten bir kereye
-- mahsus yapılıp bir daha bakılmamasıydı. Burada her okumada yeniden hesaplanıyor.
--
-- EŞLEŞTİRME KURALI: SKU'nun en uzun rakam dizisi. Faturadaki kod katalog
-- kodunun önüne harf alıyor ("426M-4267192047364" ↔ "4267192047364"), o yüzden
-- birebir karşılaştırma yetmiyor. En az 6 haneli dizi aranıyor; 10-13 haneli
-- kodlarda rastlantısal çakışma pratikte imkânsız.
--
-- İSİM BENZERLİĞİ BİLEREK KULLANILMADI: "Spiralli Mutfak Eviye Bataryası Siyah"
-- iki farklı SKU'da da geçiyor ve bunlar aynı ürün değil, varyant. İsimden
-- eşleştirmek yanlış pozitif üretir; karar insana bırakılıyor.

create or replace function urun_aday_sku_num(s text) returns text
language sql immutable as $$
  select x[1] from regexp_matches(coalesce(s, ''), '(\d{6,})', 'g') as m(x)
   order by length(x[1]) desc limit 1;
$$;

comment on function urun_aday_sku_num(text) is
  'SKU içindeki en uzun (>=6 haneli) rakam dizisi. Katalog eşleştirmesinin anahtarı.';

create or replace view urun_aday_katalog as
select
  a.id                as aday_id,
  a.sku               as aday_sku,
  p.id                as product_id,
  p.sku               as katalog_sku,
  p.name              as katalog_ad,
  p."isActive"        as katalog_aktif
from urun_aday a
join "Product" p
  on urun_aday_sku_num(p.sku) = urun_aday_sku_num(a.sku)
 and urun_aday_sku_num(a.sku) is not null;

comment on view urun_aday_katalog is
  'Aday ↔ katalog eşleşmesi, SKU rakam çekirdeğinden. Canlı hesaplanır, bayatlamaz.';

drop view if exists urun_aday_skor;
drop view if exists urun_aday_puan;

create view urun_aday_puan as
with g as (
  select aday_id,
         count(*) filter (where tur in ('URUN', 'PAKET'))  as urun_gorsel,
         count(*) filter (where tur = 'CINCE_BILGI')       as cince_gorsel,
         count(*) filter (where tur = 'INFO_TR')           as info_gorsel
    from urun_aday_gorsel group by aday_id
),
k as (
  -- Bir adayın birden çok katalog kaydına düşmesi teorik olarak mümkün;
  -- ilkini alıyoruz ama kaç tane olduğunu da taşıyoruz ki gizli kalmasın.
  select aday_id,
         min(katalog_sku)   as katalog_sku,
         min(katalog_ad)    as katalog_ad,
         count(*)::int      as katalog_eslesme
    from urun_aday_katalog group by aday_id
)
select
  a.*,
  coalesce(g.urun_gorsel, 0)   as urun_gorsel,
  coalesce(g.cince_gorsel, 0)  as cince_gorsel,
  coalesce(g.info_gorsel, 0)   as info_gorsel,
  k.katalog_sku,
  k.katalog_ad,
  coalesce(k.katalog_eslesme, 0) as katalog_eslesme,
  (k.katalog_sku is not null)    as katalogda_var,
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
left join g on g.aday_id = a.id
left join k on k.aday_id = a.id;

create view urun_aday_skor as
select
  p.*,
  (p.p_ad + p.p_marka + p.p_kategori + p.p_aciklama + p.p_ana_gorsel + p.p_gorsel3
   + p.p_fiyat + p.p_maliyet + p.p_kutu + p.p_mensei)::int as puan,
  -- Eksikler adıyla listelenir: "puan 62" tek başına ne yapılacağını söylemez.
  -- Katalogda olan üründe eksik listelenmez: yapılacak iş yeni ilan açmak değil,
  -- gelen malı mevcut ilana stok olarak eklemek.
  case when p.katalog_sku is not null then array[]::text[] else
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
  ], null) end as eksikler
from urun_aday_puan p;

comment on view urun_aday_skor is
  'Ürün adayı hazırlık puanı (0-100), eksikler ve katalog eşleşmesi. '
  'katalogda_var = true ise YENİ İLAN AÇILMAZ; ürün zaten satışta, gelen mal stoktur.';
