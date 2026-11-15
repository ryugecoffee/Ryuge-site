"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  previewAllowed, claimCheckout, createCheckout, settlePreviewEvent, previewAvailability,
} = require("./firestore-preview-checkout");

function fakeDb(initial) {
  const state = new Map(Object.entries(initial));
  let queue = Promise.resolve();
  const db = {
    collection(name) {
      return {
        doc(id) {
          const path = name + "/" + id;
          return {
            path,
            async get() {
              const value = state.get(path);
              return { exists: value !== undefined, data: () => value };
            },
          };
        },
      };
    },
    async runTransaction(cb) {
      const prior = queue;
      let release;
      queue = new Promise((resolve) => { release = resolve; });
      await prior;
      const mutations = [];
      let wrote = false;
      const tx = {
        async get(ref) {
          if (wrote) throw new Error("READ_AFTER_WRITE");
          const value = state.get(ref.path);
          return { exists: value !== undefined, data: () => value };
        },
        update(ref, data) {
          wrote = true;
          mutations.push(() => state.set(ref.path, { ...state.get(ref.path), ...data }));
        },
        create(ref, data) {
          wrote = true;
          mutations.push(() => {
            if (state.has(ref.path)) throw new Error("DOC_ALREADY_EXISTS");
            state.set(ref.path, data);
          });
        },
      };
      try {
        const value = await cb(tx);
        mutations.forEach((write) => write());
        return value;
      } finally {
        release();
      }
    },
  };
  return { db, state };
}

const checkoutKey = "a" + "1".repeat(35);
const id2 = "b" + "2".repeat(35);
const item = [{ id: "enma-karamo", quantity: 1 }];
const prices = { "enma-karamo": { price: 1800, weightG: 120 } };
function stateWithStock(ready, held = 0, sold = 0) {
  return fakeDb({ "inventory/enma-karamo": { ready, held, sold } });
}
function stripeFake() {
  const calls = [];
  return {
    calls,
    paymentIntents: {
      async create(params, options) {
        calls.push({ params, options });
        return { id: "pi_test_one", client_secret: "pi_test_one_secret_abc",
          livemode: false, amount: params.amount };
      },
    },
  };
}

test("preview gating requires staging, specific Firestore identity and Stripe test key", () => {
  const allowed = {
    FIRESTORE_CHECKOUT_ENABLED: "true", INVENTORY_STAGING_ONLY: "true",
    FIREBASE_PROJECT_ID: "ryuge-inventory",
    FIREBASE_CLIENT_EMAIL: "ryuge-inventory-render@ryuge-inventory.iam.gserviceaccount.com",
    STRIPE_SECRET_KEY: "sk_test_mock",
  };
  assert.equal(previewAllowed(allowed), true);
  assert.equal(previewAllowed({ ...allowed, STRIPE_SECRET_KEY: "sk_live_mock" }), false);
  assert.equal(previewAllowed({ ...allowed, INVENTORY_STAGING_ONLY: "false" }), false);
  assert.equal(previewAllowed({ ...allowed, FIREBASE_PROJECT_ID: "ryuge-site" }), false);
  assert.equal(previewAllowed({ ...allowed, FIRESTORE_CHECKOUT_ENABLED: undefined }), false);
});

test("parallel identical checkout claims hold the bag once", async () => {
  const { db, state } = stateWithStock(2);
  const [a,b,c] = await Promise.all(Array.from({ length: 3 }, () =>
    claimCheckout(db, item, checkoutKey)));
  assert.equal([a,b,c].filter((x) => x.created).length, 1);
  assert.equal(a.reservationId, b.reservationId);
  assert.equal(b.reservationId, c.reservationId);
  assert.deepEqual(state.get("inventory/enma-karamo"), { ready: 2, held: 1, sold: 0 });
});

test("checkout key collision with changed quantity is rejected", async () => {
  const { db } = stateWithStock(3);
  await claimCheckout(db, item, checkoutKey);
  await assert.rejects(() => claimCheckout(db, [{ id: "enma-karamo", quantity: 2 }],
    checkoutKey), /CHECKOUT_KEY_CONFLICT/);
});

test("sold out blocks reservation and never calls Stripe", async () => {
  const { db } = stateWithStock(1, 1);
  const stripe = stripeFake();
  await assert.rejects(() => createCheckout(db, stripe, item, checkoutKey, prices,
    () => 200), /OUT_OF_STOCK/);
  assert.equal(stripe.calls.length, 0);
});

test("payment creation is idempotent; verified webhook settles Firestore once", async () => {
  const { db, state } = stateWithStock(1);
  const stripe = stripeFake();
  const [first, second] = await Promise.all([
    createCheckout(db, stripe, item, checkoutKey, prices, () => 200),
    createCheckout(db, stripe, item, checkoutKey, prices, () => 200),
  ]);
  assert.deepEqual(first, second);
  assert.equal(first.total, 2000);
  assert.equal(stripe.calls.every((x) =>
    x.options.idempotencyKey === "firestore-preview-" + checkoutKey), true);
  assert.equal(stripe.calls.every((x) =>
    x.params.metadata.inventoryEnvironment === "firestore-preview"), true);
  const reservationId = state.get("inventoryCheckoutKeys/" + checkoutKey).reservationId;
  const event = {
    id: "pi_test_one", livemode: false,
    metadata: {
      inventoryEnvironment: "firestore-preview",
      inventoryReservationId: reservationId, inventoryCheckoutKey: checkoutKey,
    },
  };
  assert.equal(await settlePreviewEvent(db, event, "payment_intent.succeeded"), true);
  assert.equal(await settlePreviewEvent(db, event, "payment_intent.succeeded"), false);
  assert.deepEqual(state.get("inventory/enma-karamo"), { ready: 0, held: 0, sold: 1 });
  assert.deepEqual(await previewAvailability(db, ["enma-karamo"]), { "enma-karamo": 0 });
  await assert.rejects(() => createCheckout(db, stripe, item, checkoutKey,
    prices, () => 200), /CHECKOUT_ALREADY_FINALIZED/);
});

test("signed cancellation releases reserved bag and keeps sold unchanged", async () => {
  const { db, state } = stateWithStock(1);
  await createCheckout(db, stripeFake(), item, id2, prices, () => 200);
  const reservationId = state.get("inventoryCheckoutKeys/" + id2).reservationId;
  const event = {
    id: "pi_test_one", livemode: false,
    metadata: {
      inventoryEnvironment: "firestore-preview",
      inventoryReservationId: reservationId, inventoryCheckoutKey: id2,
    },
  };
  assert.equal(await settlePreviewEvent(db, event, "payment_intent.canceled"), true);
  assert.equal(await settlePreviewEvent(db, event, "payment_intent.canceled"), false);
  assert.deepEqual(state.get("inventory/enma-karamo"), { ready: 1, held: 0, sold: 0 });
});

test("forged or non-test webhook cannot modify inventory", async () => {
  const { db, state } = stateWithStock(1);
  await createCheckout(db, stripeFake(), item, checkoutKey, prices, () => 200);
  const reservationId = state.get("inventoryCheckoutKeys/" + checkoutKey).reservationId;
  const original = state.get("inventory/enma-karamo");
  await assert.rejects(() => settlePreviewEvent(db, {
    id: "pi_wrong", livemode: false,
    metadata: { inventoryEnvironment: "firestore-preview",
      inventoryReservationId: reservationId, inventoryCheckoutKey: checkoutKey },
  }, "payment_intent.succeeded"), /PREVIEW_PAYMENT_NOT_BOUND/);
  await assert.rejects(() => settlePreviewEvent(db, {
    id: "pi_test_one", livemode: true,
    metadata: { inventoryEnvironment: "firestore-preview",
      inventoryReservationId: reservationId, inventoryCheckoutKey: checkoutKey },
  }, "payment_intent.succeeded"), /INVALID_PREVIEW_EVENT/);
  assert.deepEqual(state.get("inventory/enma-karamo"), original);
});
