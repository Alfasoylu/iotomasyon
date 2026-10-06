import "server-only";
import { prisma } from "@/lib/prisma";

export type Row = Record<string, unknown>;
export interface ReadSource {
  query<T extends Row = Row>(sql: string, ...params: unknown[]): Promise<T[]>;
}
export const businessSource: ReadSource = { query: (sql, ...params) => prisma.$transaction(async tx=>{
  // Short read-only source transaction, completed before provider calls. Even a
  // wrongly classified SQL function cannot mutate business tables through it.
  await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
  return tx.$queryRawUnsafe(sql,...params);
}, {timeout:20000}) };
// Identifiers may only be selected from catalog-confirmed columns of a fixed
// allowlist of sources. SQL expressions and arbitrary table names are forbidden.
const SOURCES = ["cfo_satis_siparis", "cfo_satis_birim_duz", "cfo_kargo_tarife", "cfo_kargo_kanal_varsayim", "cfo_stok_hareket_hiz",
  "cfo_kanal_net_oran", "cfo_set_bilesen_maliyet", "cfo_set_fiyat", "cfo_stok_istisna", "cfo_olu_stok", "cfo_yolda_sku",
  "cfo_yoldaki_kapsam", "cfo_nakit_kapisi", "cfo_odeme_gunluk", "cfo_servet", "cfo_servet_kalem", "cfo_servet_likidite"];
export const CFO_AGENT_SOURCE_NAMES: readonly string[] = Object.freeze([...SOURCES]);
const WATERMARK_SOURCES = ["MarketplaceSalesRecord", "TrendyolSalesRecord", "HepsiburadaSalesRecord", "XmlStockChangeLog"];
export function quoteColumn(s: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)) throw new Error("invalid_source_column");
  return `"${s}"`;
}
export class SourceCatalog {
  private columns = new Map<string, Set<string>>();
  private columnTypes = new Map<string, string>();
  readonly missing: string[] = [];
  constructor(readonly db: ReadSource, readonly bindings: Record<string, Record<string, string>> = {}) {}
  async load() {
    const rows = await this.db.query<{table_name:string;column_name:string;data_type:string}>(
      `select table_name, column_name, data_type from information_schema.columns where table_schema='public' and table_name=ANY($1::text[])`, [...SOURCES, ...WATERMARK_SOURCES]);
    for (const r of rows) {
      const cols = this.columns.get(r.table_name) ?? new Set<string>(); cols.add(r.column_name); this.columns.set(r.table_name, cols);
      this.columnTypes.set(`${r.table_name}.${r.column_name}`, r.data_type);
    }
  }
  column(source: string, field: string, defaultName = field): string | null {
    const name = this.bindings[source]?.[field] ?? defaultName;
    return this.columns.get(source)?.has(name) ? quoteColumn(name) : null;
  }
  /** Prisma/Entegra persist UTC in timestamp-without-zone; compare local times with local period bounds. */
  localTime(source: string, field: string, alias = ""): string | null {
    const column = this.column(source, field), name = this.bindings[source]?.[field] ?? field;
    if (!column) return null;
    const qualified = alias ? `${quoteColumn(alias)}.${column}` : column;
    const type = this.columnTypes.get(`${source}.${name}`);
    if (type === "timestamp without time zone") return `((${qualified} at time zone 'UTC') at time zone 'Europe/Istanbul')`;
    if (type === "timestamp with time zone") return `(${qualified} at time zone 'Europe/Istanbul')`;
    if (type === "date") return `${qualified}::timestamp`;
    this.missing.push(`${source}.${field}:time_type_unavailable`);
    return null;
  }
  require(source: string, fields: string[]): Record<string,string> | null {
    const out:Record<string,string> = {};
    for (const field of fields) { const col=this.column(source,field); if (!col) {this.missing.push(`${source}.${field}`); return null;} out[field]=col; }
    return out;
  }
  async rows(source: string, fields: string[], limit = 1000): Promise<Row[] | null> {
    if (!SOURCES.includes(source)) throw new Error("source_not_allowed");
    const c=this.require(source,fields); if (!c) return null;
    return this.db.query(`select ${fields.map(f=>`${c[f]} as ${quoteColumn(f)}`).join(",")} from public.${quoteColumn(source)} limit $1`,limit);
  }
}
export function sourceBindings(env: Record<string,string|undefined> = process.env): Record<string, Record<string, string>> {
  if (!env.AI_CFO_SOURCE_COLUMNS_JSON) return {};
  const value:unknown=JSON.parse(env.AI_CFO_SOURCE_COLUMNS_JSON);
  if (!value || typeof value!=="object" || Array.isArray(value)) throw new Error("invalid_source_bindings");
  for (const [source, fields] of Object.entries(value)) {
    if (!SOURCES.includes(source) || !fields || typeof fields!=="object" || Array.isArray(fields)) throw new Error("invalid_source_binding");
    for (const name of Object.values(fields)) { if(typeof name!=="string") throw new Error("invalid_source_column"); quoteColumn(name); }
  }
  return value as Record<string, Record<string,string>>;
}
export async function cashFunctions(db: ReadSource, missing: string[]): Promise<Record<string, Row[]>> {
  const calls:Record<string,string> = {
    cfo_nakit_projeksiyon:"select to_jsonb(t) as data from (select * from public.cfo_nakit_projeksiyon(120)) t limit 121",
    cfo_kaynak_yeterliligi:"select to_jsonb(t) as data from (select * from public.cfo_kaynak_yeterliligi()) t limit 10",
    cfo_kart_karari:"select to_jsonb(t) as data from (select * from public.cfo_kart_karari()) t limit 20",
    cfo_gumruk_dilim:"select to_jsonb(t) as data from (select * from public.cfo_gumruk_dilim()) t limit 10",
    cfo_defter_denetim:"select to_jsonb(t) as data from (select * from public.cfo_defter_denetim()) t limit 30",
    cfo_onucus:"select to_jsonb(t) as data from (select * from public.cfo_onucus()) t limit 30",
  };
  const out:Record<string,Row[]>={};
  const present=await db.query<{name:string}>(`select p.proname as name from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=ANY($1::text[]) and p.provolatile in ('s','i')`,Object.keys(calls));
  // Only STABLE/IMMUTABLE functions are admitted. A separate read-only DB role
  // is recommended; undocumented VOLATILE functions are not executed.
  for(const name of Object.keys(calls)) {
    if(!present.some(r=>r.name===name)){missing.push(`${name}:missing_or_not_read_only`);continue;}
    try { out[name]=(await db.query<{data:Row}>(calls[name])).map(r=>r.data); }
    catch {missing.push(`${name}:unavailable`);}
  }
  return out;
}
