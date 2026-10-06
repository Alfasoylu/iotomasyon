import "server-only";
import { runCfoMonitor, runCfoMorningBrief, type RunnerOutcome } from "./runner";

// Zamanlama (adım 5). Vercel Hobby'de yeni cron slotu yok: monitor, mevcut günlük XML/Trendyol cron'larının
// CFO döngüsünden SONRA (hedefler taze) aynı after() işinde çalışır. Bayraklar kapalıyken runner ilk satırda
// `disabled` döner — DB'ye yazmaz, kilit/sağlayıcı açmaz. Sabah özeti 09:30 İstanbul kuralı yüzünden mevcut
// cron saatlerinde (05:00 / 09:00) otomatik tetiklenmez: /api/cron/ai-cfo-morning (harici zamanlayıcı) veya
// /admin/ai-cfo'daki elle çalıştırma ile.
export async function safeAiCfoRun(type: "monitor" | "morning"): Promise<RunnerOutcome> {
  try { return type === "morning" ? await runCfoMorningBrief() : await runCfoMonitor(); }
  catch { return { status: "failed", error: "runner_unavailable" }; }
}
