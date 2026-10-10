import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { runEngineWithHealth } from "@/lib/cfo-agent/workflow-trigger";

// RF-006 / CFO-009 (2026-10-10): deterministik CFO motorunun KENDİ Vercel cron'u (vercel.json, günde iki: 03:xx ve 13:xx UTC). Senkron
// sonrası zincirde motor süre bütçesine sığmıyordu (10.10 02:33 senkron 174 sn, 09.10 12:20 190 sn → "motor atlandı"); GitHub zamanlaması
// saatlerce gecikiyor. Burada motorun tüm 300 sn'si var; sağlık + WhatsApp alarmı motordan önce ve sonra. Aynı saat dilimindeki ikinci
// "scheduled" koşu (GitHub) runner'ın dilim anahtarıyla tekrarlanmaz. Motor bayrağı kapalıysa `disabled` döner, hiçbir şey yazmaz.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(req: NextRequest) {
  const denied = authorizeCron(req); if (denied) return denied;
  const result = await runEngineWithHealth("scheduled");
  return NextResponse.json(result, { status: result.status === "failed" ? 503 : 200, headers: { "Cache-Control": "private, no-store" } });
}
