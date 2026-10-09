WITH rel AS (
  SELECT c.oid, c.relname, c.relkind::text kind, c.relrowsecurity rls, c.relforcerowsecurity frls,
    CASE WHEN c.relname LIKE 'fm\_%' OR c.relname IN ('cfo_kargo_barem','cfo_kargo_desi_tarife','cfo_kargo_kanal_varsayim') THEN 'A' ELSE 'B' END scope
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','v','m') AND (c.relname LIKE 'fm\_%' OR c.relname IN ('cfo_kargo_barem','cfo_kargo_desi_tarife','cfo_kargo_kanal_varsayim','TrendyolReturnRecord','trendyol_settlement_line','trendyol_invoice','trendyol_invoice_line','trendyol_finance_import','MonthlyExchangeRate','StockAdjustmentLog','SupplierProduct','EntegraImportLog','MarketplaceProductMapping'))
),
cols AS (SELECT r.relname, md5(string_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull::text||':'||coalesce(pg_get_expr(d.adbin,d.adrelid),''), ',' ORDER BY a.attnum)) h
  FROM rel r JOIN pg_attribute a ON a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum GROUP BY r.relname),
fp AS (
  SELECT 'A' sc, 'rel:'||r.kind k, r.relname n, c.h FROM rel r JOIN cols c USING (relname) WHERE r.scope='A'
  UNION ALL SELECT r.scope, 'rls', r.relname, md5(r.rls::text||r.frls::text) FROM rel r WHERE r.kind='r'
  UNION ALL SELECT 'A', 'con', r.relname||'.'||co.conname, md5(pg_get_constraintdef(co.oid)) FROM rel r JOIN pg_constraint co ON co.conrelid=r.oid WHERE r.scope='A'
  UNION ALL SELECT 'A', 'idx', i.indexname, md5(regexp_replace(i.indexdef,'^CREATE (UNIQUE )?INDEX \S+ ON ','\1 ')) FROM pg_indexes i JOIN rel r ON r.relname=i.tablename WHERE i.schemaname='public' AND r.scope='A'
  UNION ALL SELECT r.scope, 'pol', p.tablename||'.'||p.policyname, md5(p.cmd||coalesce(array_to_string(p.roles,','),'')||coalesce(p.qual,'')||coalesce(p.with_check,'')||p.permissive) FROM pg_policies p JOIN rel r ON r.relname=p.tablename WHERE p.schemaname='public'
  UNION ALL SELECT 'A', 'view', r.relname, md5(regexp_replace(pg_get_viewdef(r.oid),'\s+',' ','g')) FROM rel r WHERE r.kind IN ('v','m')
  UNION ALL SELECT r.scope, 'acl', r.relname||'.'||coalesce(g.rolname,'PUBLIC'), md5(string_agg(x.privilege_type, ',' ORDER BY x.privilege_type))
    FROM rel r JOIN pg_class c ON c.oid=r.oid CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x LEFT JOIN pg_roles g ON g.oid=x.grantee
    WHERE coalesce(g.rolname,'PUBLIC') IN ('PUBLIC','cfo_acceptance_reader') OR (r.scope='A' AND g.rolname IN ('anon','authenticated','service_role')) GROUP BY r.scope, r.relname, g.rolname
  UNION ALL SELECT 'A', 'fn', p.proname||'('||pg_get_function_identity_arguments(p.oid)||')', md5(regexp_replace(regexp_replace(pg_get_functiondef(p.oid),'--[^\n]*','','g'),'\s+',' ','g')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f' AND (p.proname LIKE 'fm\_%' OR p.proname='cfo_kargo_tahmin')
  UNION ALL SELECT 'A', 'fnacl', p.proname||'.'||coalesce(g.rolname,'PUBLIC'), 'x' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x LEFT JOIN pg_roles g ON g.oid=x.grantee
    WHERE n.nspname='public' AND (p.proname LIKE 'fm\_%' OR p.proname='cfo_kargo_tahmin') AND coalesce(g.rolname,'PUBLIC') IN ('PUBLIC','anon','authenticated','cfo_acceptance_reader')
  UNION ALL SELECT 'B', 'fnacl', p.proname||'.'||coalesce(g.rolname,'PUBLIC'), 'x' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x LEFT JOIN pg_roles g ON g.oid=x.grantee
    WHERE n.nspname='public' AND p.proname IN ('cfo_ay_kazanan_yaz','cfo_kilometre_yaz','cfo_sicrama_kapat','cfo_stok_sicrama_kaydet','cfo_take_snapshot') AND coalesce(g.rolname,'PUBLIC') IN ('PUBLIC','cfo_acceptance_reader')
  UNION ALL SELECT 'A', 'seed:'||t.n, t.n, t.h FROM (
    SELECT 'fm_metric' n, md5(string_agg(m::text, E'\n' ORDER BY metric_key)) h FROM public.fm_metric m
    UNION ALL SELECT 'fm_quality_flag', md5(string_agg(m::text, E'\n' ORDER BY flag)) FROM public.fm_quality_flag m
    UNION ALL SELECT 'fm_source_priority', md5(string_agg(m::text, E'\n' ORDER BY channel, valid_from)) FROM public.fm_source_priority m
    UNION ALL SELECT 'fm_quality_policy', md5(string_agg(concat_ws('|', m.metric_key, m.channel, m.valid_from, m.valid_to, m.grade), E'\n' ORDER BY metric_key, channel, valid_from)) FROM public.fm_quality_policy m
    UNION ALL SELECT 'cfo_kargo_barem', md5(string_agg(m::text, E'\n' ORDER BY id)) FROM public.cfo_kargo_barem m
    UNION ALL SELECT 'cfo_kargo_kanal_varsayim', md5(string_agg(m::text, E'\n' ORDER BY channel)) FROM public.cfo_kargo_kanal_varsayim m
    UNION ALL SELECT 'cfo_kargo_desi_tarife', md5(string_agg(m::text, E'\n' ORDER BY carrier, valid_from, desi)) FROM public.cfo_kargo_desi_tarife m
  ) t
)
SELECT sc, k, count(*) n, left(md5(string_agg(n||'|'||left(h,10), E'\n' ORDER BY n COLLATE "C")),10) h FROM fp GROUP BY sc, k ORDER BY sc, k
