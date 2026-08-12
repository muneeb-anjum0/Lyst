const OFFLINE_ACCESS_KEY = "lyst_offline_access_refreshed_at";
const OFFLINE_ACCESS_DURATION = 60 * 24 * 60 * 60 * 1000;

function getOfflineRefreshTime(user) {
  const storedValue = Number(localStorage.getItem(OFFLINE_ACCESS_KEY));
  if (Number.isFinite(storedValue) && storedValue > 0) return storedValue;

  const timestamp = new Date(user?.metadata?.lastSignInTime || "").getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function offlineAccessExpired(user) {
  const refreshTime = getOfflineRefreshTime(user);
  return refreshTime
    ? Date.now() - refreshTime > OFFLINE_ACCESS_DURATION
    : false;
}

async function sendServiceWorkerMessage(message) {
  if (!("serviceWorker" in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    registration?.active?.postMessage(message);
  } catch (error) {
    console.warn("Could not contact service worker:", error);
  }
}

export async function refreshOfflineAccess() {
  localStorage.setItem(OFFLINE_ACCESS_KEY, String(Date.now()));
  await sendServiceWorkerMessage({ type: "REFRESH_OFFLINE_CACHE" });
}

export async function clearOfflineAccess() {
  localStorage.removeItem(OFFLINE_ACCESS_KEY);
  await sendServiceWorkerMessage({ type: "CLEAR_OFFLINE_CACHE" });
}
