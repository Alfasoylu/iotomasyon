import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { loadCfoAlarms, shouldNotify, type CfoAlarm } from "@/lib/cfo-agent/health";
import { istanbulPeriod } from "@/lib/cfo-agent/period";

// CFO sağlık kontrolü (CRON_SECRET; motor işinin ikinci adımı, günde 3 koşu). 503 → GitHub Actions işi kırmızı → depo sahibine e-posta.
// Yalnız motor arızası, YENİ alarm (önceki motor koşusunda olmayan) ya da sabah koşusundaki günlük hatırlatmada 503; süregelen
// alarm gövdede listelenir ama her koşuda e-posta üretmez. Salt-okunur: hiçbir şey yazmaz.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const denied = authorizeCron(req); if (denied) return denied;
  const now = new Date();
  const alarms = await loadCfoAlarms(now);
  // Karşılaştırma: en son tamamlanmış motor koşusundan BİR önceki koşunun alarmları (son koşu az önce aynı alarmı yazmış olabilir).
  const runs = await prisma.cfoRun.findMany({ where: { idempotencyKey: { startsWith: "engine:" }, status: "completed" }, orderBy: { generatedAt: "desc" }, take: 2, select: { triggerReasons: true } });
  const prev = runs[1] ? ((runs[1].triggerReasons as { alarms?: CfoAlarm[] } | null)?.alarms ?? []).map(a => a.key) : null;
  const notify = shouldNotify(alarms, prev, Math.floor(istanbulPeriod(now).minutes / 60));
  return NextResponse.json({ ok: !notify, notify, alarms }, { status: notify ? 503 : 200, headers: { "Cache-Control": "private, no-store" } });
}
