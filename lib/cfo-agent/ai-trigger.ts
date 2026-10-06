import "server-only";
import { runCfoMonitor, runCfoMorningBrief, type RunnerOutcome } from "./runner";

// Zamanlama (adım 5). Vercel Hobby'de yeni cron slotu yok: monitor, mevcut günlük XML/Trendyol cron'larının
// CFO döngüsünden SONRA (hedefler taze) aynı after() işinde çalışır. Bayraklar kapalıyken runner ilk satırda
// `disabled` döner — DB'ye yazmaz, kilit/sağlayıcı açmaz. Sabah özeti 09:30 İstanbul kuralı yüzünden mevcut
// cron saatlerinde (05:00 / 09:00) otomatik tetiklenmez: /api/cron/ai-cfo-morning (harici zamanlayıcı) veya
// /admin/ai-cfo'daki elle çalıştırma ile.
// manual: /admin/ai-cfo elle çalıştırma — idempotency saat yerine 20 dakikalık dilim (saatte 3), bkz. runPeriodKey.
export async function safeAiCfoRun(type: "monitor" | "morning", opts: { manual?: boolean } = {}): Promise<RunnerOutcome> {
  try { return type === "morning" ? await runCfoMorningBrief({ manual: opts.manual }) : await runCfoMonitor({ manual: opts.manual }); }
  catch { return { status: "failed", error: "runner_unavailable" }; }
}
