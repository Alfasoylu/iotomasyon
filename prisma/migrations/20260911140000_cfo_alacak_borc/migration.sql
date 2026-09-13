-- Ödeme Takvimi üst şeridi: toplam alacak ve toplam borç, kalem kalem.
--
-- NEDEN: takvim gün gün "ne girecek / ne çıkacak" gösteriyordu ama "toplamda
-- kimden ne alacağım, kime ne borcum var" sorusunun cevabı hiçbir yerde tek
-- bakışta yoktu. Alperen istedi.
--
-- BORÇ NEDEN `cfo_servet_kalem`'DEN OKUNUYOR: borç modelini ikinci kez kurmak
-- iki ekranın birbiriyle çelişmesi demekti. Servet görünümü kural el kitabında
-- (§4E) tek doğru kaynak ilan edildi; burası ondan okur, kendi hesabını yapmaz.
--
-- MÜKERRER SAYIM TUZAĞI: `cfo_cash_event`'teki KREDI_TAKSITI (1,12 M) ve
-- KART_ODEMESI (1,20 M) satırları takvimde görünür ama BORÇ TOPLAMINA GİRMEZ —
-- onlar kredi bakiyesinin (3,53 M) ve kart borcunun (2,03 M) içinden ödenecek
-- taksitlerdir. Taksitleri ayrıca eklemek aynı borcu iki kez saymak olurdu.
--
-- SABİT GİDER NEDEN BORÇ DEĞİL: takvimdeki 993.700 TL sabit gider gelecekte
-- doğacak bir gider; bugün itibarıyla bir yükümlülük değil. Toplama katılmaz,
-- ekranda ayrıca not olarak gösterilir.

create or replace view cfo_alacak_borc as
-- ── ALACAK: pazaryeri hakedişleri, kanal kanal ───────────────────────────────
-- Toplamı `cfo_servet_kalem`'deki "Alacaklar (pazaryeri hakedis)" satırıyla
-- birebir aynı; burada yalnız kanala bölünüyor.
select
  'ALACAK'::text                                                      as tur,
  r.channel                                                           as kalem,
  sum(r."amountTry")                                                  as tutar,
  count(*)::int                                                       as adet,
  coalesce(sum(r."amountTry") filter (where r.certainty::text = 'KESIN'), 0)
                                                                      as kesin_tutar,
  min(r."dueDate")::date                                              as en_yakin,
  'cfo_receivable — tahsil edilmemiş'::text                           as kaynak,
  'YUKSEK'::text                                                      as guven
from cfo_receivable r
where not r."isCollected"
group by r.channel

union all

-- ── BORÇ: servet görünümünün borç kalemleri ──────────────────────────────────
-- Krediler (kalan anapara) · Kredi kartları (toplam borç) · yoldaki malın
-- ödenmemiş gümrük/navlunu. Tutarlar orada eksi tutuluyor, burada mutlak değer.
select
  'BORC'::text,
  k.kalem,
  abs(k.tutar),
  null::int,
  0::numeric,
  null::date,
  k.kaynak,
  k.guven
from cfo_servet_kalem k
where k.tur = 'BORC';

comment on view cfo_alacak_borc is
  'Ödeme Takvimi üst şeridi: kanal bazlı alacak + kalem bazlı borç. '
  'Borç tarafı cfo_servet_kalem''den okunur — tek doğru kaynak orası. '
  'Kredi/kart TAKSİTLERİ toplama girmez: bakiyenin içinden ödenirler.';
