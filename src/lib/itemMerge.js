export function normalizeItemKey(value) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function quantitiesCanMerge(existingItem, incomingItem) {
  const existingUnit = normalizeItemKey(existingItem.quantityUnit || "");
  const incomingUnit = normalizeItemKey(incomingItem.quantityUnit || "");

  return !existingUnit || !incomingUnit || existingUnit === incomingUnit;
}

export function mergeQuantities(existingItem, incomingItem) {
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
        incomingItem.quantityUnit || existingItem.quantityUnit || "",
    };
  }

  if (existingQuantity === null && incomingQuantity === null) {
    return {
      quantity: null,
      quantityUnit:
        incomingItem.quantityUnit || existingItem.quantityUnit || "",
    };
  }

  return {
    quantity: (existingQuantity || 0) + (incomingQuantity || 0),
    quantityUnit:
      incomingItem.quantityUnit || existingItem.quantityUnit || "",
  };
}
