/**
 * Ölü stok bağımsız ilan: (1) gece stok eşitleme planlayıcısı — yalnız değişen adet, bayat XML'de hiçbir şey, 0–20000 sınırı;
 * (2) Trendyol onaylı ürün yanıtından barkodun içeriği (contentId, marka, kategori, içerik + varyant özellikleri);
 * (3) migration 20261010150000 üretim kopyasında: CHECK'ler (ALFOS- barkod, kanal, fiyat), tekillik, iki kez uygulanabilir, anon/authenticated yetkisiz.
 * Çalıştır: node --import tsx __tests__/olu-stok-stock-sync.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { bootstrap } from "../scripts/schema-baseline/bootstrap";
import { planStockSync } from "../lib/olu-stok/stock-plan";
import { parseApproved } from "../lib/trendyol/approved";

async function main() {
  // (1) Planlayıcı
  const now = new Date("2026-10-11T02:40:00Z"), fresh = new Date("2026-10-11T02:31:00Z"), stale = new Date("2026-10-09T02:31:00Z");
  const xml = new Map([["A", { qty: 7, syncedAt: fresh }], ["B", { qty: 3, syncedAt: fresh }], ["C", { qty: 9, syncedAt: stale }], ["D", { qty: 50000, syncedAt: fresh }]]);
  const r = planStockSync([{ id: "1", sku: "A", barcode: "ALFOS-A", lastQty: 10 }, { id: "2", sku: "B", barcode: "ALFOS-B", lastQty: 3 },
    { id: "3", sku: "C", barcode: "ALFOS-C", lastQty: 1 }, { id: "4", sku: "D", barcode: "ALFOS-D", lastQty: null }, { id: "5", sku: "Z", barcode: "ALFOS-Z", lastQty: 1 }], xml, now);
  assert.deepEqual(r.items.map(i => [i.barcode, i.quantity]), [["ALFOS-A", 7], ["ALFOS-D", 20000]]);
  assert.deepEqual(r.skipped.map(s => `${s.sku}:${s.reason}`), ["B:değişmedi", "C:XML stoğu bayat", "Z:ürün yok"]);
  assert.ok(r.items.every(i => i.salePrice === undefined && i.listPrice === undefined), "fiyat asla otomatik gönderilmez");

  // (2) Onaylı ürün yanıtı
  const json = { content: [{ contentId: 12715815, brand: { id: 315675 }, category: { id: 91266 }, title: "Eski başlık", description: "d",
    images: [{ url: "https://cdn/1.jpg" }], attributes: [{ attributeId: 47, attributeValue: "Black" }, { attributeId: 295, attributeValueId: 2886 }],
    variants: [{ barcode: "X1", commission: 7.83, attributes: [{ attributeId: 293, attributeValueId: 4602 }] }, { barcode: "X2", attributes: [] }] }] };
  const a = parseApproved(json, "X1")!;
  assert.deepEqual([a.contentId, a.brandId, a.categoryId, a.commissionPct, a.images], [12715815, 315675, 91266, 7.83, ["https://cdn/1.jpg"]]);
  assert.deepEqual(a.attributes, [{ attributeId: 47, customAttributeValue: "Black" }, { attributeId: 295, attributeValueId: 2886 }, { attributeId: 293, attributeValueId: 4602 }]);
  assert.equal(parseApproved(json, "YOK"), null);
  assert.equal(parseApproved(null, "X1"), null);

  // (3) Migration
  const pg = new PGlite({ extensions: { vector } });
  try {
    await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create role cfo_acceptance_reader login nosuperuser nobypassrls;`);
    const res = await bootstrap({ exec: (s: string) => pg.exec(s), query: <T,>(s: string, p?: unknown[]) => pg.query<T>(s, p) });
    for (const m of res.pendingInProduction) await pg.exec(readFileSync(`prisma/migrations/${m}/migration.sql`, "utf8"));
    const sql = readFileSync("prisma/migrations/20261010150000_olu_stok_bagimsiz_ilan/migration.sql", "utf8");
    await pg.exec(sql); await pg.exec(sql);
    await pg.exec("set search_path = public");
    const ins = (o: Record<string, unknown> = {}) => pg.query(`insert into olu_stok_bagimsiz_ilan (sku, kanal, barkod, baslik, satis_fiyati, olusturan)
      values ($1, $2, $3, $4, $5, 'alperen')`, [o.sku ?? "S1", o.kanal ?? "TRENDYOL", o.barkod ?? "ALFOS-S1", o.baslik ?? "Yeni başlık", o.fiyat ?? 199.9]);
    const fails = async (o: Record<string, unknown>) => { try { await ins(o); return false; } catch { return true; } };
    await ins();
    for (const [o, why] of [[{}, "aynı kanal + barkod"], [{ barkod: "S1-ENTEGRA" }, "ALFOS- dışı barkod"], [{ barkod: "ALFOS-2", kanal: "N11" }, "kanal"],
      [{ barkod: "ALFOS-3", fiyat: 0 }, "fiyat > 0"], [{ barkod: "ALFOS-4", baslik: " " }, "başlık"]] as const)
      assert.ok(await fails(o), why);
    await ins({ kanal: "PTTAVM" });
    const row = (await pg.query<{ durum: string; n: number }>(`select min(durum) durum, count(*)::int n from olu_stok_bagimsiz_ilan`)).rows[0];
    assert.deepEqual([row.durum, row.n], ["GONDERILDI", 2]);
    const p = (await pg.query<{ a: boolean; u: boolean; r: boolean; rls: boolean }>(`select has_table_privilege('anon','public.olu_stok_bagimsiz_ilan','select') a,
      has_table_privilege('authenticated','public.olu_stok_bagimsiz_ilan','select') u, has_table_privilege('cfo_acceptance_reader','public.olu_stok_bagimsiz_ilan','select') r,
      (select relrowsecurity from pg_class where relname = 'olu_stok_bagimsiz_ilan') rls`)).rows[0];
    assert.deepEqual(p, { a: false, u: false, r: true, rls: true });
  } finally { await pg.close(); }
  console.log("Ölü stok stok eşitlemesi: yalnız değişen adet, bayat XML'de gönderim yok, fiyat yok; onaylı ürün ayrıştırma; migration CHECK/tekillik/yetki passed");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
