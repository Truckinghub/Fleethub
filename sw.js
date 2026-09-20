/* FleetHub service worker: offline app shell + push notifications.
   Keep this file next to index.html in the repo (same folder). */
const CACHE = "fleethub-shell-v3"; // bumped from v2 - forces old cached copies to be discarded on next load
const SHELL = ["./", "./index.html"];
const CDN_HOSTS = ["cdn.jsdelivr.net", "cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com", "docs.opencv.org"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)); }

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Never cache Supabase (data, auth, storage): those must always be live.
  if (url.hostname.endsWith("supabase.co")) return;

  // Page loads: network first (so new deploys show up), cached copy when offline or very slow.
  if (req.mode === "navigate") {
    event.respondWith(
      Promise.race([fetch(req), timeout(6000)])
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html").then((r) => r || caches.match("./")))
    );
    return;
  }

  // Libraries, fonts and same-origin files: serve from cache, refresh in the background.
  if (url.origin === self.location.origin || CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && (res.ok || res.type === "opaque")) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});

/* ---- Push notifications ----
   icon is the full-color logo shown in the expanded notification view.
   badge is specifically what Android's status bar uses, and it works
   differently: Android ignores the actual colors and renders every
   opaque pixel as a flat white silhouette, so badge needs its own
   file - a transparent-background, white-only version of the mark -
   rather than reusing the full-color icon (which was the actual cause
   of the white-square icon: the full-color file's solid background
   was being flattened into one big white block). */
const ICON_PATH = "./icons/icon-192.png";
const BADGE_PATH = "./icons/notification-badge.png";

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; }
  catch (e) { payload = { body: event.data ? event.data.text() : "" }; }
  const title = payload.title || "FleetHub";
  const options = {
    body: payload.body || payload.message || "You have a reminder.",
    tag: payload.tag || "fleethub-reminder",
    icon: payload.icon || ICON_PATH,
    badge: payload.badge || BADGE_PATH,
    data: { url: payload.url || "./" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ("focus" in c) return c.focus(); }
      return self.clients.openWindow(target);
    })
  );
});
