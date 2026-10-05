// Ghosted's service worker: phone notifications only (Web Push). It doesn't cache pages or files,
// so a new deploy is always picked up straight away. See src/lib/push.ts.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// A push from the API (backend/src/push.ts): { title, body, url, tag }.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  const title = data.title || "Ghosted";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "You have a new notification.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "ghosted",
    renotify: true,
    data: { url: data.url || "/dashboard" },
  }));
});

// Tapping it: bring an open Ghosted window forward and go to the page, or open one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data && event.notification.data.url ? event.notification.data.url : "/dashboard", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of windows) {
      if (new URL(w.url).origin === self.location.origin) {
        await w.focus();
        if ("navigate" in w) { try { await w.navigate(target); } catch { /* cross-scope: leave it focused */ } }
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});

// The push service rotated this device's subscription: nothing to do here; the page re-saves it
// the next time it opens (src/lib/push.ts keeps the server in sync).
self.addEventListener("pushsubscriptionchange", () => {});
