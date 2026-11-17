"use strict";

// 2026-11-17: refunds and partial cancellations (server/refunds.js). Stripe is replaced by an in-memory stand-in with
// Stripe's own semantics (idempotency keys, refunds listed by PaymentIntent, pending/failed refunds, lost answers).
const test = require("node:test");
const assert = require("node:assert/strict");
const refunds = require("./refunds");

function fakeFirestore(initial = {}) {
  const store = new Map(Object.entries(initial).map(([k, v]) => [k, structuredClone(v)]));
  const snapshot = (key) => ({ exists: store.has(key), data: () => structuredClone(store.get(key)) });
  return {
    store,
    collection(name) { return { doc(id) { return { key: `${name}/${id}`, get: async () => snapshot(`${name}/${id}`) }; } }; },
    async runTransaction(callback) {
      const writes = [];
      const tx = {
        get: async (ref) => snapshot(ref.key),
        update(ref, patch) { writes.push(() => { if (!store.has(ref.key)) throw new Error("NOT_FOUND"); store.set(ref.key, { ...store.get(ref.key), ...structuredClone(patch) }); }); },
        create(ref, value) { writes.push(() => { if (store.has(ref.key)) throw new Error("ALREADY_EXISTS"); store.set(ref.key, structuredClone(value)); }); },
      };
      const result = await callback(tx);
      writes.forEach((w) => w());
      return result;
    },
  };
}

function fakeStripe(amount) {
  const state = { amount, refunds: [], byKey: new Map(), next: null, created: 0 };
  const chargeRefunded = () => state.refunds.filter((r) => ["succeeded", "pending"].includes(r.status)).reduce((s, r) => s + r.amount, 0);
  return {
    state,
    paymentIntents: {
      retrieve: async (id) => ({ id, status: "succeeded", amount, latest_charge: { id: "ch_" + id, amount, amount_captured: amount, amount_refunded: chargeRefunded() } }),
    },
    refunds: {
      create: async (params, opts) => {
        const mode = state.next; state.next = null;
        if (mode === "card_error") throw Object.assign(new Error("declined"), { statusCode: 402, code: "charge_already_refunded" });
        if (opts?.idempotencyKey && state.byKey.has(opts.idempotencyKey)) return state.byKey.get(opts.idempotencyKey);
        if (params.amount > amount - chargeRefunded()) throw Object.assign(new Error("too much"), { statusCode: 400, code: "amount_too_large" });
        const refund = { id: "re_" + (++state.created), amount: params.amount, status: mode === "pending" ? "pending" : "succeeded",
          metadata: { ...params.metadata }, payment_intent: params.payment_intent, created: Math.floor(Date.now() / 1000) };
        state.refunds.push(refund);
        if (opts?.idempotencyKey) state.byKey.set(opts.idempotencyKey, refund);
        if (mode === "lost") throw Object.assign(new Error("socket hang up"), { type: "StripeConnectionError" });
        return refund;
      },
      list: async ({ payment_intent }) => ({ data: state.refunds.filter((r) => r.payment_intent === payment_intent) }),
    },
    // A refund made in the Stripe dashboard: no orderRefundId.
    dashboardRefund(id, value) { state.refunds.push({ id: "re_dash" + (++state.created), amount: value, status: "succeeded", metadata: {}, payment_intent: id, created: 1 }); },
  };
}

const PI = "pi_TestOrder0001";
const RES = "a0000000-0000-4000-8000-000000000001";
// Karamo 2 + Jimma 1 + Zen 2 (Brazil lot), WELCOME10 (10% off the products), shipping 250, stock taken by the order.
function world({ reservation = true, coupon = true } = {}) {
  const gross = 2 * 1800 + 1500 + 2 * 1000; // 7100
  const subtotal = coupon ? gross - Math.round(gross * 0.1) : gross; // 6390
  const db = fakeFirestore({
    [`orders/${PI}`]: {
      status: "paid", amount: subtotal + 250, subtotal, shipping: 250, couponCode: coupon ? "WELCOME10" : "", livemode: false,
      items: [{ id: "enma-karamo", quantity: 2, unitPrice: 1800 }, { id: "enma-jimma", quantity: 1, unitPrice: 1500 }, { id: "enma-zen-dark-roast", quantity: 2, unitPrice: 1000 }],
      inventoryReservationId: reservation ? RES : null,
    },
    ...(reservation ? { [`inventoryReservations/${RES}`]: { status: "paid", items: [{ id: "enma-karamo", quantity: 2 }, { id: "enma-jimma", quantity: 1 }, { id: "enma-zen-dark-roast", quantity: 2 }] } } : {}),
    "inventory/enma-karamo": { ready: 28, held: 0, sold: 2 },
    "inventory/enma-jimma": { ready: 14, held: 0, sold: 1 },
    "inventory/enma-zen-dark-roast": { ready: 4, held: 0, sold: 2 },
    "inventoryLots/brazil-amarelo-bourbon": { ready: 13, held: 0, sold: 2 },
  });
  return { db, stripe: fakeStripe(subtotal + 250) };
}
const ACTOR = "test:ceo";
const approve = async (w, input, extra = {}) => {
  const p = await refunds.previewRefund(w.db, w.stripe, { orderId: PI, ...input });
  return { preview: p, result: await refunds.applyRefund(w.db, w.stripe, { orderId: PI, ...input }, { planHash: p.planHash, approval: "CEO承認（テスト）", actor: ACTOR, ...extra }) };
};
const stock = (w, key) => w.db.store.get(key);
const order = (w) => w.db.store.get(`orders/${PI}`);

test("coupon discount is shared across lines exactly; the last unit takes the remainder", () => {
  const o = { subtotal: 6390, items: [{ id: "a", quantity: 2, unitPrice: 1800 }, { id: "b", quantity: 1, unitPrice: 1500 }, { id: "c", quantity: 2, unitPrice: 1000 }] };
  const nets = refunds.lineNets(o);
  assert.deepEqual(nets, { a: 3240, b: 1350, c: 1800 });
  assert.equal(Object.values(nets).reduce((s, x) => s + x, 0), 6390);
  assert.equal(refunds.lineRefundAmount(1001, 3, 0, 0, 1), 333);
  assert.equal(refunds.lineRefundAmount(1001, 3, 1, 333, 1), 334);
  assert.equal(refunds.lineRefundAmount(1001, 3, 2, 667, 1), 334, "the three add up to 1001");
});

test("preview writes nothing and shows amounts, shipping and the stock that would come back", async () => {
  const w = world();
  const before = JSON.stringify([...w.db.store]);
  const p = await refunds.previewRefund(w.db, w.stripe, { orderId: PI, lines: [{ id: "enma-karamo", quantity: 1, shipped: false }, { id: "enma-zen-dark-roast", quantity: 2, shipped: false }], refundShipping: false });
  assert.equal(JSON.stringify([...w.db.store]), before);
  assert.equal(w.stripe.state.refunds.length, 0);
  assert.equal(p.plan.amount, 1620 + 1800);
  assert.deepEqual(p.plan.stock, { "inventory/enma-karamo": 1, "inventory/enma-zen-dark-roast": 2, "inventoryLots/brazil-amarelo-bourbon": 2 });
  assert.match(p.planHash, /^[a-f0-9]{64}$/);
  await assert.rejects(refunds.previewRefund(w.db, w.stripe, { orderId: PI, lines: [{ id: "enma-karamo", quantity: 1 }] }), /SHIPPED_STATE_REQUIRED/, "the CEO states shipped or not for every line");
});

test("full cancellation: everything refunded once, unshipped stock and the Brazil lot back, order fully refunded", async () => {
  const w = world();
  const all = { lines: [{ id: "enma-karamo", quantity: 2, shipped: false }, { id: "enma-jimma", quantity: 1, shipped: false }, { id: "enma-zen-dark-roast", quantity: 2, shipped: false }], refundShipping: true };
  const { preview, result } = await approve(w, all);
  assert.equal(preview.plan.amount, order(w).amount, "products after coupon + shipping = what was paid");
  assert.equal(result.status, "refunded");
  assert.equal(w.stripe.state.refunds.length, 1);
  assert.deepEqual(stock(w, "inventory/enma-karamo"), { ready: 30, held: 0, sold: 0 });
  assert.deepEqual(stock(w, "inventory/enma-jimma"), { ready: 15, held: 0, sold: 0 });
  assert.deepEqual(stock(w, "inventory/enma-zen-dark-roast"), { ready: 6, held: 0, sold: 0 });
  assert.deepEqual(stock(w, "inventoryLots/brazil-amarelo-bourbon"), { ready: 15, held: 0, sold: 0 });
  assert.equal(order(w).status, "refunded");
  assert.equal(order(w).amountRefunded, order(w).amount);
  await assert.rejects(refunds.previewRefund(w.db, w.stripe, { orderId: PI, lines: [{ id: "enma-karamo", quantity: 1, shipped: false }] }), /ALREADY_FULLY_REFUNDED/);
  const audit = w.db.store.get(`orderRefunds/${result.refundId}`);
  assert.equal(audit.actor, ACTOR);
  assert.equal(audit.approval, "CEO承認（テスト）");
  assert.deepEqual(audit.transitions.map((t) => t.status), ["approved", "refunded"]);
});

test("partial refunds by line and quantity add up exactly; refunded units cannot be refunded again; shipped units are not restocked", async () => {
  const w = world();
  let r = await approve(w, { lines: [{ id: "enma-karamo", quantity: 1, shipped: false }] });
  assert.equal(r.preview.plan.amount, 1620);
  assert.deepEqual(stock(w, "inventory/enma-karamo"), { ready: 29, held: 0, sold: 1 });
  r = await approve(w, { lines: [{ id: "enma-karamo", quantity: 1, shipped: true }] });
  assert.equal(r.preview.plan.amount, 1620);
  assert.equal(r.preview.plan.lines[0].restock, 0);
  assert.deepEqual(stock(w, "inventory/enma-karamo"), { ready: 29, held: 0, sold: 1 }, "shipped: no stock back");
  await assert.rejects(refunds.previewRefund(w.db, w.stripe, { orderId: PI, lines: [{ id: "enma-karamo", quantity: 1, shipped: false }] }), /EXCEEDS_REMAINING_QUANTITY/);
  await assert.rejects(refunds.previewRefund(w.db, w.stripe, { orderId: PI, lines: [{ id: "enma-jimma", quantity: 2, shipped: false }] }), /EXCEEDS_REMAINING_QUANTITY/);
  await assert.rejects(refunds.previewRefund(w.db, w.stripe, { orderId: PI, lines: [{ id: "enma-kindiio", quantity: 1, shipped: false }] }), /NOT_IN_ORDER/);
  r = await approve(w, { lines: [], refundShipping: true });
  assert.equal(r.preview.plan.amount, 250);
  await assert.rejects(refunds.previewRefund(w.db, w.stripe, { orderId: PI, lines: [], refundShipping: true }), /SHIPPING_ALREADY_REFUNDED/);
  assert.equal(order(w).status, "partially_refunded");
  assert.equal(order(w).amountRefunded, 1620 + 1620 + 250);
  assert.equal(w.stripe.state.refunds.reduce((s, x) => s + x.amount, 0), 3490);
});

test("approval is bound to the preview: a changed quantity, a second submit or anything that happened since is refused", async () => {
  const w = world();
  const input = { lines: [{ id: "enma-jimma", quantity: 1, shipped: false }] };
  const p = await refunds.previewRefund(w.db, w.stripe, { orderId: PI, ...input });
  await assert.rejects(refunds.applyRefund(w.db, w.stripe, { orderId: PI, lines: [{ id: "enma-karamo", quantity: 1, shipped: false }] }, { planHash: p.planHash, approval: "CEO承認", actor: ACTOR }), /PLAN_CHANGED/);
  await assert.rejects(refunds.applyRefund(w.db, w.stripe, { orderId: PI, ...input }, { planHash: p.planHash, approval: "", actor: ACTOR }), /APPROVAL_REQUIRED/);
  const refundId = "b0000000-0000-4000-8000-000000000001";
  const first = await refunds.applyRefund(w.db, w.stripe, { orderId: PI, ...input }, { planHash: p.planHash, approval: "CEO承認", actor: ACTOR, refundId });
  assert.equal(first.status, "refunded");
  // The same approved request sent again: no second refund, no second restock.
  const again = await refunds.applyRefund(w.db, w.stripe, { orderId: PI, ...input }, { planHash: p.planHash, approval: "CEO承認", actor: ACTOR, refundId });
  assert.equal(again.status, "refunded");
  // The same preview approved under a new id: refused (the order changed since).
  await assert.rejects(refunds.applyRefund(w.db, w.stripe, { orderId: PI, ...input }, { planHash: p.planHash, approval: "CEO承認", actor: ACTOR }), /EXCEEDS_REMAINING_QUANTITY|PLAN_CHANGED/);
  assert.equal(w.stripe.state.refunds.length, 1);
  assert.deepEqual(stock(w, "inventory/enma-jimma"), { ready: 15, held: 0, sold: 0 });
});

test("a lost Stripe answer is resumed without a second refund; a webhook arriving first settles it once", async () => {
  const w = world();
  w.stripe.state.next = "lost"; // Stripe created the refund, the answer never arrived
  const { result } = await approve(w, { lines: [{ id: "enma-karamo", quantity: 2, shipped: false }] });
  assert.equal(result.status, "approved");
  assert.equal(result.retry, true);
  assert.deepEqual(stock(w, "inventory/enma-karamo"), { ready: 28, held: 0, sold: 2 }, "no stock back before Stripe is confirmed");
  await assert.rejects(refunds.previewRefund(w.db, w.stripe, { orderId: PI, lines: [{ id: "enma-karamo", quantity: 1, shipped: false }] }), /EXCEEDS_REMAINING_QUANTITY/, "in-flight units are held");
  // The webhook comes first, then the operator resumes, then the webhook is delivered again.
  await refunds.syncRefunds(w.db, w.stripe, PI);
  const resumed = await refunds.resumeRefund(w.db, w.stripe, result.refundId);
  await refunds.syncRefunds(w.db, w.stripe, PI);
  assert.equal(resumed.status, "refunded");
  assert.equal(w.stripe.state.refunds.length, 1, "never refunded twice");
  assert.deepEqual(stock(w, "inventory/enma-karamo"), { ready: 30, held: 0, sold: 0 }, "restocked once");
  assert.equal(order(w).refundLedger.lines["enma-karamo"].quantity, 2);
  assert.deepEqual(order(w).refundLedger.external, {}, "our own refund is not mistaken for an external one");
});

test("Stripe refuses: nothing changes and the units are free again; Stripe pending: stock only after it succeeds", async () => {
  const w = world();
  w.stripe.state.next = "card_error";
  const { result } = await approve(w, { lines: [{ id: "enma-jimma", quantity: 1, shipped: false }] });
  assert.equal(result.status, "failed");
  assert.deepEqual(order(w).refundLedger.pending, {});
  assert.deepEqual(stock(w, "inventory/enma-jimma"), { ready: 14, held: 0, sold: 1 });
  w.stripe.state.next = "pending";
  const r2 = await approve(w, { lines: [{ id: "enma-jimma", quantity: 1, shipped: false }] });
  assert.equal(r2.result.status, "stripe_pending");
  assert.deepEqual(stock(w, "inventory/enma-jimma"), { ready: 14, held: 0, sold: 1 });
  w.stripe.state.refunds[0].status = "succeeded"; // Stripe finishes it later
  await refunds.syncRefunds(w.db, w.stripe, PI);
  await refunds.syncRefunds(w.db, w.stripe, PI);
  assert.deepEqual(stock(w, "inventory/enma-jimma"), { ready: 15, held: 0, sold: 0 });
  assert.equal(w.db.store.get(`orderRefunds/${r2.result.refundId}`).status, "refunded");
});

test("a refund made in the Stripe dashboard is recorded for review and never restocks; it blocks new refunds until acknowledged", async () => {
  const w = world();
  w.stripe.dashboardRefund(PI, 1000);
  await refunds.syncRefunds(w.db, w.stripe, PI);
  await refunds.syncRefunds(w.db, w.stripe, PI);
  assert.equal(Object.keys(order(w).refundLedger.external).length, 1, "recorded once");
  assert.equal(order(w).needsReview, true);
  assert.equal(order(w).amountRefunded, 1000);
  assert.equal(order(w).status, "partially_refunded");
  for (const key of ["inventory/enma-karamo", "inventory/enma-jimma", "inventory/enma-zen-dark-roast", "inventoryLots/brazil-amarelo-bourbon"]) {
    assert.equal(stock(w, key).sold > 0, true, `${key} untouched`);
  }
  await assert.rejects(refunds.previewRefund(w.db, w.stripe, { orderId: PI, lines: [{ id: "enma-karamo", quantity: 1, shipped: false }] }), /EXTERNAL_REFUNDS_PRESENT/);
  // Acknowledged: the remaining amount is capped by what is left (order total − external − ours).
  const all = { lines: [{ id: "enma-karamo", quantity: 2, shipped: false }, { id: "enma-jimma", quantity: 1, shipped: false }, { id: "enma-zen-dark-roast", quantity: 2, shipped: false }], refundShipping: true, acknowledgeExternalRefunds: true };
  await assert.rejects(refunds.previewRefund(w.db, w.stripe, { orderId: PI, ...all }), /EXCEEDS_STRIPE_REFUNDABLE|EXCEEDS_ORDER_TOTAL/);
});

test("an order paid while inventory was off took no stock, so nothing is given back", async () => {
  const w = world({ reservation: false });
  const { preview, result } = await approve(w, { lines: [{ id: "enma-karamo", quantity: 2, shipped: false }] });
  assert.equal(preview.plan.lines[0].restock, 0);
  assert.equal(preview.plan.lines[0].restockNote, "STOCK_NOT_TAKEN_BY_THIS_ORDER");
  assert.equal(result.status, "refunded");
  assert.deepEqual(stock(w, "inventory/enma-karamo"), { ready: 28, held: 0, sold: 2 });
});

test("if the stock counters disagree, the refund is kept and the order is flagged instead of guessing", async () => {
  const w = world();
  w.db.store.set("inventory/enma-jimma", { ready: 15, held: 0, sold: 0 }); // someone already corrected it by hand
  const { result } = await approve(w, { lines: [{ id: "enma-jimma", quantity: 1, shipped: false }] });
  assert.equal(result.status, "refunded");
  assert.deepEqual(result.review, [{ id: "enma-jimma", reason: "STOCK_COUNTER_MISMATCH" }]);
  assert.deepEqual(stock(w, "inventory/enma-jimma"), { ready: 15, held: 0, sold: 0 }, "not double-counted");
  assert.equal(order(w).needsReview, true);
});

test("Stripe cannot be asked for more than the charge still holds", async () => {
  const w = world();
  w.stripe.state.refunds.push({ id: "re_old", amount: 6500, status: "succeeded", metadata: {}, payment_intent: "pi_other" });
  w.stripe.paymentIntents.retrieve = async (id) => ({ id, status: "succeeded", latest_charge: { id: "ch", amount: 6640, amount_captured: 6640, amount_refunded: 6500 } });
  await assert.rejects(refunds.previewRefund(w.db, w.stripe, { orderId: PI, lines: [{ id: "enma-karamo", quantity: 1, shipped: false }] }), /EXCEEDS_STRIPE_REFUNDABLE/);
});

test("wiring: the refund route is off without its own token; the webhook syncs refunds instead of overwriting totals", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const route = source.slice(source.indexOf('app.post("/internal/orders/refund"'), source.indexOf('app.get("/inventory/availability"'));
  assert.match(route, /const token = process\.env\.ORDER_ADMIN_TOKEN;\n\s+if \(!token \|\| token\.length < 32\) return res\.status\(404\)\.end\(\);/);
  assert.match(route, /timingSafeEqual\(digest\(token\), digest\(supplied\)\)/);
  assert.match(route, /refundLimit\(clientKey\(req\)\.key\)/);
  assert.match(route, /actor: "ceo:order-admin-token"/, "the actor comes from the server, never from the request");
  assert.doesNotMatch(route, /req\.body[^;]*actor/);
  const webhook = source.slice(source.indexOf('app.post("/stripe-inventory-webhook"'), source.indexOf("app.use(express.json());"));
  assert.match(webhook, /event\.type === "charge\.refunded" \|\| event\.type === "charge\.refund\.updated"/);
  assert.match(webhook, /await refunds\.syncRefunds\(db, stripe, paymentIntentId\);/);
  assert.doesNotMatch(webhook, /recordRefund/);
  assert.ok(source.indexOf("app.use(express.json());") < source.indexOf('app.post("/internal/orders/refund"'), "JSON body parsed before the route");
});

test("a refund Stripe fails after it had succeeded: kept, stock not taken back automatically, flagged once for review", async () => {
  const w = world();
  const { result } = await approve(w, { lines: [{ id: "enma-jimma", quantity: 1, shipped: false }] });
  assert.equal(result.status, "refunded");
  assert.deepEqual(stock(w, "inventory/enma-jimma"), { ready: 15, held: 0, sold: 0 });
  w.stripe.state.refunds[0].status = "failed"; // Stripe: charge.refund.updated, status failed
  await refunds.syncRefunds(w.db, w.stripe, PI);
  await refunds.syncRefunds(w.db, w.stripe, PI);
  const audit = w.db.store.get(`orderRefunds/${result.refundId}`);
  assert.equal(audit.stripeFailedAfterSettle, "failed");
  assert.equal(audit.transitions.filter((t) => t.status === "stripe_failed_after_settle").length, 1, "flagged once");
  assert.equal(order(w).needsReview, true);
  assert.deepEqual(stock(w, "inventory/enma-jimma"), { ready: 15, held: 0, sold: 0 }, "no automatic stock change");
});
