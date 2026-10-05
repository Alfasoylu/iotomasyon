-- Step 1A — cfo_acceptance_reader güvenlik sıkılaştırması.
--
-- Hedef: reader = yalnız SELECT + RLS bypass yok + şema değişikliği yok + DML yok
-- + hassas tablo (cfo_secret) okunamaz + yazan fonksiyon çalıştıramaz.
-- Bu migration YALNIZ yetki/policy değiştirir; veri, tablo veya kolon değişmez.
-- Uygulama (Prisma) `postgres` rolüyle bağlanır ve bu değişikliklerden etkilenmez.
--
-- Idempotent: tekrar çalıştırmak güvenlidir. Rol yoksa (ör. CI/preview) hiçbir şey yapmaz.
--
-- Geri alma (yalnız bilinçli olarak, güvenlik gevşetilecekse):
--   GRANT SELECT ON public.cfo_secret TO cfo_acceptance_reader;   -- ÖNERİLMEZ
--   DROP POLICY cfo_acceptance_reader_select ON public.<tablo>;   -- yeni 11 tablo için
--   REVOKE SELECT ON public.<tablo> FROM cfo_acceptance_reader;

DO $$
DECLARE
  t text;
  f regprocedure;
  -- Step 1 için gereken, reader'a eksik olan 11 veri tablosu (yalnız SELECT).
  new_tables text[] := ARRAY[
    'TrendyolReturnRecord', 'HepsiburadaReturnRecord', 'trendyol_settlement_line',
    'trendyol_invoice', 'trendyol_invoice_line', 'trendyol_finance_import',
    'MonthlyExchangeRate', 'StockAdjustmentLog', 'SupplierProduct',
    'EntegraImportLog', 'MarketplaceProductMapping'
  ];
  -- Veri yazan (INSERT/UPDATE/DELETE içeren) public fonksiyonlar. PUBLIC'ten EXECUTE
  -- kaldırılır; anon/authenticated/service_role/postgres'in AÇIK grant'leri korunur.
  -- Tetikleyici fonksiyonlar (*_trg) hariç: doğrudan çağrılamazlar.
  write_functions text[] := ARRAY[
    'cfo_ay_kazanan_yaz', 'cfo_kilometre_yaz', 'cfo_sicrama_kapat',
    'cfo_stok_sicrama_kaydet', 'cfo_take_snapshot'
  ];
BEGIN
  -- Meşgul bir tabloda sessizce beklemek yerine hızlı ve temiz başarısız ol.
  SET LOCAL lock_timeout = '5s';
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cfo_acceptance_reader') THEN
    RAISE NOTICE 'cfo_acceptance_reader rolü yok; reader güvenlik migration''ı atlandı.';
    RETURN;
  END IF;

  -- 1) Sır tablosu: grant + RLS policy yolunu kapat.
  IF to_regclass('public.cfo_secret') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS cfo_acceptance_reader_select ON public.cfo_secret';
    EXECUTE 'REVOKE ALL ON TABLE public.cfo_secret FROM cfo_acceptance_reader';
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.cfo_secret'::regclass) THEN
      EXECUTE 'ALTER TABLE public.cfo_secret ENABLE ROW LEVEL SECURITY';
    END IF;
  END IF;

  -- 2) Eksik veri tabloları: yalnız SELECT + (RLS açık olduğu için) SELECT policy.
  FOREACH t IN ARRAY new_tables LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE NOTICE 'tablo yok, atlandı: %', t;
      CONTINUE;
    END IF;
    -- Zaten açıksa ACCESS EXCLUSIVE kilit almamak için yalnız gerekirse aç.
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I', t)::regclass) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO cfo_acceptance_reader', t);
    EXECUTE format('DROP POLICY IF EXISTS cfo_acceptance_reader_select ON public.%I', t);
    EXECUTE format('CREATE POLICY cfo_acceptance_reader_select ON public.%I FOR SELECT TO cfo_acceptance_reader USING (true)', t);
  END LOOP;

  -- 3) Yazan fonksiyonlar: reader PUBLIC üzerinden çalıştırabiliyordu.
  FOR f IN
    SELECT p.oid::regprocedure FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
      AND p.proname = ANY (write_functions)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM cfo_acceptance_reader', f);
  END LOOP;

  -- 4) Rol bayrakları: kasıtlı olarak yalnızca oturum varsayılanı; asıl koruma yukarıdaki
  --    yetki yokluğudur (default_transaction_read_only oturumda geri alınabilir).
  EXECUTE 'ALTER ROLE cfo_acceptance_reader SET default_transaction_read_only = on';
END
$$;
