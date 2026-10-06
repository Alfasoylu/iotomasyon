import { NextResponse } from "next/server";
import { getCurrentSession, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { safeAiCfoRun } from "@/lib/cfo-agent/ai-trigger";
import { RUNNER_BODY_LIMIT, runnerRequestGuard } from "@/lib/cfo-agent/runner-request";

// /admin/ai-cfo elle çalıştırma (ADMIN + CFO_READ + EXECUTIVE_READ + CFO_WRITE, aynı origin, yalnız production).
// Runner kendi kapılarını uygular: bayraklar kapalıyken `disabled`, AI kapalıyken model çağrılmaz.
export const dynamic = "force-dynamic"; export const runtime = "nodejs"; export const maxDuration = 120;
const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" };
export async function POST(req: Request) {
  const user = await getCurrentSession();
  const authorized = !!user && user.role === "ADMIN" && await checkPermission(user, PERMISSIONS.CFO_READ) && await checkPermission(user, PERMISSIONS.EXECUTIVE_READ)
    && await checkPermission(user, PERMISSIONS.CFO_WRITE);
  // Gövde yalnız yetkili istekte ve beyan edilen boyut sınır içindeyse okunur.
  const declared = Number(req.headers.get("content-length") ?? 0);
  const body = authorized && declared <= RUNNER_BODY_LIMIT ? await req.text().catch(() => "") : "";
  const guard = runnerRequestGuard({ authorized, origin: req.headers.get("origin"), url: req.url, vercelEnv: process.env.VERCEL_ENV, declaredLength: declared, body });
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status, headers });
  const result = await safeAiCfoRun(guard.action, { manual: true });
  return NextResponse.json(result, { status: result.status === "failed" ? 503 : 200, headers });
}
