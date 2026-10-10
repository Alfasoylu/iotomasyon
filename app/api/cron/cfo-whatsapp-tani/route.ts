import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { diagnoseWhatsapp } from "@/lib/whatsapp/diagnose";

// WhatsApp teşhisi (CRON_SECRET; yalnız elle — cfo-alarm-test.yml tur=tani). Meta'ya salt-okuma: numaranın WABA'sı, anahtarın
// gördüğü WABA'lar, cfo_alarm / yeni_siparis şablonlarının dil + durumu. Anahtar dönmez; kimlik/numara maskeli. Gönderim yok.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function GET(req: NextRequest) {
  const denied = authorizeCron(req); if (denied) return denied;
  return NextResponse.json(await diagnoseWhatsapp(), { headers: { "Cache-Control": "private, no-store" } });
}
