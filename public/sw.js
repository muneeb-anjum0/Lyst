const CACHE_VERSION = "lyst-shell-v1";
const META_CACHE = "lyst-meta-v1";

const CACHE_REFRESH_KEY = "/__lyst_cache_refresh__";
const CACHE_DURATION = 60 * 24 * 60 * 60 * 1000;

const APP_SHELL = ["/", "/index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      removeOldCaches(),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "REFRESH_OFFLINE_CACHE") {
    event.waitUntil(refreshCacheTimestamp());
  }

  if (event.data?.type === "CLEAR_OFFLINE_CACHE") {
    event.waitUntil(clearLystCaches());
  }

  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
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

  event.respondWith(handleAssetRequest(request));
});

async function handleNavigationRequest(request) {
  const cacheExpired = await hasCacheExpired();

  if (cacheExpired) {
    await clearAppShellCache();
  }

  try {
    const networkResponse = await fetch(request);

    if (networkResponse?.ok) {
      const cache = await caches.open(CACHE_VERSION);
      await cache.put("/index.html", networkResponse.clone());
    }

    return networkResponse;
  } catch {
    if (cacheExpired) {
      return offlineExpiredResponse();
    }

    const cache = await caches.open(CACHE_VERSION);

    return (
      (await cache.match("/index.html")) ||
      (await cache.match("/")) ||
      offlineUnavailableResponse()
    );
  }
}

async function handleAssetRequest(request) {
  const cacheExpired = await hasCacheExpired();

  if (cacheExpired) {
    await clearAppShellCache();
  }

  const cache = await caches.open(CACHE_VERSION);
  const cachedResponse = await cache.match(request);

  if (cachedResponse && !cacheExpired) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);

    if (networkResponse?.ok) {
      await cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch {
    if (cachedResponse && !cacheExpired) {
      return cachedResponse;
    }

    return new Response("", {
      status: 503,
      statusText: "Offline",
    });
  }
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

  const value = Number(await response.text());

  return Number.isFinite(value) ? value : null;
}

async function hasCacheExpired() {
  const timestamp = await getCacheTimestamp();

  if (!timestamp) return false;

  return Date.now() - timestamp > CACHE_DURATION;
}

async function removeOldCaches() {
  const cacheNames = await caches.keys();

  await Promise.all(
    cacheNames
      .filter(
        (cacheName) =>
          cacheName.startsWith("lyst-") &&
          cacheName !== CACHE_VERSION &&
          cacheName !== META_CACHE,
      )
      .map((cacheName) => caches.delete(cacheName)),
  );
}

async function clearAppShellCache() {
  await caches.delete(CACHE_VERSION);
}

async function clearLystCaches() {
  const cacheNames = await caches.keys();

  await Promise.all(
    cacheNames
      .filter((cacheName) => cacheName.startsWith("lyst-"))
      .map((cacheName) => caches.delete(cacheName)),
  );
}

function offlineExpiredResponse() {
  return new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
    >
    <meta name="theme-color" content="#ffffff">
    <title>Lyst</title>
    <style>
      * { box-sizing: border-box; }
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        padding: 24px;
        color: #111;
        background: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(100%, 340px);
        text-align: center;
      }
      h1 {
        margin: 0 0 10px;
        font-size: 28px;
        letter-spacing: -0.05em;
      }
      p {
        margin: 0;
        color: #777;
        font-size: 15px;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Connect to continue</h1>
      <p>
        Your 60-day offline period has expired. Connect to the internet and
        sign in again to refresh offline access.
      </p>
    </main>
  </body>
</html>`,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    },
  );
}

function offlineUnavailableResponse() {
  return new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
    >
    <meta name="theme-color" content="#ffffff">
    <title>Lyst</title>
    <style>
      * { box-sizing: border-box; }
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        padding: 24px;
        color: #111;
        background: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(100%, 340px);
        text-align: center;
      }
      h1 {
        margin: 0 0 10px;
        font-size: 28px;
        letter-spacing: -0.05em;
      }
      p {
        margin: 0;
        color: #777;
        font-size: 15px;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Lyst is not cached yet</h1>
      <p>
        Open Lyst once while connected to the internet. It will then be
        available offline.
      </p>
    </main>
  </body>
</html>`,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    },
  );
}