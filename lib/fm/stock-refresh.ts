import "server-only";

import { prisma } from "@/lib/prisma";

export type StockRefreshOutcome =
  | { refreshed: true; runId: string; reconciliation: Record<string, number> }
  | { refreshed: false; reason: string };

/**
 * XML senkronu bittikten sonra Financial Memory stok hafızasını yeniler (DB tarafı karar verir: yalnız SUCCESS senkronunda çalışır,
 * idempotent, mutabakat aynı kayıtta). Senkron akışını ASLA bozmaz: her hata yakalanır ve "yenilenmedi" olarak döner.
 */
export async function refreshFinancialMemoryStock(syncLogId: string): Promise<StockRefreshOutcome> {
  try {
    const rows = await prisma.$queryRaw<{ result: Record<string, unknown> }[]>`SELECT public.fm_stock_refresh_after_sync(${syncLogId}::text) AS result`;
    const result = rows[0]?.result ?? {};
    if (result.refreshed === true) {
      const reconciliation = (result.reconciliation ?? {}) as Record<string, number>;
      if (Number(reconciliation.UNEXPLAINED ?? 0) > 0) {
        console.warn(`[fm-stock-refresh] ${reconciliation.UNEXPLAINED} ürün zincir+düzeltme ile Product.stockQuantity arasında açıklanamayan farka sahip.`);
      }
      return { refreshed: true, runId: String(result.run_id), reconciliation };
    }
    return { refreshed: false, reason: String(result.reason ?? "unknown") };
  } catch (error) {
    console.warn("[fm-stock-refresh] yenileme çağrısı başarısız (XML senkronu etkilenmedi):", error instanceof Error ? error.message : error);
    return { refreshed: false, reason: "refresh_call_failed" };
  }
}
