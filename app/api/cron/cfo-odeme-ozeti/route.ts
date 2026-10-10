import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { sendPaymentDigest } from "@/lib/cfo-agent/payment-digest-send";

// Günlük ödeme özeti WhatsApp'ta (Alperen 2026-10-10): ödeme takviminden en yakın 5 ödenmemiş çıkış + vadesi geçmiş sayısı.
// CRON_SECRET; Vercel cron 05:xx UTC (08:xx TR). Aynı İstanbul gününde başarıyla gittiyse tekrar gitmez; ?force=1 (elle iş akışı)
// bu kilidi atlar. cfo_change_log'a iz (numara yazılmaz). Gönderim başarısızsa 502.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(req: NextRequest) {
  const denied = authorizeCron(req); if (denied) return denied;
  const r = await sendPaymentDigest({ force: req.nextUrl.searchParams.get("force") === "1" });
  const ok = r.status === "gonderildi" || r.status === "bugun_gonderildi";
  return NextResponse.json({ ok, ...r }, { status: ok ? 200 : 502, headers: { "Cache-Control": "private, no-store" } });
}
