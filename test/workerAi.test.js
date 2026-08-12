import test from "node:test";
import assert from "node:assert/strict";

import {
  parseJsonResponse,
  sanitizeGeneratedItems,
} from "../worker/src/index.js";

test("parses plain and fenced Gemini JSON", () => {
  assert.deepEqual(parseJsonResponse('{"items":[]}'), { items: [] });
  assert.deepEqual(parseJsonResponse('```json\n{"items":["milk"]}\n```'), {
    items: ["milk"],
  });
});

test("rejects empty and malformed Gemini responses", () => {
  assert.throws(() => parseJsonResponse(""), /no response text/i);
  assert.throws(() => parseJsonResponse("not json"), /invalid JSON/i);
});

test("sanitizes, deduplicates, and limits generated items", () => {
  assert.deepEqual(
    sanitizeGeneratedItems(
      [
        { text: "  Milk  ", quantity: "2", quantityUnit: " cartons " },
        { text: "milk!", quantity: 5, quantityUnit: "bottles" },
        { text: "Bread", quantity: "invalid", quantityUnit: "" },
        { text: "Eggs", quantity: 12, quantityUnit: "" },
      ],
      2,
    ),
    [
      { text: "Milk", quantity: 2, quantityUnit: "cartons" },
      { text: "Bread", quantity: null, quantityUnit: "" },
    ],
  );
});
