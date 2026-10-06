import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { isAuthorized, timingSafeEqual } from "../supabase/functions/cfo-google/auth";

// cfo_google lockdown: anon/authenticated/PUBLIC EXECUTE yok; gömülü JWT yok; yetkili sunucu yolu çalışır; Edge yetki mantığı.
const MIG = readFileSync("prisma/migrations/20261006110000_cfo_google_lockdown/migration.sql", "utf8");
const EDGE = readFileSync("supabase/functions/cfo-google/index.ts", "utf8");
async function main() {
  // ---- Edge yetki mantığı: anon JWT / boş / kısa sır / yanlış sır reddedilir
  const good = "x".repeat(40);
  assert.equal(isAuthorized(good, good), true);
  assert.equal(isAuthorized(null, good), false); assert.equal(isAuthorized("", good), false);
  assert.equal(isAuthorized("eyJhbGciOiJIUzI1NiJ9.e30.sig", good), false, "anon JWT yetki değildir");
  assert.equal(isAuthorized(good, null), false, "sır yoksa herkes reddedilir");
  assert.equal(isAuthorized("short", "short"), false, "kısa sır kabul edilmez");
  assert.equal(isAuthorized(good + "y", good), false); assert.equal(timingSafeEqual("a", "ab"), false);
  // Edge kaynağı: kimlik metadata'sı dönmez, JWT'ye güvenmez
  assert(!/service_account/.test(EDGE), "yanıtta servis hesabı bilgisi olmamalı"); assert(!/client_email\s*\}/.test(EDGE.split("const out")[1] ?? ""));
  assert(/x-cfo-internal/.test(EDGE) && /isAuthorized/.test(EDGE));
  // Migration'da sır/JWT yok
  assert(!/eyJ[A-Za-z0-9_-]{10,}/.test(MIG), "migration'da JWT olmamalı");

  const db = new PGlite();
  try {
    await db.exec(`create schema extensions;
      create type extensions.http_header as (field text, value text);
      create type extensions.http_request as (method text, uri text, headers extensions.http_header[], content_type text, content text);
      create type extensions.http_response as (status int, content_type text, headers extensions.http_header[], content text);
      create function extensions.http_header(f text, v text) returns extensions.http_header language sql as $$ select row(f,v)::extensions.http_header $$;
      create table public.http_calls(uri text, hdr text, body text);
      create function extensions.http(r extensions.http_request) returns extensions.http_response language plpgsql as $$ begin
        insert into public.http_calls values (r.uri, (r.headers[1]).field, r.content);
        return row(200,'application/json',null,'{"ok":true}')::extensions.http_response; end $$;
      create role anon nologin; create role authenticated nologin; create role service_role nologin; create role cfo_acceptance_reader nologin;
      create table public.cfo_secret(key text primary key, value text, scope text);
      alter table public.cfo_secret enable row level security;
      create policy cfo_secret_deny on public.cfo_secret using (false);
      grant all on schema public to anon, authenticated, service_role, cfo_acceptance_reader; grant usage on schema extensions to anon, authenticated, service_role, cfo_acceptance_reader;
      grant all on public.http_calls to anon, authenticated, service_role, cfo_acceptance_reader;
      alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
      -- ESKİ durum: anon JWT gömülü, PUBLIC/anon EXECUTE açık
      create function public.cfo_google(p_body jsonb) returns jsonb language sql as $$ select ((extensions.http(('POST','https://x/functions/v1/cfo-google', array[extensions.http_header('Authorization','Bearer eyJhbGciOiJIUzI1NiJ9.e30.anonanonanon')],'application/json',p_body::text)::extensions.http_request)).content)::jsonb $$;
      grant execute on function public.cfo_google(jsonb) to anon, authenticated, service_role;`);
    const can = async (role: string) => (await db.query<{ p: boolean }>(`select has_function_privilege('${role}','public.cfo_google(jsonb)','execute') p`)).rows[0].p;
    assert.equal(await can("anon"), true, "ön koşul: önceki durumda anon açık");
    await db.exec(MIG);
    for (const r of ["anon", "authenticated"]) assert.equal(await can(r), false, `${r} EXECUTE kapalı`);
    const acl = (await db.query<{ a: string }>(`select proacl::text a from pg_proc where proname='cfo_google'`)).rows[0].a;
    assert(!/(^\{|,)=X/.test(acl), "PUBLIC EXECUTE kapalı"); assert(!/anon=|authenticated=/.test(acl));
    assert.equal(await can("service_role"), true); assert.equal(await can("cfo_acceptance_reader"), true); assert.equal(await can("postgres"), true);
    const src = (await db.query<{ s: string }>(`select prosrc s from pg_proc where proname='cfo_google'`)).rows[0].s;
    assert(!/eyJ/.test(src), "gövdede gömülü JWT yok");
    // sır yokken yetkili yol bile güvenli şekilde hata verir
    await assert.rejects(db.query(`select public.cfo_google('{"action":"list"}'::jsonb)`), /not provisioned/);
    // kısa sır reddedilir
    await db.exec(`insert into public.cfo_secret values ('CFO_GOOGLE_INTERNAL_TOKEN','short','t')`);
    await assert.rejects(db.query(`select public.cfo_google('{}'::jsonb)`), /not provisioned/);
    const tok = "t".repeat(48);
    await db.exec(`update public.cfo_secret set value='${tok}' where key='CFO_GOOGLE_INTERNAL_TOKEN'`);
    // yetkili sunucu yolu (postgres) çalışır ve başlıkta iç sırrı gönderir, Authorization göndermez
    const out = (await db.query<{ r: { ok: boolean } }>(`select public.cfo_google('{"action":"list"}'::jsonb) r`)).rows[0].r;
    assert.equal(out.ok, true);
    const call = (await db.query<{ hdr: string }>(`select hdr from public.http_calls`)).rows;
    assert.equal(call.length, 1); assert.equal(call[0].hdr, "x-cfo-internal");
    // service_role / reader yolu: SECURITY DEFINER sayesinde cfo_secret'e doğrudan erişim OLMADAN çalışır
    for (const role of ["service_role", "cfo_acceptance_reader"]) {
      await db.exec(`set role ${role}`);
      assert.equal(((await db.query<{ r: { ok: boolean } }>(`select public.cfo_google('{}'::jsonb) r`)).rows[0].r).ok, true, `${role} yolu çalışır`);
      await assert.rejects(db.query(`select value from public.cfo_secret`).then(r => { if (r.rows.length) throw new Error("secret okundu"); throw new Error("rls_empty"); }), /permission denied|rls_empty/, `${role} cfo_secret'i doğrudan okuyamaz`);
      await db.exec(`reset role`);
    }
    // anon/authenticated çağıramaz
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query(`select public.cfo_google('{}'::jsonb)`), /permission denied/, `${role} reddedilir`);
      await db.exec(`reset role`);
    }
    // idempotent
    await db.exec(MIG); assert.equal(await can("anon"), false);
    console.log("cfo_google lockdown: anon/authenticated/PUBLIC denied, no embedded JWT, authorized paths work, edge auth rejects anon JWT");
  } finally { await db.close(); }
}
main().then(() => process.exit(process.exitCode ?? 0)).catch(e => { console.error(e); process.exit(1); });
