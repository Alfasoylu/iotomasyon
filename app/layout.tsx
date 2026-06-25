import type { Metadata } from "next";

import "./globals.css";

/**
 * Root metadata.
 *
 * Favicon ve OG image'lar Next.js metadata file convention'ı ile çözülür:
 *   app/icon.png            → favicon (192×192, charcoal bg + Soylu logo)
 *   app/apple-icon.png      → iOS home screen icon (180×180)
 *   app/opengraph-image.png → WhatsApp / Twitter / Facebook link preview (1200×630)
 *   app/twitter-image.png   → Twitter Card (1200×630)
 *
 * Dosyaları scripts/generate-favicons.ts üretir (sharp ile soylu-logo.png'den).
 */
export const metadata: Metadata = {
  metadataBase: new URL("https://iotomasyon.com"),
  title: {
    default: "iotomasyon PDKS — Konum Doğrulamalı Personel Devam Takip",
    template: "%s | iotomasyon PDKS",
  },
  description:
    "Sahada personel giriş/çıkış takibi: konum doğrulamalı check-in, otomatik çıkış, izin yönetimi ve aylık puantaj. Kurulum gerektirmeyen PWA. Aylık abonelik.",
  applicationName: "iotomasyon PDKS",
  openGraph: {
    type: "website",
    locale: "tr_TR",
    siteName: "iotomasyon PDKS",
    title: "iotomasyon PDKS — Konum Doğrulamalı Personel Devam Takip",
    description:
      "Konum doğrulamalı check-in, otomatik çıkış, izin yönetimi ve aylık puantaj. Kurulum gerektirmeyen PWA.",
  },
  twitter: {
    card: "summary_large_image",
    title: "iotomasyon PDKS — Personel Devam Takip",
    description:
      "Konum doğrulamalı giriş/çıkış, otomatik çıkış, izin ve puantaj. Kurulum gerektirmez.",
  },
  // NOT: Kök (landing) artık Google'a AÇIK. Özel/auth-arkası rotalar
  // (/alfas, /personel, /login, panel, /c/*) kendi metadata'larında
  // noindex ile işaretlenmiştir.
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
