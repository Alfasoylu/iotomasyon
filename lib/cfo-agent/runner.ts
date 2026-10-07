import "server-only";
import { prisma } from "@/lib/prisma";
import type { GoalRow } from "@/lib/fm/goals";
import { getCfoConfig, type CfoConfig } from "./config";
import { buildCfoAgentSnapshot } from "./snapshot";
import { detectCfoAnomalies, shouldReopen, silencedRules } from "./anomalies";
import { loadCfoContext, loadScheduledExtras, type CfoContext } from "./context";
import { evidence, hashSnapshot } from "./evidence";
import { goalAnomalies } from "./goal-anomalies";
import { existingQueueRecords, retrieveRelevantMemory } from "./memory";
import { createCfoProvider, ProviderError, reasoningPayload, systemText, type CfoReasoningProvider } from "./provider";
import { createMonitorLock, LockError, type MonitorLock } from "./lock";
import { cfoStore, type CfoStore, type UsageWrite } from "./store";
import { budgetBlock, costTry, istanbulPeriod, modeLimits, reservedCost, type RunMode } from "./budget";
import { validateAiOutput } from "./validate-ai-output";
import { decisionInputHash, decisionTypeOf, materialChange, materialKey, type MaterialReason } from "./materiality";
import { buildDecisionPacket, cardsFor, estimateTokens, PACKET_VERSIONS, SCHEDULED_MAX_ANOMALIES, type DecisionPacket } from "./decision-packet";
import { RULE_CARDS } from "./rule-cards";
import { CALCULATION_VERSION, type Anomaly, type CfoAgentSnapshot, type Evidence, type MemoryItem, type RunType } from "./types";

// AI CFO runner. DETERMINISTIC FINANCIAL ENGINE → CHANGE/MATERIALITY GATE → SMALL DECISION PACKET → LLM → EXECUTIVE JUDGMENT.
// İki mod (2026-10-07 maliyet/görev ayrımı):
//  • SCHEDULED_CFO (cron + elle monitor): açık iş → soğuma → yalnız veri kalitesi → önemli değişiklik → aynı girdi hash'i →
//    bayraklar → küçük karar paketi (≤3 anomali, ≤2 rule card, sert 8.000 / 700 token) → koşu/gün/ay TL kapıları → çağrı.
//    Monitor koşusu ≠ AI çağrısı: çoğu koşu deterministik kayıtla biter (status = kaçınma nedeni).
//  • MANUAL_DEEP_REVIEW (yalnız elle): el kitabının tamamı + Blok B/C, ayrı bütçe. Planlı iş bu moda HİÇBİR yoldan geçemez.
// Model yalnız gönderilen anomaliler arasında karar verir; çıktısı validateAiOutput ile denetlenir; finansal etki kodla hesaplanır.
export type RunnerDependencies = {
  now?: Date; config?: CfoConfig; lock?: MonitorLock; store?: CfoStore; provider?: CfoReasoningProvider | null;
  snapshot?: () => Promise<CfoAgentSnapshot>; goals?: () => Promise<GoalRow[]>;
  queues?: (anomalies: Anomaly[]) => Promise<Map<string, string[]>>; memory?: (anomalies: Anomaly[]) => Promise<MemoryItem[]>;
  /** Girdi Blok B/C + Blok A tablo eki (context.ts); null = bağlamsız (testler). */
  context?: ((snapshot: CfoAgentSnapshot, config: CfoConfig) => Promise<CfoContext>) | null;
  /** Manual run from /admin/ai-cfo: idempotency per 20-minute slot (3 per hour) instead of the scheduled hour/day. */
  manual?: boolean;
  /** Varsayılan scheduled. deep_review yalnız runCfoDeepReview (elle) ile seçilir. */
  mode?: RunMode;
  /** Planlı paket eki (nakit kararında boştaki merdiven basamakları); null = ek yok (testler). */
  extras?: ((decisionType: string, at: string) => Promise<Evidence[]>) | null;
};

/** Idempotency period of a run. Scheduled: monitor per Istanbul hour, morning per day (a re-delivered cron never runs twice).
 *  Manual: 20-minute slot of the hour (`<hour>:m0|m1|m2`) → at most 3 manual runs per hour; cost stays bounded by the
 *  daily call limit, the monthly budget and the per-anomaly cooldown. */
export function runPeriodKey(type: RunType, period: { date: string; hour: string; minutes: number }, manual = false, mode: RunMode = "scheduled"): string {
  if (mode === "deep_review") return `${period.hour}:d${Math.floor((period.minutes % 60) / 20)}`;
  if (manual) return `${period.hour}:m${Math.floor((period.minutes % 60) / 20)}`;
  return type === "morning" ? period.date : period.hour;
}
export type RunnerOutcome = { status: string; runId?: string | null; insights?: number; error?: string };

export async function runCfoMonitor(deps: RunnerDependencies = {}) { return run("monitor", deps); }
export async function runCfoMorningBrief(deps: RunnerDependencies = {}) { return run("morning", { ...deps, mode: "scheduled" }); }
/** MANUAL_DEEP_REVIEW: yalnız kullanıcı açıkça isterse (/admin/ai-cfo). Önemli değişiklik kapısı uygulanmaz; ayrı bütçe. */
export async function runCfoDeepReview(deps: RunnerDependencies = {}) { return run("monitor", { ...deps, mode: "deep_review", manual: true }); }


// Goal Engine'in son gözlemi (salt-okunur; değerlendirme CFO iş akışı döngüsünde yapılır).
async function readGoals(): Promise<GoalRow[]> {
  try {
    return await prisma.$queryRaw<GoalRow[]>`SELECT goal_key, goal_version, kind, title, target_value, target_currency, deadline, as_of,
      period_start, period_end, state, observed_value_try, observed_on, target_value_try, fx_usd_try, fx_month, progress_pct, gap_try,
      current_rate_try_per_day, required_rate_try_per_day, projected_value_try, projected_on, grade, flags FROM public.fm_memory_goal`;
  } catch { return []; }
}

async function run(type: RunType, deps: RunnerDependencies): Promise<RunnerOutcome> {
  const now = deps.now ?? new Date(), config = deps.config ?? getCfoConfig(), period = istanbulPeriod(now), mode: RunMode = deps.mode ?? "scheduled";
  if (!config.monitorEnabled) return { status: "disabled" };
  if (type === "morning" && period.minutes < 9 * 60 + 30) return { status: "too_early" };
  const lock = deps.lock ?? createMonitorLock(), store = deps.store ?? cfoStore;
  let id: string | null = null, usageId: string | null = null, usage: UsageWrite | undefined;
  try {
    if (!await lock.acquire()) return { status: "locked" };
    id = await store.begin(type, runPeriodKey(type, period, deps.manual, mode), now);
    if (!id) return { status: "duplicate" };
    const snapshot = await (deps.snapshot ?? (() => buildCfoAgentSnapshot({ now, config })))();
    const goals = goalAnomalies(await (deps.goals ?? readGoals)(), now);
    snapshot.evidence.push(...goals.evidence);
    const anomalies = [...detectCfoAnomalies(snapshot, config), ...goals.anomalies];
    const queues = await (deps.queues ?? existingQueueRecords)(anomalies);
    const sent: Anomaly[] = [];
    const gates = { openTask: 0, cooldown: 0, dataQuality: 0, notMaterial: 0 };
    for (const a of anomalies) {
      const ids = queues.get(a.id) ?? a.existingRecordIds;
      a.existingRecordIds = ids;
      // Zaten açık bir iş kaydı varsa (soru, ölü stok, sıçrama) model tekrar çağrılmaz; kayıt kanıt olarak eklenir.
      if (ids.length) { const e = evidence("existing_queue", a.cooldownKey, ids.join(","), "record_ids", snapshot.generatedAt, true); snapshot.evidence.push(e); a.evidenceIds.push(e.id); if (a.actionable) gates.openTask++; continue; }
      if (!a.actionable) continue;
      const previous = await store.recent(a.cooldownKey, now, config.cooldownHours);
      if (previous && !shouldReopen(a, previous, now, config.cooldownHours)) { gates.cooldown++; continue; }
      sent.push(a);
    }
    if (type === "morning") {
      // Sabah özeti bilinen bağlamı yorumlar; bastırılmış anomaly'leri veya açık kuyrukları yeniden açmaz. Sayı uydurulmaz.
      const dq = evidence("snapshot", "morning_data_quality", snapshot.dataQuality.missingFields.length, "missing_fields", snapshot.generatedAt, true);
      const ms = [
        ["yesterday", snapshot.sales.yesterday.grossRevenue], ["last7Days", snapshot.sales.last7Days.grossRevenue],
        ["monthToDate", snapshot.sales.monthToDate.grossRevenue], ["contribution", snapshot.profitability.contributionProfit],
        ["margin", snapshot.profitability.contributionMargin], ["stockout", snapshot.inventory.stockoutRiskValue],
        ["deadStock", snapshot.inventory.deadStockValue], ["cash", snapshot.cash.cash],
      ] as const;
      const proof = [dq, ...ms.map(([key, m]) => evidence("snapshot", `morning.${key}`, m.value, key === "margin" ? "pct" : "TRY", snapshot.generatedAt, !m.estimated))];
      snapshot.evidence.push(...proof);
      sent.push({ id: "morning_context", rule: "MORNING_REVIEW", severity: "info", category: "data_quality", entityType: "company", entityId: "company", period: period.date,
        fingerprint: `morning:${period.date}`, cooldownKey: "morning", evidenceIds: proof.map(e => e.id), actionable: true, impact: null, weight: 0, existingRecordIds: [] });
    }
    // Veri kalitesi bulguları deterministik yoldadır (sabit metin + veri isteği): AI'ye gitmez.
    const candidates = sent.filter(a => a.category !== "data_quality" || a.rule === "MORNING_REVIEW");
    gates.dataQuality = sent.length - candidates.length;
    // Önemli değişiklik kapısı (yalnız planlı mod): yeni / önemi arttı / TL etkisi bir kova ve materialMinTry kadar arttı.
    const evaluations = mode === "scheduled" ? await store.evaluations(new Date(now.getTime() - config.materialLookbackDays * 86400000)) : null;
    const reasons = new Map<string, MaterialReason>();
    const material = candidates.filter(a => {
      if (!evaluations) { reasons.set(a.id, "new"); return true; }
      const r = materialChange(a, evaluations.byKey.get(materialKey(a)), config.materialMinTry);
      if (r) reasons.set(a.id, r); else gates.notMaterial++;
      return !!r;
    });
    const selected = material.slice(0, mode === "scheduled" ? SCHEDULED_MAX_ANOMALIES : 8);
    const decisionType = decisionTypeOf(selected[0]);
    const cards = mode === "scheduled" ? cardsFor(selected).slice(0, 2) : [];
    const hash = decisionInputHash({ mode, decisionType, anomalies: selected, cards, versions: { ...PACKET_VERSIONS, calc: CALCULATION_VERSION } });
    await store.snapshot(id, snapshot, hashSnapshot(snapshot), anomalies, selected, { mode, manual: !!deps.manual, decisionInputHash: hash,
      materiality: Object.fromEntries(reasons), gates });
    const saving = costTry(config, { inputTokens: 3000, outputTokens: 450, cacheReadTokens: 0, cacheWriteTokens: 0 });
    const skip = async (status: string, error?: string) => { await store.finish(id!, status, new Date(), 1, saving, error); return { status, runId: id, ...(error ? { error } : {}) }; };
    const gateNote = `acik_is:${gates.openTask} soguma:${gates.cooldown} veri_kalitesi:${gates.dataQuality} onemsiz:${gates.notMaterial}`;
    // Kabul testi 2: hiçbir şey gönderilmediğinde hangi kuralların veri yüzünden KÖR olduğu söylenir.
    if (!sent.length) {
      const blind = silencedRules(snapshot, config);
      const status = gates.openTask && !gates.cooldown ? "open_task" : gates.cooldown && !gates.openTask ? "cooldown" : "no_actionable_anomaly";
      const note = [gates.openTask || gates.cooldown ? gateNote : "", blind.length ? `susan_kurallar: ${blind.join(" | ")}` : ""].filter(Boolean).join(" · ");
      return await skip(status, note ? note.slice(0, 900) : undefined);
    }
    if (!candidates.length) return await skip("data_quality_only", gateNote);
    if (!selected.length) return await skip("no_material_change", gateNote);
    if (evaluations?.hashes.has(hash)) return await skip("same_input", `decision_input_hash:${hash.slice(0, 12)}`);
    if (!config.enabled) return await skip("ai_disabled");
    if (!config.releaseApproved) return await skip("release_gates_pending");
    const provider = deps.provider === undefined ? createCfoProvider(config) : deps.provider;
    if (!provider) return await skip("provider_unavailable");
    const limits = modeLimits(config, mode);
    const memory = await (deps.memory ?? retrieveRelevantMemory)(selected);
    let input: { snapshot: CfoAgentSnapshot; anomalies: Anomaly[]; memory: MemoryItem[]; context?: CfoContext; packet?: DecisionPacket };
    let contextIds: Set<string>, estimated: number, cardText = "";
    if (mode === "scheduled") {
      // Küçük karar paketi: yalnız seçilen anomalilerin kanıtı + kartları + ≤2 önceki karar. Büyükse KÜÇÜLÜR, sınır yükselmez.
      const extras = deps.extras === null ? [] : await (deps.extras ?? loadScheduledExtras)(decisionType, snapshot.generatedAt);
      for (const e of extras) if (!snapshot.evidence.some(x => x.id === e.id)) snapshot.evidence.push(e);
      const built = buildDecisionPacket({ decisionType, anomalies: selected.map(a => ({ anomaly: a, reason: reasons.get(a.id) ?? "new" })), evidence: snapshot.evidence, memory, extras }, limits.maxInputTokens);
      if (!built.fits) return await skip("blocked_by_input_tokens", `estimated_tokens:${built.estimatedTokens} limit:${limits.maxInputTokens} shrink:${built.shrinkLevel}`);
      input = { snapshot, anomalies: built.anomalies, memory, packet: built.packet };
      contextIds = new Set(extras.map(e => e.id));
      estimated = built.estimatedTokens;
      cardText = built.cards.map(c => RULE_CARDS[c]).join("\n");
    } else {
      const context = deps.context === null ? undefined : await (deps.context ?? loadCfoContext)(snapshot, config);
      // Bağlam kanıtları snapshot kanıtına eklenir: içgörü onlara atıf yapabilir, kayıtta kanıt olarak saklanır.
      contextIds = new Set([...(context?.state ?? []), ...(context?.memory ?? [])].map(e => e.id));
      for (const e of [...(context?.state ?? []), ...(context?.memory ?? [])]) if (!snapshot.evidence.some(x => x.id === e.id)) snapshot.evidence.push(e);
      input = { snapshot, anomalies: selected, memory, context };
      const bytes = Buffer.byteLength(JSON.stringify(reasoningPayload(input)), "utf8");
      if (bytes > limits.maxInputTokens * 3) return await skip("blocked_by_input_size", `payload_bytes:${bytes} limit_bytes:${limits.maxInputTokens * 3}`);
      estimated = estimateTokens(systemText(input) + JSON.stringify(reasoningPayload(input)));
    }
    // Koşu / gün / ay TL kapıları: en kötü durum (tahmini girdi + çıktı tavanı) üzerinden, çağrıdan ÖNCE.
    const reserve = reservedCost(config, Math.min(estimated, limits.maxInputTokens), mode), block = budgetBlock(config, await store.totals(now), reserve, mode, !!deps.manual);
    const trigger = `${mode === "deep_review" ? "deep:" : ""}${input.anomalies.map(a => a.rule).join(",")}`;
    usage = { provider: config.provider, model: config.model, status: "reserved", triggerReason: trigger, reservedCostTry: reserve,
      priceContext: { inputPriceUsdPerMillion: config.inputPriceUsdPerMillion ?? null, outputPriceUsdPerMillion: config.outputPriceUsdPerMillion ?? null,
        usdTryRate: config.usdTryRate ?? null, cacheReadMultiplier: 0.1, cacheWriteMultiplier: 1.25, mode, estimatedInputTokens: estimated } };
    if (block) { await store.usage(id, { ...usage, status: block, estimatedCost: 0, reservedCostTry: null }); return await skip(block); }
    // Uzak token sayımı yalnız gerektiğinde: planlı modda yerel tutucu tahmin sınırın %80'inin altındaysa atlanır.
    if (mode === "deep_review" || estimated > limits.maxInputTokens * 0.8) {
      const tokens = await provider.countInput(input);
      if (tokens + 512 > limits.maxInputTokens) return await skip("blocked_by_input_tokens", `input_tokens:${tokens} reserve:512 limit:${limits.maxInputTokens}`);
    }
    usageId = await store.usage(id, usage); // en kötü durum rezervasyonu zaman aşımı/süreç ölümünde de kalır
    const result = await provider.generate(input);
    const cost = costTry(config, result);
    await store.updateUsage(usageId, { ...usage, status: "completed", inputTokens: result.inputTokens, outputTokens: result.outputTokens,
      cacheReadTokens: result.cacheReadTokens, cacheWriteTokens: result.cacheWriteTokens, estimatedCost: cost, reservedCostTry: null, providerRequestId: result.requestId });
    usageId = null;
    const validated = validateAiOutput(result.text, snapshot, input.anomalies, contextIds, mode === "scheduled" ? { scheduled: true, cardText } : undefined);
    await store.insights(id, validated.insights, input.anomalies, snapshot.evidence);
    // Partial success is still completed: accepted insights are saved and the rejected count/reasons go in error.
    const status = validated.rejected && !validated.insights.length ? "invalid_output" : "completed";
    // The provider returns empty text on stop_reason=max_tokens; tag it so a truncated answer is not mistaken for a rejected insight.
    const truncated = result.text === "" && result.outputTokens >= limits.maxOutputTokens;
    const rejectReasons = Object.entries(validated.reasons).map(([k, n]) => `${k}=${n}`).join(",");
    const error = truncated ? "output_truncated" : validated.rejected ? `rejected_insights:${validated.rejected} (${rejectReasons})` : undefined;
    await store.finish(id, status, new Date(), 0, null, error);
    return { status, runId: id, insights: validated.insights.length, ...(error ? { error } : {}) };
  } catch (error) {
    // SDK hata gövdesi, bağlantı adresi, kimlik bilgisi veya kaynak satırı asla kaydedilmez.
    // Provider and monitor-lock failures carry fixed diagnostic tags; anything else stays generic.
    const code = error instanceof ProviderError || error instanceof LockError ? error.code : "monitor_failed";
    try {
      if (usageId && usage) await store.updateUsage(usageId, { ...usage, status: "failed" });
      if (id) await store.finish(id, "failed", new Date(), 0, null, code);
    } catch { /* kayıt hatası asıl sonucu değiştirmez */ }
    return { status: "failed", runId: id, error: code };
  } finally { await lock.release(); }
}
