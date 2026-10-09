// Güncel kur seçimi — saf (test: __tests__/fx-current.test.ts). Kaynak sırası lib/fx/current.ts başında.

export type CurrentFx = {
  /** RMB/USD TEK kaynak (2026-10-10, Alperen: "RMB/USD tek kaynağa bağlanmalı; bilinmeyende hard-coded fallback kullanılmamalı"):
   *  elle girilen aylık kur (MonthlyExchangeRate, /admin/exchange-rates) — RMB'si dolu en yeni ay. Yoksa null ("bilinmiyor");
   *  cfo_settings.usdRmbRate (düzenleme yeri yok, 6,72 kalıntısı) ve kod sabitleri (7,2 / 7,0) artık kullanılmaz. */
  usdTry: number; rmbPerUsd: number | null;
  /** USD/TRY: "cfo_kur 2026-10" · "cfo_settings" · "elle 2026-06" · "varsayılan"; RMB/USD: "elle 2026-10" · "bilinmiyor" */
  usdTrySource: string; rmbSource: string;
  /** USD/TRY'nin ait olduğu ay (YYYY-MM); bilinmiyorsa null */
  usdTryMonth: string | null;
};
export type FxRows = {
  kur: { month: string; usdTry: number } | null;
  settings: { usdTry: number } | null;
  /** en yeni önce */
  manual: { month: string; usdTry: number; rmbPerUsd: number | null }[];
};

const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v) && v > 0;

export function pickCurrentFx(rows: FxRows, defaults: { usdTry: number }): CurrentFx {
  let usdTry = defaults.usdTry, usdTrySource = "varsayılan", usdTryMonth: string | null = null;
  const manualUsd = rows.manual.find(r => ok(r.usdTry));
  if (rows.kur && ok(rows.kur.usdTry)) { usdTry = rows.kur.usdTry; usdTrySource = `cfo_kur ${rows.kur.month}`; usdTryMonth = rows.kur.month; }
  else if (rows.settings && ok(rows.settings.usdTry)) { usdTry = rows.settings.usdTry; usdTrySource = "cfo_settings"; }
  else if (manualUsd) { usdTry = manualUsd.usdTry; usdTrySource = `elle ${manualUsd.month}`; usdTryMonth = manualUsd.month; }

  const manualRmb = rows.manual.find(r => ok(r.rmbPerUsd));
  const rmbPerUsd = manualRmb ? manualRmb.rmbPerUsd! : null, rmbSource = manualRmb ? `elle ${manualRmb.month}` : "bilinmiyor";

  return { usdTry, rmbPerUsd, usdTrySource, rmbSource, usdTryMonth };
}
