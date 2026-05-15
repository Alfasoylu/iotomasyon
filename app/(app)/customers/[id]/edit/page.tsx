import { notFound } from "next/navigation";

import { CustomerForm } from "@/components/customers/customer-form";
import { Card } from "@/components/ui/card";
import { getLocations } from "@/lib/turkey-locations";
import { listAttributes } from "@/services/attribute-service";
import { getCustomerById, listUsersForSelect } from "@/services/customer-service";
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
  const [{ databaseAvailable, customer }, users, allAttributes] = await Promise.all([
    getCustomerById(id),
    listUsersForSelect(),
    listAttributes(),
  ]);
  const { cities, districtsByCity } = getLocations();

  if (!databaseAvailable) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Müşteriler
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Müşteri düzenleme geçici olarak kullanılamıyor
          </h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Veritabanı bağlantısı şu anda kullanılamıyor. Bağlantı geri geldiğinde
            bu ekran tekrar kullanılabilir olacak.
          </p>
        </div>

        <Card className="border-amber-200 bg-amber-50 p-6 text-sm leading-7 text-amber-900">
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
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          Müşteriler
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Müşteri düzenle
        </h1>
        <p className="mt-2 text-sm leading-7 text-slate-600">
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
            name:      customer.name,
            company:   customer.company   ?? "",
            phone:     customer.phone     ?? "",
            whatsapp:  customer.whatsapp  ?? "",
            email:     customer.email     ?? "",
            taxNumber: customer.taxNumber ?? "",
            address:   customer.address   ?? "",
            city:      customer.city      ?? "",
            district:  customer.district  ?? "",
            notes:     customer.customerNotes ?? "",
            status:    customer.status,
            source:    customer.source    ?? "",
            ownedById: customer.ownedById ?? "",
          }}
          cities={cities}
          districtsByCity={districtsByCity}
        />
      </Card>
    </div>
  );
}
