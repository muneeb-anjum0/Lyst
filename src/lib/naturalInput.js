import * as chrono from "chrono-node";

import {
  addDays,
  escapeRegExp,
  isValidDate,
  setLocalTime,
  startOfDay,
} from "./dateUtils.js";

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

function normalizeNaturalInput(input) {
  return input
    .normalize("NFKC")
    .replace(/[–—]/g, "-")
    .replace(/\b(?:tmrw|tmr)\b/gi, "tomorrow")
    .replace(/\btonite\b/gi, "tonight")
    .replace(/\bnxt\s+/gi, "next ")
    .replace(/\b(\d{1,2})\s*([ap])\s*\.?\s*m\.?\b/gi, "$1$2m")
    .replace(/\b(\d{1,2})\s*[:.-]\s*(\d{2})\s*([ap])\s*\.?\s*m\.?\b/gi, "$1:$2$3m")
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
  const meridiemMatch = input.match(/\b(?:at|by|around|about)?\s*(1[0-2]|0?[1-9])(?:[:.-]([0-5]\d))?\s*([ap]m)\b/i);
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

export function parseNaturalInput(input) {
  const rawInput = input.trim();
  const normalizedInput = normalizeNaturalInput(rawInput);
  const parsedQuantity = parseQuantity(normalizedInput);
  const parsedDateTime = parseNaturalDateTime(normalizedInput, parsedQuantity);
  const text = cleanupTaskText(normalizedInput, [...parsedDateTime.matchedTexts, parsedQuantity?.matchedText]);
  return { rawInput, text, quantity: parsedQuantity?.quantity ?? null, quantityUnit: parsedQuantity?.unit || "", dueAt: parsedDateTime.dueAt, hasExplicitTime: parsedDateTime.hasExplicitTime, warning: parsedDateTime.warning, hasNaturalData: Boolean(parsedDateTime.dueAt || parsedQuantity) };
}

