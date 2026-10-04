import { numeric } from "./calculations";
import { SourceCatalog, type ReadSource } from "./sources";
import type { CfoAgentSnapshot } from "./types";

const targets = ["MD-3003B1", "ANUNNAKI-POINTER"];
const agreement = (actual: unknown, native: unknown) => {
  const a = numeric(actual), b = numeric(native);
  return { actual: a, native: b, status: a == null || b == null ? "unknown" :
    Math.abs(a - b) <= 0.000001 ? "match" : "difference" };
};

/** Aggregate source alignment, not independent ledger acceptance or a new reference. */
export async function cfoAcceptanceReconciliation(db: ReadSource, snapshot: CfoAgentSnapshot) {
  const asOf = snapshot.generatedAt;
  const catalog = new SourceCatalog(db); await catalog.load();
  const columns = catalog.require("cfo_satis_birim_duz",
    ["channel", "modelNumber", "orderNumber", "orderDate", "adet_duz", "guven"]);
  const time = catalog.localTime("cfo_satis_birim_duz", "orderDate", "s");
  const velocityColumns = catalog.require("cfo_stok_hareket_hiz",
    ["sku", "adet30", "gunluk_30g_ihtiyatli", "tukenme_gun_ihtiyatli", "hizlanma_katsayi"]);
  const sales = columns && time ? await db.query(`with clock as (
      select date_trunc('day',$1::timestamptz at time zone 'Europe/Istanbul') as end_at
    ), periods as (
      select 'current30'::text as period,end_at-interval '30 days' as start_at,end_at from clock
      union all select 'previous_day30',end_at-interval '31 days',end_at-interval '1 day' from clock
    ), lines as (
      select s.${columns.channel} as channel,s.${columns.modelNumber} as sku,
        ${time} as local_at,s.${columns.adet_duz}::numeric as units,s.${columns.guven}::text as trust,
        count(*) over(partition by s.${columns.channel},s.${columns.orderNumber},s.${columns.modelNumber}) as copies
      from public.cfo_satis_birim_duz s
      where s.${columns.modelNumber}=any($2::text[]) and s.${columns.adet_duz}>0
      and ${time} >= (select end_at-interval '65 days' from clock)
    ) select p.period,p.start_at::text,p.end_at::text,l.sku,l.channel,
      count(*)::int as records,sum(l.units) as native_units,
      count(*) filter(where l.trust is null or l.trust in ('KARMA','BILINMIYOR'))::int as untrusted,
      count(*) filter(where l.copies>1)::int as duplicates
    from periods p join lines l on l.local_at>=p.start_at and l.local_at<p.end_at
    group by p.period,p.start_at,p.end_at,l.sku,l.channel order by p.period,l.sku,l.channel`, asOf, targets) : [];
  const velocity = velocityColumns ? await db.query(`select
    ${velocityColumns.sku} as sku,${velocityColumns.adet30} as xml_units30,
    ${velocityColumns.gunluk_30g_ihtiyatli} as xml_velocity,
    ${velocityColumns.tukenme_gun_ihtiyatli} as stock_days,
    ${velocityColumns.hizlanma_katsayi} as acceleration
    from public.cfo_stok_hareket_hiz where ${velocityColumns.sku}=any($1::text[])`, targets) : [];
  const stock = await db.query(`select sku,count(*)::int as active_rows,
    case when count(*)=1 then max("stockQuantity") end as stock_qty
    from public."Product" where "isActive" and sku=any($1::text[]) group by sku`, targets);
  const banks = await db.query(`select count(*)::int as active_accounts,
    count(*) filter(where "balanceTry" is null)::int as missing_balances,
    count(*) filter(where "lastUpdatedAt" is null)::int as missing_timestamps,
    count(*) filter(where "lastUpdatedAt"<$1::timestamptz-interval '7 days')::int as stale_accounts,
    min("lastUpdatedAt") as oldest_updated_at,max("lastUpdatedAt") as newest_updated_at
    from public.cfo_bank_account where "isActive"`, asOf);
  const signals = targets.map(sku => {
    const signal = snapshot.products.find(p => p.sku === sku && (sku !== "MD-3003B1" || p.channel === "TRENDYOL"));
    const nativeRows = velocity.filter(r => r.sku === sku);
    const native = nativeRows.length === 1 ? nativeRows[0] : undefined;
    const current = sales.filter(r => r.sku === sku && r.period === "current30");
    const trusted = current.filter(r => r.untrusted === 0 && r.duplicates === 0);
    const units = columns && time && trusted.length ?
      trusted.reduce((sum, r) => sum + (numeric(r.native_units) ?? 0), 0) : null;
    return { sku, channel: signal?.channel ?? null, nativeVelocityRows: nativeRows.length,
      canonicalUnitsScope: "all_trusted_channels_for_sku",
      alignment: {
        salesUnits30: agreement(signal?.salesUnits30.value, units),
        xmlUnits30: agreement(signal?.xmlUnits30.value, native?.xml_units30),
        xmlVelocity: agreement(signal?.xmlVelocity.value, native?.xml_velocity),
        stockDays: agreement(signal?.stockDays.value, native?.stock_days),
        stockQty: agreement(signal?.stockQty, stock.find(r => r.sku === sku)?.stock_qty),
      },
      demand: { sales30Complete: snapshot.sales.last30Days.complete,
        salesVelocity: signal?.salesVelocity ?? null, xmlVelocity: signal?.xmlVelocity ?? null,
        selectedVelocity: signal?.velocity ?? null,
        selectedSource: !signal ? "signal_unavailable" : signal.salesVelocity.value == null ? "xml_only_sales_incomplete" : "minimum_sales_and_xml",
        acceleration: numeric(native?.acceleration),
        stockDaysSource: "native_cfo_stok_hareket_hiz",
        historicalXmlOrStockReconstructionSupported: false },
    };
  });
  return { diagnosticOnly: true, productionApproval: false, asOf,
    referenceChanged: false, salesAvailable: !!columns && !!time, velocityAvailable: !!velocityColumns,
    canonicalWindows: sales, signals, bankFreshness: banks[0] ?? null,
    bankFreshnessRule: "Every active account needs a balance and timestamp no older than seven days; newest timestamp alone is insufficient.",
    setComponentSchemaMissing: snapshot.dataQuality.missingFields.includes("cfo_set_bilesen_maliyet.set_sku"),
    limitations: "Alignment checks compare current sources with the agent in the same transaction. They do not verify historical ledger values or replace the frozen 12 checks." };
}
