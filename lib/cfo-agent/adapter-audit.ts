import "server-only";
import type { ReadSource } from "./sources";
import { quoteColumn } from "./sources";

// Off-line, bounded adapter audit. Never part of an AI prompt or cron runner.
export async function collectCfoAdapterAudit(db: ReadSource) {
  await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    await db.query("SET LOCAL statement_timeout='20s'");
    const names = ["cfo_kargo_tarife", "cfo_set_bilesen_maliyet", "cfo_set_fiyat", "cfo_nakit_kapisi",
      "cfo_odeme_gunluk", "cfo_satis_birim", "cfo_run", "cfo_insight", "cfo_usage", "_prisma_migrations"];
    const relations = await db.query(`select c.relname as source,c.relkind::text as kind,c.relrowsecurity as rls,
      has_table_privilege(current_user,c.oid,'SELECT') as readable
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=any($1::text[]) order by c.relname`, names);
    const columns = await db.query(`select table_name as source,column_name,data_type from information_schema.columns
      where table_schema='public' and table_name=any($1::text[]) order by table_name,ordinal_position`, names);
    const definitions = await db.query(`select c.relname as source,pg_get_viewdef(c.oid,true) as definition
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
      and c.relkind in ('v','m') and c.relname=any($1::text[]) order by c.relname`, names);
    const functions = await db.query(`select p.proname as source,pg_get_function_identity_arguments(p.oid) as arguments,
      p.provolatile::text as volatility,p.prosecdef as security_definer,
      pg_get_function_result(p.oid) as result_type,pg_get_functiondef(p.oid) as definition
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'
      and (p.proname=any($1::text[]) or p.proname like 'cfo_%set%') order by p.proname,p.oid`, ["cfo_nakit_projeksiyon", "cfo_kaynak_yeterliligi",
      "cfo_kart_karari", "cfo_gumruk_dilim", "cfo_defter_denetim", "cfo_onucus"]);
    const fields: Record<string, string[]> = {
      cfo_kargo_tarife: ["pazaryeri", "band", "alt_sinir", "ust_sinir", "tarife", "ek_maliyet", "toplam", "olcum_adet", "kaynak", "gecerli_tarih"],
      cfo_set_bilesen_maliyet: ["grup", "model", "kanal", "kapasite_tb", "maliyet_try_kdv_dahil", "kur", "kaynak", "gecerli_tarih", "note"],
      cfo_set_fiyat: ["sku", "kanal", "kapasite", "fiyat", "maliyet", "kargo", "desi", "kar", "marj_pct", "taban", "pazaryeri", "komisyon_pct", "guncellendi", "uyari"],
    };
    const configuration: Record<string, unknown> = {};
    for (const [source, requested] of Object.entries(fields)) {
      if (!relations.some(r => r.source === source && r.readable === true)) { configuration[source] = { unavailable: true }; continue; }
      const selected = requested.filter(field => columns.some(c => c.source === source && c.column_name === field));
      if (!selected.length) { configuration[source] = { missing_columns: true }; continue; }
      const [count] = await db.query(`select count(*)::int as count from public.${quoteColumn(source)}`);
      const rows = await db.query(`select ${selected.map(quoteColumn).join(",")} from public.${quoteColumn(source)}
        order by ${selected.map(quoteColumn).join(",")} limit 500`);
      configuration[source] = { count: count?.count, truncated: Number(count?.count) > rows.length, rows };
    }
    const [products] = await db.query(`select count(*)::int as package_count from public."Product" where "isActive" and "productKind"::text='LISTING_PACKAGE'`);
    const packages = await db.query(`select sku,"mainProductId" as main_product_id,"stockQuantity" as listing_stock,"unitCostTry" as cost
      from public."Product" where "isActive" and "productKind"::text='LISTING_PACKAGE' order by sku limit 100`);
    let migrations: unknown = { unavailable: true };
    if (relations.some(r => r.source === "_prisma_migrations" && r.readable === true)) {
      migrations = await db.query(`select migration_name,finished_at,rolled_back_at from public._prisma_migrations order by started_at desc limit 100`);
    }
    return { checkedAt: new Date().toISOString(), relations, columns, definitions, functions, configuration,
      packages: { count: products?.package_count, rows: packages }, migrations, productionApproval: false };
  } finally { await db.query("ROLLBACK"); }
}
