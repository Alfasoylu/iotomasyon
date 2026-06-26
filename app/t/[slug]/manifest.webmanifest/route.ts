import { prisma } from "@/lib/prisma";

// Tenant-bazlı (/t/{slug}) PWA manifest'i — çalışanlar şirketlerine ait branded
// uygulamayı "Ana Ekrana Ekle" ile kurar. start_url/scope tenant yoluna sabitlenir.

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await prisma.pdksTenant.findUnique({
    where: { slug },
    select: { name: true },
  });
  const name = tenant?.name ?? "Personel Devam Takip";
  const base = `/t/${slug}`;

  const manifest = {
    name: `${name} — Devam Takip`,
    short_name: name.slice(0, 12),
    description: `${name} personel devam takip uygulaması`,
    start_url: base,
    scope: base,
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    icons: [
      { src: "/personel/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/personel/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/personel/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
