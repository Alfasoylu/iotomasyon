-- Üretimde repoda migration'ı olmadan oluşturulmuş iki tablonun yakalanması (2026-10-07 parmak izi bulgusu). El kitabı
-- sahibi ikisini doğrudan üretimde açtı; AI CFO okuyor (Blok B merdiven, banka ileri taşıma kanal sözlüğü). DDL üretim
-- kataloğundan birebir alındı; üretimde IF NOT EXISTS ile no-op. Veri satırları taşınmaz (sahibin canlı girdisi).
CREATE TABLE IF NOT EXISTS public.cfo_kaldirac_basamak (
  basamak     smallint  NOT NULL,
  ad          text      NOT NULL,
  durum       text      NOT NULL,
  tl_kapasite numeric,
  tl_maliyet  numeric,
  kaynak      text      NOT NULL,
  guven       text      NOT NULL,
  note        text,
  "updatedAt" timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT cfo_kaldirac_basamak_pkey PRIMARY KEY (basamak),
  CONSTRAINT cfo_kaldirac_basamak_basamak_check CHECK (((basamak >= 1) AND (basamak <= 7))),
  CONSTRAINT cfo_kaldirac_basamak_durum_check CHECK ((durum = ANY (ARRAY['KULLANIMDA'::text, 'BOSTA'::text, 'TUKENDI'::text, 'OLCULMEDI'::text, 'BILINCLI_TUTULUYOR'::text]))),
  CONSTRAINT cfo_kaldirac_basamak_guven_check CHECK ((guven = ANY (ARRAY['KESIN'::text, 'OLCULDU'::text, 'TAHMINI'::text, 'OLCULMEDI'::text])))
);
COMMENT ON TABLE public.cfo_kaldirac_basamak IS 'El kitabi §2E kaldirac merdiveni. Motor YETERSIZ dediginde hangi basamagin kullanimda hangisinin bosta oldugu TL ile burada durur. AI CFO Blok B bunu okur. CFO her kosuda guncel tutar.';

CREATE TABLE IF NOT EXISTS public.cfo_kanal_sozluk (
  yazim        text    NOT NULL,
  kanonik      text    NOT NULL,
  banka        text,
  kaynak_tablo text    NOT NULL,
  gozlem       integer,
  guven        text    NOT NULL,
  note         text,
  "updatedAt"  timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT cfo_kanal_sozluk_pkey PRIMARY KEY (yazim),
  CONSTRAINT cfo_kanal_sozluk_guven_check CHECK ((guven = ANY (ARRAY['OLCULDU'::text, 'TAHMINI'::text, 'OLCULMEDI'::text])))
);
COMMENT ON TABLE public.cfo_kanal_sozluk IS 'Kanal ve banka adlarinin tek sozlugu. AYNI kanal 4 tabloda 3 ayri yazimla duruyor (cfo_receivable "Idefix" / cfo_pay_obs "IDEFIX_MOKA" / cfo_satis_birim_duz "IDEFIX" / fm_sales_channel_month "IDEFIX"). Join yazan her kod BURADAN gecer. El kitabi §2F-17.';

-- Üretimdeki erişim: RLS açık, politika yok; yalnız postgres (uygulama) ve service_role. Data API kapalı.
ALTER TABLE public.cfo_kaldirac_basamak ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cfo_kanal_sozluk ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.cfo_kaldirac_basamak, public.cfo_kanal_sozluk FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.cfo_kaldirac_basamak, public.cfo_kanal_sozluk FROM authenticated; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cfo_acceptance_reader') THEN
    REVOKE ALL ON public.cfo_kaldirac_basamak, public.cfo_kanal_sozluk FROM cfo_acceptance_reader; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON public.cfo_kaldirac_basamak, public.cfo_kanal_sozluk TO service_role; END IF;
END $$;
