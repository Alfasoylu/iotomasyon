import "server-only";

import { prisma } from "@/lib/prisma";
import type { ResolvedUser } from "@/lib/permissions";

import { runWithTenant } from "./context";

/**
 * PDKS tenant-admin köprüsü (CRM ↔ PDKS).
 *
 * CRM tek-şirketli olduğundan PDKS de pratikte tek aktif tenant ile çalışır:
 * panel ilk açıldığında aktif bir PdksTenant yoksa şirket için otomatik oluşturulur.
 * `pdks.manage` yetkisi olan CRM kullanıcısı bu tenant'ı yönetir.
 *
 * NOT: Çok-tenant'lı dağıtımda tenant çözümü `PdksPersonnel.crmUserId` üzerinden
 * yapılır (şema buna hazır); Faz 1'de tek aktif tenant yeterli.
 */
export async function resolveAdminTenantId(): Promise<string> {
  const existing = await prisma.pdksTenant.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing.id;

  const created = await prisma.pdksTenant.create({
    data: {
      name: process.env.PDKS_DEFAULT_TENANT_NAME ?? "Şirket",
      slug: "default",
    },
  });
  return created.id;
}

/**
 * Verilen CRM kullanıcısı için PDKS tenant bağlamı kurar ve `fn`'i bu bağlam
 * içinde çalıştırır → içeride `prismaPdks` (scoped) doğrudan kullanılabilir.
 * Bağlamdaki personelId admin'in CRM id'sidir (scoped sorgular yalnızca tenantId
 * kullanır; admin "kendisi" olarak puantajda yer almaz).
 */
export async function runWithPdksAdmin<T>(
  user: ResolvedUser,
  fn: (tenantId: string) => Promise<T>,
): Promise<T> {
  const tenantId = await resolveAdminTenantId();
  return runWithTenant(
    { tenantId, personnelId: user.id, role: "tenant_admin" },
    () => fn(tenantId),
  );
}
