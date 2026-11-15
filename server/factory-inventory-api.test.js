"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { enabled, signatureFor, verifyRequest, processSignedAdjustment } = require("./factory-inventory-api");

const secret = "this-is-an-isolated-sandbox-test-secret-123456";
const timestamp = String(Date.UTC(2026, 10, 15));
const goodEnv = {
  INVENTORY_STAGING_ONLY: "true", FIRESTORE_CHECKOUT_ENABLED: "true",
  FIRESTORE_FACTORY_API_ENABLED: "true", FIREBASE_PROJECT_ID: "ryuge-inventory",
  FIREBASE_CLIENT_EMAIL: "ryuge-inventory-render@ryuge-inventory.iam.gserviceaccount.com",
  STRIPE_SECRET_KEY: "sk_test_mock", FACTORY_INVENTORY_HMAC_SECRET: secret,
};
const body = Buffer.from(JSON.stringify({
  sku: "enma-karamo", action: "stock_in", quantity: 3,
  requestId: "factory-request-001",
}));
function stubDb() {
  const state = new Map([["inventory/enma-karamo",
    { ready: 2, held: 1, sold: 4 }]]);
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
test("Factory API defaults to disabled, refuses live key, unexpected project or weak shared secret", () => {
  assert.equal(enabled({}), false);
  assert.equal(enabled(goodEnv), true);
  assert.equal(enabled({ ...goodEnv, STRIPE_SECRET_KEY: "sk_live_oops" }), false);
  assert.equal(enabled({ ...goodEnv, FIREBASE_PROJECT_ID: "production-other" }), false);
  assert.equal(enabled({ ...goodEnv, FIRESTORE_FACTORY_API_ENABLED: undefined }), false);
  assert.equal(enabled({ ...goodEnv, FACTORY_INVENTORY_HMAC_SECRET: "short" }), false);
});
test("HMAC binds method, endpoint, exact bytes and timestamp with five-minute window", () => {
  const signature = signatureFor(secret, timestamp, body);
  assert.equal(verifyRequest({ secret, timestamp, signature, rawBody: body,
    now: Number(timestamp) }), true);
  assert.equal(verifyRequest({ secret, timestamp, signature, rawBody: body,
    now: Number(timestamp) + 300001 }), false);
  assert.equal(verifyRequest({ secret, timestamp, signature,
    rawBody: Buffer.from(body.toString() + " "), now: Number(timestamp) }), false);
  assert.equal(verifyRequest({ secret, timestamp, signature: "0".repeat(64),
    rawBody: body, now: Number(timestamp) }), false);
  assert.equal(verifyRequest({ secret, timestamp: "not-a-date", signature,
    rawBody: body, now: Number(timestamp) }), false);
});
test("signed stock-in applies once, maintains audit and trusted server actor", async () => {
  const { db, state } = stubDb();
  const signature = signatureFor(secret, timestamp, body);
  const input = { db, env: goodEnv, rawBody: body, timestamp, signature,
    now: Number(timestamp) };
  const [a,b] = await Promise.all([
    processSignedAdjustment(input), processSignedAdjustment(input),
  ]);
  assert.deepEqual([a.applied,b.applied].sort(), [false,true]);
  assert.equal(state.get("inventory/enma-karamo").ready, 5);
  assert.equal(state.get("inventory/enma-karamo").held, 1);
  const audit = state.get("inventoryAdjustments/factory-request-001");
  assert.equal(audit.actor, "factory-ceo:ryugecoffee");
  assert.equal(audit.before.ready, 2);
});
test("untrusted body actor and tampered request are rejected before writes", async () => {
  const { db, state } = stubDb();
  const malicious = Buffer.from(JSON.stringify({
    sku: "enma-karamo", action: "retail_sale", quantity: 1,
    requestId: "factory-request-002", trustedActor: "factory-ceo:attacker",
  }));
  await assert.rejects(() => processSignedAdjustment({
    db, env: goodEnv, rawBody: malicious, timestamp,
    signature: signatureFor(secret, timestamp, malicious),
    now: Number(timestamp),
  }), /INVALID_FIELDS/);
  await assert.rejects(() => processSignedAdjustment({
    db, env: goodEnv, rawBody: body, timestamp,
    signature: signatureFor(secret, timestamp, malicious),
    now: Number(timestamp),
  }), /INVALID_FACTORY_SIGNATURE/);
  assert.equal(state.get("inventory/enma-karamo").ready, 2);
});
