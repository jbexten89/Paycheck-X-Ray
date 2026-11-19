// Offline cache for the app shell. Pay data never passes through here; it lives in the browser's localStorage.
const CACHE = "pxr-v134";
const SHELL = ["./", "index.html", "head.js", "app.js", "ocr.js", "photo.js", "layout.js", "sw-register.js", "lib/fonts/nunito-sans-latin-opsz-normal.woff2", "manifest.webmanifest", "icon-v3.svg", "icon-192-v3.png", "icon-512-v3.png", "apple-touch-icon-v3.png"];
// The PDF and photo libraries in lib/ are saved the first time they are used.
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" }))))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
// Offline fallback: a missing page falls back to the app; a missing script or image does not.
const cached = req => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === "navigate" ? caches.match("index.html") : undefined));
const timeout = (ms, p) => new Promise((ok, no) => { const t = setTimeout(() => no(new Error("slow")), ms); p.then(v => { clearTimeout(t); ok(v); }, e => { clearTimeout(t); no(e); }); });
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  // Nothing should load from other sites (the page forbids it); leave any such request alone.
  if (new URL(req.url).origin !== location.origin) return;
  // Network first so updates show up. On a weak signal, don't wait more than 3 seconds before opening the saved copy.
  const net = fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    if (req.mode === "navigate" && !r.ok) return cached(req).then(c => c || r);
    return r;
  });
  e.respondWith(timeout(3000, net).catch(() => cached(req).then(c => c || net)));
});
