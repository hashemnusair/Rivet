const SHELL_CACHE = "rivet-member-shell-v2";
// Presentation only: no identity, token, membership, receipt or entry-code data.
const LOCALE_CACHE_KEY = "/_rivet/offline-language";
let currentLocale;
let localeWrite = Promise.resolve();

self.addEventListener("message", (event) => {
  const locale = event.data?.locale;
  if (event.data?.type !== "rivet:ui-locale" || (locale !== "en" && locale !== "ar")) return;
  currentLocale = locale;
  localeWrite = localeWrite.catch(() => undefined).then(async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.put(LOCALE_CACHE_KEY, new Response(locale));
  });
  event.waitUntil(localeWrite);
});

async function offlineFallback() {
  const cache = await caches.open(SHELL_CACHE);
  const response = await cache.match("/offline");
  if (!response) return Response.error();
  const saved = currentLocale ?? await (await cache.match(LOCALE_CACHE_KEY))?.text();
  const locale = saved === "ar" ? "ar" : "en";
  const html = (await response.text()).replace(/<html lang="(?:en|ar)" dir="(?:ltr|rtl)">/, `<html lang="${locale}" dir="${locale === "ar" ? "rtl" : "ltr"}">`);
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

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
    event.respondWith(fetch(event.request).catch(offlineFallback));
    return;
  }
  if (PUBLIC_SHELL.includes(url.pathname)) event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request)));
});

self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : {};
  const href = typeof payload.href === "string" && payload.href.startsWith("/customer/") ? payload.href : "/customer/my-gyms";
  event.waitUntil(self.registration.showNotification(payload.title || "RIVET", { body: payload.body || (payload.locale === "ar" ? "لديك تحديث جديد في حساب العضو." : "You have a new member update."), lang: payload.locale === "ar" ? "ar" : "en", dir: payload.locale === "ar" ? "rtl" : "ltr", icon: "/icon.png", badge: "/brand/rivet-glyph.png", data: { href }, tag: payload.tag || "rivet-member-update" }));
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
