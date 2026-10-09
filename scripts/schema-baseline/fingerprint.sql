-- Full public-schema fingerprint (read-only catalog SELECT). One row per object kind: kind, object count, short md5.
-- The same statement runs against production (via a read-only SQL path) and against a bootstrapped clean database; the
-- rows must be identical (scripts/schema-baseline/fingerprint.expected.txt). Extension-owned objects (pgvector functions,
-- operators, ...) are excluded. Normalised on purpose (see docs/BASELINE-CAPTURE.md "Exclusions"):
--   * function and view bodies: whitespace collapsed; any JWT-shaped literal replaced by REDACTED
--   * object owners, comments, extension version, sequence current values: not compared
--   * ACLs: only the roles anon, authenticated, service_role, cfo_acceptance_reader and PUBLIC
-- Function bodies are compared with SQL line comments removed (comments are not behaviour; an apply path that drops them must not
-- look like drift — 2026-10-09: Cowork applied 110000/130000 without comments, executable code byte-identical).
WITH rel AS (
  SELECT c.oid, c.relname, c.relkind, c.relrowsecurity rls, c.relforcerowsecurity frls, c.reloptions, c.relacl, c.relowner
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','v','m','S')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
),
cols AS (
  SELECT r.oid, string_agg(a.attname||':'||format_type(a.atttypid, a.atttypmod)||':'||a.attnotnull::text||':'||coalesce(pg_get_expr(d.adbin, d.adrelid), '')
      ||':'||a.attgenerated::text||':'||a.attidentity::text
      ||':'||coalesce((SELECT collname FROM pg_collation WHERE oid = a.attcollation AND a.attcollation <> (SELECT typcollation FROM pg_type WHERE oid = a.atttypid)), ''), ',' ORDER BY a.attnum) h
  FROM rel r JOIN pg_attribute a ON a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE r.relkind IN ('r','v','m') GROUP BY r.oid
),
fn AS (
  SELECT p.oid, p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' sig, p.proowner, p.proacl
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.prokind IN ('f','p')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
),
roles(rname) AS (VALUES ('anon'),('authenticated'),('service_role'),('cfo_acceptance_reader'),('PUBLIC')),
fp AS (
  SELECT 'rel:'||r.relkind::text k, r.relname n, md5(c.h||'|'||coalesce(array_to_string(r.reloptions, ','), '')) h FROM rel r JOIN cols c ON c.oid = r.oid
  UNION ALL SELECT 'rls', r.relname, md5(r.rls::text||r.frls::text) FROM rel r WHERE r.relkind = 'r'
  UNION ALL SELECT 'con', r.relname||'.'||co.conname, md5(pg_get_constraintdef(co.oid)) FROM rel r JOIN pg_constraint co ON co.conrelid = r.oid
  UNION ALL SELECT 'idx', i.indexname, md5(i.indexdef) FROM pg_indexes i WHERE i.schemaname = 'public'
    AND (quote_ident(i.schemaname)||'.'||quote_ident(i.tablename))::regclass IN (SELECT oid FROM rel)
  UNION ALL SELECT 'pol', p.tablename||'.'||p.policyname, md5(p.cmd||coalesce(array_to_string(p.roles, ','), '')||coalesce(p.qual, '')||coalesce(p.with_check, '')||p.permissive)
    FROM pg_policies p WHERE p.schemaname = 'public'
  UNION ALL SELECT 'view', r.relname, md5(regexp_replace(pg_get_viewdef(r.oid), '\s+', ' ', 'g')) FROM rel r WHERE r.relkind IN ('v','m')
  UNION ALL SELECT 'fn', f.sig, md5(regexp_replace(regexp_replace(regexp_replace(pg_get_functiondef(f.oid), '--[^\n]*', '', 'g'), 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', 'REDACTED', 'g'), '\s+', ' ', 'g')) FROM fn f
  UNION ALL SELECT CASE WHEN r.relkind = 'S' THEN 'seqacl' ELSE 'acl' END, r.relname||'.'||coalesce(g.rolname, 'PUBLIC'), md5(string_agg(x.privilege_type, ',' ORDER BY x.privilege_type))
    FROM rel r CROSS JOIN LATERAL aclexplode(coalesce(r.relacl, acldefault((CASE WHEN r.relkind = 'S' THEN 's' ELSE 'r' END)::"char", r.relowner))) x
    LEFT JOIN pg_roles g ON g.oid = x.grantee WHERE coalesce(g.rolname, 'PUBLIC') IN (SELECT rname FROM roles)
    GROUP BY r.relkind, r.relname, g.rolname
  UNION ALL SELECT 'fnacl', f.sig||'.'||coalesce(g.rolname, 'PUBLIC'), md5(string_agg(x.privilege_type, ',' ORDER BY x.privilege_type))
    FROM fn f CROSS JOIN LATERAL aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) x
    LEFT JOIN pg_roles g ON g.oid = x.grantee WHERE coalesce(g.rolname, 'PUBLIC') IN (SELECT rname FROM roles)
    GROUP BY f.sig, g.rolname
  UNION ALL SELECT 'trg', r.relname||'.'||t.tgname, md5(regexp_replace(pg_get_triggerdef(t.oid), '\s+', ' ', 'g')) FROM pg_trigger t JOIN rel r ON r.oid = t.tgrelid WHERE NOT t.tgisinternal
  UNION ALL SELECT 'enum', t.typname, md5(string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)) FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typnamespace = 'public'::regnamespace GROUP BY t.typname
  UNION ALL SELECT 'seq', r.relname, md5(format_type(s.seqtypid, NULL)||'|'||s.seqstart||'|'||s.seqincrement||'|'||s.seqmin||'|'||s.seqmax||'|'||s.seqcache||'|'||s.seqcycle::text
      ||'|'||coalesce((SELECT cr.relname||'.'||a.attname FROM pg_depend d JOIN pg_class cr ON cr.oid = d.refobjid JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
                       WHERE d.classid = 'pg_class'::regclass AND d.objid = r.oid AND d.deptype = 'a' AND d.refclassid = 'pg_class'::regclass), ''))
    FROM rel r JOIN pg_sequence s ON s.seqrelid = r.oid WHERE r.relkind = 'S'
  UNION ALL SELECT 'ext', e.extname, md5(e.extname) FROM pg_extension e WHERE e.extnamespace = 'public'::regnamespace
  UNION ALL SELECT 'schemaacl', coalesce(g.rolname, 'PUBLIC'), md5(string_agg(x.privilege_type, ',' ORDER BY x.privilege_type))
    FROM pg_namespace ns CROSS JOIN LATERAL aclexplode(ns.nspacl) x LEFT JOIN pg_roles g ON g.oid = x.grantee
    WHERE ns.nspname = 'public' AND coalesce(g.rolname, 'PUBLIC') IN (SELECT rname FROM roles) GROUP BY g.rolname
)
SELECT k, count(*) n, left(md5(string_agg(n||'|'||left(h, 10), E'\n' ORDER BY n COLLATE "C")), 10) h FROM fp GROUP BY k ORDER BY k
