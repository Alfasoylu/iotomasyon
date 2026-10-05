-- Financial Memory Step 1C — şema: kalite politikası + kaynak önceliği + flag sözlüğü + lineage + satış hafızası.
--
-- Normalize model (aynı gerçek satırlara JSON olarak tekrar edilmez):
--   fm_metric / fm_quality_flag / fm_source_priority / fm_quality_policy  → küçük sözlük/politika tabloları
--   fm_ingest_run                                                          → lineage/versiyon (değişken kısım jsonb)
--   fm_sales_company_day, fm_sales_channel_month, fm_sales_sku_month, fm_sales_sku_day → tipli değer geçmişi
--   fm_memory_* view'ları                                                  → CFO hot-path: değer + kalite (A/B/C/D/U) + flag + knownAt
--
-- Kalite = A/B/C/D/U + açık flag. Sayısal "confidence" bilinçli olarak YOK (kalibre değil).
--   A doğrulanmış (çok kaynaklı) · B güvenilir · C yön gösterir · D yalnız arşiv · U bilinmiyor (değer NULL/yok)
-- economic_date = satışın gerçekleştiği gün; known_at_* = CFO'nun bilgiyi bilebileceği an (kaynak import/sync zamanı).
--
-- Yalnız additive: yeni tablolar + view'lar. Mevcut tablo/kolon değişmez. Her tabloda RLS açık (MIGRATION-SAFETY).
-- Geri alma: DROP VIEW fm_memory_*; DROP TABLE fm_sales_sku_day, fm_sales_sku_month, fm_sales_channel_month,
--            fm_sales_company_day, fm_ingest_run, fm_quality_policy, fm_source_priority, fm_quality_flag, fm_metric;

-- ───────────── Sözlükler ─────────────
CREATE TABLE IF NOT EXISTS public.fm_metric (
  metric_key text PRIMARY KEY,
  domain text NOT NULL,
  unit text NOT NULL,
  headline boolean NOT NULL DEFAULT false,
  description text NOT NULL,
  definition_version integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.fm_quality_flag (
  flag text PRIMARY KEY,
  severity text NOT NULL CHECK (severity IN ('info', 'warn', 'block')),
  description text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.fm_source_priority (
  channel text NOT NULL,
  valid_from date NOT NULL,
  valid_to date,
  primary_source text NOT NULL,
  secondary_source text,
  merge_rule text NOT NULL,
  evidence text NOT NULL,
  rule_version integer NOT NULL DEFAULT 1,
  PRIMARY KEY (channel, valid_from),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE TABLE IF NOT EXISTS public.fm_quality_policy (
  metric_key text NOT NULL REFERENCES public.fm_metric (metric_key),
  channel text NOT NULL DEFAULT '*',
  valid_from date NOT NULL,
  valid_to date,
  grade char(1) NOT NULL CHECK (grade IN ('A', 'B', 'C', 'D', 'U')),
  reason text NOT NULL,
  policy_version integer NOT NULL DEFAULT 1,
  PRIMARY KEY (metric_key, channel, valid_from),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

-- ───────────── Lineage / versiyon ─────────────
CREATE TABLE IF NOT EXISTS public.fm_ingest_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed', 'dry_run')),
  source_rule_version integer NOT NULL DEFAULT 1,
  definition_version integer NOT NULL DEFAULT 1,
  range_from date,
  range_to date,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  rows_written integer,
  -- Yalnız gerçekten değişken kaynak/provenance bilgisi (kaynak watermark'ları, kod referansı).
  lineage jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- ───────────── Satış hafızası (tipli; NULL = bilinmiyor) ─────────────
-- Ortak ölçüler:
--   revenue_incl_vat_try  başlık gelir (KDV dahil, COUNTED satırlar). Gelir kâr DEĞİLDİR.
--   revenue_ex_vat_try / vat_try  yalnız TÜM sayılan satırlarda kaynak değeri varsa dolu; aksi halde NULL.
--   revenue_legacy_textile_try  gelirin legacy tekstil payı (ALFAS = revenue - bu).
--   units  set/paket düzeltmeli adet; orders  benzersiz sipariş.
--   return_signal_orders / cancel_signal_orders  YALNIZ durum bayrağı sinyali; iade/iptal GERÇEĞİ DEĞİLDİR (returns = U).
CREATE TABLE IF NOT EXISTS public.fm_sales_company_day (
  economic_date date PRIMARY KEY,
  revenue_incl_vat_try numeric(16, 2) NOT NULL,
  revenue_ex_vat_try numeric(16, 2),
  vat_try numeric(16, 2),
  revenue_legacy_textile_try numeric(16, 2) NOT NULL DEFAULT 0,
  units numeric(14, 2) NOT NULL,
  orders integer NOT NULL,
  return_signal_orders integer NOT NULL DEFAULT 0,
  cancel_signal_orders integer NOT NULL DEFAULT 0,
  known_at_min timestamp,
  known_at_max timestamp,
  flags text[] NOT NULL DEFAULT '{}',
  ingest_run_id uuid REFERENCES public.fm_ingest_run (id)
);

CREATE TABLE IF NOT EXISTS public.fm_sales_channel_month (
  month date NOT NULL CHECK (month = date_trunc('month', month)::date),
  channel text NOT NULL,
  revenue_incl_vat_try numeric(16, 2) NOT NULL,
  revenue_ex_vat_try numeric(16, 2),
  vat_try numeric(16, 2),
  revenue_legacy_textile_try numeric(16, 2) NOT NULL DEFAULT 0,
  units numeric(14, 2) NOT NULL,
  orders integer NOT NULL,
  return_signal_orders integer NOT NULL DEFAULT 0,
  cancel_signal_orders integer NOT NULL DEFAULT 0,
  known_at_min timestamp,
  known_at_max timestamp,
  flags text[] NOT NULL DEFAULT '{}',
  ingest_run_id uuid REFERENCES public.fm_ingest_run (id),
  PRIMARY KEY (month, channel)
);

-- SKU kimliği: eşleşmiş ürün 'P:<productId>', eşleşmemiş 'R:<normalize ham kod>'. legacy_business NULL = ALFAS ürünü.
CREATE TABLE IF NOT EXISTS public.fm_sales_sku_month (
  month date NOT NULL CHECK (month = date_trunc('month', month)::date),
  sku_key text NOT NULL,
  product_id text,
  sku_label text,
  sku_mapped boolean NOT NULL,
  legacy_business text,
  revenue_incl_vat_try numeric(16, 2) NOT NULL,
  revenue_ex_vat_try numeric(16, 2),
  units numeric(14, 2) NOT NULL,
  orders integer NOT NULL,
  known_at_max timestamp,
  flags text[] NOT NULL DEFAULT '{}',
  ingest_run_id uuid REFERENCES public.fm_ingest_run (id),
  PRIMARY KEY (month, sku_key)
);

-- Yalnız son ~400 gün; türetilmiş, silinip yeniden hesaplanabilir (ham kaynak korunur).
CREATE TABLE IF NOT EXISTS public.fm_sales_sku_day (
  economic_date date NOT NULL,
  sku_key text NOT NULL,
  product_id text,
  sku_label text,
  sku_mapped boolean NOT NULL,
  legacy_business text,
  revenue_incl_vat_try numeric(16, 2) NOT NULL,
  units numeric(14, 2) NOT NULL,
  orders integer NOT NULL,
  known_at_max timestamp,
  flags text[] NOT NULL DEFAULT '{}',
  ingest_run_id uuid REFERENCES public.fm_ingest_run (id),
  PRIMARY KEY (economic_date, sku_key)
);
CREATE INDEX IF NOT EXISTS fm_sales_sku_month_product_idx ON public.fm_sales_sku_month (product_id);
CREATE INDEX IF NOT EXISTS fm_sales_sku_day_product_idx ON public.fm_sales_sku_day (product_id);

-- ───────────── Kalite sorgusu ─────────────
-- Tarih+kanal için en özgül politika; yoksa 'U' (bilinmiyor — ASLA sessiz yüksek güven yok).
CREATE OR REPLACE FUNCTION public.fm_grade(p_metric text, p_channel text, p_date date)
RETURNS char(1) LANGUAGE sql STABLE AS $$
  SELECT coalesce((
    SELECT q.grade FROM public.fm_quality_policy q
    WHERE q.metric_key = p_metric AND q.channel IN (p_channel, '*')
      AND q.valid_from <= p_date AND (q.valid_to IS NULL OR q.valid_to >= p_date)
    ORDER BY (q.channel = p_channel) DESC, q.valid_from DESC
    LIMIT 1
  ), 'U')::char(1)
$$;

-- Aylık satır için kalite = ayın en kötü günü (muhafazakâr): 'U' > 'D' > 'C' > 'B' > 'A' (karakter sırası).
CREATE OR REPLACE FUNCTION public.fm_grade_month(p_metric text, p_channel text, p_month date)
RETURNS char(1) LANGUAGE sql STABLE AS $$
  SELECT greatest(public.fm_grade(p_metric, p_channel, p_month),
                  public.fm_grade(p_metric, p_channel, (p_month + interval '1 month - 1 day')::date))::char(1)
$$;

-- ───────────── CFO hot-path view'ları (değer + kalite + flag + knownAt) ─────────────
CREATE OR REPLACE VIEW public.fm_memory_sales_company_day WITH (security_invoker = true) AS
SELECT f.economic_date, f.revenue_incl_vat_try, f.revenue_ex_vat_try, f.vat_try, f.revenue_legacy_textile_try,
       f.revenue_incl_vat_try - f.revenue_legacy_textile_try AS revenue_alfas_incl_vat_try,
       f.units, f.orders, f.return_signal_orders, f.cancel_signal_orders,
       public.fm_grade('revenue_incl_vat_try', '*', f.economic_date) AS revenue_grade,
       public.fm_grade('revenue_ex_vat_try', '*', f.economic_date) AS revenue_ex_vat_grade,
       public.fm_grade('units', '*', f.economic_date) AS units_grade,
       public.fm_grade('orders', '*', f.economic_date) AS orders_grade,
       public.fm_grade('returns', '*', f.economic_date) AS returns_grade,
       f.known_at_min, f.known_at_max, f.flags, f.ingest_run_id
FROM public.fm_sales_company_day f;

CREATE OR REPLACE VIEW public.fm_memory_sales_channel_month WITH (security_invoker = true) AS
SELECT f.month, f.channel, f.revenue_incl_vat_try, f.revenue_ex_vat_try, f.vat_try, f.revenue_legacy_textile_try,
       f.revenue_incl_vat_try - f.revenue_legacy_textile_try AS revenue_alfas_incl_vat_try,
       f.units, f.orders, f.return_signal_orders, f.cancel_signal_orders,
       public.fm_grade_month('revenue_incl_vat_try', f.channel, f.month) AS revenue_grade,
       public.fm_grade_month('units', f.channel, f.month) AS units_grade,
       public.fm_grade_month('orders', f.channel, f.month) AS orders_grade,
       public.fm_grade_month('returns', f.channel, f.month) AS returns_grade,
       f.known_at_min, f.known_at_max, f.flags, f.ingest_run_id
FROM public.fm_sales_channel_month f;

CREATE OR REPLACE VIEW public.fm_memory_sales_sku_month WITH (security_invoker = true) AS
SELECT f.month, f.sku_key, f.product_id, f.sku_label, f.sku_mapped, f.legacy_business,
       f.revenue_incl_vat_try, f.revenue_ex_vat_try, f.units, f.orders,
       public.fm_grade_month('revenue_incl_vat_try', '*', f.month) AS revenue_grade,
       public.fm_grade_month('sku_identity', '*', f.month) AS sku_identity_grade,
       f.known_at_max, f.flags, f.ingest_run_id
FROM public.fm_sales_sku_month f;

CREATE OR REPLACE VIEW public.fm_memory_sales_sku_day WITH (security_invoker = true) AS
SELECT f.economic_date, f.sku_key, f.product_id, f.sku_label, f.sku_mapped, f.legacy_business,
       f.revenue_incl_vat_try, f.units, f.orders,
       public.fm_grade('revenue_incl_vat_try', '*', f.economic_date) AS revenue_grade,
       public.fm_grade('sku_identity', '*', f.economic_date) AS sku_identity_grade,
       f.known_at_max, f.flags, f.ingest_run_id
FROM public.fm_sales_sku_day f;

-- ───────────── Tohumlar: sözlük + kaynak önceliği + kalite politikası (Phase 0B kanıtları) ─────────────
INSERT INTO public.fm_metric (metric_key, domain, unit, headline, description) VALUES
 ('revenue_incl_vat_try', 'sales', 'TRY', true,  'Müşteriye yapılan toplam satış (KDV dahil). Canonical başlık gelir; kâr değildir.'),
 ('revenue_ex_vat_try',   'sales', 'TRY', false, 'KDV hariç satış; yalnız kaynakta varsa (Marketplace). Trendyol API satırlarında bilinmez.'),
 ('units',                'sales', 'unit', false, 'Set/paket düzeltmeli adet.'),
 ('orders',               'sales', 'count', false, 'Benzersiz sipariş sayısı.'),
 ('sku_identity',         'sales', 'ratio', false, 'Satışın katalog ürününe (productId) bağlı olma güveni; ciro ağırlıklı.'),
 ('returns',              'sales', 'TRY', false, 'Gerçek iade. İade tabloları boş; durum bayrağı yalnız kısmi sinyaldir.'),
 ('historical_cost',      'cost', 'TRY', false, 'Dönemine ait birim maliyet. Bugünkü maliyet geçmişe uygulanmaz.'),
 ('contribution_profit',  'profit', 'TRY', false, 'Katkı kârı (gelir − maliyet − komisyon − kargo − iade).'),
 ('inventory_units',      'inventory', 'unit', false, 'Gün sonu stok adedi (XmlStockChangeLog seviye zinciri).'),
 ('inventory_value_try',  'inventory', 'TRY', false, 'Stok değeri; geçmiş maliyet olmadan güvenilir değildir.'),
 ('cash_try',             'balance', 'TRY', false, 'Banka nakdi.'),
 ('debt_try',             'balance', 'TRY', false, 'Toplam borç.'),
 ('receivables_try',      'balance', 'TRY', false, 'Alacaklar.'),
 ('net_capital_try',      'balance', 'TRY', true,  'Net ticari sermaye (cfo_servet v2 tanımı; 2026-09-11 öncesi karşılaştırılamaz).'),
 ('usd_try',              'fx', 'rate', false, 'TCMB USD döviz alış, ayın 15''i (yoksa önceki iş günü).')
ON CONFLICT (metric_key) DO NOTHING;

INSERT INTO public.fm_quality_flag (flag, severity, description) VALUES
 ('gap_filled_secondary',          'warn', 'Birincil kaynakta eksik sipariş ikincil kaynaktan dolduruldu (Şubat 2026 Entegra deliği).'),
 ('fallback_marketplace_only',     'warn', 'Trendyol API''de henüz görünmeyen sipariş Marketplace''ten yedeklendi.'),
 ('possible_cross_source_duplicate','warn', 'Gap-fill satırı Marketplace''te tarih+SKU+adet+tutar aynı bir satıra benziyor (silinmedi).'),
 ('status_snapshot_stale',         'warn', 'Durum import anında dondu (2022 öncesi); iptal/iade eksik yakalanmış olabilir.'),
 ('historical_bulk_import',        'info', 'Geçmiş 2026-05-19''da toplu içe aktarıldı; knownAt bilgi tarihidir, satış tarihi değil.'),
 ('ex_vat_unknown',                'info', 'KDV hariç tutar kaynakta yok.'),
 ('zero_amount',                   'info', 'Tutarı 0 olan satış satırı.'),
 ('return_from_marketplace_status','info', 'Trendyol siparişi Marketplace İade-İptal durumuyla iade/iptal sayıldı.'),
 ('ideasoft_v1_excluded',          'info', 'IDEASOFT; eski cfo_satis_birim view''ı dışlıyordu, canonical dahil eder.'),
 ('legacy_textile',                'info', 'Kapanmış Armine/AlinModest tekstil hattı; ALFAS ürün performansından ayrı.'),
 ('test_order',                    'info', 'Test siparişi (gelire girmez).'),
 ('invalid_order_id',              'warn', 'Kaynakta geçersiz sipariş kimliği.'),
 ('set_qty_corrected',             'info', 'Set/paket satırında adet düzeltildi; gelir değişmedi.'),
 ('ex_vat_partial',                'info', 'Toplamın yalnız bir kısmında KDV hariç tutar var; toplam NULL bırakıldı.'),
 ('returns_unknown',               'block', 'Gerçek iade bilinmiyor; kâr/katkı iade düşülmeden yorumlanamaz.'),
 ('unknown_cost_history',          'block', 'Geçmiş maliyet yok; bugünkü maliyet geçmişe uygulanmadı.'),
 ('definition_break_2026_09_10',   'block', 'Net sermaye tanımı 2026-09-10 19:38''de değişti; öncesi aynı seri değildir.'),
 ('fx_non_tcmb',                   'block', 'Kur TCMB kaynaklı değil.')
ON CONFLICT (flag) DO NOTHING;

INSERT INTO public.fm_source_priority (channel, valid_from, valid_to, primary_source, secondary_source, merge_rule, evidence) VALUES
 ('TRENDYOL', DATE '2020-08-01', DATE '2026-05-03', 'MarketplaceSalesRecord', 'TrendyolSalesRecord',
  'primary tamamlar; secondary yalnız primary''de OLMAYAN sipariş anahtarlarını doldurur (T_GAP_FILL)',
  'Phase 0B: Şubat 2026 Marketplace''te 2026-02-08..20 deliği; Trendyol kayıtları o aralıkta disjoint; Nisan sonu-Mayıs 3 tamamen eşleşti'),
 ('TRENDYOL', DATE '2026-05-04', NULL, 'TrendyolSalesRecord', 'MarketplaceSalesRecord',
  'primary birincil; Marketplace yalnız Trendyol''da OLMAYAN siparişler için yedek (M_FALLBACK); Marketplace İade-İptal durumu eşleşen siparişe işlenir',
  'Phase 0B: 2026-05-04''ten itibaren Marketplace satırlarının %100''ü Trendyol''da mevcut; Trendyol-only 244 sipariş iptal; Trendyol Delivered ↔ Marketplace İade-İptal 224 sipariş'),
 ('*', DATE '2020-08-01', NULL, 'MarketplaceSalesRecord', NULL,
  'tek kaynak (Hepsiburada/N11/IDEASOFT/EPTT/Pazarama/... için API satış tablosu yok veya boş)',
  'HepsiburadaSalesRecord boş; diğer kanallar yalnız Entegra importu')
ON CONFLICT (channel, valid_from) DO NOTHING;

INSERT INTO public.fm_quality_policy (metric_key, channel, valid_from, valid_to, grade, reason) VALUES
 ('revenue_incl_vat_try','*',DATE '2020-08-01',DATE '2021-12-31','C','Tek kaynak; durum import anında dondu, iptal/iade eksik yakalanmış (~%4-5 fazla olabilir)'),
 ('revenue_incl_vat_try','*',DATE '2022-01-01',DATE '2026-05-03','B','Tek kaynak (Marketplace); iptal/iade durumu 2022+ tutarlı'),
 ('revenue_incl_vat_try','*',DATE '2026-05-04',NULL,'A','Trendyol API + Marketplace çift kaynaklı doğrulama; mutabakat açıklanamayan fark içermiyor'),
 ('revenue_ex_vat_try','*',DATE '2020-08-01',DATE '2021-12-31','C','KDV hariç yalnız Marketplace; durum bayat'),
 ('revenue_ex_vat_try','*',DATE '2022-01-01',DATE '2026-05-03','B','KDV hariç Marketplace''te %89-100 dolu'),
 ('revenue_ex_vat_try','*',DATE '2026-05-04',NULL,'U','Trendyol API satırlarında KDV hariç tutar yok'),
 ('units','*',DATE '2020-08-01',DATE '2021-12-31','C','Set/paket adet düzeltmesi belirsiz; durum bayat'),
 ('units','*',DATE '2022-01-01',NULL,'B','Set/paket düzeltmeli adet; ham adet %3-6 fazla olabilirdi'),
 ('orders','*',DATE '2020-08-01',NULL,'B','Marketplace satırı ≈ sipariş; 2023-Q4 düşük bedelli ürün sıçraması gerçek (duplicate değil)'),
 ('sku_identity','*',DATE '2020-08-01',DATE '2020-12-31','C','Ciro ağırlıklı eşleşme %61,8'),
 ('sku_identity','*',DATE '2021-01-01',DATE '2021-12-31','B','Ciro ağırlıklı eşleşme %86,1'),
 ('sku_identity','*',DATE '2022-01-01',DATE '2022-12-31','C','Ciro ağırlıklı eşleşme %78,6 (tekstil hattı dahil)'),
 ('sku_identity','*',DATE '2023-01-01',DATE '2024-12-31','B','Ciro ağırlıklı eşleşme %88,8-96,0'),
 ('sku_identity','*',DATE '2025-01-01',NULL,'A','Ciro ağırlıklı eşleşme %99+'),
 ('returns','*',DATE '2020-08-01',NULL,'U','İade tabloları boş; Marketplace durum bayrağı yalnız kısmi sinyal. Bilinmeyen iade 0 sayılmaz.'),
 ('historical_cost','*',DATE '2020-08-01',DATE '2026-08-23','U','Geçmiş maliyet kaynağı yok; bugünkü maliyet geçmişe uygulanmaz'),
 ('historical_cost','*',DATE '2026-08-24',NULL,'D','Yalnız cfo_change_log maliyet izi; kısmi'),
 ('contribution_profit','*',DATE '2020-08-01',DATE '2026-08-23','U','Maliyet ve iade bilinmiyor'),
 ('contribution_profit','*',DATE '2026-08-24',NULL,'D','Kısmi maliyet; iade bilinmiyor'),
 ('inventory_units','*',DATE '2020-08-01',DATE '2026-05-16','U','XmlStockChangeLog 2026-05-17''de başlıyor'),
 ('inventory_units','*',DATE '2026-05-17',NULL,'B','XML seviye zinciri kesintisiz; loglanmayan ürünler carry-forward varsayımı'),
 ('inventory_value_try','*',DATE '2020-08-01',DATE '2026-09-10','U','Geçmiş maliyet yok; eski snapshot stok değeri tahminli'),
 ('inventory_value_try','*',DATE '2026-09-11',NULL,'D','Güncel maliyetle tahmin; 136 stoklu SKU maliyetsiz'),
 ('cash_try','*',DATE '2020-08-01',DATE '2025-09-30','U','Banka hareketi 2024-10''dan başlıyor ama hesap seti eksik'),
 ('cash_try','*',DATE '2025-10-01',DATE '2026-04-30','C','Hesap seti zamanla genişledi; bakiye sürekliliği doğrulanmadı'),
 ('cash_try','*',DATE '2026-05-01',NULL,'B','6 hesap, bakiye kolonu dolu'),
 ('debt_try','*',DATE '2020-08-01',DATE '2026-09-10','U','Borç geçmişi yok; tanım kırılması 2026-09-10'),
 ('debt_try','*',DATE '2026-09-11',NULL,'C','cfo_snapshot v2; bazı günler bayat'),
 ('receivables_try','*',DATE '2020-08-01',DATE '2026-09-10','U','Alacak geçmişi yok; tanım kırılması 2026-09-10'),
 ('receivables_try','*',DATE '2026-09-11',NULL,'C','cfo_snapshot v2'),
 ('net_capital_try','*',DATE '2020-08-01',DATE '2026-09-10','U','Eski tanım (v1) yeni tanımla aynı seri değildir'),
 ('net_capital_try','*',DATE '2026-09-11',NULL,'C','cfo_snapshot v2; ~24 gün, bazı günler eksik/bayat'),
 ('usd_try','*',DATE '2020-08-01',NULL,'U','TCMB aylık referans serisi henüz yüklenmedi; TCMB olmayan kur sessiz fallback yapılmaz')
ON CONFLICT (metric_key, channel, valid_from) DO NOTHING;

-- ───────────── Güvenlik: RLS açık, politika yok (deny-all); reader yalnız SELECT ─────────────
DO $$
DECLARE o text;
BEGIN
  FOREACH o IN ARRAY ARRAY['fm_metric','fm_quality_flag','fm_source_priority','fm_quality_policy','fm_ingest_run',
                           'fm_sales_company_day','fm_sales_channel_month','fm_sales_sku_month','fm_sales_sku_day'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', o);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', o);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON public.%I FROM anon', o); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', o); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cfo_acceptance_reader') THEN
      EXECUTE format('GRANT SELECT ON public.%I TO cfo_acceptance_reader', o);
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = o AND policyname = 'cfo_acceptance_reader_select') THEN
        EXECUTE format('CREATE POLICY cfo_acceptance_reader_select ON public.%I FOR SELECT TO cfo_acceptance_reader USING (true)', o);
      END IF;
    END IF;
  END LOOP;
  FOREACH o IN ARRAY ARRAY['fm_memory_sales_company_day','fm_memory_sales_channel_month','fm_memory_sales_sku_month','fm_memory_sales_sku_day'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', o);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON public.%I FROM anon', o); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', o); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cfo_acceptance_reader') THEN
      EXECUTE format('GRANT SELECT ON public.%I TO cfo_acceptance_reader', o);
    END IF;
  END LOOP;
END
$$;
