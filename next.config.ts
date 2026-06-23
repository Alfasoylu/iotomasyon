import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Personel ekranı /pdks'ten /personel'e taşındı; eski linkler/QR çalışsın.
      { source: "/pdks", destination: "/personel", permanent: true },
    ];
  },
};

export default nextConfig;
