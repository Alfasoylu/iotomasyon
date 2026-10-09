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
