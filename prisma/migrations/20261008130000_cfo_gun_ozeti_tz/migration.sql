-- cfo_gun_ozeti saat düzeltmesi (2026-10-08, ilk üretim koşusunda görüldü): cfo_run zaman sütunları saat dilimsiz (UTC değer) —
-- "x AT TIME ZONE 'Europe/Istanbul'" onu İstanbul yereli sanıp UTC'ye çeviriyordu (15:20 yerine 09:20). Önce UTC olarak yorumla,
-- sonra İstanbul'a çevir. Sütunlar, satır türleri ve yetkiler değişmez (CREATE OR REPLACE aynı sütun listesiyle).
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
  SELECT 0::int AS sira, 'SAGLIK'::text AS tur, NULL::text AS aciliyet, 'motor'::text AS kural, NULL::text AS varlik, NULL::numeric AS tl_etkisi,
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

