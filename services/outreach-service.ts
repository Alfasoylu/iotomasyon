import "server-only";

import { isDatabaseUnavailableError } from "@/lib/database";
import { prisma } from "@/lib/prisma";

export type CampaignCandidate = {
  customerId: string;
  name: string;
  company: string | null;
  phone: string | null;
  whatsapp: string | null;
  source: "direct" | "attribute" | "category";
};

export type CampaignFunnel = {
  total: number;
  sent: number;
  replied: number;
  quoted: number;
  won: number;
  revenue: number;
};

export type CampaignRecipient = {
  id: string;
  phone: string | null;
  status: string;
  sentAt: Date | null;
  repliedAt: Date | null;
  wonAmount: string | null;
  quoteId: string | null;
  quote: { id: string; quoteNumber: string; total: string } | null;
  customer: { id: string; name: string; company: string | null };
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
  funnel: CampaignFunnel;
  recipients: CampaignRecipient[];
};

const SENT_STATUSES    = new Set(["SENT", "REPLIED", "QUOTED", "WON", "LOST"]);
const REPLIED_STATUSES = new Set(["REPLIED", "QUOTED", "WON", "LOST"]);
const QUOTED_STATUSES  = new Set(["QUOTED", "WON", "LOST"]);

function computeFunnel(
  recipients: { status: string; wonAmount: { toString(): string } | null; quoteId: string | null }[],
): CampaignFunnel {
  let sent = 0, replied = 0, quoted = 0, won = 0, revenue = 0;
  // Dedup revenue by quoteId: same quote linked across multiple campaigns/recipients
  // counts only once toward total revenue.
  const countedQuoteIds = new Set<string>();
  for (const r of recipients) {
    if (SENT_STATUSES.has(r.status))    sent++;
    if (REPLIED_STATUSES.has(r.status)) replied++;
    if (QUOTED_STATUSES.has(r.status))  quoted++;
    if (r.status === "WON") {
      won++;
      if (r.wonAmount && r.quoteId && !countedQuoteIds.has(r.quoteId)) {
        countedQuoteIds.add(r.quoteId);
        revenue += parseFloat(r.wonAmount.toString());
      }
    }
  }
  return { total: recipients.length, sent, replied, quoted, won, revenue };
}

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

        // Attribute-based matching (priority: direct > attribute > category)
        const productAttrRows = await prisma.productAttributeAssignment.findMany({
          where: { productId },
          select: { attributeId: true },
        });
        if (productAttrRows.length > 0) {
          const attrIds = productAttrRows.map((r) => r.attributeId);
          const attrInterests = await prisma.customerAttributeInterest.findMany({
            where: { attributeId: { in: attrIds } },
            include: {
              customer: { select: { id: true, name: true, company: true, phone: true, whatsapp: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 500,
          });
          for (const ai of attrInterests) {
            const c = ai.customer;
            if (!seenIds.has(c.id)) {
              seenIds.add(c.id);
              candidates.push({ customerId: c.id, name: c.name, company: c.company, phone: c.phone, whatsapp: c.whatsapp, source: "attribute" });
            }
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
            quote: { select: { id: true, quoteNumber: true, total: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!campaign) return { databaseAvailable: true, campaign: null };

    const recipients: CampaignRecipient[] = campaign.recipients.map((r) => ({
      id: r.id,
      phone: r.phone,
      status: r.status,
      sentAt: r.sentAt,
      repliedAt: r.repliedAt,
      wonAmount: r.wonAmount ? r.wonAmount.toString() : null,
      quoteId: r.quoteId,
      quote: r.quote
        ? { id: r.quote.id, quoteNumber: r.quote.quoteNumber, total: r.quote.total.toString() }
        : null,
      customer: r.customer,
    }));

    return {
      databaseAvailable: true,
      campaign: {
        ...campaign,
        price: campaign.price ? campaign.price.toString() : null,
        funnel: computeFunnel(campaign.recipients),
        recipients,
      },
    };
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return { databaseAvailable: false, campaign: null };
    }
    throw error;
  }
}

export type CampaignListItem = {
  id: string;
  message: string;
  status: string;
  createdAt: Date;
  product: { name: string } | null;
  category: { name: string } | null;
  funnel: CampaignFunnel;
};

export async function listCampaigns(): Promise<
  | { databaseAvailable: true; campaigns: CampaignListItem[] }
  | { databaseAvailable: false; campaigns: [] }
> {
  try {
    const campaigns = await prisma.outreachCampaign.findMany({
      include: {
        product: { select: { name: true } },
        category: { select: { name: true } },
        recipients: { select: { status: true, wonAmount: true, quoteId: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      databaseAvailable: true,
      campaigns: campaigns.map((c) => ({
        id: c.id,
        message: c.message,
        status: c.status,
        createdAt: c.createdAt,
        product: c.product,
        category: c.category,
        funnel: computeFunnel(c.recipients),
      })),
    };
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return { databaseAvailable: false, campaigns: [] };
    }
    throw error;
  }
}
