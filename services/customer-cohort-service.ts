/**
 * services/customer-cohort-service.ts — "Bugün Senin İçin" cohort'ları
 *
 * Çağrı merkezi sales uzmanı için 4 hazır iş listesi:
 *   1. todayCall    — vadesi gelmiş FollowUpTask'lı müşteriler
 *   2. dormant      — son 60g+ contact yok, lifetime satışı olan ticari
 *   3. newOpportunities — son 7g eklenmiş, hiç aranmamış
 *   4. openQuotes   — QUOTED durumunda 7g+'dir bekleyen
 *
 * Her cohort hem sayım hem de müşteri ID listesi döner.
 * Liste sayfası ?cohort=todayCall|dormant|new|openQuotes URL param ile filtre uygular.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { isDatabaseUnavailableError } from "@/lib/database";

export type CohortKey = "queue" | "todayCall" | "dormant" | "new" | "openQuotes";

export interface CohortCounts {
  databaseAvailable: boolean;
  todayCall: number;
  dormant: number;
  newOpportunities: number;
  openQuotes: number;
  totalActive: number;
  weeklyContacted: number;
  openQuoteAmount: number;
  overdueTaskCount: number;
}

export async function getCustomerCohortCounts(
  currentUserId?: string,
): Promise<CohortCounts> {
  try {
    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    const since60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const since7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sinceWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      todayCallIds,
      dormantIds,
      newIds,
      openQuotesIds,
      totalActive,
      weeklyContacted,
      openQuoteAgg,
      overdueTaskCount,
    ] = await Promise.all([
      // 1) Bugün Ara — FollowUpTask.dueDate <= today, status != DONE
      prisma.followUpTask.findMany({
        where: {
          dueDate: { lte: todayEnd },
          status: { not: "DONE" },
          customerId: { not: undefined },
        },
        select: { customerId: true },
        distinct: ["customerId"],
      }),
      // 2) Uyuyan — lifetime satışı var ama son temas yok/60g+ önce VE son satış da 60g+ önce
      //    Yeni alınan müşterileri "uyuyan" sayma (recent purchase varsa hâlâ aktif)
      prisma.customer.findMany({
        where: {
          isActive: true,
          OR: [
            { lastContactedAt: null },
            { lastContactedAt: { lt: since60 } },
          ],
          marketplaceSalesRecords: {
            some: {},
            none: { orderDate: { gte: since60 } },
          },
        },
        select: { id: true },
      }),
      // 3) Yeni Fırsatlar — son 7g eklenmiş, hiç aranmamış, ENTEGRA IMPORT DEĞİL
      //    (Entegra import 542 müşteri "uyuyan" cohort'a düşer)
      prisma.customer.findMany({
        where: {
          isActive: true,
          createdAt: { gte: since7 },
          lastContactedAt: null,
          OR: [
            { source: null },
            { NOT: { source: { startsWith: "Entegra import" } } },
          ],
        },
        select: { id: true },
      }),
      // 4) Açık Teklifler — status = QUOTED VE teklif var, son 7g+ hareketsiz
      prisma.customer.findMany({
        where: {
          isActive: true,
          status: "QUOTED",
          quotes: { some: { status: "SENT", createdAt: { lt: since7 } } },
        },
        select: { id: true },
      }),
      // Total active
      prisma.customer.count({ where: { isActive: true } }),
      // Weekly contacted
      prisma.customer.count({
        where: { isActive: true, lastContactedAt: { gte: sinceWeek } },
      }),
      // Open quote total amount
      prisma.quote.aggregate({
        where: { status: { in: ["DRAFT", "SENT"] } },
        _sum: { total: true },
      }),
      // Overdue tasks
      prisma.followUpTask.count({
        where: {
          dueDate: { lt: now },
          status: { not: "DONE" },
        },
      }),
    ]);

    return {
      databaseAvailable: true,
      todayCall: todayCallIds.length,
      dormant: dormantIds.length,
      newOpportunities: newIds.length,
      openQuotes: openQuotesIds.length,
      totalActive,
      weeklyContacted,
      openQuoteAmount: Number(openQuoteAgg._sum.total ?? 0),
      overdueTaskCount,
    };
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return {
        databaseAvailable: false,
        todayCall: 0,
        dormant: 0,
        newOpportunities: 0,
        openQuotes: 0,
        totalActive: 0,
        weeklyContacted: 0,
        openQuoteAmount: 0,
        overdueTaskCount: 0,
      };
    }
    throw error;
  }
}

/**
 * Bir cohort için müşteri ID'lerini döner. Liste sayfasında bu ID listesi
 * üzerinden filtreleme yapılır.
 */
export async function getCustomerIdsForCohort(cohort: CohortKey): Promise<Set<string>> {
  const now = new Date();
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const since60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const since7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  if (cohort === "queue") {
    const ids = await getPowerQueueIds(30);
    return new Set(ids);
  }

  if (cohort === "todayCall") {
    const rows = await prisma.followUpTask.findMany({
      where: {
        dueDate: { lte: todayEnd },
        status: { not: "DONE" },
        customerId: { not: undefined },
      },
      select: { customerId: true },
    });
    return new Set(rows.map((r) => r.customerId).filter((id): id is string => !!id));
  }

  if (cohort === "dormant") {
    const rows = await prisma.customer.findMany({
      where: {
        isActive: true,
        OR: [
          { lastContactedAt: null },
          { lastContactedAt: { lt: since60 } },
        ],
        marketplaceSalesRecords: {
          some: {},
          none: { orderDate: { gte: since60 } },
        },
      },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  if (cohort === "new") {
    const rows = await prisma.customer.findMany({
      where: {
        isActive: true,
        createdAt: { gte: since7 },
        lastContactedAt: null,
        OR: [
          { source: null },
          { NOT: { source: { startsWith: "Entegra import" } } },
        ],
      },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  if (cohort === "openQuotes") {
    const rows = await prisma.customer.findMany({
      where: {
        isActive: true,
        status: "QUOTED",
        quotes: { some: { status: "SENT", createdAt: { lt: since7 } } },
      },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  return new Set();
}

/**
 * Power Queue sıralaması için smart priority score hesaplı, ilk N müşteri ID'si.
 * Sıralama: calcCallPriority(leadScore × 0.6 + infoCompleteness × 0.4) × rotationFactor
 *
 * Telefonu olmayan ve DND'li müşteriler skor 0 → liste sonuna düşer.
 * Aynı müşteri tekrar tekrar gösterilmesin diye shownInQueueCount ile soğutulur.
 */
export async function getPowerQueueIds(limit = 30): Promise<string[]> {
  const customers = await prisma.customer.findMany({
    where: { isActive: true, doNotCall: false, phone: { not: null } },
    select: {
      id: true,
      phone: true,
      whatsapp: true,
      email: true,
      taxNumber: true,
      company: true,
      city: true,
      address: true,
      customerNotes: true,
      status: true,
      lastContactedAt: true,
      doNotCall: true,
      shownInQueueCount: true,
    },
    take: 500, // initial scan, computed sort below
  });

  // Lazy load stats only if needed (skip empty phone customers)
  const ids = customers.map((c) => c.id);
  const statsMap = await getCustomerStats(ids);

  type WithScore = (typeof customers)[number] & { score: number };
  const scored: WithScore[] = customers.map((c) => {
    const stats = statsMap.get(c.id) ?? null;
    const days = c.lastContactedAt
      ? Math.floor((Date.now() - c.lastContactedAt.getTime()) / (24 * 60 * 60 * 1000))
      : null;
    // import here lazily to avoid cycle
    const leadScore = (() => {
      const interests = stats?.activeInterestsCount ?? 0;
      const orders = stats?.lifetimeOrders ?? 0;
      const quotes = stats?.openQuoteCount ?? 0;
      const won = c.status === "WON" ? 15 : 0;
      const i = Math.min(40, interests * 8);
      const o = Math.min(32, orders * 4);
      const r = days == null ? 0 : Math.max(0, Math.min(20, (60 - days) / 3));
      const q = Math.min(30, quotes * 10);
      return Math.max(0, Math.min(100, Math.round(i + o + r + q + won)));
    })();

    const info = (() => {
      let s = 0;
      if (c.phone) s += 25;
      if (c.whatsapp) s += 15;
      if (c.email) s += 10;
      if (c.taxNumber) s += 10;
      if (c.company) s += 10;
      if (stats?.hasInterests) s += 10;
      if (c.city) s += 5;
      if (c.address) s += 5;
      if (c.customerNotes) s += 10;
      return s;
    })();

    const base = leadScore * 0.6 + info * 0.4;
    const rotation = 1 / (1 + c.shownInQueueCount * 0.1);
    const score = base * rotation;

    return { ...c, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((c) => c.id);
}

/**
 * Liste sayfasında her müşteri için gösterilecek ek istatistikler:
 *   - activeInterestsCount   (ProductInterest aktif)
 *   - lifetimeOrders          (MarketplaceSalesRecord)
 *   - lifetimeRevenueTry     (toplam ciro)
 *   - openQuoteCount         (Quote SENT/DRAFT)
 *   - nextActionAt           (en yakın açık FollowUpTask)
 *   - nextActionTitle
 *   - hasInterests            (info completeness için)
 */
export interface CustomerStatsRow {
  customerId: string;
  activeInterestsCount: number;
  lifetimeOrders: number;
  lifetimeRevenueTry: number;
  openQuoteCount: number;
  nextActionAt: Date | null;
  nextActionTitle: string | null;
  hasInterests: boolean;
}

export async function getCustomerStats(
  customerIds: string[],
): Promise<Map<string, CustomerStatsRow>> {
  if (customerIds.length === 0) return new Map();

  const [interestsRows, salesRows, quoteRows, taskRows] = await Promise.all([
    prisma.productInterest.groupBy({
      by: ["customerId"],
      where: {
        customerId: { in: customerIds },
        status: { in: ["NEW", "WAITING_STOCK", "CONTACTED", "QUOTED"] },
      },
      _count: { id: true },
    }),
    prisma.$queryRaw<
      Array<{ customerId: string; orders: bigint; revenue: number }>
    >`
      SELECT
        "customerId",
        COUNT(DISTINCT "orderNumber")::bigint AS orders,
        COALESCE(SUM("totalAmountTry"), 0)::numeric AS revenue
      FROM "MarketplaceSalesRecord"
      WHERE "customerId" = ANY(${customerIds}::text[])
        AND (status IS NULL OR (status NOT ILIKE '%iptal%' AND status NOT ILIKE '%iade%'))
      GROUP BY "customerId"
    `,
    prisma.quote.groupBy({
      by: ["customerId"],
      where: {
        customerId: { in: customerIds },
        status: { in: ["DRAFT", "SENT"] },
      },
      _count: { id: true },
    }),
    prisma.followUpTask.findMany({
      where: {
        customerId: { in: customerIds },
        status: { not: "DONE" },
      },
      select: { customerId: true, dueDate: true, title: true },
      orderBy: { dueDate: "asc" },
    }),
  ]);

  // Toplam ProductInterest sayımı (aktif olmayan da dahil — info completeness)
  const allInterests = await prisma.productInterest.groupBy({
    by: ["customerId"],
    where: { customerId: { in: customerIds } },
    _count: { id: true },
  });
  const interestsAll = new Map<string, number>();
  for (const r of allInterests) if (r.customerId) interestsAll.set(r.customerId, r._count.id);

  const result = new Map<string, CustomerStatsRow>();
  for (const id of customerIds) {
    result.set(id, {
      customerId: id,
      activeInterestsCount: 0,
      lifetimeOrders: 0,
      lifetimeRevenueTry: 0,
      openQuoteCount: 0,
      nextActionAt: null,
      nextActionTitle: null,
      hasInterests: (interestsAll.get(id) ?? 0) > 0,
    });
  }
  for (const r of interestsRows) {
    if (r.customerId) {
      const row = result.get(r.customerId);
      if (row) row.activeInterestsCount = r._count.id;
    }
  }
  for (const r of salesRows) {
    const row = result.get(r.customerId);
    if (row) {
      row.lifetimeOrders = Number(r.orders);
      row.lifetimeRevenueTry = Number(r.revenue);
    }
  }
  for (const r of quoteRows) {
    if (r.customerId) {
      const row = result.get(r.customerId);
      if (row) row.openQuoteCount = r._count.id;
    }
  }
  for (const r of taskRows) {
    if (!r.customerId) continue;
    const row = result.get(r.customerId);
    if (row && !row.nextActionAt) {
      // tasks sorted by dueDate asc — first is the next one
      row.nextActionAt = r.dueDate;
      row.nextActionTitle = r.title;
    }
  }

  return result;
}
