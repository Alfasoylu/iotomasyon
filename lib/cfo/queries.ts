import "server-only";
import { prisma } from "@/lib/prisma";
import { computeCfo, type CfoInput, type CfoOverview } from "@/lib/cfo/engine";

/**
 * Tek noktadan CFO verisi yükleme. Tüm /cfo sayfaları bunu çağırır;
 * böylece hesap mantığı tek yerde kalır ve sayfalar arası tutarsızlık olmaz.
 */
export async function loadCfoData(): Promise<{ raw: CfoInput; overview: CfoOverview }> {
  const [settings, banks, cards, loans, expenses, receivables, cashEvents, imports] = await Promise.all([
    prisma.cfoSettings.findFirst(),
    prisma.cfoBankAccount.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.cfoCreditCard.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { bank: "asc" }] }),
    prisma.cfoLoan.findMany({ orderBy: [{ status: "asc" }, { sortOrder: "asc" }] }),
    prisma.cfoFixedExpense.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.cfoReceivable.findMany({ orderBy: { dueDate: "asc" } }),
    prisma.cfoCashEvent.findMany({ orderBy: { eventDate: "asc" } }),
    prisma.cfoImportProject.findMany({ orderBy: { etaDate: "asc" } }),
  ]);

  const raw: CfoInput = { settings, banks, cards, loans, expenses, receivables, cashEvents, imports };
  return { raw, overview: computeCfo(raw) };
}

/** Son N snapshot — servet trendi için. */
export async function loadSnapshots(take = 30) {
  return prisma.cfoSnapshot.findMany({ orderBy: { takenAt: "desc" }, take });
}

/** Son değişiklikler — "neyi ne zaman güncelledik" izi. */
export async function loadChangeLog(take = 40) {
  return prisma.cfoChangeLog.findMany({ orderBy: { changedAt: "desc" }, take });
}
