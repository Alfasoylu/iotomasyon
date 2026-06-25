import type { MetadataRoute } from "next";

/**
 * sitemap.xml — yalnızca public (indexlenebilir) sayfalar.
 * Şimdilik tek sayfa: PDKS satış landing'i (kök). Faz 2'de pazarlama
 * alt-sayfaları (fiyatlar, kvkk, mesafeli satış vb.) eklenince buraya girer.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://iotomasyon.com/",
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
