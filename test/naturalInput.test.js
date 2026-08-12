import test from "node:test";
import assert from "node:assert/strict";

import { parseNaturalInput } from "../src/lib/naturalInput.js";

test("extracts quantity, unit, date, time, and clean item text", () => {
  const parsed = parseNaturalInput("buy 2 kg apples tomorrow at 5pm");

  assert.equal(parsed.text, "Apples");
  assert.equal(parsed.quantity, 2);
  assert.equal(parsed.quantityUnit, "kg");
  assert.equal(parsed.dueAt.getHours(), 17);
  assert.equal(parsed.dueAt.getMinutes(), 0);
  assert.equal(parsed.hasExplicitTime, true);
  assert.equal(parsed.hasNaturalData, true);
});

test("keeps ordinary text unchanged when no metadata is present", () => {
  assert.deepEqual(parseNaturalInput("Read a book"), {
    rawInput: "Read a book",
    text: "Read a book",
    quantity: null,
    quantityUnit: "",
    dueAt: null,
    hasExplicitTime: false,
    warning: "",
    hasNaturalData: false,
  });
});

test("understands common relative-date shorthand", () => {
  const parsed = parseNaturalInput("submit report tmrw noon");

  assert.equal(parsed.text, "Submit report");
  assert.equal(parsed.dueAt.getHours(), 12);
  assert.equal(parsed.hasExplicitTime, true);
});
