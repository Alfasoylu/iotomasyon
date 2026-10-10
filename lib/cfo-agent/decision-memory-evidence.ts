import { loadGoalAttribution } from "../cfo/goal-attribution-data";
import { loadDecisionMemory } from "../cfo/decision-memory-data";
import { evidence } from "./evidence";
import type { ReadSource } from "./sources";
import type { Evidence } from "./types";

// AI CFO Blok B4j — Decision Memory (lib/cfo/decision-memory.ts). CFO kendi/Alperen'in geçmiş kararlarının sonucunu veriden görür:
// ters yöndeki ve geride kalan kararlar sayıyla gelir → "itaat eden değil sorgulayan CFO" bu kanıta dayanarak itiraz eder.

const p = (v: number | null, none: string) => (v == null ? none : `%${Math.round(v * 100)}`);

export function decisionMemoryEvidence(dm: Awaited<ReturnType<typeof loadDecisionMemory>>, at: string): Evidence[] {
  const src = "cfo_hamle";
  const counts = Object.entries(dm.byStatus).map(([k, n]) => `${k}:${n}`).join(" ");
  const out = [evidence(src, "karar_hafizasi.durum_sayilari", counts || "kayıt yok", "text", at, true),
    evidence(src, "karar_hafizasi.kalibrasyon (ölçülen / ölçülemeyen kapanmış karar, ort. hata, hedefe ulaşma, eğilim +iyimser, beklenen SAYI kapsamı)",
      `${dm.calibration.measured}/${dm.calibration.unmeasurableClosed} · ${p(dm.calibration.meanError, "hata ölçülemedi")} · isabet ${p(dm.calibration.hitRate, "?")} · eğilim ${p(dm.calibration.bias, "?")} · kapsam ${p(dm.calibration.coverage, "?")}`, "text", at, true)];
  for (const e of dm.evals.filter(x => x.status === "MISSING_EXPECTATION").slice(0, 3))
    out.push(evidence(src, `karar_hafizasi.${e.kod}.MISSING_EXPECTATION (${e.baslik.slice(0, 60)})`, e.note, "text", at, true));
  for (const e of dm.evals.filter(x => x.status === "WRONG_DIRECTION" || x.status === "WORSENING" || x.status === "BEHIND").slice(0, 3))
    out.push(evidence(src, `karar_hafizasi.${e.kod}.${e.status} (${e.baslik.slice(0, 60)})`, e.note, "text", at, true));
  return out;
}

export async function loadDecisionMemoryEvidence(db: ReadSource, at: string): Promise<Evidence[]> {
  const [v] = await db.query<{ t: string | null }>(`select to_regclass('public.cfo_hamle')::text as t`);
  if (!v?.t) return [];
  return decisionMemoryEvidence(await loadDecisionMemory(<T,>(sql: string) => db.query(sql) as Promise<T[]>, new Date(at)), at);
}

// AI CFO Blok B4k — hedef açığı atfı (lib/cfo/goal-attribution.ts): bildirilen net sermaye değişimi ↔ operasyonel değişim.
// Model "servet arttı" diye stok değerlemesini ilerleme sanmasın; hedefin gerektirdiği hızla operasyonel hız karşılaştırılır.

export async function loadGoalAttributionEvidence(db: ReadSource, at: string): Promise<Evidence[]> {
  const [v] = await db.query<{ t: string | null }>(`select to_regclass('public.fm_balance_day')::text as t`);
  if (!v?.t) return [];
  const ga = await loadGoalAttribution(<T,>(sql: string) => db.query(sql) as Promise<T[]>);
  if (!ga.available) return [];
  const r0 = Math.round;
  return ga.windows.flatMap(w => [
    evidence("fm_balance_day", `hedef_atfi.${w.window}g.bildirilen_vs_operasyonel_try (${w.attribution.from}→${w.attribution.to})`,
      `bildirilen ${r0(w.attribution.netChange)} · operasyonel ${r0(w.attribution.operational)} · stok değerleme ${r0(w.attribution.inventoryValuation)}${w.attribution.identityOk ? "" : ` · açıklanamayan ${r0(w.attribution.unexplained)} (bileşen tanımı net sermayeyle aynı değil)`}`, "text", at, false),
    evidence("fm_balance_day", `hedef_atfi.${w.window}g.operasyonel_try_gun (hedef ${w.pace.requiredPerDay == null ? "?" : r0(w.pace.requiredPerDay)} TL/gün → ${w.pace.verdict})`,
      r0(w.pace.operationalPerDay), "TRY/day", at, false),
  ]);
}
