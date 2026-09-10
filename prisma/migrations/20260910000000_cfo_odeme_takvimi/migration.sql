-- CFO / Ödeme takvimi — üç görünüm repoya alınır ve bir hesap hatası düzeltilir.
--
-- Görünümler canlı veritabanında elle oluşturulmuştu, repoda karşılığı yoktu.
-- Buraya taşınıyor ki şema ile canlı aynı kalsın.
--
-- DÜZELTİLEN HATA (cfo_odeme_gunluk.gun_sonu_nakit):
--   Eski tanım gün sonu bakiyesini `min(kalan_nakit)` ile hesaplıyordu. kalan_nakit
--   satır satır yürüyen bakiye; gün içinde önce girişler eklenip sonra çıkışlar
--   düşüldüğü için min() "gün içi en dip nokta"yı verir, gün sonunu değil.
--   Günün son hareketi bir GİRİŞ ise gün sonu bakiyesi olduğundan düşük görünür.
--   Somut etki: 17.09.2026 gerçek gün sonu +51.560 TL iken görünüm -90.705 TL
--   diyordu; "hesap 21 Eylül'e kadar eksi kalıyor" sonucu bu hatadan doğmuştu.
--   Doğrusu: açılış bakiyesi + o güne kadarki kümülatif net.
--   Gün içi dip bilgisi değerli olduğu için silinmiyor, `gun_ici_dip` adıyla
--   ayrı sütuna alınıyor.

-- ── 1) Hareket listesi ─────────────────────────────────────────────────────
create or replace view cfo_yaklasan_odeme as
with nakit as (
  select coalesce(sum("balanceTry"), 0) as b from cfo_bank_account where "isActive" = true
), hareket as (
  select e.id, e."eventDate"::date as tarih, 'CIKIS'::text as yon,
         case e.kind::text
           when 'KREDI_TAKSITI' then 'Kredi taksiti'
           when 'KART_ODEMESI'  then 'Kart ödemesi'
           when 'SABIT_GIDER'   then 'Sabit gider'
           when 'VERGI_GUMRUK'  then 'Vergi / Gümrük'
           else initcap(replace(e.kind::text, '_', ' '))
         end as tur,
         e.description as aciklama, e.bank as banka, e."outflowTry" as tutar,
         e.certainty::text as kesinlik, e."isSettled" as odendi, e.note
    from cfo_cash_event e where coalesce(e."outflowTry", 0) > 0
  union all
  select r.id, r."dueDate"::date, 'GIRIS', 'Pazaryeri tahsilatı',
         r.channel || ' hakediş', r.channel, r."amountTry",
         r.certainty::text, r."isCollected", r.note
    from cfo_receivable r
  union all
  select e.id, e."eventDate"::date, 'GIRIS', 'Diğer tahsilat',
         e.description, e.bank, e."inflowTry",
         e.certainty::text, e."isSettled", e.note
    from cfo_cash_event e where coalesce(e."inflowTry", 0) > 0
)
select id, tarih, yon, tur, aciklama, banka, tutar, kesinlik, odendi, note,
       tarih - current_date as kalan_gun,
       case when odendi then 'ODENDI'
            when tarih < current_date then 'GECIKMIS'
            when tarih = current_date then 'BUGUN'
            when tarih <= current_date + 3 then 'ACIL'
            when tarih <= current_date + 7 then 'BU_HAFTA'
            when tarih <= current_date + 30 then 'BU_AY'
            else 'ILERIDE' end as aciliyet,
       case when yon = 'CIKIS' then -tutar else tutar end as net_etki,
       (select b from nakit)
         + sum(case when yon = 'CIKIS' then -tutar else tutar end)
             over (order by tarih, yon desc, id rows between unbounded preceding and current row)
         as kalan_nakit
  from hareket
 where odendi = false
 order by tarih, yon desc;

-- ── 2) Gün gün özet ────────────────────────────────────────────────────────
create or replace view cfo_odeme_gunluk as
with gun as (
  select tarih,
         count(*) filter (where yon = 'CIKIS') as odeme_adet,
         coalesce(sum(tutar) filter (where yon = 'CIKIS'), 0) as cikacak,
         coalesce(sum(tutar) filter (where yon = 'GIRIS'), 0) as girecek,
         coalesce(sum(net_etki), 0) as net,
         min(kalan_nakit) as gun_ici_dip,
         min(aciliyet) as aciliyet,
         bool_or(yon = 'CIKIS' and kesinlik = 'KESIN') as kesin_odeme_var
    from cfo_yaklasan_odeme
   group by tarih
), acilis as (
  select coalesce(sum("balanceTry"), 0) as b from cfo_bank_account where "isActive" = true
)
select g.tarih,
       g.tarih - current_date as kalan_gun,
       to_char(g.tarih, 'DD.MM.YYYY') as tarih_str,
       case extract(dow from g.tarih)
         when 0 then 'Pazar' when 1 then 'Pazartesi' when 2 then 'Salı'
         when 3 then 'Çarşamba' when 4 then 'Perşembe' when 5 then 'Cuma'
         else 'Cumartesi' end as gun_adi,
       g.odeme_adet, g.cikacak, g.girecek, g.net,
       -- gün sonu = açılış + o güne kadarki kümülatif net (min() DEĞİL)
       (select b from acilis)
         + sum(g.net) over (order by g.tarih rows between unbounded preceding and current row)
         as gun_sonu_nakit,
       g.aciliyet, g.kesin_odeme_var,
       -- gün içi en dip nokta: eski gun_sonu_nakit'in gerçekte ölçtüğü değer.
       -- Sütun sırası bozulmasın diye sona eklenir (create or replace kısıtı).
       g.gun_ici_dip
  from gun g;

-- ── 3) 90 günün en dip noktaları ───────────────────────────────────────────
create or replace view cfo_nakit_dibi as
select tarih, round(kalan_nakit) as kalan_nakit,
       tarih - current_date as kalan_gun,
       to_char(tarih, 'DD.MM.YYYY') as tarih_str
  from cfo_yaklasan_odeme
 where tarih <= current_date + 90
 order by round(kalan_nakit)
 limit 5;
