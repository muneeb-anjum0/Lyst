import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

let waitingRegistration = null;
let updateVisible = false;

function dispatchUpdateAvailable(registration = null) {
  if (registration) {
    waitingRegistration = registration;
  }

  if (updateVisible) return;

  updateVisible = true;
  window.__LYST_UPDATE_AVAILABLE__ = true;

  window.dispatchEvent(
    new CustomEvent("lyst:update-available"),
  );
}

function getCurrentBundleSignature() {
  const scripts = Array.from(
    document.querySelectorAll('script[type="module"][src]'),
  );

  return (
    scripts
      .map((script) => script.getAttribute("src") || "")
      .find((src) => src.includes("/assets/")) || null
  );
}

function getRemoteBundleSignature(html) {
  const normalOrder = html.match(
    /<script[^>]+type=["']module["'][^>]+src=["']([^"']+\/assets\/[^"']+\.js)["']/i,
  );

  if (normalOrder?.[1]) return normalOrder[1];

  const reverseOrder = html.match(
    /<script[^>]+src=["']([^"']+\/assets\/[^"']+\.js)["'][^>]+type=["']module["']/i,
  );

  return reverseOrder?.[1] || null;
}

async function checkPublishedVersion() {
  if (!navigator.onLine) return;

  try {
    const response = await fetch(
      `/index.html?lyst-version-check=${Date.now()}`,
      {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
        },
      },
    );

    if (!response.ok) return;

    const html = await response.text();
    const remoteSignature = getRemoteBundleSignature(html);
    const currentSignature = getCurrentBundleSignature();

    if (
      currentSignature &&
      remoteSignature &&
      currentSignature !== remoteSignature
    ) {
      dispatchUpdateAvailable();
    }
  } catch (error) {
    console.warn("Lyst version check failed:", error);
  }
}

async function applyUpdate() {
  const registration =
    waitingRegistration ||
    (await navigator.serviceWorker?.getRegistration?.("/"));

  if (registration?.waiting) {
    registration.waiting.postMessage({
      type: "SKIP_WAITING",
    });

    await new Promise((resolve) => {
      const timeout = window.setTimeout(resolve, 1800);

      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => {
          window.clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
    });
  }

  const url = new URL(window.location.href);
  url.searchParams.set("updated", Date.now().toString());
  window.location.replace(url.toString());
}

window.__LYST_UPDATE_AVAILABLE__ = false;
window.__LYST_APPLY_UPDATE__ = applyUpdate;

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    await checkPublishedVersion();
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });

    if (registration.waiting) {
      dispatchUpdateAvailable(registration);
    }

    registration.addEventListener("updatefound", () => {
      const installingWorker = registration.installing;

      if (!installingWorker) return;

      installingWorker.addEventListener("statechange", () => {
        if (
          installingWorker.state === "installed" &&
          navigator.serviceWorker.controller
        ) {
          dispatchUpdateAvailable(registration);
        }
      });
    });

    window.setInterval(() => {
      registration.update().catch((error) => {
        console.warn("Service worker update check failed:", error);
      });

      checkPublishedVersion();
    }, 5 * 60 * 1000);

    window.addEventListener("focus", () => {
      registration.update().catch(() => {});
      checkPublishedVersion();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        registration.update().catch(() => {});
        checkPublishedVersion();
      }
    });

    await checkPublishedVersion();
  } catch (error) {
    console.error("Service worker registration failed:", error);
    await checkPublishedVersion();
  }
}

if (import.meta.env.PROD) {
  window.addEventListener("load", registerServiceWorker);
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);