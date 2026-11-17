"use strict";
// Integration tests against the real Firestore emulator (real transactions, contention
// and retries). Skipped unless FIRESTORE_EMULATOR_HOST is set, so they can never reach
// a real Firebase project. Run: see docs/inventory-rollout.md "Emulator integration tests".
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const crypto = require("node:crypto");
const express = require("express");

const emulator = process.env.FIRESTORE_EMULATOR_HOST;
const skip = emulator ? false : "FIRESTORE_EMULATOR_HOST not set";

const CEO = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const secret = "emulator-only-shared-secret-0123456789abcdef";
const env = {
  INVENTORY_STAGING_ONLY: "true", FIRESTORE_CHECKOUT_ENABLED: "true",
  FIRESTORE_FACTORY_API_ENABLED: "true", FIREBASE_PROJECT_ID: "ryuge-inventory",
  FIREBASE_CLIENT_EMAIL: "ryuge-inventory-render@ryuge-inventory.iam.gserviceaccount.com",
  STRIPE_SECRET_KEY: "sk_test_emulator", FACTORY_INVENTORY_HMAC_SECRET: secret,
  FACTORY_CEO_USER_ID: CEO,
};
const PRICES = { "enma-karamo": { price: 1800, weightG: 120 } };
const shipping = () => 0;

let firestore;
let db;
let api;
let preview;
let inventory;

test.before(async () => {
  if (skip) return;
  // Emulator-only project ID ("demo-" prefix never resolves to a real project).
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(emulator)) throw new Error("EMULATOR_HOST_MUST_BE_LOCAL");
  const admin = require("firebase-admin");
  const app = admin.initializeApp({ projectId: "demo-ryuge-inventory" },
    "emulator-" + crypto.randomUUID());
  firestore = admin.firestore(app);
  preview = require("./firestore-preview-checkout");
  api = require("./factory-inventory-api");
  inventory = require("./inventory");
  db = preview.previewNamespace(firestore);
  // Start from an empty emulator database on every run.
  const reset = await fetch("http://" + emulator +
    "/emulator/v1/projects/demo-ryuge-inventory/databases/(default)/documents", { method: "DELETE" });
  if (!reset.ok) throw new Error("EMULATOR_RESET_FAILED");
});

async function seed(sku, stock) {
  await firestore.collection("inventoryPreview").doc(sku)
    .set({ ...stock, previewOnly: true });
}
async function stock(sku) {
  return (await firestore.collection("inventoryPreview").doc(sku).get()).data();
}

// --- Fake Stripe (test mode semantics: idempotency keys, statuses, cancel) ---
function fakeStripe() {
  const intents = new Map();
  const byKey = new Map();
  return {
    intents,
    paymentIntents: {
      async create(params, { idempotencyKey }) {
        if (byKey.has(idempotencyKey)) return intents.get(byKey.get(idempotencyKey));
        const intent = { id: "pi_test_" + crypto.randomUUID().replace(/-/g, ""),
          client_secret: "pi_secret_test", livemode: false, status: "requires_payment_method",
          amount: params.amount, metadata: params.metadata };
        intents.set(intent.id, intent);
        byKey.set(idempotencyKey, intent.id);
        return intent;
      },
      async retrieve(id) { return intents.get(id); },
      async cancel(id) {
        const intent = intents.get(id);
        if (["succeeded", "processing"].includes(intent.status)) throw new Error("CANNOT_CANCEL");
        intent.status = "canceled";
        return intent;
      },
    },
  };
}

// --- Factory signed API over HTTP, with the real handler and preview namespace ---
function factoryBody(overrides = {}) {
  return {
    sku: "enma-karamo", action: "stock_in", quantity: 1,
    requestId: crypto.randomUUID(), approvedBy: CEO, approvedAt: Date.now() - 500,
    ...overrides,
  };
}
async function withFactoryServer(fn) {
  const app = express();
  app.post(api.PATH, express.raw({ type: "application/json", limit: "4kb" }),
    api.createHandler({ getDb: () => db, env, limiter: () => true,
      log: { warn() {}, error() {} } }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try { return await fn("http://127.0.0.1:" + server.address().port + api.PATH); }
  finally { server.close(); }
}
async function send(url, value, { ts = String(Date.now()), badSecret = false } = {}) {
  const body = JSON.stringify(value);
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-factory-timestamp": ts,
      "x-factory-signature": api.signatureFor(badSecret ? secret + "!" : secret, ts,
        Buffer.from(body)) },
    body,
  });
  return { status: response.status, json: await response.json().catch(() => null) };
}

test("Factory restock / retail sale over HTTP on real Firestore; official stock untouched", { skip }, async () => {
  await firestore.collection("inventory").doc("enma-karamo")
    .set({ ready: 15, held: 0, sold: 0, note: "official placeholder sentinel" });
  await seed("enma-karamo", { ready: 2, held: 0, sold: 0 });
  await withFactoryServer(async (url) => {
    const restock = factoryBody({ quantity: 5 });
    assert.deepEqual(await send(url, restock),
      { status: 200, json: { ok: true, applied: true, remaining: 7 } });
    // Concurrent duplicate deliveries of one approved request apply exactly once.
    const dup = factoryBody({ quantity: 2 });
    const results = await Promise.all(Array.from({ length: 6 }, () => send(url, dup)));
    assert.equal(results.filter((r) => r.json?.applied === true).length, 1);
    assert.ok(results.every((r) => r.status === 200 && r.json.remaining === 9));
    assert.deepEqual(await send(url, factoryBody({ action: "retail_sale", quantity: 3 })),
      { status: 200, json: { ok: true, applied: true, remaining: 6 } });
    assert.equal((await send(url, factoryBody({ action: "retail_sale", quantity: 7 }))).status, 409);
    assert.equal((await send(url, factoryBody(), { badSecret: true })).status, 401);
    assert.equal((await send(url, factoryBody(),
      { ts: String(Date.now() - 6 * 60 * 1000) })).status, 401);
    assert.equal((await send(url, factoryBody({
      approvedBy: "11111111-2222-4333-8444-555555555555" }))).status, 403);
    assert.equal((await send(url, factoryBody({
      approvedAt: Date.now() - 20 * 60 * 1000 }))).status, 403);
    assert.equal((await send(url, { ...restock, quantity: 50 })).status, 409);
    const audit = (await firestore.collection("inventoryPreviewAdjustments")
      .doc(restock.requestId).get()).data();
    assert.equal(audit.actor, "factory-ceo:" + CEO);
    assert.deepEqual(audit.before, { ready: 2, held: 0, sold: 0 });
    assert.deepEqual(audit.after, { ready: 7, held: 0, sold: 0 });
    assert.equal(audit.channel, "factory-signed-api");
  });
  assert.deepEqual(await stock("enma-karamo"),
    { ready: 6, held: 0, sold: 3, previewOnly: true });
  const official = (await firestore.collection("inventory").doc("enma-karamo").get()).data();
  assert.deepEqual(official, { ready: 15, held: 0, sold: 0, note: "official placeholder sentinel" });
  const leaked = await firestore.collection("inventoryAdjustments").limit(1).get();
  assert.equal(leaked.empty, true);
});

test("parallel store sales never sell more than available stock", { skip }, async () => {
  await seed("enma-karamo", { ready: 4, held: 0, sold: 0 });
  await withFactoryServer(async (url) => {
    const results = await Promise.all(Array.from({ length: 10 }, () =>
      send(url, factoryBody({ action: "retail_sale", quantity: 1 }))));
    assert.equal(results.filter((r) => r.status === 200).length, 4);
    assert.equal(results.filter((r) => r.status === 409).length, 6);
  });
  assert.deepEqual(await stock("enma-karamo"), { ready: 0, held: 0, sold: 4, previewOnly: true });
});

function intentEvent(stripe, checkoutKey) {
  return [...stripe.intents.values()].find((i) => i.metadata.inventoryCheckoutKey === checkoutKey);
}

test("two buyers for the last bag: one hold, sold-out shown, store sale cannot take the held bag", { skip }, async () => {
  await seed("enma-karamo", { ready: 1, held: 0, sold: 0 });
  const stripe = fakeStripe();
  const items = [{ id: "enma-karamo", quantity: 1 }];
  const keys = [crypto.randomUUID(), crypto.randomUUID()];
  const outcomes = await Promise.allSettled(keys.map((key) =>
    preview.createCheckout(db, stripe, items, key, PRICES, shipping)));
  assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 1);
  assert.match(outcomes.find((o) => o.status === "rejected").reason.message, /OUT_OF_STOCK/);
  assert.deepEqual(await preview.previewAvailability(db, ["enma-karamo"]), { "enma-karamo": 0 });
  await withFactoryServer(async (url) => {
    assert.equal((await send(url, factoryBody({ action: "retail_sale" }))).status, 409);
  });
  // Same checkout key retried (browser reload) re-uses the hold and the PaymentIntent.
  const winner = keys[outcomes.findIndex((o) => o.status === "fulfilled")];
  await preview.createCheckout(db, stripe, items, winner, PRICES, shipping);
  assert.equal(stripe.intents.size, 1);
  assert.deepEqual(await stock("enma-karamo"), { ready: 1, held: 1, sold: 0, previewOnly: true });

  const intent = intentEvent(stripe, winner);
  intent.status = "succeeded";
  assert.equal(await preview.settlePreviewEvent(db, intent, "payment_intent.succeeded"), true);
  // Stripe re-delivers the webhook: no second decrement.
  assert.equal(await preview.settlePreviewEvent(db, intent, "payment_intent.succeeded"), false);
  assert.deepEqual(await stock("enma-karamo"), { ready: 0, held: 0, sold: 1, previewOnly: true });
  await assert.rejects(() => preview.createCheckout(db, stripe, items, crypto.randomUUID(),
    PRICES, shipping), /OUT_OF_STOCK/);
});

test("payment failure keeps hold; cancellation restores stock; forged intent cannot settle", { skip }, async () => {
  await seed("enma-karamo", { ready: 2, held: 0, sold: 0 });
  const stripe = fakeStripe();
  const key = crypto.randomUUID();
  await preview.createCheckout(db, stripe, [{ id: "enma-karamo", quantity: 2 }], key,
    PRICES, shipping);
  const intent = intentEvent(stripe, key);
  // Card declined: PaymentIntent returns to requires_payment_method; no settling event.
  assert.equal(await preview.settlePreviewEvent(db, intent, "payment_intent.payment_failed"), false);
  assert.deepEqual(await stock("enma-karamo"), { ready: 2, held: 2, sold: 0, previewOnly: true });
  const forged = { ...intent, id: "pi_test_forged" };
  await assert.rejects(() => preview.settlePreviewEvent(db, forged, "payment_intent.succeeded"),
    /PREVIEW_PAYMENT_NOT_BOUND/);
  await assert.rejects(() => preview.settlePreviewEvent(db, { ...intent, livemode: true },
    "payment_intent.succeeded"), /INVALID_PREVIEW_EVENT/);
  intent.status = "canceled";
  assert.equal(await preview.settlePreviewEvent(db, intent, "payment_intent.canceled"), true);
  assert.equal(await preview.settlePreviewEvent(db, intent, "payment_intent.canceled"), false);
  // A late "succeeded" after release must not decrement released stock.
  await assert.rejects(() => preview.settlePreviewEvent(db, intent, "payment_intent.succeeded"),
    /RESERVATION_ALREADY_FINALIZED/);
  assert.deepEqual(await stock("enma-karamo"), { ready: 2, held: 0, sold: 0, previewOnly: true });
});

test("lost webhooks / server restart: reconciliation settles from Stripe state", { skip }, async () => {
  await seed("enma-karamo", { ready: 3, held: 0, sold: 0 });
  const stripe = fakeStripe();
  const keys = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  for (const key of keys) {
    await preview.createCheckout(db, stripe, [{ id: "enma-karamo", quantity: 1 }], key,
      PRICES, shipping);
  }
  const [paid, abandoned, processing] = keys.map((key) => intentEvent(stripe, key));
  paid.status = "succeeded";            // webhook never arrived
  abandoned.status = "requires_payment_method"; // customer left
  processing.status = "processing";     // bank still deciding
  // Simulate time passing beyond the 20 minute hold window (e.g. after a restart).
  const old = new Date(Date.now() - 30 * 60 * 1000);
  const reservations = await firestore.collection("inventoryPreviewReservations")
    .where("status", "==", "reserved").get();
  await Promise.all(reservations.docs.map((doc) => doc.ref.update({ createdAt: old })));
  const results = await inventory.reconcileExpired(db, stripe, 30);
  const actions = results.map((r) => r.action).sort();
  assert.deepEqual(actions, ["canceled-and-released", "paid", "pending-reconciliation"]);
  assert.equal(abandoned.status, "canceled");
  assert.deepEqual(await stock("enma-karamo"), { ready: 2, held: 1, sold: 1, previewOnly: true });
  // A second run (e.g. another instance) is a no-op for already finalized holds.
  const again = await inventory.reconcileExpired(db, stripe, 30);
  assert.deepEqual(again.map((r) => r.action), ["pending-reconciliation"]);
  // The delayed webhook for the reconciled payment arrives later: still exactly once.
  assert.equal(await preview.settlePreviewEvent(db, paid, "payment_intent.succeeded"), false);
  assert.deepEqual(await stock("enma-karamo"), { ready: 2, held: 1, sold: 1, previewOnly: true });
});

test("paid order records: a Stripe resend, even concurrent, writes one order on real Firestore", { skip }, async () => {
  const orders = require("./orders");
  const charge = { id: "ch_emulator", created: 1795000000, billing_details: { name: "Emulator", email: "e@example.com", address: {} } };
  const stripe = { charges: { retrieve: async () => charge } };
  const intent = {
    object: "payment_intent", id: "pi_emulator_order", status: "succeeded", amount: 2000, currency: "jpy",
    livemode: false, created: 1795000000, latest_charge: "ch_emulator",
    metadata: { items: "enma-karamo:1@1800", subtotal: "1800", shipping: "200", countryCode: "JP" },
  };
  // Uses its own collection root so it can never meet real order data.
  const ordersDb = { collection: (name) => firestore.collection("emulatorOrdersTest_" + name), runTransaction: (fn) => firestore.runTransaction(fn) };
  const results = await Promise.all([1, 2, 3].map(() => orders.recordPaidOrder(ordersDb, stripe, intent)));
  assert.equal(results.filter((r) => r.recorded).length, 1);
  const snapshot = await firestore.collection("emulatorOrdersTest_orders").get();
  assert.equal(snapshot.size, 1);
  assert.deepEqual(snapshot.docs[0].data().items, [{ id: "enma-karamo", quantity: 1, unitPrice: 1800 }]);
});
