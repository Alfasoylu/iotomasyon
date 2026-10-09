import "server-only";
import { prisma } from "@/lib/prisma";
import { ensureTcmbMonthlyFx, type FxSyncResult } from "./tcmb-fx-sync";

/** xml-sync after() adımı: TCMB aylık kurunu eksikse ekler (CFO-003). Hata akışı durdurmaz; sonuç döner, sır içermez. */
export async function safeEnsureTcmbFx(now = new Date()): Promise<FxSyncResult[] | null> {
  try {
    return await ensureTcmbMonthlyFx(
      { query: (sql, ...p) => prisma.$queryRawUnsafe(sql, ...p), execute: (sql, ...p) => prisma.$executeRawUnsafe(sql, ...p) },
      async url => { const r = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15000) }); return { status: r.status, text: () => r.text() }; },
      now);
  } catch { return null; }
}
