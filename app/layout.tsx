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
    default: "Alfa Soylu Elektronik — B2B Toptan Katalog",
    template: "%s | iotomasyon",
  },
  description:
    "Güvenlik kameraları, elektronik sistemler ve montaj çözümleri. B2B toptan katalog, fiyat teklifi ve dijital sipariş yönetimi.",
  applicationName: "iotomasyon",
  openGraph: {
    type: "website",
    locale: "tr_TR",
    siteName: "Alfa Soylu Elektronik",
    title: "Alfa Soylu Elektronik — B2B Toptan Katalog",
    description:
      "Güvenlik kameraları, elektronik sistemler ve montaj çözümleri. B2B toptan katalog ve fiyat teklifi.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Alfa Soylu Elektronik — B2B Toptan Katalog",
    description:
      "Güvenlik kameraları ve elektronik sistemler. B2B toptan + montaj.",
  },
  robots: {
    index: false,
    follow: false,
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
