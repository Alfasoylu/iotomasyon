-- cfo_google(jsonb) kilidi: anon/authenticated/PUBLIC EXECUTE kaldırılır; gömülü anon JWT kaldırılır.
-- Çağrı zinciri: SQL istemcisi (postgres / service_role / cfo_acceptance_reader) → public.cfo_google() → Edge Function cfo-google → Google API (salt-okunur).
--  • Fonksiyon artık SECURITY DEFINER: cfo_secret'teki CFO_GOOGLE_INTERNAL_TOKEN'ı okuyup `x-cfo-internal` başlığıyla gönderir (sır migration'da YOK; ayrıca üretilir/saklanır).
--  • Edge Function verify_jwt=false + bu başlığı doğrular (anon JWT tek başına yetki değildir).
--  • Yanıt metadata'sı (servis hesabı e-postası) Edge Function'da kaldırıldı.
-- Geri alma: eski gövde/izinler geri yüklenebilir ancak ÖNERİLMEZ (anon'a açık köprü).
CREATE OR REPLACE FUNCTION public.cfo_google(p_body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions AS $$
DECLARE
  tok text;
  body text;
BEGIN
  SELECT s.value INTO tok FROM public.cfo_secret s WHERE s.key = 'CFO_GOOGLE_INTERNAL_TOKEN';
  IF tok IS NULL OR length(tok) < 32 THEN
    RAISE EXCEPTION 'cfo_google: internal token not provisioned';
  END IF;
  SELECT h.content INTO body FROM extensions.http((
    'POST',
    'https://frbxpodiostxuwlrubkt.supabase.co/functions/v1/cfo-google',
    ARRAY[extensions.http_header('x-cfo-internal', tok)],
    'application/json',
    p_body::text
  )::extensions.http_request) h;
  RETURN body::jsonb;
END
$$;

DO $$
DECLARE r text;
BEGIN
  REVOKE EXECUTE ON FUNCTION public.cfo_google(jsonb) FROM PUBLIC;
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.cfo_google(jsonb) FROM %I', r);
    END IF;
  END LOOP;
  FOREACH r IN ARRAY ARRAY['service_role', 'cfo_acceptance_reader'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.cfo_google(jsonb) TO %I', r);
    END IF;
  END LOOP;
END
$$;
