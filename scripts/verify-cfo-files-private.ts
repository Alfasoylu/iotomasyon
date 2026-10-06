// Üretimde cfo-files'ın private olduğunu ve uygulama erişim yolunun (service key → authenticated GET + imzalı URL) çalıştığını doğrular.
// Kullanım: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… DATABASE_URL=… node --import tsx scripts/verify-cfo-files-private.ts
// Yalnız okuma: dosya yazmaz/silmez; imzalı URL 60 sn geçerli.
import { Client } from "pg";
import { downloadPrivateCfoFile, privateBucket, privateFilePath, signedCfoFileUrl } from "../lib/cfo-agent/private-files";
async function main() {
  const url = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, ""), key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key || !process.env.DATABASE_URL) throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL gerekli");
  const config = { url, key };
  const db = new Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
  const refs = (await db.query<{ id: string; url: string }>(`select id, url from cfo_question_file order by id`)).rows; await db.end();
  let fail = 0; const ok = (c: boolean, m: string) => { console.log(`${c ? "OK  " : "FAIL"} ${m}`); if (!c) fail++; };
  ok(await privateBucket(config), "bucket cfo-files public=false");
  for (const r of refs) {
    const path = privateFilePath(r.url, config);
    ok(r.url.startsWith("private:cfo-files/") && !!path, `${r.id}: referans private biçiminde`);
    const body = await downloadPrivateCfoFile(config, r.url); ok(!!body && body.byteLength > 0, `${r.id}: authenticated indirme (${body?.byteLength ?? 0} B)`);
    const signed = await signedCfoFileUrl(config, r.url, 60); ok(!!signed, `${r.id}: imzalı URL üretildi`);
    if (signed) { const res = await fetch(signed); ok(res.ok, `${r.id}: imzalı URL ile erişim ${res.status}`); await res.arrayBuffer(); }
    if (path) { const anon = await fetch(`${url}/storage/v1/object/public/cfo-files/${path}`); ok(!anon.ok, `${r.id}: eski public URL anonim erişim reddedildi (${anon.status})`); await anon.arrayBuffer(); }
  }
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
