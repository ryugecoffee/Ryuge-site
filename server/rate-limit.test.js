"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const { createRateLimiter, rateLimitMiddleware } = require("./rate-limit");

test("limiter resets after the window and keys are independent", () => {
  let now = 0;
  const allow = createRateLimiter({ limit: 2, windowMs: 1000, clock: () => now });
  assert.deepEqual([allow("a"), allow("a"), allow("a"), allow("b")], [true, true, false, true]);
  now = 1000;
  assert.equal(allow("a"), true);
});

test("checkout limiter behind one trusted proxy hop: per client, spoofed prefixes ignored", async () => {
  const app = express();
  app.set("trust proxy", 1);
  let handled = 0;
  app.post("/create-payment-intent", rateLimitMiddleware(createRateLimiter({ limit: 2 })),
    (_req, res) => { handled += 1; res.json({ ok: true }); });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = "http://127.0.0.1:" + server.address().port + "/create-payment-intent";
  // The last X-Forwarded-For entry is the one appended by the (trusted) Render proxy.
  const post = (xff) => fetch(url, { method: "POST", headers: { "x-forwarded-for": xff } })
    .then((r) => r.status);
  try {
    assert.deepEqual([await post("203.0.113.1"), await post("203.0.113.1"), await post("203.0.113.1")],
      [200, 200, 429]);
    // A client cannot escape its bucket by prepending a fake address.
    assert.equal(await post("198.51.100.9, 203.0.113.1"), 429);
    assert.equal(await post("203.0.113.2"), 200);
  } finally { server.close(); }
  assert.equal(handled, 3);
});
