/**
 * services/customer-activity-service.ts — Phase 96e: Call collision detection
 *
 * "Son 2 saatte bu müşteri başka bir sales rep tarafından arandı mı?"
 *
 * İki rep aynı müşteriyi aynı saatte aramasın diye müşteri kartında uyarı çıkar.
 */
import "server-only";
import { prisma } from "@/lib/prisma";

export interface RecentActivity {
  customerId: string;
  byUserId: string;
  byUserName: string;
  minutesAgo: number;
  type: "CALL" | "NOTE" | "CONTACT";
}

const COLLISION_WINDOW_MINUTES = 120; // 2 saat

export async function getRecentActivityByOthers(
  customerIds: string[],
  currentUserId: string,
): Promise<Map<string, RecentActivity>> {
  if (customerIds.length === 0) return new Map();

  const since = new Date(Date.now() - COLLISION_WINDOW_MINUTES * 60_000);

  const notes = await prisma.note.findMany({
    where: {
      customerId: { in: customerIds },
      type: "CALL",
      createdAt: { gte: since },
      createdById: { not: currentUserId },
    },
    select: {
      customerId: true,
      createdAt: true,
      createdById: true,
      createdBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const map = new Map<string, RecentActivity>();
  for (const n of notes) {
    if (!n.customerId || !n.createdById || !n.createdBy) continue;
    if (map.has(n.customerId)) continue; // ilk (en yeni) kayıt yeterli
    const minutesAgo = Math.max(
      1,
      Math.round((Date.now() - n.createdAt.getTime()) / 60_000),
    );
    map.set(n.customerId, {
      customerId: n.customerId,
      byUserId: n.createdById,
      byUserName: n.createdBy.name ?? n.createdBy.email,
      minutesAgo,
      type: "CALL",
    });
  }

  return map;
}
