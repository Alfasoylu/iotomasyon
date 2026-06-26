// Tenant-bazlı (/t/{slug}) Service Worker — Web Push + bildirim tıklama.
// /personel/sw.js ile aynı davranış; yalnızca scope ve varsayılan URL tenant'a göre.
// Service-Worker-Allowed başlığı, SW'nin `/t/{slug}` (eğik çizgisiz sayfa dahil)
// scope'unu almasını sağlar.

export const dynamic = "force-dynamic";

function swSource(base: string): string {
  return `// generated for ${base}
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  const title = data.title || "Devam Takip";
  const options = {
    body: data.body || "",
    icon: "/personel/icon-192.png",
    badge: "/personel/icon-192.png",
    data: { url: data.url || "${base}" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "${base}";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if ((client.url.includes("${base}") || client.url.includes("/personel")) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const base = `/t/${slug}`;
  return new Response(swSource(base), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Service-Worker-Allowed": base,
      "Cache-Control": "no-cache",
    },
  });
}
