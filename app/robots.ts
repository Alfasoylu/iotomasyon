import type { MetadataRoute } from "next";

/**
 * robots.txt — yalnızca PDKS satış landing'i (kök) ve gelecekteki public
 * pazarlama sayfaları taranabilir. Dahili/özel rotalar kapalı.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/alfas",
        "/personel",
        "/login",
        "/c/",
        "/api/",
        "/admin",
        "/dashboard",
        "/customers",
        "/products",
        "/quotes",
        "/tasks",
        "/marketplace",
        "/warehouse",
        "/orders",
        "/categories",
        "/campaigns",
        "/activity",
        "/search",
        "/no-access",
        "/yardim",
      ],
    },
    sitemap: "https://iotomasyon.com/sitemap.xml",
  };
}
