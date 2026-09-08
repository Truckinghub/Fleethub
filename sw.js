// FleetHub service worker - handles push notifications, plus a minimal
// fetch handler (required by Chrome for the app to be truly installable,
// not just push). No asset caching, so the app always loads the latest
// version and never shows a stale copy.

self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (event) => { event.waitUntil(self.clients.claim()); });

// A fetch handler is required for Chrome to treat this as a real installable
// PWA - this just passes every request straight through to the network.
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

self.addEventListener("push", (event) => {
  let data = { title: "FleetHub", body: "You have a new reminder." };
  try { if (event.data) data = event.data.json(); } catch (e) { /* use default */ }

  event.waitUntil(
    self.registration.showNotification(data.title || "FleetHub", {
      body: data.body || "",
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      data: { url: data.url || "./index.html" }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "./index.html";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("index.html") && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
