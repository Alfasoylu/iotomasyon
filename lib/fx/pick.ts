// Güncel kur seçimi — saf (test: __tests__/fx-current.test.ts). Kaynak sırası lib/fx/current.ts başında.

export type CurrentFx = {
  usdTry: number; rmbPerUsd: number;
  /** "cfo_kur 2026-10" · "cfo_settings" · "elle 2026-06" · "varsayılan" */
  usdTrySource: string; rmbSource: string;
  /** USD/TRY'nin ait olduğu ay (YYYY-MM); bilinmiyorsa null */
  usdTryMonth: string | null;
};
export type FxRows = {
  kur: { month: string; usdTry: number } | null;
  settings: { usdTry: number; rmbPerUsd: number } | null;
  /** en yeni önce */
  manual: { month: string; usdTry: number; rmbPerUsd: number | null }[];
};

const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v) && v > 0;

export function pickCurrentFx(rows: FxRows, defaults: { usdTry: number; rmbPerUsd: number }): CurrentFx {
  let usdTry = defaults.usdTry, usdTrySource = "varsayılan", usdTryMonth: string | null = null;
  const manualUsd = rows.manual.find(r => ok(r.usdTry));
  if (rows.kur && ok(rows.kur.usdTry)) { usdTry = rows.kur.usdTry; usdTrySource = `cfo_kur ${rows.kur.month}`; usdTryMonth = rows.kur.month; }
  else if (rows.settings && ok(rows.settings.usdTry)) { usdTry = rows.settings.usdTry; usdTrySource = "cfo_settings"; }
  else if (manualUsd) { usdTry = manualUsd.usdTry; usdTrySource = `elle ${manualUsd.month}`; usdTryMonth = manualUsd.month; }

  let rmbPerUsd = defaults.rmbPerUsd, rmbSource = "varsayılan";
  const manualRmb = rows.manual.find(r => ok(r.rmbPerUsd));
  if (manualRmb) { rmbPerUsd = manualRmb.rmbPerUsd!; rmbSource = `elle ${manualRmb.month}`; }
  else if (rows.settings && ok(rows.settings.rmbPerUsd)) { rmbPerUsd = rows.settings.rmbPerUsd; rmbSource = "cfo_settings"; }

  return { usdTry, rmbPerUsd, usdTrySource, rmbSource, usdTryMonth };
}
