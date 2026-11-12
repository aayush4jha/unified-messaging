/*
 * Orbit service worker
 * - Offline app shell: pages are network-first (fresh when online) and fall
 *   back to the last good copy, then to /offline. Your workspace itself lives
 *   in local storage, so a cached shell opens straight into your inbox.
 * - Hashed build assets (/_next/static) are cache-first; icons are
 *   stale-while-revalidate. API calls, auth and cross-origin requests are
 *   never touched.
 * - Web Push: shows notifications and routes taps to the conversation.
 */
const VERSION = "orbit-v1";
const PAGES = `${VERSION}-pages`;
const ASSETS = `${VERSION}-assets`;
const SHELL_PAGES = ["/inbox", "/offline"];
const SHELL_FILES = ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/badge-96.png"];
const NEVER_CACHE = /^\/(api|auth|login)(\/|$)/;
const MAX_ASSETS = 400;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await Promise.all(SHELL_PAGES.map(warm));
      const assets = await caches.open(ASSETS);
      await Promise.all(SHELL_FILES.map((url) => assets.add(new Request(url, { cache: "reload" })).catch(() => undefined)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (!key.startsWith(VERSION)) await caches.delete(key);
      await trim(ASSETS, MAX_ASSETS);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || NEVER_CACHE.test(url.pathname)) return;
  // RSC payloads and prefetches are handled by Next's own offline retry.
  if (req.headers.get("RSC") || url.searchParams.has("_rsc")) return;

  if (req.mode === "navigate") {
    event.respondWith(page(event));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (url.pathname.startsWith("/icons/") || url.pathname.startsWith("/screenshots/") || url.pathname === "/manifest.webmanifest" || url.pathname === "/apple-icon.png") {
    event.respondWith(staleWhileRevalidate(req, event));
  }
});

async function page(event) {
  const url = new URL(event.request.url);
  const key = url.origin + url.pathname; // query strings are client-side state (?c=, ?folder=)
  const cache = await caches.open(PAGES);
  try {
    const res = await fetchWithTimeout(event.request, 6000);
    if (res.ok && res.type === "basic" && !res.redirected) event.waitUntil(cache.put(key, res.clone()));
    return res;
  } catch {
    return (await cache.match(key)) || (await cache.match("/offline")) || Response.error();
  }
}

/** Caches a page and the build assets it references, so it can boot with no network. */
async function warm(path) {
  try {
    const res = await fetch(new Request(path, { cache: "reload", credentials: "include" }));
    if (!res.ok || res.redirected || res.type !== "basic") return;
    const html = await res.clone().text();
    await (await caches.open(PAGES)).put(new URL(path, self.location.origin).href, res);
    const assets = await caches.open(ASSETS);
    const urls = [...new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || [])].slice(0, 150);
    for (const url of urls) if (!(await assets.match(url))) await assets.add(url).catch(() => undefined);
  } catch {
    /* offline or server error: keep the previous copy */
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone()).catch(() => undefined);
  return res;
}

async function staleWhileRevalidate(req, event) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req);
  const refresh = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone()).catch(() => undefined);
      return res;
    })
    .catch(() => hit);
  if (hit) {
    event.waitUntil(refresh);
    return hit;
  }
  return (await refresh) || Response.error();
}

function fetchWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(req).then(
      (res) => (clearTimeout(timer), resolve(res)),
      (err) => (clearTimeout(timer), reject(err)),
    );
  });
}

async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(key);
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  // The page reports the build assets it loaded before this worker took control.
  if (data.type === "cache-urls" && Array.isArray(data.urls)) {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(ASSETS);
        for (const raw of data.urls.slice(0, 200)) {
          const url = new URL(raw, self.location.origin);
          if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/") && !(await cache.match(url.href))) {
            await cache.add(url.href).catch(() => undefined);
          }
        }
      })(),
    );
  }
  if (data.type === "cache-pages" && Array.isArray(data.paths)) {
    const paths = data.paths.filter((p) => typeof p === "string" && p.startsWith("/") && !p.startsWith("//") && !NEVER_CACHE.test(p)).slice(0, 12);
    event.waitUntil(Promise.all(paths.map(warm)));
  }
});

/* ---------------------------------------------------------------- Push */

const isAppleWebKit = /AppleWebKit/.test(self.navigator.userAgent) && !/Chrome|Chromium|Edg|Android/.test(self.navigator.userAgent);

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Orbit", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const focused = windows.find((w) => w.focused && w.visibilityState === "visible");
      // Already looking at Orbit: the app shows its own toast. (Safari requires a visible notification for every push.)
      if (focused && !isAppleWebKit) {
        focused.postMessage({ type: "push", payload: data });
        return;
      }
      await self.registration.showNotification(data.title || "Orbit", {
        body: data.body || "",
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        tag: data.tag || undefined,
        renotify: Boolean(data.tag),
        timestamp: data.ts || Date.now(),
        data: { url: data.url || "/inbox" },
      });
      if (typeof data.unread === "number" && self.navigator.setAppBadge) {
        await (data.unread > 0 ? self.navigator.setAppBadge(data.unread) : self.navigator.clearAppBadge()).catch(() => undefined);
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/inbox", self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        existing.postMessage({ type: "navigate", url: target.pathname + target.search });
        return;
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription;
      const key = old && old.options && old.options.applicationServerKey;
      if (!key) return;
      const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await fetch("/api/push", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), replaces: old.endpoint }),
      });
    })(),
  );
});
