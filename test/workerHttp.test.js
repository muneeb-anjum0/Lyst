import test from "node:test";
import assert from "node:assert/strict";

import {
  allowedOrigins,
  getAllowedOrigin,
  handleOptions,
} from "../worker/src/http.js";

const env = {
  ALLOWED_ORIGINS: "https://lyst.example, http://localhost:5173",
};

test("parses the Worker origin allowlist", () => {
  assert.deepEqual(allowedOrigins(env), [
    "https://lyst.example",
    "http://localhost:5173",
  ]);
});

test("accepts listed origins and rejects unlisted origins", () => {
  assert.equal(
    getAllowedOrigin(
      new Request("https://worker.example/ai", {
        headers: { Origin: "https://lyst.example" },
      }),
      env,
    ),
    "https://lyst.example",
  );
  assert.equal(
    getAllowedOrigin(
      new Request("https://worker.example/ai", {
        headers: { Origin: "https://attacker.example" },
      }),
      env,
    ),
    null,
  );
});

test("returns CORS headers for an allowed preflight", () => {
  const response = handleOptions(
    new Request("https://worker.example/ai", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5173" },
    }),
    env,
  );

  assert.equal(response.status, 204);
  assert.equal(
    response.headers.get("Access-Control-Allow-Origin"),
    "http://localhost:5173",
  );
});

test("rejects a preflight from an unknown origin", () => {
  const response = handleOptions(
    new Request("https://worker.example/ai", {
      method: "OPTIONS",
      headers: { Origin: "https://attacker.example" },
    }),
    env,
  );

  assert.equal(response.status, 403);
});
