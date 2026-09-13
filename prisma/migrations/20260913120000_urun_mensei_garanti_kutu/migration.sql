-- Menşei CN, garanti 24 ay, kutu ölçüleri — Alperen kararı 13.09.2026.
--
-- Menşei ve garanti kararı kullanıcınındır, tartışma yok: hepsi CN / 24 ay.
--
-- KUTU ÖLÇÜSÜ BAŞKA BİR ŞEY. Beyan edilen desi pazaryerinin keseceği kargo
-- ücretini belirler: az beyan edersen yeniden tartıp fark keserler, çok beyan
-- edersen her gönderide fazla ödersin. Yani buraya yazılan sayı doğrudan paradır.
--
-- GERÇEK ÖLÇÜ YALNIZ 6 ÜRÜNDE VARDI:
--   AS304167                      — elle girilmiş, 20x10x10  → OLCULDU
--   Qunzh-441358096123/441469075030 — faturada 41,5x21,5x5,5 → FATURADAN
--   AURA5939G/NMBG/ROSE           — faturada ürün 596*396*110 mm, +4 cm pay → FATURADAN
-- Kalan 141'i uydurmak yerine TÜRETTİM ve türetildiğini KAYDETTİM: yeni
-- `kutu_kaynak` sütunu OLCULDU / FATURADAN / TAHMINI değerini taşır. İşaretsiz
-- bıraksaydım bir sonraki pazaryeri ihracı tahmini ölçülmüş gibi gönderirdi.
--
-- TAHMİN KURALI (`urun_kutu_tahmin`), çapası gerçek kayıt:
--   • Çanak lavabo → başlıktaki ürün ölçüsü + 5 cm pay, yükseklik 15
--   • Yerden montajlı küvet bataryası → 115x20x20 (faturada 113 cm yazıyor)
--   • Duş sistemi → paketli yoğunluk 0,4 kg/L, oran 5 : 1,5 : 1 (uzun kutu)
--   • Batarya ve diğerleri → aynı yoğunluk, oran 2 : 1 : 1
--   Çapa: AS304167 0,80 kg → 20x10x10. Kural bu kaydı BİREBİR üretiyor.
--
-- HANGİ TAHMİN PARAYA DÖNÜYOR — ölçüldü, varsayılmadı. Kargo max(desi, ağırlık)
-- üzerinden kesilir, yani ağırlığın desiyi aştığı üründe kutu ölçüsü faturayı
-- DEĞİŞTİRMEZ. 147 kutulu üründe sayım (desi > ağırlık mı?):
--   Çanak lavabo    13 ürün — 13'ünde DESİ belirleyici  (10'u TAHMINI)
--   Küvet bataryası  7 ürün —  6'sında DESİ belirleyici  ( 6'sı TAHMINI)
--   Batarya/diğer  116 ürün —  2'sinde DESİ belirleyici  (ikisi de FATURADAN)
--   Duş sistemi     11 ürün —  0'ında DESİ belirleyici
-- Toplam 21 üründe desi belirleyici; 5'inin ölçüsü gerçek (faturadan). Geriye
-- ELLE ÖLÇÜLMESİ GEREKEN 16 ÜRÜN kalıyor — panel tam olarak o 16'yı işaretliyor.
-- Kalan 131 tahminin kargo faturasına etkisi yok.

alter table urun_aday
  add column if not exists kutu_kaynak text
    check (kutu_kaynak in ('OLCULDU','FATURADAN','TAHMINI'));

comment on column urun_aday.kutu_kaynak is
  'Kutu ölçüsü nereden geldi. OLCULDU = fiilen ölçüldü · FATURADAN = faturada '
  'yazıyordu · TAHMINI = ağırlık/ürün ölçüsünden türetildi. TAHMINI olan, desi '
  'ağırlığı aşıyorsa pazaryeri ihracına ÖLÇÜLMEDEN gitmemeli.';

create or replace function urun_kutu_tahmin(p_ad text, p_kg numeric)
returns numeric[] language plpgsql immutable as $$
declare
  t text := coalesce(p_ad,'');
  lt text := lower(translate(t,'İIÇĞÖŞÜ','iıçğöşü'));
  d1 numeric; d2 numeric; vol numeric; s numeric;
begin
  if coalesce(p_kg,0) <= 0 then return null; end if;

  -- ÇANAK LAVABO: ölçü başlıkta yazıyor, kutu = ürün + 5 cm pay.
  if lt like '%çanak lavabo%' and lt not like '%batarya%' then
    d1 := (substring(t from '([0-9]{2,3}) ?[xX×] ?[0-9]{2,3} ?cm'))::numeric;
    d2 := (substring(t from '[0-9]{2,3} ?[xX×] ?([0-9]{2,3}) ?cm'))::numeric;
    if d1 is null then
      d1 := (substring(t from '([0-9]{2,3}) ?cm'))::numeric;
      d2 := d1;                                   -- yuvarlak çanak → kare kutu
    end if;
    if d1 is not null then
      return array[round(d1 + 5), round(d2 + 5), 15];
    end if;
  end if;

  -- YERDEN MONTAJLI KÜVET BATARYASI: faturada 113 cm; uzun kutu.
  if lt like '%küvet batarya%' and lt like '%yerden%' then
    return array[115, 20, 20];
  end if;

  vol := p_kg * 2500;                             -- paketli yoğunluk ~0,4 kg/L

  -- DUŞ SİSTEMİ: uzun kutu, 5 : 1,5 : 1
  if lt like '%duş seti%' or lt like '%duş sistemi%' or lt like '%duş batarya%' then
    s := power(vol / 7.5, 1.0/3.0);
    return array[round(5*s), round(1.5*s), round(s)];
  end if;

  -- BATARYA ve diğerleri: 2 : 1 : 1 (AS304167 çapası — 0,80 kg → 20x10x10)
  s := power(vol / 2.0, 1.0/3.0);
  return array[round(2*s), round(s), round(s)];
end $$;

comment on function urun_kutu_tahmin(text, numeric) is
  'Kutu ölçüsü TAHMİNİ. Çanak lavaboda başlıktaki ürün ölçüsü + 5 cm pay; '
  'diğerlerinde paketli yoğunluk 0,4 kg/L, oran aileye göre. Çapa: AS304167 '
  '0,80 kg -> 20x10x10 (fiilen ölçülmüş kayıt). ÖLÇÜM DEĞİLDİR.';

-- ── Uygulama ────────────────────────────────────────────────────────────────
update urun_aday set mensei = 'CN', garanti_ay = 24, updated_at = now()
 where coalesce(mensei,'') = '' or coalesce(garanti_ay,0) = 0;
update urun_aday set mensei = 'CN' where mensei = 'Çin';

update urun_aday set kutu_kaynak = 'OLCULDU'
 where kutu_kaynak is null and coalesce(kutu_en_cm,0) > 0;

update urun_aday set kutu_en_cm = 41.5, kutu_boy_cm = 21.5, kutu_yuk_cm = 5.5,
                     kutu_kaynak = 'FATURADAN', updated_at = now()
 where sku in ('Qunzh-441358096123','Qunzh-441469075030');

update urun_aday set kutu_en_cm = 64, kutu_boy_cm = 44, kutu_yuk_cm = 15,
                     kutu_kaynak = 'FATURADAN', updated_at = now()
 where sku in ('AURA5939G','AURA5939NMBG','AURA5939ROSE');

update urun_aday a
   set kutu_en_cm  = (urun_kutu_tahmin(a.ad_tr, a.agirlik_kg))[1],
       kutu_boy_cm = (urun_kutu_tahmin(a.ad_tr, a.agirlik_kg))[2],
       kutu_yuk_cm = (urun_kutu_tahmin(a.ad_tr, a.agirlik_kg))[3],
       kutu_kaynak = 'TAHMINI',
       updated_at  = now()
 where coalesce(a.kutu_en_cm,0) = 0
   and coalesce(a.ad_tr,'') <> ''
   and urun_kutu_tahmin(a.ad_tr, a.agirlik_kg) is not null;

-- ── Panel görünümleri ───────────────────────────────────────────────────────
-- `urun_aday_skor` sütun listesini donduruyor (select * değil). kutu_kaynak'ı
-- eklemeden panel sorgusu "column does not exist" ile patlıyordu — deploy
-- öncesi yakalandı. Sütun SONA ekleniyor; `create or replace view` araya
-- sütun sokulmasına izin vermez.
drop view if exists urun_aday_skor;

create or replace view urun_aday_puan as
with g as (
  select aday_id,
         count(*) filter (where tur in ('URUN','PAKET')) as urun_gorsel,
         count(*) filter (where tur = 'CINCE_BILGI')     as cince_gorsel,
         count(*) filter (where tur = 'INFO_TR')         as info_gorsel
    from urun_aday_gorsel group by aday_id
), k as (
  select aday_id,
         min(katalog_sku) as katalog_sku,
         min(katalog_ad)  as katalog_ad,
         count(*)::int    as katalog_eslesme
    from urun_aday_katalog group by aday_id
)
select a.id, a.sku, a.kaynak, a.invoice_ad, a.ad_tr, a.marka, a.kategori,
       a.aciklama, a.aciklama_1688, a.ozellikler, a.barkod, a.mensei,
       a.garanti_ay, a.adet, a.alis_rmb, a.birim_usd, a.gumruklu_usd,
       a.agirlik_kg, a.kutu_en_cm, a.kutu_boy_cm, a.kutu_yuk_cm, a.satis_try,
       a.kargo_try, a.link_1688, a.durum, a.red_sebep, a.note, a.created_at,
       a.updated_at, a.fatura_sku,
       coalesce(g.urun_gorsel, 0)  as urun_gorsel,
       coalesce(g.cince_gorsel, 0) as cince_gorsel,
       coalesce(g.info_gorsel, 0)  as info_gorsel,
       k.katalog_sku, k.katalog_ad,
       coalesce(k.katalog_eslesme, 0) as katalog_eslesme,
       (k.katalog_sku is not null)    as katalogda_var,
       case when length(coalesce(a.ad_tr,'')) >= 20 then 12 else 0 end as p_ad,
       case when coalesce(a.marka,'')    <> '' then 5 else 0 end as p_marka,
       case when coalesce(a.kategori,'') <> '' then 9 else 0 end as p_kategori,
       case when length(coalesce(a.aciklama,'')) >= 400 then 15
            when length(coalesce(a.aciklama,'')) >= 150 then 7
            else 0 end as p_aciklama,
       case when coalesce(g.urun_gorsel,0) >= 1 then 17 else 0 end as p_ana_gorsel,
       case when coalesce(g.urun_gorsel,0) >= 3 then 10 else 0 end as p_gorsel3,
       case when coalesce(a.satis_try,0) > 0 then 10 else 0 end as p_fiyat,
       case when coalesce(a.birim_usd,0) > 0 and coalesce(a.agirlik_kg,0) > 0
            then 10 else 0 end as p_maliyet,
       case when coalesce(a.kutu_en_cm,0) > 0 and coalesce(a.kutu_boy_cm,0) > 0
             and coalesce(a.kutu_yuk_cm,0) > 0 then 6 else 0 end as p_kutu,
       case when coalesce(a.mensei,'') <> '' and coalesce(a.garanti_ay,0) > 0
            then 6 else 0 end as p_mensei,
       a.kutu_kaynak
  from urun_aday a
  left join g on g.aday_id = a.id
  left join k on k.aday_id = a.id;

create view urun_aday_skor as
select p.*,
       p_ad + p_marka + p_kategori + p_aciklama + p_ana_gorsel + p_gorsel3
       + p_fiyat + p_maliyet + p_kutu + p_mensei as puan,
       case when katalog_sku is not null then array[]::text[] else array_remove(array[
         case when p_ad         = 0  then 'Türkçe ad (en az 20 karakter)'::text end,
         case when p_marka      = 0  then 'Marka'::text end,
         case when p_kategori   = 0  then 'Kategori'::text end,
         case when p_aciklama  < 15  then 'Açıklama (400+ karakter)'::text end,
         case when p_ana_gorsel = 0  then 'Ürün görseli'::text end,
         case when p_gorsel3    = 0  then 'En az 3 ürün görseli'::text end,
         case when p_fiyat      = 0  then 'Satış fiyatı'::text end,
         case when p_maliyet    = 0  then 'Birim maliyet + ağırlık'::text end,
         case when p_kutu       = 0  then 'Kutu ölçüsü (desi)'::text end,
         case when p_mensei     = 0  then 'Menşei + garanti süresi'::text end
       ], null) end as eksikler
  from urun_aday_puan p;
