import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { loadCfoAlarms } from "@/lib/cfo-agent/health";

// AI CFO sağlık kontrolü (CRON_SECRET). Alarm varsa 503 → GitHub Actions işi kırmızı → depo sahibine e-posta.
// Salt-okunur: hiçbir şey yazmaz, model çağırmaz.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const denied = authorizeCron(req); if (denied) return denied;
  const alarms = await loadCfoAlarms();
  return NextResponse.json({ ok: alarms.length === 0, alarms }, { status: alarms.length ? 503 : 200, headers: { "Cache-Control": "private, no-store" } });
}
