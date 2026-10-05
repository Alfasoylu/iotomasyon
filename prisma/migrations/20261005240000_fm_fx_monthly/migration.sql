-- Financial Memory Step 1F — TCMB aylık USD/TRY referans kuru (USD ForexBuying, ayın 15'i veya önceki TCMB bülteni).
-- Yalnız additive: yeni tablo + view; mevcut tablo/kolon/semantik değişmez. Veri `scripts/fm-fx-tcmb.ts` çıktısıyla yüklenir.
-- Kaynak yalnız TCMB resmî arşivi; TCMB olmayan kur kullanılmaz (bülten yoksa ay satırı hiç yazılmaz → kalite U).
-- Geri alma: DROP VIEW fm_memory_fx_monthly; DROP TABLE fm_fx_monthly;

CREATE TABLE IF NOT EXISTS public.fm_fx_monthly (
  month date PRIMARY KEY CHECK (month = date_trunc('month', month)::date),
  usd_try_forex_buying numeric(12,4) NOT NULL CHECK (usd_try_forex_buying > 0),
  ref_date date NOT NULL,
  bulletin_no text NOT NULL,
  is_fallback_day boolean NOT NULL,
  source_url text NOT NULL,
  ingest_run_id uuid REFERENCES public.fm_ingest_run (id),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ref_date <= (month + interval '14 days')::date AND ref_date >= (month - interval '1 day')::date)
);

CREATE OR REPLACE VIEW public.fm_memory_fx_monthly AS
SELECT m.month, f.usd_try_forex_buying, f.ref_date, f.bulletin_no, f.is_fallback_day,
       public.fm_grade('usd_try', '*', m.month) AS usd_try_grade
FROM (SELECT generate_series(DATE '2020-08-01', date_trunc('month', current_date)::date, interval '1 month')::date AS month) m
LEFT JOIN public.fm_fx_monthly f ON f.month = m.month;

-- Politika: TCMB ayları yüklenen aralık A; yüklenmemiş sonraki aylar U.
UPDATE public.fm_quality_policy
   SET valid_to = DATE '2026-09-30', grade = 'A', reason = 'TCMB resmî bülteni (USD ForexBuying, ayın 15''i veya önceki iş günü); 74 ay doğrulandı'
 WHERE metric_key = 'usd_try' AND channel = '*' AND valid_from = DATE '2020-08-01' AND valid_to IS NULL;
INSERT INTO public.fm_quality_policy (metric_key, channel, valid_from, valid_to, grade, reason)
VALUES ('usd_try', '*', DATE '2026-10-01', NULL, 'U', 'Ayın 15''i henüz yayımlanmadı/yüklenmedi; sessiz fallback yok')
ON CONFLICT (metric_key, channel, valid_from) DO NOTHING;

ALTER TABLE public.fm_fx_monthly ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fm_fx_monthly FROM PUBLIC;
REVOKE ALL ON public.fm_memory_fx_monthly FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.fm_fx_monthly FROM anon; REVOKE ALL ON public.fm_memory_fx_monthly FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.fm_fx_monthly FROM authenticated; REVOKE ALL ON public.fm_memory_fx_monthly FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cfo_acceptance_reader') THEN
    GRANT SELECT ON public.fm_fx_monthly, public.fm_memory_fx_monthly TO cfo_acceptance_reader;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'fm_fx_monthly' AND policyname = 'cfo_acceptance_reader_select') THEN
      CREATE POLICY cfo_acceptance_reader_select ON public.fm_fx_monthly FOR SELECT TO cfo_acceptance_reader USING (true);
    END IF;
  END IF;
END
$$;
