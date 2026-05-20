/**
 * services/sales-rep-kpi-service.ts — Sales rep'in günlük performans KPI'ları
 *
 * Müşteri liste sayfası üstünde sticky strip olarak gösterilir.
 * "Bugün 12/30 görüşme · ₺8,400 quoted · 2 kazanılan · 3 gecikmiş"
 */
import "server-only";
import { prisma } from "@/lib/prisma";

export interface SalesRepKPIs {
  databaseAvailable: boolean;
  todayCallsLogged: number;     // Bugün CALL tipinde Note sayısı
  dailyCallTarget: number;       // Hedef (sabit 30, ileri PR ile config)
  todayQuotesAmountTry: number;  // Bugün gönderilen tekliflerin tutarı
  thisWeekDealsWon: number;     // Bu hafta kazanılan teklif sayısı
  overdueTaskCount: number;     // Vadesi geçmiş açık görev
}

export async function getSalesRepKPIs(userId: string): Promise<SalesRepKPIs> {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());  // Pazartesi'den itibaren
    weekStart.setHours(0, 0, 0, 0);

    const [callsToday, quotesToday, dealsThisWeek, overdueTasks] = await Promise.all([
      // Bu kullanıcının bugün eklediği CALL tipindeki notlar
      prisma.note.count({
        where: {
          createdById: userId,
          type: "CALL",
          createdAt: { gte: todayStart },
        },
      }),
      // Bu kullanıcının bugün gönderdiği teklifler
      prisma.quote.aggregate({
        where: {
          createdById: userId,
          sentAt: { gte: todayStart },
        },
        _sum: { total: true },
      }),
      // Bu hafta kazanılan teklif sayısı (status=WON, updatedAt this week)
      prisma.quote.count({
        where: {
          createdById: userId,
          status: "WON",
          updatedAt: { gte: weekStart },
        },
      }),
      // Vadesi geçmiş açık görev
      prisma.followUpTask.count({
        where: {
          OR: [
            { assignedToId: userId },
            { createdById: userId, assignedToId: null },
          ],
          status: { not: "DONE" },
          dueDate: { lt: now },
        },
      }),
    ]);

    return {
      databaseAvailable: true,
      todayCallsLogged: callsToday,
      dailyCallTarget: 30,
      todayQuotesAmountTry: Number(quotesToday._sum.total ?? 0),
      thisWeekDealsWon: dealsThisWeek,
      overdueTaskCount: overdueTasks,
    };
  } catch {
    return {
      databaseAvailable: false,
      todayCallsLogged: 0,
      dailyCallTarget: 30,
      todayQuotesAmountTry: 0,
      thisWeekDealsWon: 0,
      overdueTaskCount: 0,
    };
  }
}
