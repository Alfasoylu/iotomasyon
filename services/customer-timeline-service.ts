/**
 * services/customer-timeline-service.ts — Müşteri birleşik zaman çizelgesi
 *
 * Note + FollowUpTask + Quote + ProductInterest + MarketplaceSalesRecord +
 * TrendyolSalesRecord + HepsiburadaSalesRecord olaylarını tek timeline'da
 * birleştirir. Detay sayfası tek-tab single-page workspace için.
 */
import "server-only";
import { prisma } from "@/lib/prisma";

export type TimelineEventKind =
  | "NOTE"
  | "CALL"
  | "WHATSAPP"
  | "EMAIL"
  | "MEETING"
  | "TASK_CREATED"
  | "TASK_DONE"
  | "QUOTE_CREATED"
  | "QUOTE_SENT"
  | "INTEREST_NEW"
  | "MARKETPLACE_SALE"
  | "CREATED";

export interface TimelineEvent {
  id: string;
  kind: TimelineEventKind;
  happenedAt: Date;
  actorName: string | null;   // kullanıcı (Ali) veya null (sistem)
  title: string;              // 1 satır özet
  body: string | null;        // detay metin (note content, quote toplam, vb.)
  meta: Record<string, string | number | null>;  // ekstra alanlar
  href: string | null;        // tıklanırsa nereye gider
}

export async function listCustomerTimeline(
  customerId: string,
  limit = 100,
): Promise<TimelineEvent[]> {
  const events: TimelineEvent[] = [];

  // 1) Notes (NOTE/CALL/EMAIL/WHATSAPP/MEETING)
  const notes = await prisma.note.findMany({
    where: { customerId },
    select: {
      id: true,
      content: true,
      type: true,
      createdAt: true,
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  for (const n of notes) {
    const noteType = n.type ?? "NOTE";
    const kind: TimelineEventKind =
      noteType === "CALL" ? "CALL" :
      noteType === "WHATSAPP" ? "WHATSAPP" :
      noteType === "EMAIL" ? "EMAIL" :
      noteType === "MEETING" ? "MEETING" : "NOTE";
    const titleByKind: Record<TimelineEventKind, string> = {
      NOTE: "Not eklendi",
      CALL: "Telefon görüşmesi",
      WHATSAPP: "WhatsApp mesajı",
      EMAIL: "E-posta",
      MEETING: "Toplantı",
      TASK_CREATED: "",
      TASK_DONE: "",
      QUOTE_CREATED: "",
      QUOTE_SENT: "",
      INTEREST_NEW: "",
      MARKETPLACE_SALE: "",
      CREATED: "",
    };
    events.push({
      id: `note-${n.id}`,
      kind,
      happenedAt: n.createdAt,
      actorName: n.createdBy?.name ?? null,
      title: titleByKind[kind],
      body: n.content,
      meta: {},
      href: null,
    });
  }

  // 2) FollowUpTasks (created + done)
  const tasks = await prisma.followUpTask.findMany({
    where: { customerId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      dueDate: true,
      createdAt: true,
      completedAt: true,
      createdBy: { select: { name: true } },
      assignedTo: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  for (const t of tasks) {
    events.push({
      id: `task-created-${t.id}`,
      kind: "TASK_CREATED",
      happenedAt: t.createdAt,
      actorName: t.createdBy?.name ?? null,
      title: `Görev oluşturuldu: ${t.title}`,
      body: t.description,
      meta: {
        priority: t.priority ?? null,
        dueDate: t.dueDate ? t.dueDate.toISOString() : null,
        assignedTo: t.assignedTo?.name ?? null,
        status: t.status ?? null,
      },
      href: null,
    });
    if (t.completedAt) {
      events.push({
        id: `task-done-${t.id}`,
        kind: "TASK_DONE",
        happenedAt: t.completedAt,
        actorName: null,
        title: `Görev tamamlandı: ${t.title}`,
        body: null,
        meta: {},
        href: null,
      });
    }
  }

  // 3) Quotes
  const quotes = await prisma.quote.findMany({
    where: { customerId },
    select: {
      id: true,
      quoteNumber: true,
      status: true,
      total: true,
      currencyMode: true,
      createdAt: true,
      sentAt: true,
      _count: { select: { items: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  for (const q of quotes) {
    events.push({
      id: `quote-created-${q.id}`,
      kind: "QUOTE_CREATED",
      happenedAt: q.createdAt,
      actorName: q.createdBy?.name ?? null,
      title: `Teklif oluşturuldu: ${q.quoteNumber}`,
      body: null,
      meta: {
        total: Number(q.total),
        currency: q.currencyMode ?? "TRY",
        itemCount: q._count.items,
        status: q.status ?? null,
      },
      href: `/quotes/${q.id}`,
    });
    if (q.sentAt) {
      events.push({
        id: `quote-sent-${q.id}`,
        kind: "QUOTE_SENT",
        happenedAt: q.sentAt,
        actorName: q.createdBy?.name ?? null,
        title: `Teklif gönderildi: ${q.quoteNumber}`,
        body: null,
        meta: {
          total: Number(q.total),
          currency: q.currencyMode ?? "TRY",
        },
        href: `/quotes/${q.id}`,
      });
    }
  }

  // 4) ProductInterest oluşturulması
  const interests = await prisma.productInterest.findMany({
    where: { customerId },
    select: {
      id: true,
      createdAt: true,
      quantity: true,
      stage: true,
      product: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  for (const i of interests) {
    events.push({
      id: `interest-${i.id}`,
      kind: "INTEREST_NEW",
      happenedAt: i.createdAt,
      actorName: i.createdBy?.name ?? null,
      title: `Ürün ilgisi eklendi: ${i.product.name}`,
      body: null,
      meta: { quantity: i.quantity, stage: i.stage ?? null },
      href: `/products/${i.product.id}`,
    });
  }

  // 5) Marketplace satışları (Pazaryeri siparişleri)
  const sales = await prisma.marketplaceSalesRecord.findMany({
    where: {
      customerId,
      NOT: [
        { status: { contains: "iptal", mode: "insensitive" } },
        { status: { contains: "iade", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      channel: true,
      orderNumber: true,
      orderDate: true,
      productName: true,
      quantity: true,
      totalAmountTry: true,
      status: true,
      productId: true,
    },
    orderBy: { orderDate: "desc" },
    take: limit,
  });
  for (const s of sales) {
    events.push({
      id: `sale-${s.id}`,
      kind: "MARKETPLACE_SALE",
      happenedAt: s.orderDate,
      actorName: null,
      title: `${s.channel}: ${s.productName ?? "Sipariş"}`,
      body: null,
      meta: {
        channel: s.channel,
        orderNumber: s.orderNumber,
        quantity: s.quantity,
        totalTry: s.totalAmountTry ? Number(s.totalAmountTry) : 0,
        status: s.status ?? null,
      },
      href: s.productId ? `/products/${s.productId}` : null,
    });
  }

  // 6) Müşteri oluşturulması
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { createdAt: true, source: true },
  });
  if (customer) {
    events.push({
      id: `customer-created-${customerId}`,
      kind: "CREATED",
      happenedAt: customer.createdAt,
      actorName: null,
      title: customer.source ? `Müşteri eklendi (${customer.source})` : "Müşteri eklendi",
      body: null,
      meta: {},
      href: null,
    });
  }

  // Sırala: yeniden eskiye
  events.sort((a, b) => b.happenedAt.getTime() - a.happenedAt.getTime());

  return events.slice(0, limit);
}
