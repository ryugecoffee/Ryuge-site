"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const {
  PATH, enabled, signatureFor, verifyRequest, processSignedAdjustment,
  createRateLimiter, createHandler,
} = require("./factory-inventory-api");

const secret = "this-is-an-isolated-sandbox-test-secret-123456";
const CEO = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const timestamp = String(Date.UTC(2026, 10, 15));
const now = Number(timestamp);
const goodEnv = {
  INVENTORY_STAGING_ONLY: "true", FIRESTORE_CHECKOUT_ENABLED: "true",
  FIRESTORE_FACTORY_API_ENABLED: "true", FIREBASE_PROJECT_ID: "ryuge-inventory",
  FIREBASE_CLIENT_EMAIL: "ryuge-inventory-render@ryuge-inventory.iam.gserviceaccount.com",
  STRIPE_SECRET_KEY: "sk_test_mock", FACTORY_INVENTORY_HMAC_SECRET: secret,
  FACTORY_CEO_USER_ID: CEO,
};
let seq = 0;
function approvalId() {
  seq += 1;
  return "0b7a4c1e-1111-4222-8333-" + String(seq).padStart(12, "0");
}
function payload(overrides = {}) {
  return {
    sku: "enma-karamo", action: "stock_in", quantity: 3, requestId: approvalId(),
    approvedBy: CEO, approvedAt: now - 1000, ...overrides,
  };
}
const bytes = (value) => Buffer.from(JSON.stringify(value));

// Contract vector shared with Factory (lib/ryuge-preview-inventory-client.ts tests).
// Changing the signing format must break both repositories' tests.
test("shared signing vector matches the Factory client", () => {
  const vectorBody = Buffer.from('{"sku":"enma-karamo","action":"stock_in","quantity":5,' +
    '"requestId":"0b7a4c1e-1111-4222-8333-000000000001","approvedBy":"' + CEO +
    '","approvedAt":1763164800000}');
  assert.equal(signatureFor("factory-contract-vector-secret-0123456789abcdef", "1763164800000",
    vectorBody), "531e819a42dd40d1b1c34fe88aa008e6649e7e19d179443510a70718e8ff37ce");
});

function stubDb(initial = { ready: 2, held: 1, sold: 4 }) {
  const state = new Map([["inventory/enma-karamo", { ...initial }]]);
  let queue = Promise.resolve();
  const db = {
    collection(collection) { return {
      doc(id) { return { path: collection + "/" + id }; },
    }; },
    async runTransaction(fn) {
      const prior = queue;
      let release;
      queue = new Promise((resolve) => { release = resolve; });
      await prior;
      let writing = false;
      const changes = [];
      const tx = {
        async get(ref) {
          if (writing) throw new Error("READ_AFTER_WRITE");
          const data = state.get(ref.path);
          return { exists: data !== undefined, data: () => data };
        },
        update(ref, patch) {
          writing = true;
          changes.push(() => state.set(ref.path, { ...state.get(ref.path), ...patch }));
        },
        create(ref, data) {
          writing = true;
          changes.push(() => {
            assert.equal(state.has(ref.path), false);
            state.set(ref.path, data);
          });
        },
      };
      try {
        const result = await fn(tx);
        changes.forEach((run) => run());
        return result;
      } finally { release(); }
    },
  };
  return { db, state };
}
function signed(body, ts = timestamp) {
  return { rawBody: body, timestamp: ts, signature: signatureFor(secret, ts, body), now };
}

test("Factory API defaults to disabled; refuses live key, other project, weak secret or no CEO ID", () => {
  assert.equal(enabled({}), false);
  assert.equal(enabled(goodEnv), true);
  assert.equal(enabled({ ...goodEnv, STRIPE_SECRET_KEY: "sk_live_oops" }), false);
  assert.equal(enabled({ ...goodEnv, FIREBASE_PROJECT_ID: "production-other" }), false);
  assert.equal(enabled({ ...goodEnv, FIRESTORE_FACTORY_API_ENABLED: undefined }), false);
  assert.equal(enabled({ ...goodEnv, FACTORY_INVENTORY_HMAC_SECRET: "short" }), false);
  assert.equal(enabled({ ...goodEnv, FACTORY_CEO_USER_ID: undefined }), false);
  assert.equal(enabled({ ...goodEnv, FACTORY_CEO_USER_ID: "ryugecoffee" }), false);
});

test("HMAC binds method, endpoint, exact bytes and timestamp with five-minute window", () => {
  const body = bytes(payload());
  const signature = signatureFor(secret, timestamp, body);
  assert.equal(verifyRequest({ secret, timestamp, signature, rawBody: body, now }), true);
  assert.equal(verifyRequest({ secret, timestamp, signature, rawBody: body,
    now: now + 300001 }), false);
  assert.equal(verifyRequest({ secret, timestamp, signature, rawBody: body,
    now: now - 300001 }), false);
  assert.equal(verifyRequest({ secret, timestamp, signature,
    rawBody: Buffer.from(body.toString() + " "), now }), false);
  assert.equal(verifyRequest({ secret, timestamp, signature: "0".repeat(64),
    rawBody: body, now }), false);
  assert.equal(verifyRequest({ secret: secret + "x", timestamp, signature,
    rawBody: body, now }), false);
  assert.equal(verifyRequest({ secret, timestamp: "not-a-date", signature,
    rawBody: body, now }), false);
});

test("signed + CEO-approved stock-in applies exactly once and records approval evidence", async () => {
  const { db, state } = stubDb();
  const request = payload();
  const input = { db, env: goodEnv, ...signed(bytes(request)) };
  const [a, b] = await Promise.all([
    processSignedAdjustment(input), processSignedAdjustment(input),
  ]);
  assert.deepEqual([a.applied, b.applied].sort(), [false, true]);
  assert.equal(state.get("inventory/enma-karamo").ready, 5);
  assert.equal(state.get("inventory/enma-karamo").held, 1);
  const audit = state.get("inventoryAdjustments/" + request.requestId);
  assert.equal(audit.actor, "factory-ceo:" + CEO);
  assert.equal(audit.before.ready, 2);
  assert.equal(audit.after.ready, 5);
  assert.equal(audit.channel, "factory-signed-api");
  assert.equal(audit.approvedAt.getTime(), request.approvedAt);
  assert.equal(audit.signedAt.getTime(), now);
});

test("retail sale decrements, refuses to sell held or missing stock", async () => {
  const { db, state } = stubDb({ ready: 3, held: 1, sold: 0 });
  const ok = await processSignedAdjustment({ db, env: goodEnv,
    ...signed(bytes(payload({ action: "retail_sale", quantity: 2 }))) });
  assert.deepEqual(ok, { applied: true, remaining: 0 });
  await assert.rejects(() => processSignedAdjustment({ db, env: goodEnv,
    ...signed(bytes(payload({ action: "retail_sale", quantity: 1 }))) }), /OUT_OF_STOCK/);
  assert.deepEqual(state.get("inventory/enma-karamo"), { ready: 1, held: 1, sold: 2 });
});

test("service signature alone is not enough: CEO approval must be present, matching and fresh", async () => {
  const { db, state } = stubDb();
  const cases = [
    [payload({ approvedBy: "11111111-2222-4333-8444-555555555555" }), /CEO_APPROVAL_REQUIRED/],
    [payload({ requestId: "not-an-approval-id" }), /CEO_APPROVAL_REQUIRED/],
    [payload({ approvedAt: now - 16 * 60 * 1000 }), /CEO_APPROVAL_EXPIRED/],
    [payload({ approvedAt: now + 60 * 1000 }), /CEO_APPROVAL_EXPIRED/],
    [payload({ approvedAt: String(now) }), /CEO_APPROVAL_EXPIRED/],
  ];
  for (const [request, error] of cases) {
    await assert.rejects(() => processSignedAdjustment({ db, env: goodEnv,
      ...signed(bytes(request)) }), error);
  }
  const { approvedBy: _omit, ...missing } = payload();
  await assert.rejects(() => processSignedAdjustment({ db, env: goodEnv,
    ...signed(bytes(missing)) }), /INVALID_FIELDS/);
  assert.deepEqual(state.get("inventory/enma-karamo"), { ready: 2, held: 1, sold: 4 });
});

test("untrusted actor field, tampered or expired signature are rejected before writes", async () => {
  const { db, state } = stubDb();
  const malicious = bytes({ ...payload(), trustedActor: "factory-ceo:attacker" });
  await assert.rejects(() => processSignedAdjustment({ db, env: goodEnv,
    ...signed(malicious) }), /INVALID_FIELDS/);
  const good = bytes(payload());
  await assert.rejects(() => processSignedAdjustment({ db, env: goodEnv,
    rawBody: good, timestamp, signature: signatureFor(secret, timestamp, malicious), now,
  }), /INVALID_FACTORY_SIGNATURE/);
  const old = String(now - 10 * 60 * 1000);
  await assert.rejects(() => processSignedAdjustment({ db, env: goodEnv,
    ...signed(good, old) }), /INVALID_FACTORY_SIGNATURE/);
  assert.equal(state.get("inventory/enma-karamo").ready, 2);
});

test("same approval ID cannot be reused for a different operation", async () => {
  const { db, state } = stubDb();
  const first = payload();
  await processSignedAdjustment({ db, env: goodEnv, ...signed(bytes(first)) });
  await assert.rejects(() => processSignedAdjustment({ db, env: goodEnv,
    ...signed(bytes({ ...first, quantity: 50 })) }), /INVENTORY_REQUEST_ID_CONFLICT/);
  assert.equal(state.get("inventory/enma-karamo").ready, 5);
});

test("rate limiter bounds requests per window", () => {
  let clock = 0;
  const allow = createRateLimiter({ limit: 2, windowMs: 1000, clock: () => clock });
  assert.equal(allow("a"), true);
  assert.equal(allow("a"), true);
  assert.equal(allow("a"), false);
  assert.equal(allow("b"), true);
  clock = 1000;
  assert.equal(allow("a"), true);
});

async function withServer(env, db, fn, limiter) {
  const app = express();
  const quiet = { warn() {}, error() {} };
  app.post(PATH, express.raw({ type: "application/json", limit: "4kb" }),
    createHandler({ getDb: () => db, env, clock: () => now, limiter, log: quiet }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  try { return await fn(base); } finally { server.close(); }
}
async function post(base, body, headers = {}) {
  const ts = headers.ts ?? timestamp;
  const response = await fetch(base + PATH, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-factory-timestamp": ts,
      "x-factory-signature": headers.signature ?? signatureFor(secret, ts, body),
    },
    body,
  });
  return { status: response.status, json: await response.json().catch(() => null) };
}

test("HTTP: success, duplicate, unauthorized, expired, out-of-stock and disabled responses", async () => {
  const { db, state } = stubDb({ ready: 2, held: 0, sold: 0 });
  await withServer(goodEnv, db, async (base) => {
    const restock = bytes(payload({ quantity: 5 }));
    assert.deepEqual(await post(base, restock),
      { status: 200, json: { ok: true, applied: true, remaining: 7 } });
    assert.deepEqual(await post(base, restock),
      { status: 200, json: { ok: true, applied: false, remaining: 7 } });
    assert.equal((await post(base, bytes(payload()), { signature: "f".repeat(64) })).status, 401);
    assert.equal((await post(base, bytes(payload()), { signature: "" })).status, 401);
    const stale = String(now - 6 * 60 * 1000);
    assert.equal((await post(base, bytes(payload()), { ts: stale })).status, 401);
    const notCeo = await post(base, bytes(payload({
      approvedBy: "11111111-2222-4333-8444-555555555555" })));
    assert.deepEqual(notCeo, { status: 403, json: { error: "CEO_APPROVAL_REQUIRED" } });
    const tooMany = await post(base, bytes(payload({ action: "retail_sale", quantity: 8 })));
    assert.deepEqual(tooMany, { status: 409, json: { error: "OUT_OF_STOCK" } });
    const unknown = await post(base, bytes(payload({ sku: "not-a-real-sku" })));
    assert.equal(unknown.status, 400);
    const big = Buffer.from(JSON.stringify({ ...payload(), pad: "x".repeat(5000) }));
    assert.equal((await post(base, big)).status, 413);
  });
  assert.deepEqual(state.get("inventory/enma-karamo"), { ready: 7, held: 0, sold: 0 });
  await withServer({ ...goodEnv, FIRESTORE_FACTORY_API_ENABLED: "false" }, db, async (base) => {
    assert.equal((await post(base, bytes(payload()))).status, 404);
  });
});

test("HTTP: rate limit returns 429 without touching stock", async () => {
  const { db, state } = stubDb();
  await withServer(goodEnv, db, async (base) => {
    assert.equal((await post(base, bytes(payload({ quantity: 1 })))).status, 200);
    assert.equal((await post(base, bytes(payload({ quantity: 1 })))).status, 429);
  }, createRateLimiter({ limit: 1 }));
  assert.equal(state.get("inventory/enma-karamo").ready, 3);
});
