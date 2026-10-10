import "server-only";
import { prisma } from "@/lib/prisma";
import { MEASURE_SOURCE, measureDecisions, type MeasureRunResult } from "./decision-memory-data";

// CFO-012 cron adımı (xml-sync after(), CFO-029 maliyet türetmesinden sonra): kontrol noktası gelen kararlar cfo_hamle_olcum'a ölçülür.
// İşlem içi advisory kilit: elle tetiklenen ikinci koşu ilkini bekler, sonra NOT EXISTS koruması aynı ölçümü tekrar yazmaz.
// Hata akışı durdurmaz; günlüğe bir araştırma satırı düşer (sır içermez).
export async function safeMeasureDecisions(): Promise<MeasureRunResult | null> {
  try {
    return await prisma.$transaction(async tx => {
      await tx.$queryRawUnsafe(`select pg_advisory_xact_lock(hashtext('cfo-012-hamle-olcum'))::text as locked`);
      return measureDecisions({ query: <T,>(sql: string, ...p: unknown[]) => tx.$queryRawUnsafe<T[]>(sql, ...p) });
    }, { timeout: 30_000 });
  } catch (e) {
    await prisma.cfoChangeLog.create({ data: { area: "strateji", item: "CFO-012 karar ölçümü hatası", source: MEASURE_SOURCE, kind: "arastirma",
      note: String(e instanceof Error ? e.message : e).slice(0, 300) } }).catch(() => undefined);
    return null;
  }
}
