import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// cfo-files private migration: URL→private ref (idempotent, safe), bucket private, backup + rollback, objects untouched.
const MIG = readFileSync("prisma/migrations/20261006100000_cfo_files_private/migration.sql", "utf8");
const H = "https://x.supabase.co/storage/v1/object/public/cfo-files/";
async function main() {
  const db = new PGlite();
  try {
    await db.exec(`create schema storage; create table storage.buckets(id text primary key, public boolean default false); create table storage.objects(id text, bucket_id text, name text);
      create role anon nologin; create role authenticated nologin;
      create table cfo_question_file(id text primary key, "questionId" text, url text not null, "fileName" text);
      insert into storage.buckets values ('cfo-files', true), ('urun-gorsel', true);
      insert into storage.objects values ('1','cfo-files','q1/a.png'),('2','cfo-files','q2/b.xls'),('3','cfo-files','q3/c_d-e.xlsx');
      insert into cfo_question_file values
        ('f1','q','${H}q1/a.png','a.png'), ('f2','q','${H}q2/b.xls','b.xls'), ('f3','q','${H}q3/c_d-e.xlsx','c'),
        ('missing','q','${H}q9/none.png','n'),                       -- storage'da yok → dokunulmaz
        ('trav','q','${H}q1/..%2Fx.png','t'),                       -- geçersiz path → dokunulmaz
        ('other','q','https://x.supabase.co/storage/v1/object/public/urun-gorsel/q1/a.png','o'),  -- başka bucket
        ('priv','q','private:cfo-files/q1/a.png','p');             -- zaten private`);
    const urls = async () => Object.fromEntries((await db.query<{ id: string; url: string }>(`select id,url from cfo_question_file order by id`)).rows.map(r => [r.id, r.url]));
    const before = await urls();
    await db.exec(MIG);
    const after = await urls();
    assert.equal(after.f1, "private:cfo-files/q1/a.png"); assert.equal(after.f2, "private:cfo-files/q2/b.xls"); assert.equal(after.f3, "private:cfo-files/q3/c_d-e.xlsx");
    for (const k of ["missing", "trav", "other", "priv"]) assert.equal(after[k], before[k], `${k} değişmemeli`);
    const bucket = async (id: string) => (await db.query<{ public: boolean }>(`select public from storage.buckets where id='${id}'`)).rows[0].public;
    assert.equal(await bucket("cfo-files"), false); assert.equal(await bucket("urun-gorsel"), true, "diğer bucket'a dokunulmaz");
    assert.equal((await db.query(`select 1 from storage.objects`)).rows.length, 3, "dosyalar silinmez");
    assert.equal((await db.query(`select 1 from cfo_question_file_url_backup`)).rows.length, 3);
    // idempotent
    await db.exec(MIG); assert.deepEqual(await urls(), after); assert.equal((await db.query(`select 1 from cfo_question_file_url_backup`)).rows.length, 3);
    assert.equal((await db.query<{ n: string }>(`select old_url n from cfo_question_file_url_backup where id='f1'`)).rows[0].n, before.f1);
    // yedek tablo anon/authenticated'a kapalı
    for (const r of ["anon", "authenticated"]) assert.equal((await db.query<{ p: boolean }>(`select has_table_privilege('${r}','cfo_question_file_url_backup','select') p`)).rows[0].p, false);
    // rollback planı
    await db.exec(`UPDATE cfo_question_file f SET url = b.old_url FROM cfo_question_file_url_backup b WHERE b.id = f.id AND f.url = b.new_url; UPDATE storage.buckets SET public = true WHERE id = 'cfo-files';`);
    assert.deepEqual(await urls(), before); assert.equal(await bucket("cfo-files"), true);
    console.log("cfo-files private migration: safe, idempotent, bucket private, objects intact, rollback verified");
  } finally { await db.close(); }
}
main().then(() => process.exit(process.exitCode ?? 0)).catch(e => { console.error(e); process.exit(1); });
