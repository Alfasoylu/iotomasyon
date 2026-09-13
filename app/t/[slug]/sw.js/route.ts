// Tenant-bazlı (/t/{slug}) Service Worker — Web Push + bildirim tıklama.
// /personel/sw.js ile aynı davranış; yalnızca scope ve varsayılan URL tenant'a göre.
// Service-Worker-Allowed başlığı, SW'nin `/t/{slug}` (eğik çizgisiz sayfa dahil)
// scope'unu almasını sağlar.

import { prisma } from "@/lib/prisma";
import { SLUG_RE } from "@/lib/pdks/slug";

export const dynamic = "force-dynamic";

/**
 * `base` JS gövdesine JSON.stringify ile gömülür (string literal olarak); slug
 * ayrıca SLUG_RE ile doğrulanmış olduğundan yalnız [a-z0-9-] içerir.
 */
function swSource(base: string): string {
  const baseLit = JSON.stringify(base);
  return `// generated for ${base}
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const BASE = ${baseLit};

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  const title = data.title || "Devam Takip";
  const options = {
    body: data.body || "",
    icon: "/personel/icon-192.png",
    badge: "/personel/icon-192.png",
    data: { url: data.url || BASE },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || BASE;
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if ((client.url.includes(BASE) || client.url.includes("/personel")) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // Slug biçimi geçersiz ya da tenant yok/pasif → 404 (JS gövdesine hiçbir şey
  // interpolasyon edilmeden önce).
  if (!SLUG_RE.test(slug)) return new Response("Not found", { status: 404 });
  const tenant = await prisma.pdksTenant.findUnique({
    where: { slug },
    select: { isActive: true },
  });
  if (!tenant || !tenant.isActive) return new Response("Not found", { status: 404 });

  const base = `/t/${slug}`;
  return new Response(swSource(base), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Service-Worker-Allowed": base,
      "Cache-Control": "no-cache",
    },
  });
}
