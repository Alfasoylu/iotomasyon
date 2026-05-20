/**
 * services/team-performance-service.ts — Yönetici ekip performans dashboard servisi
 *
 * Phase 96a: Yönetici bu hafta her sales rep'in görüşme/teklif/kazanılan/açık görev
 * sayılarını tek sayfada görür. Sıralanabilir leaderboard formatı.
 */
import "server-only";
import { prisma } from "@/lib/prisma";

export interface SalesRepPerformance {
  userId: string;
  name: string;
  email: string;
  isActive: boolean;
  // Bu hafta
  callsLoggedThisWeek: number;
  quotesSentThisWeek: number;
  quotesSentAmountThisWeek: number;
  dealsWonThisWeek: number;
  dealsWonAmountThisWeek: number;
  // Genel durum
  activePortfolioCount: number;
  overdueTaskCount: number;
  // Türetilmiş metrik
  winRatePct: number;  // dealsWon / quotesSent
}

export interface TeamPerformanceSummary {
  weekStart: Date;
  weekEnd: Date;
  reps: SalesRepPerformance[];
  totals: {
    calls: number;
    quotes: number;
    quotesAmount: number;
    deals: number;
    dealsAmount: number;
  };
}

export async function getTeamPerformance(): Promise<TeamPerformanceSummary> {
  const now = new Date();
  const dow = now.getDay() || 7;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - (dow - 1));
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true, isActive: true },
    orderBy: { name: "asc" },
  });

  const userIds = users.map((u) => u.id);

  const [calls, quotesGrouped, dealsGrouped, portfolios, overdueTasks] = await Promise.all([
    prisma.note.groupBy({
      by: ["createdById"],
      where: {
        createdById: { in: userIds },
        type: "CALL",
        createdAt: { gte: weekStart, lt: weekEnd },
      },
      _count: { _all: true },
    }),
    prisma.quote.groupBy({
      by: ["createdById"],
      where: {
        createdById: { in: userIds },
        sentAt: { gte: weekStart, lt: weekEnd },
      },
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.quote.groupBy({
      by: ["createdById"],
      where: {
        createdById: { in: userIds },
        status: "WON",
        updatedAt: { gte: weekStart, lt: weekEnd },
      },
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.customer.groupBy({
      by: ["ownedById"],
      where: {
        ownedById: { in: userIds },
        isActive: true,
      },
      _count: { _all: true },
    }),
    prisma.followUpTask.groupBy({
      by: ["assignedToId"],
      where: {
        assignedToId: { in: userIds },
        status: { not: "DONE" },
        dueDate: { lt: now },
      },
      _count: { _all: true },
    }),
  ]);

  const callMap = new Map(calls.map((c) => [c.createdById, c._count._all]));
  const quoteMap = new Map(
    quotesGrouped.map((q) => [
      q.createdById,
      { count: q._count._all, sum: Number(q._sum.total ?? 0) },
    ]),
  );
  const dealMap = new Map(
    dealsGrouped.map((d) => [
      d.createdById,
      { count: d._count._all, sum: Number(d._sum.total ?? 0) },
    ]),
  );
  const portfolioMap = new Map(
    portfolios.flatMap((p) =>
      p.ownedById ? [[p.ownedById, p._count._all] as const] : [],
    ),
  );
  const overdueMap = new Map(
    overdueTasks.flatMap((t) =>
      t.assignedToId ? [[t.assignedToId, t._count._all] as const] : [],
    ),
  );

  const reps: SalesRepPerformance[] = users.map((u) => {
    const q = quoteMap.get(u.id) ?? { count: 0, sum: 0 };
    const d = dealMap.get(u.id) ?? { count: 0, sum: 0 };
    const winRatePct = q.count > 0 ? Math.round((d.count / q.count) * 100) : 0;
    return {
      userId: u.id,
      name: u.name ?? u.email,
      email: u.email,
      isActive: u.isActive,
      callsLoggedThisWeek: callMap.get(u.id) ?? 0,
      quotesSentThisWeek: q.count,
      quotesSentAmountThisWeek: q.sum,
      dealsWonThisWeek: d.count,
      dealsWonAmountThisWeek: d.sum,
      activePortfolioCount: portfolioMap.get(u.id) ?? 0,
      overdueTaskCount: overdueMap.get(u.id) ?? 0,
      winRatePct,
    };
  });

  const totals = reps.reduce(
    (acc, r) => ({
      calls: acc.calls + r.callsLoggedThisWeek,
      quotes: acc.quotes + r.quotesSentThisWeek,
      quotesAmount: acc.quotesAmount + r.quotesSentAmountThisWeek,
      deals: acc.deals + r.dealsWonThisWeek,
      dealsAmount: acc.dealsAmount + r.dealsWonAmountThisWeek,
    }),
    { calls: 0, quotes: 0, quotesAmount: 0, deals: 0, dealsAmount: 0 },
  );

  return { weekStart, weekEnd, reps, totals };
}
