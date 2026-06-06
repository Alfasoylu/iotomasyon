import "server-only";

import { prisma } from "@/lib/prisma";

import {
  COMPANY_BRANDING,
  FALLBACK_COMPANY_SETTINGS,
  type CompanySettingsData,
  type CompanyBranding,
} from "./company-settings";

/**
 * DB'den şirket bilgilerini oku — PDF generator'lar ve admin sayfası için.
 *
 * Cache: React cache() veya request-level memoization (Next.js otomatik halleder
 * çünkü her request kendi RSC tree'sini yapar; aynı request içinde Prisma sorgusu
 * dedupe olur).
 *
 * Hata durumunda fallback defaults döner — PDF üretimi bloke olmaz.
 */
export async function getCompanySettings(): Promise<CompanySettingsData & CompanyBranding> {
  try {
    const row = await prisma.companySettings.findUnique({
      where: { id: "default" },
    });
    if (!row) {
      return { ...FALLBACK_COMPANY_SETTINGS, ...COMPANY_BRANDING };
    }
    return {
      companyName: row.companyName,
      legalName: row.legalName,
      tagline: row.tagline,
      salesContact: row.salesContact,
      website: row.website,
      email: row.email,
      phone: row.phone,
      phoneSecondary: row.phoneSecondary,
      address: row.address,
      perpaAddress: row.perpaAddress,
      city: row.city,
      district: row.district,
      country: row.country,
      taxOffice: row.taxOffice,
      taxNumber: row.taxNumber,
      bankName: row.bankName,
      bankIban: row.bankIban,
      bankAccountHolder: row.bankAccountHolder,
      bankAccountType: row.bankAccountType,
      paymentTerms: row.paymentTerms,
      deliveryTerms: row.deliveryTerms,
      warrantyTerms: row.warrantyTerms,
      ...COMPANY_BRANDING,
    };
  } catch (err) {
    // DB'ye ulaşamazsa fallback — sessizce defaults'a düş, log
    // eslint-disable-next-line no-console
    console.error("getCompanySettings: DB read failed, using fallback", err);
    return { ...FALLBACK_COMPANY_SETTINGS, ...COMPANY_BRANDING };
  }
}
