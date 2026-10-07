import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { safeAiCfoRun } from "@/lib/cfo-agent/ai-trigger";

// AI CFO sabah özeti (CRON_SECRET; 09:30 İstanbul öncesi `too_early`). Bayraklar kapalıyken `disabled` döner ve hiçbir şey yazmaz.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300; // snapshot ~75–110 sn + model çağrısı; 120 sn sınırı yetmiyordu (07.10)
export async function GET(req: NextRequest) {
  const denied = authorizeCron(req); if (denied) return denied;
  const result = await safeAiCfoRun("morning");
  return NextResponse.json(result, { status: result.status === "failed" ? 503 : 200, headers: { "Cache-Control": "private, no-store" } });
}
