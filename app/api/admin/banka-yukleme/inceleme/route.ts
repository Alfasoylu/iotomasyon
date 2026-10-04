import { NextResponse } from "next/server";
import { getCurrentSession, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { bankReview, type BankReviewSource } from "@/lib/banka/review";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie", "Cross-Origin-Resource-Policy": "same-origin", "X-Content-Type-Options": "nosniff" };

export async function GET() {
  try {
    const user = await getCurrentSession();
    if (!user) return NextResponse.json({ completed: false, failure: "unauthorized" }, { status: 401, headers });
    if (!await checkPermission(user, PERMISSIONS.CFO_WRITE) || !await checkPermission(user, PERMISSIONS.CFO_READ)) {
      return NextResponse.json({ completed: false, failure: "forbidden" }, { status: 403, headers });
    }
    const report = await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout='10s'");
      const db: BankReviewSource = { query: (sql, ...params) => tx.$queryRawUnsafe(sql, ...params) };
      return bankReview(db);
    }, { timeout: 45000, maxWait: 5000 });
    return NextResponse.json(report, { headers });
  } catch {
    return NextResponse.json({ completed: false, failure: "review_unavailable" }, { status: 503, headers });
  }
}
