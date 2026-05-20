import { ListPlus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { LeadListImporter } from "@/components/customers/lead-list-importer";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function LeadListImportPage() {
  await requirePermission(PERMISSIONS.CUSTOMERS_UPDATE);

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        icon={ListPlus}
        breadcrumb={[
          { label: "Satış" },
          { label: "Müşteriler", href: "/customers" },
          { label: "Lead Listesi Import" },
        ]}
        title="Lead Listesi Import"
        subtitle="Google Maps'ten topladığın firma listesini yükle. CSV upload veya satır satır yapıştırarak — telefon dedup + otomatik tag uygulanır."
      />

      <LeadListImporter />
    </div>
  );
}
