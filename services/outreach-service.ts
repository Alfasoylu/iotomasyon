import "server-only";

import { isDatabaseUnavailableError } from "@/lib/database";
import { prisma } from "@/lib/prisma";

export type CampaignCandidate = {
  customerId: string;
  name: string;
  company: string | null;
  phone: string | null;
  whatsapp: string | null;
  source: "direct" | "category";
};

export type CampaignDetail = {
  id: string;
  message: string;
  offerText: string | null;
  price: string | null;
  currency: string;
  status: string;
  createdAt: Date;
  product: { id: string; name: string; sku: string } | null;
  category: { id: string; name: string; slug: string } | null;
  recipients: {
    id: string;
    phone: string | null;
    status: string;
    sentAt: Date | null;
    customer: { id: string; name: string; company: string | null };
  }[];
};

export async function getCampaignCandidates(
  productId?: string | null,
  categoryId?: string | null,
): Promise<{ databaseAvailable: true; candidates: CampaignCandidate[] } | { databaseAvailable: false; candidates: [] }> {
  try {
    const seenIds = new Set<string>();
    const candidates: CampaignCandidate[] = [];

    if (productId) {
      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: {
          categoryId: true,
          interests: {
            include: {
              customer: { select: { id: true, name: true, company: true, phone: true, whatsapp: true } },
            },
            orderBy: { createdAt: "desc" },
          },
        },
      });

      if (product) {
        for (const interest of product.interests) {
          const c = interest.customer;
          if (!seenIds.has(c.id)) {
            seenIds.add(c.id);
            candidates.push({ customerId: c.id, name: c.name, company: c.company, phone: c.phone, whatsapp: c.whatsapp, source: "direct" });
          }
        }

        const catId = categoryId ?? product.categoryId;
        if (catId) {
          const catInterests = await prisma.categoryInterest.findMany({
            where: { categoryId: catId },
            include: {
              customer: { select: { id: true, name: true, company: true, phone: true, whatsapp: true } },
            },
            orderBy: { createdAt: "desc" },
          });

          for (const ci of catInterests) {
            const c = ci.customer;
            if (!seenIds.has(c.id)) {
              seenIds.add(c.id);
              candidates.push({ customerId: c.id, name: c.name, company: c.company, phone: c.phone, whatsapp: c.whatsapp, source: "category" });
            }
          }
        }
      }
    } else if (categoryId) {
      const catInterests = await prisma.categoryInterest.findMany({
        where: { categoryId },
        include: {
          customer: { select: { id: true, name: true, company: true, phone: true, whatsapp: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      for (const ci of catInterests) {
        const c = ci.customer;
        if (!seenIds.has(c.id)) {
          seenIds.add(c.id);
          candidates.push({ customerId: c.id, name: c.name, company: c.company, phone: c.phone, whatsapp: c.whatsapp, source: "category" });
        }
      }
    }

    return { databaseAvailable: true, candidates };
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return { databaseAvailable: false, candidates: [] };
    }
    throw error;
  }
}

export async function getCampaignById(id: string): Promise<
  | { databaseAvailable: true; campaign: CampaignDetail | null }
  | { databaseAvailable: false; campaign: null }
> {
  try {
    const campaign = await prisma.outreachCampaign.findUnique({
      where: { id },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        category: { select: { id: true, name: true, slug: true } },
        recipients: {
          include: {
            customer: { select: { id: true, name: true, company: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!campaign) return { databaseAvailable: true, campaign: null };

    return {
      databaseAvailable: true,
      campaign: {
        ...campaign,
        price: campaign.price ? campaign.price.toString() : null,
      },
    };
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return { databaseAvailable: false, campaign: null };
    }
    throw error;
  }
}

export async function listCampaigns(): Promise<
  | { databaseAvailable: true; campaigns: { id: string; message: string; status: string; createdAt: Date; product: { name: string } | null; category: { name: string } | null; _count: { recipients: number } }[] }
  | { databaseAvailable: false; campaigns: [] }
> {
  try {
    const campaigns = await prisma.outreachCampaign.findMany({
      include: {
        product: { select: { name: true } },
        category: { select: { name: true } },
        _count: { select: { recipients: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return { databaseAvailable: true, campaigns };
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return { databaseAvailable: false, campaigns: [] };
    }
    throw error;
  }
}
