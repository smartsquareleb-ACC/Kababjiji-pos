// Keeps the app on the phone so it opens with no internet (through power and internet cuts).
// Data is not handled here: Firestore keeps its own copy on the phone and uploads saves by itself.
const V = "__V__", CACHE = "kababjiji-" + V;
const CDN = ["https://www.gstatic.com/firebasejs/", "https://fonts.googleapis.com/", "https://fonts.gstatic.com/"];

// On install, save the page and every file it loads.
self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    const res = await fetch("./", { cache: "no-store" });
    const html = await res.clone().text();
    await c.put("./", res);
    const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]).filter(u => !u.startsWith("#"));
    const extra = ["assets/logo.png", "assets/logo-mark.png", "assets/icon-192.png"];
    await Promise.all([...new Set([...urls, ...extra])].map(u => c.add(new Request(u, { mode: u.startsWith("http") ? "no-cors" : "same-origin" })).catch(() => {})));
    self.skipWaiting();
  })());
});

// A new version deletes the old copy.
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("kababjiji-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const timeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("slow")), ms))]);

self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET") return;
  const same = u.origin === location.origin;
  if (!same && !CDN.some(x => r.url.startsWith(x))) return; // Firestore, sign-in, WhatsApp: straight to the internet
  if (same && (u.pathname.endsWith("/version.txt") || u.pathname.endsWith("/sw.js") || u.pathname.startsWith("/__/"))) return;
  // The page itself: the internet first (for updates), the saved copy if there's no signal or it's slow.
  if (r.mode === "navigate") {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try { const res = await timeout(fetch(r), 3000); if (res.ok && u.pathname === "/") c.put("./", res.clone()); return res; }
      catch (err) { return (await c.match("./")) || Response.error(); }
    })());
    return;
  }
  // Files: the saved copy at once, refreshed in the background.
  e.respondWith((async () => {
    const c = await caches.open(CACHE), hit = await c.match(r);
    const net = fetch(r).then(res => { if (res.ok || res.type === "opaque") c.put(r, res.clone()); return res; });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net;
  })());
});
