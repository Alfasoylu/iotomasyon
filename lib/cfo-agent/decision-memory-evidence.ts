import { loadDecisionMemory } from "../cfo/decision-memory-data";
import { evidence } from "./evidence";
import type { ReadSource } from "./sources";
import type { Evidence } from "./types";

// AI CFO Blok B4j — Decision Memory (lib/cfo/decision-memory.ts). CFO kendi/Alperen'in geçmiş kararlarının sonucunu veriden görür:
// ters yöndeki ve geride kalan kararlar sayıyla gelir → "itaat eden değil sorgulayan CFO" bu kanıta dayanarak itiraz eder.

export function decisionMemoryEvidence(dm: Awaited<ReturnType<typeof loadDecisionMemory>>, at: string): Evidence[] {
  const src = "cfo_hamle";
  const counts = Object.entries(dm.byStatus).map(([k, n]) => `${k}:${n}`).join(" ");
  const out = [evidence(src, "karar_hafizasi.durum_sayilari", counts || "kayıt yok", "text", at, true),
    evidence(src, "karar_hafizasi.kalibrasyon (ölçülen/ölçülemeyen kapanmış karar, ort. hata)",
      `${dm.calibration.measured}/${dm.calibration.unmeasurableClosed} · ${dm.calibration.meanError == null ? "hata ölçülemedi" : `%${Math.round(dm.calibration.meanError * 100)}`}`, "text", at, true)];
  for (const e of dm.evals.filter(x => x.status === "WRONG_DIRECTION" || x.status === "WORSENING" || x.status === "BEHIND").slice(0, 3))
    out.push(evidence(src, `karar_hafizasi.${e.kod}.${e.status} (${e.baslik.slice(0, 60)})`, e.note, "text", at, true));
  return out;
}

export async function loadDecisionMemoryEvidence(db: ReadSource, at: string): Promise<Evidence[]> {
  const [v] = await db.query<{ t: string | null }>(`select to_regclass('public.cfo_hamle')::text as t`);
  if (!v?.t) return [];
  return decisionMemoryEvidence(await loadDecisionMemory(<T,>(sql: string) => db.query(sql) as Promise<T[]>, new Date(at)), at);
}
