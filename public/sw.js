const APP_CACHE = "lyst-app-v6";
const META_CACHE = "lyst-meta-v6";

const CACHE_REFRESH_KEY = "/__lyst_cache_refresh__";
const CACHE_DURATION = 60 * 24 * 60 * 60 * 1000;

const CORE_FILES = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/iosLOGO.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((cache) => cache.addAll(CORE_FILES)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      deleteOldCaches(),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("message", (event) => {
  const messageType = event.data?.type;

  if (messageType === "REFRESH_OFFLINE_CACHE") {
    event.waitUntil(refreshCacheTimestamp());
  }

  if (messageType === "CLEAR_OFFLINE_CACHE") {
    event.waitUntil(clearLystCaches());
  }

  if (messageType === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  if (
    request.destination === "script" ||
    request.destination === "style"
  ) {
    event.respondWith(handleFreshStaticRequest(request));
    return;
  }

  if (
    request.destination === "image" ||
    request.destination === "font" ||
    request.destination === "manifest"
  ) {
    event.respondWith(handleCachedStaticRequest(request));
  }
});

async function handleNavigationRequest(request) {
  const expired = await hasCacheExpired();

  try {
    const networkResponse = await fetch(request, {
      cache: "no-store",
    });

    if (networkResponse.ok) {
      const cache = await caches.open(APP_CACHE);

      await cache.put("/index.html", networkResponse.clone());
      await cache.put("/", networkResponse.clone());
    }

    return networkResponse;
  } catch {
    if (expired) {
      return createExpiredOfflineResponse();
    }

    const cache = await caches.open(APP_CACHE);

    return (
      (await cache.match("/index.html")) ||
      (await cache.match("/")) ||
      createUnavailableOfflineResponse()
    );
  }
}

async function handleFreshStaticRequest(request) {
  const cache = await caches.open(APP_CACHE);

  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch {
    const cachedResponse = await cache.match(request);

    return (
      cachedResponse ||
      new Response("", {
        status: 503,
        statusText: "Offline",
      })
    );
  }
}

async function handleCachedStaticRequest(request) {
  const cache = await caches.open(APP_CACHE);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    refreshStaticFile(request, cache);
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch {
    return new Response("", {
      status: 503,
      statusText: "Offline",
    });
  }
}

function refreshStaticFile(request, cache) {
  fetch(request)
    .then(async (networkResponse) => {
      if (networkResponse.ok) {
        await cache.put(request, networkResponse.clone());
      }
    })
    .catch(() => {});
}

async function refreshCacheTimestamp() {
  const cache = await caches.open(META_CACHE);

  await cache.put(
    CACHE_REFRESH_KEY,
    new Response(String(Date.now()), {
      headers: {
        "Content-Type": "text/plain",
      },
    }),
  );
}

async function getCacheTimestamp() {
  const cache = await caches.open(META_CACHE);
  const response = await cache.match(CACHE_REFRESH_KEY);

  if (!response) return null;

  const timestamp = Number(await response.text());

  return Number.isFinite(timestamp) ? timestamp : null;
}

async function hasCacheExpired() {
  const timestamp = await getCacheTimestamp();

  if (!timestamp) return false;

  return Date.now() - timestamp > CACHE_DURATION;
}

async function deleteOldCaches() {
  const cacheNames = await caches.keys();

  await Promise.all(
    cacheNames
      .filter(
        (cacheName) =>
          cacheName.startsWith("lyst-") &&
          cacheName !== APP_CACHE &&
          cacheName !== META_CACHE,
      )
      .map((cacheName) => caches.delete(cacheName)),
  );
}

async function clearLystCaches() {
  const cacheNames = await caches.keys();

  await Promise.all(
    cacheNames
      .filter((cacheName) => cacheName.startsWith("lyst-"))
      .map((cacheName) => caches.delete(cacheName)),
  );
}

function createExpiredOfflineResponse() {
  return createOfflinePage(
    "Connect to continue",
    "Your 60-day offline access period has expired. Connect to the internet and reopen Lyst.",
  );
}

function createUnavailableOfflineResponse() {
  return createOfflinePage(
    "Lyst is not available offline yet",
    "Open Lyst while connected to the internet first, then try again.",
  );
}

function createOfflinePage(title, message) {
  return new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">

    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
    >

    <meta name="theme-color" content="#FFF8F4">

    <title>Lyst</title>

    <style>
      * {
        box-sizing: border-box;
      }

      body {
        min-height: 100vh;
        min-height: 100dvh;
        margin: 0;
        display: grid;
        place-items: center;
        padding: 24px;
        color: #3B3650;
        background: #FFF8F4;
        font-family:
          "Avenir Next",
          Avenir,
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          sans-serif;
        -webkit-font-smoothing: antialiased;
      }

      main {
        width: min(100%, 340px);
        padding: 22px;
        text-align: center;
        border: 1px solid #E8E0EC;
        border-radius: 20px;
        background: #FFFDFC;
      }

      h1 {
        margin: 0 0 9px;
        font-size: 27px;
        line-height: 1.05;
        letter-spacing: -0.05em;
      }

      p {
        margin: 0;
        color: #766F80;
        font-size: 15px;
        line-height: 1.5;
      }
    </style>
  </head>

  <body>
    <main>
      <h1>${title}</h1>
      <p>${message}</p>
    </main>
  </body>
</html>`,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}
