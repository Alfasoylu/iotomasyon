import { SourceCatalog, type ReadSource } from "./sources";

/** Only aggregate evidence for the frozen reference SKU; no order/customer IDs. */
export async function cfoAcceptanceDiagnostics(db: ReadSource, asOf: string) {
  const catalog = new SourceCatalog(db); await catalog.load();
  const fields = catalog.require("cfo_satis_birim_duz", ["channel", "modelNumber", "orderDate", "commissionTry", "totalAmountTry", "guven"]);
  const time = catalog.localTime("cfo_satis_birim_duz", "orderDate", "s");
  if (!fields || !time) return { available: false };
  const base = `select s.${fields.commissionTry}::numeric as commission,s.${fields.totalAmountTry}::numeric as gross,
    s.${fields.guven}::text as trust from cfo_satis_birim_duz s
    where s.${fields.modelNumber}=$2 and s.${fields.channel}=$3
    and ${time}>=date_trunc('day',$1::timestamptz at time zone 'Europe/Istanbul')-interval '120 days'
    and ${time}<=($1::timestamptz at time zone 'Europe/Istanbul')`;
  const params = [asOf, "MD-3003B1", "TRENDYOL"];
  const summary = await db.query(`with base as (${base}) select count(*)::int as records,
    count(commission)::int as commission_present,
    count(*) filter(where trust is null or trust in ('KARMA','BILINMIYOR'))::int as untrusted,
    round(100*sum(commission)/nullif(sum(gross),0),4) as native_weighted_pct,
    round(100*sum(commission) filter(where trust is not null and trust not in ('KARMA','BILINMIYOR'))
      /nullif(sum(gross) filter(where trust is not null and trust not in ('KARMA','BILINMIYOR')),0),4) as trusted_weighted_pct
    from base`, ...params);
  const distribution = await db.query(`with base as (${base}) select trust,
    round(100*commission/nullif(gross,0),2) as rate_pct,count(*)::int as records,
    sum(commission) as commission_try,sum(gross) as gross_try from base
    group by 1,2 order by 2 limit 100`, ...params);
  return { available: true, source: "cfo_satis_birim_duz", sku: "MD-3003B1", channel: "TRENDYOL",
    basis: "gross_incl_vat", diagnosticOnly: true, summary, distribution };
}
