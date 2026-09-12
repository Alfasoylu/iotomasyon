-- XML stok hareketinden satış sinyali — satış verisi yüklenmeyen günleri kapatır.
--
-- SORUN: satış listesi Entegra'dan HAFTALIK, elle yükleniyor. İki yükleme
-- arasında sistem satış görmüyor ve bu sessizce yanlış sonuç üretiyor:
-- 12.09 denetiminde ölü stok listesinin en büyük kırmızı kalemi (AL-CAM03,
-- 940.900 TL bağlı sermaye) "90 günde hiç satmadı" diyordu — oysa son 30 günde
-- satmıştı, veri henüz yüklenmemişti. "Elden çıkar" kararı bu satıra bakılarak
-- verilecekti.
--
-- ÇÖZÜM: Entegra XML'i her gece 02:31'de stok sayılarını çekiyor ve farkları
-- `XmlStockChangeLog`'a yazıyor. Stok AZALMASI = satış, ARTMASI = iade ya da
-- stok girişi. Bu, satış verisi gelene kadar geçerli bir vekil ölçüdür.
--
-- KALİBRASYON (20.08–06.09, 18 gün, ölçüldü):
--   gerçek satış 1.338 adet · XML azalışı 1.320 adet → **%98,7**
--   Günlük korelasyon 0,56 · ortalama sapma 21,7 adet.
-- Yani GÜNLÜK gürültülü ama HAFTALIK toplamda birebir. Haftalık yükleme
-- temposuna tam uyuyor. `cfo_xml_kalibrasyon` bunu her okumada yeniden ölçer —
-- oran bozulursa vekil ölçüye güvenmeyi bırakmak gerekir.
--
-- BİR GÜN KAYDIRMA: senkron 02:31'de çalıştığı için gördüğü hareket BİR ÖNCEKİ
-- güne aittir. Ölçüldü: kaydırmasız korelasyon 0,19 · kaydırmalı 0,56.
--
-- EŞİKLER VERİDEN SEÇİLDİ, uydurulmadı. 2.485 hareketin dağılımı:
--   azalış 1-5: 2.015 · 6-20: 199 · 21-100: 82 · 100 üstü: SADECE 4
--   artış 1-5: 137 · 6-100: 38 · 100 üstü: 10
-- 100'de net bir kopuş var; üstü toplu düzeltme/konteyner girişi, satış değil.
--
-- NE YAPMAZ: XML adet verir, PARA vermez. Ciro üretmez. Tahmini tutar ayrı
-- sütunda ve "tahmini" etiketiyle durur; gerçek ciroyla toplanmaz.

-- ── 1. Sınıflandırılmış hareketler ──────────────────────────────────────────
create or replace view cfo_xml_hareket as
select
  l."productId"                                  as product_id,
  p.sku,
  ("syncedAt"::date - 1)                         as is_gunu,
  l."syncedAt",
  l."previousQty"                                as onceki,
  l."newQty"                                     as yeni,
  l.delta,
  case
    when l.delta between -100 and -1 then 'SATIS'
    when l.delta < -100              then 'TOPLU_DUZELTME'
    when l.delta between 1 and 5     then 'IADE_VEYA_GIRIS'
    else 'STOK_GIRISI'
  end                                            as hareket_turu,
  case when l.delta between -100 and -1 then -l.delta else 0 end as satis_adet
from "XmlStockChangeLog" l
join "Product" p on p.id = l."productId";

comment on view cfo_xml_hareket is
  'XML stok farklarının sınıflandırılmış hâli. is_gunu = syncedAt - 1 gün '
  '(senkron 02:31''de çalışır, önceki günü görür — ölçüldü). '
  'Azalış>100 ve artış>5 satış sayılmaz: toplu düzeltme/stok girişi.';

-- ── 2. Gün bazında veri kapsamı ─────────────────────────────────────────────
-- "Bu günün satış rakamı nereden geliyor?" sorusunun tek cevabı. Panel ve CFO
-- ajanı bunu okuyup bayat dönemi GÖRÜNÜR kılmalı; sessiz boşluk yanlış karar üretir.
create or replace view cfo_satis_kapsam as
with gunler as (
  select generate_series(current_date - 120, current_date, '1 day')::date as gun
),
satis as (
  select "orderDate"::date as gun, sum(adet_duz)::int as adet, sum(tutar_duz)::numeric as tutar
    from cfo_satis_birim_duz group by 1
),
xml as (
  select is_gunu as gun, sum(satis_adet)::int as adet, count(*)::int as hareket
    from cfo_xml_hareket where hareket_turu = 'SATIS' group by 1
)
select
  g.gun,
  coalesce(s.adet, 0)                            as satis_adet,
  round(coalesce(s.tutar, 0))                    as satis_tutar,
  coalesce(x.adet, 0)                            as xml_adet,
  coalesce(x.hareket, 0)                         as xml_hareket,
  (s.adet is not null)                           as satis_verisi_var,
  (x.adet is not null)                           as xml_sinyali_var,
  case
    when s.adet is not null then 'SATIS_VERISI'
    when x.adet is not null then 'XML_SINYALI'
    else 'VERI_YOK'
  end                                            as kaynak
from gunler g
left join satis s on s.gun = g.gun
left join xml   x on x.gun = g.gun;

comment on view cfo_satis_kapsam is
  'Gün gün: satış rakamı gerçek veriden mi, XML vekil ölçüsünden mi geliyor. '
  'kaynak=XML_SINYALI olan günlerde ciro YOKTUR, yalnız adet sinyali vardır.';

-- ── 3. Kalibrasyon — vekil ölçü hâlâ güvenilir mi ───────────────────────────
-- Tek seferlik bir doğrulama değil: her okumada yeniden hesaplanır. Oran
-- %80-120 bandından çıkarsa XML sinyaline güvenmeyi bırak.
create or replace view cfo_xml_kalibrasyon as
with ortak as (
  select k.gun, k.satis_adet, k.xml_adet
    from cfo_satis_kapsam k
   where k.satis_verisi_var and k.xml_sinyali_var
     and k.gun >= current_date - 60
)
select
  count(*)::int                                                as gun_sayisi,
  sum(satis_adet)::int                                         as gercek_adet,
  sum(xml_adet)::int                                           as xml_adet,
  round(100.0 * sum(xml_adet) / nullif(sum(satis_adet), 0), 1) as xml_gercegin_yuzdesi,
  round(corr(satis_adet, xml_adet)::numeric, 3)                as gunluk_korelasyon,
  round(avg(abs(satis_adet - xml_adet))::numeric, 1)           as ort_mutlak_sapma,
  (sum(xml_adet) between sum(satis_adet) * 0.8 and sum(satis_adet) * 1.2) as guvenilir
from ortak;

comment on view cfo_xml_kalibrasyon is
  'XML vekil ölçüsünün doğruluğu, son 60 günün ÖRTÜŞEN günlerinde ölçülür. '
  'guvenilir=false ise XML sinyaline dayanan her sonuç şüphelidir.';

-- ── 4. Ürün bazında son hareket ─────────────────────────────────────────────
create or replace view cfo_xml_urun_hareket as
select
  sku,
  sum(satis_adet) filter (where is_gunu >= current_date - 30)::int as xml_30g,
  sum(satis_adet) filter (where is_gunu >= current_date - 90)::int as xml_90g,
  max(is_gunu) filter (where hareket_turu = 'SATIS')               as xml_son_satis,
  sum(delta)    filter (where hareket_turu in ('IADE_VEYA_GIRIS','STOK_GIRISI')
                          and is_gunu >= current_date - 30)::int   as xml_giris_30g
from cfo_xml_hareket
group by sku;

comment on view cfo_xml_urun_hareket is
  'Ürün bazında XML hareket özeti. Ölü stok kurallarında "hiç satmadı" '
  'iddiasını çürütmek için kullanılır.';
