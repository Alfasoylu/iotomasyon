import { Settings } from "lucide-react";

import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { CompanySettingsForm } from "@/components/admin/company-settings-form";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { getCompanySettings } from "@/lib/get-company-settings";

export const dynamic = "force-dynamic";

export default async function CompanySettingsPage() {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);
  const cs = await getCompanySettings();

  // Form sadece DB tarafında olan field'ları gönderir (branding hariç).
  const initial = {
    companyName: cs.companyName,
    legalName: cs.legalName,
    tagline: cs.tagline,
    salesContact: cs.salesContact,
    website: cs.website,
    email: cs.email,
    phone: cs.phone,
    phoneSecondary: cs.phoneSecondary,
    address: cs.address,
    perpaAddress: cs.perpaAddress,
    city: cs.city,
    district: cs.district,
    country: cs.country,
    taxOffice: cs.taxOffice,
    taxNumber: cs.taxNumber,
    bankName: cs.bankName,
    bankIban: cs.bankIban,
    bankAccountHolder: cs.bankAccountHolder,
    bankAccountType: cs.bankAccountType,
    paymentTerms: cs.paymentTerms,
    deliveryTerms: cs.deliveryTerms,
    warrantyTerms: cs.warrantyTerms,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Settings}
        breadcrumb={[
          { label: "Sistem", href: "/admin/users" },
          { label: "Şirket Bilgileri" },
        ]}
        title="Şirket Bilgileri & Default Ticari Koşullar"
        subtitle="Buradaki bilgiler katalog PDF'lerinde, teklif PDF'lerinde ve müşteri-facing yerlerde gösterilir. Quote başına özel koşul girersen oradaki öncelik kazanır."
      />

      <Card className="p-6">
        <CompanySettingsForm initial={initial} />
      </Card>
    </div>
  );
}
