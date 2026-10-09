import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { bootstrap } from "../scripts/schema-baseline/bootstrap";
import { documentContext, maskSensitive, validateDocument, type DocumentRow } from "../lib/cfo/documents";

// CFO belge kütüphanesi (CFO-027): doğrulama, maskeleme, sınırlı bağlam (ham dosya yok, açıklama üstün) ve migration 20261009240000
// (üretim kopyasında: CHECK'ler, mükerrer dosya, Cowork yazma yolu maskeler + günlüğe yazar, defter değişmez, yetkiler).
// Çalıştır: node --import tsx __tests__/cfo-documents.test.ts

const ok = { category: "KART_EKSTRESI", title: "Enpara kart ekstresi Eylül", description: "KKDF ve BSMV ayrı satırda; kart faiz çarpanı ×1,20 mi ×1,05 mi teyit." };
assert.deepEqual(validateDocument(ok, { size: 1000, type: "application/pdf", name: "a.pdf" }), []);
assert.match(validateDocument({ ...ok, description: "kısa" }).join(" "), /Açıklama zorunlu/);
assert.match(validateDocument({ ...ok, category: "SERBEST" }).join(" "), /Kategori/);
assert.match(validateDocument(ok, { size: 11 * 1024 * 1024, type: "application/pdf", name: "a.pdf" }).join(" "), /10 MB/);
assert.match(validateDocument(ok, { size: 10, type: "application/x-msdownload", name: "a.exe" }).join(" "), /türü/);
assert.match(validateDocument(ok, null).join(" "), /Dosya seçilmedi/);
assert.match(validateDocument({ ...ok, periodStart: "2026-10-01", periodEnd: "2026-09-01" }).join(" "), /Dönem başı/);

// Maskeleme: IBAN, Luhn geçerli kart no, 11 haneli kimlik; tutarlar ve tarih dokunulmaz
const masked = maskSensitive("IBAN TR33 0006 1005 1978 6457 8413 26 · kart 4111 1111 1111 1111 · TCKN 12345678901 · tutar 186.089,00 TL · 2026-10-09 · sipariş 1234567");
assert.ok(!masked.includes("0006 1005") && masked.includes("TR** **** 1326"), masked);
assert.ok(masked.includes("**** **** **** 1111") && !masked.includes("4111 1111"), masked);
assert.ok(masked.includes("12*******01"), masked);
assert.ok(masked.includes("186.089,00") && masked.includes("2026-10-09") && masked.includes("1234567"), "tutar/tarih/kısa no korunur");
assert.equal(maskSensitive("4111 1111 1111 1112"), "4111 1111 1111 1112", "Luhn geçmeyen 16 hane kart sayılmaz");

// Bağlam: açıklama önce (üstün), özet etiketli, sayılar öneri; ham dosya yok; sınır aşılınca sayılır
const row = (i: number, extra: Partial<DocumentRow> = {}): DocumentRow => ({ id: `0000000${i}-aaaa-bbbb-cccc-dddddddddddd`, category: "KOMISYON_ORANI",
  title: `Komisyon ${i}`, description: "N11 kategori komisyon tablosu; elektronik %15, kablo %12. Kanal net oranı için.", periodStart: "2026-10-01", periodEnd: null,
  validUntil: "2026-12-31", summary: "Elektronik %15, IBAN TR33 0006 1005 1978 6457 8413 26", summaryStatus: "HAZIR", extracted: { elektronik_pct: 15 }, conflict: null,
  uploadedAt: "2026-10-09T20:00:00Z", ...extra });
const ctx = documentContext([row(1), row(2, { validUntil: "2026-10-01", summaryStatus: "BEKLIYOR", summary: null }), row(3, { conflict: "özet %18 diyor" })], "2026-10-09");
assert.ok(ctx[0].indexOf("Kullanıcı açıklaması (üstün)") < ctx[0].indexOf("AI özeti"), "açıklama özetten önce");
assert.ok(ctx[0].includes("TR** ****") && !ctx[0].includes("0006 1005"), "bağlamda IBAN maskeli");
assert.ok(ctx[0].includes("öneri; onaysız deftere yazılmaz"));
assert.ok(ctx[1].includes("GEÇERLİLİĞİ BİTMİŞ") && ctx[1].includes("bekliyor"));
assert.ok(ctx[2].includes("ÇELİŞKİ"));
const big = documentContext(Array.from({ length: 60 }, (_, i) => row(i)), "2026-10-09", 3000);
assert.ok(big.join("").length <= 3200 && /belge daha \(bağlam sınırı 3000/.test(big[big.length - 1]), "bağlam sınırlı, kalan sayılır");

async function db() {
  const pg = new PGlite({ extensions: { vector } });
  try {
    await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create role cfo_acceptance_reader login nosuperuser nobypassrls;`);
    const res = await bootstrap({ exec: (s: string) => pg.exec(s), query: <T,>(s: string, p?: unknown[]) => pg.query<T>(s, p) });
    for (const m of res.pendingInProduction) await pg.exec(readFileSync(`prisma/migrations/${m}/migration.sql`, "utf8"));
    const MIG = "20261009240000_cfo_belge";
    assert.ok(res.pendingNotInProduction.includes(MIG), "üretimde bekletiliyor (onay)");
    const sql = readFileSync(`prisma/migrations/${MIG}/migration.sql`, "utf8");
    await pg.exec(sql); await pg.exec(sql);
    await pg.exec("set search_path = public");
    const ins = (o: Record<string, string>) => pg.query<{ id: string }>(`insert into cfo_belge (kategori, baslik, aciklama, dosya_ref, dosya_adi, mime, boyut, sha256, yukleyen)
      values ($1, $2, $3, $4, 'a.pdf', 'application/pdf', 100, $5, 'alperen') returning id`,
      [o.k ?? "KART_EKSTRESI", o.b ?? "Enpara ekstre", o.a ?? ok.description, o.r ?? "private:cfo-files/belge/x_a.pdf", o.h ?? "a".repeat(64)]);
    const fails = async (o: Record<string, string>) => { try { await ins(o); return false; } catch { return true; } };
    assert.ok(await fails({ a: "çok kısa açıklama" }), "açıklama ≥ 30 karakter zorunlu");
    assert.ok(await fails({ k: "SERBEST_METIN" }), "kategori sabit liste");
    assert.ok(await fails({ r: "https://example.com/a.pdf" }), "yalnız private belge yolu");
    const id = (await ins({})).rows[0].id;
    assert.ok(await fails({}), "aynı dosya (sha256) iki kez aktif olamaz");
    assert.equal((await pg.query<{ n: number }>(`select count(*)::int n from cfo_belge_kuyrugu`)).rows[0].n, 1, "Cowork kuyruğunda");

    const before = (await pg.query<{ n: number }>(`select (select count(*) from cfo_credit_card) + (select count(*) from cfo_bank_account) + (select count(*) from cfo_loan) as n`)).rows[0].n;
    await pg.query(`select cfo_belge_ozet_yaz($1, $2, $3::jsonb, 'cowork', $4)`, [id, "KKDF %15, BSMV %5. IBAN TR33 0006 1005 1978 6457 8413 26, kart 4111 1111 1111 1111.",
      JSON.stringify({ kkdf_pct: 15, bsmv_pct: 5, kart: "4111111111111111" }), "Açıklama ×1,20 diyor, ekstre ×1,20 — çelişki yok aslında test"]);
    const r = (await pg.query<{ ozet: string; ozet_durumu: string; cikarilan: Record<string, unknown>; celiski: string }>(`select ozet, ozet_durumu, cikarilan, celiski from cfo_belge where id = $1`, [id])).rows[0];
    assert.equal(r.ozet_durumu, "HAZIR");
    assert.ok(!r.ozet.includes("0006 1005") && !r.ozet.includes("4111 1111") && r.ozet.includes("KKDF %15"), `SQL maskeleme: ${r.ozet}`);
    assert.ok(!JSON.stringify(r.cikarilan).includes("4111111111111111") && r.cikarilan.kkdf_pct === 15, "çıkarılan sayılarda kart no maskeli, sayılar korunur");
    const log = (await pg.query<{ area: string; kind: string; source: string }>(`select area, kind, source from cfo_change_log where item = $1`, [`belge ${id} ozet`])).rows;
    assert.deepEqual(log, [{ area: "veri", kind: "celiski", source: "cowork" }], "özet günlüğe (çelişki türüyle)");
    const after = (await pg.query<{ n: number }>(`select (select count(*) from cfo_credit_card) + (select count(*) from cfo_bank_account) + (select count(*) from cfo_loan) as n`)).rows[0].n;
    assert.equal(after, before, "belge özeti hiçbir defteri değiştirmez");
    assert.equal((await pg.query<{ n: number }>(`select count(*)::int n from cfo_belge_kuyrugu`)).rows[0].n, 0, "özetlenen kuyruktan çıkar");
    await assert.rejects(pg.query(`select cfo_belge_ozet_yaz($1, 'x', null, '', null)`, [id]), /yazan zorunlu/);

    const p = (await pg.query<{ a: boolean; u: boolean; r: boolean; f: boolean; rls: boolean }>(`select has_table_privilege('anon','public.cfo_belge','select') a,
      has_table_privilege('authenticated','public.cfo_belge','select') u, has_table_privilege('cfo_acceptance_reader','public.cfo_belge_kuyrugu','select') r,
      has_function_privilege('anon','public.cfo_belge_ozet_yaz(text,text,jsonb,text,text)','execute') f,
      (select relrowsecurity from pg_class where oid = 'public.cfo_belge'::regclass) rls`)).rows[0];
    assert.deepEqual([p.a, p.u, p.r, p.f, p.rls], [false, false, true, false, true]);
  } finally { await pg.close(); }
}

db().then(() => console.log("CFO belgeler: doğrulama, maskeleme (IBAN/kart/kimlik), sınırlı bağlam (açıklama üstün), migration CHECK/mükerrer/Cowork yazma yolu/defter değişmez/yetkiler passed"),
  e => { console.error(e); process.exitCode = 1; });
