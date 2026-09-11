import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Varsayılan 1 MB. Aşan istek sunucu koduna ULAŞMADAN reddediliyor ve
      // tarayıcı 404 görüyor — log'a hiçbir şey düşmediği için teşhisi zor.
      // 4 MB seçildi çünkü Vercel'de istek gövdesi ~4,5 MB'ta zaten duvara
      // çarpıyor; daha yükseği yazmak sınırı taşımaz, sadece gizler.
      // Asıl çözüm istemcide küçültme: lib/urun-aday/gorsel-kucult.ts
      bodySizeLimit: "4mb",
    },
  },
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
