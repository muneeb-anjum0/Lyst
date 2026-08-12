import { addDays, isValidDate, startOfDay } from "../lib/dateUtils.js";

export function formatDateForInput(value) {
  if (!value) return "";
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  if (!isValidDate(date)) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function formatTimeForInput(value) {
  if (!value) return "";
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  if (!isValidDate(date)) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function combineLocalDateAndTime(dateValue, timeValue) {
  if (!dateValue) return null;
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hours, minutes] = (timeValue || "12:00").split(":").map(Number);
  if (![year, month, day, hours, minutes].every(Number.isInteger)) return null;
  const result = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (result.getFullYear() !== year || result.getMonth() !== month - 1 || result.getDate() !== day || result.getHours() !== hours || result.getMinutes() !== minutes) return null;
  return result;
}

export function formatCompactDateInput(dateValue) {
  if (!dateValue) return "Select date";

  const [year, month, day] = dateValue.split("-").map(Number);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return "Select date";
  }

  const date = new Date(year, month - 1, day);

  if (!isValidDate(date)) return "Select date";

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatCompactTimeInput(timeValue) {
  if (!timeValue) return "Select time";

  const [hours, minutes] = timeValue.split(":").map(Number);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes)
  ) {
    return "Select time";
  }

  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatDueDate(value) {
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

export function formatQuantity(quantity, unit) { if (quantity === null || quantity === undefined) return ""; return unit ? `${quantity} ${unit}` : `×${quantity}`; }
export function getItemMetadata(item) { return [formatQuantity(item.quantity, item.quantityUnit), formatDueDate(item.dueAt)].filter(Boolean).join(" · "); }


export function getDueTone(value) {
  if (!value) return "sky";

  const date =
    typeof value?.toDate === "function"
      ? value.toDate()
      : new Date(value);

  if (!isValidDate(date)) return "sky";

  const now = new Date();
  const today = startOfDay(now);
  const dueDay = startOfDay(date);

  if (
    date.getTime() < now.getTime() &&
    dueDay.getTime() <= today.getTime()
  ) {
    return "rose";
  }

  if (dueDay.getTime() === today.getTime()) {
    return "peach";
  }

  return "sky";
}

export function getItemMetadataPills(item) {
  const pills = [];

  if (
    item.quantity !== null &&
    item.quantity !== undefined
  ) {
    pills.push({
      key: "quantity",
      label: formatQuantity(
        item.quantity,
        item.quantityUnit,
      ),
      tone: "mint",
    });
  }

  if (item.dueAt) {
    const date =
      typeof item.dueAt?.toDate === "function"
        ? item.dueAt.toDate()
        : new Date(item.dueAt);

    if (isValidDate(date)) {
      const today = startOfDay(new Date());
      const tomorrow = addDays(today, 1);
      const dueDay = startOfDay(date);

      let dayLabel;

      if (dueDay.getTime() === today.getTime()) {
        dayLabel =
          date.getTime() < Date.now()
            ? "Overdue"
            : "Today";
      } else if (dueDay.getTime() === tomorrow.getTime()) {
        dayLabel = "Tomorrow";
      } else {
        dayLabel = new Intl.DateTimeFormat(undefined, {
          month: "short",
          day: "numeric",
        }).format(date);
      }

      pills.push({
        key: "date",
        label: dayLabel,
        tone: getDueTone(item.dueAt),
      });

      pills.push({
        key: "time",
        label: new Intl.DateTimeFormat(undefined, {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }).format(date),
        tone: "lavender",
      });
    }
  }

  return pills;
}

export function renderHighlightedText(text, term) {
  const cleanTerm = term.trim();

  if (!cleanTerm) return text;

  const lowerText = text.toLowerCase();
  const lowerTerm = cleanTerm.toLowerCase();
  const index = lowerText.indexOf(lowerTerm);

  if (index === -1) return text;

  return (
    <>
      {text.slice(0, index)}
      <mark>
        {text.slice(index, index + cleanTerm.length)}
      </mark>
      {text.slice(index + cleanTerm.length)}
    </>
  );
}


