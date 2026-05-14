import { notFound } from "next/navigation";

import { CustomerForm } from "@/components/customers/customer-form";
import { Card } from "@/components/ui/card";
import { listAttributes, getCustomerAttributeInterestIds } from "@/services/attribute-service";
import { getCustomerById, listUsersForSelect } from "@/services/customer-service";

export const dynamic = "force-dynamic";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [{ databaseAvailable, customer }, users, allAttributes, currentAttributeIds] = await Promise.all([
    getCustomerById(id),
    listUsersForSelect(),
    listAttributes(),
    getCustomerAttributeInterestIds(id),
  ]);

  if (!databaseAvailable) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Customers
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Musteri duzenleme gecici olarak kullanilamiyor
          </h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Veritabani baglantisi su anda kullanilamiyor. Baglanti geri geldiginde
            bu ekran tekrar kullanilabilir olacak.
          </p>
        </div>

        <Card className="border-amber-200 bg-amber-50 p-6 text-sm leading-7 text-amber-900">
          Veritabanina ulasilamadigi icin musteri duzenleme formu yuklenemedi.
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
          Customers
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Musteri duzenle
        </h1>
        <p className="mt-2 text-sm leading-7 text-slate-600">
          Musteri iletisim kaydini ve satis durumunu guncelleyin.
        </p>
      </div>

      <Card className="p-6">
        <CustomerForm
          mode="edit"
          customerId={customer.id}
          users={users}
          allAttributes={allAttributes}
          initialAttributeIds={currentAttributeIds}
          initialValues={{
            name:      customer.name,
            company:   customer.company   ?? "",
            phone:     customer.phone     ?? "",
            whatsapp:  customer.whatsapp  ?? "",
            email:     customer.email     ?? "",
            taxNumber: customer.taxNumber ?? "",
            address:   customer.address   ?? "",
            city:      customer.city      ?? "",
            country:   customer.country   ?? "",
            notes:     customer.customerNotes ?? "",
            status:    customer.status,
            source:    customer.source    ?? "",
            ownedById: customer.ownedById ?? "",
          }}
        />
      </Card>
    </div>
  );
}
