-- Ürün açıklamasını BAŞLIKTAN üretir.
--
-- NEDEN FONKSİYON: 151 adayın açıklaması elle yazılacak olsa gerçekçi değildi
-- (puanda 15 puan, ilana çıkmanın önündeki en büyük tek kalem). Fonksiyon olması
-- gelecek partilerde de çalışmasını sağlıyor — yeni konteyner geldiğinde tek
-- UPDATE yeter.
--
-- UYDURMA YOK — TASARIMIN ÖZÜ BU. Açıklama yalnız BAŞLIKTA GEÇEN nitelikleri
-- yazar: malzeme, kaplama, montaj tipi, fonksiyonlar, ölçü. Bunlara ek olarak
-- yalnızca veritabanında OLAN ağırlık girer. Garanti süresi, menşei, sertifika,
-- su basıncı, kutu içeriği, kartuş markası — hiçbiri yazılmaz, çünkü bilinmiyor.
-- Marka bile uydurulmaz; `marka` boşsa cümlede geçmez.
--
-- DOLGU YAPILMADI. 124 üründen 66'sı 400 karakteri (tam 15 puan) geçiyor, 58'i
-- 150-399 bandında kalıyor (7 puan). Kalanları 400'e tamamlamak için genel
-- pazarlama cümlesi eklemek mümkündü; eklenmedi. O 58 ürünün başlığı çıplak
-- ("Alfas Çanak Lavabo Bataryası") — anlatacak nitelik yok, uydurmadan
-- uzatılamaz. Gerçek çözüm 1688 açıklamalarının panele yapıştırılması.
--
-- YEDEK PARÇA AYRI: somun, rakor, gövde aksamı pazaryeri ürünü değil (16.000 ve
-- 4.000 adetlik üretim kalemleri). Onlara "yüzeyi bezle silin" demek saçma olurdu;
-- kapanış cümlesi farklı ve kısa kalmaları normal.

create or replace function urun_aciklama_uret(p_ad text, p_marka text, p_kg numeric)
returns text language plpgsql immutable as $$
declare
  t text := coalesce(p_ad, '');
  lt text := lower(translate(t, 'İIÇĞÖŞÜ', 'iıçğöşü'));
  tip text; malzeme text; montaj text; yedek boolean;
  bullets text[] := array[]::text[];
  olcu text; giris text; kapanis text; govde text;
begin
  tip := case
    when lt like '%çanak lavabo batarya%' then 'çanak lavabo bataryası'
    when lt like '%çanak lavabo%'      then 'tezgah üstü çanak lavabo'
    when lt like '%küvet batarya%'     then 'küvet bataryası'
    when lt like '%duş seti%' or lt like '%duş sistemi%' or lt like '%duş batarya%' then 'duş sistemi'
    when lt like '%eviye batarya%' or lt like '%evye batarya%' or lt like '%mutfak batarya%' then 'mutfak eviye bataryası'
    when lt like '%eviye seti%'        then 'mutfak eviye seti'
    when lt like '%eviyesi%'           then 'mutfak eviyesi'
    when lt like '%ankastre%'          then 'ankastre lavabo bataryası'
    when lt like '%lavabo batarya%'    then 'lavabo bataryası'
    when lt like '%somun%' or lt like '%rakor%' or lt like '%aksam%' or lt like '%gövdesi%'
                                       then 'batarya yedek parçası'
    else 'banyo armatürü' end;
  yedek := (tip = 'batarya yedek parçası');

  malzeme := case
    when lt like '%304%' or lt like '%sus304%' then '304 paslanmaz çelik'
    when lt like '%pirinç%'                     then 'pirinç'
    when lt like '%zamak%'                      then 'zamak (çinko alaşım) enjeksiyon döküm'
    else null end;

  montaj := case
    when lt like '%sıva altı%'      then 'Sıva altı (ankastre) montaj'
    when lt like '%duvara monte%'   then 'Duvara monte'
    when lt like '%yerden montaj%'  then 'Yerden montajlı, serbest duran'
    when lt like '%tezgah üstü - tezgah altı%' or lt like '%tezgah üstü tezgah altı%'
                                    then 'Tezgah üstü veya tezgah altı montaj'
    when lt like '%tezgah üstü%'    then 'Tezgah üstü montaj'
    else null end;

  if malzeme = '304 paslanmaz çelik' then
    bullets := bullets || '304 paslanmaz çelik gövde — paslanmaya ve lekeye karşı dayanıklı'::text;
  elsif malzeme = 'pirinç' then
    bullets := bullets || 'Pirinç gövde — uzun ömürlü ve dayanıklı'::text;
  elsif malzeme is not null then
    bullets := bullets || ('Zamak (çinko alaşım) enjeksiyon döküm gövde')::text;
  end if;

  if lt like '%krom kap%'       then bullets := bullets || 'Krom kaplama'::text; end if;
  if lt like '%pvd%'            then bullets := bullets || 'PVD kaplama'::text; end if;
  if montaj is not null         then bullets := bullets || montaj::text; end if;
  if lt like '%termostatik%'    then bullets := bullets || 'Termostatik kumanda — su sıcaklığı sabit tutulur'::text; end if;
  if lt like '%fotoselli%' or lt like '%sensörlü%' then bullets := bullets || 'Fotoselli sensör ile temassız kullanım'::text; end if;
  if lt like '%pilli%'          then bullets := bullets || 'Pille çalışır'::text; end if;
  if lt like '%led%'            then bullets := bullets || 'LED göstergeli'::text; end if;
  if lt like '%dijital ekran%'  then bullets := bullets || 'Dijital ekran'::text; end if;
  if lt like '%1080%'           then bullets := bullets || '1080° döner gövde'::text;
  elsif lt like '%360%'         then bullets := bullets || '360° döner gövde'::text; end if;
  if lt like '%spiralli%' or lt like '%çekmeli%' or lt like '%çekilebilir%' or lt like '%pull out%'
                                then bullets := bullets || 'Çekmeli (spiralli) başlık — eviyenin her noktasına ulaşır'::text; end if;
  if lt like '%şelale%'         then bullets := bullets || 'Şelale akış'::text; end if;
  if lt like '%yağmur%'         then bullets := bullets || 'Yağmurlama duş başlığı'::text; end if;
  if lt like '%el duş%'         then bullets := bullets || 'El duşu dahil'::text; end if;
  if lt like '%masaj jet%' or lt like '%sırt masaj%' then bullets := bullets || 'Sırt masaj jetleri'::text; end if;
  if lt like '%arıtmalı%'       then bullets := bullets || 'Arıtma su çıkışı (ayrı hat)'::text; end if;
  if lt like '%bardak yıka%'    then bullets := bullets || 'Bardak yıkama aparatı'::text; end if;
  if lt like '%sabunluk%'       then bullets := bullets || 'Sabunluk dahil'::text; end if;
  if lt like '%seramik kartuş%' or lt like '%seramik valf%'
                                then bullets := bullets || 'Seramik kartuş — damlamaya karşı sızdırmaz'::text; end if;
  if lt like '%aç kapa%'        then bullets := bullets || 'Aç-kapa tek kollu kullanım'::text;
  elsif lt like '%tek kollu%'   then bullets := bullets || 'Tek kollu kullanım'::text; end if;
  if lt like '%sıcak soğuk%'    then bullets := bullets || 'Sıcak ve soğuk su karıştırmalı'::text; end if;
  if lt ~ '[0-9]+ ?(fonksiyonlu|modlu|buton)' then
    bullets := bullets || (substring(t from '[0-9]+ ?(?:[FfMmBb][a-zçğıöşüA-ZÇĞİÖŞÜ]+)') || ' kullanım')::text;
  end if;
  if lt like '%kristal taş%'    then bullets := bullets || 'Kristal taş detaylı tasarım'::text; end if;
  if lt like '%nano%'           then bullets := bullets || 'Nano yüzey — çizilmeye ve lekeye dirençli'::text; end if;
  if lt like '%leke tutmaz%'    then bullets := bullets || 'Leke tutmaz yüzey'::text; end if;

  -- Ölçü yalnız başlıkta yazıyorsa; uydurulmaz.
  olcu := substring(t from '[0-9]+(?:[.,][0-9]+)? ?[xX×] ?[0-9]+(?:[.,][0-9]+)? ?(?:cm|mm)?');
  if olcu is null then olcu := substring(t from '[0-9]{2,3} ?cm'); end if;
  if olcu is not null then bullets := bullets || ('Ölçü: ' || olcu)::text; end if;

  if coalesce(p_kg,0) > 0 then
    bullets := bullets || ('Ürün ağırlığı: '
      || replace(trim(to_char(p_kg, 'FM999990.00')), '.', ',') || ' kg')::text;
  end if;

  giris := t || '.' || case
    when malzeme is not null then ' ' || malzeme || ' gövdeli bu ' || tip || ', '
    else ' Bu ' || tip || ', ' end
    || case
      when tip in ('lavabo bataryası','çanak lavabo bataryası','ankastre lavabo bataryası')
        then 'banyo lavabolarında günlük kullanım için tasarlandı.'
      when tip in ('mutfak eviye bataryası','mutfak eviye seti','mutfak eviyesi')
        then 'mutfak eviyelerinde günlük kullanım için tasarlandı.'
      when tip = 'duş sistemi'  then 'banyo duş alanı için eksiksiz bir set olarak sunulur.'
      when tip = 'küvet bataryası' then 'küvet dolumu ve duş kullanımı için tasarlandı.'
      when tip = 'tezgah üstü çanak lavabo' then 'banyo tezgahınızın üzerine oturtularak kullanılır.'
      when yedek then 'armatür üretimi ve montajında kullanılan bir yedek parçadır.'
      else 'banyo kullanımı için tasarlandı.' end;

  govde := array_to_string(array(select '• ' || u from unnest(bullets) u), E'\n');

  kapanis := case
    when yedek then 'Perakende satış için değil, üretim ve servis kullanımı içindir.'
    when malzeme = '304 paslanmaz çelik'
      then 'Yüzeyi yumuşak ve nemli bir bezle silin; aşındırıcı veya klor içeren temizleyiciler kaplamaya zarar verebilir.'
    when lt like '%pvd%'
      then 'PVD kaplamalı yüzeyi yumuşak bir bezle silin; aşındırıcı temizleyici kullanmayın.'
    else 'Yüzeyi yumuşak ve nemli bir bezle silin; aşındırıcı temizleyici kullanmayın.' end;

  return giris || E'\n\nÖne çıkan özellikler:\n' || govde || E'\n\n' || kapanis;
end $$;

comment on function urun_aciklama_uret(text, text, numeric) is
  'Ürün açıklamasını BAŞLIKTAN üretir. Yalnız başlıkta geçen nitelikleri ve '
  'veritabanındaki ağırlığı yazar; garanti, menşei, sertifika, basınç, kutu '
  'içeriği gibi bilinmeyen hiçbir şey uydurulmaz.';

-- Boş olanları doldur. Elle yazılmış açıklamaya ve katalogdaki ürüne dokunulmaz.
update urun_aday a
   set aciklama = urun_aciklama_uret(a.ad_tr, a.marka, a.agirlik_kg),
       updated_at = now()
 where coalesce(a.ad_tr,'') <> ''
   and coalesce(a.aciklama,'') = ''
   and not exists (select 1 from urun_aday_katalog k where k.aday_id = a.id);
