-- COWORK TOPLU UYGULAMA — 2026-10-09 (Claude Code). TEK DOSYA, OLDUĞU GİBİ ÇALIŞTIRILIR (UTF-8; yorumlar silinebilir, metinler DEĞİŞTİRİLMEZ).
-- İçerik (sırayla): 4 migration + her birinin _prisma_migrations kaydı (checksum = repo dosyasının sha256'sı) + D-P08 veri düzeltmesi.
-- 140000 zaten uygulanmış ve kayıtlı (kontrol edildi). 190000 (maliyet /1,2) BİLEREK YOK: D-P06 ölçümü maliyetlerin KDV hariç olduğunu
-- gösterdi (431/432 ürün TL/USD = 48,50) — Alperen'in "yurt içi mi hepsi mi" cevabına kadar bekletiliyor.
-- Tamamı tek transaction: herhangi bir adım hata verirse hiçbiri uygulanmaz. Kayıt satırları tekrar çalıştırmaya dayanıklı (NOT EXISTS).
BEGIN;

-- ════════ 20261009150000_cfo_gun_ozeti_saglik_alarm (sha256 b86c9ece1a58a76fba11cac2db5d0be54180170e26c643cca1b67f982a5439c5) ════════
-- cfo_gun_ozeti SAĞLIK satırı motor arızasını ALARM sayar (CFO-009 / Cowork 09.10 bulgusu). 09.10 02:34 UTC koşusu xml-sync after() içinde
-- süre sınırında öldü ve 4+ saat 'running' kaldı; SAĞLIK satırı bunu yalnız metin olarak yazıyordu (aciliyet boş), Cowork'ün 08:00 okuması
-- bayat karar setini güncel sandı. Artık aciliyet = 'ACİL' ve metin başında neden: son koşu 15 dk'dan uzun running (TAKILDI), son koşu
-- tamamlanmadı (BAŞARISIZ) ya da son tamamlanan 20 saatten eski (BAYAT) — eşikler lib/cfo-agent/health.ts STUCK_RUN_MINUTES /
-- ENGINE_STALE_HOURS ile aynı. Diğer satırlar, sütunlar ve yetkiler 20261008130000 ile birebir. Geri alma: o migration'daki tanım.
CREATE OR REPLACE VIEW public.cfo_gun_ozeti WITH (security_invoker = true) AS
WITH son AS (
  SELECT r.id, r."generatedAt" AS kosu, COALESCE(r."finishedAt", r."generatedAt") AS bitis, r."triggerReasons" AS t
  FROM public.cfo_run r
  WHERE r."idempotencyKey" LIKE 'engine:%' AND r.status = 'completed'
  ORDER BY r."generatedAt" DESC LIMIT 1
), son_deneme AS (
  SELECT r."generatedAt" AS kosu, r.status, r.error
  FROM public.cfo_run r
  WHERE r."idempotencyKey" LIKE 'engine:%'
  ORDER BY r."generatedAt" DESC LIMIT 1
), satir AS (
  SELECT 0::int AS sira, 'SAGLIK'::text AS tur,
    CASE WHEN d.status = 'running' AND now() - (d.kosu AT TIME ZONE 'UTC') > interval '15 minutes' THEN 'ACİL'
         WHEN d.status IS DISTINCT FROM 'running' AND d.status IS DISTINCT FROM 'completed' THEN 'ACİL'
         WHEN s.bitis IS NULL OR now() - (s.bitis AT TIME ZONE 'UTC') > interval '20 hours' THEN 'ACİL' END AS aciliyet,
    'motor'::text AS kural, NULL::text AS varlik, NULL::numeric AS tl_etkisi,
    CASE WHEN d.status = 'running' AND now() - (d.kosu AT TIME ZONE 'UTC') > interval '15 minutes'
           THEN 'MOTOR TAKILDI: son koşu 15 dakikadan uzun süredir running (fonksiyon süre sınırında ölmüş olabilir); bu özet son TAMAMLANAN koşudan. '
         WHEN d.status IS DISTINCT FROM 'running' AND d.status IS DISTINCT FROM 'completed'
           THEN 'MOTOR BAŞARISIZ: son koşu tamamlanmadı; bu özet son TAMAMLANAN koşudan. '
         WHEN s.bitis IS NULL OR now() - (s.bitis AT TIME ZONE 'UTC') > interval '20 hours'
           THEN 'MOTOR BAYAT: son tamamlanan koşu 20 saatten eski. '
         ELSE '' END ||
    format('Son koşu %s (%s, %s dk önce). Son tamamlanan %s (%s dk önce, tetik %s). Karar girdisi dünden beri %s, önceki koşudan beri %s. Bulgu %s (ACİL %s), alarm %s, dünden beri kapanan %s.%s',
      to_char((d.kosu AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul', 'DD.MM HH24:MI'), d.status || COALESCE(' — ' || d.error, ''),
      floor(extract(epoch FROM (now() - (d.kosu AT TIME ZONE 'UTC'))) / 60)::int,
      to_char((s.bitis AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul', 'DD.MM HH24:MI'), floor(extract(epoch FROM (now() - (s.bitis AT TIME ZONE 'UTC'))) / 60)::int, s.t->>'trigger',
      CASE WHEN (s.t->'material'->>'sinceYesterday')::boolean THEN 'DEĞİŞTİ' ELSE 'AYNI (no_material_change)' END,
      CASE WHEN (s.t->'material'->>'sincePreviousRun')::boolean THEN 'değişti' ELSE 'aynı' END,
      jsonb_array_length(COALESCE(s.t->'findings', '[]')),
      (SELECT count(*) FROM jsonb_array_elements(COALESCE(s.t->'findings', '[]')) f WHERE f->>'urgency' = 'ACIL'),
      jsonb_array_length(COALESCE(s.t->'alarms', '[]')), jsonb_array_length(COALESCE(s.t->'closedSinceYesterday', '[]')),
      CASE WHEN s.t ? 'metricsError' THEN ' METRIK satırları okunamadı (' || (s.t->>'metricsError') || ').' ELSE '' END) AS metin,
    NULL::text AS aksiyon, NULL::text[] AS kanit_ids,
    CASE WHEN (s.t->'material'->>'sinceYesterday')::boolean THEN 'degisti' ELSE 'ayni' END AS dunden_beri, s.kosu AS kosu_zamani
  FROM son_deneme d LEFT JOIN son s ON true
  UNION ALL
  SELECT 100 + x.ord::int, 'ALARM', NULL, x.a->>'code', x.a->>'key', NULL, x.a->>'message', NULL, NULL, NULL, s.kosu
  FROM son s, jsonb_array_elements(COALESCE(s.t->'alarms', '[]')) WITH ORDINALITY AS x(a, ord)
  UNION ALL
  SELECT 1000 + x.ord::int, 'BULGU',
    CASE x.f->>'urgency' WHEN 'ACIL' THEN 'ACİL' WHEN 'BUGUN' THEN 'BUGÜN' WHEN 'BU_HAFTA' THEN 'BU HAFTA' WHEN 'BILGI' THEN 'BİLGİ' ELSE x.f->>'urgency' END,
    x.f->>'rule', x.f->>'entity', NULLIF(x.f->>'impactTry', '')::numeric, x.f->>'text', x.f->>'action',
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(x.f->'evidenceIds', '[]'))), x.f->>'sinceYesterday', s.kosu
  FROM son s, jsonb_array_elements(COALESCE(s.t->'findings', '[]')) WITH ORDINALITY AS x(f, ord)
  UNION ALL
  SELECT 4000 + x.ord::int, 'KAPANAN', NULL, 'kapanan', x.k, NULL, 'Dün vardı, bugün yok: ' || x.k, NULL, NULL, 'kapandi', s.kosu
  FROM son s, jsonb_array_elements_text(COALESCE(s.t->'closedSinceYesterday', '[]')) WITH ORDINALITY AS x(k, ord)
  UNION ALL
  SELECT 5000 + x.ord::int, 'SUSAN', NULL, 'susan_kural', NULL, NULL, x.v, NULL, NULL, NULL, s.kosu
  FROM son s, jsonb_array_elements_text(COALESCE(s.t->'silenced', '[]')) WITH ORDINALITY AS x(v, ord)
  UNION ALL
  SELECT 6000 + x.ord::int, 'METRIK', NULL, x.m->>'source', x.m->>'key',
    CASE WHEN jsonb_typeof(x.m->'value') = 'number' AND x.m->>'unit' LIKE 'TRY%' THEN (x.m->>'value')::numeric END,
    COALESCE(x.m->>'value', 'bilinmiyor') || ' ' || COALESCE(x.m->>'unit', '') || CASE WHEN (x.m->>'measured')::boolean THEN '' ELSE ' (TAHMİNİ)' END,
    NULL, NULL, NULL, s.kosu
  FROM son s, jsonb_array_elements(COALESCE(s.t->'metrics', '[]')) WITH ORDINALITY AS x(m, ord)
)
SELECT sira, tur, aciliyet, kural, varlik, tl_etkisi, metin, aksiyon, kanit_ids, dunden_beri, kosu_zamani FROM satir ORDER BY sira;
INSERT INTO public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
SELECT gen_random_uuid()::text, 'b86c9ece1a58a76fba11cac2db5d0be54180170e26c643cca1b67f982a5439c5', now(), '20261009150000_cfo_gun_ozeti_saglik_alarm', NULL, NULL, now(), 1
 WHERE NOT EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name = '20261009150000_cfo_gun_ozeti_saglik_alarm');

-- ════════ 20261009160000_cfo_kart_karari_bsmv (sha256 9d1c6afd8cc0f4d1c83dbe3b222dc6bde2b3343219447ed548141c948fb79843) ════════
-- Kart vergi çarpanı 1,30 → 1,20 (Alperen kararı 2026-10-09, Cowork itirazı): kredi kartı akdi faizine KKDF %15 + BSMV %5 (BSMV %15 değil).
-- lib/cfo/card-cost.ts CARD_TAX ile aynı. Yalnız cfo_kart_karari'deki üç 1.30 sabiti ve gerekçe metni değişir; karar mantığı, sıralama,
-- dönüş tipi, imza ve yetkiler 20261009110000 ile birebir (üretim tanımı o migration'la aynı — 2026-10-09 yorumsuz gövde md5 2cb05699… eşit).
-- Geri alma: 20261009110000 içindeki tanım.
CREATE OR REPLACE FUNCTION public.cfo_kart_karari()
 RETURNS TABLE(sira integer, karar text, tarih date, kalem text, mevcut_odeme numeric, yeni_odeme numeric, kazanc numeric, aylik_faiz numeric, kumulatif_kazanc numeric, yeni_dip numeric, gerekce text)
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_taban numeric := (select "netPositionFloorTry" from cfo_settings);
  v_minpct numeric := (select "cardMinPct" from cfo_settings);
  v_dip numeric; v_dip_tarih date; v_acik numeric;
  v_kum numeric := 0; v_i int := 0; r record; v_poz numeric;
begin
  select min(p.pozisyon) into v_dip from cfo_nakit_projeksiyon(120) p;
  select p.tarih into v_dip_tarih from cfo_nakit_projeksiyon(120) p
   where p.pozisyon = v_dip order by p.tarih limit 1;

  if v_dip >= v_taban then
    return query select 1,'TABAN KORUNUYOR'::text, v_dip_tarih,'-'::text,
      0::numeric,0::numeric,0::numeric,0::numeric,0::numeric,v_dip,
      ('En dip '||round(v_dip)||' TL, taban '||round(v_taban)||' TL, pay '||round(v_dip-v_taban)
       ||' TL. Kart odemeleri PLANLANDIGI GIBI yapilir.')::text;
    return;
  end if;

  v_acik := v_taban - v_dip;
  return query select 0,'TABAN DELINIYOR'::text, v_dip_tarih,'-'::text,
    0::numeric,0::numeric,0::numeric,0::numeric,0::numeric,v_dip,
    ('En dip '||round(v_dip)||' TL ('||v_dip_tarih||'), taban '||round(v_taban)||' TL. ACIK '
     ||round(v_acik)||' TL.')::text;

  for r in
    with kalem as (
      select e."eventDate"::date d, e.description aciklama, e."outflowTry" tam,
        (e.description ilike '%HARD DEADLINE%') korumali,
        (select coalesce(c."minOverrideTry", round(coalesce(c."statementDebtTry", e."outflowTry")*v_minpct/100.0,2))
           from cfo_credit_card c where c."isActive" and e.description ilike '%'||c.bank||'%'
          order by c."sortOrder" limit 1) asg,
        (select c."contractMonthlyRatePct"
           from cfo_credit_card c where c."isActive" and e.description ilike '%'||c.bank||'%'
          order by c."sortOrder" limit 1) oran
      from cfo_cash_event e
      where not e."isSettled" and e.kind::text='KART_ODEMESI'
        and e."eventDate"::date <= v_dip_tarih
        and e.description not ilike '%asgari%'
        and not (e.description ilike '%taksiti%' and e.description not ilike '%dahil%')
    )
    select d, aciklama, tam, asg, korumali, oran from kalem where asg is not null and tam > asg + 1
    order by korumali asc, (tam - asg) desc
  loop
    if r.korumali then
      select p.pozisyon into v_poz from cfo_nakit_projeksiyon(120) p where p.tarih = r.d;
      if coalesce(v_poz, -1) >= 0 then
        return query select 50,'KORUMALI — TAM ODENIR'::text, r.d, left(r.aciklama,45),
          r.tam, r.tam, 0::numeric, 0::numeric, v_kum, (v_dip+v_kum),
          ('HARD DEADLINE var ve o gun pozisyon '||round(coalesce(v_poz,0))||' TL: tam odenir.')::text;
      else
        v_i := v_i + 1; v_kum := v_kum + (r.tam - r.asg);
        return query select 51,'KORUMALI AMA NAKIT YOK — ASGARIYE CEK'::text, r.d, left(r.aciklama,45),
          r.tam, r.asg, (r.tam-r.asg), (case when r.oran is null or r.oran <= 0 then null else round((r.tam-r.asg)*r.oran/100.0*1.20,2) end), v_kum, (v_dip+v_kum),
          ('HARD DEADLINE var AMA o gun pozisyon '||round(coalesce(v_poz,0))
           ||' TL — tam odeme MUMKUN DEGIL. Asgari odenir, kalan '||round(r.tam-r.asg)
           ||' TL sonraki ekstreye devreder. Korumanin kaybi RAPORDA belirtilir.')::text;
      end if;
      continue;
    end if;

    exit when v_kum >= v_acik;
    v_i := v_i + 1; v_kum := v_kum + (r.tam - r.asg);
    return query select v_i,'ASGARIYE CEK'::text, r.d, left(r.aciklama,45),
      r.tam, r.asg, (r.tam-r.asg), (case when r.oran is null or r.oran <= 0 then null else round((r.tam-r.asg)*r.oran/100.0*1.20,2) end), v_kum, (v_dip+v_kum),
      ('Ertelenen '||round(r.tam-r.asg)||' TL · aylik faiz '
       ||coalesce('~'||round((r.tam-r.asg)*nullif(r.oran,0)/100.0*1.20)||' TL (kart akdi orani x 1,20 KKDF+BSMV)', 'BILINMIYOR (kartin akdi orani girilmemis)'))::text;
  end loop;

  if coalesce(v_kum,0) < v_acik then
    return query select 99,'YETERSIZ — BASKA KALDIRAC SART'::text, v_dip_tarih,'-'::text,
      0::numeric,0::numeric,0::numeric,0::numeric, coalesce(v_kum,0), (v_dip+coalesce(v_kum,0)),
      ('Kart asgarilerinden sonra taban hala '||round(v_acik-coalesce(v_kum,0))
       ||' TL deliniyor. GECERLI KALDIRAC MERDIVENI (30.08 teyidi sonrasi): '
       ||'(1) 28.09 KISMI CEKIM karari — beyannameyi bol, kaynagin yettigi kadarini cek [cfo_gumruk_dilim()]; '
       ||'(2) antrepoda bekletme — ardiye maliyeti karsiligi nakdi zamana yay; '
       ||'(3) Trendyol erken odeme — ekim hakedislerini 04.10 oncesine cek; '
       ||'(4) 01.10 sabit giderlerini kis (348.400 TL, dip oncesindeki tek buyuk esnek kalem); '
       ||'(5) en pahali borcu yapilandir; (6) sahsi hesaplar — son care, sifir tampon. '
       ||'DIKKAT: gumruk TAKSITLENDIRME ve TEMINAT MEKTUBU ile mal cekimi YOKTUR '
       ||'(gumruk musaviri 30.08.2026 kesin ret). Yurtdisi siparis erteleme 30.08de zaten yapildi.')::text;
  end if;
end;
$function$;
INSERT INTO public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
SELECT gen_random_uuid()::text, '9d1c6afd8cc0f4d1c83dbe3b222dc6bde2b3343219447ed548141c948fb79843', now(), '20261009160000_cfo_kart_karari_bsmv', NULL, NULL, now(), 1
 WHERE NOT EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name = '20261009160000_cfo_kart_karari_bsmv');

-- ════════ 20261009170000_cfo_metrik_net_sermaye (sha256 bbb65f70b666c906b283365594e9cc21be631e75614a6bbab01f141fa3ea76f4) ════════
-- CFO-001 PR-D: net sermayenin TEK tanımı (metrik sözleşmesi, docs/CFO-METRIC-CONTRACT.md; Alperen kararları 2026-10-09).
--   D-P01 GENİŞ (yoldaki malın ödenmiş kısmı dahil) · D-P02 stok = maliyet ile KDV hariç NRV'nin düşüğü (LCNRV) ·
--   D-P03 borç = kredi kalan anapara + kart toplam + kullanılan KMH; yoldaki ödenmemiş gümrük/navlun iki taraflı (net 0).
-- 1) cfo_metrik_net_sermaye(): bileşen satırları + sira 100 = NET SERMAYE. Değeri bilinmeyen stok 0 sayılmaz, BİLGİ satırında
--    BILINMIYOR olarak sayılır; satan ama birim maliyeti olmayan stok da (LCNRV maliyetsiz hesaplanamaz) toplama girmez, KDV hariç NRV'si
--    üst sınır olarak BİLGİ satırında. Üretim 09.10 (salt-okuma): 2.900.562 TL (DAR 2.467.282 / GENİŞ-NRV 6.225.616 yerine).
-- 2) cfo_snapshot."contractNetWorthTry" (yeni, boş olabilir) — cfo_take_snapshot sözleşme değerini de yazar; eski alanlar aynen.
-- 3) fm_balance_refresh: net_capital_try definition_version 3 = sözleşme (v2 yazılmaya devam eder).
-- 4) fm_goal_evaluate: bakiye hedefleri yalnız EN YENİ tanım sürümünden gözlenir ve eğilim yalnız o sürümden hesaplanır
--    (v3 ilk sözleşme snapshot'ıyla devreye girer; o güne kadar v2 aynen). Diğer her şey 20261009130000 ile birebir.
-- Yetki: yeni fonksiyon anon/authenticated/PUBLIC'e kapalı. Geri alma: cfo_take_snapshot → baseline, fm_balance_refresh →
-- 20261005250000, fm_goal_evaluate → 20261009130000; DROP FUNCTION cfo_metrik_net_sermaye(); kolon boş kalabilir.
ALTER TABLE public.cfo_snapshot ADD COLUMN IF NOT EXISTS "contractNetWorthTry" numeric(14,2);

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
                                   THEN LEAST(d.maliyet_degeri, d.stok * (d.birim_net_deger - d.birim_fiyat / 6.0))
                                 WHEN d.deger_kaynagi = 'MALIYET' THEN d.maliyet_degeri END), 0), 2) AS lcnrv,
         count(*) FILTER (WHERE d.deger_kaynagi = 'MALIYET' OR (d.deger_kaynagi = 'GERCEKLESEN_SATIS' AND d.birim_maliyet IS NOT NULL)) AS sku,
         count(*) FILTER (WHERE d.deger_kaynagi = 'GERCEKLESEN_SATIS' AND d.birim_maliyet IS NULL) AS maliyetsiz_sku,
         round(COALESCE(sum(d.stok * (d.birim_net_deger - d.birim_fiyat / 6.0)) FILTER (WHERE d.deger_kaynagi = 'GERCEKLESEN_SATIS' AND d.birim_maliyet IS NULL), 0), 2) AS maliyetsiz_nrv,
         count(*) FILTER (WHERE d.deger_kaynagi = 'GERCEKLESEN_SATIS' AND d.birim_maliyet IS NOT NULL AND d.stok * (d.birim_net_deger - d.birim_fiyat / 6.0) < d.maliyet_degeri) AS nrv_alti,
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
  (3, 'VARLIK', 'Stok (rafta) - maliyet ile KDV haric NRV in dusugu', s.lcnrv,
     s.sku || ' SKU; ' || s.nrv_alti || ' SKU NRV maliyetin altinda (NRV ile). KDV haric NRV = birim net deger - birim fiyat/6 (%20 KDV yaklasimi)'),
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
     'Sozlesme (CFO-001; D-P01 GENIS, D-P02 LCNRV, D-P03 borc = kredi + kart + KMH)')
) AS v(sira, tur, kalem, tutar, aciklama)
ORDER BY v.sira;
$function$;

CREATE OR REPLACE FUNCTION public.cfo_take_snapshot(p_note text DEFAULT NULL::text)
 RETURNS cfo_snapshot
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_usd NUMERIC; v_cash NUMERIC; v_recv NUMERIC; v_stok NUMERIC;
  v_yolda NUMERIC; v_kredi NUMERIC; v_kart NUMERIC; v_yolda_borc NUMERIC;
  v_narrow NUMERIC; v_wide NUMERIC; v_row "cfo_snapshot"; v_sozlesme NUMERIC;
BEGIN
  SELECT COALESCE(NULLIF("usdTryRate", 0), 1) INTO v_usd FROM "cfo_settings" LIMIT 1;
  IF v_usd IS NULL THEN v_usd := 1; END IF;

  SELECT
    COALESCE(SUM(tutar) FILTER (WHERE sira = 1), 0),
    COALESCE(SUM(tutar) FILTER (WHERE sira = 2), 0),
    COALESCE(SUM(tutar) FILTER (WHERE sira IN (3,4)), 0),
    COALESCE(SUM(tutar) FILTER (WHERE sira IN (5,6)), 0),
    COALESCE(-SUM(tutar) FILTER (WHERE sira = 7), 0),
    COALESCE(-SUM(tutar) FILTER (WHERE sira = 8), 0),
    COALESCE(-SUM(tutar) FILTER (WHERE sira = 9), 0)
  INTO v_cash, v_recv, v_stok, v_yolda, v_kredi, v_kart, v_yolda_borc
  FROM "cfo_servet_kalem";

  -- DAR: yoldaki mal haric (ne varligi ne borcu)
  v_narrow := v_cash + v_recv + v_stok - v_kredi - v_kart;
  -- GENIS: yoldaki mal iki tarafa birden (§4E kural 4)
  v_wide   := v_narrow + v_yolda - v_yolda_borc;

  -- SOZLESME (CFO-001, D-P01..03): net sermayenin tek tanimi; Goal Engine bunu okur (fm_balance_day v3)
  -- Hata snapshot'i durdurmaz: sozlesme NULL kalir (Goal v3 bayatlar → UNKNOWN), eski alanlar yine yazilir.
  BEGIN
    SELECT m.tutar INTO v_sozlesme FROM public.cfo_metrik_net_sermaye() m WHERE m.sira = 100;
  EXCEPTION WHEN OTHERS THEN
    v_sozlesme := NULL;
  END;

  INSERT INTO "cfo_snapshot" ("id","takenAt","netWorthTry","netWorthUsd","wideWorthTry",
      "wideWorthUsd","cashTry","receivablesTry","stockTry","debtTry","usdTryRate","note","contractNetWorthTry")
  VALUES (gen_random_uuid()::text, now(),
      round(v_narrow,2), round(v_narrow/v_usd,2), round(v_wide,2), round(v_wide/v_usd,2),
      round(v_cash,2), round(v_recv,2), round(v_stok + v_yolda,2),
      round(v_kredi + v_kart + v_yolda_borc,2), v_usd, p_note, round(v_sozlesme,2))
  RETURNING * INTO v_row;
  RETURN v_row;
END $function$;

CREATE OR REPLACE FUNCTION public.fm_balance_refresh(p_v2_from date DEFAULT DATE '2026-09-11') RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint; m bigint;
BEGIN
  INSERT INTO public.fm_balance_day (economic_date, metric_key, definition_version, value_try, source, known_at)
  SELECT s.d, m.metric_key, 2, m.v, 'cfo_snapshot', s.known_at
  FROM (SELECT DISTINCT ON ("takenAt"::date) "takenAt"::date AS d, "takenAt" AS known_at, "cashTry", "debtTry", "receivablesTry", "netWorthTry", "stockTry"
        FROM public.cfo_snapshot WHERE "takenAt"::date >= p_v2_from ORDER BY "takenAt"::date, "takenAt" DESC) s
  CROSS JOIN LATERAL (VALUES ('cash_try', s."cashTry"), ('debt_try', s."debtTry"), ('receivables_try', s."receivablesTry"),
                             ('net_capital_try', s."netWorthTry"), ('inventory_value_try', s."stockTry")) AS m(metric_key, v)
  WHERE m.v IS NOT NULL
  ON CONFLICT (economic_date, metric_key, definition_version) DO UPDATE SET value_try = EXCLUDED.value_try,
    source = EXCLUDED.source, known_at = EXCLUDED.known_at;
  GET DIAGNOSTICS n = ROW_COUNT;
  -- v3 (CFO-001, 2026-10-09): net sermaye SOZLESME tanimi (cfo_snapshot.contractNetWorthTry = cfo_metrik_net_sermaye()); v2 (DAR) aynen yazilmaya devam eder.
  INSERT INTO public.fm_balance_day (economic_date, metric_key, definition_version, value_try, source, known_at)
  SELECT s.d, 'net_capital_try', 3, s.v, 'cfo_snapshot.contractNetWorthTry', s.known_at
  FROM (SELECT DISTINCT ON ("takenAt"::date) "takenAt"::date AS d, "takenAt" AS known_at, "contractNetWorthTry" AS v
        FROM public.cfo_snapshot WHERE "takenAt"::date >= p_v2_from ORDER BY "takenAt"::date, "takenAt" DESC) s
  WHERE s.v IS NOT NULL
  ON CONFLICT (economic_date, metric_key, definition_version) DO UPDATE SET value_try = EXCLUDED.value_try,
    source = EXCLUDED.source, known_at = EXCLUDED.known_at;
  GET DIAGNOSTICS m = ROW_COUNT;
  RETURN n + m;
END
$$;

CREATE OR REPLACE FUNCTION public.fm_goal_evaluate(p_as_of date DEFAULT (now() AT TIME ZONE 'Europe/Istanbul')::date)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  g record;
  fx record;
  fx_rate numeric; fx_month date; fx_grade char(1); fx_flags text[];
  st text; obs numeric; obs_on date; tgt numeric; prog numeric; gap numeric; cur_rate numeric; req_rate numeric;
  proj numeric; proj_on date; grade char(1); flags text[]; inputs jsonb; p_start date; p_end date;
  sales_refresh_at timestamptz; complete_through date; elapsed integer; dim integer; remaining integer;
  ty_through date; mp_through date; rate_through date; rate_elapsed integer; mtd_rate numeric;
  mtd numeric; mtd_alfas numeric; slope numeric; npts integer; span integer; days_left integer;
  bver integer; h text; written integer := 0; skipped integer := 0; summary jsonb := '[]'::jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('fm_goal_evaluate'));
  PERFORM public.fm_goal_sync();

  -- TCMB aylık kur (değerlendirme ayı; yoksa önceki en yakın ay → kalite B + bayrak)
  SELECT f.month, f.usd_try_forex_buying, f.usd_try_grade INTO fx
    FROM public.fm_memory_fx_monthly f WHERE f.month <= date_trunc('month', p_as_of)::date AND f.usd_try_forex_buying IS NOT NULL ORDER BY f.month DESC LIMIT 1;
  IF FOUND THEN
    fx_rate := fx.usd_try_forex_buying; fx_month := fx.month;
    IF fx.month < date_trunc('month', p_as_of)::date THEN fx_grade := greatest(fx.usd_try_grade, 'B'); fx_flags := ARRAY['goal_fx_prior_month'];
    ELSE fx_grade := fx.usd_try_grade; fx_flags := '{}'; END IF;
  ELSE
    fx_rate := NULL; fx_month := NULL; fx_grade := 'U'; fx_flags := ARRAY['goal_fx_missing'];
  END IF;

  SELECT max(finished_at) INTO sales_refresh_at FROM public.fm_ingest_run
   WHERE kind IN ('sales_backfill', 'sales_refresh') AND status = 'succeeded';
  -- Kaynak tazeliği (RF-20261008-025): bir gün ancak her satış kaynağı o gün BİTTİKTEN sonra okunduysa tamamdır. known_at = kaynağın
  -- okunma anı (Trendyol senkronu / Entegra içe aktarımı; UTC). Kaynağın hiç satırı yoksa sınır koymaz.
  SELECT (max(known_at) FILTER (WHERE source_system = 'TRENDYOL_API') AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul')::date - 1,
         (max(known_at) FILTER (WHERE source_system = 'MARKETPLACE') AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul')::date - 1
    INTO ty_through, mp_through
    FROM public.fm_sales_canonical_snapshot;

  FOR g IN SELECT * FROM public.fm_goal WHERE valid_to IS NULL ORDER BY goal_key LOOP
    st := 'UNKNOWN'; obs := NULL; obs_on := NULL; tgt := NULL; prog := NULL; gap := NULL; cur_rate := NULL; req_rate := NULL;
    proj := NULL; proj_on := NULL; grade := 'U'; flags := '{}'; inputs := '{}'::jsonb; p_start := NULL; p_end := NULL;

    IF g.target_currency = 'USD' THEN
      tgt := CASE WHEN fx_rate IS NOT NULL THEN round(g.target_value * fx_rate, 2) END;
      flags := flags || fx_flags;
    ELSE
      tgt := g.target_value;
    END IF;

    IF g.kind = 'revenue_month' THEN
      -- Ayın ilk günü tamamlanmış gün yok → önceki ayın nihai sonucu.
      IF p_as_of = date_trunc('month', p_as_of)::date THEN
        p_start := (p_as_of - interval '1 month')::date; flags := flags || ARRAY['goal_previous_month_final'];
      ELSE
        p_start := date_trunc('month', p_as_of)::date;
      END IF;
      p_end := (p_start + interval '1 month - 1 day')::date;
      dim := p_end - p_start + 1;
      -- Hafıza, ancak tazeleme günü (İstanbul) - 1'e kadar tamamdır; eksik günler 0 sayılmaz.
      complete_through := least(p_as_of - 1, p_end, coalesce((sales_refresh_at AT TIME ZONE 'Europe/Istanbul')::date - 1, p_start - 1));
      elapsed := greatest(complete_through - p_start + 1, 0);
      remaining := dim - elapsed;
      SELECT coalesce(sum(revenue_incl_vat_try), 0), coalesce(sum(revenue_alfas_incl_vat_try), 0), coalesce(max(revenue_grade), 'U')
        INTO mtd, mtd_alfas, grade
        FROM public.fm_memory_sales_company_day WHERE economic_date BETWEEN p_start AND complete_through AND elapsed > 0;
      obs := mtd; obs_on := CASE WHEN elapsed > 0 THEN complete_through END;
      inputs := jsonb_build_object('period_start', p_start, 'period_end', p_end, 'complete_through', complete_through, 'days_elapsed', elapsed,
                                   'days_in_month', dim, 'revenue_mtd_try', mtd, 'revenue_alfas_mtd_try', mtd_alfas,
                                   'sales_memory_refreshed_at', sales_refresh_at, 'target_usd', g.target_value, 'fx_usd_try', fx_rate, 'fx_month', fx_month);
      IF complete_through < least(p_as_of - 1, p_end) OR elapsed = 0 THEN
        flags := flags || ARRAY['goal_sales_memory_stale']; grade := 'U'; st := 'UNKNOWN';
        IF elapsed = 0 THEN obs := NULL; END IF;
      ELSIF tgt IS NULL THEN
        st := 'UNKNOWN'; grade := 'U';
      ELSE
        grade := greatest(grade, fx_grade);
        -- Hız ve projeksiyon yalnız TÜM kaynakların tamam olduğu günlerden (eksik günler hızı düşürmesin; gözlenen MTD aynen raporlanır)
        rate_through := least(complete_through, coalesce(ty_through, complete_through), coalesce(mp_through, complete_through));
        rate_elapsed := greatest(rate_through - p_start + 1, 0);
        IF rate_through < complete_through AND rate_elapsed > 0 THEN
          SELECT coalesce(sum(revenue_incl_vat_try), 0) INTO mtd_rate
            FROM public.fm_memory_sales_company_day WHERE economic_date BETWEEN p_start AND rate_through;
          flags := flags || ARRAY['goal_sources_partial']; grade := greatest(grade, 'B');
        ELSE
          IF rate_through < complete_through THEN flags := flags || ARRAY['goal_sources_partial']; grade := greatest(grade, 'C'); END IF;
          rate_through := complete_through; rate_elapsed := elapsed; mtd_rate := mtd;
        END IF;
        inputs := inputs || jsonb_build_object('trendyol_complete_through', ty_through, 'marketplace_complete_through', mp_through,
                                               'rate_through', rate_through, 'rate_days', rate_elapsed, 'revenue_rate_window_try', mtd_rate);
        IF rate_elapsed < 7 THEN flags := flags || ARRAY['goal_short_window']; END IF;
        cur_rate := round(mtd_rate / rate_elapsed, 2);
        proj := round(mtd_rate / rate_elapsed * dim, 2); proj_on := p_end;
        req_rate := CASE WHEN dim - rate_elapsed > 0 THEN round(greatest(tgt - mtd_rate, 0) / (dim - rate_elapsed), 2) END;
        prog := round(mtd / tgt * 100, 2); gap := round(tgt - mtd, 2);
        st := CASE WHEN mtd >= tgt THEN 'ACHIEVED'
                   WHEN remaining = 0 THEN 'OFF_TRACK'
                   WHEN proj >= tgt THEN 'ON_TRACK'
                   WHEN proj >= tgt * (1 - g.at_risk_band_pct / 100) THEN 'AT_RISK'
                   ELSE 'OFF_TRACK' END;
      END IF;

    ELSIF g.kind IN ('debt_ceiling', 'wealth_by_date') THEN
      -- Gozlem ve egilim YALNIZ en yeni tanim surumunden (CFO-001: net_capital_try v3 = sozlesme); surumler ayni seri degildir,
      -- egilim karisik surumlerden hesaplanmaz (yeni surumun ilk 14 gununde goal_short_history).
      SELECT max(b.definition_version) INTO bver FROM public.fm_balance_day b WHERE b.metric_key = g.metric_key AND b.economic_date <= p_as_of;
      SELECT b.economic_date, b.value_try, b.grade INTO obs_on, obs, grade
        FROM public.fm_memory_balance_day b
       WHERE b.metric_key = g.metric_key AND b.economic_date <= p_as_of AND b.definition_version = bver
       ORDER BY b.economic_date DESC LIMIT 1;
      -- Eğilim: son 30 gün (≥5 gözlem, ≥14 gün aralık), TL/gün.
      SELECT regr_slope(b.value_try, (b.economic_date - DATE '2000-01-01')::numeric), count(*), max(b.economic_date) - min(b.economic_date)
        INTO slope, npts, span
        FROM public.fm_balance_day b
       WHERE b.metric_key = g.metric_key AND b.economic_date BETWEEN p_as_of - 30 AND p_as_of AND b.definition_version = bver;
      inputs := jsonb_build_object('observed_on', obs_on, 'value_try', obs, 'definition_version', bver, 'trend_points', npts, 'trend_span_days', span,
                                   'trend_slope_try_per_day', round(slope, 2), 'target_value', g.target_value, 'target_currency', g.target_currency,
                                   'fx_usd_try', fx_rate, 'fx_month', fx_month, 'deadline', g.deadline);
      IF obs IS NULL OR obs_on < p_as_of - 3 THEN
        flags := flags || ARRAY['goal_balance_stale']; st := 'UNKNOWN'; grade := 'U';
      ELSIF tgt IS NULL THEN
        st := 'UNKNOWN'; grade := 'U';
      ELSE
        IF g.target_currency = 'USD' THEN grade := greatest(grade, fx_grade); END IF;
        IF npts >= 5 AND span >= 14 THEN cur_rate := round(slope, 2); ELSE flags := flags || ARRAY['goal_short_history']; END IF;
        IF g.kind = 'debt_ceiling' THEN
          gap := round(obs - tgt, 2);
          prog := NULL;
          IF obs < tgt THEN st := 'ACHIEVED';
          ELSE
            st := 'NOT_MET';
            IF cur_rate IS NOT NULL AND cur_rate < 0 THEN
              flags := flags || ARRAY['goal_trend_decreasing'];
              -- Eşiğe ulaşma tarihi yalnız gözlenen eğilim aralığının 4 katına kadar ileri tahmin edilir.
              IF ceil((obs - tgt) / (-cur_rate)) <= 4 * span THEN
                proj_on := obs_on + ceil((obs - tgt) / (-cur_rate))::integer; proj := tgt;
              ELSE
                flags := flags || ARRAY['goal_projection_horizon_exceeded'];
              END IF;
            ELSIF cur_rate IS NOT NULL THEN
              flags := flags || ARRAY['goal_trend_not_decreasing'];
            END IF;
          END IF;
        ELSE -- wealth_by_date
          flags := flags || ARRAY['goal_fx_constant_assumption'];
          gap := round(tgt - obs, 2); prog := round(obs / tgt * 100, 2);
          days_left := g.deadline - obs_on; p_end := g.deadline;
          IF obs >= tgt THEN st := 'ACHIEVED';
          ELSIF days_left <= 0 THEN st := 'OFF_TRACK'; flags := flags || ARRAY['goal_deadline_passed'];
          ELSE
            req_rate := round((tgt - obs) / days_left, 2);
            IF cur_rate IS NULL THEN st := 'UNKNOWN';
            ELSE
              -- Durum, gözlenen hız ile gereken hızın karşılaştırmasıdır (run-rate); değer projeksiyonu yalnız
              -- eğilim aralığının 4 katına kadar gösterilir (kısa geçmişten uzun vadeli değer uydurulmaz).
              st := CASE WHEN cur_rate >= req_rate THEN 'ON_TRACK'
                         WHEN cur_rate >= req_rate * (1 - g.at_risk_band_pct / 100) THEN 'AT_RISK'
                         ELSE 'OFF_TRACK' END;
              IF days_left <= 4 * span THEN
                proj := round(obs + cur_rate * days_left, 2); proj_on := g.deadline;
              ELSE
                flags := flags || ARRAY['goal_projection_horizon_exceeded'];
              END IF;
            END IF;
          END IF;
        END IF;
      END IF;

    ELSIF g.kind = 'position_floor' THEN
      flags := flags || ARRAY['goal_projection_based'];
      BEGIN
        SELECT p.pozisyon, p.tarih INTO obs, proj_on FROM public.cfo_nakit_projeksiyon(120) p ORDER BY p.pozisyon ASC, p.tarih ASC LIMIT 1;
        obs_on := p_as_of;
        inputs := jsonb_build_object('source', 'cfo_nakit_projeksiyon(120)', 'min_position_try', obs, 'min_position_date', proj_on, 'floor_try', tgt);
        IF obs IS NULL THEN st := 'UNKNOWN'; grade := 'U';
        ELSE
          grade := 'D'; proj := obs; gap := CASE WHEN obs < tgt THEN round(tgt - obs, 2) ELSE 0 END;
          st := CASE WHEN obs >= tgt THEN 'ACHIEVED' ELSE 'OFF_TRACK' END;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        st := 'UNKNOWN'; grade := 'U'; inputs := jsonb_build_object('source', 'cfo_nakit_projeksiyon(120)', 'error', SQLSTATE);
      END;
    END IF;

    SELECT coalesce(array_agg(DISTINCT f ORDER BY f), '{}') INTO flags FROM unnest(flags) f;
    h := md5(concat_ws('|', g.version, st, obs, obs_on, tgt, prog, gap, cur_rate, req_rate, proj, proj_on, grade, array_to_string(flags, ','), p_start, p_end, inputs::text));
    IF EXISTS (SELECT 1 FROM (SELECT o.input_hash FROM public.fm_goal_observation o WHERE o.goal_key = g.goal_key AND o.as_of = p_as_of
                              ORDER BY o.evaluated_at DESC LIMIT 1) last WHERE last.input_hash = h) THEN
      skipped := skipped + 1;
    ELSE
      INSERT INTO public.fm_goal_observation (goal_key, goal_version, as_of, period_start, period_end, state, observed_value_try, observed_on,
          target_value_try, fx_usd_try, fx_month, progress_pct, gap_try, current_rate_try_per_day, required_rate_try_per_day,
          projected_value_try, projected_on, grade, flags, inputs, input_hash)
      VALUES (g.goal_key, g.version, p_as_of, p_start, p_end, st, obs, obs_on,
          tgt, CASE WHEN g.target_currency = 'USD' THEN fx_rate END, CASE WHEN g.target_currency = 'USD' THEN fx_month END,
          prog, gap, cur_rate, req_rate, proj, proj_on, grade, flags, inputs, h);
      written := written + 1;
    END IF;
    summary := summary || jsonb_build_array(jsonb_build_object('goal_key', g.goal_key, 'state', st, 'grade', grade));
  END LOOP;
  RETURN jsonb_build_object('as_of', p_as_of, 'written', written, 'unchanged', skipped, 'goals', summary);
END
$$;

COMMENT ON FUNCTION public.cfo_metrik_net_sermaye() IS 'Net sermayenin tek tanımı (CFO-001 sözleşmesi; GENİŞ + LCNRV + KMH). sira 100 = toplam. 2026-10-09.';
REVOKE ALL ON FUNCTION public.cfo_metrik_net_sermaye() FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON FUNCTION public.cfo_metrik_net_sermaye() FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON FUNCTION public.cfo_metrik_net_sermaye() FROM authenticated; END IF;
END $$;
INSERT INTO public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
SELECT gen_random_uuid()::text, 'bbb65f70b666c906b283365594e9cc21be631e75614a6bbab01f141fa3ea76f4', now(), '20261009170000_cfo_metrik_net_sermaye', NULL, NULL, now(), 1
 WHERE NOT EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name = '20261009170000_cfo_metrik_net_sermaye');

-- ════════ 20261009180000_cfo_metrik_borc (sha256 db04329d0cc0d0183392eb37148040e5cc90171ac2b83708f7ed08ea0cea1de8) ════════
-- CFO-002: borcun TEK tanımı + hedef < 100.000 USD (metrik sözleşmesi; Alperen D-P03 2026-10-09, hedef kararı 2026-10-08).
--   Finansal borç = kredi kalan anapara + kart toplam borcu + kullanılan KMH. Yoldaki malın ödenmemiş gümrük/navlunu ticari taahhüttür:
--   hedefin dışında, bilgi satırında (bugün borç 9.676.976 TL "gösteriliyordu"; bunun 3.787.072'si taahhüt).
-- 1) cfo_metrik_borc(): bileşen satırları + sira 100 = FİNANSAL BORÇ (net sermaye sözleşmesindeki borç satırlarıyla aynı kaynaklar).
-- 2) cfo_settings."debtTargetUsd" (yeni, varsayılan 100.000) — hedef ve sipariş kapısı aynı ayardan; 5.000.000 TL sabiti emekli.
-- 3) cfo_snapshot."contractDebtTry"; cfo_take_snapshot yazar (hata → NULL, snapshot durmaz); fm_balance_refresh debt_try v3.
-- 4) fm_goal_sync: debt_below_usd (USD, TCMB kuruyla) açılır, debt_below_5m_try emekli (gözlem geçmişi kalır). Goal en yeni tanım
--    sürümünü okur (20261009170000) → v3 ilk sözleşme snapshot'ıyla devreye girer.
-- 20261009170000'den SONRA uygulanır (cfo_take_snapshot / fm_balance_refresh onun üstüne). Yetki: yeni fonksiyon anon/authenticated'a kapalı.
-- Geri alma: 20261009170000 içindeki cfo_take_snapshot / fm_balance_refresh, 20261006130000 içindeki fm_goal_sync; DROP FUNCTION cfo_metrik_borc().
ALTER TABLE public.cfo_settings ADD COLUMN IF NOT EXISTS "debtTargetUsd" numeric(14,2) DEFAULT 100000;
ALTER TABLE public.cfo_snapshot ADD COLUMN IF NOT EXISTS "contractDebtTry" numeric(14,2);

CREATE OR REPLACE FUNCTION public.cfo_metrik_borc()
 RETURNS TABLE(sira integer, tur text, kalem text, tutar numeric, aciklama text)
 LANGUAGE sql
 STABLE
AS $function$
WITH k AS (
  SELECT round(COALESCE(sum(l."remainingTry"), 0), 2) AS kredi,
         round(COALESCE(sum(COALESCE(l."earlyPayoffTry", l."remainingTry")), 0), 2) AS erken,
         count(*) AS adet
    FROM public.cfo_loan l WHERE l.status::text = 'AKTIF'
), c AS (
  SELECT round(COALESCE(sum(cc."totalDebtTry"), 0), 2) AS kart,
         round(COALESCE(sum(cc."totalDebtTry") FILTER (WHERE btrim(COALESCE(cc.holder, '')) = 'Alp'), 0), 2) AS kart_sahsi,
         count(*) FILTER (WHERE cc."totalDebtTry" IS NULL) AS bilinmeyen
    FROM public.cfo_credit_card cc WHERE cc."isActive"
), h AS (
  SELECT round(COALESCE(sum(GREATEST(-b."balanceTry", 0)), 0), 2) AS kmh,
         round(COALESCE(sum(GREATEST(-b."balanceTry", 0)) FILTER (WHERE b."accountType" ~* 'ŞAHSİ|SAHSI'), 0), 2) AS kmh_sahsi,
         count(*) FILTER (WHERE b."balanceTry" < 0) AS hesap
    FROM public.cfo_bank_account b WHERE b."isActive" AND b."balanceTry" IS NOT NULL
), y AS (
  SELECT round(COALESCE(sum(m.odenmemis_vergi_try + m.odenmemis_navlun_try), 0), 2) AS taahhut
    FROM public.cfo_yoldaki_mal m WHERE m.risk = 'NORMAL'
)
SELECT v.sira, v.tur, v.kalem, v.tutar, v.aciklama
FROM k, c, h, y, LATERAL (VALUES
  (1, 'BORC', 'Krediler (kalan anapara)', k.kredi, k.adet || ' aktif kredi; cfo_loan remainingTry (taksit sayisi degil)'),
  (2, 'BORC', 'Kredi kartlari (toplam borc)', c.kart,
     'cfo_credit_card totalDebtTry (ekstre + donem ici)' || CASE WHEN c.bilinmeyen > 0 THEN '; ' || c.bilinmeyen || ' kartin borcu BILINMIYOR (toplama girmedi)' ELSE '' END),
  (3, 'BORC', 'Kullanilan KMH', h.kmh, h.hesap || ' hesap eksi bakiyede'),
  (90, 'BILGI', 'Yoldaki mal - odenmemis gumruk/navlun (ticari taahhut, hedef disi)', y.taahhut,
     'Mal teslim alininca odenir ve stok maliyetine eklenir; nakit projeksiyonunda gorunur (D-P03)'),
  (91, 'BILGI', 'Krediler erken kapama tutariyla', k.erken, 'earlyPayoffTry, yoksa kalan anapara; hedef kalan anaparayla olculur'),
  (92, 'BILGI', 'Toplamin sahsi kismi (kart + KMH, hedefe dahil)', c.kart_sahsi + h.kmh_sahsi, 'Sahsi kart (holder Alp) + SAHSI hesap KMH; sirket/sahsi ayrimi CFO-006'),
  (100, 'TOPLAM', 'FINANSAL BORC', k.kredi + c.kart + h.kmh, 'Sozlesme (CFO-002; D-P03 borc = kredi kalan + kart toplam + kullanilan KMH)')
) AS v(sira, tur, kalem, tutar, aciklama)
ORDER BY v.sira;
$function$;

CREATE OR REPLACE FUNCTION public.cfo_take_snapshot(p_note text DEFAULT NULL::text)
 RETURNS cfo_snapshot
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_usd NUMERIC; v_cash NUMERIC; v_recv NUMERIC; v_stok NUMERIC;
  v_yolda NUMERIC; v_kredi NUMERIC; v_kart NUMERIC; v_yolda_borc NUMERIC;
  v_narrow NUMERIC; v_wide NUMERIC; v_row "cfo_snapshot"; v_sozlesme NUMERIC; v_borc NUMERIC;
BEGIN
  SELECT COALESCE(NULLIF("usdTryRate", 0), 1) INTO v_usd FROM "cfo_settings" LIMIT 1;
  IF v_usd IS NULL THEN v_usd := 1; END IF;

  SELECT
    COALESCE(SUM(tutar) FILTER (WHERE sira = 1), 0),
    COALESCE(SUM(tutar) FILTER (WHERE sira = 2), 0),
    COALESCE(SUM(tutar) FILTER (WHERE sira IN (3,4)), 0),
    COALESCE(SUM(tutar) FILTER (WHERE sira IN (5,6)), 0),
    COALESCE(-SUM(tutar) FILTER (WHERE sira = 7), 0),
    COALESCE(-SUM(tutar) FILTER (WHERE sira = 8), 0),
    COALESCE(-SUM(tutar) FILTER (WHERE sira = 9), 0)
  INTO v_cash, v_recv, v_stok, v_yolda, v_kredi, v_kart, v_yolda_borc
  FROM "cfo_servet_kalem";

  -- DAR: yoldaki mal haric (ne varligi ne borcu)
  v_narrow := v_cash + v_recv + v_stok - v_kredi - v_kart;
  -- GENIS: yoldaki mal iki tarafa birden (§4E kural 4)
  v_wide   := v_narrow + v_yolda - v_yolda_borc;

  -- SOZLESME (CFO-001, D-P01..03): net sermayenin tek tanimi; Goal Engine bunu okur (fm_balance_day v3)
  -- Hata snapshot'i durdurmaz: sozlesme NULL kalir (Goal v3 bayatlar → UNKNOWN), eski alanlar yine yazilir.
  BEGIN
    SELECT m.tutar INTO v_sozlesme FROM public.cfo_metrik_net_sermaye() m WHERE m.sira = 100;
  EXCEPTION WHEN OTHERS THEN
    v_sozlesme := NULL;
  END;
  -- BORC SOZLESMESI (CFO-002, D-P03): kredi kalan + kart toplam + kullanilan KMH; Goal debt_try v3
  BEGIN
    SELECT m.tutar INTO v_borc FROM public.cfo_metrik_borc() m WHERE m.sira = 100;
  EXCEPTION WHEN OTHERS THEN
    v_borc := NULL;
  END;

  INSERT INTO "cfo_snapshot" ("id","takenAt","netWorthTry","netWorthUsd","wideWorthTry",
      "wideWorthUsd","cashTry","receivablesTry","stockTry","debtTry","usdTryRate","note","contractNetWorthTry","contractDebtTry")
  VALUES (gen_random_uuid()::text, now(),
      round(v_narrow,2), round(v_narrow/v_usd,2), round(v_wide,2), round(v_wide/v_usd,2),
      round(v_cash,2), round(v_recv,2), round(v_stok + v_yolda,2),
      round(v_kredi + v_kart + v_yolda_borc,2), v_usd, p_note, round(v_sozlesme,2), round(v_borc,2))
  RETURNING * INTO v_row;
  RETURN v_row;
END $function$;

CREATE OR REPLACE FUNCTION public.fm_balance_refresh(p_v2_from date DEFAULT DATE '2026-09-11') RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint; m bigint;
BEGIN
  INSERT INTO public.fm_balance_day (economic_date, metric_key, definition_version, value_try, source, known_at)
  SELECT s.d, m.metric_key, 2, m.v, 'cfo_snapshot', s.known_at
  FROM (SELECT DISTINCT ON ("takenAt"::date) "takenAt"::date AS d, "takenAt" AS known_at, "cashTry", "debtTry", "receivablesTry", "netWorthTry", "stockTry"
        FROM public.cfo_snapshot WHERE "takenAt"::date >= p_v2_from ORDER BY "takenAt"::date, "takenAt" DESC) s
  CROSS JOIN LATERAL (VALUES ('cash_try', s."cashTry"), ('debt_try', s."debtTry"), ('receivables_try', s."receivablesTry"),
                             ('net_capital_try', s."netWorthTry"), ('inventory_value_try', s."stockTry")) AS m(metric_key, v)
  WHERE m.v IS NOT NULL
  ON CONFLICT (economic_date, metric_key, definition_version) DO UPDATE SET value_try = EXCLUDED.value_try,
    source = EXCLUDED.source, known_at = EXCLUDED.known_at;
  GET DIAGNOSTICS n = ROW_COUNT;
  -- v3 (CFO-001, 2026-10-09): net sermaye SOZLESME tanimi (cfo_snapshot.contractNetWorthTry = cfo_metrik_net_sermaye()); v2 (DAR) aynen yazilmaya devam eder.
  INSERT INTO public.fm_balance_day (economic_date, metric_key, definition_version, value_try, source, known_at)
  SELECT s.d, 'net_capital_try', 3, s.v, 'cfo_snapshot.contractNetWorthTry', s.known_at
  FROM (SELECT DISTINCT ON ("takenAt"::date) "takenAt"::date AS d, "takenAt" AS known_at, "contractNetWorthTry" AS v
        FROM public.cfo_snapshot WHERE "takenAt"::date >= p_v2_from ORDER BY "takenAt"::date, "takenAt" DESC) s
  WHERE s.v IS NOT NULL
  ON CONFLICT (economic_date, metric_key, definition_version) DO UPDATE SET value_try = EXCLUDED.value_try,
    source = EXCLUDED.source, known_at = EXCLUDED.known_at;
  GET DIAGNOSTICS m = ROW_COUNT;
  n := n + m;
  -- v3 (CFO-002, 2026-10-09): borc SOZLESME tanimi (cfo_snapshot.contractDebtTry = cfo_metrik_borc()); v2 aynen yazilmaya devam eder.
  INSERT INTO public.fm_balance_day (economic_date, metric_key, definition_version, value_try, source, known_at)
  SELECT s.d, 'debt_try', 3, s.v, 'cfo_snapshot.contractDebtTry', s.known_at
  FROM (SELECT DISTINCT ON ("takenAt"::date) "takenAt"::date AS d, "takenAt" AS known_at, "contractDebtTry" AS v
        FROM public.cfo_snapshot WHERE "takenAt"::date >= p_v2_from ORDER BY "takenAt"::date, "takenAt" DESC) s
  WHERE s.v IS NOT NULL
  ON CONFLICT (economic_date, metric_key, definition_version) DO UPDATE SET value_try = EXCLUDED.value_try,
    source = EXCLUDED.source, known_at = EXCLUDED.known_at;
  GET DIAGNOSTICS m = ROW_COUNT;
  RETURN n + m;
END
$$;

CREATE OR REPLACE FUNCTION public.fm_goal_sync() RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  s record;
  d record;
  cur record;
  changed integer := 0;
BEGIN
  SELECT "monthlyRevenueTargetUsd" AS rev_usd, "usdWealthTarget" AS wealth_usd, "wealthTargetDate"::date AS wealth_date,
         "netPositionFloorTry" AS floor_try, "debtTargetUsd" AS debt_usd
    INTO s FROM public.cfo_settings ORDER BY "updatedAt" DESC LIMIT 1;
  FOR d IN
    SELECT * FROM (VALUES
      ('revenue_month_usd', 'revenue_month', 'Aylık ciro hedefi', 'revenue_incl_vat_try', s.rev_usd::numeric, 'USD', NULL::date, 'cfo_settings.monthlyRevenueTargetUsd'),
      ('debt_below_usd', 'debt_ceiling', 'Finansal borç hedefin altına (kredi + kart + KMH)', 'debt_try', s.debt_usd::numeric, 'USD', NULL::date, 'cfo_settings.debtTargetUsd'),
      ('wealth_usd', 'wealth_by_date', 'Servet hedefi (net sermaye)', 'net_capital_try', s.wealth_usd::numeric, 'USD', s.wealth_date, 'cfo_settings.usdWealthTarget+wealthTargetDate'),
      ('net_position_floor_try', 'position_floor', 'Net pozisyon tabanı (120 gün projeksiyon dibi)', 'projected_min_position_try', s.floor_try::numeric, 'TRY', NULL::date, 'cfo_settings.netPositionFloorTry')
    ) AS v(goal_key, kind, title, metric_key, target_value, target_currency, deadline, source)
  LOOP
    SELECT * INTO cur FROM public.fm_goal WHERE goal_key = d.goal_key AND valid_to IS NULL;
    IF d.target_value IS NULL OR (d.kind = 'wealth_by_date' AND d.deadline IS NULL) THEN
      IF FOUND THEN UPDATE public.fm_goal SET valid_to = now() WHERE goal_key = d.goal_key AND valid_to IS NULL; changed := changed + 1; END IF;
      CONTINUE;
    END IF;
    IF FOUND AND cur.target_value = d.target_value AND cur.target_currency = d.target_currency
       AND cur.deadline IS NOT DISTINCT FROM d.deadline AND cur.kind = d.kind AND cur.metric_key = d.metric_key THEN
      CONTINUE;
    END IF;
    IF FOUND THEN UPDATE public.fm_goal SET valid_to = now() WHERE goal_key = d.goal_key AND valid_to IS NULL; END IF;
    INSERT INTO public.fm_goal (goal_key, version, kind, title, metric_key, target_value, target_currency, deadline, source)
    VALUES (d.goal_key, coalesce((SELECT max(version) FROM public.fm_goal WHERE goal_key = d.goal_key), 0) + 1,
            d.kind, d.title, d.metric_key, d.target_value, d.target_currency, d.deadline, d.source);
    changed := changed + 1;
  END LOOP;
  -- CFO-002: eski 5 milyon TL hedefi emekli (yerine debt_below_usd; gozlem gecmisi korunur)
  UPDATE public.fm_goal SET valid_to = now() WHERE goal_key = 'debt_below_5m_try' AND valid_to IS NULL;
  IF FOUND THEN changed := changed + 1; END IF;
  RETURN changed;
END
$$;

COMMENT ON FUNCTION public.cfo_metrik_borc() IS 'Finansal borcun tek tanımı (CFO-002; kredi kalan + kart toplam + kullanılan KMH). sira 100 = toplam. 2026-10-09.';
REVOKE ALL ON FUNCTION public.cfo_metrik_borc() FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON FUNCTION public.cfo_metrik_borc() FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON FUNCTION public.cfo_metrik_borc() FROM authenticated; END IF;
END $$;
INSERT INTO public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
SELECT gen_random_uuid()::text, 'db04329d0cc0d0183392eb37148040e5cc90171ac2b83708f7ed08ea0cea1de8', now(), '20261009180000_cfo_metrik_borc', NULL, NULL, now(), 1
 WHERE NOT EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name = '20261009180000_cfo_metrik_borc');

-- ════════ D-P08 veri düzeltmesi (docs/cowork/2026-10-09-d-p08-akbank-alp-sahsi.sql, doğrulama sorguları hariç) ════════
-- D-P08 (Alperen, 2026-10-09; Garanti ekranları 12:34-12:35):
--   1) "Akbank Alp" hesabı ŞAHSİ.
--   2) "Garanti Alp" banka hesabı GERÇEKTE YOK → pasif. Garanti'de yalnız 286-6293619 (Alfa Soylu Ltd., KMH 500.000 = kayıttaki
--      "Garanti", birebir) ve 286-6673313 (Alperen Aydın, şahsi, KMH 150.000 = kayıttaki "Garanti Alperen (şahsi)") var.
--      Şahsi bakiye takip edilmez (Alperen). "Garanti Alp" adlı KART kaydı ve takvimdeki kart ödemeleri ayrı — dokunulmaz.
-- Etki (salt-okuma ölçümü 09.10): şirket boş genel KMH 1.809.300 → 1.359.300 (−250.000 Akbank Alp, −200.000 Garanti Alp);
-- genel ticari kaynak 1.960.853 → 1.510.853; şahsi KMH (son çare) 1.100.000 → 1.350.000; "her şey dahil" açık −52.145 → −252.145.
-- Hesap türü metni ELLE YAZILMAZ: cfo_nakit_kapisi / cfo_kaynak_yeterliligi / cfo_onucus_temel tam "ŞAHSİ" yazımını arar (ILIKE);
-- ASCII'ye çevrilirse ("SAHSI") hesap şirket sayılmaya devam eder. Değer, zaten şahsi olan "Garanti Alperen (şahsi)" satırından kopyalanır.
-- İki satır değişir; koşullar yanlış satıra dokunmayı engeller; tekrar çalıştırmak etkisiz. Geri alma: Akbank Alp "accountType" = 'Vadesiz + KMH';
-- Garanti Alp "isActive" = true.

UPDATE public.cfo_bank_account AS a
   SET "accountType" = s."accountType", "updatedAt" = now()
  FROM (SELECT "accountType" FROM public.cfo_bank_account WHERE name = 'Garanti Alperen (şahsi)' AND "isActive" LIMIT 1) AS s
 WHERE a.id = '6a9d9f79-2b10-43f2-8a4c-dd8355c1cede' AND a.name = 'Akbank Alp' AND a."accountType" = 'Vadesiz + KMH';

INSERT INTO public.cfo_change_log (id, area, item, "oldValue", "newValue", source, kind, note)
SELECT gen_random_uuid()::text, 'banka', 'Akbank Alp hesap türü', 'Vadesiz + KMH', a."accountType", 'Kullanıcı', 'karar',
       'D-P08 (Alperen 2026-10-09): Akbank Alp şahsi, Garanti Alp firma. Şirket genel KMH -250.000, şahsi KMH +250.000.'
  FROM public.cfo_bank_account a WHERE a.id = '6a9d9f79-2b10-43f2-8a4c-dd8355c1cede'
   AND NOT EXISTS (SELECT 1 FROM public.cfo_change_log l WHERE l.item = 'Akbank Alp hesap türü' AND l.kind = 'karar');

-- 2) "Garanti Alp" banka hesabı pasif (silinmez; geçmiş kalır). Bakiye 0, KMH kullanılmamış (10.09 teyidi).
UPDATE public.cfo_bank_account
   SET "isActive" = false, "updatedAt" = now()
 WHERE id = '72a9a26e-2fdc-49dd-8b0d-cb3374e6b294' AND name = 'Garanti Alp' AND "isActive";

INSERT INTO public.cfo_change_log (id, area, item, "oldValue", "newValue", source, kind, note)
SELECT gen_random_uuid()::text, 'banka', 'Garanti Alp banka hesabı', 'aktif (KMH 200.000)', 'pasif', 'Kullanıcı', 'karar',
       'D-P08 (Alperen 2026-10-09, Garanti ekranları): böyle bir hesap yok; Garanti = 286-6293619 şirket (KMH 500.000) + 286-6673313 şahsi (KMH 150.000). Şirket genel KMH -200.000.'
 WHERE NOT EXISTS (SELECT 1 FROM public.cfo_change_log l WHERE l.item = 'Garanti Alp banka hesabı' AND l.kind = 'karar');

COMMIT;

-- ════════ DOĞRULAMA (salt-okuma; COMMIT'ten sonra) ════════
SELECT migration_name, checksum FROM public._prisma_migrations WHERE migration_name >= '20261009140000' ORDER BY 1;
SELECT sira, kalem, tutar FROM public.cfo_metrik_net_sermaye() WHERE sira IN (3, 100);      -- beklenen net sermaye ≈ 2,9M TL (D-P08 KMH net sermayeyi değiştirmez)
SELECT sira, kalem, tutar FROM public.cfo_metrik_borc() WHERE sira = 100;                    -- beklenen ≈ 5.889.904 TL
SELECT aciliyet, left(metin, 80) FROM public.cfo_gun_ozeti WHERE tur = 'SAGLIK';             -- 02:34 koşusu hâlâ running → 'ACİL' + MOTOR TAKILDI
SELECT kalem, kazanc, aylik_faiz FROM public.cfo_kart_karari() WHERE aylik_faiz IS NOT NULL; -- kart faizi ×1,20 (Enpara 36.000 → ~1.836 TL/ay)
SELECT name, "accountType", "isActive" FROM public.cfo_bank_account WHERE name IN ('Akbank Alp', 'Garanti Alp');
SELECT bos_kmh_try FROM public.cfo_nakit_kapisi;                                              -- beklenen 1.359.300
