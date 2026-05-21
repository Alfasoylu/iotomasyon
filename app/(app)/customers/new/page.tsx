import Link from "next/link";

import { CustomerForm } from "@/components/customers/customer-form";
import { Card } from "@/components/ui/card";
import { listAttributes, getProductAttributeIds } from "@/services/attribute-service";
import { listUsersForSelect } from "@/services/customer-service";
import { getCustomerFilterOptions } from "@/services/customer-filter-options-service";
import { getLocations } from "@/lib/turkey-locations";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission(PERMISSIONS.CUSTOMERS_CREATE);
  const params = await searchParams;
  const productId  = typeof params.productId  === "string" ? params.productId  : undefined;
  const categoryId = typeof params.categoryId === "string" ? params.categoryId : undefined;
  const [users, allAttributes, preselectedAttrIds, filterOptions] = await Promise.all([
    listUsersForSelect(),
    listAttributes(),
    productId ? getProductAttributeIds(productId) : Promise.resolve([]),
    getCustomerFilterOptions(),
  ]);
  const { cities, districtsByCity } = getLocations();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/customers"
          className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
        >
          ← Müşteriler
        </Link>
        <h1 className="mt-3 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
          Yeni müşteri oluştur
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
          Yeni müşteri kaydı ekleyerek satış takibini merkezileştirin.
        </p>
      </div>

      <Card className="p-6">
        <CustomerForm
          mode="create"
          users={users}
          allAttributes={allAttributes}
          initialAttributeIds={preselectedAttrIds}
          preselectedProductId={productId}
          preselectedCategoryId={categoryId}
          cities={cities}
          districtsByCity={districtsByCity}
          industryGroups={filterOptions.industryGroups}
        />
      </Card>
    </div>
  );
}
