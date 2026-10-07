import { freeCapital } from "../capital/score";
import { evidence } from "./evidence";
import type { ReadSource } from "./sources";
import type { Evidence } from "./types";

// Sermaye ayarı (2026-10-07 sermaye sayfaları birleşmesi): /admin/sermaye'deki "Toplam sermaye / rezerv" ayarı CFO'nun
// hiç görmediği bir paneldi. Toplam sermaye ELLE girilen bir hedef/çerçevedir (ölçüm değil) → tahmini:true; stokta bağlı
// tutar cfo_stok_deger'den (ölçüm). Serbest/kullanılabilir aynı saf kuralla (lib/capital/score.ts freeCapital). Salt-okunur.

export type CapitalConfigRow = { totalTry: number; reservePct: number; updatedAt: string | null };

export function capitalConfigEvidence(cfg: CapitalConfigRow | null, lockedTry: number | null, at: string): Evidence[] {
  const out: Evidence[] = [];
  if (lockedTry != null) out.push(evidence("cfo_stok_deger", "sermaye.stokta_bagli_try (stok × birim maliyet, yer tutucu stok hariç)", Math.round(lockedTry), "TRY", at, true));
  if (!cfg) return out;
  const asOf = cfg.updatedAt ?? at;
  out.push(evidence("CapitalConfig", "sermaye.ayar_toplam_try (elle girilen çerçeve, ölçüm değil)", Math.round(cfg.totalTry), "TRY", asOf, false));
  out.push(evidence("CapitalConfig", "sermaye.rezerv_orani_pct (serbest sermayenin yüzdesi)", cfg.reservePct, "pct", asOf, false));
  if (lockedTry != null) {
    const f = freeCapital(cfg.totalTry, lockedTry, cfg.reservePct);
    out.push(evidence("CapitalConfig", "sermaye.kullanilabilir_try (ayar − stokta bağlı − rezerv)", Math.round(f.deployable), "TRY", at, false));
  }
  return out;
}

export async function loadCapitalConfig(db: ReadSource, at: string): Promise<Evidence[]> {
  const present = new Set((await db.query<{ name: string }>(`select table_name as name from information_schema.tables where table_schema='public'
    and table_name = any($1::text[])`, ["CapitalConfig"])).map(r => r.name));
  const views = new Set((await db.query<{ name: string }>(`select viewname as name from pg_views where schemaname='public' and viewname='cfo_stok_deger'`)).map(r => r.name));
  let locked: number | null = null;
  if (views.has("cfo_stok_deger")) {
    const [r] = await db.query(`select coalesce(sum(maliyet_degeri) filter (where gercek_stok),0)::float8 as v from cfo_stok_deger`);
    locked = r ? Number(r.v) : null;
  }
  let cfg: CapitalConfigRow | null = null;
  if (present.has("CapitalConfig")) {
    const [c] = await db.query(`select "totalCapitalTry"::float8 as t, "reservePct"::float8 as r, "updatedAt" as u from "CapitalConfig" order by "updatedAt" desc limit 1`);
    if (c) cfg = { totalTry: Number(c.t), reservePct: Number(c.r), updatedAt: c.u ? new Date(String(c.u)).toISOString() : null };
  }
  return capitalConfigEvidence(cfg, locked, at);
}
