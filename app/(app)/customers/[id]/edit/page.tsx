import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomerForm } from "@/components/customers/customer-form";
import { Card } from "@/components/ui/card";
import { getLocations } from "@/lib/turkey-locations";
import { listAttributes } from "@/services/attribute-service";
import { getCustomerById, listUsersForSelect } from "@/services/customer-service";
import { getCustomerFilterOptions } from "@/services/customer-filter-options-service";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission(PERMISSIONS.CUSTOMERS_UPDATE);
  const { id } = await params;
  const [{ databaseAvailable, customer }, users, allAttributes, filterOptions] = await Promise.all([
    getCustomerById(id),
    listUsersForSelect(),
    listAttributes(),
    getCustomerFilterOptions(),
  ]);
  const { cities, districtsByCity } = getLocations();

  if (!databaseAvailable) {
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
            Müşteri düzenleme geçici olarak kullanılamıyor
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
            Veritabanı bağlantısı şu anda kullanılamıyor. Bağlantı geri geldiğinde
            bu ekran tekrar kullanılabilir olacak.
          </p>
        </div>

        <Card className="border-[var(--warn-border)] bg-[var(--warn-dim)] p-6 text-sm leading-relaxed text-[var(--warn)]">
          Veritabanına ulaşılamadığı için müşteri düzenleme formu yüklenemedi.
        </Card>
      </div>
    );
  }

  if (!customer) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <nav className="flex flex-wrap items-center gap-1 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
          <Link href="/customers" className="transition hover:text-[var(--text-primary)]">
            ← Müşteriler
          </Link>
          <span className="text-[var(--border-default)]">/</span>
          <Link
            href={`/customers/${customer.id}`}
            className="max-w-[280px] truncate normal-case tracking-normal text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
            title={customer.name}
          >
            {customer.name}
          </Link>
        </nav>
        <h1 className="mt-3 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
          Müşteri düzenle
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
          Müşteri iletişim kaydını ve satış durumunu güncelleyin.
        </p>
      </div>

      <Card className="p-6">
        <CustomerForm
          mode="edit"
          customerId={customer.id}
          users={users}
          allAttributes={allAttributes}
          initialAttributeIds={customer.attributeInterests.map((ai) => ai.attributeId)}
          initialValues={{
            name:                  customer.name,
            company:               customer.company      ?? "",
            phone:                 customer.phone        ?? "",
            whatsapp:              customer.whatsapp     ?? "",
            email:                 customer.email        ?? "",
            taxNumber:             customer.taxNumber    ?? "",
            address:               customer.address      ?? "",
            city:                  customer.city         ?? "",
            district:              customer.district     ?? "",
            notes:                 customer.customerNotes ?? "",
            status:                customer.status,
            source:                customer.source       ?? "",
            ownedById:             customer.ownedById    ?? "",
            customerType:          customer.customerType ?? "",
            monthlySalesPotential: customer.monthlySalesPotential != null
              ? String(customer.monthlySalesPotential)
              : "",
            platformNotes:         customer.platformNotes ?? "",
            industryId:            customer.industryId ?? "",
            usedTech:              customer.usedTech ?? [],
            currentSupplier:       customer.currentSupplier ?? "",
          }}
          cities={cities}
          districtsByCity={districtsByCity}
          industryGroups={filterOptions.industryGroups}
        />
      </Card>
    </div>
  );
}
