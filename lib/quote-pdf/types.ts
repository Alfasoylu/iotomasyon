import "server-only";

import type { CompanyBranding, CompanySettingsData } from "@/lib/company-settings";

/**
 * Faz 1 — Modüler quote PDF generator type'ları
 *
 * QuotePdfData = service'ten gelen Prisma sonucunun PDF generator'un
 * ihtiyacı olan alt-kümesi. Prisma tipini doğrudan kullanmıyoruz çünkü
 * generator service-agnostic kalmalı (test/mock için).
 */

/**
 * Number(x) ile parse edilebilen herhangi bir değer.
 * Prisma `Decimal` (toString'i olan obje), JS `number`, ve `string` literal'leri kabul eder.
 */
export type Numeric = string | number | { toString(): string };

export interface QuotePdfCustomer {
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
}

export interface QuotePdfItem {
  description: string;
  quantity: number;
  unitPrice: Numeric;
  discount: Numeric;
  tax: Numeric;
  total: Numeric;
  currency: string;
  product: {
    name: string;
    sku: string;
  } | null;
}

export interface QuotePdfData {
  quoteNumber: string;
  status: string;
  createdAt: Date;
  validityDate: Date | null;
  notes: string | null;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  warrantyTerms: string | null;
  subtotal: Numeric;
  discountTotal: Numeric;
  taxTotal: Numeric;
  total: Numeric;
  currencyMode: string | null;
  exchangeRate: Numeric | null;
  customer: QuotePdfCustomer;
  items: QuotePdfItem[];
}

export interface QuotePdfOptions {
  quote: QuotePdfData;
  /**
   * Şirket bilgileri — caller `getCompanySettings()` ile DB'den okur ve geçer.
   * Verilmezse static fallback (`COMPANY_SETTINGS`) kullanılır.
   */
  companySettings?: CompanySettingsData & CompanyBranding;
}
