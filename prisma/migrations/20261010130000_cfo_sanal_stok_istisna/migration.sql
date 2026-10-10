-- RF-20261010-036 (CRITICAL, 2026-10-10): SANAL STOK net sermayede gerçek stok sayılıyordu.
-- cfo_stok_istisna (insan beyanı; 40005100051: "Stok SANAL ... bağlı sermaye SANAL", gerçek bağlı 9.700 TL — Alperen 31.08,
-- uygulamada teyit 07.09) yalnız ölü stok kurallarında uygulanıyordu. cfo_stok_deger.gercek_stok bu SKU'yu gerçek sayıyor →
-- net sermaye sözleşmesi (cfo_metrik_net_sermaye sira 3 LCNRV), Goal Engine net_capital_try v3, snapshot, sermaye verimliliği
-- (TRIM/LIQUIDATE "serbest bırakılabilir nakit" = plan bütçesi), sermaye sağlığı ve AI CFO kanıtları sanal 2.513 adeti
-- değerliyordu (10.10 üretim: LCNRV 1.025.723 TL).
-- Düzeltme:
--   1) cfo_stok_deger.gercek_stok: istisna listesindeki SKU gerçek stok DEĞİL (tüm tüketiciler aynı kuraldan; tanımın geri kalanı
--      üretimdeki tanımla birebir).
--   2) cfo_metrik_net_sermaye: istisna SKU'nun BEYAN EDİLEN gerçek bağlı sermayesi (gercek_bagli_try, KDV dahil → /1,2; D-P06)
--      stok satırına (3) eklenir — CFO-017 kimliği (nakit + alacak + stok + yoldaki − borç = net sermaye) korunur; açıklamada ayrı yazılır.
-- Etki (10.10 02:35 UTC, salt-okunur): stok LCNRV 3.336.030,79 → ≈2.318.391 (−1.025.723 + 8.083); net sermaye 2.401.170 → ≈1.383.530 TL.
-- Geri alma: cfo_stok_deger gercek_stok ifadesinden NOT EXISTS koşulunu, cfo_metrik_net_sermaye'den `i` CTE'sini çıkar
-- (20261009190000 tanımı).

CREATE OR REPLACE VIEW public.cfo_stok_deger AS
 WITH satis AS (
         SELECT COALESCE(d."productId", pm.id) AS pid,
            sum(d.adet_duz) AS adet,
            sum(d.tutar_duz) AS tutar,
            sum(d.tutar_duz * (COALESCE(n.net_oran, 0.65) + COALESCE(n.kargo_payi, 0.121))::double precision) AS kargosuz_net,
            sum(d.tutar_duz * COALESCE(n.kargo_payi, 0.121)::double precision) / NULLIF(sum(d.tutar_duz), 0::double precision) AS kargo_payi
           FROM cfo_satis_birim_duz d
             LEFT JOIN "Product" pm ON pm.sku = d."productCode"
             LEFT JOIN cfo_kanal_net_oran n ON n.channel = d.channel
          WHERE d."orderDate" >= (CURRENT_DATE - 90) AND d.adet_duz > 0
          GROUP BY (COALESCE(d."productId", pm.id))
        ), t AS (
         SELECT p.id,
            p.sku,
            p.name,
            p.category,
            p."stockQuantity" AS stok,
            p."unitCostTry" AS birim_maliyet,
            (p."stockQuantity" <> ALL (ARRAY[500, 998, 999, 1000, 9999, 10000])) AND p."stockQuantity" <= 5000
              AND NOT EXISTS (SELECT 1 FROM public.cfo_stok_istisna i WHERE i.sku = p.sku) AS gercek_stok,
            (s.tutar / NULLIF(s.adet, 0)::double precision)::numeric AS birim_fiyat,
            (s.kargosuz_net / NULLIF(s.adet, 0)::double precision)::numeric AS birim_brut_net,
            s.kargo_payi::numeric AS kargo_payi,
            s.adet::numeric / 90.0 AS gunluk_hiz
           FROM "Product" p
             LEFT JOIN satis s ON s.pid = p.id
          WHERE p."isActive" AND p."stockQuantity" > 0
        ), k AS (
         SELECT t.id,
            t.sku,
            t.name,
            t.category,
            t.stok,
            t.birim_maliyet,
            t.gercek_stok,
            t.birim_fiyat,
            t.birim_brut_net,
            t.kargo_payi,
            t.gunluk_hiz,
                CASE
                    WHEN t.birim_fiyat IS NULL THEN NULL::numeric
                    WHEN COALESCE(t.kargo_payi, 0.121) = 0::numeric THEN 0::numeric
                    WHEN t.birim_fiyat < 200::numeric THEN 53.61
                    WHEN t.birim_fiyat < 350::numeric THEN 91.89
                    WHEN t.birim_fiyat < 750::numeric THEN 106.25
                    WHEN t.birim_fiyat < 1500::numeric THEN 113.41
                    ELSE 154.91
                END AS birim_kargo
           FROM t
        )
 SELECT id,
    sku,
    name,
    category,
    stok,
    birim_maliyet,
    gercek_stok,
    birim_fiyat,
    birim_brut_net,
    kargo_payi,
    gunluk_hiz,
    birim_kargo,
        CASE
            WHEN birim_fiyat IS NOT NULL THEN 'GERCEKLESEN_SATIS'::text
            WHEN birim_maliyet IS NOT NULL THEN 'MALIYET'::text
            ELSE 'DEGERSIZ'::text
        END AS deger_kaynagi,
    round(COALESCE(birim_brut_net - birim_kargo, birim_maliyet, 0::numeric), 2) AS birim_net_deger,
    round(stok::numeric * COALESCE(birim_brut_net - birim_kargo, birim_maliyet, 0::numeric), 2) AS net_deger,
    round(stok::numeric * COALESCE(birim_maliyet, 0::numeric), 2) AS maliyet_degeri,
        CASE
            WHEN gunluk_hiz > 0::numeric THEN round(stok::numeric / gunluk_hiz, 0)
            ELSE NULL::numeric
        END AS ortu_gun
   FROM k;

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
), i AS (
  -- RF-036: sanal stok istisnası — adet değil, insanın beyan ettiği gerçek bağlı sermaye (KDV dahil → /1,2); yalnız aktif, stoklu SKU
  SELECT round(COALESCE(sum(x.gercek_bagli_try), 0) / 1.2, 2) AS bagli, count(*) AS n
    FROM public.cfo_stok_istisna x
   WHERE EXISTS (SELECT 1 FROM public."Product" p WHERE p.sku = x.sku AND p."isActive" AND p."stockQuantity" > 0)
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
FROM h, a, i, s, y, k, c, LATERAL (VALUES
  (1, 'VARLIK', 'Nakit', h.nakit, 'Aktif banka hesaplarinin arti bakiyeleri (eksi bakiye KMH satirinda)'),
  (2, 'VARLIK', 'Alacaklar', a.alacak, 'cfo_receivable, tahsil edilmemis'),
  (3, 'VARLIK', 'Stok (rafta) - KDV haric maliyet ile KDV haric NRV in dusugu', s.lcnrv + i.bagli,
     s.sku || ' SKU; ' || s.nrv_alti || ' SKU NRV maliyetin altinda (NRV ile). Maliyet KDV dahil kayitli (D-P06) -> /1,2; KDV haric NRV = birim net deger - birim fiyat/6 (%20 KDV yaklasimi)'
     || CASE WHEN i.n > 0 THEN '; sanal stok istisnasi ' || i.n || ' SKU yalniz beyan edilen bagli sermayeyle (' || i.bagli || ' TL, cfo_stok_istisna)' ELSE '' END),
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
  (100, 'TOPLAM', 'NET SERMAYE', h.nakit + a.alacak + s.lcnrv + i.bagli + y.odenmis - k.kredi - c.kart - h.kmh,
     'Sozlesme (CFO-001; D-P01 GENIS, D-P02 LCNRV KDV haric iki taraf, D-P03 borc = kredi + kart + KMH, D-P06 maliyet KDV dahil kayitli; RF-036 sanal stok istisnasi beyanla)')
) AS v(sira, tur, kalem, tutar, aciklama)
ORDER BY v.sira;
$function$;
