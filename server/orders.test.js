"use strict";

// 2026-11-17: paid orders are recorded from Stripe's signed event, once per PaymentIntent.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseItemsMetadata, recordPaidOrder, recordRefund } = require("./orders");
const { priceItems, itemsMetadata } = require("./catalog");

function fakeFirestore(initial = {}) {
  const store = new Map(Object.entries(initial));
  const snapshot = (key) => ({ exists: store.has(key), data: () => store.get(key) });
  const db = {
    collection(name) { return { doc(id) { const key = `${name}/${id}`; return { key, get: async () => snapshot(key) }; } }; },
    async runTransaction(callback) {
      const writes = [];
      const tx = {
        get: async (ref) => snapshot(ref.key),
        create(ref, value) { writes.push(() => { if (store.has(ref.key)) throw new Error("ALREADY_EXISTS"); store.set(ref.key, value); }); },
        update(ref, patch) { writes.push(() => store.set(ref.key, { ...store.get(ref.key), ...patch })); },
      };
      const result = await callback(tx);
      writes.forEach((write) => write());
      return result;
    },
  };
  return { db, store };
}

const charge = {
  id: "ch_1", created: 1795000000,
  billing_details: { name: "山田 花子", email: "hanako@example.com", phone: null,
    address: { country: "JP", postal_code: "248-0006", state: "神奈川県", city: null, line1: "鎌倉市小町1-1", line2: "" } },
};
const stripe = { charges: { retrieve: async (id) => { assert.equal(id, "ch_1"); return charge; } } };
const intent = (over = {}) => ({
  object: "payment_intent", id: "pi_1", status: "succeeded", amount: 5850, currency: "jpy", livemode: false, created: 1795000000,
  latest_charge: "ch_1",
  metadata: { items: itemsMetadata(priceItems([{ id: "enma-karamo", quantity: 2 }, { id: "enma-kindiio", quantity: 1 }])),
    subtotal: "5650", shipping: "200", couponCode: "", countryCode: "JP", email: "tmp@tmp.com", name: "tmp" },
  ...over,
});

test("a paid order is recorded once, at the charged prices, with the customer as given to Stripe", async () => {
  const { db, store } = fakeFirestore();
  assert.deepEqual(await recordPaidOrder(db, stripe, intent()), { recorded: true });
  const order = store.get("orders/pi_1");
  assert.equal(order.status, "paid");
  assert.equal(order.amount, 5850);
  assert.equal(order.subtotal, 5650);
  assert.equal(order.shipping, 200);
  assert.deepEqual(order.items, [
    { id: "enma-karamo", quantity: 2, unitPrice: 1800 },
    { id: "enma-kindiio", quantity: 1, unitPrice: 2050 },
  ]);
  assert.equal(order.customer.name, "山田 花子", "the browser's placeholder metadata (tmp) is not used");
  assert.equal(order.customer.email, "hanako@example.com");
  assert.equal(order.customer.address.postalCode, "248-0006");
  assert.equal(order.chargeId, "ch_1");
  assert.equal(order.paidAt.getTime(), 1795000000 * 1000);
  // Stripe resends the same event: nothing changes.
  assert.deepEqual(await recordPaidOrder(db, stripe, intent()), { recorded: false, reason: "DUPLICATE" });
  assert.equal(store.size, 1);
});

test("subscriptions, older checkouts and unpaid intents are not recorded as store orders", async () => {
  const { db, store } = fakeFirestore();
  assert.equal((await recordPaidOrder(db, stripe, intent({ metadata: {} }))).reason, "NOT_A_STORE_ORDER");
  assert.equal((await recordPaidOrder(db, stripe, intent({ metadata: { items: "enma-karamo:2" } }))).reason, "NOT_A_STORE_ORDER");
  assert.equal((await recordPaidOrder(db, stripe, intent({ status: "processing" }))).reason, "NOT_SUCCEEDED");
  assert.equal(store.size, 0);
  assert.throws(() => parseItemsMetadata("enma-karamo:2@1800,enma-karamo:1@1800"), /INVALID_ITEMS/);
  assert.throws(() => parseItemsMetadata("Enma:1@1"), /NOT_A_STORE_ORDER/);
});

test("refunds are recorded on the order; unknown charges are ignored", async () => {
  const { db, store } = fakeFirestore();
  await recordPaidOrder(db, stripe, intent());
  assert.deepEqual(await recordRefund(db, { payment_intent: "pi_1", amount_refunded: 1800 }), { updated: true });
  assert.equal(store.get("orders/pi_1").status, "partially_refunded");
  await recordRefund(db, { payment_intent: "pi_1", amount_refunded: 5850 });
  assert.equal(store.get("orders/pi_1").status, "refunded");
  assert.equal(store.get("orders/pi_1").amountRefunded, 5850);
  assert.equal((await recordRefund(db, { payment_intent: "pi_other", amount_refunded: 1 })).reason, "UNKNOWN_ORDER");
  assert.equal((await recordRefund(db, { payment_intent: null })).reason, "NO_PAYMENT_INTENT");
});

test("the signed webhook records orders whenever its secret is set; stock is settled only with inventory on", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const hook = source.slice(source.indexOf('app.post("/stripe-inventory-webhook"'), source.indexOf("app.use(express.json());"));
  assert.match(hook, /stripe\.webhooks\.constructEvent\(req\.body, req\.headers\["stripe-signature"\], INVENTORY_STRIPE_WEBHOOK_SECRET\)/);
  assert.ok(hook.indexOf("orders.recordPaidOrder") < hook.indexOf('inventory.finish(db, reservationId, object.id, "paid")'),
    "the paid order is kept first, whatever happens to the stock step");
  assert.match(hook, /if \(INVENTORY_ENABLED && reservationId\) await inventory\.finish/);
  assert.match(hook, /charge\.refunded/);
  assert.match(hook, /return res\.status\(500\)/, "a failed write makes Stripe resend");
  const route = source.slice(source.indexOf('app.post("/create-payment-intent"'), source.indexOf('app.post("/calc-shipping"'));
  assert.match(route, /subtotal: String\(quote\.subtotal\),\n\s+shipping: String\(quote\.shipping\),/);
});
