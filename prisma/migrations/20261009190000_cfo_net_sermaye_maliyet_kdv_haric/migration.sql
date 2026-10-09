-- D-P06 (Alperen 2026-10-09): Product.unitCostTry KDV DAHİL kayıtlı. 20261009170000'deki LCNRV, KDV dahil maliyeti KDV hariç NRV ile
-- karşılaştırıyordu (elma/armut): maliyet %20 şişik → stok ve net sermaye fazla. Alış KDV'si indirilebilir (şirket varlığı, stok değil);
-- karşılaştırma iki tarafta da KDV hariç olmalı: maliyet / 1,2 (NRV'deki %20 yaklaşımıyla aynı). Yalnız stok satırı (3) ve açıklamalar
-- değişir; diğer satırlar, imza, yetkiler 170000 ile birebir. 170000'den SONRA uygulanır.
-- Üretim 09.10 (salt-okuma): stok LCNRV 3.918.459 → 3.370.965 (−547.494 TL); NRV < maliyet SKU 39 → 22; net sermaye 2.900.562 → ~2.353.068.
-- Geri alma: 20261009170000 içindeki cfo_metrik_net_sermaye tanımı.
CREATE OR REPLACE FUNCTION public.cfo_metrik_net_sermaye()
 RETURNS TABLE(sira integer, tur text, kalem text, tutar numeric, aciklama text)
 LANGUAGE sql
 STABLE
AS $function$
WITH h AS (
  SELECT round(COALESCE(sum(GREATEST(b."balanceTry", 0)), 0), 2) AS nakit,
         round(COALESCE(sum(GREATEST(-b."balanceTry", 0)), 0), 2) AS kmh,
         count(*) FILTER (WHERE b."balanceTry" < 0) AS kmh_hesap
    FROM public.cfo_bank_account b WHERE b."isActive" AND b."balanceTry" IS NOT NULL
), a AS (
  SELECT round(COALESCE(sum(r."amountTry"), 0), 2) AS alacak FROM public.cfo_receivable r WHERE NOT r."isCollected"
), s AS (
  SELECT round(COALESCE(sum(CASE WHEN d.deger_kaynagi = 'GERCEKLESEN_SATIS' AND d.birim_maliyet IS NOT NULL
                                   THEN LEAST(d.maliyet_degeri / 1.2, d.stok * (d.birim_net_deger - d.birim_fiyat / 6.0))
                                 WHEN d.deger_kaynagi = 'MALIYET' THEN d.maliyet_degeri / 1.2 END), 0), 2) AS lcnrv,
         count(*) FILTER (WHERE d.deger_kaynagi = 'MALIYET' OR (d.deger_kaynagi = 'GERCEKLESEN_SATIS' AND d.birim_maliyet IS NOT NULL)) AS sku,
         count(*) FILTER (WHERE d.deger_kaynagi = 'GERCEKLESEN_SATIS' AND d.birim_maliyet IS NULL) AS maliyetsiz_sku,
         round(COALESCE(sum(d.stok * (d.birim_net_deger - d.birim_fiyat / 6.0)) FILTER (WHERE d.deger_kaynagi = 'GERCEKLESEN_SATIS' AND d.birim_maliyet IS NULL), 0), 2) AS maliyetsiz_nrv,
         count(*) FILTER (WHERE d.deger_kaynagi = 'GERCEKLESEN_SATIS' AND d.birim_maliyet IS NOT NULL AND d.stok * (d.birim_net_deger - d.birim_fiyat / 6.0) < d.maliyet_degeri / 1.2) AS nrv_alti,
         count(*) FILTER (WHERE d.deger_kaynagi IS DISTINCT FROM 'GERCEKLESEN_SATIS' AND d.deger_kaynagi IS DISTINCT FROM 'MALIYET') AS bilinmeyen_sku,
         COALESCE(sum(d.stok) FILTER (WHERE d.deger_kaynagi IS DISTINCT FROM 'GERCEKLESEN_SATIS' AND d.deger_kaynagi IS DISTINCT FROM 'MALIYET'), 0) AS bilinmeyen_adet
    FROM public.cfo_stok_deger d WHERE d.gercek_stok
), y AS (
  SELECT round(COALESCE(sum(m.odenmis_try), 0), 2) AS odenmis,
         round(COALESCE(sum(m.odenmemis_vergi_try + m.odenmemis_navlun_try), 0), 2) AS taahhut
    FROM public.cfo_yoldaki_mal m WHERE m.risk = 'NORMAL'
), k AS (
  SELECT round(COALESCE(sum(l."remainingTry"), 0), 2) AS kredi FROM public.cfo_loan l WHERE l.status::text = 'AKTIF'
), c AS (
  SELECT round(COALESCE(sum(cc."totalDebtTry"), 0), 2) AS kart FROM public.cfo_credit_card cc WHERE cc."isActive"
)
SELECT v.sira, v.tur, v.kalem, v.tutar, v.aciklama
FROM h, a, s, y, k, c, LATERAL (VALUES
  (1, 'VARLIK', 'Nakit', h.nakit, 'Aktif banka hesaplarinin arti bakiyeleri (eksi bakiye KMH satirinda)'),
  (2, 'VARLIK', 'Alacaklar', a.alacak, 'cfo_receivable, tahsil edilmemis'),
  (3, 'VARLIK', 'Stok (rafta) - KDV haric maliyet ile KDV haric NRV in dusugu', s.lcnrv,
     s.sku || ' SKU; ' || s.nrv_alti || ' SKU NRV maliyetin altinda (NRV ile). Maliyet KDV dahil kayitli (D-P06) -> /1,2; KDV haric NRV = birim net deger - birim fiyat/6 (%20 KDV yaklasimi)'),
  (4, 'VARLIK', 'Yoldaki mal - odenmis kisim', y.odenmis, 'cfo_yoldaki_mal NORMAL; odenmemis gumruk/navlun iki tarafli (net 0), asagida bilgi satiri'),
  (5, 'BORC', 'Krediler (kalan anapara)', -k.kredi, 'cfo_loan AKTIF remainingTry'),
  (6, 'BORC', 'Kredi kartlari (toplam borc)', -c.kart, 'cfo_credit_card totalDebtTry (ekstre + donem ici)'),
  (7, 'BORC', 'Kullanilan KMH', -h.kmh, h.kmh_hesap || ' hesap eksi bakiyede'),
  (90, 'BILGI', 'Degeri bilinmeyen stok (toplama girmedi)', NULL::numeric,
     CASE WHEN s.bilinmeyen_sku > 0 THEN 'BILINMIYOR: ' || s.bilinmeyen_sku || ' SKU, ' || s.bilinmeyen_adet || ' adet (maliyet ve satis kaniti yok); 0 sayilmadi, net sermaye bu kadar eksik olabilir'
          ELSE 'yok' END),
  (91, 'BILGI', 'Yoldaki mal - odenmemis gumruk/navlun (taahhut)', y.taahhut, 'Varlik ve borc tarafinda esit; net sermayeye etkisi 0 (D-P03)'),
  (92, 'BILGI', 'Maliyeti bilinmeyen satan stok (toplama girmedi)', CASE WHEN s.maliyetsiz_sku > 0 THEN s.maliyetsiz_nrv END,
     CASE WHEN s.maliyetsiz_sku > 0 THEN 'BILINMIYOR: ' || s.maliyetsiz_sku || ' SKU satiyor ama birim maliyeti yok; LCNRV hesaplanamaz. Tutar = KDV haric NRV (ust sinir); maliyet girilince toplama girer'
          ELSE 'yok' END),
  (100, 'TOPLAM', 'NET SERMAYE', h.nakit + a.alacak + s.lcnrv + y.odenmis - k.kredi - c.kart - h.kmh,
     'Sozlesme (CFO-001; D-P01 GENIS, D-P02 LCNRV KDV haric iki taraf, D-P03 borc = kredi + kart + KMH, D-P06 maliyet KDV dahil kayitli)')
) AS v(sira, tur, kalem, tutar, aciklama)
ORDER BY v.sira;
$function$;
