import { doc, increment, serverTimestamp, updateDoc } from "firebase/firestore";

import { auth, db } from "../lib/firebase.js";

const LYST_AI_URL = import.meta.env.VITE_LYST_AI_URL || "";

export const DAILY_AI_REQUEST_LIMIT = 20;

export async function callLystAi(payload) {
  if (!LYST_AI_URL) throw new Error("Lyst AI URL is not configured.");

  if (!auth?.currentUser) {
    const error = new Error("Sign in before using AI.");
    error.code = "unauthenticated";
    throw error;
  }

  const response = await fetch(LYST_AI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await auth.currentUser.getIdToken()}`,
    },
    body: JSON.stringify(payload),
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    // Gateway failures are not guaranteed to return JSON.
  }

  if (!response.ok) {
    const error = new Error(data?.error || "AI could not complete the request.");
    error.code = data?.code || `http-${response.status}`;
    throw error;
  }

  return data;
}

export function isAiLimitError(error) {
  const code = String(error?.code || "");
  return code.includes("resource-exhausted") || code.includes("429");
}

export function getAiErrorMessage(error) {
  const code = String(error?.code || "");

  if (code.includes("resource-exhausted") || code.includes("429")) {
    return "AI limit reached for now. Try again after the limit resets.";
  }
  if (code.includes("unauthenticated") || code.includes("401")) {
    return "Sign in again before using AI.";
  }
  if (code.includes("failed-precondition") || code.includes("503")) {
    return "AI is not ready yet. Check the Worker setup.";
  }
  if (code.includes("incomplete-response")) {
    return "AI returned an incomplete result. Please try again.";
  }
  if (code.includes("provider-unavailable")) {
    return "AI is temporarily busy. Please try again shortly.";
  }
  if (code.includes("invalid-argument") || code.includes("400")) {
    return error?.message || "That AI request could not be processed.";
  }
  if (!navigator.onLine) return "AI needs an internet connection.";
  return error?.message || "AI could not finish that request. Try again.";
}

export async function adjustListSummary(
  userId,
  listId,
  itemDelta = 0,
  completedDelta = 0,
) {
  if (!db || !userId || !listId) return;

  const changes = { updatedAt: serverTimestamp() };
  if (itemDelta) changes.itemCount = increment(itemDelta);
  if (completedDelta) changes.completedCount = increment(completedDelta);
  if (Object.keys(changes).length <= 1) return;

  await updateDoc(doc(db, "users", userId, "lists", listId), changes);
}
