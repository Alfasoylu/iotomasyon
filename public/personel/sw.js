// Personel Devam Takip Service Worker (/personel scope) — Web Push + bildirim tıklama.
// Offline kabuk minimaldir; check-in/out ağ gerektirir (konum + sunucu kararı).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Devam Takip";
  const options = {
    body: data.body || "",
    icon: "/personel/icon-192.png",
    badge: "/personel/icon-192.png",
    data: { url: data.url || "/personel" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/personel";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("/personel") && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
