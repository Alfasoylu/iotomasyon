import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { applyPendingInProduction, bootstrap } from "../scripts/schema-baseline/bootstrap";

// Defense-in-depth gate (20261006120000_security_defense_in_depth), on the clean-DB reproduction of production
// (baseline + newer migrations):
//  - anon/authenticated: no privilege on any public table/view/matview/sequence, no EXECUTE on any own public function
//  - RLS-disabled public tables = 0, policies granting anon/authenticated/public = 0
//  - cfo_google: reader denied; postgres/service_role allowed
//  - reader keeps EXECUTE on every read-only function it could run before; write/trigger functions stay denied
//  - service_role keeps EXECUTE on every own function and its table privileges are untouched; idempotent
const MIG = readFileSync("prisma/migrations/20261006120000_security_defense_in_depth/migration.sql", "utf8");
async function main() {
  const db = new PGlite({ extensions: { vector } });
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create role cfo_acceptance_reader login nosuperuser nobypassrls;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
      alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;`);
    const client = { exec: (s: string) => db.exec(s), query: <T,>(s: string, p?: unknown[]) => db.query<T>(s, p) };
    const res = await bootstrap(client);
    assert.ok(res.pendingInProduction.includes("20261006120000_security_defense_in_depth"), "migration must be newer than the baseline cutoff");
    await db.exec("set search_path = public");
    const q = async <T,>(s: string) => (await db.query<T>(s)).rows;
    const OWN_FN = `from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind in ('f','p') and p.proowner=(select oid from pg_roles where rolname=current_user)
      and not exists (select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')`;

    // before: the leak the migration closes is present in the baseline
    const anonTablesBefore = (await q<{ n: number }>(`select count(*)::int n from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') and has_table_privilege('anon',c.oid,'select')`))[0].n;
    assert.ok(anonTablesBefore > 0, "precondition: baseline carries anon table grants");
    const readerBefore = await q<{ f: string; ro: boolean }>(`select p.oid::regprocedure::text f, (p.provolatile in ('s','i') and p.prorettype<>'trigger'::regtype and p.prokind='f') ro ${OWN_FN} and has_function_privilege('cfo_acceptance_reader',p.oid,'execute')`);
    const svcTblBefore = await q<{ a: string }>(`select string_agg(c.relname||':'||coalesce(c.relacl::text,''),'|' order by c.relname) a from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v','m','S')`);

    await applyPendingInProduction(client, res);
    await db.exec("set search_path = public");

    const gates = async () => (await q<Record<string, number>>(`select
      (select count(*)::int from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v','m','f')
        and (has_table_privilege('anon',c.oid,'select,insert,update,delete,truncate,references,trigger') or has_table_privilege('authenticated',c.oid,'select,insert,update,delete,truncate,references,trigger'))) rel_anon,
      (select count(*)::int from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='S'
        and (has_sequence_privilege('anon',c.oid,'usage,select,update') or has_sequence_privilege('authenticated',c.oid,'usage,select,update'))) seq_anon,
      (select count(*)::int ${OWN_FN} and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute'))) fn_anon,
      (select count(*)::int ${OWN_FN} and not has_function_privilege('service_role',p.oid,'execute')) fn_svc_missing,
      (select count(*)::int from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') and not c.relrowsecurity) rls_off,
      (select count(*)::int from pg_policies where schemaname='public' and roles && array['anon','authenticated','public']::name[]) wide_pol`))[0];
    assert.deepEqual(await gates(), { rel_anon: 0, seq_anon: 0, fn_anon: 0, fn_svc_missing: 0, rls_off: 0, wide_pol: 0 });

    // cfo_google: reader denied, postgres/service_role allowed
    const g = (await q<{ r: boolean; s: boolean; p: boolean }>(`select has_function_privilege('cfo_acceptance_reader','public.cfo_google(jsonb)','execute') r,
      has_function_privilege('service_role','public.cfo_google(jsonb)','execute') s, has_function_privilege('postgres','public.cfo_google(jsonb)','execute') p`))[0];
    assert.deepEqual(g, { r: false, s: true, p: true });

    // reader: every read-only function it could run before is still executable; nothing else gained
    const readerAfter = new Set((await q<{ f: string }>(`select p.oid::regprocedure::text f ${OWN_FN} and has_function_privilege('cfo_acceptance_reader',p.oid,'execute')`)).map(r => r.f));
    for (const { f } of readerBefore.filter(x => x.ro && !x.f.startsWith("cfo_google("))) assert.ok(readerAfter.has(f), `reader lost read-only ${f}`);
    // Bilinçli eklenen saf yardımcılar: reader'ın okuduğu cfo_nakit_kapisi / cfo_onucus_temel / cfo_kaynak_yeterliligi bunları çağırır
    // (CFO-006, 20261010100000). Yalnız IMMUTABLE, tablo okumayan SQL fonksiyonu olarak kabul edilir.
    const READER_HELPERS = new Set(["cfo_hesap_sahsi(text)", "cfo_kart_sahsi(text)"]);
    for (const f of READER_HELPERS) {
      const [h] = await q<{ v: string; l: string; src: string }>(`select p.provolatile v, l.lanname l, p.prosrc src from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = '${f}'::regprocedure`);
      assert.ok(h.v === "i" && h.l === "sql" && !/\bfrom\b/i.test(h.src), `reader helper ${f} must be an immutable table-free SQL function`);
    }
    for (const f of readerAfter) assert.ok(READER_HELPERS.has(f) || readerBefore.some(x => x.f === f && x.ro), `reader gained/kept non-read-only ${f}`);
    assert.ok(readerAfter.size > 0);
    // reader still reads through its policies (e.g. CFO views/tables it had)
    await db.exec("set role cfo_acceptance_reader");
    await db.query("select count(*) from public.cfo_settings");
    await db.query("select * from public.cfo_nakit_kapisi"); // görünüm cfo_hesap_sahsi() çağırır — reader EXECUTE'u gerekli
    await db.query("select * from public.cfo_kargo_tahmin(current_date, 1, 'yurtici', 100)").catch(e => { throw new Error(`reader read-only function failed: ${e.message}`); });
    await assert.rejects(db.query("select public.cfo_google('{}'::jsonb)"), /permission denied/);
    await db.exec("reset role");
    // anon/authenticated denied in practice
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query("select count(*) from public.cfo_banka_hareket"), /permission denied/, `${role} table`);
      await assert.rejects(db.query("select * from public.cfo_nakit_projeksiyon(30)"), /permission denied/, `${role} function`);
      await db.exec("reset role");
    }
    // service_role relation privileges untouched (only anon/authenticated entries removed)
    const strip = (a: string) => a.replace(/(anon|authenticated)=[a-zA-Z]*\/[a-z_]+,?/g, "").replace(/,}/g, "}");
    const svcTblAfter = await q<{ a: string }>(`select string_agg(c.relname||':'||coalesce(c.relacl::text,''),'|' order by c.relname) a from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v','m','S')`);
    // compare the relations that existed before (newer migrations may add relations of their own)
    const acls = (a: string) => new Map(a.split("|").map(e => [e.slice(0, e.indexOf(":")), strip(e.slice(e.indexOf(":") + 1))] as const));
    const before = acls(svcTblBefore[0].a), after = acls(svcTblAfter[0].a);
    for (const [rel, acl] of before) assert.equal(after.get(rel), acl, `non-anon relation ACL changed: ${rel}`);

    // idempotent
    await db.exec(MIG);
    assert.deepEqual(await gates(), { rel_anon: 0, seq_anon: 0, fn_anon: 0, fn_svc_missing: 0, rls_off: 0, wide_pol: 0 });
    console.log(`Security defense-in-depth: anon tables ${anonTablesBefore}→0, anon/auth functions 0, sequences 0, RLS-off 0, wide policies 0, cfo_google reader denied, reader read-only functions kept (${readerAfter.size}), service_role unchanged, idempotent`);
  } finally { await db.close(); }
}
main().then(() => process.exit(process.exitCode ?? 0)).catch(e => { console.error(e); process.exit(1); });
