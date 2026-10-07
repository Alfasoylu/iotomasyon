import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { safeAiCfoRun } from "@/lib/cfo-agent/ai-trigger";

// AI CFO monitor (CRON_SECRET). Bayraklar kapalıyken `disabled` döner ve hiçbir şey yazmaz.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300; // snapshot ~75–110 sn + model çağrısı; 120 sn sınırı yetmiyordu (07.10)
export async function GET(req: NextRequest) {
  const denied = authorizeCron(req); if (denied) return denied;
  const result = await safeAiCfoRun("monitor");
  return NextResponse.json(result, { status: result.status === "failed" ? 503 : 200, headers: { "Cache-Control": "private, no-store" } });
}
