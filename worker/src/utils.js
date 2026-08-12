export function normalizeText(value, maxLength = 200) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function normalizeItemKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

export function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
