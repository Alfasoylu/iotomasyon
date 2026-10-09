import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { checkHealthAndNotify } from "@/lib/cfo-agent/health-notify";

// CFO sağlık kontrolü (CRON_SECRET; motor işinin ikinci adımı, günde 3 koşu). 503 → GitHub Actions işi kırmızı → depo sahibine e-posta.
// Yalnız motor arızası, YENİ alarm (önceki motor koşusunda olmayan) ya da sabah koşusundaki günlük hatırlatmada 503; süregelen
// alarm gövdede listelenir ama her koşuda e-posta üretmez. Veritabanına yazmaz. Aynı koşulda alarm WhatsApp'la da gider (D-P07;
// lib/cfo-agent/alarm-whatsapp.ts): şablon CFO_ALARM_WHATSAPP_TEMPLATE, alıcı CFO_ALARM_WHATSAPP_TO; sonuç yanıtta `whatsapp`.
// Aynı değerlendirme Vercel cron zincirinde de çalışır (lib/cfo-agent/health-notify.ts) — GitHub zamanlamasına bağlı değil.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const denied = authorizeCron(req); if (denied) return denied;
  // Karşılaştırma: en son tamamlanmış motor koşusundan BİR önceki koşunun alarmları (son koşu az önce aynı alarmı yazmış olabilir).
  const { alarms, notify, whatsapp } = await checkHealthAndNotify({ skipLatest: true });
  return NextResponse.json({ ok: !notify, notify, alarms, whatsapp }, { status: notify ? 503 : 200, headers: { "Cache-Control": "private, no-store" } });
}
