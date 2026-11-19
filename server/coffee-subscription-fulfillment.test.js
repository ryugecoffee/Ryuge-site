"use strict";

// 2026-11-19: 珈琲の定期便 ④ — preparing and shipping deliveries from the shop's counted stock (no Stripe, no network).
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const plan = require("./coffee-subscription-plan");
const records = require("./coffee-subscription-records");
const ops = require("./coffee-subscription-stripe");
const inventory = require("./inventory");
const f = require("./coffee-subscription-fulfillment");
const { CALENDAR } = require("./coffee-subscription-calendar");

const CONFIG = { priceIds: { 1: "price_m1", 2: "price_m2", 3: "price_m3", 4: "price_m4" }, calendar: CALENDAR };
const jstAt = (y, m, d, h = 12, min = 0) => Date.UTC(y, m - 1, d, h - 9, min);
const ACTOR = "shop:test";

// In-memory Firestore: serialized transactions, reads before writes, create-once, merge, where (== and in).
function fakeFirestore() {
  const store = new Map();
  let lock = Promise.resolve();
  const snap = (key) => ({ id: key.split("/").pop(), exists: store.has(key), data: () => structuredClone(store.get(key)) });
  const merge = (a, b) => ({ ...(a || {}), ...structuredClone(b) });
  const doc = (name, id) => {
    const key = `${name}/${id}`;
    return { key, get: async () => snap(key), set: async (v, o) => { store.set(key, o?.merge ? merge(store.get(key), v) : structuredClone(v)); },
      update: async (v) => { store.set(key, merge(store.get(key), v)); },
      delete: async () => { store.delete(key); },
      create: async (v) => { if (store.has(key)) throw new Error("ALREADY_EXISTS"); store.set(key, structuredClone(v)); } };
  };
  const query = (name, filters) => ({
    where: (fld, op, v) => query(name, [...filters, [fld, op, v]]),
    limit: () => query(name, filters),
    get: async () => ({ docs: [...store.keys()].filter((k) => k.startsWith(name + "/") && k.split("/").length === 2).map(snap)
      .filter((s) => filters.every(([fld, op, v]) => (op === "in" ? v.includes(s.data()[fld]) : s.data()[fld] === v))) }),
  });
  return {
    store,
    collection: (name) => ({ doc: (id) => doc(name, id), add: async (v) => { const id = `auto${store.size}${Math.random().toString(16).slice(2, 8)}`; store.set(`${name}/${id}`, structuredClone(v)); return { id }; }, where: (fld, op, v) => query(name, [[fld, op, v]]), limit: () => query(name, []), get: () => query(name, []).get() }),
    async runTransaction(cb) {
      const run = lock.then(async () => {
        const writes = [];
        const tx = { get: async (ref) => { if (writes.length) throw new Error("READ_AFTER_WRITE"); return snap(ref.key); },
          create: (ref, v) => writes.push(() => { if (store.has(ref.key)) throw new Error("ALREADY_EXISTS"); store.set(ref.key, structuredClone(v)); }),
          set: (ref, v, o) => writes.push(() => store.set(ref.key, o?.merge ? merge(store.get(ref.key), v) : structuredClone(v))),
          update: (ref, v) => writes.push(() => { if (!store.has(ref.key)) throw new Error("NOT_FOUND"); store.set(ref.key, merge(store.get(ref.key), v)); }) };
        const r = await cb(tx);
        for (const w of writes) w();
        return r;
      });
      lock = run.catch(() => {});
      return run;
    },
  };
}

const stockOf = (db, sku) => db.store.get(`inventory/${sku}`);
const lotOf = (db, lot) => db.store.get(`inventoryLots/${lot}`);
function seedStock(db, levels = {}) {
  const base = { "enma-jimma": 5, "enma-quequesques": 5, "enma-andes-blue": 5, "enma-karamo": 5, "enma-kindiio": 5, "enma-zen-dark-roast": 5, "enma-amarelo-bourbon": 5, ...levels };
  for (const [sku, ready] of Object.entries(base)) db.store.set(`inventory/${sku}`, { ready, held: 0, sold: 0 });
  db.store.set("inventoryLots/brazil-amarelo-bourbon", { ready: levels.lot ?? 8, held: 0, sold: 0 });
  db.store.set("inventory/enma-coffee-bag", { ready: 20, held: 0, sold: 0 });
}

const ev = (type, object) => ({ type, data: { object } });
function contractEvents(sub, { frequency = "2", email = `${sub}@example.com`, startMonth = "2026-12" } = {}) {
  const meta = { kind: records.KIND, frequency, startMonth };
  const session = { id: `cs_${sub}`, mode: "subscription", subscription: sub, customer: `cus_${sub}`, livemode: false,
    customer_details: { email, name: "テスト 花子" }, metadata: { ...meta, preference: "浅煎りが好きです" },
    collected_information: { shipping_details: { name: "テスト 花子", phone: "09000000000",
      address: { postal_code: "248-0006", state: "神奈川県", city: "鎌倉市", line1: "小町9-9-9", line2: "テスト棟", country: "JP" } } } };
  const line = (month) => ({ type: "subscription", pricing: { price_details: { price: `price_m${frequency}` } },
    period: { start: plan.billingStartUnix(month), end: plan.billingStartUnix(plan.addMonths(month, 1)) } });
  const first = { id: `in_first_${sub}`, customer: `cus_${sub}`, livemode: false, billing_reason: "subscription_create", amount_paid: 3000,
    status_transitions: { paid_at: jstAt(2026, 11, 10) / 1000 }, parent: { subscription_details: { subscription: sub, metadata: meta } },
    lines: { data: [line("2026-12")] } };
  const cycle = (month, amount = plan.MONTHLY_PRICES[Number(frequency)]) => ({ ...first, id: `in_${month}_${sub}`, billing_reason: "subscription_cycle",
    amount_paid: amount, status_transitions: { paid_at: plan.billingStartUnix(month) + 3600 }, lines: { data: [line(month)] } });
  return { session, first, cycle };
}
async function signUp(db, sub, opts) {
  const e = contractEvents(sub, opts);
  await records.handleEvent(db, ev("checkout.session.completed", e.session), CONFIG);
  await records.handleEvent(db, ev("invoice.paid", e.first), CONFIG);
  return e;
}
let n = 0;
const rid = () => `req-test-${String(++n).padStart(6, "0")}`;

test("prepare reserves one bag of each bean; ship takes them; nothing moves twice", async () => {
  const db = fakeFirestore();
  seedStock(db);
  await signUp(db, "sub_happy01");
  const id = "sub_happy01_first";
  const now = jstAt(2026, 11, 11);
  const prepId = rid();
  const prepared = await f.prepareShipment(db, { shipmentId: id, skus: ["enma-jimma", "enma-amarelo-bourbon"], requestId: prepId, actor: ACTOR }, { now });
  assert.equal(prepared.status, "preparing");
  assert.deepEqual(stockOf(db, "enma-jimma"), { ready: 5, held: 1, sold: 0 });
  assert.deepEqual(stockOf(db, "enma-amarelo-bourbon"), { ready: 5, held: 1, sold: 0 });
  assert.deepEqual(lotOf(db, "brazil-amarelo-bourbon"), { ready: 8, held: 1, sold: 0 }, "the shared lot is reserved too");
  const shipment = db.store.get(`${records.SHIPMENTS}/${id}`);
  assert.equal(shipment.shipTo.prefecture, "神奈川県", "the address is copied when preparing");
  // The same request again, and the same beans with a new request: nothing more is reserved.
  assert.equal((await f.prepareShipment(db, { shipmentId: id, skus: ["enma-jimma", "enma-amarelo-bourbon"], requestId: prepId, actor: ACTOR }, { now })).applied, false);
  assert.equal((await f.prepareShipment(db, { shipmentId: id, skus: ["enma-amarelo-bourbon", "enma-jimma"], requestId: rid(), actor: ACTOR }, { now })).applied, false);
  await assert.rejects(f.prepareShipment(db, { shipmentId: id, skus: ["enma-jimma", "enma-karamo"], requestId: rid(), actor: ACTOR }, { now }), { code: "ALREADY_PREPARING" });
  assert.deepEqual(stockOf(db, "enma-jimma"), { ready: 5, held: 1, sold: 0 });

  const shipId = rid();
  const shipped = await f.shipShipment(db, { shipmentId: id, requestId: shipId, actor: ACTOR, trackingNumber: "1234-5678-9012" }, { now });
  assert.equal(shipped.status, "shipped");
  assert.deepEqual([db.store.get(`${records.SHIPMENTS}/${id}`).shippingMethod, db.store.get(`${records.SHIPMENTS}/${id}`).trackingNumber], ["letterpack_light", "1234-5678-9012"],
    "every delivery goes by Letter Pack Light, with its tracking number");
  assert.deepEqual(stockOf(db, "enma-jimma"), { ready: 4, held: 0, sold: 1 });
  assert.deepEqual(stockOf(db, "enma-amarelo-bourbon"), { ready: 4, held: 0, sold: 1 });
  assert.deepEqual(lotOf(db, "brazil-amarelo-bourbon"), { ready: 7, held: 0, sold: 1 });
  // Shipping again, at once or later, with the same or another request: stock is taken once.
  const again = await Promise.all([
    f.shipShipment(db, { shipmentId: id, requestId: shipId, actor: ACTOR, trackingNumber: "1234-5678-9012" }, { now }),
    f.shipShipment(db, { shipmentId: id, requestId: rid(), actor: ACTOR }, { now }),
    f.shipShipment(db, { shipmentId: id, requestId: rid(), actor: ACTOR }, { now }),
  ]);
  assert.ok(again.every((r) => r.applied === false));
  assert.deepEqual(stockOf(db, "enma-jimma"), { ready: 4, held: 0, sold: 1 });
  // A request id belongs to one operation.
  await assert.rejects(f.holdShipment(db, { shipmentId: id, requestId: shipId, actor: ACTOR, reason: "OTHER" }, { now }), { code: "REQUEST_ID_CONFLICT" });
  // A shipped delivery cannot be held or resumed.
  await assert.rejects(f.holdShipment(db, { shipmentId: id, requestId: rid(), actor: ACTOR, reason: "OTHER" }, { now }), { code: "INVALID_STATE" });
});

test("bean rules: two different beans, from two different green beans, 100 g counted bags only", () => {
  assert.throws(() => f.validBeans(["enma-jimma"]), { code: "INVALID_BEANS" });
  assert.throws(() => f.validBeans(["enma-jimma", "enma-jimma"]), { code: "SAME_BEANS" });
  assert.throws(() => f.validBeans(["enma-zen-dark-roast", "enma-amarelo-bourbon"]), { code: "SAME_BEANS" }, "same lot = same beans");
  assert.throws(() => f.validBeans(["enma-jimma", "enma-coffee-bag"]), { code: "NOT_A_SUBSCRIPTION_BEAN" });
  assert.throws(() => f.validBeans(["enma-jimma", "woodbox-geisha"]), { code: "NOT_A_SUBSCRIPTION_BEAN" }, "not from counted stock");
  assert.equal(f.validBeans(["enma-jimma", "enma-zen-dark-roast"]).length, 2);
  assert.ok(f.beanSkus().includes("enma-kindiio") && !f.beanSkus().includes("woodbox-tea-bag"));
});

test("never prepared or shipped: unpaid, failed, skipped, after cancellation, duplicate, ended, under review", async () => {
  const db = fakeFirestore();
  seedStock(db);
  const e = await signUp(db, "sub_block01", { frequency: "2" });
  await records.handleEvent(db, ev("invoice.paid", e.cycle("2026-12")), CONFIG);
  const now = jstAt(2026, 12, 4);
  const beans = ["enma-jimma", "enma-karamo"];
  const try1 = (id) => f.prepareShipment(db, { shipmentId: id, skus: beans, requestId: rid(), actor: ACTOR }, { now });
  const monthKey = `${records.MONTHS}/sub_block01_2026-12`;
  const subKey = `${records.SUBS}/sub_block01`;
  const set = (key, patch) => db.store.set(key, { ...db.store.get(key), ...patch });

  // The month's payment was later recorded as failed / replaced by another invoice: not shipped.
  set(monthKey, { status: "payment_failed" });
  await assert.rejects(try1("sub_block01_2026-12_1"), (err) => err.code === "NOT_SHIPPABLE" && err.detail.includes("MONTH_NOT_PAID"));
  set(monthKey, { status: "paid", invoiceId: "in_other" });
  await assert.rejects(try1("sub_block01_2026-12_1"), (err) => err.detail.includes("MONTH_NOT_PAID"));
  set(monthKey, { invoiceId: "in_2026-12_sub_block01" });
  set(subKey, { skips: ["2026-12"] });
  await assert.rejects(try1("sub_block01_2026-12_1"), (err) => err.detail.includes("MONTH_SKIPPED"));
  set(subKey, { skips: [], firstUnchargedMonth: "2026-12" });
  await assert.rejects(try1("sub_block01_2026-12_1"), (err) => err.detail.includes("AFTER_CANCELLATION"));
  set(subKey, { firstUnchargedMonth: null, duplicateOf: "sub_other1" });
  await assert.rejects(try1("sub_block01_2026-12_1"), (err) => err.detail.includes("DUPLICATE_SUBSCRIPTION"));
  await assert.rejects(try1("sub_block01_first"), (err) => err.detail.includes("DUPLICATE_SUBSCRIPTION"));
  set(subKey, { duplicateOf: null, status: "canceled" });
  await assert.rejects(try1("sub_block01_2026-12_1"), (err) => err.detail.includes("CONTRACT_ENDED"), "ended outside our cancellation: CEO decides");
  await assert.rejects(try1("sub_block01_first"), (err) => err.detail.includes("CONTRACT_ENDED"));
  // Cancelled by the customer at the end of a paid month: that month's deliveries still go out.
  set(subKey, { firstUnchargedMonth: "2027-01" });
  assert.equal((await try1("sub_block01_2026-12_1")).status, "preparing");
  set(subKey, { status: "active", firstUnchargedMonth: null });
  // A late delivery waiting for review is not prepared until resumed.
  set(`${records.SHIPMENTS}/sub_block01_2026-12_2`, { status: "needs_review" });
  await assert.rejects(try1("sub_block01_2026-12_2"), (err) => err.code === "INVALID_STATE");
  assert.equal((await f.resumeShipment(db, { shipmentId: "sub_block01_2026-12_2", requestId: rid(), actor: ACTOR }, { now })).status, "planned");
  assert.equal((await try1("sub_block01_2026-12_2")).status, "preparing");
  // No stock was touched by any refusal: two deliveries prepared = two bags of each bean held.
  assert.deepEqual(stockOf(db, "enma-jimma"), { ready: 5, held: 2, sold: 0 });
  // Unknown or malformed ids.
  await assert.rejects(try1("sub_block01_2027-01_1"), { code: "UNKNOWN_SHIPMENT" });
  await assert.rejects(try1("../etc"), { code: "INVALID_SHIPMENT" });
  await assert.rejects(f.prepareShipment(db, { shipmentId: "sub_block01_first", skus: beans, requestId: "short", actor: ACTOR }, { now }), { code: "INVALID_REQUEST_ID" });
});

test("a contract cancelled after the bags were reserved: shipping is refused and holding gives the bags back", async () => {
  const db = fakeFirestore();
  seedStock(db);
  await signUp(db, "sub_ended01");
  const id = "sub_ended01_first";
  const now = jstAt(2026, 11, 11);
  await f.prepareShipment(db, { shipmentId: id, skus: ["enma-jimma", "enma-karamo"], requestId: rid(), actor: ACTOR }, { now });
  db.store.set(`${records.SUBS}/sub_ended01`, { ...db.store.get(`${records.SUBS}/sub_ended01`), status: "canceled" });
  await assert.rejects(f.shipShipment(db, { shipmentId: id, requestId: rid(), actor: ACTOR }, { now }), (err) => err.code === "NOT_SHIPPABLE");
  assert.deepEqual(stockOf(db, "enma-jimma"), { ready: 5, held: 1, sold: 0 });
  const held = await f.holdShipment(db, { shipmentId: id, requestId: rid(), actor: ACTOR, reason: "PAYMENT_CHECK" }, { now });
  assert.deepEqual([held.status, held.released], ["held", true]);
  assert.deepEqual(stockOf(db, "enma-jimma"), { ready: 5, held: 0, sold: 0 });
  assert.deepEqual(stockOf(db, "enma-karamo"), { ready: 5, held: 0, sold: 0 });
  assert.equal(db.store.get(`${records.SHIPMENTS}/${id}`).shipTo, null, "the copied address is dropped with the reservation");
});

test("not enough stock: nothing reserved or shipped, the delivery is held and the shop is told once", async () => {
  const db = fakeFirestore();
  seedStock(db, { "enma-kindiio": 0, lot: 0 });
  await signUp(db, "sub_short01");
  const id = "sub_short01_first";
  const now = jstAt(2026, 11, 11);
  const req = rid();
  const r = await f.prepareShipment(db, { shipmentId: id, skus: ["enma-jimma", "enma-kindiio"], requestId: req, actor: ACTOR }, { now });
  assert.deepEqual([r.status, r.holdReason, r.shortSkus, r.notify], ["held", "OUT_OF_STOCK", ["enma-kindiio"], true]);
  assert.deepEqual(stockOf(db, "enma-jimma"), { ready: 5, held: 0, sold: 0 }, "the bean in stock is not reserved alone");
  const replay = await f.prepareShipment(db, { shipmentId: id, skus: ["enma-jimma", "enma-kindiio"], requestId: req, actor: ACTOR }, { now });
  assert.equal(replay.applied, false, "a resent request does not notify again");
  // The lot is empty although the product has bags: still short.
  const lotShort = await f.prepareShipment(db, { shipmentId: id, skus: ["enma-jimma", "enma-amarelo-bourbon"], requestId: rid(), actor: ACTOR }, { now });
  assert.deepEqual(lotShort.shortSkus, ["enma-amarelo-bourbon"]);
  // Other beans in stock: prepared straight from held.
  const ok = await f.prepareShipment(db, { shipmentId: id, skus: ["enma-jimma", "enma-karamo"], requestId: rid(), actor: ACTOR }, { now });
  assert.equal(ok.status, "preparing");
  assert.equal(db.store.get(`${records.SHIPMENTS}/${id}`).holdReason, null);
  await assert.rejects(f.shipShipment(db, { shipmentId: "sub_short01_first", requestId: rid(), actor: ACTOR, trackingNumber: "abc" }, { now }), { code: "INVALID_TRACKING_NUMBER" });
});

test("single orders and deliveries share the last bag: it goes to exactly one of them", async () => {
  const db = fakeFirestore();
  seedStock(db, { "enma-jimma": 1 });
  await signUp(db, "sub_last001");
  const now = jstAt(2026, 11, 11);
  const [order, delivery] = await Promise.allSettled([
    inventory.reserve(db, [{ id: "enma-jimma", quantity: 1 }], "pi_test_1"),
    f.prepareShipment(db, { shipmentId: "sub_last001_first", skus: ["enma-jimma", "enma-karamo"], requestId: rid(), actor: ACTOR }, { now }),
  ]);
  assert.equal(order.status, "fulfilled", "the order came first");
  assert.equal(delivery.value.status, "held");
  assert.deepEqual(stockOf(db, "enma-jimma"), { ready: 1, held: 1, sold: 0 });
  // The order is released (unpaid): the delivery can take the bag; a new order cannot.
  await inventory.finish(db, order.value, "pi_test_1", "released");
  await f.prepareShipment(db, { shipmentId: "sub_last001_first", skus: ["enma-jimma", "enma-karamo"], requestId: rid(), actor: ACTOR }, { now });
  await assert.rejects(inventory.reserve(db, [{ id: "enma-jimma", quantity: 1 }], "pi_test_2"), /OUT_OF_STOCK/);
  assert.deepEqual(await inventory.availability(db, ["enma-jimma"]), { "enma-jimma": 0 }, "the store shows it sold out");
});

test("stock and delivery disagree at shipping: nothing is taken, the delivery is flagged for review", async () => {
  const db = fakeFirestore();
  seedStock(db);
  await signUp(db, "sub_incon01");
  const id = "sub_incon01_first";
  const now = jstAt(2026, 11, 11);
  await f.prepareShipment(db, { shipmentId: id, skus: ["enma-jimma", "enma-karamo"], requestId: rid(), actor: ACTOR }, { now });
  db.store.set("inventory/enma-karamo", { ready: 5, held: 0, sold: 0 }); // someone reset the counter by hand
  const r = await f.shipShipment(db, { shipmentId: id, requestId: rid(), actor: ACTOR }, { now });
  assert.deepEqual([r.status, r.review, r.notify], ["preparing", "INVENTORY_INCONSISTENCY", true]);
  assert.deepEqual(stockOf(db, "enma-jimma"), { ready: 5, held: 1, sold: 0 }, "the other bean is not taken either");
  assert.equal(db.store.get(`${records.SHIPMENTS}/${id}`).reviewReason, "INVENTORY_INCONSISTENCY");
});

test("cancellation before the first delivery leaves: its reserved bags go back, ¥3,000 proposed (unchanged rule)", async () => {
  const db = fakeFirestore();
  seedStock(db);
  await signUp(db, "sub_cancel1");
  const now = jstAt(2026, 11, 12);
  await f.prepareShipment(db, { shipmentId: "sub_cancel1_first", skus: ["enma-jimma", "enma-amarelo-bourbon"], requestId: rid(), actor: ACTOR }, { now });
  const stripe = {
    subscriptions: { retrieve: async () => ({ id: "sub_cancel1", status: "trialing", schedule: null }), update: async () => ({}), cancel: async () => ({}) },
    invoices: { list: async () => ({ data: [] }), voidInvoice: async () => ({}) },
    subscriptionSchedules: { release: async () => ({}) },
  };
  const preview = await ops.cancellationPreview({ db, stripe, subscriptionId: "sub_cancel1", now });
  assert.equal(preview.firstNotShipped, true, "a delivery being prepared has not left");
  const r = await ops.cancelSubscription({ db, stripe, subscriptionId: "sub_cancel1", now });
  assert.equal(r.refundProposal.status, "awaiting_ceo_approval");
  assert.equal(db.store.get(`${records.SHIPMENTS}/sub_cancel1_first`).status, "cancelled_before_shipping");
  assert.deepEqual(stockOf(db, "enma-jimma"), { ready: 5, held: 0, sold: 0 });
  assert.deepEqual(lotOf(db, "brazil-amarelo-bourbon"), { ready: 8, held: 0, sold: 0 });
  await assert.rejects(f.shipShipment(db, { shipmentId: "sub_cancel1_first", requestId: rid(), actor: ACTOR }, { now }), { code: "INVALID_STATE" });
  // Cancelling twice changes nothing more.
  await ops.cancelSubscription({ db, stripe, subscriptionId: "sub_cancel1", now });
  assert.deepEqual(stockOf(db, "enma-jimma"), { ready: 5, held: 0, sold: 0 });
});

test("resume from preparing gives the bags back so other beans can be chosen", async () => {
  const db = fakeFirestore();
  seedStock(db);
  await signUp(db, "sub_resume1");
  const now = jstAt(2026, 11, 11);
  await f.prepareShipment(db, { shipmentId: "sub_resume1_first", skus: ["enma-jimma", "enma-karamo"], requestId: rid(), actor: ACTOR }, { now });
  const r = await f.resumeShipment(db, { shipmentId: "sub_resume1_first", requestId: rid(), actor: ACTOR }, { now });
  assert.deepEqual([r.status, r.released], ["planned", true]);
  assert.deepEqual(stockOf(db, "enma-jimma"), { ready: 5, held: 0, sold: 0 });
  assert.equal((await f.resumeShipment(db, { shipmentId: "sub_resume1_first", requestId: rid(), actor: ACTOR }, { now })).applied, false);
  await f.prepareShipment(db, { shipmentId: "sub_resume1_first", skus: ["enma-andes-blue", "enma-kindiio"], requestId: rid(), actor: ACTOR }, { now });
  assert.deepEqual(stockOf(db, "enma-andes-blue"), { ready: 5, held: 1, sold: 0 });
});

test("work list: due deliveries, late ones, blockers, the preference and last beans, stock forecast; no personal details", async () => {
  const db = fakeFirestore();
  seedStock(db, { "enma-jimma": 5, "enma-quequesques": 0, "enma-andes-blue": 0, "enma-karamo": 0, "enma-kindiio": 0, lot: 1 });
  const e = await signUp(db, "sub_work001", { frequency: "4" });
  await f.prepareShipment(db, { shipmentId: "sub_work001_first", skus: ["enma-jimma", "enma-zen-dark-roast"], requestId: rid(), actor: ACTOR }, { now: jstAt(2026, 11, 11) });
  await f.shipShipment(db, { shipmentId: "sub_work001_first", requestId: rid(), actor: ACTOR }, { now: jstAt(2026, 11, 12) });
  db.store.set("inventoryLots/brazil-amarelo-bourbon", { ready: 2, held: 0, sold: 1 }); // two more Brazil bags roasted
  await records.handleEvent(db, ev("invoice.paid", e.cycle("2026-12")), CONFIG);
  await signUp(db, "sub_work002"); // later found to duplicate another contract (the CEO decides)
  db.store.set(`${records.SUBS}/sub_work002`, { ...db.store.get(`${records.SUBS}/sub_work002`), duplicateOf: "sub_work001", needsReview: true, reviewReason: "DUPLICATE_SUBSCRIPTION" });
  const list = await f.workList(db, { from: "2026-12-01", to: "2026-12-14" }, { now: jstAt(2026, 12, 2) });
  const text = JSON.stringify(list);
  for (const secret of ["テスト 花子", "example.com", "09000000000", "小町", "テスト棟", "248-0006"]) assert.ok(!text.includes(secret), `no ${secret}`);
  const dec = list.deliveries.filter((d) => d.ref === "SUB-ORK001" && d.kind === "monthly");
  assert.deepEqual(dec.map((d) => d.date), ["2026-12-07", "2026-12-14"], "4 deliveries a month: the ones due in the range (5th → Monday 7th, 12th → 14th)");
  assert.equal(dec[0].preference, "浅煎りが好きです");
  assert.deepEqual(dec[0].previousBeans, ["enma-jimma", "enma-zen-dark-roast"]);
  assert.equal(dec[0].prefecture, "神奈川県");
  const dup = list.deliveries.find((d) => d.shipmentId === "sub_work002_first");
  assert.ok(dup.blockers.includes("DUPLICATE_SUBSCRIPTION"), "listed (open), but marked as not shippable");
  assert.equal(dup.overdue, true);
  // Two monthly deliveries to prepare need 4 bags: Jimma 4 left + the Brazil lot 2 (its two products together never exceed it).
  assert.equal(list.stock.bagsNeeded, 4);
  assert.equal(list.stock.bagsAvailable, 6);
  assert.equal(list.stock.short, false);
  db.store.set("inventoryLots/brazil-amarelo-bourbon", { ready: 1, held: 1, sold: 0 });
  const later = await f.workList(db, { from: "2026-12-01", to: "2026-12-14" }, { now: jstAt(2026, 12, 2) });
  assert.equal(later.stock.short, true, "only one kind of bean left: two different beans cannot be sent");
  await assert.rejects(f.workList(db, { from: "2026-12-14", to: "2026-12-01" }), { code: "INVALID_RANGE" });
  // The label (address) only for a delivery being prepared or shipped.
  const label = await f.shippingLabel(db, "sub_work001_first");
  assert.equal(label.shipTo.city, "鎌倉市");
  await assert.rejects(f.shippingLabel(db, "sub_work001_2026-12_1"), { code: "NOT_PREPARED" });
});

test("late payment: the delivery is listed by its ship-by date (within 3 working days) and goes out once", async () => {
  const db = fakeFirestore();
  seedStock(db);
  const e = await signUp(db, "sub_late001", { frequency: "1" });
  const late = { ...e.cycle("2026-12"), status_transitions: { paid_at: jstAt(2026, 12, 10) / 1000 } };
  await records.handleEvent(db, ev("invoice.paid", late), CONFIG);
  await records.handleEvent(db, ev("invoice.paid", late), CONFIG);
  const list = await f.workList(db, { from: "2026-12-10", to: "2026-12-20" }, { now: jstAt(2026, 12, 10) });
  const d = list.deliveries.find((x) => x.shipmentId === "sub_late001_2026-12_1");
  assert.equal(d.paidLate, true);
  assert.ok(d.date >= "2026-12-11" && d.date <= "2026-12-15", d.date);
  await f.prepareShipment(db, { shipmentId: d.shipmentId, skus: ["enma-jimma", "enma-karamo"], requestId: rid(), actor: ACTOR }, { now: jstAt(2026, 12, 11) });
  await f.shipShipment(db, { shipmentId: d.shipmentId, requestId: rid(), actor: ACTOR }, { now: jstAt(2026, 12, 11) });
  await records.handleEvent(db, ev("invoice.paid", late), CONFIG); // Stripe resends after shipping
  assert.equal(db.store.get(`${records.SHIPMENTS}/${d.shipmentId}`).status, "shipped");
  assert.deepEqual(stockOf(db, "enma-jimma"), { ready: 4, held: 0, sold: 1 });
});

// ---- HTTP: off by default, staff sign-in by a mailed link, the server checks the session for every request ----------
async function serve(router) {
  const app = express();
  app.use(express.json());
  app.use(f.PATH, router);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}${f.PATH}`;
  return { base, close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }) };
}
const STAFF_ENV = { COFFEE_SUBSCRIPTION_FULFILLMENT_ENABLED: "true", SHOP_STAFF_EMAILS: "Shop@Example.test, second@example.test", SITE_URL: "https://shop.example" };

test("HTTP: off unless enabled with listed staff; the old shared token gives nothing", async () => {
  for (const env of [{}, { COFFEE_SUBSCRIPTION_FULFILLMENT_ENABLED: "true" }, { SHOP_STAFF_EMAILS: "shop@example.test" },
    { COFFEE_SUBSCRIPTION_FULFILLMENT_TOKEN: "t".repeat(40) }]) {
    const app = await serve(f.createRouter({ getDb: () => fakeFirestore(), env }));
    assert.equal((await fetch(`${app.base}/work`, { headers: { "x-fulfillment-admin-token": "t".repeat(40) } })).status, 404, JSON.stringify(env));
    assert.equal((await fetch(`${app.base}/auth/login`, { method: "POST" })).status, 404);
    await app.close();
  }
});

test("HTTP: staff sign in by a mailed link; every request (the address above all) needs a live server-side session", async () => {
  const db = fakeFirestore();
  seedStock(db, { "enma-kindiio": 0 });
  await signUp(db, "sub_http001");
  const notices = [];
  const mails = [];
  let now = jstAt(2026, 11, 11);
  const env = { ...STAFF_ENV };
  const app = await serve(f.createRouter({ getDb: () => db, env, clock: () => now, notify: async (n) => { notices.push(n); },
    sendMail: async (m) => { mails.push(m); }, log: { error: () => {} } }));
  const json = { "content-type": "application/json" };
  const post = (path, body, token) => fetch(`${app.base}${path}`, { method: "POST", headers: { ...json, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const get = (path, token) => fetch(`${app.base}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  try {
    // Not signed in: nothing, the label least of all.
    for (const path of ["/work", "/label/sub_http001_first"]) assert.equal((await get(path)).status, 401);
    assert.equal((await get("/work", "x".repeat(43))).status, 401);
    assert.equal((await post("/prepare", { shipmentId: "sub_http001_first", skus: ["enma-jimma", "enma-karamo"], requestId: "req-http-000000" })).status, 401);
    // An address that is not listed gets the same answer and no mail.
    assert.deepEqual(await (await post("/auth/login", { email: "someone@example.test" })).json(), { ok: true });
    assert.equal(mails.length, 0);
    assert.deepEqual(await (await post("/auth/login", { email: " shop@example.TEST " })).json(), { ok: true });
    assert.equal(mails.length, 1);
    assert.equal(mails[0].to, "shop@example.test");
    const loginToken = /#login=([A-Za-z0-9_-]+)/.exec(mails[0].text)[1];
    assert.ok(mails[0].text.includes("https://shop.example/admin/subscription-shipping#login="));
    assert.ok(![...db.store.keys()].some((k) => k.includes(loginToken)), "only the hash of the link is stored");
    const session = await (await post("/auth/session", { token: loginToken })).json();
    assert.ok(session.sessionToken);
    assert.equal((await post("/auth/session", { token: loginToken })).status, 401, "the link works once");
    const token = session.sessionToken;
    assert.ok(!JSON.stringify([...db.store.entries()]).includes("shop@example.test"), "no staff address stored");

    const body = { shipmentId: "sub_http001_first", skus: ["enma-jimma", "enma-kindiio"], requestId: "req-http-000001", actor: "ceo:spoofed" };
    const r1 = await post("/prepare", body, token);
    assert.equal(r1.status, 200);
    const j1 = await r1.json();
    assert.deepEqual([j1.status, j1.notify], ["held", undefined]);
    await post("/prepare", body, token);
    assert.equal(notices.length, 1, "one notice; the resent request does not mail again");
    assert.deepEqual(notices[0], { type: "out_of_stock", shipmentId: "sub_http001_first", ref: "SUB-TTP001", shortSkus: ["enma-kindiio"] });
    const r2 = await post("/prepare", { ...body, skus: ["enma-jimma", "enma-karamo"], requestId: "req-http-000002" }, token);
    assert.equal((await r2.json()).status, "preparing");
    assert.match(db.store.get(`${records.SHIPMENTS}/sub_http001_first`).preparedBy, /^shop-staff:[0-9a-f]{12}$/, "the actor comes from the session, never the body");
    const bad = await post("/hold", { shipmentId: "sub_http001_first", requestId: "req-http-000003", reason: "anything" }, token);
    assert.deepEqual([bad.status, (await bad.json()).error], [400, "INVALID_REASON"]);
    const label = await get("/label/sub_http001_first", token);
    assert.equal((await label.json()).shipTo.prefecture, "神奈川県");
    assert.equal(label.headers.get("cache-control"), "no-store");
    const views = [...db.store.entries()].filter(([k]) => k.startsWith(f.LABEL_VIEWS + "/")).map(([, v]) => v);
    assert.equal(views.length, 1, "the view is recorded");
    assert.ok(!JSON.stringify(views).includes("鎌倉"), "without the address");
    const ship = await post("/ship", { shipmentId: "sub_http001_first", requestId: "req-http-000004", trackingNumber: "1111-2222-3333" }, token);
    assert.equal((await ship.json()).status, "shipped");

    // The session ends: after its time, when the address is removed from the list, or when signed out.
    now += 2 * 60 * 60 * 1000 + 1;
    assert.equal((await get("/work", token)).status, 401);
    now = jstAt(2026, 11, 11);
    env.SHOP_STAFF_EMAILS = "second@example.test";
    assert.equal((await get("/work", token)).status, 401, "removing the address ends its sessions");
    env.SHOP_STAFF_EMAILS = STAFF_ENV.SHOP_STAFF_EMAILS;
    assert.equal((await get("/work", token)).status, 200);
    await fetch(`${app.base}/auth/session`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
    assert.equal((await get("/work", token)).status, 401, "signed out on the server");
    // Mails per address are limited.
    for (let i = 0; i < 4; i++) await post("/auth/login", { email: "second@example.test" });
    assert.equal(mails.filter((m) => m.to === "second@example.test").length, 3);
  } finally {
    await app.close();
  }
});
