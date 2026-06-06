/**
 * Şirket bilgileri — singleton DB tablosundan okunur (CompanySettings).
 * Migration 20260606000100 ile hard-coded defaults seed olur, sonra
 * /admin/company-settings sayfasından düzenlenir.
 *
 * Görsel/teknik sabitler (logoUrl, brandColor, accentColor) DB'de değil —
 * deploy ile değişen değerler.
 *
 * Backward-compat: tip sabit kalır; eski `COMPANY_SETTINGS` import'ları
 * artık doğrudan kullanılmamalı, `getCompanySettings()` çağrılmalı. Ancak
 * sync export edilen FALLBACK_COMPANY_SETTINGS hâlâ defaults içerir (DB
 * okunamadığında veya client-side için).
 */

export interface CompanySettingsData {
  // Marka
  companyName: string;
  legalName: string;
  tagline: string;
  salesContact: string;
  // İletişim
  website: string;
  email: string;
  phone: string;
  phoneSecondary: string;
  // Adresler
  address: string;
  perpaAddress: string;
  city: string;
  district: string;
  country: string;
  // Vergi
  taxOffice: string;
  taxNumber: string;
  // Banka
  bankName: string;
  bankIban: string;
  bankAccountHolder: string;
  bankAccountType: string;
  // Default ticari koşullar
  paymentTerms: string;
  deliveryTerms: string;
  warrantyTerms: string;
}

export interface CompanyBranding {
  logoUrl: string;
  logoUrlAlt: string;
  brandColor: string;
  accentColor: string;
}

export const COMPANY_BRANDING: CompanyBranding = {
  logoUrl: "/soylu-logo.png",
  logoUrlAlt: "/soylu elektronik logo.png",
  brandColor: "#F97316",
  accentColor: "#F97316",
};

/**
 * Fallback hard-coded değerler — DB okunamadığında veya bootstrap'da kullanılır.
 * /admin/company-settings'ten düzenlenen değerler bu defaults'u override eder.
 */
export const FALLBACK_COMPANY_SETTINGS: CompanySettingsData = {
  companyName: "ALFA SOYLU ELEKTRONİK",
  legalName: "ALFA SOYLU ELEKTRONİK BASIM VE İNŞAAT SANAYİ TİCARET LİMİTED ŞİRKETİ",
  tagline: "Güvenlik Kameraları ve Elektronik Sistemler · Toptan + Montaj",
  salesContact: "Satış Departmanı",

  website: "soyluelektronik.com",
  email: "destek@soyluelektronik.com",
  phone: "0850 307 7397",
  phoneSecondary: "0543 871 6900",

  address: "Yedikule Çırpıcı Yolu Cad., Maltepe Mh., Topkapı Tic. Merkezi 2. Kısım No:4, Cevizlibağ, Zeytinburnu / İstanbul",
  perpaAddress: "Perpa Ticaret Merkezi A Blok Kat:8 No:758, Şişli / İstanbul",
  city: "İstanbul",
  district: "Zeytinburnu",
  country: "Türkiye",

  taxOffice: "DAVUTPAŞA",
  taxNumber: "0510811231",

  bankName: "Ziraat Bankası",
  bankIban: "TR12 0001 0025 8696 1728 4950 01",
  bankAccountHolder: "ALFA SOYLU ELEKTRONİK BASIM VE İNŞAAT SANAYİ TİCARET LİMİTED ŞİRKETİ",
  bankAccountType: "TL Hesabı",

  paymentTerms: "%50 peşin sipariş onayında, %50 sevkiyat öncesi havale/EFT. Sipariş onaylanmadan üretim/sevkiyat başlamaz.",
  deliveryTerms: "Stoklu ürünlerde 1-3 iş günü içinde sevkiyat. İthal ürünlerde tedarik süresi sipariş anında teyit edilir.",
  warrantyTerms: "Ürünler 2 yıl üretici garantisi kapsamındadır. Garanti dışı durumlar üretici şartlarına göre değerlendirilir.",
};

/**
 * BACKWARD COMPATIBILITY: Eski `COMPANY_SETTINGS` import'u + branding birleştirilmiş.
 * Yeni kod `getCompanySettings()` async helper'ı tercih etmeli — DB'den okunur.
 */
export const COMPANY_SETTINGS = {
  ...FALLBACK_COMPANY_SETTINGS,
  ...COMPANY_BRANDING,
} as const;
