import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { prismaPdks } from "@/lib/pdks/prisma";
import { requireTenantAdminFor, runAsTenantAdmin } from "@/lib/pdks/tenant-admin";
import { TenantAdminPanel, type PPerson, type PWorksite } from "@/components/pdks/tenant/admin-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Yönetim Paneli",
  robots: { index: false, follow: false },
};

export default async function TenantAdminPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const session = await requireTenantAdminFor(slug);
  if (!session) {
    // Oturum yok / yetkisiz → tenant giriş ekranına.
    redirect(`/t/${slug}`);
  }

  const tenant = await prisma.pdksTenant.findUnique({ where: { slug }, select: { name: true } });

  const data = await runAsTenantAdmin(session, async () => {
    const [people, sites, links] = await Promise.all([
      prismaPdks.pdksPersonnel.findMany({ orderBy: { createdAt: "asc" } }),
      prismaPdks.pdksWorksite.findMany({ orderBy: { createdAt: "asc" } }),
      prismaPdks.pdksPersonnelWorksite.findMany({ select: { worksiteId: true, personnelId: true } }),
    ]);
    return { people, sites, links };
  });

  const assignedByWorksite = new Map<string, string[]>();
  for (const l of data.links) {
    const arr = assignedByWorksite.get(l.worksiteId) ?? [];
    arr.push(l.personnelId);
    assignedByWorksite.set(l.worksiteId, arr);
  }

  const personnel: PPerson[] = data.people.map((p) => ({
    id: p.id,
    fullName: p.fullName,
    phone: p.phone ?? "",
    expectedCheckIn: p.expectedCheckIn ?? "",
    expectedCheckOut: p.expectedCheckOut ?? "",
    isActive: p.isActive,
    hasDevice: !!p.deviceIdHash,
  }));

  const worksites: PWorksite[] = data.sites.map((w) => ({
    id: w.id,
    name: w.name,
    latitude: w.latitude,
    longitude: w.longitude,
    radiusMeters: w.radiusMeters,
    maxAccuracyMeters: w.maxAccuracyMeters,
    isActive: w.isActive,
    assignedIds: assignedByWorksite.get(w.id) ?? [],
  }));

  return (
    <TenantAdminPanel
      slug={slug}
      brand={tenant?.name ?? "Şirket"}
      personnel={personnel}
      worksites={worksites}
    />
  );
}
