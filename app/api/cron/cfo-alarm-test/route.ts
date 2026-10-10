import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { alarmSendDeps } from "@/lib/cfo-agent/health-notify";
import { sendTestAlarmWhatsapp } from "@/lib/cfo-agent/alarm-whatsapp";

// CFO alarm kanalı deneme gönderimi (Alperen 2026-10-10: "deneme alarmı oluştur"). CRON_SECRET; yalnız elle tetiklenir
// (.github/workflows/cfo-alarm-test.yml, workflow_dispatch) — zamanlanmış değil. Gerçek alarmla AYNI şablon + alıcı yolu; metinde
// "DENEME — gerçek alarm değil" yazar. Alarm üretmez, veritabanına yazmaz; numara yanıtta maskeli. Başarısızsa 502 → iş kırmızı.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const denied = authorizeCron(req); if (denied) return denied;
  const whatsapp = await sendTestAlarmWhatsapp(alarmSendDeps());
  const ok = whatsapp.status === "gonderildi";
  return NextResponse.json({ ok, whatsapp }, { status: ok ? 200 : 502, headers: { "Cache-Control": "private, no-store" } });
}
