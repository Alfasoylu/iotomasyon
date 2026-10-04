import { NextResponse } from "next/server";
import { getCurrentSession, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { buildCfoAcceptanceReport } from "@/lib/cfo-agent/acceptance-report";
import { cfoAccessFailure } from "@/lib/cfo-agent/access-check";
import { CFO_AGENT_SOURCE_NAMES, type ReadSource, type Row } from "@/lib/cfo-agent/sources";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;
const headers = { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie",
  "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" };

export async function GET() {
  // Preview-only diagnostic. Never adds an acceptance endpoint to production.
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ completed: false, failure: "preview_only" }, { status: 404, headers });
  }
  try {
    const user = await getCurrentSession();
    if (!user) return NextResponse.json({ completed: false, failure: "unauthorized" }, { status: 401, headers });
    if (user.role !== "ADMIN" || !await checkPermission(user, PERMISSIONS.CFO_READ)
      || !await checkPermission(user, PERMISSIONS.EXECUTIVE_READ)) {
      return NextResponse.json({ completed: false, failure: "forbidden" }, { status: 403, headers });
    }
    const report = await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout='15s'");
      await tx.$executeRawUnsafe("SET LOCAL idle_in_transaction_session_timeout='20s'");
      let queryId = 0;
      const db: ReadSource = {
        async query<T extends Row>(sql: string, ...params: unknown[]): Promise<T[]> {
          // Optional source errors must not poison the entire report transaction.
          const point = `cfo_acceptance_${++queryId}`;
          await tx.$executeRawUnsafe(`SAVEPOINT ${point}`);
          try {
            const rows = await tx.$queryRawUnsafe<T[]>(sql, ...params);
            await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${point}`);
            return rows;
          } catch (error) {
            await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${point}`);
            await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${point}`);
            throw error;
          }
        },
      };
      const required = [...CFO_AGENT_SOURCE_NAMES, "Product", "MarketplaceSalesRecord", "TrendyolSalesRecord",
        "HepsiburadaSalesRecord", "XmlStockChangeLog", "PurchaseOrder", "PurchaseOrderItem",
        "cfo_bank_account", "cfo_credit_card"];
      const readable = await db.query<{ source: string; readable: boolean }>(`select c.relname::text as source,
        has_table_privilege(current_user,c.oid,'SELECT') as readable
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind in ('r','p','v','m') and c.relname=any($1::text[])`, required);
      const [product] = await db.query<{ visible: boolean }>('select exists(select 1 from public."Product" limit 1) as visible');
      if (!product?.visible || required.some(source => !readable.some(row => row.source === source && row.readable))) {
        throw new Error("business_sources_not_visible");
      }
      // Server-owned reviewed profile; request cannot supply SQL, URI, flags or reference values.
      return buildCfoAcceptanceReport(db, { ...process.env,
        AI_CFO_ACCEPTANCE_MODE: "current_comparison",
        AI_CFO_ACCEPTANCE_SOURCE_PROFILE: "alfas_2026_10_03",
        AI_CFO_SOURCE_PROFILE: "alfas_2026_10_04",
      });
    }, { maxWait: 5000, timeout: 105000 });
    return NextResponse.json({ completed: true, execution: "vercel_preview", ...report }, { headers });
  } catch (error) {
    const safe = ["business_sources_not_visible", "reviewed_canonical_definition_changed", "unknown_cfo_source_profile",
      "invalid_source_bindings", "invalid_source_binding", "invalid_source_column"];
    const failure = error instanceof Error && safe.includes(error.message) ? error.message : cfoAccessFailure(error);
    return NextResponse.json({ completed: false, failure, productionApproval: false }, { status: 503, headers });
  }
}
