-- Market Scout foundation (PR3) — dış pazar istihbaratı. Forecast V2'den, sipariş tablolarından ve borç kapısından TAMAMEN ayrı.
-- Yalnız yeni market_* nesneleri oluşturur; mevcut hiçbir tabloya (candidates/scores/signals_daily/decisions dahil) dokunmaz.
-- Gözlemler APPEND-ONLY (UPDATE/DELETE tetikleyiciyle reddedilir); her kayıt kaynak + kalite derecesi + kanıt + observed_at/known_at taşır.
-- observed_at = kaynakta görüldüğü an; known_at = sisteme kaydedildiği an (sunucu saati). Geçmiş replay'de known_at <= as_of filtresi (no look-ahead).
-- Güvenlik: RLS açık, anon/authenticated/PUBLIC yetkisi yok (uygulama postgres ile bağlanır).

CREATE OR REPLACE FUNCTION public.market_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'market_append_only: % on %.% is not allowed (append-only observation table)', TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME;
END
$$;

-- Kaynak ve kalite sözlüğü (CHECK ile; uygulama lib/market/sources.ts ile aynı listeyi kullanır)
--   A = doğrudan resmi/yapılandırılmış kaynak · B = bir insanın gördüğü/girdiği kamuya açık sayfa · C = birden çok gözlemden türetilmiş
--   D = sezgisel / LLM tahmini · UNKNOWN = yok

CREATE TABLE IF NOT EXISTS public.market_seller (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  provider text NOT NULL CHECK (provider IN ('TRENDYOL', 'ALIBABA', '1688', 'MADE_IN_CHINA', 'OTHER')),
  external_id text NOT NULL,
  slug text,
  url text,
  first_source text NOT NULL,
  first_known_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT market_seller_provider_external_key UNIQUE (provider, external_id)
);

CREATE TABLE IF NOT EXISTS public.market_seller_observation (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  seller_id uuid NOT NULL REFERENCES public.market_seller(id),
  source text NOT NULL CHECK (source IN ('TRENDYOL_SITEMAP', 'MANUAL_BROWSER_CAPTURE', 'LICENSED_PROVIDER', 'LEGACY_SCOUT_IMPORT')),
  observed_at timestamptz NOT NULL,
  known_at timestamptz DEFAULT now() NOT NULL,
  seller_name text,
  slug text,
  url text,
  data_grade text NOT NULL CHECK (data_grade IN ('A', 'B', 'C', 'D', 'UNKNOWN')),
  evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now() NOT NULL,
  CHECK (observed_at <= known_at + interval '5 minutes')
);

CREATE TABLE IF NOT EXISTS public.market_watchlist (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  provider text DEFAULT 'TRENDYOL' NOT NULL CHECK (provider IN ('TRENDYOL', 'ALIBABA', '1688', 'MADE_IN_CHINA', 'OTHER')),
  seller_name text NOT NULL,
  seller_url text,
  seller_slug text,
  seller_external_id text,
  seller_id uuid REFERENCES public.market_seller(id),
  resolution text DEFAULT 'UNRESOLVED' NOT NULL CHECK (resolution IN ('SITEMAP', 'URL_PARSE', 'UNRESOLVED')),
  resolution_evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
  -- Kullanıcının BEYAN ettiği marka slug'ları (sitemap ürünleri yalnız markaya bağlıdır; mağaza-ürün ilişkisi sitemap'ten çıkmaz)
  declared_brand_slugs text[] DEFAULT '{}'::text[] NOT NULL,
  active boolean DEFAULT true NOT NULL,
  priority integer DEFAULT 3 NOT NULL CHECK (priority BETWEEN 1 AND 5),
  notes text,
  added_by text,
  added_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS market_watchlist_provider_seller_key ON public.market_watchlist (provider, seller_external_id) WHERE seller_external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.market_product (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  provider text NOT NULL CHECK (provider IN ('TRENDYOL', 'ALIBABA', '1688', 'MADE_IN_CHINA', 'OTHER')),
  external_id text NOT NULL,
  url text,
  brand_slug text,
  title_slug text,
  first_source text NOT NULL,
  first_known_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT market_product_provider_external_key UNIQUE (provider, external_id)
);
CREATE INDEX IF NOT EXISTS market_product_brand_idx ON public.market_product (provider, brand_slug);

CREATE TABLE IF NOT EXISTS public.market_product_observation (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.market_product(id),
  source text NOT NULL CHECK (source IN ('TRENDYOL_SITEMAP', 'MANUAL_BROWSER_CAPTURE', 'LICENSED_PROVIDER', 'LEGACY_SCOUT_IMPORT')),
  observed_at timestamptz NOT NULL,
  known_at timestamptz DEFAULT now() NOT NULL,
  source_url text,
  seller_name text,
  seller_external_id text,
  raw_title text,
  normalized_title text,
  price numeric CHECK (price IS NULL OR price >= 0),
  currency text,
  rating numeric CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5)),
  review_count integer CHECK (review_count IS NULL OR review_count >= 0),
  -- Görünen kamu sinyali olduğu gibi (ör. "100+ / son 3 gün"); gerçek satış adedi DEĞİLDİR ve bu tabloda satış adedi kolonu YOKTUR
  public_sales_signal text,
  badge text,
  ranking text,
  availability text,
  image_url text,
  data_grade text NOT NULL CHECK (data_grade IN ('A', 'B', 'C', 'D', 'UNKNOWN')),
  evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
  notes text,
  captured_by text,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now() NOT NULL,
  CHECK (observed_at <= known_at + interval '5 minutes'),
  -- Sitemap mağaza bilgisi taşımaz: mağaza-ürün ilişkisi sitemap'ten üretilemez
  CHECK (source <> 'TRENDYOL_SITEMAP' OR (seller_name IS NULL AND seller_external_id IS NULL AND price IS NULL AND rating IS NULL
    AND review_count IS NULL AND public_sales_signal IS NULL))
);
CREATE INDEX IF NOT EXISTS market_product_observation_product_idx ON public.market_product_observation (product_id, known_at);

-- Resmi Trendyol buybox servisi — yalnız BİZİM barkodlarımız. Rakip satış adedi DEĞİLDİR (kolon yok).
CREATE TABLE IF NOT EXISTS public.market_buybox_observation (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  barcode text NOT NULL,
  product_ref text,
  source text DEFAULT 'TRENDYOL_OFFICIAL_API' NOT NULL CHECK (source = 'TRENDYOL_OFFICIAL_API'),
  observed_at timestamptz NOT NULL,
  known_at timestamptz DEFAULT now() NOT NULL,
  our_buybox_rank integer,
  buybox_price numeric,
  multiple_sellers boolean,
  second_price numeric,
  third_price numeric,
  data_grade text DEFAULT 'A' NOT NULL CHECK (data_grade = 'A'),
  run_id uuid,
  evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now() NOT NULL,
  CHECK (observed_at <= known_at + interval '5 minutes')
);
CREATE INDEX IF NOT EXISTS market_buybox_observation_barcode_idx ON public.market_buybox_observation (barcode, known_at);

CREATE TABLE IF NOT EXISTS public.market_keyword (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  keyword text NOT NULL,
  locale text DEFAULT 'tr-TR' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT market_keyword_key UNIQUE (keyword, locale)
);

-- Google Trends = normalize ilgi (0–100), arama hacmi DEĞİL; otomatik tamamlama = öneri listesi, hacim DEĞİL. Hacim kolonu YOK.
CREATE TABLE IF NOT EXISTS public.market_keyword_observation (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  keyword_id uuid NOT NULL REFERENCES public.market_keyword(id),
  source text NOT NULL CHECK (source IN ('GOOGLE_OFFICIAL', 'GOOGLE_AUTOCOMPLETE_EXPERIMENTAL', 'LICENSED_PROVIDER')),
  metric_kind text NOT NULL CHECK (metric_kind IN ('TREND_INTEREST_INDEX', 'AUTOCOMPLETE_SUGGESTIONS')),
  observed_at timestamptz NOT NULL,
  known_at timestamptz DEFAULT now() NOT NULL,
  interest_index numeric CHECK (interest_index IS NULL OR (interest_index >= 0 AND interest_index <= 100)),
  period text,
  suggestions jsonb,
  data_grade text NOT NULL CHECK (data_grade IN ('A', 'B', 'C', 'D', 'UNKNOWN')),
  evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now() NOT NULL,
  CHECK (observed_at <= known_at + interval '5 minutes'),
  CHECK (metric_kind <> 'AUTOCOMPLETE_SUGGESTIONS' OR interest_index IS NULL),
  CHECK (metric_kind <> 'TREND_INTEREST_INDEX' OR source <> 'GOOGLE_AUTOCOMPLETE_EXPERIMENTAL')
);

-- Çin tedarik adayları (bu PR'de yalnız MANUAL_SOURCING). Görünen fiyat iniş maliyeti DEĞİLDİR: iniş maliyeti varsayılan UNKNOWN.
CREATE TABLE IF NOT EXISTS public.market_sourcing_candidate (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  opportunity_id uuid,
  supersedes_id uuid,
  source text NOT NULL CHECK (source IN ('MANUAL_SOURCING', 'ALIBABA_OFFICIAL', 'LICENSED_PROVIDER', 'LEGACY_SCOUT_IMPORT')),
  provider text NOT NULL CHECK (provider IN ('ALIBABA', '1688', 'MADE_IN_CHINA', 'OTHER')),
  observed_at timestamptz NOT NULL,
  known_at timestamptz DEFAULT now() NOT NULL,
  source_url text,
  supplier_name text,
  supplier_location text,
  title text,
  displayed_price_min numeric CHECK (displayed_price_min IS NULL OR displayed_price_min >= 0),
  displayed_price_max numeric CHECK (displayed_price_max IS NULL OR displayed_price_max >= 0),
  currency text,
  moq integer CHECK (moq IS NULL OR moq > 0),
  material text,
  dimensions text,
  image_url text,
  notes text,
  landed_cost_status text DEFAULT 'UNKNOWN' NOT NULL CHECK (landed_cost_status IN ('UNKNOWN', 'VERIFIED')),
  landed_cost_try numeric,
  landed_cost_evidence jsonb,
  data_grade text NOT NULL CHECK (data_grade IN ('A', 'B', 'C', 'D', 'UNKNOWN')),
  evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_by text,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now() NOT NULL,
  CHECK (observed_at <= known_at + interval '5 minutes'),
  CHECK (displayed_price_min IS NULL OR displayed_price_max IS NULL OR displayed_price_min <= displayed_price_max),
  CHECK ((landed_cost_status = 'UNKNOWN' AND landed_cost_try IS NULL) OR (landed_cost_status = 'VERIFIED' AND landed_cost_try IS NOT NULL AND landed_cost_evidence IS NOT NULL)),
  CHECK (source <> 'MANUAL_SOURCING' OR landed_cost_status = 'UNKNOWN')
);

-- Üretilmiş arama sorguları — gözlem DEĞİL (kind sabit GENERATED_QUERY)
CREATE TABLE IF NOT EXISTS public.market_generated_query (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  kind text DEFAULT 'GENERATED_QUERY' NOT NULL CHECK (kind = 'GENERATED_QUERY'),
  subject_kind text NOT NULL CHECK (subject_kind IN ('OPPORTUNITY', 'MARKET_PRODUCT')),
  subject_id uuid NOT NULL,
  language text NOT NULL CHECK (language IN ('en', 'zh')),
  query text NOT NULL,
  generator text NOT NULL,
  generator_version text NOT NULL,
  input_terms jsonb DEFAULT '[]'::jsonb NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.market_product_match (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  left_kind text NOT NULL CHECK (left_kind IN ('ALFAS_PRODUCT', 'MARKET_PRODUCT', 'SOURCING_CANDIDATE')),
  left_ref text NOT NULL,
  right_kind text NOT NULL CHECK (right_kind IN ('ALFAS_PRODUCT', 'MARKET_PRODUCT', 'SOURCING_CANDIDATE')),
  right_ref text NOT NULL,
  method text NOT NULL CHECK (method IN ('DETERMINISTIC', 'LLM_ASSISTED')),
  classification text NOT NULL CHECK (classification IN ('EXACT_LIKELY', 'SIMILAR', 'CATEGORY_ANALOG', 'WEAK', 'NO_MATCH')),
  score numeric NOT NULL CHECK (score >= 0 AND score <= 100),
  evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
  input_snapshot_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  scoring_version text NOT NULL,
  data_grade text NOT NULL CHECK (data_grade IN ('A', 'B', 'C', 'D', 'UNKNOWN')),
  computed_at timestamptz DEFAULT now() NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  -- LLM katkısı deterministik gerçek gibi saklanmaz
  CHECK (method <> 'LLM_ASSISTED' OR data_grade = 'D')
);

CREATE TABLE IF NOT EXISTS public.market_opportunity (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  title text NOT NULL,
  state text DEFAULT 'DISCOVERED' NOT NULL CHECK (state IN ('DISCOVERED', 'WATCHING', 'SOURCING_CANDIDATE', 'COST_VERIFICATION_REQUIRED', 'READY_FOR_HUMAN_REVIEW', 'REJECTED')),
  alfas_category_ref text,
  category_fit jsonb,
  momentum jsonb,
  opportunity_score jsonb,
  evidence_snapshot_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  scoring_version text NOT NULL,
  first_observed_at timestamptz NOT NULL,
  cfo_product_candidate_id bigint,
  urun_aday_sku text,
  legacy_ref jsonb,
  created_by text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS market_opportunity_legacy_key ON public.market_opportunity ((legacy_ref ->> 'legacy_candidate_id')) WHERE legacy_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.market_opportunity_event (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  opportunity_id uuid NOT NULL REFERENCES public.market_opportunity(id),
  from_state text,
  to_state text NOT NULL CHECK (to_state IN ('DISCOVERED', 'WATCHING', 'SOURCING_CANDIDATE', 'COST_VERIFICATION_REQUIRED', 'READY_FOR_HUMAN_REVIEW', 'REJECTED')),
  actor text NOT NULL,
  reason text,
  evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  known_at timestamptz DEFAULT now() NOT NULL,
  idempotency_key text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS public.market_collection_run (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  provider text NOT NULL,
  trigger text NOT NULL CHECK (trigger IN ('MANUAL', 'SCHEDULED', 'TEST')),
  started_at timestamptz DEFAULT now() NOT NULL,
  finished_at timestamptz,
  status text DEFAULT 'RUNNING' NOT NULL CHECK (status IN ('RUNNING', 'OK', 'PARTIAL', 'FAILED', 'SKIPPED_UNCHANGED')),
  stats jsonb DEFAULT '{}'::jsonb NOT NULL,
  error_code text
);

-- Append-only tetikleyicileri
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['market_seller', 'market_seller_observation', 'market_product', 'market_product_observation', 'market_buybox_observation',
    'market_keyword', 'market_keyword_observation', 'market_sourcing_candidate', 'market_generated_query', 'market_product_match', 'market_opportunity_event'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_append_only', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.market_append_only()', t || '_append_only', t);
  END LOOP;
END
$$;

-- Güvenlik: RLS açık; anon/authenticated/PUBLIC yok; okuyucu rol yalnız SELECT; fonksiyon yalnız postgres/service_role.
DO $$
DECLARE o text; r text;
BEGIN
  FOREACH o IN ARRAY ARRAY['market_seller', 'market_seller_observation', 'market_watchlist', 'market_product', 'market_product_observation', 'market_buybox_observation',
    'market_keyword', 'market_keyword_observation', 'market_sourcing_candidate', 'market_generated_query', 'market_product_match', 'market_opportunity',
    'market_opportunity_event', 'market_collection_run'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', o);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', o);
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN EXECUTE format('REVOKE ALL ON public.%I FROM %I', o, r); END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cfo_acceptance_reader') THEN
      EXECUTE format('GRANT SELECT ON public.%I TO cfo_acceptance_reader', o);
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = o AND policyname = 'cfo_acceptance_reader_select') THEN
        EXECUTE format('CREATE POLICY cfo_acceptance_reader_select ON public.%I FOR SELECT TO cfo_acceptance_reader USING (true)', o);
      END IF;
    END IF;
  END LOOP;
  REVOKE EXECUTE ON FUNCTION public.market_append_only() FROM PUBLIC;
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN EXECUTE format('REVOKE EXECUTE ON FUNCTION public.market_append_only() FROM %I', r); END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN GRANT EXECUTE ON FUNCTION public.market_append_only() TO service_role; END IF;
END
$$;
