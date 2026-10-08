-- Kredi borcu = kalan anapara (CFO-004 / RF-20261008-005, 2026-10-09).
-- cfo_servet_kalem "Krediler" satırı ve cfo_kilometre_yaz COALESCE("remainingOverride", "remainingTry") topluyordu. "remainingOverride"
-- bir TAKSİT SAYISIDIR (Int; schema.prisma, engine.ts kalan taksit sayısı olarak kullanır) — TL değil. Bir kredide override girildiği an
-- milyonlarca TL'lik borç "12 TL" olurdu ve net sermaye, borç hedefi (fm_balance_day → Goal Engine) ve sipariş borç kapısı sessizce
-- yanlışlanırdı. Üretimde bugün hiçbir aktif kredide override yok → sayılar DEĞİŞMEZ (salt-okuma doğrulaması: kredi satırı = Σ remainingTry).
-- Değişen tek şey bu iki ifade; görünüm sütunları/tipleri, fonksiyon imzası ve yetkiler aynı (CREATE OR REPLACE yetkileri korur).
-- Geri alma: prisma/baseline/2026-10-06.sql içindeki cfo_servet_kalem ve cfo_kilometre_yaz tanımlarını yeniden çalıştır.
CREATE OR REPLACE VIEW public.cfo_servet_kalem AS
 SELECT 1 AS sira,
    'VARLIK'::text AS tur,
    'Nakit'::text AS kalem,
    ( SELECT round(COALESCE(sum(cfo_bank_account."balanceTry"), (0)::numeric), 2) AS round
           FROM cfo_bank_account
          WHERE cfo_bank_account."isActive") AS tutar,
    'Banka bakiyeleri (cfo_bank_account)'::text AS kaynak,
    'YUKSEK'::text AS guven
UNION ALL
 SELECT 2 AS sira,
    'VARLIK'::text AS tur,
    'Alacaklar (pazaryeri hakedis)'::text AS kalem,
    ( SELECT round(COALESCE(sum(cfo_receivable."amountTry"), (0)::numeric), 2) AS round
           FROM cfo_receivable
          WHERE (NOT cfo_receivable."isCollected")) AS tutar,
    'cfo_receivable, tahsil edilmemis'::text AS kaynak,
    'YUKSEK'::text AS guven
UNION ALL
 SELECT 3 AS sira,
    'VARLIK'::text AS tur,
    'Stok — net gerceklesebilir deger'::text AS kalem,
    ( SELECT round(COALESCE(sum(cfo_stok_deger.net_deger), (0)::numeric), 2) AS round
           FROM cfo_stok_deger
          WHERE (cfo_stok_deger.gercek_stok AND (cfo_stok_deger.deger_kaynagi = 'GERCEKLESEN_SATIS'::text))) AS tutar,
    '110 SKU: 90 gunluk gerceklesen satis fiyati x kanal net orani − kargo (bant tarifesi)'::text AS kaynak,
    'ORTA'::text AS guven
UNION ALL
 SELECT 4 AS sira,
    'VARLIK'::text AS tur,
    'Stok — satis kaniti yok, maliyetle'::text AS kalem,
    ( SELECT round(COALESCE(sum(cfo_stok_deger.net_deger), (0)::numeric), 2) AS round
           FROM cfo_stok_deger
          WHERE (cfo_stok_deger.gercek_stok AND (cfo_stok_deger.deger_kaynagi = 'MALIYET'::text))) AS tutar,
    '7 SKU: 90 gunde satis yok, birim maliyetle deger verildi'::text AS kaynak,
    'DUSUK'::text AS guven
UNION ALL
 SELECT 5 AS sira,
    'VARLIK'::text AS tur,
    'Yoldaki mal — odenmis kisim'::text AS kalem,
    ( SELECT round(COALESCE(sum(cfo_yoldaki_mal.odenmis_try), (0)::numeric), 2) AS round
           FROM cfo_yoldaki_mal
          WHERE (cfo_yoldaki_mal.risk = 'NORMAL'::text)) AS tutar,
    'cfo_yoldaki_mal: 07.26sea + ROMANYA-2408'::text AS kaynak,
    'YUKSEK'::text AS guven
UNION ALL
 SELECT 6 AS sira,
    'VARLIK'::text AS tur,
    'Yoldaki mal — odenmemis vergi/navlun (varlik tarafi)'::text AS kalem,
    ( SELECT round(COALESCE(sum((cfo_yoldaki_mal.odenmemis_vergi_try + cfo_yoldaki_mal.odenmemis_navlun_try)), (0)::numeric), 2) AS round
           FROM cfo_yoldaki_mal
          WHERE (cfo_yoldaki_mal.risk = 'NORMAL'::text)) AS tutar,
    'Mal bu tutar odenince rafa iner; karsiligi asagida borc olarak dusulur'::text AS kaynak,
    'ORTA'::text AS guven
UNION ALL
 SELECT 7 AS sira,
    'BORC'::text AS tur,
    'Krediler'::text AS kalem,
    (- ( SELECT round(COALESCE(sum(cfo_loan."remainingTry"), (0)::numeric), 2) AS round
           FROM cfo_loan
          WHERE ((cfo_loan.status)::text = 'AKTIF'::text))) AS tutar,
    'cfo_loan AKTIF kalan anapara'::text AS kaynak,
    'YUKSEK'::text AS guven
UNION ALL
 SELECT 8 AS sira,
    'BORC'::text AS tur,
    'Kredi kartlari (toplam borc)'::text AS kalem,
    (- ( SELECT round(COALESCE(sum(cfo_credit_card."totalDebtTry"), (0)::numeric), 2) AS round
           FROM cfo_credit_card
          WHERE cfo_credit_card."isActive")) AS tutar,
    'cfo_credit_card totalDebtTry — ekstre + donem ici'::text AS kaynak,
    'YUKSEK'::text AS guven
UNION ALL
 SELECT 9 AS sira,
    'BORC'::text AS tur,
    'Yoldaki mal — odenmemis gumruk/navlun'::text AS kalem,
    (- ( SELECT round(COALESCE(sum((cfo_yoldaki_mal.odenmemis_vergi_try + cfo_yoldaki_mal.odenmemis_navlun_try)), (0)::numeric), 2) AS round
           FROM cfo_yoldaki_mal
          WHERE (cfo_yoldaki_mal.risk = 'NORMAL'::text))) AS tutar,
    '07.26sea gumruk 3.000.000 (15.10, +-%5) + navlun 339.500 · ROMANYA-2408 vergi 500.000'::text AS kaynak,
    'ORTA'::text AS guven
UNION ALL
 SELECT 10 AS sira,
    'RISKLI'::text AS tur,
    'Romanya 1. parti (adli surec) — mansete dahil degil'::text AS kalem,
    ( SELECT round(COALESCE(sum(cfo_yoldaki_mal.odenmis_try), (0)::numeric), 2) AS round
           FROM cfo_yoldaki_mal
          WHERE (cfo_yoldaki_mal.risk = 'RISKLI'::text)) AS tutar,
    'Hukuki mulkiyet Eczacinda, 5607 musadere riski, ardiye isliyor'::text AS kaynak,
    'DUSUK'::text AS guven;

CREATE OR REPLACE FUNCTION public.cfo_kilometre_yaz(p_ay date DEFAULT (date_trunc('month'::text, (CURRENT_DATE - '1 mon'::interval)))::date)
 RETURNS TABLE(r_ay date, r_ciro numeric, r_ciro_usd numeric, r_kar numeric, r_kar_usd numeric, r_marj numeric, r_kur numeric)
 LANGUAGE plpgsql
AS $function$
begin
  insert into cfo_kilometre_tasi as t (ay, ciro, kar, kar_marji, top10_kar, birinci_urun,
    nakit, alacak, kredi_borc, kart_borc, servet_try, servet_usd, servet_yontem, olculdu_at)
  select p_ay,
    (select sum(s.tutar_duz) from cfo_satis_birim_duz s where date_trunc('month',s."orderDate")::date = p_ay),
    k.ay_toplam_kar, null, k.top10_kar, k.birinci,
    (select coalesce(sum(b."balanceTry"),0) from cfo_bank_account b where b."isActive"),
    (select coalesce(sum(r."amountTry"),0) from cfo_receivable r where not r."isCollected"),
    (select coalesce(sum(l."remainingTry"),0) from cfo_loan l where l.status::text='AKTIF'),
    (select coalesce(sum(c."totalDebtTry"),0) from cfo_credit_card c where c."isActive"),
    (select v.servet_try from cfo_servet v), (select v.servet_usd from cfo_servet v),
    'cfo_servet v1 (stok NRV + yoldaki mal iki tarafli)', now()
  from cfo_ay_kazanan_ozet k where k.ay = p_ay
  on conflict (ay) do update set
    ciro=excluded.ciro, kar=excluded.kar, top10_kar=excluded.top10_kar, birinci_urun=excluded.birinci_urun,
    nakit=excluded.nakit, alacak=excluded.alacak, kredi_borc=excluded.kredi_borc, kart_borc=excluded.kart_borc,
    servet_try=excluded.servet_try, servet_usd=excluded.servet_usd, servet_yontem=excluded.servet_yontem,
    olculdu_at=now();

  update cfo_kilometre_tasi x set kar_marji = round((x.kar/nullif(x.ciro,0)*100)::numeric,1) where x.ay = p_ay;

  update cfo_kilometre_tasi x set usd_try = k.usd_try,
    ciro_usd = round((x.ciro/k.usd_try)::numeric,0),
    kar_usd  = round((x.kar /k.usd_try)::numeric,0)
  from cfo_kur k where k.ay = x.ay and x.ay = p_ay;

  insert into cfo_hamle_olcum (hamle_kod, olcum_tarihi, deger, not_)
  select 'H01-MARJ-DONUSU', p_ay, x.kar_marji,
    'Aylik kapanis · ciro ' || coalesce(x.ciro_usd::text,'?') || ' USD · kar ' || coalesce(x.kar_usd::text,'?') || ' USD'
  from cfo_kilometre_tasi x where x.ay = p_ay and x.kar_marji is not null
  and not exists (select 1 from cfo_hamle_olcum o where o.hamle_kod='H01-MARJ-DONUSU' and o.olcum_tarihi=p_ay);

  return query select x.ay, x.ciro, x.ciro_usd, x.kar, x.kar_usd, x.kar_marji, x.usd_try
    from cfo_kilometre_tasi x where x.ay = p_ay;
end $function$;
