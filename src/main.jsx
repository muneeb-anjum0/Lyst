import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

let refreshing = false;

function showUpdatePrompt(registration) {
  const waitingWorker = registration.waiting;

  if (!waitingWorker) return;

  const shouldUpdate = window.confirm(
    "A newer version of Lyst is available. Update now?",
  );

  if (shouldUpdate) {
    waitingWorker.postMessage({
      type: "SKIP_WAITING",
    });
  }
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });

    if (registration.waiting) {
      showUpdatePrompt(registration);
    }

    registration.addEventListener("updatefound", () => {
      const installingWorker = registration.installing;

      if (!installingWorker) return;

      installingWorker.addEventListener("statechange", () => {
        if (
          installingWorker.state === "installed" &&
          navigator.serviceWorker.controller
        ) {
          showUpdatePrompt(registration);
        }
      });
    });

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;

      refreshing = true;
      window.location.reload();
    });

    window.setInterval(() => {
      registration.update().catch((error) => {
        console.warn("Service worker update check failed:", error);
      });
    }, 60 * 60 * 1000);
  } catch (error) {
    console.error("Service worker registration failed:", error);
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