import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { safeCfoEngineRun } from "@/lib/cfo-agent/ai-trigger";

// Saatlik deterministik CFO motoru (CRON_SECRET; GitHub Actions ai-cfo-schedule.yml). LLM yok. Bayrak kapalıyken `disabled`
// döner ve hiçbir şey yazmaz. Adres eski adıyla kalır (repo secret'ları ve iş tanımı değişmesin).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300; // snapshot ~75–110 sn + bağlam METRIK satırları
export async function GET(req: NextRequest) {
  const denied = authorizeCron(req); if (denied) return denied;
  const result = await safeCfoEngineRun("hourly");
  return NextResponse.json(result, { status: result.status === "failed" ? 503 : 200, headers: { "Cache-Control": "private, no-store" } });
}
