import "server-only";

import { prisma } from "@/lib/prisma";
import { getPdksSession, type PdksSession } from "@/lib/pdks/auth";
import { runWithTenant } from "@/lib/pdks/context";

/**
 * Tenant-admin yetki kapısı: pdks_session'ı okur, rolü `tenant_admin` olmalı VE
 * oturumun tenantId'si verilen slug'ın tenant'ıyla eşleşmeli (başka tenant'ın
 * panelini açamasın). Uyuyorsa session'ı döner, yoksa null.
 */
export async function requireTenantAdminFor(slug: string): Promise<PdksSession | null> {
  const session = await getPdksSession();
  if (!session || session.role !== "tenant_admin") return null;
  const tenant = await prisma.pdksTenant.findUnique({ where: { slug }, select: { id: true } });
  if (!tenant || tenant.id !== session.tenantId) return null;
  return session;
}

/** Tenant-admin bağlamında çalıştırır → içeride `prismaPdks` session.tenantId'ye scoped. */
export function runAsTenantAdmin<T>(
  session: PdksSession,
  fn: (tenantId: string) => Promise<T>,
): Promise<T> {
  return runWithTenant(session, () => fn(session.tenantId));
}
