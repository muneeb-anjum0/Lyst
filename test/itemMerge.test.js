import test from "node:test";
import assert from "node:assert/strict";

import {
  mergeQuantities,
  normalizeItemKey,
  quantitiesCanMerge,
} from "../src/lib/itemMerge.js";

test("normalizes item names for duplicate matching", () => {
  assert.equal(normalizeItemKey("  Crème & Sugar! "), "creme and sugar");
});

test("merges compatible quantities", () => {
  assert.deepEqual(
    mergeQuantities(
      { quantity: 2, quantityUnit: "kg" },
      { quantity: 3, quantityUnit: "KG" },
    ),
    { quantity: 5, quantityUnit: "KG" },
  );
});

test("does not add quantities with conflicting units", () => {
  const existing = { quantity: 2, quantityUnit: "kg" };
  const incoming = { quantity: 3, quantityUnit: "litres" };

  assert.equal(quantitiesCanMerge(existing, incoming), false);
  assert.deepEqual(mergeQuantities(existing, incoming), {
    quantity: 3,
    quantityUnit: "litres",
  });
});

test("preserves an absent quantity", () => {
  assert.deepEqual(
    mergeQuantities(
      { quantity: null, quantityUnit: "" },
      { quantity: undefined, quantityUnit: "items" },
    ),
    { quantity: null, quantityUnit: "items" },
  );
});
