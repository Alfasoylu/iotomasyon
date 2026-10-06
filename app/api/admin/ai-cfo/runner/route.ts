import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { safeAiCfoRun } from "@/lib/cfo-agent/ai-trigger";

// /admin/ai-cfo elle çalıştırma (ADMIN + CFO_READ + EXECUTIVE_READ + CFO_WRITE, aynı origin, yalnız production).
// Runner kendi kapılarını uygular: bayraklar kapalıyken `disabled`, AI kapalıyken model çağrılmaz.
export const dynamic = "force-dynamic"; export const runtime = "nodejs"; export const maxDuration = 120;
const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" };
const input = z.object({ action: z.enum(["monitor", "morning"]) }).strict();
export async function POST(req: Request) {
  const user = await getCurrentSession();
  if (!user || user.role !== "ADMIN" || !await checkPermission(user, PERMISSIONS.CFO_READ) || !await checkPermission(user, PERMISSIONS.EXECUTIVE_READ)
    || !await checkPermission(user, PERMISSIONS.CFO_WRITE)) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  if (req.headers.get("origin") !== new URL(req.url).origin) return NextResponse.json({ error: "origin_invalid" }, { status: 403, headers });
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") return NextResponse.json({ error: "production_only" }, { status: 403, headers });
  if (Number(req.headers.get("content-length") ?? 0) > 1024) return NextResponse.json({ error: "body_too_large" }, { status: 413, headers });
  let data; try { data = input.parse(await req.json()); } catch { return NextResponse.json({ error: "invalid_request" }, { status: 400, headers }); }
  const result = await safeAiCfoRun(data.action);
  return NextResponse.json(result, { status: result.status === "failed" ? 503 : 200, headers });
}
