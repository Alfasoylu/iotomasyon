-- Güvenlik: SECURITY DEFINER (security_invoker olmayan) view'lardan anon/authenticated erişimini kaldırır + gelecekteki public nesnelerin
-- anon/authenticated'a otomatik açılmasını engeller. View semantiği (SECURITY DEFINER), sahip, tanım DEĞİŞMEZ; veri değişmez; DROP yok.
--
-- Sorun: owner=postgres view'lar sahibin yetkisiyle (RLS bypass) çalışır; Supabase varsayılan yetkileri bu view'lara anon/authenticated SELECT veriyordu
-- (advisor: security_definer_view, ERROR; 40 view: cfo_servet, cfo_satis_siparis, cfo_nakit_*, ...). Data API ile okunabiliyordu.
-- Bağımlılık denetimi (docs/SECURITY-DEFINER-VIEW-EXPOSURE-REPORT.md): hiçbir view'a anon/authenticated üzerinden erişim yok; uygulama Prisma/postgres ile,
-- CFO ajanı cfo_acceptance_reader ile, Edge Function service_role ile bağlanır. Bu rollerin yetkileri DEĞİŞMEZ.
--
-- 2. kısım — ALTER DEFAULT PRIVILEGES (yalnız bu migration'ı çalıştıran rolün [postgres] gelecekte public'te yaratacağı nesneler; mevcut nesnelere dokunmaz):
--   tablo/fonksiyon/sequence için anon + authenticated otomatik grant'i kaldırılır. service_role/postgres varsayılanları korunur.
--   NOT: PostgreSQL'in global varsayılanı (PUBLIC EXECUTE) bu migration'la kaldırılmaz (tüm şemaları etkilerdi); yeni SECURITY DEFINER fonksiyonlar açıkça
--   `REVOKE EXECUTE ... FROM PUBLIC` almalıdır. Normal (invoker) fonksiyonlar anon'un tablo yetkisi olmadığından zararsızdır.
--   Etki: yeni tablo/view/fonksiyonlar Data API'ye kendiliğinden açılmaz (uygulama zaten yalnız Prisma kullanır). İstenen nesne için açık GRANT yazılmalıdır.
--
-- Idempotent. Geri alma (önerilmez): GRANT SELECT ON <view> TO anon, authenticated;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated; (FUNCTIONS, SEQUENCES için de)

DO $$
DECLARE
  v regclass;
  r text;
BEGIN
  SET LOCAL lock_timeout = '5s';

  FOR v IN
    SELECT c.oid::regclass FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'v'
      AND NOT ('security_invoker=true' = ANY (coalesce(c.reloptions, '{}'::text[])))
  LOOP
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', v);
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON %s FROM %I', v, r);
      END IF;
    END LOOP;
  END LOOP;

  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
    END IF;
  END LOOP;
END
$$;
