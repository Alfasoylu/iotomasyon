import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// XML sync → Financial Memory stock refresh → reconciliation, through the REAL runSync and the REAL Prisma client
// (PGlite = real PostgreSQL behind a socket; schema generated from prisma/schema.prisma + the repo's fm migrations).
// Run with: node --conditions=react-server --import tsx __tests__/xml-sync-fm-refresh.test.ts
const MIGRATIONS = ["20261005210000_fm_canonical_sales", "20261005220000_fm_memory_schema", "20261005230000_fm_sales_backfill",
  "20261005250000_fm_stock_balance", "20261005280000_fm_stock_adjustment", "20261005300000_fm_stock_refresh_automation"];
type Row = Record<string, unknown>;

const feed = (items: Array<[string, number]>) => `<?xml version="1.0"?><Urunler>${items.map(([sku, qty]) =>
  `<Urun><urun_kodu>${sku}</urun_kodu><urun_ismi>${sku} adı</urun_ismi><urun_stok>${qty}</urun_stok></Urun>`).join("")}</Urunler>`;

async function main() {
  // 1) Schema from prisma/schema.prisma (what `prisma db push` would create) + fm migrations.
  const ddl = spawnSync("npx", ["prisma", "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script"],
    { env: { ...process.env, DIRECT_URL: "postgresql://x:x@localhost:5432/x" }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  assert.equal(ddl.status, 0, ddl.stderr);
  const pg = new PGlite({ extensions: { vector } });
  await pg.exec("create extension if not exists vector;");
  await pg.exec(ddl.stdout);
  for (const m of MIGRATIONS) await pg.exec(readFileSync(`prisma/migrations/${m}/migration.sql`, "utf8"));
  const server = new PGLiteSocketServer({ db: pg, port: 0, host: "127.0.0.1" });
  await server.start();
  const conn = server.getServerConn();
  const url = conn.startsWith("postgres") ? conn : `postgresql://postgres:postgres@${conn}/postgres`;
  process.env.DATABASE_URL = url;
  // PGlite serves one query at a time: a single pooled connection keeps the real adapter/Prisma code path but avoids socket-level contention.
  (globalThis as unknown as { _prismaClient: PrismaClient })._prismaClient = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 1 }) });

  // next/cache needs a Next request context; the sync core only calls revalidatePath after the DB work.
  const nextCache = require.resolve("next/cache");
  require.cache[nextCache] = { id: nextCache, filename: nextCache, loaded: true, exports: { revalidatePath: () => undefined } } as unknown as NodeJS.Module;
  const { prisma } = await import("../lib/prisma");
  const { runSync } = await import("../lib/xml-sync-runner");
  const { refreshFinancialMemoryStock } = await import("../lib/fm/stock-refresh");
  const q = async <T extends Row>(sql: string): Promise<T[]> => prisma.$queryRawUnsafe<T[]>(sql);
  const num = (v: unknown) => Number(v);

  try {
    await prisma.product.createMany({ data: [{ sku: "S1", name: "S1", stockQuantity: 10, stockSource: "XML" }, { sku: "S2", name: "S2", stockQuantity: 5, stockSource: "XML" },
      { sku: "S3", name: "S3", stockQuantity: 20, stockSource: "XML" }] });
    const source = await prisma.xmlSyncSource.create({ data: { name: "entegra-test", url: "http://feed.test/a" } });
    let body = "", status = 200;
    globalThis.fetch = (async () => new Response(body, { status })) as typeof fetch;
    const sync = () => runSync(source.id, source.url, null, null);
    const lastLog = async () => (await q<{ id: string; status: string }>(`select id, status::text as status from "XmlSyncLog" order by "startedAt" desc, id desc limit 1`))[0];
    const runs = async () => q<{ status: string; reason: string | null; sync_log_id: string | null }>(`select status, lineage->>'reason' as reason, lineage->>'sync_log_id' as sync_log_id from fm_ingest_run where kind='stock_refresh' order by started_at, id`);

    // ── A) successful sync: S1 10→7, S4 new → refresh runs, chain=Product, reconciliation clean ─────────────────────────────
    body = feed([["S1", 7], ["S2", 5], ["S3", 20], ["S4", 3]]);
    const a = await sync();
    assert.equal(a.ok, true, String(a.message)); assert.match(String(a.message), /ürün güncellendi/, "mevcut XML sync mesajı değişmedi");
    const logA = await lastLog(); assert.equal(logA.status, "SUCCESS");
    assert.deepEqual((await runs()).map(r => [r.status, r.sync_log_id]), [["succeeded", logA.id]]);
    assert.equal((await q(`select 1 from "XmlStockChangeLog"`)).length, 1);
    const sku = await q(`select s.sku, s.units_eod, s.units_open from fm_stock_sku_day s`);
    assert.deepEqual(sku.map(r => [r.sku, num(r.units_eod), num(r.units_open)]), [["S1", 7, 10]]);
    const recon = await q<{ status: string; n: string }>(`select status, count(*)::text n from fm_stock_reconciliation group by status`);
    assert.deepEqual(recon.map(r => [r.status, num(r.n)]), [["MATCH", 1]]);
    assert.equal((await q(`select status from fm_stock_freshness`))[0].status, "FRESH");
    const lineage = (await q<{ lineage: Record<string, unknown> }>(`select lineage from fm_ingest_run where status='succeeded'`))[0].lineage;
    assert.deepEqual(lineage.reconciliation, { MATCH: 1 }, "mutabakat aynı kayıtta");

    // ── B) idempotent: same sync again through the helper does not refresh twice ─────────────────────────────────────────────
    assert.deepEqual(await refreshFinancialMemoryStock(logA.id), { refreshed: false, reason: "already_refreshed" });
    assert.equal((await runs()).filter(r => r.status === "succeeded").length, 1);

    // ── C) PARTIAL sync (empty feed): no refresh, and nothing looks successful ──────────────────────────────────────────────
    const succeededBefore = (await q(`select max(finished_at) m from fm_ingest_run where status='succeeded'`))[0].m;
    body = feed([]);
    const c = await sync(); assert.equal(c.ok, false);
    const logC = await lastLog(); assert.equal(logC.status, "PARTIAL");
    const afterC = await runs();
    assert.deepEqual(afterC.slice(1).map(r => [r.status, r.reason, r.sync_log_id]), [["failed", "sync_not_success", logC.id]]);
    assert.equal((await q(`select max(finished_at) m from fm_ingest_run where status='succeeded'`))[0].m?.toString(), succeededBefore?.toString(), "başarılı yenileme zamanı değişmedi");

    // ── D) failed sync (HTTP 500): same ─────────────────────────────────────────────────────────────────────────────────────
    status = 500; body = "boom";
    const d = await sync(); assert.equal(d.ok, false);
    const logD = await lastLog(); assert.equal(logD.status, "ERROR");
    assert.deepEqual((await runs()).slice(2).map(r => [r.status, r.reason, r.sync_log_id]), [["failed", "sync_not_success", logD.id]]);
    assert.equal((await runs()).filter(r => r.status === "succeeded").length, 1, "hatalı/partial senkron başarılı yenileme üretmedi");
    status = 200;

    // ── E) a sync that wrote stock logs but did not finish leaves memory STALE; the next SUCCESS sync heals it ──────────────
    await prisma.$executeRawUnsafe(`insert into "XmlStockChangeLog"(id, "productId", "syncLogId", "sourceId", "previousQty", "newQty", delta, "syncedAt")
      select 'orphan-log', id, '${logD.id}', '${source.id}', 7, 6, -1, now() from "Product" where sku='S1'`);
    await prisma.$executeRawUnsafe(`update "Product" set "stockQuantity"=6 where sku='S1'`);
    assert.equal((await q(`select status from fm_stock_freshness`))[0].status, "STALE");
    assert.equal(num((await q(`select unexplained_products u from fm_stock_freshness`))[0].u), 1, "yarım kalan senkronun farkı mutabakatta görünür");
    body = feed([["S1", 6], ["S2", 4], ["S3", 20], ["S4", 3]]);
    const e = await sync(); assert.equal(e.ok, true);
    const logE = await lastLog(); assert.equal(logE.status, "SUCCESS");
    assert.equal((await runs()).filter(r => r.status === "succeeded").length, 2);
    const reconE = await q<{ sku: string; status: string; product_qty: number; chain_last_qty: number }>(`select sku, status, product_qty, chain_last_qty from fm_stock_reconciliation order by sku`);
    assert.deepEqual(reconE.map(r => [r.sku, r.status, num(r.product_qty), num(r.chain_last_qty)]), [["S1", "MATCH", 6, 6], ["S2", "MATCH", 4, 4]]);
    const f = (await q(`select status, unexplained_products from fm_stock_freshness`))[0]; assert.equal(f.status, "FRESH"); assert.equal(num(f.unexplained_products), 0);

    // ── F) a failing refresh never breaks the sync: recorded as failed, memory reported STALE, retry heals ─────────────────
    await prisma.$executeRawUnsafe(`alter function public.fm_stock_refresh() rename to fm_stock_refresh_off`);
    body = feed([["S1", 5], ["S2", 4], ["S3", 20], ["S4", 3]]);
    const g = await sync(); assert.equal(g.ok, true, "senkron yenileme hatasından etkilenmedi");
    const logG = await lastLog(); assert.equal(logG.status, "SUCCESS");
    const lastRun = (await runs()).at(-1)!;
    assert.deepEqual([lastRun.status, lastRun.reason, lastRun.sync_log_id], ["failed", "refresh_error", logG.id]);
    assert.equal((await q(`select status from fm_stock_freshness`))[0].status, "STALE", "yenilenemeyen senkron STALE görünür");
    await prisma.$executeRawUnsafe(`alter function public.fm_stock_refresh_off() rename to fm_stock_refresh`);
    const retry = await refreshFinancialMemoryStock(logG.id);
    assert.equal(retry.refreshed, true, "başarısız yenileme sonradan yeniden denenebilir");
    assert.equal((await q(`select status from fm_stock_freshness`))[0].status, "FRESH");

    // Raw sources are only written by the sync itself; memory tables carry the same numbers as Product.
    assert.equal(num((await q(`select sum("stockQuantity") s from "Product" where sku in ('S1','S2')`))[0].s), 5 + 4);
    assert.equal(num((await q(`select units_total_logged u from fm_stock_company_day order by economic_date desc limit 1`))[0].u), 5 + 4, "hafıza toplamı = Product (loglu ürünler)");
    console.log("XML sync → fm_stock_refresh → reconciliation: success refreshes, partial/error never, idempotent, stale→fresh, sync unaffected passed");
  } finally {
    await prisma.$disconnect().catch(() => undefined);
    await server.stop().catch(() => undefined);
    await pg.close().catch(() => undefined);
  }
}
main().then(() => process.exit(process.exitCode ?? 0)).catch(e => { console.error(e); process.exit(1); });
