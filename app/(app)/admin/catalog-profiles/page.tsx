import { FolderTree } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { CatalogProfilesManager } from "@/components/admin/catalog-profiles-manager";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function CatalogProfilesPage() {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  const [profileRows, categoryRows, industryRows] = await Promise.all([
    prisma.catalogProfile.findMany({
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    }),
    prisma.productCategory.findMany({
      where: { parentId: null },
      select: {
        slug: true,
        name: true,
        _count: { select: { products: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.industry.findMany({
      select: {
        slug: true,
        name: true,
        _count: { select: { customers: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const profiles = profileRows.map((p) => ({
    slug: p.slug,
    title: p.title,
    subtitle: p.subtitle,
    categorySlugs: p.categorySlugs,
    defaultPriceMode: p.defaultPriceMode as "wholesale" | "retail" | "hidden",
    enabled: p.enabled,
    sortOrder: p.sortOrder,
  }));

  const categories = categoryRows.map((c) => ({
    slug: c.slug,
    name: c.name,
    productCount: c._count.products,
  }));

  const industries = industryRows.map((i) => ({
    slug: i.slug,
    name: i.name,
    customerCount: i._count.customers,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        icon={FolderTree}
        breadcrumb={[
          { label: "Sistem", href: "/admin/users" },
          { label: "Katalog Profilleri" },
        ]}
        title="Katalog Profilleri"
        subtitle="Her sektör (Industry) için hangi kategorilerin müşteriye gönderileceğini buradan yönet. Nalbur sektörü için musluk + el aleti, elektrikçi için aydınlatma + güç vb."
      />

      <Card className="p-6">
        <CatalogProfilesManager
          profiles={profiles}
          categories={categories}
          industries={industries}
        />
      </Card>
    </div>
  );
}
