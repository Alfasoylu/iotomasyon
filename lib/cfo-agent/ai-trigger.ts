import "server-only";
import { runCfoEngine, type RunnerOutcome } from "./runner";
import type { EngineTrigger } from "./store";

// Deterministik CFO motoru tetiği (2026-10-08: sitede LLM yok). Saatlik GitHub Actions işi (/api/cron/ai-cfo-monitor), günlük
// XML/Trendyol senkronlarından sonraki CFO döngüsü (hedefler taze) ve /admin/ai-cfo elle çalıştırma aynı motoru çağırır.
// AI_CFO_MONITOR_ENABLED kapalıyken motor ilk satırda `disabled` döner — DB'ye yazmaz, kilit açmaz.
export async function safeCfoEngineRun(trigger: EngineTrigger): Promise<RunnerOutcome> {
  try { return await runCfoEngine(trigger); }
  catch { return { status: "failed", error: "runner_unavailable" }; }
}
