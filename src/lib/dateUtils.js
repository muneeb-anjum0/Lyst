export function startOfDay(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function addDays(date, amount) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

export function isValidDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

export function setLocalTime(date, hours, minutes) {
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
