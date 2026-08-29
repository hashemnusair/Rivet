const SHELL_CACHE = "rivet-member-shell-v1";
const PUBLIC_SHELL = ["/offline", "/brand/rivet-glyph.png", "/icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(PUBLIC_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("rivet-member-shell-") && key !== SHELL_CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/offline")));
    return;
  }
  if (PUBLIC_SHELL.includes(url.pathname)) event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request)));
});

self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : {};
  const href = typeof payload.href === "string" && payload.href.startsWith("/customer/") ? payload.href : "/customer/my-gyms";
  event.waitUntil(self.registration.showNotification(payload.title || "RIVET", { body: payload.body || "You have a new member update.", icon: "/icon.png", badge: "/brand/rivet-glyph.png", data: { href }, tag: payload.tag || "rivet-member-update" }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/customer/my-gyms";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => "focus" in client);
    if (existing) { existing.navigate(href); return existing.focus(); }
    return self.clients.openWindow(href);
  }));
});
