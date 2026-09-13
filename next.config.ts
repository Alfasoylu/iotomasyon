import type { NextConfig } from "next";

// Güvenlik header'ları (2026-09-14 güvenlik taraması).
// CSP bilinçli olarak eklenmedi: Next inline script'leri + Turnstile + PWA için
// nonce altyapısı gerekir; ayrı bir faz olarak planlanmalı.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Geolocation: PDKS konum doğrulamalı check-in için kendi origin'e izin verilir.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    return [
      // Personel ekranı /pdks'ten /personel'e taşındı; eski linkler/QR çalışsın.
      { source: "/pdks", destination: "/personel", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Service worker /personel/sw.js'nin /personel kapsamını alabilmesi için
        // (varsayılan azami kapsam /personel/ olur; eğik çizgisiz /personel sayfasını
        // kontrol edemez ve push kaydı 'scope url' hatası verirdi).
        source: "/personel/sw.js",
        headers: [{ key: "Service-Worker-Allowed", value: "/personel" }],
      },
    ];
  },
};

export default nextConfig;
