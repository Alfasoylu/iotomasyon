import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { DEFAULT_RMB_USD_RATE, DEFAULT_USD_TRY_RATE } from "@/lib/importer-cost";
import { pickCurrentFx, type CurrentFx, type FxRows } from "./pick";

// Güncel kur — TEK kaynak (2026-10-07 panel taraması). Daha önce 15 dosya elle girilen aylık kuru (MonthlyExchangeRate)
// okuyordu; son kayıt 2026/06 = 46 TL'de kalmıştı, CFO ise 48,98 kullanıyordu. Kural (saf seçim: ./pick.ts):
//   USD/TRY → cfo_kur (CFO'nun aylık kur defteri, el kitabının kanonik kaynağı) → cfo_settings → MonthlyExchangeRate → varsayılan
//   RMB/USD → MonthlyExchangeRate (RMB'nin elle girildiği tek yer) → cfo_settings → varsayılan
// İstek başına bir kez okunur (React cache). Salt-okunur.

export type { CurrentFx } from "./pick";

/** Önbelleksiz okuma — istek dışı işler (ör. xml-sync after() adımı, CFO-029 maliyet türetme) için. */
export async function loadCurrentFx(): Promise<CurrentFx> {
  const [kur, settings, manual] = await Promise.all([
    prisma.$queryRaw<Array<{ ay: Date; usd_try: unknown }>>`select ay, usd_try from cfo_kur where usd_try > 0 order by ay desc limit 1`.catch(() => []),
    prisma.cfoSettings.findFirst({ select: { usdTryRate: true, usdRmbRate: true } }).catch(() => null),
    prisma.monthlyExchangeRate.findMany({ orderBy: [{ year: "desc" }, { month: "desc" }], take: 12, select: { year: true, month: true, usdTryRate: true, rmbUsdRate: true } }).catch(() => []),
  ]);
  const rows: FxRows = {
    kur: kur[0] ? { month: new Date(kur[0].ay).toISOString().slice(0, 7), usdTry: Number(kur[0].usd_try) } : null,
    settings: settings ? { usdTry: Number(settings.usdTryRate), rmbPerUsd: Number(settings.usdRmbRate) } : null,
    manual: manual.map(r => ({ month: `${r.year}-${String(r.month).padStart(2, "0")}`, usdTry: Number(r.usdTryRate), rmbPerUsd: r.rmbUsdRate == null ? null : Number(r.rmbUsdRate) })),
  };
  return pickCurrentFx(rows, { usdTry: DEFAULT_USD_TRY_RATE, rmbPerUsd: DEFAULT_RMB_USD_RATE });
}

export const getCurrentFx = cache(loadCurrentFx);
