import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { forecastV2Enabled } from "./v2";
import type { ForecastV2Map } from "./selection";
import { loadForecastV2 } from "./v2-loader";

// Consumer bridge for Forecast V2. Every MIGRATE_V2 call site (docs/FORECAST-V2.md → "Tüketici denetimi") does exactly:
//   const v2 = await forecastV2ForConsumers();              // null while FORECAST_V2_ENABLED is not "true"
//   const units = v2 ? v2DecisionDemand(v2, id) : <legacy expression, unchanged>;
// so with the flag off the legacy expression is the only code path (byte-for-byte the previous behaviour) and with the flag on only
// these call sites change. Manual potentials and the stock-adjusted demand estimate never enter the returned units.
export * from "./selection";

/** Loads V2 once per server request (React cache) when the flag is on; null when off. A load failure surfaces as an error (no silent fallback). */
export const forecastV2ForConsumers = cache(async (): Promise<ForecastV2Map | null> => {
  if (!forecastV2Enabled()) return null;
  return loadForecastV2(prisma);
});

