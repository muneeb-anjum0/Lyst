import test from "node:test";
import assert from "node:assert/strict";

import { LystBudget } from "../worker/src/index.js";

function createBudget() {
  const values = new Map();
  const kv = {
    get(key) {
      return values.get(key);
    },
    put(key, value) {
      values.set(key, value);
    },
  };

  return { budget: new LystBudget({ storage: { kv } }), values };
}

async function budgetRequest(budget, body) {
  return budget.fetch(
    new Request("https://budget.internal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

test("reserves and commits successful usage", async () => {
  const { budget, values } = createBudget();
  assert.equal(
    (await budgetRequest(budget, { op: "reserve", uid: "user-1", reservation: 100 })).status,
    200,
  );
  assert.equal(
    (
      await budgetRequest(budget, {
        op: "commit",
        uid: "user-1",
        reservation: 100,
        inputTokens: 40,
        outputTokens: 20,
        totalTokens: 60,
      })
    ).status,
    200,
  );

  const daily = [...values.entries()].find(([key]) => key.startsWith("d:"))[1];
  assert.deepEqual(daily, { reservedRequests: 0, requests: 1 });
});

test("releases a failed request without consuming daily quota", async () => {
  const { budget, values } = createBudget();
  await budgetRequest(budget, { op: "reserve", uid: "user-1", reservation: 100 });
  await budgetRequest(budget, { op: "release", uid: "user-1", reservation: 100 });

  const daily = [...values.entries()].find(([key]) => key.startsWith("d:"))[1];
  assert.deepEqual(daily, { reservedRequests: 0 });
});
