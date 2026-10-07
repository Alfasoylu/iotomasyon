import { loadVoi } from "../cfo/voi-data";
import type { VoiItem } from "../cfo/voi";
import { evidence } from "./evidence";
import type { ReadSource } from "./sources";
import type { Evidence } from "./types";

// AI CFO Blok B4i — bilgi değeri (lib/cfo/voi.ts). Model "önce neyi öğrenmeliyim?" sorusunu deterministik sıralamadan okur:
// ilk 3 ASK_FIRST, ilk 2 RESEARCH_FIRST, bastırılan/şimdi-karar sayıları. Değerler YAKLAŞIK (dayanak sorgu metninde).

const line = (i: VoiItem) => `${i.unknown} → ${i.decision}; ${i.basis}`;

export function voiEvidence(v: Awaited<ReturnType<typeof loadVoi>>, at: string): Evidence[] {
  const src = "cfo_question";
  const out = [
    evidence(src, "bilgi_degeri.cozulmeye_deger_toplam_try (ASK+RESEARCH, yaklaşık)", v.totalVoiTry, "TRY", at, false),
    evidence(src, "bilgi_degeri.dagilim (sor/araştır/şimdi karar/bastırılan/ölçülemeyen)", `${v.ask.length}/${v.research.length}/${v.decideNow.length}/${v.suppressedAsk.length}/${v.unmeasured.length} · açık soru ${v.openQuestions}`, "text", at, true),
  ];
  v.ask.slice(0, 3).forEach((i, n) => out.push(evidence(src, `bilgi_degeri.sor.${n + 1} (${line(i)})`, i.voiTry, "TRY", at, false)));
  v.research.slice(0, 2).forEach((i, n) => out.push(evidence(src, `bilgi_degeri.arastir.${n + 1} (${line(i)})`, i.voiTry, "TRY", at, false)));
  return out;
}

export async function loadVoiEvidence(db: ReadSource, at: string): Promise<Evidence[]> {
  const [v] = await db.query<{ t: string | null }>(`select to_regclass('public.cfo_stok_deger')::text as t`);
  if (!v?.t) return [];
  return voiEvidence(await loadVoi(<T,>(sql: string) => db.query(sql) as Promise<T[]>, new Date(at)), at);
}
