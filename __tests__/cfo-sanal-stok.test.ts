import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { bootstrap } from "../scripts/schema-baseline/bootstrap";

// RF-20261010-036 (CRITICAL, 2026-10-10) — SANAL STOK net sermayede gerçek stok sayılıyordu: cfo_stok_istisna (insan beyanı, 40005100051
// "stok SANAL, bağlı sermaye 9.700 TL") yalnız ölü stok kurallarında uygulanıyordu. Migration 20261010130000: cfo_stok_deger.gercek_stok
// istisnayı dışlar (net sermaye, Goal v3, snapshot, sermaye verimliliği/sağlığı aynı kuraldan); cfo_metrik_net_sermaye stok satırına (3)
// yalnız BEYAN EDİLEN bağlı sermayeyi (/1,2) ekler — CFO-017 kimliği korunur. Üretim 10.10: net sermaye 2.401.170 → 1.383.531 TL.
// Çalıştır: node --import tsx __tests__/cfo-sanal-stok.test.ts
const MIG = "20261010130000_cfo_sanal_stok_istisna";

async function main() {
  const pg = new PGlite({ extensions: { vector } });
  try {
    await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create role cfo_acceptance_reader login nosuperuser nobypassrls;`);
    const res = await bootstrap({ exec: (s: string) => pg.exec(s), query: <T,>(s: string, p?: unknown[]) => pg.query<T>(s, p) });
    for (const m of res.pendingInProduction.filter(x => x !== MIG)) await pg.exec(readFileSync(`prisma/migrations/${m}/migration.sql`, "utf8"));
    await pg.exec(`set search_path = public;
      insert into "Product" (id, sku, name, "updatedAt", "stockQuantity", "unitCostTry", "isActive") values
        ('v1', 'V-SANAL', 'Sanal stoklu batarya', now(), 2513, 489.80, true),
        ('r1', 'R-GERCEK', 'Gerçek stok', now(), 10, 120, true),
        ('d1', 'D-KUKLA', 'Kukla stok', now(), 1000, 50, true);
      insert into cfo_stok_istisna (sku, sebep, gercek_bagli_try, kaynak) values ('V-SANAL', 'Stok SANAL (test)', 9700, 'test');
      insert into cfo_bank_account (id, name, "balanceTry", "accountType", "isActive", "updatedAt") values ('b1', 'Ana', 1000, 'Vadesiz', true, now());`);
    const q = async <T,>(s: string) => (await pg.query<T>(s)).rows;
    const lines = async () => new Map((await q<{ sira: number; tutar: string | null; aciklama: string }>(`select sira, tutar::text, aciklama from cfo_metrik_net_sermaye()`))
      .map(r => [r.sira, { v: r.tutar == null ? null : Number(r.tutar), a: r.aciklama }]));
    const real = async () => (await q<{ sku: string }>(`select sku from cfo_stok_deger where gercek_stok order by sku`)).map(r => r.sku);

    // öncesi: sanal stok gerçek sayılıyor (hata üretimde böyleydi)
    assert.deepEqual(await real(), ["R-GERCEK", "V-SANAL"], "öncesi: istisna SKU gerçek stok sayılıyor");
    const before = await lines();
    assert.equal(before.get(3)!.v, Math.round((2513 * 489.8 + 10 * 120) / 1.2 * 100) / 100, "öncesi: 2.513 sanal adet LCNRV'de");

    const sql = readFileSync(`prisma/migrations/${MIG}/migration.sql`, "utf8");
    await pg.exec(sql); await pg.exec(sql);
    assert.deepEqual(await real(), ["R-GERCEK"], "istisna SKU gerçek stok değil; kukla adet (1000) zaten değil");
    const after = await lines();
    assert.equal(after.get(3)!.v, Math.round((10 * 120 / 1.2 + 9700 / 1.2) * 100) / 100, "stok = gerçek LCNRV + beyan edilen bağlı sermaye /1,2");
    assert.match(after.get(3)!.a, /sanal stok istisnasi 1 SKU/);
    const sum = [1, 2, 3, 4, 5, 6, 7].reduce((s, k) => s + (after.get(k)!.v ?? 0), 0);
    assert.equal(Math.round(after.get(100)!.v! * 100), Math.round(sum * 100), "CFO-017 kimliği: bileşenler toplamı = net sermaye");
    assert.equal(Math.round((before.get(100)!.v! - after.get(100)!.v!) * 100) / 100, Math.round((2513 * 489.8 - 9700) / 1.2 * 100) / 100, "net sermaye sanal değer kadar düşer");
    // aynı kural tüm tüketicilerde (sermaye sağlığı / AI CFO bağlı sermaye kanıtı bu ifadeyi okur)
    const locked = (await q<{ v: string }>(`select (sum(maliyet_degeri) filter (where gercek_stok))::text v from cfo_stok_deger`))[0].v;
    assert.equal(Number(locked), 1200, "bağlı sermaye kanıtı sanal stoğu saymaz");
    // istisna SKU pasif / stoksuzsa beyan eklenmez
    await pg.exec(`update "Product" set "stockQuantity" = 0 where sku = 'V-SANAL'`);
    assert.equal((await lines()).get(3)!.v, 1000, "stoksuz istisna SKU: beyan eklenmez");
    // yetki: okuyucu rol görünümü okur, anon okuyamaz (CREATE OR REPLACE yetkileri korur)
    const pr = (await q<{ r: boolean; a: boolean }>(`select has_table_privilege('cfo_acceptance_reader','public.cfo_stok_deger','select') r,
      has_table_privilege('anon','public.cfo_stok_deger','select') a`))[0];
    assert.equal(pr.a, false);
    console.log(`RF-036 sanal stok: istisna SKU gerçek stok değil (tüm tüketiciler), net sermaye stok satırı = gerçek LCNRV + beyan /1,2, CFO-017 kimliği, idempotent; reader select ${pr.r} passed`);
  } finally { await pg.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
