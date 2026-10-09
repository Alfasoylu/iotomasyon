import { prisma } from "@/lib/prisma";

// Net pozisyon tabanının TEK kaynağı (RF-019 / CFO-020): cfo_settings."netPositionFloorTry" — Goal Engine (net_position_floor_try),
// iş planı ve /cfo/ayarlar bunu okur. Alarm (floor_breach) ve motor bulguları da aynı değeri kullanır; AI_CFO_CASH_FLOOR_TRY yalnız
// ayar satırı ya da değer yoksa yedek (env varsayılanı −3.000.000).
export function pickCashFloor(settingsFloor: unknown, envFloor: number): { floorTry: number; source: "cfo_settings" | "env" } {
  const v = settingsFloor == null || settingsFloor === "" ? null : Number(settingsFloor);
  return v != null && Number.isFinite(v) ? { floorTry: v, source: "cfo_settings" } : { floorTry: envFloor, source: "env" };
}

export async function readCashFloor(envFloor: number) {
  const s = await prisma.cfoSettings.findFirst({ orderBy: { updatedAt: "desc" }, select: { netPositionFloorTry: true } }).catch(() => null);
  return pickCashFloor(s?.netPositionFloorTry ?? null, envFloor);
}
