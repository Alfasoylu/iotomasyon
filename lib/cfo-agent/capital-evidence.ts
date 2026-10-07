import { loadCapitalEfficiency } from "../cfo/capital-efficiency-data";
import type { Allocation, SkuResult } from "../cfo/capital-efficiency";
import { evidence } from "./evidence";
import type { ReadSource } from "./sources";
import type { Evidence } from "./types";

// AI CFO Blok B4h — sermaye verimliliği (deterministik motor lib/cfo/capital-efficiency.ts'in özeti). Model hesap yapmaz:
// eşik getiri, eşik altı değer kaybı, açığa çıkarılabilir nakit, en çok kayıp yaratan SKU'lar ve tahsis planının ilk adımları
// burada sayı olarak gelir. Getiriler 90 günlük satıştan TAHMİNİ; borç faizi ve likidite açığı ölçüm.

const r0 = (v: number) => Math.round(v);
const pct = (v: number) => Math.round(v * 1000) / 10;

export function capitalEfficiencyEvidence(a: Allocation & { skus: SkuResult[]; liquidityGapTry: number }, at: string): Evidence[] {
  const src = "cfo_stok_deger";
  const out: Evidence[] = [];
  if (a.hurdleMonthly == null) return [evidence("cfo_loan", "sermaye_verimliligi.esik_getiri", "bilinmiyor — kredi faizi girilmemiş", "state", at, false)];
  out.push(evidence("cfo_loan", `sermaye_verimliligi.esik_getiri_aylik_pct (en pahalı ticari kredi: ${a.hurdleSource})`, pct(a.hurdleMonthly), "pct/month", at, true));
  out.push(evidence(src, "sermaye_verimliligi.esik_alti_deger_kaybi_try_ay (eşik × sermaye − katkı)", r0(a.dragMonthlyTry), "TRY/month", at, false));
  out.push(evidence(src, "sermaye_verimliligi.aciga_cikabilir_nakit_try (fazla+ölü stok, break-even indirimle)", r0(a.releasableCashTry), "TRY", at, false));
  for (const c of ["SCALE", "TRIM", "FIX_PRICE", "LIQUIDATE"] as const)
    out.push(evidence(src, `sermaye_verimliligi.sinif.${c} (sku/sermaye/katkı_ay)`, `${a.portfolio[c].n} SKU · ${r0(a.portfolio[c].capitalTry)} TL · ${r0(a.portfolio[c].contributionMonthlyTry)} TL/ay`, "text", at, false));
  for (const s of [...a.skus].filter(x => x.dragMonthlyTry > 0).sort((x, y) => y.dragMonthlyTry - x.dragMonthlyTry).slice(0, 3))
    out.push(evidence(src, `sermaye_verimliligi.sku.${s.sku}.kayip_try_ay (${s.cls}: ${s.reason})`, r0(s.dragMonthlyTry), "TRY/month", at, false));
  a.plan.slice(0, 3).forEach((p, i) => out.push(evidence(src, `sermaye_verimliligi.plan.${i + 1} (${p.use.kind}: ${p.use.label})`,
    `${r0(p.amountTry)} TL · getiri ${p.use.returnMonthly == null ? "zorunlu" : `%${pct(p.use.returnMonthly)}/ay`} · güven ${p.use.confidence}`, "text", at, false)));
  return out;
}

export async function loadCapitalEvidence(db: ReadSource, at: string): Promise<Evidence[]> {
  const [v] = await db.query<{ t: string | null }>(`select to_regclass('public.cfo_stok_deger')::text as t`);
  if (!v?.t) return [];
  const a = await loadCapitalEfficiency(<T,>(sql: string) => db.query(sql) as Promise<T[]>);
  return capitalEfficiencyEvidence(a, at);
}
