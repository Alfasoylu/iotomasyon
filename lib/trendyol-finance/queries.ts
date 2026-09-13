/**
 * Faz 91 — Trendyol finans sorguları.
 *
 * Sayfalar hesap yapmaz; tüm toplama işi burada. Tutarlar `number` olarak
 * döner (Prisma.Decimal sunucu bileşeninden client'a geçemez).
 *
 * KDV notu: kesinti faturalarının tutarı KDV **dahil**. KDV indirilebilir
 * olduğu için gerçek maliyet net tutardır. Net yalnız PDF'i yüklenmiş
 * faturalarda kesin bilinir; geri kalanı için oran varsayımıyla tahmin edilir
 * ve ekranda "tahmini" olarak işaretlenir.
 */

import { Prisma, TrendyolCostGroup } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { COST_GROUP_ORDER } from "./cost-groups";

/** KDV'si bilinmeyen faturalar için varsayılan oran (Trendyol kesintileri %20). */
export const ASSUMED_VAT_RATE = 0.2;

const num = (d: Prisma.Decimal | null | undefined): number => (d == null ? 0 : d.toNumber());

export type GroupTotal = {
  group: TrendyolCostGroup;
  expenseTry: number;
  invoiceCount: number;
};

export type MonthTotal = {
  /** "2026-08" */
  month: string;
  expenseTry: number;
  creditTry: number;
  byGroup: Partial<Record<TrendyolCostGroup, number>>;
};

export type FinanceOverview = {
  hasData: boolean;
  invoiceCount: number;
  firstDate: Date | null;
  lastDate: Date | null;

  /** Tüm dönem gider toplamı (KDV dahil). */
  totalExpenseTry: number;
  /** Lehimize kesilen faturalar (iade/tazmin). */
  totalCreditTry: number;
  netExpenseTry: number;

  /** KDV kırılımı — PDF'i yüklenmiş faturalardan kesin, kalanı tahmini. */
  vat: {
    knownInvoices: number;
    knownVatTry: number;
    knownGrossTry: number;
    estimatedVatTry: number;
    estimatedNetExpenseTry: number;
  };

  byGroup: GroupTotal[];
  byMonth: MonthTotal[];
  byCountry: Array<{ country: string; expenseTry: number; invoiceCount: number }>;
  byType: Array<{ invoiceType: string; group: TrendyolCostGroup; expenseTry: number; count: number }>;

  last30: { expenseTry: number; prevExpenseTry: number };

  detail: {
    lineCount: number;
    linkedLineCount: number;
    orderCount: number;
    /** Fatura başlığına bağlanamamış detay dosyası sayısı. */
    unlinkedSources: number;
  };

  settlement: {
    lineCount: number;
    sellerShareTry: number;
    commissionTry: number;
    /** Ağırlıklı ortalama komisyon oranı (%). */
    commissionPct: number | null;
    firstDate: Date | null;
    lastDate: Date | null;
  };
};

export async function loadFinanceOverview(): Promise<FinanceOverview> {
  const [
    invoiceAgg,
    groupRows,
    monthRows,
    countryRows,
    typeRows,
    vatRow,
    last30Row,
    lineAgg,
    linkedLineCount,
    orderCountRow,
    unlinkedRow,
    settlementAgg,
    settlementDates,
  ] = await Promise.all([
    prisma.trendyolInvoice.aggregate({
      _count: { _all: true },
      _min: { invoiceDate: true },
      _max: { invoiceDate: true },
      _sum: { expenseTry: true },
    }),

    prisma.trendyolInvoice.groupBy({
      by: ["costGroup"],
      _sum: { expenseTry: true, amountTry: true },
      _count: { _all: true },
    }),

    prisma.$queryRaw<Array<{ month: string; group: TrendyolCostGroup; expense: Prisma.Decimal; credit: Prisma.Decimal }>>`
      SELECT to_char("invoiceDate", 'YYYY-MM')                       AS month,
             "costGroup"                                             AS group,
             COALESCE(SUM("expenseTry"), 0)                          AS expense,
             COALESCE(SUM(GREATEST("amountTry", 0)), 0)              AS credit
      FROM "trendyol_invoice"
      GROUP BY 1, 2
      ORDER BY 1
    `,

    prisma.trendyolInvoice.groupBy({
      by: ["country"],
      _sum: { expenseTry: true },
      _count: { _all: true },
      orderBy: { _sum: { expenseTry: "desc" } },
    }),

    prisma.trendyolInvoice.groupBy({
      by: ["invoiceType", "costGroup"],
      _sum: { expenseTry: true },
      _count: { _all: true },
      orderBy: { _sum: { expenseTry: "desc" } },
      take: 30,
    }),

    prisma.trendyolInvoice.aggregate({
      where: { pdfParsed: true, vatTry: { not: null } },
      _count: { _all: true },
      _sum: { vatTry: true, grossTry: true },
    }),

    prisma.$queryRaw<Array<{ bucket: string; expense: Prisma.Decimal }>>`
      SELECT CASE
               WHEN "invoiceDate" >= NOW() - INTERVAL '30 days'  THEN 'current'
               ELSE 'previous'
             END                            AS bucket,
             COALESCE(SUM("expenseTry"), 0) AS expense
      FROM "trendyol_invoice"
      WHERE "invoiceDate" >= NOW() - INTERVAL '60 days'
      GROUP BY 1
    `,

    prisma.trendyolInvoiceLine.aggregate({ _count: { _all: true } }),
    prisma.trendyolInvoiceLine.count({ where: { invoiceId: { not: null } } }),

    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT "orderNumber") AS count
      FROM "trendyol_invoice_line"
      WHERE "orderNumber" IS NOT NULL
    `,

    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT "sourceRef") AS count
      FROM "trendyol_invoice_line"
      WHERE "invoiceId" IS NULL
    `,

    prisma.trendyolSettlementLine.aggregate({
      _count: { _all: true },
      _sum: { sellerShareTry: true, trendyolShareTry: true, totalTry: true },
    }),

    prisma.trendyolSettlementLine.aggregate({
      _min: { transactionDate: true },
      _max: { transactionDate: true },
    }),
  ]);

  // ── Gider grubu kırılımı ──
  const byGroup: GroupTotal[] = COST_GROUP_ORDER.map((group) => {
    const row = groupRows.find((r) => r.costGroup === group);
    return {
      group,
      expenseTry: num(row?._sum.expenseTry),
      invoiceCount: row?._count._all ?? 0,
    };
  }).filter((g) => g.invoiceCount > 0);

  // ── Aylık seri ──
  const monthMap = new Map<string, MonthTotal>();
  for (const r of monthRows) {
    const entry = monthMap.get(r.month) ?? { month: r.month, expenseTry: 0, creditTry: 0, byGroup: {} };
    const expense = num(r.expense);
    entry.expenseTry += expense;
    entry.creditTry += num(r.credit);
    entry.byGroup[r.group] = (entry.byGroup[r.group] ?? 0) + expense;
    monthMap.set(r.month, entry);
  }
  const byMonth = [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month));

  // ── KDV ──
  const knownVat = num(vatRow._sum.vatTry);
  const knownGross = num(vatRow._sum.grossTry);
  const totalExpense = num(invoiceAgg._sum.expenseTry);
  const unknownGross = Math.max(0, totalExpense - knownGross);
  // KDV dahil tutardan KDV'yi ayır: gross × oran / (1 + oran)
  const estimatedVat = knownVat + (unknownGross * ASSUMED_VAT_RATE) / (1 + ASSUMED_VAT_RATE);

  const totalCredit = groupRows.reduce((s, r) => {
    const amount = num(r._sum.amountTry);
    return s + (amount > 0 ? amount : 0);
  }, 0);

  const cur = last30Row.find((r) => r.bucket === "current");
  const prev = last30Row.find((r) => r.bucket === "previous");

  const commission = num(settlementAgg._sum.trendyolShareTry);
  const settlementTotal = num(settlementAgg._sum.totalTry);

  return {
    hasData: invoiceAgg._count._all > 0 || (lineAgg._count._all ?? 0) > 0,
    invoiceCount: invoiceAgg._count._all,
    firstDate: invoiceAgg._min.invoiceDate,
    lastDate: invoiceAgg._max.invoiceDate,

    totalExpenseTry: totalExpense,
    totalCreditTry: totalCredit,
    netExpenseTry: totalExpense - totalCredit,

    vat: {
      knownInvoices: vatRow._count._all,
      knownVatTry: knownVat,
      knownGrossTry: knownGross,
      estimatedVatTry: estimatedVat,
      estimatedNetExpenseTry: totalExpense - estimatedVat,
    },

    byGroup,
    byMonth,
    // Ülkesiz satırlar da gösterilir (reklam faturalarında ülke boş geliyor) —
    // aksi halde kırılım toplamı manşetteki toplamı tutmaz.
    byCountry: countryRows.map((r) => ({
      country: r.country ?? "Belirtilmemiş",
      expenseTry: num(r._sum.expenseTry),
      invoiceCount: r._count._all,
    })),
    byType: typeRows.map((r) => ({
      invoiceType: r.invoiceType,
      group: r.costGroup,
      expenseTry: num(r._sum.expenseTry),
      count: r._count._all,
    })),

    last30: { expenseTry: num(cur?.expense), prevExpenseTry: num(prev?.expense) },

    detail: {
      lineCount: lineAgg._count._all,
      linkedLineCount,
      orderCount: Number(orderCountRow[0]?.count ?? 0),
      unlinkedSources: Number(unlinkedRow[0]?.count ?? 0),
    },

    settlement: {
      lineCount: settlementAgg._count._all,
      sellerShareTry: num(settlementAgg._sum.sellerShareTry),
      commissionTry: commission,
      commissionPct: settlementTotal > 0 ? (commission / settlementTotal) * 100 : null,
      firstDate: settlementDates._min.transactionDate,
      lastDate: settlementDates._max.transactionDate,
    },
  };
}

// ── Yükleme günlüğü ─────────────────────────────────────────────────────────

export async function loadRecentImports(take = 15) {
  const rows = await prisma.trendyolFinanceImport.findMany({
    orderBy: { importedAt: "desc" },
    take,
  });

  return rows.map((r) => ({
    id: r.id,
    fileName: r.fileName,
    fileKind: r.fileKind,
    rowsTotal: r.rowsTotal,
    rowsNew: r.rowsNew,
    rowsUpdated: r.rowsUpdated,
    rowsSkipped: r.rowsSkipped,
    amountTotalTry: r.amountTotalTry ? r.amountTotalTry.toNumber() : null,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    ok: r.ok,
    error: r.error,
    importedAt: r.importedAt,
    importedByEmail: r.importedByEmail,
  }));
}

// ── Fatura listesi ──────────────────────────────────────────────────────────

export type InvoiceFilters = {
  group?: TrendyolCostGroup;
  month?: string; // "2026-08"
  country?: string;
  q?: string;
  page?: number;
  perPage?: number;
};

export async function loadInvoices(filters: InvoiceFilters) {
  const perPage = Math.min(filters.perPage ?? 50, 200);
  const page = Math.max(1, filters.page ?? 1);

  const where: Prisma.TrendyolInvoiceWhereInput = {};
  if (filters.group) where.costGroup = filters.group;
  if (filters.country) where.country = filters.country;
  if (filters.q) {
    where.OR = [
      { invoiceNo: { contains: filters.q, mode: "insensitive" } },
      { invoiceType: { contains: filters.q, mode: "insensitive" } },
      { description: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  if (filters.month && /^\d{4}-\d{2}$/.test(filters.month)) {
    const [y, m] = filters.month.split("-").map(Number);
    where.invoiceDate = {
      gte: new Date(Date.UTC(y, m - 1, 1)),
      lt: new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1)),
    };
  }

  const [rows, total, sum] = await Promise.all([
    prisma.trendyolInvoice.findMany({
      where,
      orderBy: { invoiceDate: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      include: { _count: { select: { lines: true } } },
    }),
    prisma.trendyolInvoice.count({ where }),
    prisma.trendyolInvoice.aggregate({ where, _sum: { expenseTry: true, amountTry: true } }),
  ]);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      invoiceNo: r.invoiceNo,
      invoiceDate: r.invoiceDate,
      invoiceType: r.invoiceType,
      category: r.category,
      costGroup: r.costGroup,
      country: r.country,
      amountTry: r.amountTry.toNumber(),
      expenseTry: r.expenseTry.toNumber(),
      netTry: r.netTry ? r.netTry.toNumber() : null,
      vatTry: r.vatTry ? r.vatTry.toNumber() : null,
      pdfParsed: r.pdfParsed,
      description: r.description,
      lineCount: r._count.lines,
    })),
    total,
    page,
    perPage,
    pageCount: Math.max(1, Math.ceil(total / perPage)),
    sumExpenseTry: num(sum._sum.expenseTry),
    sumAmountTry: num(sum._sum.amountTry),
  };
}

/** Filtre açılır kutuları için mevcut ay ve ülke değerleri. */
export async function loadInvoiceFilterOptions() {
  const [months, countries] = await Promise.all([
    prisma.$queryRaw<Array<{ month: string }>>`
      SELECT DISTINCT to_char("invoiceDate", 'YYYY-MM') AS month
      FROM "trendyol_invoice"
      ORDER BY 1 DESC
    `,
    prisma.trendyolInvoice.findMany({
      where: { country: { not: null } },
      distinct: ["country"],
      select: { country: true },
      orderBy: { country: "asc" },
    }),
  ]);

  return {
    months: months.map((m) => m.month),
    countries: countries.map((c) => c.country as string),
  };
}

// ── Sipariş bazında maliyet ─────────────────────────────────────────────────

export type OrderCostRow = {
  orderNumber: string;
  cargoTry: number;
  serviceTry: number;
  penaltyTry: number;
  otherTry: number;
  totalCostTry: number;
  lineCount: number;
  lastDate: Date | null;
  /** Hakediş dosyasından: bu siparişten bize kalan tutar. */
  sellerShareTry: number | null;
  commissionTry: number | null;
};

/**
 * Sipariş bazında Trendyol maliyeti. Kesinti detayları ile hakediş satırları
 * sipariş numarasından birleştirilir; hakediş yüklenmemişse o sütunlar boş kalır.
 */
export async function loadOrderCosts(opts: { take?: number; q?: string } = {}) {
  const take = Math.min(opts.take ?? 100, 500);
  const q = opts.q?.trim();

  const rows = await prisma.$queryRaw<
    Array<{
      orderNumber: string;
      cargo: Prisma.Decimal;
      service: Prisma.Decimal;
      penalty: Prisma.Decimal;
      other: Prisma.Decimal;
      total: Prisma.Decimal;
      lineCount: bigint;
      lastDate: Date | null;
      sellerShare: Prisma.Decimal | null;
      commission: Prisma.Decimal | null;
    }>
  >`
    WITH lines AS (
      SELECT "orderNumber",
             SUM(CASE WHEN "lineKind" = 'KARGO'        THEN "amountTry" ELSE 0 END) AS cargo,
             SUM(CASE WHEN "lineKind" IN ('ISLEM_BEDELI','MIKRO_IHRACAT','IADE_BEDELI')
                                                        THEN "amountTry" ELSE 0 END) AS service,
             SUM(CASE WHEN "lineKind" = 'CEZA'         THEN "amountTry" ELSE 0 END) AS penalty,
             SUM(CASE WHEN "lineKind" = 'KESINTI'      THEN "amountTry" ELSE 0 END) AS other,
             SUM("amountTry")                                                        AS total,
             COUNT(*)                                                                AS "lineCount",
             MAX(COALESCE("shipDate", "orderDate"))                                  AS "lastDate"
      FROM "trendyol_invoice_line"
      WHERE "orderNumber" IS NOT NULL
        ${q ? Prisma.sql`AND "orderNumber" LIKE ${`%${q}%`}` : Prisma.empty}
      GROUP BY "orderNumber"
    ),
    settle AS (
      SELECT "orderNumber",
             SUM("sellerShareTry")   AS "sellerShare",
             SUM("trendyolShareTry") AS commission
      FROM "trendyol_settlement_line"
      GROUP BY "orderNumber"
    )
    SELECT l."orderNumber", l.cargo, l.service, l.penalty, l.other, l.total,
           l."lineCount", l."lastDate",
           s."sellerShare", s.commission
    FROM lines l
    LEFT JOIN settle s ON s."orderNumber" = l."orderNumber"
    ORDER BY l.total DESC
    LIMIT ${take}
  `;

  return rows.map<OrderCostRow>((r) => ({
    orderNumber: r.orderNumber,
    cargoTry: num(r.cargo),
    serviceTry: num(r.service),
    penaltyTry: num(r.penalty),
    otherTry: num(r.other),
    totalCostTry: num(r.total),
    lineCount: Number(r.lineCount),
    lastDate: r.lastDate,
    sellerShareTry: r.sellerShare == null ? null : num(r.sellerShare),
    commissionTry: r.commission == null ? null : num(r.commission),
  }));
}

/** Tek faturanın detay satırları — fatura kartında gösterilir. */
export async function loadInvoiceLines(invoiceId: string, take = 500) {
  const rows = await prisma.trendyolInvoiceLine.findMany({
    where: { invoiceId },
    orderBy: { amountTry: "desc" },
    take,
  });

  return rows.map((r) => ({
    id: r.id,
    lineKind: r.lineKind,
    orderNumber: r.orderNumber,
    shipmentType: r.shipmentType,
    cargoCompany: r.cargoCompany,
    orderDate: r.orderDate,
    shipDate: r.shipDate,
    amountTry: r.amountTry.toNumber(),
    orderAmountTry: r.orderAmountTry ? r.orderAmountTry.toNumber() : null,
    desi: r.desi ? r.desi.toNumber() : null,
    description: r.description,
  }));
}
