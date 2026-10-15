// Offline cache for the app shell. Pay data never passes through here; it lives in the browser's localStorage.
const CACHE = "pxr-v46";
const SHELL = ["./", "index.html", "ocr.js", "photo.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" }))))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
const cached = req => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("index.html"));
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const same = new URL(req.url).origin === location.origin;
  // Network first so updates show up; fall back to the saved copy when offline or if the server returns an error page.
  e.respondWith(
    fetch(req).then(r => {
      if (same && r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      if (same && req.mode === "navigate" && !r.ok) return cached(req).then(c => c || r);
      return r;
    }).catch(() => cached(req))
  );
});
