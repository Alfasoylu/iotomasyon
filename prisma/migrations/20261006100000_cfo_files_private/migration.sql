-- cfo-files bucket'ı PRIVATE + mevcut public-URL referanslarını `private:cfo-files/<path>` biçimine taşıma.
--  • Dosyalar silinmez / yeniden yüklenmez; yalnız cfo_question_file.url referansı ve bucket public bayrağı değişir.
--  • Güvenli: yalnız storage.objects'te gerçekten var olan, uygulamanın path doğrulamasına (validPath) uyan satırlar taşınır.
--  • Idempotent: yalnız hâlâ `/storage/v1/object/public/cfo-files/` içeren satırlar işlenir; yedek tablo satır başına tek kayıt (ON CONFLICT DO NOTHING).
--  • Geri alma (ROLLBACK):
--      UPDATE cfo_question_file f SET url = b.old_url FROM cfo_question_file_url_backup b WHERE b.id = f.id AND f.url = b.new_url;
--      UPDATE storage.buckets SET public = true WHERE id = 'cfo-files';   -- yalnız bilinçli olarak yeniden public yapılacaksa
--    (yedek tablo geri almadan sonra da tutulur)
CREATE TABLE IF NOT EXISTS public.cfo_question_file_url_backup (
  id text PRIMARY KEY,
  old_url text NOT NULL,
  new_url text NOT NULL,
  migrated_at timestamp NOT NULL DEFAULT now()
);
ALTER TABLE public.cfo_question_file_url_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cfo_question_file_url_backup FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON public.cfo_question_file_url_backup FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON public.cfo_question_file_url_backup FROM authenticated; END IF;

  IF to_regclass('storage.objects') IS NOT NULL THEN
    WITH cand AS (
      SELECT f.id, f.url, substring(f.url from '^https?://[^/?#]+/storage/v1/object/public/cfo-files/([^?#]+)$') AS path
      FROM public.cfo_question_file f
      WHERE f.url ~ '^https?://[^/?#]+/storage/v1/object/public/cfo-files/'
    ), ok AS (
      SELECT c.id, c.url, 'private:cfo-files/' || c.path AS new_url
      FROM cand c
      WHERE c.path ~ '^[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+$' AND c.path NOT LIKE '%..%'
        AND EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'cfo-files' AND o.name = c.path)
    ), bk AS (
      INSERT INTO public.cfo_question_file_url_backup (id, old_url, new_url)
      SELECT id, url, new_url FROM ok ON CONFLICT (id) DO NOTHING RETURNING id
    )
    UPDATE public.cfo_question_file f SET url = ok.new_url FROM ok WHERE ok.id = f.id;
  END IF;

  IF to_regclass('storage.buckets') IS NOT NULL THEN
    UPDATE storage.buckets SET public = false WHERE id = 'cfo-files' AND public IS DISTINCT FROM false;
  END IF;
END
$$;
