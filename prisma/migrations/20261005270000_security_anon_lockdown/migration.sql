-- Güvenlik: anon/authenticated (Supabase Data API) erişimini daraltır. YALNIZ yetki/RLS değişir; veri, tablo, kolon değişmez. DROP yok.
--
-- 1) RLS'i kapalı ve anon/authenticated'a açık 3 tablo (advisor: rls_disabled_in_public, ERROR):
--      cfo_xml_urun_degisim, cfo_stok_sicrama, cfo_backfill_trendyol_pid_20260922
--    → RLS açılır, anon/authenticated/PUBLIC yetkisi kaldırılır. cfo_acceptance_reader'ın mevcut SELECT erişimi (policy ile) korunur.
-- 2) Veri yazan 5 fonksiyonda anon/authenticated EXECUTE kaldırılır (PUBLIC'ten zaten 20261005200000'de kaldırılmıştı):
--      cfo_take_snapshot, cfo_ay_kazanan_yaz, cfo_kilometre_yaz, cfo_sicrama_kapat, cfo_stok_sicrama_kaydet
--
-- Bağımlılık taraması (2026-10-05): repo'da @supabase/* paketi, createClient, PostgREST (/rest/v1) veya anon anahtarı kullanımı YOK;
-- uygulama Prisma/`postgres` rolüyle (BYPASSRLS) bağlanır; Edge Function `cfo-google` service_role kullanır, `stage-loader` devre dışı (410).
-- Tetikleyici fonksiyonlar (cfo_xml_urun_degisim_trg, cfo_stok_sicrama_trg) çağıranın rolüyle çalışır: yazan roller postgres/service_role (bypass).
-- postgres ve service_role yetkileri DEĞİŞMEZ.
--
-- Idempotent; tablo/fonksiyon yoksa (temiz/preview veritabanı) atlar.
-- Geri alma (önerilmez): GRANT ALL ON public.<tablo> TO anon, authenticated; GRANT EXECUTE ON FUNCTION public.<fn> TO anon, authenticated;

DO $$
DECLARE
  t text;
  f regprocedure;
  r text;
  tables text[] := ARRAY['cfo_xml_urun_degisim', 'cfo_stok_sicrama', 'cfo_backfill_trendyol_pid_20260922'];
  write_functions text[] := ARRAY['cfo_take_snapshot', 'cfo_ay_kazanan_yaz', 'cfo_kilometre_yaz', 'cfo_sicrama_kapat', 'cfo_stok_sicrama_kaydet'];
BEGIN
  SET LOCAL lock_timeout = '5s';

  FOREACH t IN ARRAY tables LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE NOTICE 'tablo yok, atlandı: %', t;
      CONTINUE;
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I', t)::regclass) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t);
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', t, r);
      END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cfo_acceptance_reader') THEN
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO cfo_acceptance_reader', t);
      IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'cfo_acceptance_reader_select') THEN
        EXECUTE format('ALTER POLICY cfo_acceptance_reader_select ON public.%I TO cfo_acceptance_reader USING (true)', t);
      ELSE
        EXECUTE format('CREATE POLICY cfo_acceptance_reader_select ON public.%I FOR SELECT TO cfo_acceptance_reader USING (true)', t);
      END IF;
    END IF;
  END LOOP;

  FOR f IN
    SELECT p.oid::regprocedure FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' AND p.proname = ANY (write_functions)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f);
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM %I', f, r);
      END IF;
    END LOOP;
  END LOOP;
END
$$;
