import "server-only";
import type { ClientConfig } from "pg";
import { CFO_AGENT_SOURCE_NAMES, type ReadSource, type Row } from "./sources";

export class CfoAccessError extends Error {
  constructor(readonly code: string) { super(code); }
}

/** Never return/log the input URI. TLS verification is mandatory. */
export function cfoReaderOptions(value: string | undefined): ClientConfig {
  if (!value?.trim()) throw new CfoAccessError("secret_missing");
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new CfoAccessError("invalid_database_uri"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new CfoAccessError("invalid_database_uri");
  if (!url.hostname.endsWith(".pooler.supabase.com") || url.port !== "5432" || url.pathname !== "/postgres") {
    throw new CfoAccessError("session_pooler_required");
  }
  let user: string, password: string;
  try { user = decodeURIComponent(url.username); password = decodeURIComponent(url.password); }
  catch { throw new CfoAccessError("invalid_database_uri"); }
  if (!/^cfo_acceptance_reader\.[a-z0-9]{20}$/.test(user)) throw new CfoAccessError("reader_username_required");
  if (!password || password.includes("BURAYA_") || password.includes("YOUR-PASSWORD")) {
    throw new CfoAccessError("password_placeholder");
  }
  return { host: url.hostname, port: 5432, user, password, database: "postgres",
    ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 15000, query_timeout: 15000 };
}

/** Only fixed diagnostic tags leave the process; no raw driver errors or URI. */
export function cfoAccessFailure(error: unknown): string {
  if (error instanceof CfoAccessError) return error.code;
  const item = error as { code?: unknown; message?: unknown } | null;
  const code = typeof item?.code === "string" ? item.code : "";
  if (["28P01", "28000"].includes(code)) return "authentication_failed";
  if (["SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "CERT_HAS_EXPIRED"].includes(code)) return "tls_certificate_error";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "hostname_unresolved";
  if (["ETIMEDOUT", "ECONNREFUSED", "ECONNRESET", "ENETUNREACH", "EHOSTUNREACH"].includes(code)) return "network_connection_failed";
  if (code === "42501") return "source_permission_denied";
  if (code === "57014") return "query_timeout";
  const message = typeof item?.message === "string" ? item.message : "";
  if (/tenant or user not found/i.test(message)) return "pooler_user_unknown";
  if (/timeout|timed out/i.test(message)) return "connection_timeout";
  return "connection_check_failed";
}

export async function checkCfoReaderAccess(db: ReadSource) {
  const [role] = await db.query(`select current_user::text as name, rolcanlogin as login,
    rolsuper as superuser, rolcreaterole as create_role, rolcreatedb as create_db,
    rolreplication as replication, rolbypassrls as bypass_rls,
    current_setting('default_transaction_read_only') as default_read_only
    from pg_roles where rolname=current_user`);
  if (role?.name !== "cfo_acceptance_reader" || role.login !== true) throw new CfoAccessError("reader_role_required");
  if (["superuser", "create_role", "create_db", "replication", "bypass_rls"].some(key => role[key] !== false)) {
    throw new CfoAccessError("reader_permissions_too_broad");
  }
  if (role.default_read_only !== "on") throw new CfoAccessError("reader_default_not_read_only");
  await db.query("BEGIN READ ONLY");
  try {
    await db.query("SET LOCAL statement_timeout='10s'");
    const [mode] = await db.query("select current_setting('transaction_read_only') as mode");
    if (mode?.mode !== "on") throw new CfoAccessError("read_only_transaction_required");
    const names = [...CFO_AGENT_SOURCE_NAMES, "Product", "MarketplaceSalesRecord", "TrendyolSalesRecord",
      "HepsiburadaSalesRecord", "XmlStockChangeLog", "PurchaseOrder", "PurchaseOrderItem", "cfo_bank_account", "cfo_credit_card"];
    const relations = await db.query(`select c.relname::text as source, c.relkind::text as kind,
      c.relrowsecurity as rls, has_table_privilege(current_user,c.oid,'SELECT') as readable,
      has_table_privilege(current_user,c.oid,'INSERT') or has_table_privilege(current_user,c.oid,'UPDATE')
        or has_table_privilege(current_user,c.oid,'DELETE') or has_table_privilege(current_user,c.oid,'TRUNCATE') as writable
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=any($1::text[]) and c.relkind in ('r','p','v','m')`, names);
    if (relations.some(row => row.writable === true)) throw new CfoAccessError("business_write_privileges_present");
    const columns = await db.query(`select table_name as source,column_name,data_type
      from information_schema.columns where table_schema='public' and table_name=any($1::text[])
      order by table_name,ordinal_position`, names);
    // Audit only the two canonical view definitions before financial acceptance.
    // No order/customer rows or functions are executed by this catalog query.
    const canonicalDefinitions = await db.query(`select c.relname::text as source,
      pg_get_viewdef(c.oid,true) as definition
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind in ('v','m')
      and c.relname=any($1::text[]) order by c.relname`, ["cfo_satis_birim_duz", "cfo_satis_siparis"]);
    const functions = await db.query(`select p.proname as source,p.provolatile::text as volatility,
      p.prosecdef as security_definer,has_function_privilege(current_user,p.oid,'EXECUTE') as executable,
      pg_get_function_result(p.oid) as result_type
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'
      and p.proname=any($1::text[]) order by p.proname`, ["cfo_nakit_projeksiyon", "cfo_kaynak_yeterliligi",
      "cfo_kart_karari", "cfo_gumruk_dilim", "cfo_defter_denetim", "cfo_onucus"]);
    let productRowsVisible: boolean | null = null;
    if (relations.some(row => row.source === "Product" && row.readable === true)) {
      const [row] = await db.query('select exists(select 1 from public."Product" limit 1) as visible');
      productRowsVisible = row?.visible === true;
    }
    const sources = names.map(source => ({ source, ...(relations.find(row => row.source === source) ?? { present: false }),
      columns: columns.filter(row => row.source === source).map(row => ({ name: row.column_name, type: row.data_type })) }));
    return { connected: true, readerRoleVerified: true, transactionReadOnly: true, tlsVerified: true,
      checkedAt: new Date().toISOString(), productRowsVisible, sources, functions, canonicalDefinitions,
      missingOrUnreadable: sources.filter(row => !(row as Row).readable).map(row => row.source),
      limitations: "Connection/schema access check only; no financial acceptance, migration, AI or business writes." };
  } finally { await db.query("ROLLBACK"); }
}
