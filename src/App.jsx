import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import * as chrono from "chrono-node";

import { initializeApp } from "firebase/app";

import {
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";

import {
  CACHE_SIZE_UNLIMITED,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  initializeFirestore,
  onSnapshot,
  orderBy,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

/* -------------------------------------------------------------------------- */
/* Firebase                                                                   */
/* -------------------------------------------------------------------------- */

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const firebaseReady = Object.values(firebaseConfig).every(Boolean);

let auth = null;
let db = null;

if (firebaseReady) {
  const firebaseApp = initializeApp(firebaseConfig);

  auth = getAuth(firebaseApp);

  try {
    db = initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({
        cacheSizeBytes: CACHE_SIZE_UNLIMITED,
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch (error) {
    console.warn("Persistent Firestore cache unavailable:", error);
    db = getFirestore(firebaseApp);
  }
}

/* -------------------------------------------------------------------------- */
/* Offline access                                                             */
/* -------------------------------------------------------------------------- */

const OFFLINE_ACCESS_KEY = "lyst_offline_access_refreshed_at";
const OFFLINE_ACCESS_DURATION = 60 * 24 * 60 * 60 * 1000;

function getOfflineRefreshTime(user) {
  const storedValue = Number(localStorage.getItem(OFFLINE_ACCESS_KEY));

  if (Number.isFinite(storedValue) && storedValue > 0) {
    return storedValue;
  }

  const lastSignInTime = user?.metadata?.lastSignInTime;

  if (!lastSignInTime) return null;

  const timestamp = new Date(lastSignInTime).getTime();

  return Number.isFinite(timestamp) ? timestamp : null;
}

function offlineAccessExpired(user) {
  const refreshTime = getOfflineRefreshTime(user);

  if (!refreshTime) return false;

  return Date.now() - refreshTime > OFFLINE_ACCESS_DURATION;
}

async function sendServiceWorkerMessage(message) {
  if (!("serviceWorker" in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage(message);
  } catch (error) {
    console.warn("Could not contact service worker:", error);
  }
}

async function refreshOfflineAccess() {
  localStorage.setItem(OFFLINE_ACCESS_KEY, String(Date.now()));

  await sendServiceWorkerMessage({
    type: "REFRESH_OFFLINE_CACHE",
  });
}

async function clearOfflineAccess() {
  localStorage.removeItem(OFFLINE_ACCESS_KEY);

  await sendServiceWorkerMessage({
    type: "CLEAR_OFFLINE_CACHE",
  });
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const DEFAULT_DATE_ONLY_HOUR = 12;
const DEFAULT_DATE_ONLY_MINUTE = 0;

const QUANTITY_UNITS = [
  "bottles",
  "bottle",
  "packs",
  "pack",
  "boxes",
  "box",
  "bags",
  "bag",
  "pieces",
  "piece",
  "items",
  "item",
  "pairs",
  "pair",
  "sets",
  "set",
  "cans",
  "can",
  "jars",
  "jar",
  "tins",
  "tin",
  "rolls",
  "roll",
  "sheets",
  "sheet",
  "tabs",
  "tablets",
  "capsules",
  "capsule",
  "cups",
  "cup",
  "tablespoons",
  "tablespoon",
  "tbsp",
  "teaspoons",
  "teaspoon",
  "tsp",
  "ounces",
  "ounce",
  "oz",
  "pounds",
  "pound",
  "lbs",
  "lb",
  "kilograms",
  "kilogram",
  "kgs",
  "kg",
  "grams",
  "gram",
  "g",
  "milligrams",
  "milligram",
  "mg",
  "litres",
  "litre",
  "liters",
  "liter",
  "millilitres",
  "millilitre",
  "milliliters",
  "milliliter",
  "ml",
  "l",
  "metres",
  "metre",
  "meters",
  "meter",
  "centimetres",
  "centimetre",
  "centimeters",
  "centimeter",
  "cm",
  "dozens",
  "dozen",
];

const NUMBER_WORDS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
  a: 1,
  an: 1,
  couple: 2,
  few: 3,
  dozen: 12,
};

function getInitials(user) {
  const source = user?.displayName || user?.email || "L";

  return source
    .split(/[\s@]+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

function getAuthError(error) {
  const messages = {
    "auth/email-already-in-use": "That email already has an account.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/too-many-requests": "Too many attempts. Try again later.",
    "auth/popup-blocked": "Your browser blocked the sign-in window.",
    "auth/network-request-failed": "Check your internet connection.",
    "auth/popup-closed-by-user": "",
  };

  return messages[error?.code] || "Something went wrong.";
}

function normalize(value) {
  return value.trim().toLowerCase();
}

function cloneFirestoreData(value) {
  const { id: _ignoredId, ...data } = value;
  return data;
}

function startOfDay(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date, amount) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function isValidDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function setLocalTime(date, hours, minutes) {
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function isExplicitTimeResult(result) {
  if (!result?.start) return false;

  return (
    result.start.isCertain("hour") ||
    result.start.isCertain("minute") ||
    result.start.isCertain("meridiem")
  );
}

function normalizeNaturalInput(input) {
  return input
    .replace(/[–—]/g, "-")
    .replace(/\b(\d{1,2})\s*([ap])\.?\s*m\.?\b/gi, "$1$2m")
    .replace(
      /\b(\d{1,2})\s*[:.]\s*(\d{2})\s*([ap])\.?\s*m\.?\b/gi,
      "$1:$2$3m",
    )
    .replace(/\b(\d{1,2})\s+o['’]?clock\b/gi, "$1:00")
    .replace(/\bday\s+after\s+tmrw\b/gi, "day after tomorrow")
    .replace(/\btmrw\b/gi, "tomorrow")
    .replace(/\btonite\b/gi, "tonight")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumberWords(value) {
  const cleaned = value.toLowerCase().replace(/-/g, " ").trim();

  if (/^\d+(?:\.\d+)?$/.test(cleaned)) {
    return Number(cleaned);
  }

  const words = cleaned.split(/\s+/);
  let total = 0;
  let current = 0;
  let found = false;

  for (const word of words) {
    const number = NUMBER_WORDS[word];

    if (number === undefined) return null;

    found = true;

    if (number === 100) {
      current = Math.max(current, 1) * 100;
    } else {
      current += number;
    }
  }

  total += current;
  return found ? total : null;
}

function parseQuantity(input) {
  const unitPattern = QUANTITY_UNITS
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");

  const numberPattern =
    "(?:\\d+(?:\\.\\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|a|an|couple|few)(?:[-\\s]+(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred))?";

  const unitMatch = input.match(
    new RegExp(
      `\\b(${numberPattern})\\s*(${unitPattern})\\b(?:\\s+of\\b)?`,
      "i",
    ),
  );

  if (unitMatch) {
    const quantity = parseNumberWords(unitMatch[1]);

    if (quantity !== null) {
      return {
        quantity,
        unit: unitMatch[2].toLowerCase(),
        matchedText: unitMatch[0],
        index: unitMatch.index ?? 0,
      };
    }
  }

  const multiplierMatch = input.match(
    new RegExp(
      `\\b(${numberPattern})\\s*[x×]\\s+([\\p{L}\\p{N}][^,.;]*)`,
      "iu",
    ),
  );

  if (multiplierMatch) {
    const quantity = parseNumberWords(multiplierMatch[1]);

    if (quantity !== null) {
      return {
        quantity,
        unit: "",
        matchedText: multiplierMatch[1],
        index: multiplierMatch.index ?? 0,
      };
    }
  }

  const genericMatch = input.match(
    new RegExp(
      `\\b(?:buy|get|add|order|pick\\s+up|bring|need|take)\\s+(${numberPattern})\\b`,
      "i",
    ),
  );

  if (genericMatch) {
    const quantity = parseNumberWords(genericMatch[1]);

    if (quantity !== null) {
      return {
        quantity,
        unit: "",
        matchedText: genericMatch[1],
        index:
          (genericMatch.index ?? 0) +
          genericMatch[0].lastIndexOf(genericMatch[1]),
      };
    }
  }

  return null;
}

function maskRange(value, index, length) {
  return (
    value.slice(0, index) +
    " ".repeat(length) +
    value.slice(index + length)
  );
}

function parseChronoResult(input, referenceDate) {
  const results = chrono.casual.parse(
    input,
    {
      instant: referenceDate,
      timezone: referenceDate.getTimezoneOffset(),
    },
    {
      forwardDate: true,
    },
  );

  if (results.length === 0) return null;

  const sortedResults = [...results].sort((first, second) => {
    const firstScore =
      Number(isExplicitTimeResult(first)) * 4 +
      Number(first.start.isCertain("day")) * 3 +
      first.text.length / 1000;

    const secondScore =
      Number(isExplicitTimeResult(second)) * 4 +
      Number(second.start.isCertain("day")) * 3 +
      second.text.length / 1000;

    return secondScore - firstScore;
  });

  return sortedResults[0];
}

function parseNaturalDateTime(input, quantityResult) {
  const referenceDate = new Date();
  let chronoInput = input;

  if (quantityResult) {
    chronoInput = maskRange(
      chronoInput,
      quantityResult.index,
      quantityResult.matchedText.length,
    );
  }

  const result = parseChronoResult(chronoInput, referenceDate);

  if (!result) {
    return {
      dueAt: null,
      matchedText: null,
      hasExplicitTime: false,
      warning: "",
    };
  }

  const hasExplicitTime = isExplicitTimeResult(result);
  let dueAt = result.start.date();

  if (!isValidDate(dueAt)) {
    return {
      dueAt: null,
      matchedText: null,
      hasExplicitTime: false,
      warning: "The date or time could not be understood safely.",
    };
  }

  if (!hasExplicitTime) {
    dueAt = setLocalTime(
      dueAt,
      DEFAULT_DATE_ONLY_HOUR,
      DEFAULT_DATE_ONLY_MINUTE,
    );
  } else {
    const hour = result.start.get("hour");
    const minute = result.start.get("minute") ?? 0;

    if (
      !Number.isInteger(hour) ||
      hour < 0 ||
      hour > 23 ||
      !Number.isInteger(minute) ||
      minute < 0 ||
      minute > 59
    ) {
      return {
        dueAt: null,
        matchedText: null,
        hasExplicitTime: false,
        warning: "The time could not be understood safely.",
      };
    }

    dueAt = setLocalTime(dueAt, hour, minute);
  }

  return {
    dueAt,
    matchedText: result.text,
    hasExplicitTime,
    warning: "",
  };
}

function cleanupTaskText(input, matches) {
  let text = input;

  matches
    .filter(Boolean)
    .sort((first, second) => second.length - first.length)
    .forEach((match) => {
      text = text.replace(new RegExp(escapeRegExp(match), "i"), " ");
    });

  text = text
    .replace(/\b(?:on|at|by|for|around|about)\s*$/i, "")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/^[,.;:\s-]+|[,.;:\s-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return input.trim();

  return text.charAt(0).toUpperCase() + text.slice(1);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseNaturalInput(input) {
  const rawInput = input.trim();
  const normalizedInput = normalizeNaturalInput(rawInput);
  const parsedQuantity = parseQuantity(normalizedInput);
  const parsedDateTime = parseNaturalDateTime(
    normalizedInput,
    parsedQuantity,
  );

  const text = cleanupTaskText(normalizedInput, [
    parsedDateTime.matchedText,
    parsedQuantity?.matchedText,
  ]);

  return {
    rawInput,
    text,
    quantity: parsedQuantity?.quantity ?? null,
    quantityUnit: parsedQuantity?.unit || "",
    dueAt: parsedDateTime.dueAt,
    hasExplicitTime: parsedDateTime.hasExplicitTime,
    warning: parsedDateTime.warning,
    hasNaturalData: Boolean(
      parsedDateTime.dueAt ||
        parsedQuantity,
    ),
  };
}

function formatDateForInput(value) {
  if (!value) return "";

  const date =
    typeof value?.toDate === "function"
      ? value.toDate()
      : new Date(value);

  if (!isValidDate(date)) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatTimeForInput(value) {
  if (!value) return "";

  const date =
    typeof value?.toDate === "function"
      ? value.toDate()
      : new Date(value);

  if (!isValidDate(date)) return "";

  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

function combineLocalDateAndTime(dateValue, timeValue) {
  if (!dateValue) return null;

  const [year, month, day] = dateValue.split("-").map(Number);
  const [hours, minutes] = (timeValue || "12:00").split(":").map(Number);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes)
  ) {
    return null;
  }

  const result = new Date(
    year,
    month - 1,
    day,
    hours,
    minutes,
    0,
    0,
  );

  if (
    result.getFullYear() !== year ||
    result.getMonth() !== month - 1 ||
    result.getDate() !== day ||
    result.getHours() !== hours ||
    result.getMinutes() !== minutes
  ) {
    return null;
  }

  return result;
}

function formatDueDate(value) {
  if (!value) return "";

  const date =
    typeof value?.toDate === "function"
      ? value.toDate()
      : new Date(value);

  if (!isValidDate(date)) return "";

  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const dateOnly = startOfDay(date);

  let dateLabel;

  if (dateOnly.getTime() === today.getTime()) {
    dateLabel = "Today";
  } else if (dateOnly.getTime() === tomorrow.getTime()) {
    dateLabel = "Tomorrow";
  } else {
    dateLabel = new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(date);
  }

  const timeLabel = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);

  return `${dateLabel}, ${timeLabel}`;
}

function formatQuantity(quantity, unit) {
  if (quantity === null || quantity === undefined) return "";

  return unit ? `${quantity} ${unit}` : `×${quantity}`;
}

function getItemMetadata(item) {
  return [
    formatQuantity(item.quantity, item.quantityUnit),
    formatDueDate(item.dueAt),
  ]
    .filter(Boolean)
    .join(" · ");
}


const ITEM_HISTORY_LIMIT = 60;
const SMART_SUGGESTION_LIMIT = 6;
const RECENT_COMPLETED_LIMIT = 5;

function normalizeItemKey(value) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toMillis(value) {
  if (!value) return 0;

  if (typeof value?.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value?.toDate === "function") {
    return value.toDate().getTime();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function getSafeHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter(
      (entry) =>
        entry &&
        typeof entry.text === "string" &&
        typeof entry.key === "string",
    )
    .map((entry) => ({
      key: entry.key,
      text: entry.text,
      count: Math.max(1, Number(entry.count) || 1),
      lastUsedAt: Number(entry.lastUsedAt) || 0,
      lastCompletedAt: Number(entry.lastCompletedAt) || 0,
      quantity:
        entry.quantity === null ||
        entry.quantity === undefined ||
        entry.quantity === ""
          ? null
          : Number(entry.quantity),
      quantityUnit: entry.quantityUnit || "",
    }));
}

function buildNextHistory(history, item, options = {}) {
  const key = normalizeItemKey(item.text);

  if (!key) return getSafeHistory(history);

  const now = Date.now();
  const safeHistory = getSafeHistory(history);
  const existing = safeHistory.find((entry) => entry.key === key);

  const nextEntry = {
    key,
    text: item.text.trim(),
    count: Math.max(
      1,
      (existing?.count || 0) + (options.incrementCount === false ? 0 : 1),
    ),
    lastUsedAt:
      options.touchUsed === false
        ? existing?.lastUsedAt || 0
        : now,
    lastCompletedAt: options.completed
      ? now
      : existing?.lastCompletedAt || 0,
    quantity:
      item.quantity === null ||
      item.quantity === undefined ||
      item.quantity === ""
        ? existing?.quantity ?? null
        : Number(item.quantity),
    quantityUnit:
      item.quantityUnit || existing?.quantityUnit || "",
  };

  return [
    nextEntry,
    ...safeHistory.filter((entry) => entry.key !== key),
  ]
    .sort((first, second) => {
      const firstScore =
        first.count * 1_000_000 +
        Math.max(first.lastUsedAt, first.lastCompletedAt);

      const secondScore =
        second.count * 1_000_000 +
        Math.max(second.lastUsedAt, second.lastCompletedAt);

      return secondScore - firstScore;
    })
    .slice(0, ITEM_HISTORY_LIMIT);
}

function quantitiesCanMerge(existingItem, incomingItem) {
  const existingUnit = normalizeItemKey(existingItem.quantityUnit || "");
  const incomingUnit = normalizeItemKey(incomingItem.quantityUnit || "");

  return (
    !existingUnit ||
    !incomingUnit ||
    existingUnit === incomingUnit
  );
}

function mergeQuantities(existingItem, incomingItem) {
  const existingQuantity =
    existingItem.quantity === null ||
    existingItem.quantity === undefined ||
    existingItem.quantity === ""
      ? null
      : Number(existingItem.quantity);

  const incomingQuantity =
    incomingItem.quantity === null ||
    incomingItem.quantity === undefined ||
    incomingItem.quantity === ""
      ? null
      : Number(incomingItem.quantity);

  if (!quantitiesCanMerge(existingItem, incomingItem)) {
    return {
      quantity: incomingQuantity ?? existingQuantity,
      quantityUnit:
        incomingItem.quantityUnit ||
        existingItem.quantityUnit ||
        "",
    };
  }

  if (existingQuantity === null && incomingQuantity === null) {
    return {
      quantity: null,
      quantityUnit:
        incomingItem.quantityUnit ||
        existingItem.quantityUnit ||
        "",
    };
  }

  return {
    quantity: (existingQuantity || 0) + (incomingQuantity || 0),
    quantityUnit:
      incomingItem.quantityUnit ||
      existingItem.quantityUnit ||
      "",
  };
}

/* -------------------------------------------------------------------------- */
/* App                                                                        */
/* -------------------------------------------------------------------------- */

export default function App() {
  const reduceMotion = useReducedMotion();

  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(firebaseReady);
  const [offlineExpired, setOfflineExpired] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const [lists, setLists] = useState([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [selectedList, setSelectedList] = useState(null);

  const [newListOpen, setNewListOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const [editList, setEditList] = useState(null);
  const [confirmation, setConfirmation] = useState(null);

  const [toast, setToast] = useState("");
  const [undoAction, setUndoAction] = useState(null);

  const toastTimer = useRef(null);
  const undoTimer = useRef(null);

  function showToast(message) {
    if (!message) return;

    setToast(message);
    window.clearTimeout(toastTimer.current);

    toastTimer.current = window.setTimeout(() => {
      setToast("");
    }, 2300);
  }

  function showUndo(message, action) {
    window.clearTimeout(undoTimer.current);

    setUndoAction({
      message,
      action,
    });

    undoTimer.current = window.setTimeout(() => {
      setUndoAction(null);
    }, 6000);
  }

  async function performUndo() {
    if (!undoAction?.action) return;

    const action = undoAction.action;

    setUndoAction(null);
    window.clearTimeout(undoTimer.current);

    try {
      await action();
      showToast("Restored.");
    } catch (error) {
      console.error(error);
      showToast("Could not restore it.");
    }
  }

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!firebaseReady) {
      setAuthLoading(false);
      return undefined;
    }

    setPersistence(auth, browserLocalPersistence).catch(console.error);

    return onAuthStateChanged(auth, async (nextUser) => {
      if (!nextUser) {
        setUser(null);
        setLists([]);
        setSelectedList(null);
        setOfflineExpired(false);
        setAuthLoading(false);
        return;
      }

      if (navigator.onLine) {
        try {
          await nextUser.getIdToken(true);
          await refreshOfflineAccess();

          setOfflineExpired(false);
          setUser(nextUser);
        } catch (error) {
          console.warn("Online session refresh failed:", error);

          const expired = offlineAccessExpired(nextUser);

          setOfflineExpired(expired);
          setUser(expired ? null : nextUser);
        }
      } else {
        const expired = offlineAccessExpired(nextUser);

        setOfflineExpired(expired);
        setUser(expired ? null : nextUser);
      }

      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!isOnline || !auth?.currentUser) return undefined;

    let cancelled = false;

    async function refreshSession() {
      try {
        await auth.currentUser.getIdToken(true);
        await refreshOfflineAccess();

        if (!cancelled) {
          setOfflineExpired(false);
          setUser(auth.currentUser);
        }
      } catch (error) {
        console.warn("Could not refresh session:", error);
      }
    }

    refreshSession();

    return () => {
      cancelled = true;
    };
  }, [isOnline]);

  useEffect(() => {
    if (!user || !db || offlineExpired) return undefined;

    setListsLoading(true);

    const listsQuery = query(
      collection(db, "users", user.uid, "lists"),
      orderBy("createdAt", "desc"),
    );

    return onSnapshot(
      listsQuery,
      {
        includeMetadataChanges: true,
      },
      (snapshot) => {
        const nextLists = snapshot.docs.map((listDocument) => ({
          id: listDocument.id,
          ...listDocument.data(),
        }));

        setLists(nextLists);
        setListsLoading(false);

        setSelectedList((currentList) => {
          if (!currentList) return null;

          return (
            nextLists.find((list) => list.id === currentList.id) || null
          );
        });
      },
      (error) => {
        console.error(error);
        setListsLoading(false);

        showToast(
          navigator.onLine
            ? "Could not load your lists."
            : "No cached lists are available yet.",
        );
      },
    );
  }, [user, offlineExpired]);

  async function createList(title) {
    const cleanTitle = title.trim();

    if (!cleanTitle || !user || !db) return;

    try {
      const reference = await addDoc(
        collection(db, "users", user.uid, "lists"),
        {
          title: cleanTitle,
          archived: false,
          itemHistory: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      );

      setNewListOpen(false);

      setSelectedList({
        id: reference.id,
        title: cleanTitle,
        archived: false,
      });

      if (!navigator.onLine) {
        showToast("Saved offline. It will sync later.");
      }
    } catch (error) {
      console.error(error);
      showToast("Could not create the list.");
    }
  }

  async function renameList(list, title) {
    const cleanTitle = title.trim();

    if (!cleanTitle || !user || !db) return;

    try {
      await updateDoc(
        doc(db, "users", user.uid, "lists", list.id),
        {
          title: cleanTitle,
          updatedAt: serverTimestamp(),
        },
      );

      setEditList(null);
      showToast("List renamed.");
    } catch (error) {
      console.error(error);
      showToast("Could not rename the list.");
    }
  }

  async function toggleArchive(list) {
    if (!user || !db) return;

    const nextArchived = !Boolean(list.archived);

    try {
      await updateDoc(
        doc(db, "users", user.uid, "lists", list.id),
        {
          archived: nextArchived,
          updatedAt: serverTimestamp(),
        },
      );

      if (selectedList?.id === list.id) {
        setSelectedList(null);
      }

      showToast(nextArchived ? "List archived." : "List restored.");
    } catch (error) {
      console.error(error);
      showToast("Could not update the archive.");
    }
  }

  function requestDeleteList(list) {
    setConfirmation({
      title: "Delete list?",
      message: `"${list.title}" and all of its items will be removed.`,
      confirmLabel: "Delete",
      danger: true,
      action: () => deleteList(list),
    });
  }

  async function deleteList(list) {
    if (!user || !db) return;

    const listReference = doc(
      db,
      "users",
      user.uid,
      "lists",
      list.id,
    );

    const itemsReference = collection(
      db,
      "users",
      user.uid,
      "lists",
      list.id,
      "items",
    );

    let deletedItems = [];

    try {
      const itemSnapshot = await new Promise((resolve, reject) => {
        let unsubscribe = () => {};

        unsubscribe = onSnapshot(
          itemsReference,
          (snapshot) => {
            unsubscribe();
            resolve(snapshot);
          },
          reject,
        );
      });

      deletedItems = itemSnapshot.docs.map((itemDocument) => ({
        id: itemDocument.id,
        data: cloneFirestoreData(itemDocument.data()),
      }));

      const batch = writeBatch(db);

      deletedItems.forEach((item) => {
        batch.delete(
          doc(
            db,
            "users",
            user.uid,
            "lists",
            list.id,
            "items",
            item.id,
          ),
        );
      });

      batch.delete(listReference);

      await batch.commit();

      setConfirmation(null);
      setSelectedList(null);

      showUndo("List deleted.", async () => {
        await setDoc(listReference, {
          title: list.title,
          archived: Boolean(list.archived),
          itemHistory: Array.isArray(list.itemHistory)
            ? list.itemHistory
            : [],
          createdAt: list.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const restoreBatch = writeBatch(db);

        deletedItems.forEach((item) => {
          restoreBatch.set(
            doc(
              db,
              "users",
              user.uid,
              "lists",
              list.id,
              "items",
              item.id,
            ),
            item.data,
          );
        });

        await restoreBatch.commit();
      });
    } catch (error) {
      console.error(error);
      setConfirmation(null);
      showToast("Could not delete the list.");
    }
  }

  async function handleSignOut() {
    await clearOfflineAccess();
    await signOut(auth);

    setAccountOpen(false);
  }

  const activeLists = useMemo(
    () => lists.filter((list) => !list.archived),
    [lists],
  );

  const archivedLists = useMemo(
    () => lists.filter((list) => list.archived),
    [lists],
  );

  if (authLoading) {
    return (
      <>
        <GlobalStyles />
        <LoadingScreen reduceMotion={reduceMotion} />
      </>
    );
  }

  if (!firebaseReady) {
    return (
      <>
        <GlobalStyles />
        <SetupScreen />
      </>
    );
  }

  if (offlineExpired) {
    return (
      <>
        <GlobalStyles />

        <OfflineExpiredScreen
          isOnline={isOnline}
          onRetry={async () => {
            if (!navigator.onLine) return;

            try {
              if (auth.currentUser) {
                await auth.currentUser.getIdToken(true);
                await refreshOfflineAccess();

                setOfflineExpired(false);
                setUser(auth.currentUser);
              } else {
                setOfflineExpired(false);
              }
            } catch (error) {
              console.error(error);
              showToast("Sign in again to refresh offline access.");
            }
          }}
          onSignOut={async () => {
            await clearOfflineAccess();
            await signOut(auth);

            setOfflineExpired(false);
          }}
        />

        <Toast message={toast} />
      </>
    );
  }

  if (!user) {
    return (
      <>
        <GlobalStyles />

        <AuthScreen showToast={showToast} />

        <Toast message={toast} />
      </>
    );
  }

  return (
    <>
      <GlobalStyles />

      <div className="app">
        <AnimatePresence>
          {!isOnline && (
            <motion.div
              className="offline-indicator"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              Offline
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {selectedList ? (
            <ListScreen
              key="list-screen"
              list={selectedList}
              user={user}
              reduceMotion={reduceMotion}
              onBack={() => setSelectedList(null)}
              onRename={() => setEditList(selectedList)}
              onArchive={() => toggleArchive(selectedList)}
              onDelete={() => requestDeleteList(selectedList)}
              showToast={showToast}
              showUndo={showUndo}
            />
          ) : (
            <HomeScreen
              key="home-screen"
              lists={activeLists}
              archivedCount={archivedLists.length}
              loading={listsLoading}
              user={user}
              reduceMotion={reduceMotion}
              onOpenList={setSelectedList}
              onCreate={() => setNewListOpen(true)}
              onAccount={() => setAccountOpen(true)}
              onSearch={() => setSearchOpen(true)}
              onArchive={() => setArchiveOpen(true)}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {newListOpen && (
            <NewListSheet
              onClose={() => setNewListOpen(false)}
              onCreate={createList}
            />
          )}

          {accountOpen && (
            <AccountSheet
              user={user}
              isOnline={isOnline}
              onClose={() => setAccountOpen(false)}
              onSignOut={handleSignOut}
            />
          )}

          {editList && (
            <EditListSheet
              list={editList}
              onClose={() => setEditList(null)}
              onSave={(title) => renameList(editList, title)}
            />
          )}

          {searchOpen && (
            <SearchSheet
              user={user}
              lists={activeLists}
              onClose={() => setSearchOpen(false)}
              onOpenList={(list) => {
                setSearchOpen(false);
                setSelectedList(list);
              }}
            />
          )}

          {archiveOpen && (
            <ArchiveSheet
              lists={archivedLists}
              onClose={() => setArchiveOpen(false)}
              onRestore={toggleArchive}
              onOpenList={(list) => {
                setArchiveOpen(false);
                setSelectedList(list);
              }}
            />
          )}

          {confirmation && (
            <ConfirmationSheet
              confirmation={confirmation}
              onClose={() => setConfirmation(null)}
            />
          )}
        </AnimatePresence>

        <Toast message={toast} />

        <UndoBar
          undoAction={undoAction}
          onUndo={performUndo}
        />
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Authentication                                                             */
/* -------------------------------------------------------------------------- */

function AuthScreen({ showToast }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false);

  async function preparePersistence() {
    await setPersistence(auth, browserLocalPersistence);
  }

  async function handleGoogle() {
    if (!navigator.onLine) {
      showToast("Connect to the internet to sign in.");
      return;
    }

    try {
      setWorking(true);
      await preparePersistence();

      const provider = new GoogleAuthProvider();

      await signInWithPopup(auth, provider);
      await refreshOfflineAccess();
    } catch (error) {
      console.error(error);
      showToast(getAuthError(error));
    } finally {
      setWorking(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!navigator.onLine) {
      showToast("Connect to the internet to sign in.");
      return;
    }

    const cleanEmail = email.trim();

    if (!cleanEmail || password.length < 6) {
      showToast("Use a valid email and a 6-character password.");
      return;
    }

    try {
      setWorking(true);
      await preparePersistence();

      if (mode === "signup") {
        await createUserWithEmailAndPassword(
          auth,
          cleanEmail,
          password,
        );
      } else {
        await signInWithEmailAndPassword(
          auth,
          cleanEmail,
          password,
        );
      }

      await refreshOfflineAccess();
    } catch (error) {
      console.error(error);
      showToast(getAuthError(error));
    } finally {
      setWorking(false);
    }
  }

  async function handlePasswordReset() {
    if (!navigator.onLine) {
      showToast("Connect to the internet first.");
      return;
    }

    const cleanEmail = email.trim();

    if (!cleanEmail) {
      showToast("Enter your email first.");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      showToast("Password reset email sent.");
    } catch (error) {
      console.error(error);
      showToast(getAuthError(error));
    }
  }

  return (
    <main className="auth-page">
      <motion.section
        className="auth-panel"
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 28,
        }}
      >
        <div className="auth-name">Lyst</div>

        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            className="auth-heading"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
          >
            <h1>{mode === "signin" ? "Sign in" : "Create account"}</h1>

            <p>
              {mode === "signin"
                ? "Continue to your lists."
                : "Keep everything you need to remember."}
            </p>
          </motion.div>
        </AnimatePresence>

        <motion.button
          className="google-button"
          type="button"
          disabled={working}
          whileTap={{ scale: 0.975 }}
          onClick={handleGoogle}
        >
          <span className="google-mark">G</span>
          Continue with Google
        </motion.button>

        <div className="divider">
          <span>or</span>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <input
            type="email"
            value={email}
            autoComplete="email"
            placeholder="Email"
            onChange={(event) => setEmail(event.target.value)}
          />

          <input
            type="password"
            value={password}
            minLength={6}
            autoComplete={
              mode === "signup" ? "new-password" : "current-password"
            }
            placeholder="Password"
            onChange={(event) => setPassword(event.target.value)}
          />

          {mode === "signin" && (
            <button
              className="forgot-button"
              type="button"
              onClick={handlePasswordReset}
            >
              Forgot password?
            </button>
          )}

          <motion.button
            className="primary-button"
            type="submit"
            disabled={working}
            whileTap={{ scale: 0.975 }}
          >
            {working
              ? "Please wait"
              : mode === "signup"
                ? "Create account"
                : "Sign in"}
          </motion.button>
        </form>

        <button
          className="switch-button"
          type="button"
          onClick={() => {
            setMode((currentMode) =>
              currentMode === "signin" ? "signup" : "signin",
            );
          }}
        >
          {mode === "signin"
            ? "Create an account"
            : "Already have an account?"}
        </button>
      </motion.section>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Home                                                                       */
/* -------------------------------------------------------------------------- */

function HomeScreen({
  lists,
  archivedCount,
  loading,
  user,
  reduceMotion,
  onOpenList,
  onCreate,
  onAccount,
  onSearch,
  onArchive,
}) {
  return (
    <motion.main
      className="screen"
      initial={{
        opacity: 0,
        x: reduceMotion ? 0 : -10,
      }}
      animate={{ opacity: 1, x: 0 }}
      exit={{
        opacity: 0,
        x: reduceMotion ? 0 : -10,
      }}
    >
      <header className="home-header">
        <div>
          <span className="app-label">Lyst</span>
          <h1>Lists</h1>
        </div>

        <motion.button
          className="avatar-button"
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={onAccount}
        >
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt=""
              referrerPolicy="no-referrer"
            />
          ) : (
            getInitials(user)
          )}
        </motion.button>
      </header>

      <div className="home-actions">
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={onSearch}
        >
          Search
        </motion.button>

        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={onArchive}
        >
          Archived {archivedCount > 0 ? `(${archivedCount})` : ""}
        </motion.button>
      </div>

      <div className="list-toolbar">
        <span>
          {lists.length} {lists.length === 1 ? "list" : "lists"}
        </span>

        <motion.button
          className="create-button"
          type="button"
          whileTap={{ scale: 0.94 }}
          onClick={onCreate}
        >
          New
        </motion.button>
      </div>

      <section className="lists">
        {loading ? (
          <>
            <ListSkeleton />
            <ListSkeleton />
            <ListSkeleton />
          </>
        ) : lists.length > 0 ? (
          <AnimatePresence initial={false}>
            {lists.map((list, index) => (
              <motion.button
                layout
                key={list.id}
                className="list-row"
                type="button"
                initial={{ opacity: 0, y: 7 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.985 }}
                transition={{
                  delay: Math.min(index * 0.025, 0.12),
                  type: "spring",
                  stiffness: 350,
                  damping: 30,
                }}
                whileTap={{ scale: 0.985 }}
                onClick={() => onOpenList(list)}
              >
                <span className="list-title-text">{list.title}</span>
                <span className="row-arrow">›</span>
              </motion.button>
            ))}
          </AnimatePresence>
        ) : (
          <EmptyLists onCreate={onCreate} />
        )}
      </section>

      <motion.button
        className="floating-button"
        type="button"
        whileTap={{ scale: 0.88 }}
        onClick={onCreate}
      >
        +
      </motion.button>
    </motion.main>
  );
}

function EmptyLists({ onCreate }) {
  return (
    <motion.div
      className="empty-state"
      initial={{ opacity: 0, y: 7 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h2>No lists yet</h2>
      <p>Create one and start adding items.</p>

      <motion.button
        className="primary-button small-button"
        type="button"
        whileTap={{ scale: 0.97 }}
        onClick={onCreate}
      >
        Create list
      </motion.button>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* List screen                                                                */
/* -------------------------------------------------------------------------- */

function ListScreen({
  list,
  user,
  reduceMotion,
  onBack,
  onRename,
  onArchive,
  onDelete,
  showToast,
  showUndo,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState("");
  const [adding, setAdding] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [naturalPreview, setNaturalPreview] = useState(null);
  const [duplicatePrompt, setDuplicatePrompt] = useState(null);
  const [smartOpen, setSmartOpen] = useState(true);

  const inputRef = useRef(null);
  const longPressTimer = useRef(null);
  const longPressTriggered = useRef(false);

  const listReference = useMemo(
    () => doc(db, "users", user.uid, "lists", list.id),
    [list.id, user.uid],
  );

  useEffect(() => {
    const itemsQuery = query(
      collection(
        db,
        "users",
        user.uid,
        "lists",
        list.id,
        "items",
      ),
      orderBy("createdAt", "asc"),
    );

    return onSnapshot(
      itemsQuery,
      {
        includeMetadataChanges: true,
      },
      (snapshot) => {
        setItems(
          snapshot.docs.map((itemDocument) => ({
            id: itemDocument.id,
            ...itemDocument.data(),
          })),
        );

        setLoading(false);
      },
      (error) => {
        console.error(error);
        setLoading(false);

        showToast(
          navigator.onLine
            ? "Could not load your items."
            : "No cached items are available yet.",
        );
      },
    );
  }, [list.id, user.uid]);

  useEffect(() => {
    return () => {
      window.clearTimeout(longPressTimer.current);
    };
  }, []);

  const activeItems = useMemo(
    () => items.filter((item) => !item.completed),
    [items],
  );

  const completedItems = useMemo(
    () => items.filter((item) => item.completed),
    [items],
  );

  const remainingItems = activeItems.length;

  const sortedItems = useMemo(
    () => [...activeItems, ...completedItems],
    [activeItems, completedItems],
  );

  const recentCompleted = useMemo(
    () =>
      [...completedItems]
        .sort(
          (first, second) =>
            toMillis(second.completedAt) -
            toMillis(first.completedAt),
        )
        .slice(0, RECENT_COMPLETED_LIMIT),
    [completedItems],
  );

  const smartSuggestions = useMemo(() => {
    const activeKeys = new Set(
      activeItems.map((item) => normalizeItemKey(item.text)),
    );

    return getSafeHistory(list.itemHistory)
      .filter((entry) => !activeKeys.has(entry.key))
      .sort((first, second) => {
        if (second.count !== first.count) {
          return second.count - first.count;
        }

        return second.lastUsedAt - first.lastUsedAt;
      })
      .slice(0, SMART_SUGGESTION_LIMIT);
  }, [activeItems, list.itemHistory]);

  const hasSmartContent =
    smartSuggestions.length > 0 || recentCompleted.length > 0;

  function startLongPress(event, item) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    longPressTriggered.current = false;
    window.clearTimeout(longPressTimer.current);

    longPressTimer.current = window.setTimeout(() => {
      longPressTriggered.current = true;
      setEditingItem(item);

      if ("vibrate" in navigator) {
        navigator.vibrate(12);
      }
    }, 500);
  }

  function cancelLongPress() {
    window.clearTimeout(longPressTimer.current);
  }

  function handleItemTap(item) {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }

    toggleItem(item);
  }

  function handleContextMenu(event, item) {
    event.preventDefault();
    cancelLongPress();
    setEditingItem(item);
  }

  async function saveHistory(item, options = {}) {
    const nextHistory = buildNextHistory(
      list.itemHistory,
      item,
      options,
    );

    await updateDoc(listReference, {
      itemHistory: nextHistory,
      updatedAt: serverTimestamp(),
    });
  }

  async function createItem(parsedItem) {
    await addDoc(
      collection(
        db,
        "users",
        user.uid,
        "lists",
        list.id,
        "items",
      ),
      {
        text: parsedItem.text.trim(),
        quantity:
          parsedItem.quantity === null ||
          parsedItem.quantity === ""
            ? null
            : Number(parsedItem.quantity),
        quantityUnit: parsedItem.quantityUnit || "",
        dueAt: parsedItem.dueAt || null,
        rawInput: parsedItem.rawInput || parsedItem.text.trim(),
        timesAdded: 1,
        completed: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        completedAt: null,
      },
    );

    await saveHistory(parsedItem);
  }

  async function mergeDuplicate(existingItem, parsedItem) {
    const mergedQuantity = mergeQuantities(
      existingItem,
      parsedItem,
    );

    await updateDoc(
      doc(
        db,
        "users",
        user.uid,
        "lists",
        list.id,
        "items",
        existingItem.id,
      ),
      {
        quantity: mergedQuantity.quantity,
        quantityUnit: mergedQuantity.quantityUnit,
        dueAt: parsedItem.dueAt || existingItem.dueAt || null,
        rawInput: parsedItem.rawInput || existingItem.rawInput || "",
        timesAdded: (Number(existingItem.timesAdded) || 1) + 1,
        updatedAt: serverTimestamp(),
      },
    );

    await saveHistory(
      {
        ...existingItem,
        ...parsedItem,
        quantity: mergedQuantity.quantity,
        quantityUnit: mergedQuantity.quantityUnit,
      },
      {
        incrementCount: true,
      },
    );
  }

  async function saveItem(parsedItem, options = {}) {
    const cleanText = parsedItem.text.trim();

    if (!cleanText || adding) return;

    const duplicate = activeItems.find(
      (item) =>
        normalizeItemKey(item.text) === normalizeItemKey(cleanText),
    );

    if (duplicate && !options.keepBoth && !options.mergeWith) {
      setNaturalPreview(null);
      setDuplicatePrompt({
        existingItem: duplicate,
        parsedItem: {
          ...parsedItem,
          text: cleanText,
        },
      });
      return;
    }

    try {
      setAdding(true);

      if (options.mergeWith) {
        await mergeDuplicate(options.mergeWith, parsedItem);
        showToast("Merged with the existing item.");
      } else {
        await createItem(parsedItem);

        if (options.keepBoth) {
          showToast("Added as a separate item.");
        } else if (!navigator.onLine) {
          showToast("Saved offline. It will sync later.");
        }
      }

      setDuplicatePrompt(null);
      setNaturalPreview(null);
      setNewItem("");
      inputRef.current?.focus();
    } catch (error) {
      console.error(error);
      showToast("Could not add the item.");
    } finally {
      setAdding(false);
    }
  }

  function handleAddItem(event) {
    event.preventDefault();

    const cleanText = newItem.trim();

    if (!cleanText || adding) return;

    const parsed = parseNaturalInput(cleanText);

    if (parsed.hasNaturalData) {
      setNaturalPreview(parsed);
      return;
    }

    saveItem(parsed);
  }

  async function toggleItem(item) {
    const nextCompleted = !item.completed;

    try {
      await updateDoc(
        doc(
          db,
          "users",
          user.uid,
          "lists",
          list.id,
          "items",
          item.id,
        ),
        {
          completed: nextCompleted,
          completedAt: nextCompleted ? serverTimestamp() : null,
          updatedAt: serverTimestamp(),
        },
      );

      if (nextCompleted) {
        await saveHistory(item, {
          incrementCount: false,
          touchUsed: false,
          completed: true,
        });
      }
    } catch (error) {
      console.error(error);
      showToast("Could not update the item.");
    }
  }

  async function reAddCompleted(item) {
    try {
      setAdding(true);

      await updateDoc(
        doc(
          db,
          "users",
          user.uid,
          "lists",
          list.id,
          "items",
          item.id,
        ),
        {
          completed: false,
          completedAt: null,
          timesAdded: (Number(item.timesAdded) || 1) + 1,
          updatedAt: serverTimestamp(),
        },
      );

      await saveHistory(item, {
        incrementCount: true,
      });

      showToast("Added back to the list.");
    } catch (error) {
      console.error(error);
      showToast("Could not add the item back.");
    } finally {
      setAdding(false);
    }
  }

  async function addSuggestion(suggestion) {
    const completedMatch = completedItems.find(
      (item) => normalizeItemKey(item.text) === suggestion.key,
    );

    if (completedMatch) {
      await reAddCompleted(completedMatch);
      return;
    }

    await saveItem({
      rawInput: suggestion.text,
      text: suggestion.text,
      quantity: suggestion.quantity,
      quantityUnit: suggestion.quantityUnit,
      dueAt: null,
      hasNaturalData: false,
    });
  }

  async function editItem(item, text) {
    const cleanText = text.trim();

    if (!cleanText) return;

    try {
      await updateDoc(
        doc(
          db,
          "users",
          user.uid,
          "lists",
          list.id,
          "items",
          item.id,
        ),
        {
          text: cleanText,
          updatedAt: serverTimestamp(),
        },
      );

      await saveHistory(
        {
          ...item,
          text: cleanText,
        },
        {
          incrementCount: false,
        },
      );

      setEditingItem(null);
      showToast("Item updated.");
    } catch (error) {
      console.error(error);
      showToast("Could not edit the item.");
    }
  }

  async function removeItem(item) {
    const itemReference = doc(
      db,
      "users",
      user.uid,
      "lists",
      list.id,
      "items",
      item.id,
    );

    const backup = cloneFirestoreData(item);

    try {
      await deleteDoc(itemReference);

      showUndo("Item deleted.", async () => {
        await setDoc(itemReference, backup);
      });
    } catch (error) {
      console.error(error);
      showToast("Could not delete the item.");
    }
  }

  async function clearCompleted() {
    if (completedItems.length === 0) {
      showToast("There are no completed items.");
      return;
    }

    const backups = completedItems.map((item) => ({
      id: item.id,
      data: cloneFirestoreData(item),
    }));

    try {
      const batch = writeBatch(db);

      completedItems.forEach((item) => {
        batch.delete(
          doc(
            db,
            "users",
            user.uid,
            "lists",
            list.id,
            "items",
            item.id,
          ),
        );
      });

      await batch.commit();

      setMenuOpen(false);

      showUndo("Completed items cleared.", async () => {
        const restoreBatch = writeBatch(db);

        backups.forEach((item) => {
          restoreBatch.set(
            doc(
              db,
              "users",
              user.uid,
              "lists",
              list.id,
              "items",
              item.id,
            ),
            item.data,
          );
        });

        await restoreBatch.commit();
      });
    } catch (error) {
      console.error(error);
      showToast("Could not clear completed items.");
    }
  }

  return (
    <motion.main
      className="screen list-screen"
      initial={{
        opacity: 0,
        x: reduceMotion ? 0 : 12,
      }}
      animate={{ opacity: 1, x: 0 }}
      exit={{
        opacity: 0,
        x: reduceMotion ? 0 : 12,
      }}
    >
      <header className="list-header">
        <motion.button
          className="text-action"
          type="button"
          whileTap={{ scale: 0.94 }}
          onClick={onBack}
        >
          Back
        </motion.button>

        <div className="menu-container">
          <motion.button
            className="menu-button"
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={() => setMenuOpen((value) => !value)}
          >
            •••
          </motion.button>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                className="context-menu"
                initial={{ opacity: 0, y: -5, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -5, scale: 0.97 }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onRename();
                  }}
                >
                  Rename
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onArchive();
                  }}
                >
                  {list.archived ? "Restore list" : "Archive list"}
                </button>

                <button type="button" onClick={clearCompleted}>
                  Clear completed
                </button>

                <button
                  className="danger-action"
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                >
                  Delete list
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      <section className="list-heading">
        <h1>{list.title}</h1>

        <p>
          {remainingItems} {remainingItems === 1 ? "item" : "items"} left
        </p>
      </section>

      {hasSmartContent && (
        <section className="smart-panel">
          <button
            className="smart-panel-header"
            type="button"
            onClick={() => setSmartOpen((value) => !value)}
          >
            <span>
              <strong>Smart picks</strong>
              <small>Based on items used in this list</small>
            </span>

            <span className="smart-chevron">
              {smartOpen ? "−" : "+"}
            </span>
          </button>

          <AnimatePresence initial={false}>
            {smartOpen && (
              <motion.div
                className="smart-panel-content"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                {smartSuggestions.length > 0 && (
                  <div className="smart-group">
                    <span className="smart-label">Frequent</span>

                    <div className="suggestion-chips">
                      {smartSuggestions.map((suggestion) => (
                        <motion.button
                          key={suggestion.key}
                          type="button"
                          disabled={adding}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => addSuggestion(suggestion)}
                        >
                          <span>{suggestion.text}</span>
                          <small>
                            {suggestion.count > 1
                              ? `${suggestion.count}×`
                              : "Add"}
                          </small>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                )}

                {recentCompleted.length > 0 && (
                  <div className="smart-group">
                    <span className="smart-label">
                      Recently completed
                    </span>

                    <div className="recent-completed-list">
                      {recentCompleted.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          disabled={adding}
                          onClick={() => reAddCompleted(item)}
                        >
                          <span>
                            <strong>{item.text}</strong>
                            {getItemMetadata(item) && (
                              <small>{getItemMetadata(item)}</small>
                            )}
                          </span>

                          <b>Re-add</b>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      <section className="items">
        {loading ? (
          <>
            <ItemSkeleton />
            <ItemSkeleton />
            <ItemSkeleton />
          </>
        ) : sortedItems.length > 0 ? (
          <AnimatePresence initial={false}>
            {sortedItems.map((item) => {
              const metadata = getItemMetadata(item);

              return (
                <motion.article
                  layout
                  key={item.id}
                  className={`item-row ${
                    item.completed ? "completed" : ""
                  }`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 18 }}
                  transition={{
                    layout: {
                      type: "spring",
                      stiffness: 420,
                      damping: 34,
                    },
                  }}
                >
                  <motion.button
                    className="check-button"
                    type="button"
                    animate={{
                      backgroundColor: item.completed
                        ? "#111111"
                        : "#ffffff",
                      borderColor: item.completed
                        ? "#111111"
                        : "#cfcfcf",
                    }}
                    whileTap={{ scale: 0.8 }}
                    onClick={() => toggleItem(item)}
                  >
                    <AnimatePresence>
                      {item.completed && (
                        <motion.span
                          initial={{ scale: 0, rotate: -35 }}
                          animate={{ scale: 1, rotate: 0 }}
                          exit={{ scale: 0 }}
                        >
                          ✓
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>

                  <button
                    className="item-text"
                    type="button"
                    onPointerDown={(event) =>
                      startLongPress(event, item)
                    }
                    onPointerUp={cancelLongPress}
                    onPointerCancel={cancelLongPress}
                    onPointerLeave={cancelLongPress}
                    onContextMenu={(event) =>
                      handleContextMenu(event, item)
                    }
                    onClick={() => handleItemTap(item)}
                    onDoubleClick={() => setEditingItem(item)}
                  >
                    <span className="item-main-text">{item.text}</span>

                    {metadata && (
                      <small className="item-metadata">{metadata}</small>
                    )}
                  </button>

                  <div className="item-actions">
                    <button
                      type="button"
                      onClick={() => setEditingItem(item)}
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={() => removeItem(item)}
                    >
                      ×
                    </button>
                  </div>
                </motion.article>
              );
            })}
          </AnimatePresence>
        ) : (
          <motion.div
            className="empty-items"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <h2>Nothing here</h2>
            <p>Add your first item below.</p>
          </motion.div>
        )}
      </section>

      <form className="add-item-bar" onSubmit={handleAddItem}>
        <input
          ref={inputRef}
          value={newItem}
          maxLength={200}
          placeholder="Add an item, date or quantity"
          onChange={(event) => setNewItem(event.target.value)}
        />

        <motion.button
          type="submit"
          disabled={!newItem.trim() || adding}
          whileTap={{ scale: 0.84 }}
        >
          +
        </motion.button>
      </form>

      <AnimatePresence>
        {editingItem && (
          <EditItemSheet
            item={editingItem}
            onClose={() => setEditingItem(null)}
            onSave={(text) => editItem(editingItem, text)}
          />
        )}

        {naturalPreview && (
          <NaturalInputSheet
            parsedItem={naturalPreview}
            adding={adding}
            onClose={() => setNaturalPreview(null)}
            onConfirm={saveItem}
            onPlainText={() =>
              saveItem({
                ...naturalPreview,
                text: naturalPreview.rawInput,
                quantity: null,
                quantityUnit: "",
                dueAt: null,
              })
            }
          />
        )}

        {duplicatePrompt && (
          <DuplicateItemSheet
            duplicate={duplicatePrompt}
            adding={adding}
            onClose={() => setDuplicatePrompt(null)}
            onMerge={() =>
              saveItem(duplicatePrompt.parsedItem, {
                mergeWith: duplicatePrompt.existingItem,
              })
            }
            onKeepBoth={() =>
              saveItem(duplicatePrompt.parsedItem, {
                keepBoth: true,
              })
            }
          />
        )}
      </AnimatePresence>
    </motion.main>
  );
}

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

function SearchSheet({
  user,
  lists,
  onClose,
  onOpenList,
}) {
  const [search, setSearch] = useState("");
  const [itemMap, setItemMap] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!search.trim()) {
      setItemMap({});
      setLoading(false);
      return undefined;
    }

    setLoading(true);

    const unsubscribers = lists.map((list) => {
      const itemsQuery = query(
        collection(
          db,
          "users",
          user.uid,
          "lists",
          list.id,
          "items",
        ),
        orderBy("createdAt", "asc"),
      );

      return onSnapshot(
        itemsQuery,
        (snapshot) => {
          setItemMap((current) => ({
            ...current,
            [list.id]: snapshot.docs.map((itemDocument) => ({
              id: itemDocument.id,
              ...itemDocument.data(),
            })),
          }));

          setLoading(false);
        },
        () => {
          setLoading(false);
        },
      );
    });

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [search, lists, user.uid]);

  const results = useMemo(() => {
    const term = normalize(search);

    if (!term) return [];

    return lists
      .map((list) => {
        const listMatches = normalize(list.title).includes(term);

        const matchingItems = (itemMap[list.id] || []).filter((item) =>
          normalize(
            `${item.text} ${item.rawInput || ""}`,
          ).includes(term),
        );

        if (!listMatches && matchingItems.length === 0) {
          return null;
        }

        return {
          list,
          listMatches,
          matchingItems,
        };
      })
      .filter(Boolean);
  }, [search, lists, itemMap]);

  return (
    <Sheet onClose={onClose}>
      <div className="sheet-content search-sheet">
        <div className="sheet-handle" />

        <header className="sheet-header">
          <h2>Search</h2>

          <button type="button" onClick={onClose}>
            Done
          </button>
        </header>

        <input
          className="sheet-input"
          autoFocus
          value={search}
          placeholder="Search lists and items"
          onChange={(event) => setSearch(event.target.value)}
        />

        <div className="search-results">
          {!search.trim() ? (
            <p className="search-message">
              Search across all active lists.
            </p>
          ) : loading && results.length === 0 ? (
            <p className="search-message">Searching...</p>
          ) : results.length === 0 ? (
            <p className="search-message">No matches found.</p>
          ) : (
            results.map((result) => (
              <button
                key={result.list.id}
                className="search-result"
                type="button"
                onClick={() => onOpenList(result.list)}
              >
                <strong>{result.list.title}</strong>

                {result.matchingItems.slice(0, 3).map((item) => (
                  <span key={item.id}>{item.text}</span>
                ))}

                {result.listMatches &&
                  result.matchingItems.length === 0 && (
                    <span>List title matches</span>
                  )}
              </button>
            ))
          )}
        </div>
      </div>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/* Sheets                                                                     */
/* -------------------------------------------------------------------------- */

function DuplicateItemSheet({
  duplicate,
  adding,
  onClose,
  onMerge,
  onKeepBoth,
}) {
  const existingMetadata = getItemMetadata(
    duplicate.existingItem,
  );
  const incomingMetadata = getItemMetadata(
    duplicate.parsedItem,
  );
  const canMergeQuantity = quantitiesCanMerge(
    duplicate.existingItem,
    duplicate.parsedItem,
  );

  return (
    <Sheet onClose={onClose}>
      <div className="sheet-content duplicate-sheet">
        <div className="sheet-handle" />

        <header className="sheet-header">
          <div>
            <h2>Already on your list</h2>
            <p className="sheet-subtitle">
              Lyst found a matching active item.
            </p>
          </div>

          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </header>

        <div className="duplicate-comparison">
          <div>
            <span>Existing</span>
            <strong>{duplicate.existingItem.text}</strong>
            {existingMetadata && <small>{existingMetadata}</small>}
          </div>

          <div>
            <span>New entry</span>
            <strong>{duplicate.parsedItem.text}</strong>
            {incomingMetadata && <small>{incomingMetadata}</small>}
          </div>
        </div>

        {!canMergeQuantity && (
          <p className="duplicate-note">
            The units differ, so merging keeps the newest quantity and
            unit instead of adding them together.
          </p>
        )}

        <div className="duplicate-actions">
          <motion.button
            className="primary-button"
            type="button"
            disabled={adding}
            whileTap={{ scale: 0.975 }}
            onClick={onMerge}
          >
            {adding ? "Merging..." : "Merge details"}
          </motion.button>

          <button
            type="button"
            disabled={adding}
            onClick={onKeepBoth}
          >
            Keep both
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function NaturalInputSheet({
  parsedItem,
  adding,
  onClose,
  onConfirm,
  onPlainText,
}) {
  const [text, setText] = useState(parsedItem.text);
  const [quantity, setQuantity] = useState(
    parsedItem.quantity ?? "",
  );
  const [quantityUnit, setQuantityUnit] = useState(
    parsedItem.quantityUnit || "",
  );
  const [dateValue, setDateValue] = useState(
    formatDateForInput(parsedItem.dueAt),
  );
  const [timeValue, setTimeValue] = useState(
    formatTimeForInput(parsedItem.dueAt) || "12:00",
  );
  const [validationMessage, setValidationMessage] = useState(
    parsedItem.warning || "",
  );

  const previewDueAt = combineLocalDateAndTime(
    dateValue,
    timeValue,
  );
  const dueLabel = formatDueDate(previewDueAt);

  function submitParsedItem(event) {
    event.preventDefault();

    const dueAt = combineLocalDateAndTime(
      dateValue,
      timeValue,
    );

    if (dateValue && !dueAt) {
      setValidationMessage("Choose a valid date and time.");
      return;
    }

    const numericQuantity =
      quantity === "" ? null : Number(quantity);

    if (
      numericQuantity !== null &&
      (!Number.isFinite(numericQuantity) || numericQuantity < 0)
    ) {
      setValidationMessage("Quantity must be zero or greater.");
      return;
    }

    setValidationMessage("");

    onConfirm({
      ...parsedItem,
      text,
      quantity: numericQuantity,
      quantityUnit: quantityUnit.trim(),
      dueAt,
    });
  }

  return (
    <Sheet onClose={onClose}>
      <form
        className="sheet-content natural-sheet"
        onSubmit={submitParsedItem}
      >
        <div className="sheet-handle" />

        <header className="sheet-header">
          <div>
            <h2>Confirm item</h2>
            <p className="sheet-subtitle">
              Review what Lyst understood before saving.
            </p>
          </div>

          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </header>

        <label className="natural-field">
          <span>Item</span>

          <input
            className="sheet-input"
            autoFocus
            value={text}
            maxLength={160}
            onChange={(event) => setText(event.target.value)}
          />
        </label>

        <div className="natural-grid">
          <label className="natural-field">
            <span>Quantity</span>

            <input
              className="sheet-input"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={quantity}
              placeholder="None"
              onChange={(event) => setQuantity(event.target.value)}
            />
          </label>

          <label className="natural-field">
            <span>Unit</span>

            <input
              className="sheet-input"
              value={quantityUnit}
              placeholder="Optional"
              onChange={(event) =>
                setQuantityUnit(event.target.value)
              }
            />
          </label>
        </div>

        <div className="natural-grid">
          <label className="natural-field">
            <span>Date</span>

            <input
              className="sheet-input"
              type="date"
              value={dateValue}
              onChange={(event) => {
                setDateValue(event.target.value);

                if (!event.target.value) {
                  setValidationMessage("");
                }
              }}
            />
          </label>

          <label className="natural-field">
            <span>Time</span>

            <input
              className="sheet-input"
              type="time"
              value={timeValue}
              disabled={!dateValue}
              onChange={(event) => setTimeValue(event.target.value)}
            />
          </label>
        </div>

        {dueLabel && (
          <div className="parsed-date">
            <span>Due</span>
            <strong>{dueLabel}</strong>
          </div>
        )}

        {validationMessage && (
          <p className="natural-warning">{validationMessage}</p>
        )}

        <motion.button
          className="primary-button"
          type="submit"
          disabled={!text.trim() || adding}
          whileTap={{ scale: 0.975 }}
        >
          {adding ? "Adding..." : "Add item"}
        </motion.button>

        <button
          className="plain-text-button"
          type="button"
          disabled={adding}
          onClick={onPlainText}
        >
          Add original text without parsing
        </button>
      </form>
    </Sheet>
  );
}

function NewListSheet({ onClose, onCreate }) {
  const [title, setTitle] = useState("");

  return (
    <Sheet onClose={onClose}>
      <form
        className="sheet-content"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate(title);
        }}
      >
        <div className="sheet-handle" />

        <header className="sheet-header">
          <h2>New list</h2>

          <button type="button" onClick={onClose}>
            Done
          </button>
        </header>

        <input
          className="sheet-input"
          autoFocus
          value={title}
          maxLength={40}
          placeholder="List name"
          onChange={(event) => setTitle(event.target.value)}
        />

        <motion.button
          className="primary-button"
          type="submit"
          disabled={!title.trim()}
          whileTap={{ scale: 0.975 }}
        >
          Create list
        </motion.button>
      </form>
    </Sheet>
  );
}

function EditListSheet({ list, onClose, onSave }) {
  const [title, setTitle] = useState(list.title);

  return (
    <Sheet onClose={onClose}>
      <form
        className="sheet-content"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(title);
        }}
      >
        <div className="sheet-handle" />

        <header className="sheet-header">
          <h2>Rename list</h2>

          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </header>

        <input
          className="sheet-input"
          autoFocus
          value={title}
          maxLength={40}
          onChange={(event) => setTitle(event.target.value)}
        />

        <motion.button
          className="primary-button"
          type="submit"
          disabled={!title.trim()}
          whileTap={{ scale: 0.975 }}
        >
          Save
        </motion.button>
      </form>
    </Sheet>
  );
}

function EditItemSheet({ item, onClose, onSave }) {
  const [text, setText] = useState(item.text);

  return (
    <Sheet onClose={onClose}>
      <form
        className="sheet-content"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(text);
        }}
      >
        <div className="sheet-handle" />

        <header className="sheet-header">
          <h2>Edit item</h2>

          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </header>

        <input
          className="sheet-input"
          autoFocus
          value={text}
          maxLength={160}
          onChange={(event) => setText(event.target.value)}
        />

        <motion.button
          className="primary-button"
          type="submit"
          disabled={!text.trim()}
          whileTap={{ scale: 0.975 }}
        >
          Save
        </motion.button>
      </form>
    </Sheet>
  );
}

function ArchiveSheet({
  lists,
  onClose,
  onRestore,
  onOpenList,
}) {
  return (
    <Sheet onClose={onClose}>
      <div className="sheet-content">
        <div className="sheet-handle" />

        <header className="sheet-header">
          <h2>Archived</h2>

          <button type="button" onClick={onClose}>
            Done
          </button>
        </header>

        <div className="archive-list">
          {lists.length === 0 ? (
            <p className="search-message">No archived lists.</p>
          ) : (
            lists.map((list) => (
              <div className="archive-row" key={list.id}>
                <button
                  type="button"
                  onClick={() => onOpenList(list)}
                >
                  {list.title}
                </button>

                <button
                  type="button"
                  onClick={() => onRestore(list)}
                >
                  Restore
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </Sheet>
  );
}

function ConfirmationSheet({
  confirmation,
  onClose,
}) {
  return (
    <Sheet onClose={onClose}>
      <div className="sheet-content confirmation-content">
        <div className="sheet-handle" />

        <h2>{confirmation.title}</h2>
        <p>{confirmation.message}</p>

        <div className="confirmation-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>

          <button
            className={confirmation.danger ? "danger-confirm" : ""}
            type="button"
            onClick={confirmation.action}
          >
            {confirmation.confirmLabel}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function AccountSheet({
  user,
  isOnline,
  onClose,
  onSignOut,
}) {
  return (
    <Sheet onClose={onClose}>
      <div className="sheet-content">
        <div className="sheet-handle" />

        <header className="sheet-header">
          <h2>Account</h2>

          <button type="button" onClick={onClose}>
            Done
          </button>
        </header>

        <div className="account-row">
          <div className="account-avatar">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt=""
                referrerPolicy="no-referrer"
              />
            ) : (
              getInitials(user)
            )}
          </div>

          <div>
            <strong>{user.displayName || "Lyst user"}</strong>
            <span>{user.email}</span>
          </div>
        </div>

        <div className="offline-access-note">
          <strong>{isOnline ? "Online" : "Offline"}</strong>
          <span>Offline access lasts for 60 days.</span>
        </div>

        <motion.button
          className="primary-button"
          type="button"
          whileTap={{ scale: 0.975 }}
          onClick={onSignOut}
        >
          Sign out
        </motion.button>
      </div>
    </Sheet>
  );
}

function Sheet({ children, onClose }) {
  return (
    <motion.div
      className="sheet-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <motion.div
        className="sheet"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{
          type: "spring",
          stiffness: 380,
          damping: 35,
        }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* Supporting UI                                                              */
/* -------------------------------------------------------------------------- */

function UndoBar({ undoAction, onUndo }) {
  return (
    <AnimatePresence>
      {undoAction && (
        <motion.div
          className="undo-bar"
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
        >
          <span>{undoAction.message}</span>

          <button type="button" onClick={onUndo}>
            Undo
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function OfflineExpiredScreen({
  isOnline,
  onRetry,
  onSignOut,
}) {
  return (
    <main className="offline-expired-page">
      <section className="offline-expired-panel">
        <h1>Connect to continue</h1>

        <p>Your 60-day offline period has expired.</p>

        <button
          className="primary-button"
          type="button"
          disabled={!isOnline}
          onClick={onRetry}
        >
          {isOnline ? "Refresh access" : "Waiting for internet"}
        </button>

        <button
          className="offline-sign-out"
          type="button"
          onClick={onSignOut}
        >
          Sign out
        </button>
      </section>
    </main>
  );
}

function LoadingScreen({ reduceMotion }) {
  return (
    <main className="loading-page">
      <motion.strong
        animate={
          reduceMotion
            ? {}
            : {
                opacity: [0.35, 1, 0.35],
              }
        }
        transition={{
          duration: 1.25,
          repeat: Infinity,
        }}
      >
        Lyst
      </motion.strong>
    </main>
  );
}

function SetupScreen() {
  return (
    <main className="setup-page">
      <section className="setup-card">
        <h1>Connect Firebase</h1>

        <p>
          Add Firebase values to <code>.env.local</code>.
        </p>
      </section>
    </main>
  );
}

function Toast({ message }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          className="toast"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ListSkeleton() {
  return (
    <div className="list-row skeleton-row">
      <span className="skeleton skeleton-list-title" />
    </div>
  );
}

function ItemSkeleton() {
  return (
    <div className="item-row">
      <span className="skeleton skeleton-circle" />
      <span className="skeleton skeleton-item-text" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* CSS                                                                        */
/* -------------------------------------------------------------------------- */

function GlobalStyles() {
  return <style>{styles}</style>;
}

const styles = `
  :root {
    font-family:
      "Avenir Next",
      Avenir,
      "SF Pro Display",
      "SF Pro Text",
      -apple-system,
      BlinkMacSystemFont,
      sans-serif;

    color: #111111;
    background: #ffffff;
    font-synthesis: none;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
  }

  * {
    box-sizing: border-box;
  }

  html,
  body,
  #root,
  .app {
    min-width: 320px;
    min-height: 100%;
    margin: 0;
    background: #ffffff;
  }

  body {
    min-height: 100vh;
    min-height: 100dvh;
    overflow-x: hidden;
    overscroll-behavior: none;
  }

  body,
  button,
  input {
    font-family: inherit;
  }

  button,
  input {
    -webkit-tap-highlight-color: transparent;
  }

  button {
    color: inherit;
  }

  h1,
  h2,
  p {
    margin-top: 0;
  }

  .screen {
    position: relative;
    width: min(100%, 620px);
    min-height: 100vh;
    min-height: 100dvh;
    margin: 0 auto;
    padding:
      max(19px, env(safe-area-inset-top))
      17px
      max(86px, calc(env(safe-area-inset-bottom) + 68px));
  }

  .offline-indicator {
    position: fixed;
    z-index: 80;
    top: max(8px, env(safe-area-inset-top));
    left: 50%;
    padding: 5px 10px;
    transform: translateX(-50%);
    border: 1px solid #dedede;
    border-radius: 999px;
    background: #ffffff;
    font-size: 0.68rem;
    font-weight: 700;
  }

  .home-header,
  .list-header,
  .list-toolbar,
  .sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .home-header {
    margin-bottom: 17px;
  }

  .app-label {
    display: block;
    margin-bottom: 4px;
    color: #777777;
    font-size: 0.71rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .home-header h1,
  .list-heading h1 {
    margin: 0;
    font-size: 2.05rem;
    font-weight: 730;
    line-height: 1;
    letter-spacing: -0.055em;
  }

  .avatar-button {
    display: grid;
    width: 38px;
    height: 38px;
    padding: 0;
    place-items: center;
    overflow: hidden;
    border: 1px solid #dddddd;
    border-radius: 50%;
    background: #ffffff;
    font-size: 0.72rem;
    font-weight: 750;
  }

  .avatar-button img,
  .account-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .home-actions {
    display: flex;
    gap: 8px;
    margin-bottom: 18px;
  }

  .home-actions button {
    min-height: 34px;
    padding: 0 12px;
    border: 1px solid #e2e2e2;
    border-radius: 11px;
    background: #ffffff;
    font-size: 0.76rem;
    font-weight: 650;
  }

  .list-toolbar {
    margin-bottom: 8px;
  }

  .list-toolbar span {
    color: #777777;
    font-size: 0.81rem;
  }

  .create-button {
    min-height: 33px;
    padding: 0 13px;
    border: 0;
    border-radius: 11px;
    color: #ffffff;
    background: #111111;
    font-size: 0.78rem;
    font-weight: 700;
  }

  .smart-panel {
    margin: -4px 0 18px;
    overflow: hidden;
    border: 1px solid #e7e7e7;
    border-radius: 16px;
    background: #ffffff;
  }

  .smart-panel-header {
    display: flex;
    width: 100%;
    min-height: 55px;
    align-items: center;
    justify-content: space-between;
    padding: 10px 13px;
    text-align: left;
    border: 0;
    background: #ffffff;
  }

  .smart-panel-header > span:first-child {
    display: grid;
    gap: 2px;
  }

  .smart-panel-header strong {
    font-size: 0.82rem;
  }

  .smart-panel-header small {
    color: #888888;
    font-size: 0.66rem;
  }

  .smart-chevron {
    display: grid;
    width: 25px;
    height: 25px;
    place-items: center;
    border-radius: 8px;
    color: #666666;
    background: #f4f4f4;
    font-size: 1rem;
  }

  .smart-panel-content {
    overflow: hidden;
    border-top: 1px solid #eeeeee;
  }

  .smart-group {
    padding: 11px 12px 12px;
  }

  .smart-group + .smart-group {
    border-top: 1px solid #eeeeee;
  }

  .smart-label {
    display: block;
    margin-bottom: 8px;
    color: #777777;
    font-size: 0.65rem;
    font-weight: 720;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .suggestion-chips {
    display: flex;
    gap: 7px;
    overflow-x: auto;
    padding-bottom: 2px;
    scrollbar-width: none;
  }

  .suggestion-chips::-webkit-scrollbar {
    display: none;
  }

  .suggestion-chips button {
    display: flex;
    min-width: max-content;
    min-height: 35px;
    gap: 8px;
    align-items: center;
    padding: 0 10px;
    border: 1px solid #dfdfdf;
    border-radius: 11px;
    background: #ffffff;
  }

  .suggestion-chips button:disabled,
  .recent-completed-list button:disabled {
    opacity: 0.4;
  }

  .suggestion-chips span {
    font-size: 0.76rem;
    font-weight: 650;
  }

  .suggestion-chips small {
    color: #888888;
    font-size: 0.62rem;
    font-weight: 700;
  }

  .recent-completed-list {
    display: grid;
  }

  .recent-completed-list > button {
    display: flex;
    min-height: 44px;
    align-items: center;
    justify-content: space-between;
    padding: 7px 1px;
    text-align: left;
    border: 0;
    border-bottom: 1px solid #f0f0f0;
    background: #ffffff;
  }

  .recent-completed-list > button:last-child {
    border-bottom: 0;
  }

  .recent-completed-list > button > span {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .recent-completed-list strong {
    overflow: hidden;
    font-size: 0.78rem;
    font-weight: 640;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .recent-completed-list small {
    color: #888888;
    font-size: 0.65rem;
  }

  .recent-completed-list b {
    flex: 0 0 auto;
    color: #555555;
    font-size: 0.67rem;
  }

  .lists,
  .items {
    border-top: 1px solid #eeeeee;
  }

  .list-row {
    display: flex;
    width: 100%;
    min-height: 56px;
    align-items: center;
    justify-content: space-between;
    padding: 0 4px;
    text-align: left;
    border: 0;
    border-bottom: 1px solid #eeeeee;
    background: #ffffff;
  }

  .list-title-text {
    overflow: hidden;
    font-size: 1rem;
    font-weight: 640;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-arrow {
    color: #aaaaaa;
    font-size: 1.5rem;
  }

  .floating-button {
    position: fixed;
    right: max(17px, calc((100vw - 620px) / 2 + 17px));
    bottom: max(16px, calc(env(safe-area-inset-bottom) + 10px));
    display: none;
    width: 48px;
    height: 48px;
    padding: 0;
    place-items: center;
    border: 0;
    border-radius: 16px;
    color: #ffffff;
    background: #111111;
    font-size: 1.55rem;
  }

  .empty-state,
  .empty-items {
    display: flex;
    min-height: 280px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .empty-state h2,
  .empty-items h2 {
    margin-bottom: 6px;
    font-size: 1.08rem;
  }

  .empty-state p,
  .empty-items p {
    margin-bottom: 18px;
    color: #777777;
    font-size: 0.85rem;
  }

  .primary-button {
    display: flex;
    width: 100%;
    min-height: 45px;
    align-items: center;
    justify-content: center;
    padding: 0 15px;
    border: 0;
    border-radius: 13px;
    color: #ffffff;
    background: #111111;
    font-size: 0.86rem;
    font-weight: 700;
  }

  .primary-button:disabled {
    opacity: 0.35;
  }

  .small-button {
    width: auto;
  }

  .list-header {
    margin-bottom: 23px;
  }

  .text-action {
    padding: 7px 0;
    border: 0;
    background: transparent;
    font-size: 0.84rem;
    font-weight: 680;
  }

  .menu-container {
    position: relative;
  }

  .menu-button {
    width: 38px;
    height: 34px;
    border: 0;
    border-radius: 10px;
    background: #f4f4f4;
    font-size: 0.82rem;
    font-weight: 760;
  }

  .context-menu {
    position: absolute;
    z-index: 20;
    top: 40px;
    right: 0;
    width: 175px;
    padding: 5px;
    border: 1px solid #e4e4e4;
    border-radius: 13px;
    background: #ffffff;
    box-shadow: 0 16px 42px rgba(0, 0, 0, 0.12);
  }

  .context-menu button {
    width: 100%;
    padding: 10px;
    text-align: left;
    border: 0;
    border-radius: 9px;
    background: transparent;
    font-size: 0.78rem;
    font-weight: 620;
  }

  .context-menu .danger-action {
    color: #c92323;
  }

  .list-heading {
    margin-bottom: 20px;
  }

  .list-heading p {
    margin: 6px 0 0;
    color: #777777;
    font-size: 0.81rem;
  }

  .item-row {
    display: flex;
    min-height: 53px;
    gap: 11px;
    align-items: center;
    border-bottom: 1px solid #eeeeee;
    -webkit-user-select: none;
    user-select: none;
  }

  .check-button {
    display: grid;
    width: 23px;
    height: 23px;
    flex: 0 0 auto;
    padding: 0;
    place-items: center;
    border: 1.5px solid #cfcfcf;
    border-radius: 50%;
    color: #ffffff;
    background: #ffffff;
  }

  .check-button span {
    font-size: 0.72rem;
    font-weight: 800;
  }

  .item-text {
    display: flex;
    min-width: 0;
    flex: 1;
    padding: 11px 0;
    flex-direction: column;
    gap: 3px;
    text-align: left;
    border: 0;
    background: transparent;
    touch-action: manipulation;
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }

  .item-main-text {
    position: relative;
    width: fit-content;
    max-width: 100%;
    font-size: 0.98rem;
    line-height: 1.3;
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }

  .item-main-text::after {
    position: absolute;
    top: 51%;
    left: 0;
    width: 100%;
    height: 1px;
    content: "";
    transform: scaleX(0);
    transform-origin: left;
    background: currentColor;
    transition: transform 250ms ease;
  }

  .item-metadata {
    color: #888888;
    font-size: 0.7rem;
    font-weight: 520;
    line-height: 1.35;
  }

  .item-row.completed .item-main-text,
  .item-row.completed .item-metadata {
    color: #999999;
  }

  .item-row.completed .item-main-text::after {
    transform: scaleX(1);
  }

  .item-actions {
    display: flex;
    gap: 3px;
  }

  .item-actions button {
    min-width: 32px;
    height: 31px;
    padding: 0 7px;
    border: 0;
    border-radius: 9px;
    color: #777777;
    background: transparent;
    font-size: 0.7rem;
  }

  .item-actions button:last-child {
    font-size: 1.2rem;
  }

  .add-item-bar {
    position: fixed;
    z-index: 10;
    right: max(13px, calc((100vw - 620px) / 2 + 13px));
    bottom: max(11px, env(safe-area-inset-bottom));
    left: max(13px, calc((100vw - 620px) / 2 + 13px));
    display: flex;
    max-width: 594px;
    min-height: 51px;
    gap: 8px;
    align-items: center;
    margin: auto;
    padding: 5px 5px 5px 14px;
    border: 1px solid #dddddd;
    border-radius: 16px;
    background: #ffffff;
    box-shadow: 0 11px 32px rgba(0, 0, 0, 0.11);
  }

  .add-item-bar input {
    min-width: 0;
    flex: 1;
    border: 0;
    outline: 0;
    font-size: 0.9rem;
  }

  .add-item-bar button {
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: 12px;
    color: #ffffff;
    background: #111111;
    font-size: 1.4rem;
  }

  .add-item-bar button:disabled {
    opacity: 0.25;
  }

  .sheet-backdrop {
    position: fixed;
    z-index: 100;
    inset: 0;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding: 8px;
    background: rgba(0, 0, 0, 0.2);
    backdrop-filter: blur(5px);
  }

  .sheet {
    width: min(100%, 460px);
    max-height: calc(100dvh - 16px);
    overflow-y: auto;
    border: 1px solid #e4e4e4;
    border-radius: 23px;
    background: #ffffff;
    box-shadow: 0 24px 65px rgba(0, 0, 0, 0.18);
  }

  .sheet-content {
    padding: 9px 17px 18px;
  }

  .sheet-handle {
    width: 34px;
    height: 4px;
    margin: 0 auto 17px;
    border-radius: 99px;
    background: #d4d4d4;
  }

  .sheet-header {
    margin-bottom: 17px;
  }

  .sheet-header > div {
    min-width: 0;
  }

  .sheet-header h2 {
    margin: 0;
    font-size: 1.35rem;
  }

  .sheet-subtitle {
    margin: 4px 0 0;
    color: #777777;
    font-size: 0.73rem;
  }

  .sheet-header button {
    border: 0;
    background: transparent;
    font-size: 0.8rem;
    font-weight: 700;
  }

  .sheet-input,
  .auth-form input {
    width: 100%;
    min-height: 45px;
    padding: 0 13px;
    border: 1px solid #dddddd;
    border-radius: 12px;
    outline: 0;
    font-size: 0.88rem;
  }

  .sheet-input {
    margin-bottom: 12px;
  }

  .duplicate-comparison {
    display: grid;
    gap: 8px;
    margin-bottom: 12px;
  }

  .duplicate-comparison > div {
    display: grid;
    gap: 3px;
    padding: 11px 12px;
    border: 1px solid #e6e6e6;
    border-radius: 12px;
  }

  .duplicate-comparison span {
    color: #888888;
    font-size: 0.64rem;
    font-weight: 700;
    text-transform: uppercase;
  }

  .duplicate-comparison strong {
    font-size: 0.86rem;
  }

  .duplicate-comparison small {
    color: #777777;
    font-size: 0.68rem;
  }

  .duplicate-note {
    margin: 0 1px 13px;
    color: #777777;
    font-size: 0.7rem;
    line-height: 1.45;
  }

  .duplicate-actions {
    display: grid;
    gap: 8px;
  }

  .duplicate-actions > button:last-child {
    min-height: 43px;
    border: 1px solid #dddddd;
    border-radius: 12px;
    background: #ffffff;
    font-size: 0.8rem;
    font-weight: 700;
  }

  .natural-field {
    display: block;
  }

  .natural-field > span {
    display: block;
    margin: 0 0 6px 2px;
    color: #777777;
    font-size: 0.7rem;
    font-weight: 650;
  }

  .natural-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 9px;
  }

  .parsed-date {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 13px;
    padding: 12px 2px;
    border-top: 1px solid #eeeeee;
    border-bottom: 1px solid #eeeeee;
  }

  .parsed-date span {
    color: #777777;
    font-size: 0.74rem;
  }

  .parsed-date strong {
    font-size: 0.79rem;
  }

  .natural-warning {
    margin: -2px 0 13px;
    color: #b42318;
    font-size: 0.73rem;
    line-height: 1.4;
  }

  .plain-text-button {
    width: 100%;
    margin-top: 13px;
    padding: 5px;
    border: 0;
    color: #666666;
    background: transparent;
    font-size: 0.7rem;
    font-weight: 650;
  }

  .plain-text-button:disabled {
    opacity: 0.4;
  }

  .archive-row {
    display: flex;
    min-height: 52px;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #eeeeee;
  }

  .archive-row button {
    border: 0;
    background: transparent;
    font-size: 0.84rem;
  }

  .archive-row button:first-child {
    flex: 1;
    text-align: left;
    font-weight: 650;
  }

  .archive-row button:last-child {
    color: #666666;
    font-size: 0.72rem;
  }

  .search-results {
    max-height: 55vh;
    overflow-y: auto;
  }

  .search-message {
    padding: 24px 0;
    color: #777777;
    text-align: center;
    font-size: 0.82rem;
  }

  .search-result {
    display: block;
    width: 100%;
    padding: 13px 0;
    text-align: left;
    border: 0;
    border-bottom: 1px solid #eeeeee;
    background: #ffffff;
  }

  .search-result strong,
  .search-result span {
    display: block;
  }

  .search-result strong {
    margin-bottom: 5px;
    font-size: 0.9rem;
  }

  .search-result span {
    margin-top: 3px;
    color: #777777;
    font-size: 0.74rem;
  }

  .confirmation-content h2 {
    margin-bottom: 8px;
    font-size: 1.35rem;
  }

  .confirmation-content p {
    margin-bottom: 18px;
    color: #777777;
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .confirmation-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 9px;
  }

  .confirmation-actions button {
    min-height: 44px;
    border: 0;
    border-radius: 12px;
    background: #f1f1f1;
    font-weight: 700;
  }

  .confirmation-actions .danger-confirm {
    color: #ffffff;
    background: #111111;
  }

  .account-row {
    display: flex;
    gap: 11px;
    align-items: center;
    margin-bottom: 12px;
    padding: 11px 0;
    border-top: 1px solid #eeeeee;
    border-bottom: 1px solid #eeeeee;
  }

  .account-avatar {
    display: grid;
    width: 41px;
    height: 41px;
    place-items: center;
    overflow: hidden;
    border-radius: 50%;
    color: #ffffff;
    background: #111111;
    font-size: 0.7rem;
  }

  .account-row strong,
  .account-row span,
  .offline-access-note strong,
  .offline-access-note span {
    display: block;
  }

  .account-row span,
  .offline-access-note span {
    color: #777777;
    font-size: 0.74rem;
  }

  .offline-access-note {
    margin-bottom: 14px;
  }

  .auth-page,
  .setup-page,
  .loading-page,
  .offline-expired-page {
    min-height: 100vh;
    min-height: 100dvh;
    padding: 16px;
    background: #ffffff;
  }

  .auth-page,
  .setup-page,
  .offline-expired-page {
    display: grid;
    place-items: center;
  }

  .auth-panel,
  .offline-expired-panel {
    width: min(100%, 330px);
    padding: 22px 19px 19px;
    border: 1px solid #e6e6e6;
    border-radius: 20px;
    background: #ffffff;
  }

  .auth-name {
    margin-bottom: 23px;
    font-size: 1.4rem;
    font-weight: 780;
  }

  .auth-heading {
    margin-bottom: 18px;
  }

  .auth-heading h1 {
    margin-bottom: 5px;
    font-size: 1.65rem;
  }

  .auth-heading p {
    margin: 0;
    color: #777777;
    font-size: 0.82rem;
  }

  .google-button {
    display: flex;
    width: 100%;
    min-height: 44px;
    gap: 9px;
    align-items: center;
    justify-content: center;
    border: 1px solid #dddddd;
    border-radius: 12px;
    background: #ffffff;
  }

  .google-mark {
    display: grid;
    width: 19px;
    height: 19px;
    place-items: center;
    border: 1px solid #d8d8d8;
    border-radius: 50%;
    font-size: 0.68rem;
    font-weight: 800;
  }

  .divider {
    display: flex;
    align-items: center;
    margin: 15px 0;
    color: #999999;
    font-size: 0.66rem;
  }

  .divider::before,
  .divider::after {
    height: 1px;
    flex: 1;
    content: "";
    background: #e8e8e8;
  }

  .divider span {
    padding: 0 9px;
  }

  .auth-form {
    display: grid;
    gap: 9px;
  }

  .forgot-button,
  .switch-button,
  .offline-sign-out {
    border: 0;
    color: #666666;
    background: transparent;
    font-size: 0.71rem;
  }

  .forgot-button {
    justify-self: end;
  }

  .switch-button {
    width: 100%;
    margin-top: 15px;
  }

  .loading-page {
    display: grid;
    place-items: center;
  }

  .toast,
  .undo-bar {
    position: fixed;
    z-index: 300;
    right: 14px;
    left: 14px;
    width: fit-content;
    max-width: calc(100vw - 28px);
    margin: auto;
    border-radius: 11px;
    color: #ffffff;
    background: #111111;
  }

  .toast {
    bottom: 16px;
    padding: 10px 13px;
    font-size: 0.75rem;
  }

  .undo-bar {
    bottom: 16px;
    display: flex;
    min-width: min(330px, calc(100vw - 28px));
    align-items: center;
    justify-content: space-between;
    padding: 11px 12px 11px 14px;
    font-size: 0.76rem;
  }

  .undo-bar button {
    border: 0;
    color: #ffffff;
    background: transparent;
    font-weight: 800;
  }

  .skeleton {
    display: block;
    border-radius: 99px;
    background: #ededed;
  }

  .skeleton-list-title {
    width: 42%;
    height: 10px;
  }

  .skeleton-circle {
    width: 23px;
    height: 23px;
  }

  .skeleton-item-text {
    width: 58%;
    height: 10px;
  }

  @media (max-width: 600px) {
    .screen {
      padding-right: 15px;
      padding-left: 15px;
    }

    .create-button {
      display: none;
    }

    .floating-button {
      display: grid;
    }

    .home-actions {
      overflow-x: auto;
    }

    .item-actions button:first-child {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
`;