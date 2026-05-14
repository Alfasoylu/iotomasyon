import { CustomerForm } from "@/components/customers/customer-form";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default function NewCustomerPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          Customers
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Yeni musteri olustur
        </h1>
        <p className="mt-2 text-sm leading-7 text-slate-600">
          Yeni musteri kaydi ekleyerek satis takibini merkezilesin.
        </p>
      </div>

      <Card className="p-6">
        <CustomerForm mode="create" />
      </Card>
    </div>
  );
}
