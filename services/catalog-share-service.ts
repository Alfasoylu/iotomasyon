/**
 * Faz 4 — Catalog Share Service
 *
 * Token oluşturma, view tracking, ürün ilgi event'i kaydı.
 * Public route (/c/[token]) ve admin paneli buraya bağlanır.
 */
import "server-only";

import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";
import type { CatalogPriceMode } from "@/lib/catalog-mapping";

export interface CreateShareInput {
  customerId: string;
  sentById: string;
  profileSlug: string;
  priceMode: CatalogPriceMode;
  brandFilter: string[];
  onlyStock: boolean;
  coverNote: string | null;
  expiryDays?: number;
}

export interface ShareWithCustomer {
  id: string;
  token: string;
  customerId: string;
  customerName: string;
  customerCompany: string | null;
  customerPhone: string | null;
  customerWhatsapp: string | null;
  customerIndustryName: string | null;
  sentById: string | null;
  sentByName: string | null;
  profileSlug: string;
  priceMode: CatalogPriceMode;
  brandFilter: string[];
  onlyStock: boolean;
  coverNote: string | null;
  expiresAt: Date;
  viewCount: number;
  firstViewedAt: Date | null;
  lastViewedAt: Date | null;
  createdAt: Date;
}

function generateToken(): string {
  return randomBytes(16).toString("hex");
}

export async function createCatalogShare(input: CreateShareInput): Promise<{ token: string; id: string }> {
  const expiryDays = input.expiryDays ?? 30;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiryDays);

  let attempts = 0;
  while (attempts < 5) {
    const token = generateToken();
    try {
      const share = await prisma.catalogShare.create({
        data: {
          token,
          customerId: input.customerId,
          sentById: input.sentById,
          profileSlug: input.profileSlug,
          priceMode: input.priceMode,
          brandFilter: input.brandFilter.length > 0 ? input.brandFilter.join(",") : null,
          onlyStock: input.onlyStock,
          coverNote: input.coverNote,
          expiresAt,
        },
        select: { id: true, token: true },
      });
      return { token: share.token, id: share.id };
    } catch (error) {
      const isUnique =
        typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
      if (!isUnique) throw error;
      attempts++;
    }
  }
  throw new Error("Token oluşturulamadı (5 deneme başarısız).");
}

export async function getShareByToken(token: string): Promise<ShareWithCustomer | null> {
  const share = await prisma.catalogShare.findUnique({
    where: { token },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          company: true,
          phone: true,
          whatsapp: true,
          industry: { select: { name: true } },
        },
      },
      sentBy: { select: { id: true, name: true } },
    },
  });
  if (!share) return null;
  return {
    id: share.id,
    token: share.token,
    customerId: share.customer.id,
    customerName: share.customer.name,
    customerCompany: share.customer.company,
    customerPhone: share.customer.phone,
    customerWhatsapp: share.customer.whatsapp,
    customerIndustryName: share.customer.industry?.name ?? null,
    sentById: share.sentBy?.id ?? null,
    sentByName: share.sentBy?.name ?? null,
    profileSlug: share.profileSlug,
    priceMode: share.priceMode as CatalogPriceMode,
    brandFilter: share.brandFilter ? share.brandFilter.split(",").filter(Boolean) : [],
    onlyStock: share.onlyStock,
    coverNote: share.coverNote,
    expiresAt: share.expiresAt,
    viewCount: share.viewCount,
    firstViewedAt: share.firstViewedAt,
    lastViewedAt: share.lastViewedAt,
    createdAt: share.createdAt,
  };
}

export async function recordShareView(shareId: string): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const current = await tx.catalogShare.findUnique({
      where: { id: shareId },
      select: { firstViewedAt: true },
    });
    await tx.catalogShare.update({
      where: { id: shareId },
      data: {
        viewCount: { increment: 1 },
        firstViewedAt: current?.firstViewedAt ?? now,
        lastViewedAt: now,
      },
    });
  });
}

/**
 * Müşteri katalog içinde "İlgilendim" butonuna bastığında:
 *   1. CatalogProductInterest event kaydı
 *   2. Ana sistemde ProductInterest oluştur (varsa skip)
 *   3. Sales rep'e takip görevi oluştur (24h sonra)
 */
export async function recordCatalogInterest(
  shareId: string,
  productId: string,
  action: "INTERESTED" | "ADD_TO_CART" | "VIEWED_LONG" = "INTERESTED",
): Promise<{ created: boolean }> {
  const share = await prisma.catalogShare.findUnique({
    where: { id: shareId },
    select: {
      customerId: true,
      sentById: true,
      followUpTaskCreated: true,
    },
  });
  if (!share) return { created: false };

  // 1. Event kaydı
  await prisma.catalogProductInterest.create({
    data: { catalogShareId: shareId, productId, action },
  });

  // 2. Ana ProductInterest oluştur (varsa skip — unique constraint koruyor)
  const existing = await prisma.productInterest.findFirst({
    where: { customerId: share.customerId, productId },
    select: { id: true },
  });
  if (!existing) {
    await prisma.productInterest.create({
      data: {
        customerId: share.customerId,
        productId,
        quantity: 1,
        stage: "INTERESTED",
        interestNotes: "Katalogdan otomatik oluşturuldu",
        createdById: share.sentById,
      },
    }).catch(() => {
      // Schema-level kısıtlamalar olabilir; sessizce devam
    });
  }

  // 3. Takip görevi (24h sonra, sadece bir kere)
  if (!share.followUpTaskCreated && share.sentById) {
    const due = new Date();
    due.setDate(due.getDate() + 1);
    await prisma.$transaction([
      prisma.followUpTask.create({
        data: {
          customerId: share.customerId,
          title: "Katalog ilgisi: müşteriyle takip görüşmesi",
          description: "Müşteri gönderdiğiniz katalog içinden bir ürüne 'İlgilendim' işaretledi. 24 saat içinde ara.",
          status: "OPEN",
          priority: "HIGH",
          dueDate: due,
          assignedToId: share.sentById,
          createdById: share.sentById,
        },
      }),
      prisma.catalogShare.update({
        where: { id: shareId },
        data: { followUpTaskCreated: true },
      }),
    ]);
  }

  return { created: true };
}

export async function getCatalogPerformanceStats(opts: { daysBack?: number } = {}) {
  const daysBack = opts.daysBack ?? 30;
  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  const [totalSent, opened, withInterest, bySalesRep, byProfile] = await Promise.all([
    prisma.catalogShare.count({ where: { createdAt: { gte: since } } }),
    prisma.catalogShare.count({
      where: { createdAt: { gte: since }, firstViewedAt: { not: null } },
    }),
    prisma.catalogShare.count({
      where: {
        createdAt: { gte: since },
        productInterests: { some: {} },
      },
    }),
    prisma.catalogShare.groupBy({
      by: ["sentById"],
      where: { createdAt: { gte: since }, sentById: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { sentById: "desc" } },
      take: 10,
    }),
    prisma.catalogShare.groupBy({
      by: ["profileSlug"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { profileSlug: "desc" } },
      take: 12,
    }),
  ]);

  const sentByIds = bySalesRep.map((r) => r.sentById).filter((x): x is string => !!x);
  const userMap = new Map<string, string>();
  if (sentByIds.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: sentByIds } },
      select: { id: true, name: true },
    });
    users.forEach((u) => userMap.set(u.id, u.name));
  }

  // For each profile and rep, also count opened + interest
  const profileSlugs = byProfile.map((r) => r.profileSlug);
  const profileOpened = new Map<string, number>();
  const profileInterest = new Map<string, number>();
  if (profileSlugs.length > 0) {
    const openedByProfile = await prisma.catalogShare.groupBy({
      by: ["profileSlug"],
      where: {
        createdAt: { gte: since },
        profileSlug: { in: profileSlugs },
        firstViewedAt: { not: null },
      },
      _count: { _all: true },
    });
    openedByProfile.forEach((r) => profileOpened.set(r.profileSlug, r._count._all));

    const interestByProfile = await prisma.catalogShare.groupBy({
      by: ["profileSlug"],
      where: {
        createdAt: { gte: since },
        profileSlug: { in: profileSlugs },
        productInterests: { some: {} },
      },
      _count: { _all: true },
    });
    interestByProfile.forEach((r) => profileInterest.set(r.profileSlug, r._count._all));
  }

  return {
    daysBack,
    totalSent,
    opened,
    openRate: totalSent > 0 ? (opened / totalSent) * 100 : 0,
    withInterest,
    interestRate: opened > 0 ? (withInterest / opened) * 100 : 0,
    bySalesRep: bySalesRep.map((r) => ({
      userId: r.sentById!,
      userName: userMap.get(r.sentById!) ?? "—",
      sent: r._count._all,
    })),
    byProfile: byProfile.map((r) => ({
      profileSlug: r.profileSlug,
      sent: r._count._all,
      opened: profileOpened.get(r.profileSlug) ?? 0,
      withInterest: profileInterest.get(r.profileSlug) ?? 0,
    })),
  };
}
