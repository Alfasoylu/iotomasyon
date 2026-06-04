/**
 * Şirket sabitleri — fiyat teklifi PDF, müşteri detay footer ve diğer ihracata bağlı yerlerde kullanılır.
 * Logo: public/soylu-logo.png (ASCII-only — UTF-8 NFC/NFD farklarından kaçınmak için).
 */
export const COMPANY_SETTINGS = {
  // Marka
  companyName:    "ALFA SOYLU ELEKTRONİK",
  legalName:      "ALFA SOYLU ELEKTRONİK BASIM VE İNŞAAT SANAYİ TİCARET LİMİTED ŞİRKETİ",
  tagline:        "Güvenlik Kameraları ve Elektronik Sistemler · Toptan + Montaj",
  salesContact:   "Satış Departmanı",

  // İletişim
  website:        "soyluelektronik.com",
  email:          "destek@soyluelektronik.com",
  phone:          "0850 307 7397",
  phoneSecondary: "0543 871 6900",

  // Adresler
  address:        "Yedikule Çırpıcı Yolu Cad., Maltepe Mh., Topkapı Tic. Merkezi 2. Kısım No:4, Cevizlibağ, Zeytinburnu / İstanbul",
  perpaAddress:   "Perpa Ticaret Merkezi A Blok Kat:8 No:758, Şişli / İstanbul",
  city:           "İstanbul",
  district:       "Zeytinburnu",
  country:        "Türkiye",

  // Vergi
  taxOffice:      "DAVUTPAŞA",
  taxNumber:      "0510811231",

  // Banka
  bankName:       "Ziraat Bankası",
  bankIban:       "TR12 0001 0025 8696 1728 4950 01",
  bankAccountHolder: "ALFA SOYLU ELEKTRONİK BASIM VE İNŞAAT SANAYİ TİCARET LİMİTED ŞİRKETİ",
  bankAccountType:"TL Hesabı",

  // Teklif şartları (default)
  paymentTerms:   "%50 peşin sipariş onayında, %50 sevkiyat öncesi havale/EFT. Sipariş onaylanmadan üretim/sevkiyat başlamaz.",
  deliveryTerms:  "Stoklu ürünlerde 1-3 iş günü içinde sevkiyat. İthal ürünlerde tedarik süresi sipariş anında teyit edilir.",
  warrantyTerms:  "Ürünler 2 yıl üretici garantisi kapsamındadır. Garanti dışı durumlar üretici şartlarına göre değerlendirilir.",

  // Görsel — ASCII-only path (eski "Soylu logo şeffaf.png" da public/'te kopya olarak bulunur)
  logoUrl:        "/soylu-logo.png",
  logoUrlAlt:     "/soylu elektronik logo.png",
  brandColor:     "#F97316",
  accentColor:    "#F97316",
} as const;
