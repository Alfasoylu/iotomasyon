import { prisma } from "@/lib/prisma";
import { getCfoConfig } from "./config";

// AI CFO sağlık alarmı (2026-10-07): monitörün kendisi izlenmezse sessizlik "her şey yolunda" ile "monitör ölü"
// arasında ayırt edilemez. Saatlik GitHub Actions işi /api/cron/ai-cfo-health'i çağırır; alarm varsa 503 → iş kırmızı →
// GitHub depo sahibine e-posta gönderir. Aynı alarmlar /admin/ai-cfo'da gösterilir. Yalnız okur, hiçbir şey yazmaz.

export type CfoAlarm = { code: "consecutive_failures" | "budget_blocked" | "input_limit_blocked" | "no_insight_24h" | "entegra_upload_due" | "bank_update_due"; message: string };
/** Haftalık elle yüklenen veriler (2026-10-07 kararı): son Entegra yüklemesi ve 7 günden eski banka hesapları. */
export type ManualData = { entegraLastImport: Date | null; staleBankAccounts: string[] };
const WEEK_MS = 7 * 24 * 3600000;
export type HealthRun = { status: string; generatedAt: Date; error: string | null; insights: number; sentActionable: number };

/** Koşu sonucu "başarısız": hata ya da hiç içgörü geçmeyen model çıktısı. */
const FAILED = new Set(["failed", "invalid_output"]);
/** Atlanan ama "başarısız" sayılmayan koşular: tek bir koşu bile monitörün kör olduğunu gösterir → ANINDA alarm
 *  (07.10: token sınırı 8.000'de kaldı, koşular saatlerce atlandı, alarm çalmadı; bütçe ayın 20'sinde biterse 24 saat beklenmez). */
const BUDGET = new Set(["blocked_by_budget", "blocked_by_daily_limit", "billing_unconfigured"]);
const INPUT_LIMIT = new Set(["blocked_by_input_tokens", "blocked_by_input_size"]);
/** Model çağrısına hiç ulaşmayan, sağlık açısından nötr durumlar. */
const NEUTRAL = new Set(["running"]);

export function evaluateCfoAlarms(runs: HealthRun[], lastInsightAt: Date | null, aiActive: boolean, now: Date, manual?: ManualData): CfoAlarm[] {
  const alarms: CfoAlarm[] = [];
  const recent = runs.filter(r => !NEUTRAL.has(r.status)).sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime());
  const [last, prev] = recent;
  if (last && prev && FAILED.has(last.status) && FAILED.has(prev.status)) {
    alarms.push({ code: "consecutive_failures", message: `Son iki koşu başarısız: ${[last, prev].map(r => `${r.status}${r.error ? ` (${r.error})` : ""}`).join(" · ")}` });
  }
  if (last && BUDGET.has(last.status)) {
    alarms.push({ code: "budget_blocked", message: `Son koşu bütçe/limit yüzünden atlandı (${last.status}); AI CFO model çağırmıyor. AI_CFO_MONTHLY_BUDGET_TRY / AI_CFO_MAX_CALLS_PER_DAY kontrol edin.` });
  }
  if (last && INPUT_LIMIT.has(last.status)) {
    alarms.push({ code: "input_limit_blocked", message: `Son koşu girdi sınırında atlandı (${last.status}); AI CFO model çağırmıyor. AI_CFO_MAX_INPUT_TOKENS_PER_RUN ayarını kontrol edin (önerilen 20000).` });
  }
  const dayAgo = now.getTime() - 24 * 3600000;
  const triedToday = recent.some(r => r.generatedAt.getTime() >= dayAgo && r.sentActionable > 0);
  if (aiActive && triedToday && (!lastInsightAt || lastInsightAt.getTime() < dayAgo)) {
    alarms.push({ code: "no_insight_24h", message: `24 saattir içgörü yok; son içgörü: ${lastInsightAt ? lastInsightAt.toISOString() : "hiç"}` });
  }
  // Sistem günlük değil HAFTALIK veri ister: 7 gün dolunca hatırlatır (eşik 8 gün, 1 gün tolerans — snapshot.ts).
  if (manual && (!manual.entegraLastImport || now.getTime() - manual.entegraLastImport.getTime() > WEEK_MS)) {
    alarms.push({ code: "entegra_upload_due", message: `Haftalık Entegra satış dökümü bekleniyor; son yükleme: ${manual.entegraLastImport ? manual.entegraLastImport.toISOString().slice(0, 10) : "hiç"}` });
  }
  if (manual?.staleBankAccounts.length) {
    alarms.push({ code: "bank_update_due", message: `Haftalık banka bakiyesi güncellemesi bekleniyor (7 günden eski): ${manual.staleBankAccounts.join(", ")}` });
  }
  return alarms;
}

export async function loadCfoAlarms(now = new Date(), env: Record<string, string | undefined> = process.env): Promise<CfoAlarm[]> {
  const config = getCfoConfig(env);
  const since = new Date(now.getTime() - 48 * 3600000);
  const rows = await prisma.cfoRun.findMany({ where: { generatedAt: { gte: since } }, orderBy: { generatedAt: "desc" }, take: 50,
    select: { status: true, generatedAt: true, error: true, triggerReasons: true, _count: { select: { insights: true } } } });
  const last = await prisma.cfoInsight.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  const runs: HealthRun[] = rows.map(r => ({ status: r.status, generatedAt: r.generatedAt, error: r.error, insights: r._count.insights,
    sentActionable: ((r.triggerReasons as { sentAnomalies?: { actionable?: boolean }[] } | null)?.sentAnomalies ?? []).filter(a => a.actionable).length }));
  const entegra = await prisma.entegraImportLog.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  const banks = await prisma.cfoBankAccount.findMany({ where: { isActive: true, lastUpdatedAt: { lt: new Date(now.getTime() - WEEK_MS) } },
    orderBy: { sortOrder: "asc" }, select: { name: true } });
  return evaluateCfoAlarms(runs, last?.createdAt ?? null, config.monitorEnabled && config.enabled && config.releaseApproved, now,
    { entegraLastImport: entegra?.createdAt ?? null, staleBankAccounts: banks.map(b => b.name) });
}
