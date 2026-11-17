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

test("promotional beans: two simultaneous orders from one customer cannot both pass; the 15-bag cap holds", { skip }, async () => {
  const { promoKeys } = require("./promo");
  // Own collection roots (never real data): inventory, reservations and the promo ledger.
  const scoped = { collection: (name) => firestore.collection("emulatorPromoTest_" + name), runTransaction: (fn) => firestore.runTransaction(fn) };
  await firestore.collection("emulatorPromoTest_inventory").doc("enma-zen-dark-roast").set({ ready: 15, held: 0, sold: 0 });
  await firestore.collection("emulatorPromoTest_inventory").doc("enma-jimma").set({ ready: 15, held: 0, sold: 0 });
  const keys = promoKeys({ email: "same@example.com", countryCode: "JP", postalCode: "2480006", address: "鎌倉市小町1-1" });
  const attempts = await Promise.allSettled([1, 2, 3].map(() =>
    inventory.reserve(scoped, [{ id: "enma-zen-dark-roast", quantity: 2 }], null, { keys, quantity: 2, limit: 2 })));
  assert.equal(attempts.filter((a) => a.status === "fulfilled").length, 1);
  assert.ok(attempts.filter((a) => a.status === "rejected").every((a) => /PROMO_CUSTOMER_LIMIT/.test(a.reason.message)));
  const held = (await firestore.collection("emulatorPromoTest_inventory").doc("enma-zen-dark-roast").get()).data().held;
  assert.equal(held, 2, "only the accepted order holds stock");
  // 15 bags is the cap: 16 cannot be reserved, 15 can.
  await assert.rejects(inventory.reserve(scoped, [{ id: "enma-jimma", quantity: 16 }]), /OUT_OF_STOCK/);
  assert.ok(await inventory.reserve(scoped, [{ id: "enma-jimma", quantity: 15 }]));
  await assert.rejects(inventory.reserve(scoped, [{ id: "enma-jimma", quantity: 1 }]), /OUT_OF_STOCK/);
});

test("Brazil lot: the regular and the promotional Brazil, ordered at the same moment, never sell more than the lot", { skip }, async () => {
  const { lotItems, priceItems } = require("./catalog");
  // Own collection roots (never real data).
  const scoped = { collection: (name) => firestore.collection("emulatorLotTest_" + name), runTransaction: (fn) => firestore.runTransaction(fn) };
  // Each product has its own sales cap (10 + 10), but only 12 bags can be roasted from the purchase.
  await firestore.collection("emulatorLotTest_inventory").doc("enma-zen-dark-roast").set({ ready: 10, held: 0, sold: 0 });
  await firestore.collection("emulatorLotTest_inventory").doc("enma-amarelo-bourbon").set({ ready: 10, held: 0, sold: 0 });
  await firestore.collection("emulatorLotTest_inventoryLots").doc("brazil-amarelo-bourbon").set({ ready: 12, held: 0, sold: 0 });
  const order = (id, quantity) => {
    const items = priceItems([{ id, quantity }]);
    return inventory.reserve(scoped, items.map(({ id: sku, quantity: q }) => ({ id: sku, quantity: q })), null, null, lotItems(items));
  };
  // 4 + 4 + 4 + 4 bags at once: only 3 orders (12 bags) fit the lot.
  const attempts = await Promise.allSettled([
    order("enma-amarelo-bourbon", 4), order("enma-amarelo-bourbon", 4), order("enma-zen-dark-roast", 2), order("enma-zen-dark-roast", 2),
    order("enma-amarelo-bourbon", 2), order("enma-amarelo-bourbon", 2),
  ]);
  const accepted = attempts.filter((a) => a.status === "fulfilled").length;
  assert.ok(attempts.filter((a) => a.status === "rejected").every((a) => /OUT_OF_STOCK/.test(a.reason.message)));
  const lot = (await firestore.collection("emulatorLotTest_inventoryLots").doc("brazil-amarelo-bourbon").get()).data();
  const zen = (await firestore.collection("emulatorLotTest_inventory").doc("enma-zen-dark-roast").get()).data();
  const regular = (await firestore.collection("emulatorLotTest_inventory").doc("enma-amarelo-bourbon").get()).data();
  assert.ok(lot.held <= 12, "never more than the lot");
  assert.equal(lot.held, zen.held + regular.held, "the lot counts both products");
  assert.ok(accepted >= 1);
  assert.ok(regular.held <= 10 && zen.held <= 10, "each product keeps its own cap");
});

test("initial stock: real transactions — two applies at once create each record once; an existing record is never touched", { skip }, async () => {
  const { previewInitialStock, applyInitialStock } = require("./initial-stock");
  // Own collection roots (never real data).
  const scoped = { collection: (name) => firestore.collection("emulatorInitialStock_" + name), runTransaction: (fn) => firestore.runTransaction(fn) };
  await firestore.collection("emulatorInitialStock_inventory").doc("enma-karamo").set({ ready: 15, held: 2, sold: 3 });
  const plan = { "inventory/enma-jimma": 15, "inventoryLots/brazil-amarelo-bourbon": 12 };
  const { planHash, refused } = await previewInitialStock(scoped, plan, { projectId: "demo-ryuge-inventory" });
  assert.deepEqual(refused, []);
  const opts = { projectId: "demo-ryuge-inventory", expectedProjectId: "demo-ryuge-inventory", planHash, approval: "CEO承認（エミュレーター）" };
  const results = await Promise.allSettled([applyInitialStock(scoped, plan, opts), applyInitialStock(scoped, plan, opts)]);
  const applied = results.filter((r) => r.status === "fulfilled" && r.value.applied).length;
  assert.equal(applied, 1, "exactly one apply wrote");
  for (const r of results) if (r.status === "rejected") assert.match(r.reason.message, /PLAN_CHANGED|ALREADY_EXISTS/);
  const jimma = (await firestore.collection("emulatorInitialStock_inventory").doc("enma-jimma").get()).data();
  assert.deepEqual([jimma.ready, jimma.held, jimma.sold], [15, 0, 0]);
  const karamo = (await firestore.collection("emulatorInitialStock_inventory").doc("enma-karamo").get()).data();
  assert.deepEqual(karamo, { ready: 15, held: 2, sold: 3 }, "untouched");
  const logs = await firestore.collection("emulatorInitialStock_inventoryInitialStock").get();
  assert.equal(logs.size, 1);
});

test("refunds: two approvals of one preview at once refund once; the apply and the webhook settling together restock once", { skip }, async () => {
  const refunds = require("./refunds");
  const scoped = { collection: (name) => firestore.collection("emulatorRefund_" + name), runTransaction: (fn) => firestore.runTransaction(fn) };
  const PI = "pi_EmulatorRefund01";
  const RES = "c0000000-0000-4000-8000-000000000001";
  await firestore.collection("emulatorRefund_orders").doc(PI).set({ status: "paid", amount: 3850, subtotal: 3600, shipping: 250, livemode: false,
    items: [{ id: "enma-karamo", quantity: 2, unitPrice: 1800 }], inventoryReservationId: RES });
  await firestore.collection("emulatorRefund_inventoryReservations").doc(RES).set({ status: "paid", items: [{ id: "enma-karamo", quantity: 2 }] });
  await firestore.collection("emulatorRefund_inventory").doc("enma-karamo").set({ ready: 28, held: 0, sold: 2 });
  const made = [];
  const stripe = {
    paymentIntents: { retrieve: async (id) => ({ id, status: "succeeded", latest_charge: { id: "ch", amount: 3850, amount_captured: 3850, amount_refunded: made.reduce((s, r) => s + r.amount, 0) } }) },
    refunds: {
      create: async (params, opts) => {
        const prior = made.find((r) => r.key === opts.idempotencyKey);
        if (prior) return prior;
        const r = { id: "re_" + made.length, key: opts.idempotencyKey, amount: params.amount, status: "succeeded", metadata: params.metadata, payment_intent: params.payment_intent };
        made.push(r);
        return r;
      },
      list: async () => ({ data: made }),
    },
  };
  const input = { orderId: PI, lines: [{ id: "enma-karamo", quantity: 2, shipped: false }], refundShipping: true };
  const p = await refunds.previewRefund(scoped, stripe, input);
  const opts = { planHash: p.planHash, approval: "CEO承認（エミュレーター）", actor: "test:ceo" };
  const both = await Promise.allSettled([refunds.applyRefund(scoped, stripe, input, opts), refunds.applyRefund(scoped, stripe, input, opts)]);
  assert.equal(both.filter((r) => r.status === "fulfilled" && r.value.status === "refunded").length, 1, "one approval went through");
  for (const r of both) if (r.status === "rejected") assert.match(r.reason.message, /PLAN_CHANGED|EXCEEDS_REMAINING_QUANTITY|SHIPPING_ALREADY_REFUNDED/);
  assert.equal(made.length, 1, "Stripe refunded once");
  // The webhook settles the same refund again, twice and concurrently: nothing more happens.
  await Promise.all([refunds.syncRefunds(scoped, stripe, PI), refunds.syncRefunds(scoped, stripe, PI)]);
  const karamo = (await firestore.collection("emulatorRefund_inventory").doc("enma-karamo").get()).data();
  assert.deepEqual(karamo, { ready: 30, held: 0, sold: 0 }, "restocked exactly once");
  const order = (await firestore.collection("emulatorRefund_orders").doc(PI).get()).data();
  assert.equal(order.status, "refunded");
  assert.equal(order.amountRefunded, 3850);
  assert.deepEqual(order.refundLedger.external, {});
});
