const CACHE_NAME = "team-venom-shell-v28";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=20261118-18",
  "./app.js?v=20261118-18",
  "./operations.js?v=20261118-18",
  "./operations.css?v=20261118-18",
  "./favicon.svg",
  "./manifest.webmanifest"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      // Prefer the live site so login fixes are not hidden behind an old cached shell.
      const response = await fetch(request);
      if (response.ok && [".html", ".js", ".css", ".svg", ".webmanifest"].some(extension => url.pathname.endsWith(extension))) {
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await cache.match(request);
      if (cached) return cached;
      if (request.mode === "navigate") {
        const offlinePage = await cache.match("./index.html");
        if (offlinePage) return offlinePage;
      }
      return Response.error();
    }
  })());
});

self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text() || "" }; }
  const emergency = payload.emergency === true;
  const title = emergency ? "🚨 EMERGENCY · " + (payload.title || "Team Venom") : (payload.title || "Team Venom");
  const options = {
    body: payload.body || "You have a new Team Venom update.",
    icon: payload.icon || "./favicon.svg",
    badge: payload.badge || "./favicon.svg",
    tag: payload.tag || "team-venom-update",
    renotify: true,
    requireInteraction: emergency,
    ...(emergency ? { vibrate: [300, 120, 300, 120, 600], silent: false } : {}),
    data: { ...(payload.data || { url: "./" }), emergency }
  };
  const tasks = [self.registration.showNotification(title, options)];
  if (emergency) tasks.push(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
    clientList.forEach(client => client.postMessage({ type: "TEAM_VENOM_EMERGENCY_ALERT" }));
  }));
  event.waitUntil(Promise.all(tasks));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "./", self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
    for (const client of clientList) {
      if ("focus" in client) {
        if ("navigate" in client && client.url !== target) client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  }));
});
