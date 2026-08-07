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

const DAYPART_TIMES = {
  morning: { hours: 9, minutes: 0 },
  noon: { hours: 12, minutes: 0 },
  midday: { hours: 12, minutes: 0 },
  afternoon: { hours: 15, minutes: 0 },
  evening: { hours: 18, minutes: 0 },
  tonight: { hours: 20, minutes: 0 },
  night: { hours: 21, minutes: 0 },
  midnight: { hours: 0, minutes: 0 },
  eod: { hours: 17, minutes: 0 },
  cob: { hours: 17, minutes: 0 },
};

const QUANTITY_UNIT_ALIASES = {
  bottle: "bottle", bottles: "bottle",
  pack: "pack", packs: "pack",
  box: "box", boxes: "box",
  bag: "bag", bags: "bag",
  piece: "piece", pieces: "piece",
  item: "item", items: "item",
  pair: "pair", pairs: "pair",
  set: "set", sets: "set",
  can: "can", cans: "can",
  jar: "jar", jars: "jar",
  tin: "tin", tins: "tin",
  roll: "roll", rolls: "roll",
  sheet: "sheet", sheets: "sheet",
  tablet: "tablet", tablets: "tablet",
  capsule: "capsule", capsules: "capsule",
  cup: "cup", cups: "cup",
  tablespoon: "tbsp", tablespoons: "tbsp", tbsp: "tbsp",
  teaspoon: "tsp", teaspoons: "tsp", tsp: "tsp",
  ounce: "oz", ounces: "oz", oz: "oz",
  pound: "lb", pounds: "lb", lb: "lb", lbs: "lb",
  kilogram: "kg", kilograms: "kg", kg: "kg", kgs: "kg",
  gram: "g", grams: "g", g: "g",
  milligram: "mg", milligrams: "mg", mg: "mg",
  litre: "L", litres: "L", liter: "L", liters: "L", l: "L",
  millilitre: "ml", millilitres: "ml", milliliter: "ml", milliliters: "ml", ml: "ml",
  metre: "m", metres: "m", meter: "m", meters: "m", m: "m",
  centimetre: "cm", centimetres: "cm", centimeter: "cm", centimeters: "cm", cm: "cm",
  dozen: "dozen", dozens: "dozen",
};

const QUANTITY_UNITS = Object.keys(QUANTITY_UNIT_ALIASES);

const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90, hundred: 100, a: 1, an: 1, couple: 2,
  few: 3, dozen: 12,
};

function getInitials(user) {
  const source = user?.displayName || user?.email || "L";
  return source.split(/[\s@]+/).slice(0, 2).map((word) => word.charAt(0).toUpperCase()).join("");
}

function getEmailInitial(user) {
  return (user?.email?.trim()?.charAt(0) || "L").toUpperCase();
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

function normalize(value) { return value.trim().toLowerCase(); }
function cloneFirestoreData(value) { const { id: _ignoredId, ...data } = value; return data; }
function startOfDay(date) { const result = new Date(date); result.setHours(0, 0, 0, 0); return result; }
function addDays(date, amount) { const result = new Date(date); result.setDate(result.getDate() + amount); return result; }
function isValidDate(value) { return value instanceof Date && !Number.isNaN(value.getTime()); }
function setLocalTime(date, hours, minutes) { const result = new Date(date); result.setHours(hours, minutes, 0, 0); return result; }
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function normalizeNaturalInput(input) {
  return input
    .normalize("NFKC")
    .replace(/[–—]/g, "-")
    .replace(/\b(?:tmrw|tmr)\b/gi, "tomorrow")
    .replace(/\btonite\b/gi, "tonight")
    .replace(/\bnxt\s+/gi, "next ")
    .replace(/\b(\d{1,2})\s*([ap])\s*\.?\s*m\.?\b/gi, "$1$2m")
    .replace(/\b(\d{1,2})\s*[:.\-]\s*(\d{2})\s*([ap])\s*\.?\s*m\.?\b/gi, "$1:$2$3m")
    .replace(/\b(?:at|by|around|about)\s+(\d{1,2})(\d{2})\s*([ap]m)\b/gi,
      (_match, hour, minute, meridiem) => `at ${hour}:${minute}${meridiem}`)
    .replace(/\b(?:at|by|around|about)\s+([01]\d|2[0-3])([0-5]\d)\b/gi,
      (_match, hour, minute) => `at ${hour}:${minute}`)
    .replace(/\b(\d{1,2})\s+o['’]?clock\b/gi, "$1:00")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumberWords(value) {
  const cleaned = value.toLowerCase().replace(/-/g, " ").replace(/\band\b/g, " ").trim();
  if (/^\d+(?:\.\d+)?$/.test(cleaned)) return Number(cleaned);
  const words = cleaned.split(/\s+/).filter(Boolean);
  let current = 0;
  let found = false;
  for (const word of words) {
    const number = NUMBER_WORDS[word];
    if (number === undefined) return null;
    found = true;
    if (number === 100) current = Math.max(current, 1) * 100;
    else current += number;
  }
  return found ? current : null;
}

function formatUnitForQuantity(unit, quantity) {
  if (!unit) return "";
  if (["kg", "g", "mg", "L", "ml", "m", "cm", "tbsp", "tsp", "oz", "lb"].includes(unit)) return unit;
  if (unit === "dozen") return "dozen";
  return quantity === 1 ? unit : `${unit}s`;
}

function parseQuantity(input) {
  const unitPattern = QUANTITY_UNITS.slice().sort((a, b) => b.length - a.length).map(escapeRegExp).join("|");
  const numberPattern = "(?:\\d+(?:\\.\\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|a|an|couple|few|dozen)(?:[-\\s]+(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred))?";
  const unitMatch = input.match(new RegExp(`\\b(${numberPattern})\\s*(${unitPattern})\\b(?:\\s+of\\b)?`, "iu"));
  if (unitMatch) {
    const quantity = parseNumberWords(unitMatch[1]);
    if (quantity !== null) {
      const canonical = QUANTITY_UNIT_ALIASES[unitMatch[2].toLowerCase()] || "";
      return { quantity, unit: formatUnitForQuantity(canonical, quantity), canonicalUnit: canonical, matchedText: unitMatch[0], index: unitMatch.index ?? 0 };
    }
  }
  const multiplierMatch = input.match(new RegExp(`\\b(${numberPattern})\\s*[x×]\\s+(?=[\\p{L}\\p{N}])`, "iu"));
  if (multiplierMatch) {
    const quantity = parseNumberWords(multiplierMatch[1]);
    if (quantity !== null) return { quantity, unit: "", canonicalUnit: "", matchedText: multiplierMatch[1], index: multiplierMatch.index ?? 0 };
  }
  const genericMatch = input.match(new RegExp(`\\b(?:buy|get|add|order|pick\\s+up|bring|need|take)\\s+(${numberPattern})\\b`, "iu"));
  if (genericMatch) {
    const quantity = parseNumberWords(genericMatch[1]);
    if (quantity !== null) return { quantity, unit: "", canonicalUnit: "", matchedText: genericMatch[1], index: (genericMatch.index ?? 0) + genericMatch[0].lastIndexOf(genericMatch[1]) };
  }
  return null;
}

function maskRange(value, index, length) { return value.slice(0, index) + " ".repeat(length) + value.slice(index + length); }

function parseClockTime(input) {
  const specialMatch = input.match(/\b(noon|midday|midnight|morning|afternoon|evening|tonight|night|eod|cob)\b/i);
  if (specialMatch) {
    const key = specialMatch[1].toLowerCase();
    return { ...DAYPART_TIMES[key], matchedText: specialMatch[0], index: specialMatch.index ?? 0 };
  }
  const meridiemMatch = input.match(/\b(?:at|by|around|about)?\s*(1[0-2]|0?[1-9])(?:[:.\-]([0-5]\d))?\s*([ap]m)\b/i);
  if (meridiemMatch) {
    let hours = Number(meridiemMatch[1]);
    const minutes = Number(meridiemMatch[2] || 0);
    const meridiem = meridiemMatch[3].toLowerCase();
    if (meridiem === "pm" && hours !== 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
    return { hours, minutes, matchedText: meridiemMatch[0].trim(), index: meridiemMatch.index ?? 0 };
  }
  const twentyFourHourMatch = input.match(/\b(?:at|by|around|about)\s+([01]?\d|2[0-3])[:.]([0-5]\d)\b/i);
  if (twentyFourHourMatch) return { hours: Number(twentyFourHourMatch[1]), minutes: Number(twentyFourHourMatch[2]), matchedText: twentyFourHourMatch[0], index: twentyFourHourMatch.index ?? 0 };
  const bareContextMatch = input.match(/\b(?:at|by|around|about)\s+(1[0-2]|0?[1-9])\b/i);
  if (bareContextMatch) {
    let hours = Number(bareContextMatch[1]);
    if (hours >= 1 && hours <= 7) hours += 12;
    return { hours, minutes: 0, matchedText: bareContextMatch[0], index: bareContextMatch.index ?? 0 };
  }
  return null;
}

function parseSpecialDate(input, referenceDate) {
  const lower = input.toLowerCase();
  if (/\bday after tomorrow\b/.test(lower)) return { date: addDays(startOfDay(referenceDate), 2), matchedText: "day after tomorrow" };
  if (/\bnext week\b/.test(lower)) {
    const d = startOfDay(referenceDate); const daysUntilMonday = ((8 - d.getDay()) % 7) || 7;
    return { date: addDays(d, daysUntilMonday), matchedText: "next week" };
  }
  if (/\bthis weekend\b/.test(lower)) {
    const d = startOfDay(referenceDate); let daysUntilSaturday = (6 - d.getDay() + 7) % 7;
    if (daysUntilSaturday === 0 && referenceDate.getHours() >= 12) daysUntilSaturday = 7;
    return { date: addDays(d, daysUntilSaturday), matchedText: "this weekend" };
  }
  if (/\bnext weekend\b/.test(lower)) {
    const d = startOfDay(referenceDate); const daysUntilSaturday = (6 - d.getDay() + 7) % 7 || 7;
    return { date: addDays(d, daysUntilSaturday + 7), matchedText: "next weekend" };
  }
  if (/\bend of (?:the )?week\b/.test(lower)) {
    const d = startOfDay(referenceDate); const daysUntilSunday = (7 - d.getDay()) % 7 || 7;
    return { date: addDays(d, daysUntilSunday), matchedText: input.match(/\bend of (?:the )?week\b/i)?.[0] || "end of week" };
  }
  if (/\bend of (?:the )?month\b|\beom\b/.test(lower)) {
    const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
    return { date: startOfDay(d), matchedText: input.match(/\bend of (?:the )?month\b|\beom\b/i)?.[0] || "end of month" };
  }
  return null;
}

function chooseChronoResult(results) {
  if (!results.length) return null;
  return [...results].sort((a, b) => {
    const sa = Number(a.start.isCertain("year")) + Number(a.start.isCertain("month")) + Number(a.start.isCertain("day")) + Number(a.start.isCertain("hour")) * 2;
    const sb = Number(b.start.isCertain("year")) + Number(b.start.isCertain("month")) + Number(b.start.isCertain("day")) + Number(b.start.isCertain("hour")) * 2;
    return sb !== sa ? sb - sa : b.text.length - a.text.length;
  })[0];
}

function parseNaturalDateTime(input, quantityResult) {
  const referenceDate = new Date();
  const clockTime = parseClockTime(input);
  const specialDate = parseSpecialDate(input, referenceDate);
  let chronoInput = input;
  if (quantityResult) chronoInput = maskRange(chronoInput, quantityResult.index, quantityResult.matchedText.length);
  if (clockTime) chronoInput = maskRange(chronoInput, clockTime.index, clockTime.matchedText.length);
  let chronoResult = null;
  if (!specialDate) {
    chronoResult = chooseChronoResult(chrono.en.GB.parse(chronoInput, { instant: referenceDate, timezone: referenceDate.getTimezoneOffset() }, { forwardDate: true }));
  }
  let baseDate = specialDate?.date || chronoResult?.start?.date() || null;
  const chronoHasTime = Boolean(chronoResult && (chronoResult.start.isCertain("hour") || chronoResult.start.isCertain("minute") || chronoResult.start.isCertain("meridiem")));
  if (!baseDate && !clockTime) return { dueAt: null, matchedTexts: [], hasExplicitTime: false, warning: "" };
  if (!baseDate && clockTime) baseDate = startOfDay(referenceDate);
  if (!isValidDate(baseDate)) return { dueAt: null, matchedTexts: [], hasExplicitTime: false, warning: "The date or time could not be understood safely." };
  let hours = DEFAULT_DATE_ONLY_HOUR;
  let minutes = DEFAULT_DATE_ONLY_MINUTE;
  let hasExplicitTime = false;
  if (clockTime) { hours = clockTime.hours; minutes = clockTime.minutes; hasExplicitTime = true; }
  else if (chronoHasTime) {
    const h = chronoResult.start.get("hour"); const m = chronoResult.start.get("minute") ?? 0;
    if (Number.isInteger(h) && h >= 0 && h <= 23 && Number.isInteger(m) && m >= 0 && m <= 59) { hours = h; minutes = m; hasExplicitTime = true; }
  }
  let dueAt = setLocalTime(baseDate, hours, minutes);
  if (hasExplicitTime && !specialDate && !chronoResult?.start?.isCertain("day") && dueAt.getTime() <= referenceDate.getTime()) dueAt = addDays(dueAt, 1);
  return { dueAt, matchedTexts: [specialDate?.matchedText, chronoResult?.text, clockTime?.matchedText].filter(Boolean), hasExplicitTime, warning: "" };
}

function cleanupTaskText(input, matches) {
  let text = input;
  matches.filter(Boolean).sort((a, b) => b.length - a.length).forEach((match) => { text = text.replace(new RegExp(escapeRegExp(match), "i"), " "); });
  text = text.replace(/\b(?:on|at|by|for|around|about|before|after)\s*$/i, "").replace(/\s+([,.;!?])/g, "$1").replace(/^[,.;:\s-]+|[,.;:\s-]+$/g, "").replace(/\s+/g, " ").trim();
  text = text.replace(/^(?:buy|get|add|order|pick\s+up|bring|need)\s+/i, "");
  if (!text) return input.trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function parseNaturalInput(input) {
  const rawInput = input.trim();
  const normalizedInput = normalizeNaturalInput(rawInput);
  const parsedQuantity = parseQuantity(normalizedInput);
  const parsedDateTime = parseNaturalDateTime(normalizedInput, parsedQuantity);
  const text = cleanupTaskText(normalizedInput, [...parsedDateTime.matchedTexts, parsedQuantity?.matchedText]);
  return { rawInput, text, quantity: parsedQuantity?.quantity ?? null, quantityUnit: parsedQuantity?.unit || "", dueAt: parsedDateTime.dueAt, hasExplicitTime: parsedDateTime.hasExplicitTime, warning: parsedDateTime.warning, hasNaturalData: Boolean(parsedDateTime.dueAt || parsedQuantity) };
}

function formatDateForInput(value) {
  if (!value) return "";
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  if (!isValidDate(date)) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatTimeForInput(value) {
  if (!value) return "";
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  if (!isValidDate(date)) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function combineLocalDateAndTime(dateValue, timeValue) {
  if (!dateValue) return null;
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hours, minutes] = (timeValue || "12:00").split(":").map(Number);
  if (![year, month, day, hours, minutes].every(Number.isInteger)) return null;
  const result = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (result.getFullYear() !== year || result.getMonth() !== month - 1 || result.getDate() !== day || result.getHours() !== hours || result.getMinutes() !== minutes) return null;
  return result;
}

function formatDueDate(value) {
  if (!value) return "";
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  if (!isValidDate(date)) return "";
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const dateOnly = startOfDay(date);
  let dateLabel;
  if (dateOnly.getTime() === today.getTime()) dateLabel = "Today";
  else if (dateOnly.getTime() === tomorrow.getTime()) dateLabel = "Tomorrow";
  else dateLabel = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(date);
  const timeLabel = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", hour12: true }).format(date);
  return `${dateLabel}, ${timeLabel}`;
}

function formatQuantity(quantity, unit) { if (quantity === null || quantity === undefined) return ""; return unit ? `${quantity} ${unit}` : `×${quantity}`; }
function getItemMetadata(item) { return [formatQuantity(item.quantity, item.quantityUnit), formatDueDate(item.dueAt)].filter(Boolean).join(" · "); }

function useVisualViewportBridge() {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    function updateViewport() {
      const layoutHeight = root.clientHeight || window.innerHeight;
      const visualHeight = viewport?.height || window.innerHeight;
      const offsetTop = viewport?.offsetTop || 0;
      const keyboardOffset = Math.max(0, layoutHeight - visualHeight - offsetTop);
      root.style.setProperty("--visual-viewport-height", `${Math.round(visualHeight)}px`);
      root.style.setProperty("--visual-viewport-top", `${Math.round(offsetTop)}px`);
      root.style.setProperty("--keyboard-offset", `${Math.round(keyboardOffset)}px`);
      root.classList.toggle("keyboard-open", keyboardOffset > 80);
    }
    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);
    return () => {
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
      root.classList.remove("keyboard-open");
    };
  }, []);
}


function normalizeItemKey(value) {
  return value.normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
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
  useVisualViewportBridge();

  const [updateAvailable, setUpdateAvailable] = useState(Boolean(window.__LYST_UPDATE_AVAILABLE__));
  const [updatingApp, setUpdatingApp] = useState(false);

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

  useEffect(() => {
    function handleUpdateAvailable() { setUpdateAvailable(true); }
    window.addEventListener("lyst:update-available", handleUpdateAvailable);
    if (window.__LYST_UPDATE_AVAILABLE__) setUpdateAvailable(true);
    return () => window.removeEventListener("lyst:update-available", handleUpdateAvailable);
  }, []);

  async function applyAppUpdate() {
    if (updatingApp) return;
    try {
      setUpdatingApp(true);
      if (typeof window.__LYST_APPLY_UPDATE__ === "function") {
        await window.__LYST_APPLY_UPDATE__();
        return;
      }
      window.location.reload();
    } catch (error) {
      console.error("Could not apply Lyst update:", error);
      setUpdatingApp(false);
      showToast("Could not update Lyst. Try reopening the app.");
    }
  }

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
        <UpdateBanner
          visible={updateAvailable}
          updating={updatingApp}
          onUpdate={applyAppUpdate}
        />

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
              onRename={setEditList}
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
      <motion.div
        className="auth-orbit auth-orbit-one"
        aria-hidden="true"
        animate={{
          y: [0, -8, 0],
          rotate: [0, 7, 0],
        }}
        transition={{
          duration: 5.8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        🌸
      </motion.div>

      <motion.div
        className="auth-orbit auth-orbit-two"
        aria-hidden="true"
        animate={{
          y: [0, 7, 0],
          rotate: [0, -8, 0],
        }}
        transition={{
          duration: 6.6,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 0.4,
        }}
      >
        ✨
      </motion.div>

      <motion.section
        className="auth-panel"
        initial={{ opacity: 0, y: 18, scale: 0.975 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          type: "spring",
          stiffness: 290,
          damping: 27,
        }}
      >
        <div className="auth-brand-row">
          <motion.div
            className="auth-badge"
            initial={{ rotate: -8, scale: 0.9 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{
              type: "spring",
              stiffness: 420,
              damping: 24,
            }}
          >
            📝
          </motion.div>

          <div>
            <div className="auth-name">Lyst</div>
            <div className="auth-kicker">
              little lists, less brain clutter ✨
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            className="auth-heading"
            initial={{ opacity: 0, y: 7 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -7 }}
            transition={{
              type: "spring",
              stiffness: 360,
              damping: 29,
            }}
          >
            <h1>
              {mode === "signin" ? "Welcome back 🌷" : "Make it yours 🌈"}
            </h1>

            <p>
              {mode === "signin"
                ? "Your lists are right where you left them."
                : "A tiny pastel home for everything you want to remember."}
            </p>
          </motion.div>
        </AnimatePresence>

        <div className="auth-mood-strip" aria-hidden="true">
          <motion.span
            whileHover={{ y: -3, rotate: -5 }}
            transition={{ type: "spring", stiffness: 500, damping: 25 }}
          >
            🍓
          </motion.span>

          <motion.span
            whileHover={{ y: -3, rotate: 5 }}
            transition={{ type: "spring", stiffness: 500, damping: 25 }}
          >
            🫧
          </motion.span>

          <motion.span
            whileHover={{ y: -3, rotate: -4 }}
            transition={{ type: "spring", stiffness: 500, damping: 25 }}
          >
            ☁️
          </motion.span>

          <motion.span
            whileHover={{ y: -3, rotate: 4 }}
            transition={{ type: "spring", stiffness: 500, damping: 25 }}
          >
            🍋
          </motion.span>
        </div>

        <motion.button
          className="google-button"
          type="button"
          disabled={working}
          whileHover={{ y: -2, scale: 1.008 }}
          whileTap={{ scale: 0.972 }}
          transition={{
            type: "spring",
            stiffness: 470,
            damping: 28,
          }}
          onClick={handleGoogle}
        >
          <span className="google-mark">G</span>
          Continue with Google
          <span className="google-sparkle" aria-hidden="true">
            ✨
          </span>
        </motion.button>

        <div className="divider">
          <span>or use email</span>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-input-wrap">
            <span className="auth-input-emoji" aria-hidden="true">
              💌
            </span>

            <input
              type="email"
              value={email}
              autoComplete="email"
              placeholder="Email"
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label className="auth-input-wrap">
            <span className="auth-input-emoji" aria-hidden="true">
              🔐
            </span>

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
          </label>

          {mode === "signin" && (
            <button
              className="forgot-button"
              type="button"
              onClick={handlePasswordReset}
            >
              Forgot password? 🪄
            </button>
          )}

          <motion.button
            className="primary-button auth-primary-button"
            type="submit"
            disabled={working}
            whileHover={{ y: -2, scale: 1.006 }}
            whileTap={{ scale: 0.974 }}
            transition={{
              type: "spring",
              stiffness: 470,
              damping: 28,
            }}
          >
            {working
              ? "One sec... ✨"
              : mode === "signup"
                ? "Create my Lyst 🌼"
                : "Open my Lyst 💫"}
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
            ? "New here? Create an account 🌱"
            : "Already have an account? Sign in 🌙"}
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
  onRename,
}) {
  const listLongPressTimer = useRef(null);
  const listLongPressTriggered = useRef(false);

  useEffect(() => {
    return () => {
      window.clearTimeout(listLongPressTimer.current);
    };
  }, []);

  function startListLongPress(event, list) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    listLongPressTriggered.current = false;
    window.clearTimeout(listLongPressTimer.current);

    listLongPressTimer.current = window.setTimeout(() => {
      listLongPressTriggered.current = true;
      onRename(list);

      if ("vibrate" in navigator) {
        navigator.vibrate(12);
      }
    }, 500);
  }

  function cancelListLongPress() {
    window.clearTimeout(listLongPressTimer.current);
  }

  function openListAfterPress(list) {
    if (listLongPressTriggered.current) {
      listLongPressTriggered.current = false;
      return;
    }

    onOpenList(list);
  }

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
      transition={{
        type: "spring",
        stiffness: 320,
        damping: 31,
      }}
    >
      <header className="home-header">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: -7 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            type: "spring",
            stiffness: 360,
            damping: 28,
          }}
        >
          <span className="app-label">Lyst</span>
          <h1>Lists</h1>
        </motion.div>

        <motion.button
          className="avatar-button"
          type="button"
          whileHover={reduceMotion ? {} : { y: -2, rotate: 2 }}
          whileTap={{ scale: 0.9, rotate: -3 }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 26,
          }}
          onClick={onAccount}
          aria-label="Open account"
        >
          {getEmailInitial(user)}
        </motion.button>
      </header>

      <motion.div
        className="home-actions"
        initial={reduceMotion ? false : { opacity: 0, y: 7 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduceMotion ? 0 : 0.035 }}
      >
        <motion.button
          className="search-action"
          type="button"
          whileHover={reduceMotion ? {} : { y: -2, scale: 1.015 }}
          whileTap={{ scale: 0.96 }}
          transition={{
            type: "spring",
            stiffness: 480,
            damping: 28,
          }}
          onClick={onSearch}
        >
          Search
        </motion.button>

        <motion.button
          className="archive-action"
          type="button"
          whileHover={reduceMotion ? {} : { y: -2, scale: 1.015 }}
          whileTap={{ scale: 0.96 }}
          transition={{
            type: "spring",
            stiffness: 480,
            damping: 28,
          }}
          onClick={onArchive}
        >
          Archived {archivedCount > 0 ? `(${archivedCount})` : ""}
        </motion.button>
      </motion.div>

      <motion.div
        className="list-toolbar"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: reduceMotion ? 0 : 0.075 }}
      >
        <span>
          {lists.length} {lists.length === 1 ? "list" : "lists"}
        </span>

        <motion.button
          className="create-button"
          type="button"
          whileHover={reduceMotion ? {} : { y: -2, scale: 1.025 }}
          whileTap={{ scale: 0.93 }}
          transition={{
            type: "spring",
            stiffness: 520,
            damping: 28,
          }}
          onClick={onCreate}
        >
          New
        </motion.button>
      </motion.div>

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
                className={`list-row pastel-row-${(index % 5) + 1}`}
                type="button"
                initial={
                  reduceMotion
                    ? { opacity: 0 }
                    : {
                        opacity: 0,
                        y: 9,
                        scale: 0.992,
                      }
                }
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                }}
                exit={{
                  opacity: 0,
                  x: reduceMotion ? 0 : 12,
                  scale: 0.985,
                }}
                transition={{
                  delay: reduceMotion ? 0 : Math.min(index * 0.028, 0.14),
                  type: "spring",
                  stiffness: 390,
                  damping: 31,
                }}
                whileHover={
                  reduceMotion
                    ? {}
                    : {
                        x: 3,
                        scale: 1.004,
                      }
                }
                whileTap={{ scale: 0.982 }}
                onPointerDown={(event) =>
                  startListLongPress(event, list)
                }
                onPointerUp={cancelListLongPress}
                onPointerCancel={cancelListLongPress}
                onPointerLeave={cancelListLongPress}
                onContextMenu={(event) => {
                  event.preventDefault();
                  cancelListLongPress();
                  onRename(list);
                }}
                onClick={() => openListAfterPress(list)}
              >
                <span className="list-accent" aria-hidden="true" />

                <span className="list-title-text">{list.title}</span>

                <motion.span
                  className="row-arrow"
                  aria-hidden="true"
                  whileHover={reduceMotion ? {} : { x: 2 }}
                >
                  ›
                </motion.span>
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
        initial={reduceMotion ? false : { opacity: 0, scale: 0.7, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        whileHover={reduceMotion ? {} : { y: -3, rotate: 2 }}
        whileTap={{ scale: 0.86, rotate: -3 }}
        transition={{
          type: "spring",
          stiffness: 460,
          damping: 27,
        }}
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

  const inputRef = useRef(null);
  const longPressTimer = useRef(null);
  const longPressTriggered = useRef(false);

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

    } catch (error) {
      console.error(error);
      showToast("Could not update the item.");
    }
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
                        ? "#CFEADF"
                        : "#FFFFFF",
                      borderColor: item.completed
                        ? "#B6D7C7"
                        : "#D6CDDC",
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
          onFocus={(event) => {
            window.setTimeout(() => event.currentTarget?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 120);
          }}
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
          onFocus={(event) => {
            window.setTimeout(() => event.currentTarget?.scrollIntoView({ block: "center", behavior: "smooth" }), 120);
          }}
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

function UpdateBanner({ visible, updating, onUpdate }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="update-banner"
          initial={{ opacity: 0, y: -12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        >
          <div>
            <strong>Lyst update ready</strong>
            <span>Refresh once to use the newest version.</span>
          </div>
          <motion.button type="button" disabled={updating} whileTap={{ scale: 0.95 }} onClick={onUpdate}>
            {updating ? "Updating..." : "Update"}
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

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
  const dots = [
    { emoji: "🌸", className: "loading-dot dot-one" },
    { emoji: "🫧", className: "loading-dot dot-two" },
    { emoji: "⭐", className: "loading-dot dot-three" },
    { emoji: "🍬", className: "loading-dot dot-four" },
  ];

  return (
    <main className="loading-page">
      <motion.div
        className="loading-card"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 27,
        }}
      >
        <div className="loading-scene" aria-hidden="true">
          {dots.map((dot, index) => (
            <motion.span
              key={dot.className}
              className={dot.className}
              animate={
                reduceMotion
                  ? {}
                  : {
                      y: [0, -10 - index * 2, 0],
                      rotate: [0, index % 2 === 0 ? 8 : -8, 0],
                      scale: [1, 1.08, 1],
                    }
              }
              transition={{
                duration: 1.8 + index * 0.18,
                repeat: Infinity,
                ease: "easeInOut",
                delay: index * 0.12,
              }}
            >
              {dot.emoji}
            </motion.span>
          ))}

          <motion.div
            className="loading-logo-bubble"
            animate={
              reduceMotion
                ? {}
                : {
                    rotate: [0, 2, -2, 0],
                    scale: [1, 1.025, 1],
                  }
            }
            transition={{
              duration: 2.2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            L
          </motion.div>
        </div>

        <motion.strong
          className="loading-word"
          animate={
            reduceMotion
              ? {}
              : {
                  letterSpacing: ["-0.06em", "-0.02em", "-0.06em"],
                  opacity: [0.72, 1, 0.72],
                }
          }
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          Lyst
        </motion.strong>

        <motion.p
          className="loading-caption"
          animate={
            reduceMotion
              ? {}
              : {
                  opacity: [0.48, 0.9, 0.48],
                }
          }
          transition={{
            duration: 1.7,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          getting your little world ready ✨
        </motion.p>

        <div className="loading-bar" aria-hidden="true">
          <motion.span
            animate={
              reduceMotion
                ? { x: 0 }
                : {
                    x: ["-105%", "230%"],
                  }
            }
            transition={{
              duration: 1.7,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        </div>
      </motion.div>
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
    --page: #FFFFFF;
    --surface: #FFFFFF;
    --lavender: #DDD3F6;
    --lavender-soft: #F4F0FC;
    --mint: #CFEADF;
    --mint-soft: #EEF9F3;
    --peach: #F8D8C8;
    --peach-soft: #FFF1E9;
    --sky: #D8E9FA;
    --sky-soft: #EFF7FD;
    --butter: #F7E8AE;
    --butter-soft: #FFF9DE;
    --rose: #F2D1DD;
    --rose-soft: #FCEDF3;
    --text: #343044;
    --muted: #777181;
    --border: #E9E5ED;
    --visual-viewport-height: 100dvh;
    --visual-viewport-top: 0px;
    --keyboard-offset: 0px;

    font-family:
      "Avenir Next",
      Avenir,
      "SF Pro Display",
      "SF Pro Text",
      -apple-system,
      BlinkMacSystemFont,
      sans-serif;

    color: #3B3650;
    background: #FFFFFF;
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
    background: #FFFFFF;
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
    border: 1px solid #E2DAE7;
    border-radius: 999px;
    background: #FFFDFC;
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
    color: #766F80;
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
    border: 1px solid #CBBEEA;
    border-radius: 50%;
    color: #4A4260;
    background: var(--lavender);
    box-shadow: 0 7px 18px rgba(91, 74, 120, 0.10);
    font-size: 0.82rem;
    font-weight: 800;
    transition:
      border-color 180ms ease,
      box-shadow 180ms ease;
  }

  .avatar-button:hover {
    border-color: #B8A6E2;
    box-shadow: 0 10px 23px rgba(91, 74, 120, 0.15);
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
    border-radius: 11px;
    font-size: 0.76rem;
    font-weight: 680;
    box-shadow: 0 4px 12px rgba(74, 59, 91, 0.045);
  }

  .home-actions .search-action {
    border: 1px solid #C7DFD4;
    background: var(--mint-soft);
  }

  .home-actions .archive-action {
    border: 1px solid #E9C9D5;
    background: var(--rose-soft);
  }

  .list-toolbar {
    margin-bottom: 8px;
  }

  .list-toolbar span {
    color: #766F80;
    font-size: 0.81rem;
  }

  .create-button {
    min-height: 33px;
    padding: 0 13px;
    border: 0;
    border-radius: 11px;
    color: #4B435C;
    background: var(--butter);
    box-shadow: 0 5px 14px rgba(136, 109, 37, 0.10);
    font-size: 0.78rem;
    font-weight: 700;
  }

  .lists,
  .items {
    border-top: 1px solid #EEE8F1;
  }

  .list-row {
    position: relative;
    display: flex;
    width: 100%;
    min-height: 58px;
    align-items: center;
    justify-content: space-between;
    gap: 11px;
    padding: 0 7px 0 0;
    overflow: hidden;
    text-align: left;
    border: 0;
    border-bottom: 1px solid #EEEAF1;
    background: #FFFFFF;
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
    transition:
      background-color 180ms ease,
      box-shadow 180ms ease;
  }

  .list-row:hover {
    box-shadow: inset 0 0 0 1px rgba(104, 90, 121, 0.025);
  }

  .list-accent {
    width: 5px;
    height: 31px;
    flex: 0 0 auto;
    border-radius: 999px;
    transform: scaleY(0.72);
    transition:
      transform 190ms ease,
      width 190ms ease;
  }

  .list-row:hover .list-accent {
    width: 6px;
    transform: scaleY(1);
  }

  .pastel-row-1 .list-accent {
    background: var(--lavender);
  }

  .pastel-row-2 .list-accent {
    background: var(--mint);
  }

  .pastel-row-3 .list-accent {
    background: var(--peach);
  }

  .pastel-row-4 .list-accent {
    background: var(--sky);
  }

  .pastel-row-5 .list-accent {
    background: var(--rose);
  }

  .pastel-row-1:hover {
    background: var(--lavender-soft);
  }

  .pastel-row-2:hover {
    background: var(--mint-soft);
  }

  .pastel-row-3:hover {
    background: var(--peach-soft);
  }

  .pastel-row-4:hover {
    background: var(--sky-soft);
  }

  .pastel-row-5:hover {
    background: var(--rose-soft);
  }

  .list-title-text {
    overflow: hidden;
    font-size: 1rem;
    font-weight: 640;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-arrow {
    margin-left: auto;
    color: #A9A0B5;
    font-size: 1.5rem;
    transition: color 180ms ease;
  }

  .list-row:hover .row-arrow {
    color: #655A74;
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
    color: #3C4858;
    background: var(--sky);
    box-shadow: 0 11px 24px rgba(73, 112, 153, 0.16);
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
    color: #766F80;
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
    color: #443B59;
    background: var(--lavender);
    box-shadow: 0 7px 18px rgba(91, 74, 120, 0.10);
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
    background: var(--peach-soft);
    border: 1px solid #F0D3C4;
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
    border: 1px solid #E8E0EC;
    border-radius: 13px;
    background: #FFFDFC;
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
    color: #B85C6A;
  }

  .list-heading {
    margin-bottom: 20px;
  }

  .list-heading p {
    margin: 6px 0 0;
    color: #766F80;
    font-size: 0.81rem;
  }

  .item-row {
    display: flex;
    min-height: 53px;
    gap: 11px;
    align-items: center;
    border-bottom: 1px solid #EEE8F1;
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
    border: 1.5px solid #D6CDDC;
    border-radius: 50%;
    color: #FFFDFC;
    background: #FFFDFC;
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
    color: #877F91;
    font-size: 0.7rem;
    font-weight: 520;
    line-height: 1.35;
  }

  .item-row.completed .item-main-text,
  .item-row.completed .item-metadata {
    color: #9991A2;
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
    color: #766F80;
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
    border: 1px solid #E1D8E6;
    border-radius: 16px;
    background: #FFFDFC;
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
    color: #385447;
    background: var(--mint);
    box-shadow: 0 6px 15px rgba(68, 117, 91, 0.12);
    font-size: 1.4rem;
  }

  .add-item-bar button:disabled {
    opacity: 0.25;
  }

  .sheet-backdrop {
    position: fixed;
    z-index: 100;
    top: var(--visual-viewport-top);
    right: 0;
    bottom: var(--keyboard-offset);
    left: 0;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding: 8px;
    background: rgba(72, 59, 82, 0.18);
    backdrop-filter: blur(5px);
  }

  .sheet {
    width: min(100%, 460px);
    max-height: calc(var(--visual-viewport-height) - 16px);
    overflow-y: auto;
    border: 1px solid #E5DDEC;
    border-radius: 23px;
    background: #FFFFFF;
    box-shadow: 0 24px 65px rgba(69, 55, 80, 0.16);
  }

  .sheet-content {
    padding: 9px 17px 18px;
  }

  .sheet-handle {
    width: 34px;
    height: 4px;
    margin: 0 auto 17px;
    border-radius: 99px;
    background: var(--lavender);
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
    color: #766F80;
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
    border: 1px solid #E1D8E6;
    border-radius: 12px;
    outline: 0;
    font-size: 0.88rem;
  }

  .sheet-input {
    margin-bottom: 12px;
  }

  .sheet-input,
  .auth-form input,
  .add-item-bar input {
    transition:
      border-color 180ms ease,
      box-shadow 180ms ease,
      background-color 180ms ease;
  }

  .sheet-input:focus,
  .auth-form input:focus {
    border-color: #BFD8F1;
    background: var(--sky-soft);
    box-shadow: 0 0 0 4px rgba(216, 233, 250, 0.55);
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
    border: 1px solid #EAE3EE;
    border-radius: 12px;
  }

  .duplicate-comparison span {
    color: #877F91;
    font-size: 0.64rem;
    font-weight: 700;
    text-transform: uppercase;
  }

  .duplicate-comparison strong {
    font-size: 0.86rem;
  }

  .duplicate-comparison small {
    color: #766F80;
    font-size: 0.68rem;
  }

  .duplicate-note {
    margin: 0 1px 13px;
    color: #766F80;
    font-size: 0.7rem;
    line-height: 1.45;
  }

  .duplicate-actions {
    display: grid;
    gap: 8px;
  }

  .duplicate-actions > button:last-child {
    min-height: 43px;
    border: 1px solid #E1D8E6;
    border-radius: 12px;
    background: #FFFDFC;
    font-size: 0.8rem;
    font-weight: 700;
  }

  .natural-field {
    display: block;
  }

  .natural-field > span {
    display: block;
    margin: 0 0 6px 2px;
    color: #766F80;
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
    border-top: 1px solid #EEE8F1;
    border-bottom: 1px solid #EEE8F1;
  }

  .parsed-date span {
    color: #766F80;
    font-size: 0.74rem;
  }

  .parsed-date strong {
    font-size: 0.79rem;
  }

  .natural-warning {
    margin: -2px 0 13px;
    color: #B45E67;
    font-size: 0.73rem;
    line-height: 1.4;
  }

  .plain-text-button {
    width: 100%;
    margin-top: 13px;
    padding: 5px;
    border: 0;
    color: #6B6475;
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
    border-bottom: 1px solid #EEE8F1;
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
    color: #6B6475;
    font-size: 0.72rem;
  }

  .search-results {
    max-height: 55vh;
    overflow-y: auto;
  }

  .search-message {
    padding: 24px 0;
    color: #766F80;
    text-align: center;
    font-size: 0.82rem;
  }

  .search-result {
    display: block;
    width: 100%;
    padding: 13px 0;
    text-align: left;
    border: 0;
    border-bottom: 1px solid #EEE8F1;
    background: #FFFDFC;
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
    color: #766F80;
    font-size: 0.74rem;
  }

  .confirmation-content h2 {
    margin-bottom: 8px;
    font-size: 1.35rem;
  }

  .confirmation-content p {
    margin-bottom: 18px;
    color: #766F80;
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
    background: #F3EDF7;
    font-weight: 700;
  }

  .confirmation-actions .danger-confirm {
    color: #FFFDFC;
    background: #3B3650;
  }

  .account-row {
    display: flex;
    gap: 11px;
    align-items: center;
    margin-bottom: 12px;
    padding: 11px 0;
    border-top: 1px solid #EEE8F1;
    border-bottom: 1px solid #EEE8F1;
  }

  .account-avatar {
    display: grid;
    width: 41px;
    height: 41px;
    place-items: center;
    overflow: hidden;
    border-radius: 50%;
    color: #FFFDFC;
    background: #3B3650;
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
    color: #766F80;
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
    background: #FFFFFF;
  }

  .auth-page,
  .setup-page,
  .offline-expired-page {
    display: grid;
    place-items: center;
  }

  .auth-page {
    position: relative;
    overflow: hidden;
    padding:
      max(18px, env(safe-area-inset-top))
      16px
      max(18px, env(safe-area-inset-bottom));
  }

  .auth-page::before,
  .auth-page::after {
    position: absolute;
    z-index: 0;
    width: 220px;
    height: 220px;
    border-radius: 50%;
    content: "";
    filter: blur(2px);
    pointer-events: none;
  }

  .auth-page::before {
    top: -86px;
    left: -84px;
    background: rgba(221, 211, 246, 0.38);
  }

  .auth-page::after {
    right: -82px;
    bottom: -98px;
    background: rgba(207, 234, 223, 0.42);
  }

  .auth-orbit {
    position: fixed;
    z-index: 1;
    display: grid;
    width: 46px;
    height: 46px;
    place-items: center;
    border: 1px solid rgba(223, 214, 235, 0.85);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.86);
    box-shadow: 0 10px 28px rgba(77, 64, 92, 0.09);
    font-size: 1.25rem;
    pointer-events: none;
    backdrop-filter: blur(10px);
  }

  .auth-orbit-one {
    top: 13%;
    left: max(7%, calc(50% - 230px));
  }

  .auth-orbit-two {
    right: max(7%, calc(50% - 230px));
    bottom: 15%;
  }

  .auth-panel,
  .offline-expired-panel {
    position: relative;
    z-index: 2;
    width: min(100%, 350px);
    padding: 20px 19px 19px;
    border: 1px solid #E8E2ED;
    border-radius: 24px;
    background: #FFFFFF;
    box-shadow:
      0 18px 55px rgba(78, 65, 92, 0.11),
      0 2px 10px rgba(78, 65, 92, 0.04);
  }

  .auth-panel::before {
    position: absolute;
    top: -1px;
    right: 32px;
    left: 32px;
    height: 3px;
    border-radius: 0 0 999px 999px;
    content: "";
    background: linear-gradient(
      90deg,
      var(--lavender),
      var(--mint),
      var(--peach),
      var(--sky),
      var(--rose)
    );
  }

  .auth-brand-row {
    display: flex;
    gap: 11px;
    align-items: center;
    margin-bottom: 22px;
  }

  .auth-badge {
    display: grid;
    width: 44px;
    height: 44px;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid #DDD3EE;
    border-radius: 15px;
    background: var(--lavender-soft);
    box-shadow: 0 7px 18px rgba(96, 80, 119, 0.08);
    font-size: 1.2rem;
  }

  .auth-name {
    margin: 0;
    font-size: 1.42rem;
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.055em;
  }

  .auth-kicker {
    margin-top: 5px;
    color: var(--muted);
    font-size: 0.66rem;
    font-weight: 620;
  }

  .auth-heading {
    margin-bottom: 15px;
  }

  .auth-heading h1 {
    margin-bottom: 6px;
    font-size: 1.66rem;
    line-height: 1.1;
    letter-spacing: -0.045em;
  }

  .auth-heading p {
    margin: 0;
    color: var(--muted);
    font-size: 0.81rem;
    line-height: 1.48;
  }

  .auth-mood-strip {
    display: flex;
    gap: 6px;
    margin-bottom: 14px;
  }

  .auth-mood-strip span {
    display: grid;
    width: 32px;
    height: 32px;
    place-items: center;
    border: 1px solid #ECE6F0;
    border-radius: 11px;
    background: #FFFFFF;
    box-shadow: 0 4px 10px rgba(80, 68, 93, 0.045);
    font-size: 0.9rem;
  }

  .auth-mood-strip span:nth-child(1) {
    background: var(--rose-soft);
  }

  .auth-mood-strip span:nth-child(2) {
    background: var(--sky-soft);
  }

  .auth-mood-strip span:nth-child(3) {
    background: var(--lavender-soft);
  }

  .auth-mood-strip span:nth-child(4) {
    background: var(--butter-soft);
  }

  .google-button {
    display: flex;
    width: 100%;
    min-height: 46px;
    gap: 9px;
    align-items: center;
    justify-content: center;
    border: 1px solid #D8E7DE;
    border-radius: 13px;
    background: var(--mint-soft);
    box-shadow: 0 6px 16px rgba(70, 112, 91, 0.07);
    font-size: 0.8rem;
    font-weight: 690;
  }

  .google-button:disabled {
    opacity: 0.55;
  }

  .google-mark {
    display: grid;
    width: 21px;
    height: 21px;
    place-items: center;
    border: 1px solid #CCDED4;
    border-radius: 50%;
    background: #FFFFFF;
    font-size: 0.68rem;
    font-weight: 850;
  }

  .google-sparkle {
    margin-left: 2px;
    font-size: 0.76rem;
  }

  .divider {
    display: flex;
    align-items: center;
    margin: 15px 0;
    color: #9A93A3;
    font-size: 0.64rem;
  }

  .divider::before,
  .divider::after {
    height: 1px;
    flex: 1;
    content: "";
    background: #EEE8F1;
  }

  .divider span {
    padding: 0 9px;
  }

  .auth-form {
    display: grid;
    gap: 9px;
  }

  .auth-input-wrap {
    position: relative;
    display: block;
  }

  .auth-input-wrap input {
    padding-left: 42px;
  }

  .auth-input-emoji {
    position: absolute;
    z-index: 1;
    top: 50%;
    left: 13px;
    transform: translateY(-50%);
    font-size: 0.9rem;
    pointer-events: none;
  }

  .auth-form input {
    background: #FFFFFF;
  }

  .auth-form input:focus {
    border-color: #D2C5EE;
    background: var(--lavender-soft);
    box-shadow: 0 0 0 4px rgba(221, 211, 246, 0.38);
  }

  .auth-primary-button {
    margin-top: 2px;
    background: var(--peach);
    box-shadow: 0 8px 19px rgba(142, 93, 69, 0.10);
  }

  .forgot-button,
  .switch-button,
  .offline-sign-out {
    border: 0;
    color: #6F6879;
    background: transparent;
    font-size: 0.7rem;
  }

  .forgot-button {
    justify-self: end;
    padding: 2px 2px 1px 8px;
  }

  .switch-button {
    width: 100%;
    margin-top: 15px;
    padding: 5px 0;
    font-weight: 650;
  }

  .loading-page {
    position: relative;
    display: grid;
    overflow: hidden;
    place-items: center;
    background: #FFFFFF;
  }

  .loading-page::before,
  .loading-page::after {
    position: absolute;
    width: 230px;
    height: 230px;
    border-radius: 50%;
    content: "";
    opacity: 0.42;
    filter: blur(1px);
  }

  .loading-page::before {
    top: -110px;
    right: -90px;
    background: var(--sky);
  }

  .loading-page::after {
    bottom: -105px;
    left: -100px;
    background: var(--peach);
  }

  .loading-card {
    position: relative;
    z-index: 1;
    display: grid;
    width: min(100%, 290px);
    place-items: center;
    padding: 26px 22px 24px;
    border: 1px solid #EAE4EF;
    border-radius: 27px;
    background: rgba(255, 255, 255, 0.94);
    box-shadow: 0 20px 60px rgba(78, 65, 92, 0.10);
    backdrop-filter: blur(12px);
  }

  .loading-scene {
    position: relative;
    width: 128px;
    height: 104px;
    margin-bottom: 3px;
  }

  .loading-logo-bubble {
    position: absolute;
    top: 23px;
    left: 50%;
    display: grid;
    width: 58px;
    height: 58px;
    place-items: center;
    transform: translateX(-50%);
    border: 1px solid #D4C7EE;
    border-radius: 20px;
    color: #4B435D;
    background: var(--lavender);
    box-shadow:
      0 10px 25px rgba(94, 78, 119, 0.14),
      inset 0 1px 0 rgba(255, 255, 255, 0.65);
    font-size: 1.45rem;
    font-weight: 850;
  }

  .loading-dot {
    position: absolute;
    display: grid;
    width: 34px;
    height: 34px;
    place-items: center;
    border: 1px solid #ECE6F1;
    border-radius: 12px;
    background: #FFFFFF;
    box-shadow: 0 6px 15px rgba(80, 67, 94, 0.07);
    font-size: 0.88rem;
  }

  .dot-one {
    top: 0;
    left: 5px;
    background: var(--rose-soft);
  }

  .dot-two {
    top: 8px;
    right: 3px;
    background: var(--sky-soft);
  }

  .dot-three {
    bottom: 0;
    left: 12px;
    background: var(--butter-soft);
  }

  .dot-four {
    right: 9px;
    bottom: 2px;
    background: var(--peach-soft);
  }

  .loading-word {
    margin-top: 1px;
    font-size: 1.58rem;
    font-weight: 820;
    line-height: 1;
    letter-spacing: -0.055em;
  }

  .loading-caption {
    margin: 8px 0 15px;
    color: var(--muted);
    text-align: center;
    font-size: 0.69rem;
    line-height: 1.4;
  }

  .loading-bar {
    width: 118px;
    height: 5px;
    overflow: hidden;
    border-radius: 999px;
    background: #F0EBF3;
  }

  .loading-bar span {
    display: block;
    width: 48px;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(
      90deg,
      var(--mint),
      var(--lavender),
      var(--peach)
    );
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
    color: #40384F;
    background: #E5DCF7;
    border: 1px solid #CFC0ED;
    box-shadow: 0 10px 28px rgba(82, 65, 104, 0.14);
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
    color: #443B59;
    background: transparent;
    font-weight: 800;
  }

  .skeleton {
    display: block;
    border-radius: 99px;
    background: #EFE8F2;
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

  .update-banner {
    position: fixed;
    z-index: 500;
    top: max(12px, calc(env(safe-area-inset-top) + 8px));
    right: 12px;
    left: 12px;
    display: flex;
    width: min(430px, calc(100vw - 24px));
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    margin: auto;
    padding: 11px 11px 11px 14px;
    border: 1px solid #D8CDED;
    border-radius: 15px;
    background: #F1ECFB;
    box-shadow: 0 12px 34px rgba(74, 59, 91, 0.14);
  }

  .update-banner > div { display: grid; gap: 2px; }
  .update-banner strong { font-size: 0.78rem; }
  .update-banner span { color: var(--muted); font-size: 0.66rem; }
  .update-banner button {
    min-width: 72px; min-height: 34px; padding: 0 11px; border: 0;
    border-radius: 10px; color: var(--text); background: var(--mint);
    font-size: 0.72rem; font-weight: 760;
  }
  .update-banner button:disabled { opacity: 0.55; }

  :root.keyboard-open .add-item-bar { bottom: calc(var(--keyboard-offset) + 8px); }
  :root.keyboard-open .sheet-backdrop { padding-bottom: 6px; }
  :root.keyboard-open .sheet { max-height: calc(var(--visual-viewport-height) - 12px); }

  @media (hover: none) {
    .list-row:active {
      background: var(--lavender-soft);
    }
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