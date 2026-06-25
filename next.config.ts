import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Personel ekranı /pdks'ten /personel'e taşındı; eski linkler/QR çalışsın.
      { source: "/pdks", destination: "/personel", permanent: true },
    ];
  },
  async headers() {
    return [
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
