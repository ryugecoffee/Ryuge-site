"use strict";

// 2026-11-22: the shop ↔ Factory for orders and shipping, without Firestore (the emulator test covers the real steps):
//  - notices to Factory (server/factory-notify.js, server/store-events.js): off without settings; once per event;
//    signed; nothing personal; kept and retried when Factory does not answer
//  - the signed Factory API (server/factory-refund-api.js): reading and shipping are separate switches; shipping needs
//    the CEO's approval record; a refused request leaves nothing behind
//  - inventory.status (2026-11-23): the stock and its reconciliation with open checkouts and 定期便 deliveries, read only
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const express = require("express");
const notify = require("./factory-notify");
const events = require("./store-events");
const storeOps = require("./factory-store-ops");
const api = require("./factory-refund-api");

const NOTIFY_SECRET = "ryuge-notify-test-secret-0123456789abcdef";
const NOTIFY_ENV = { FACTORY_NOTIFY_URL: "https://factory.example.test/api/store/events", FACTORY_NOTIFY_HMAC_SECRET: NOTIFY_SECRET };

function fakeDb() {
  const store = new Map();
  const ref = (key) => ({
    key,
    get: async () => ({ id: key.split("/").pop(), ref: ref(key), exists: store.has(key), data: () => structuredClone(store.get(key)) }),
    create: async (v) => { if (store.has(key)) { const e = new Error("6 ALREADY_EXISTS: Document already exists"); e.code = 6; throw e; } store.set(key, structuredClone(v)); },
    update: async (p) => { store.set(key, { ...store.get(key), ...structuredClone(p) }); },
  });
  const query = (name, filters = [], max = 1000) => ({
    where: (f, op, v) => query(name, [...filters, [f, v]], max),
    limit: (n) => query(name, filters, n),
    get: async () => ({ docs: await Promise.all([...store.keys()].filter((k) => k.startsWith(name + "/"))
      .filter((k) => filters.every(([f, v]) => store.get(k)[f] === v)).slice(0, max).map((k) => ref(k).get())) }),
  });
  return { store, collection: (name) => ({ ...query(name), doc: (id) => ref(`${name}/${id}`) }) };
}
function factory(answer = 200) {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, ...init }); if (answer instanceof Error) throw answer; return { status: typeof answer === "function" ? answer(calls.length) : answer }; };
  return { calls, fetchImpl };
}
const quiet = { error() {}, warn() {} };

test("notices are off without both settings: nothing is kept, nothing is sent", async () => {
  for (const env of [{}, { FACTORY_NOTIFY_URL: NOTIFY_ENV.FACTORY_NOTIFY_URL }, { ...NOTIFY_ENV, FACTORY_NOTIFY_HMAC_SECRET: "short" },
    { ...NOTIFY_ENV, FACTORY_NOTIFY_URL: "http://factory.example.test/api/store/events" }, { ...NOTIFY_ENV, FACTORY_NOTIFY_URL: "not a url" }]) {
    const db = fakeDb();
    const f = factory();
    assert.equal(await notify.notify(db, { id: "order.paid:pi_abc12345", type: "order.paid", data: {} }, { env, fetchImpl: f.fetchImpl, log: quiet }), false);
    assert.equal(db.store.size, 0);
    assert.equal(f.calls.length, 0);
    assert.deepEqual(await notify.deliverDue(db, { env, fetchImpl: f.fetchImpl }), { sent: 0, tried: 0 });
  }
  assert.equal(notify.config(NOTIFY_ENV).enabled, true);
});

test("one event, one notice: signed, with no name, email, phone or address; a repeat is not sent again", async () => {
  const db = fakeDb();
  const f = factory(200);
  const data = { kind: "order", orderId: "pi_abc12345", ref: "ABC12345", amount: 3650, items: [{ name: "Jimma", quantity: 2, email: "x@example.com" }],
    prefecture: "神奈川県", name: "Hanako", email: "hanako@example.com", phone: "09000000000", address: { line1: "1-2-3" }, customer: { name: "Hanako" }, livemode: true };
  const notice = { id: "order.paid:pi_abc12345", type: "order.paid", data };
  assert.equal(await notify.notify(db, notice, { env: NOTIFY_ENV, fetchImpl: f.fetchImpl, log: quiet }), true);
  assert.equal(await notify.notify(db, notice, { env: NOTIFY_ENV, fetchImpl: f.fetchImpl, log: quiet }), false, "the same event again");
  assert.equal(f.calls.length, 1);
  const call = f.calls[0];
  assert.equal(call.url, NOTIFY_ENV.FACTORY_NOTIFY_URL);
  const body = JSON.parse(call.body);
  assert.deepEqual(Object.keys(body).sort(), ["data", "eventId", "occurredAt", "severity", "siteId", "type"]);
  assert.deepEqual([body.eventId, body.siteId, body.type, body.severity], ["order.paid:pi_abc12345", "ryuge-coffee", "order.paid", "info"]);
  assert.deepEqual(body.data, { kind: "order", ref: "ABC12345", orderId: "pi_abc12345", amount: 3650, items: [{ name: "Jimma", quantity: 2 }], prefecture: "神奈川県", livemode: true });
  assert.doesNotMatch(call.body, /Hanako|hanako@|09000000000|1-2-3|x@example/);
  const ts = call.headers["X-Ryuge-Timestamp"];
  assert.match(ts, /^\d{13}$/);
  const expected = crypto.createHmac("sha256", NOTIFY_SECRET).update(`POST\n/api/store/events\n${ts}\n${call.body}`).digest("hex");
  assert.equal(call.headers["X-Ryuge-Signature"], expected);
  const kept = db.store.get("factoryNotices/order.paid:pi_abc12345");
  assert.deepEqual([kept.status, kept.attempts, kept.lastStatus], ["sent", 1, 200]);
  assert.doesNotMatch(JSON.stringify(kept), /Hanako|hanako@|09000000000|1-2-3/);
});

test("Factory unreachable: the notice is kept and sent later; 409 (already kept there) counts as sent; gives up after the limit", async () => {
  const db = fakeDb();
  const down = factory(new Error("ECONNREFUSED"));
  const notice = { id: "deadline.overdue:pi_late12345", type: "deadline.overdue", data: { kind: "order", ref: "LATE1234", shipBy: "2026-11-20" } };
  assert.equal(await notify.notify(db, notice, { env: NOTIFY_ENV, fetchImpl: down.fetchImpl, log: quiet }), true);
  const key = "factoryNotices/deadline.overdue:pi_late12345";
  let kept = db.store.get(key);
  assert.deepEqual([kept.status, kept.attempts, kept.severity], ["pending", 1, "action"]);
  const later = kept.nextAt.getTime();
  // Not due yet: nothing is tried.
  assert.deepEqual(await notify.deliverDue(db, { env: NOTIFY_ENV, fetchImpl: down.fetchImpl, now: later - 1000 }), { sent: 0, tried: 0 });
  const conflict = factory(409);
  assert.deepEqual(await notify.deliverDue(db, { env: NOTIFY_ENV, fetchImpl: conflict.fetchImpl, now: later }), { sent: 1, tried: 1 });
  assert.equal(db.store.get(key).status, "sent");
  assert.deepEqual(await notify.deliverDue(db, { env: NOTIFY_ENV, fetchImpl: conflict.fetchImpl, now: later + 1e9 }), { sent: 0, tried: 0 }, "never sent twice");

  const db2 = fakeDb();
  const failing = factory(500);
  await notify.notify(db2, { ...notice, id: "deadline.overdue:pi_never12345" }, { env: NOTIFY_ENV, fetchImpl: failing.fetchImpl, log: quiet });
  for (let i = 0; i < 20; i += 1) await notify.deliverDue(db2, { env: NOTIFY_ENV, fetchImpl: failing.fetchImpl, now: Date.now() + 1e10 * (i + 1) });
  kept = db2.store.get("factoryNotices/deadline.overdue:pi_never12345");
  assert.deepEqual([kept.status, kept.attempts], ["failed", notify.MAX_ATTEMPTS]);
  assert.equal(failing.calls.length, notify.MAX_ATTEMPTS);
});

test("a notice never breaks what raised it: a bad notice or a broken store is logged, not thrown", async () => {
  const logged = [];
  const log = { error: (...a) => logged.push(a.join(" ")) };
  assert.equal(await notify.notify(fakeDb(), { id: "order.paid:pi_x1234567", type: "unknown.type", data: {} }, { env: NOTIFY_ENV, log }), false);
  const broken = { collection: () => ({ doc: () => ({ create: async () => { throw new Error("UNAVAILABLE"); } }) }) };
  assert.equal(await notify.notify(broken, { id: "order.paid:pi_x1234567", type: "order.paid", data: {} }, { env: NOTIFY_ENV, log }), false);
  assert.equal(logged.length, 2);
  await assert.rejects(notify.record(fakeDb(), { id: "stock.low:x", type: "order.paid", data: {} }, NOTIFY_ENV), /INVALID_NOTICE/, "the id names its type");
});

test("珈琲の定期便 payments: paid once per invoice, each failed attempt once; other subscriptions and test ids ignored", async () => {
  const db = fakeDb();
  const f = factory(200);
  const deps = { env: NOTIFY_ENV, fetchImpl: f.fetchImpl, log: quiet };
  const meta = { kind: "coffee-subscription-v2", frequency: "2" };
  const invoice = (extra) => ({ id: "in_Test0001", livemode: true, currency: "jpy", parent: { subscription_details: { subscription: "sub_Abc123XYZ789", metadata: meta } },
    customer_email: "hanako@example.com", customer_name: "Hanako", ...extra });
  const paid = { type: "invoice.paid", data: { object: invoice({ amount_paid: 3000, billing_reason: "subscription_create" }) } };
  await events.subscriptionInvoice(db, paid, deps);
  await events.subscriptionInvoice(db, paid, deps);
  const failed = (n) => ({ type: "invoice.payment_failed", data: { object: invoice({ id: "in_Test0002", amount_due: 5400, attempt_count: n }) } });
  await events.subscriptionInvoice(db, failed(1), deps);
  await events.subscriptionInvoice(db, failed(1), deps);
  await events.subscriptionInvoice(db, failed(2), deps);
  await events.subscriptionInvoice(db, { type: "invoice.paid", data: { object: invoice({ id: "in_Other", amount_paid: 100, parent: { subscription_details: { subscription: "sub_x", metadata: {} } } }) } }, deps);
  assert.deepEqual([...db.store.keys()].sort(), ["factoryNotices/payment.failed:in_Test0002:1", "factoryNotices/payment.failed:in_Test0002:2", "factoryNotices/subscription.paid:in_Test0001"]);
  const first = db.store.get("factoryNotices/subscription.paid:in_Test0001").data;
  assert.deepEqual(first, { kind: "subscription", ref: "SUB-XYZ789", amount: 3000, currency: "jpy", label: "初回200g", frequency: "2", livemode: true });
  assert.equal(f.calls.length, 3);
  assert.doesNotMatch(f.calls.map((c) => c.body).join(), /hanako|Hanako/);
  await events.webhookFailed(db, { id: "evt_Abc123", type: "payment_intent.succeeded" }, deps);
  await events.webhookFailed(db, { id: "evt_Abc123", type: "payment_intent.succeeded" }, deps);
  await events.mailFailed(db, { kind: "order", id: "pi_Mail12345", ref: "MAIL1234" }, deps);
  assert.equal(db.store.get("factoryNotices/webhook.failed:evt_Abc123").data.eventType, "payment_intent.succeeded");
  assert.deepEqual(db.store.get("factoryNotices/mail.failed:order:pi_Mail12345").data, { kind: "order", ref: "MAIL1234", orderId: "pi_Mail12345" });
  assert.equal(f.calls.length, 5);
});

// ---- The signed Factory API: store operations ---------------------------------------------------------------
const SECRET = "factory-refund-test-secret-0123456789abcdef";
const CEO = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const BASE_ENV = { FACTORY_REFUND_API_ENABLED: "true", FACTORY_REFUND_HMAC_SECRET: SECRET, FACTORY_CEO_USER_ID: CEO };
const NOW = Date.UTC(2026, 10, 22, 3);
const TARGET = { kind: "order", id: "pi_FactoryOrder0001" };
const approval = (extra = {}) => ({ requestId: crypto.randomUUID(), approvedBy: CEO, approvedAt: NOW - 60e3, ...extra });

async function apiServer(t, env, db = fakeDb()) {
  const sent = [];
  const app = express();
  app.post(api.PATH, express.raw({ type: "application/json", limit: "8kb" }),
    api.createHandler({ getDb: () => db, getStripe: () => null, env, clock: () => NOW, log: quiet, sendMail: async (m) => { sent.push(m); } }));
  const srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  t.after(() => srv.close());
  const call = async (body) => {
    const text = JSON.stringify({ nonce: crypto.randomUUID(), ...body });
    const r = await fetch(`http://127.0.0.1:${srv.address().port}${api.PATH}`, { method: "POST",
      headers: { "content-type": "application/json", "x-factory-timestamp": String(NOW), "x-factory-signature": api.signatureFor(SECRET, String(NOW), Buffer.from(text)) }, body: text });
    return [r.status, await r.json().catch(() => null)];
  };
  return { db, sent, call };
}
const READS = [{ op: "store.overview", range: { from: "2026-11-01", to: "2026-11-22" } }, { op: "fulfillment.list", view: "open", kind: "all" },
  { op: "inventory.status" }, { op: "inventory.status", lowThreshold: 5 }];
const ACTS = () => [
  { op: "fulfillment.prepare", target: TARGET, skus: [], approval: approval() },
  { op: "fulfillment.ship", target: TARGET, method: "yupack", trackingNumber: "1234-5678-9012", approval: approval() },
];

test("store operations are off by default, each refused before anything is kept (no nonce, no order touched, no mail)", async (t) => {
  for (const env of [BASE_ENV, { ...BASE_ENV, FACTORY_REFUND_OPS_ENABLED: "true" }, { ...BASE_ENV, FACTORY_STORE_READ_ENABLED: "TRUE" }]) {
    const { db, sent, call } = await apiServer(t, env);
    for (const body of READS) assert.deepEqual(await call(body), [403, { error: "STORE_READ_DISABLED" }], body.op);
    for (const body of ACTS()) assert.deepEqual(await call(body), [403, { error: "STORE_SHIP_DISABLED" }], body.op);
    assert.equal(db.store.size, 0);
    assert.equal(sent.length, 0);
  }
});

test("reading does not bring shipping with it; shipping needs the CEO's fresh approval, checked before anything is kept", async (t) => {
  const readOnly = await apiServer(t, { ...BASE_ENV, FACTORY_STORE_READ_ENABLED: "true" });
  for (const body of ACTS()) assert.deepEqual(await readOnly.call(body), [403, { error: "STORE_SHIP_DISABLED" }], body.op);
  assert.equal(readOnly.db.store.size, 0);

  const shipOn = await apiServer(t, { ...BASE_ENV, FACTORY_STORE_SHIP_ENABLED: "true" });
  const ship = (a) => shipOn.call({ op: "fulfillment.ship", target: TARGET, method: "yupack", trackingNumber: "1", ...(a === undefined ? {} : { approval: a }) });
  for (const body of READS) assert.deepEqual(await shipOn.call(body), [403, { error: "STORE_READ_DISABLED" }], "shipping does not bring reading either");
  assert.equal((await shipOn.call({ op: "fulfillment.ship", target: TARGET, method: "yupack", trackingNumber: "1" }))[1].error, "CEO_APPROVAL_REQUIRED", "no approval");
  assert.equal((await ship(null))[1].error, "CEO_APPROVAL_REQUIRED");
  assert.equal((await ship(approval({ approvedBy: "11111111-2222-4333-8444-555555555555" })))[1].error, "CEO_APPROVAL_REQUIRED", "not the CEO");
  assert.equal((await ship(approval({ requestId: "not-a-uuid" })))[1].error, "CEO_APPROVAL_REQUIRED");
  assert.equal((await ship(approval({ approvedAt: NOW - 16 * 60e3 })))[1].error, "CEO_APPROVAL_EXPIRED");
  assert.equal((await ship(approval({ approvedAt: NOW + 60e3 })))[1].error, "CEO_APPROVAL_EXPIRED");
  assert.equal(shipOn.db.store.size, 0, "nothing kept for a refused request");
  assert.equal(shipOn.sent.length, 0);
  // Extra fields (an actor, a customer's address) are refused whatever the switches.
  assert.equal((await shipOn.call({ op: "fulfillment.ship", target: TARGET, method: "yupack", trackingNumber: "1", approval: approval(), actor: "x" }))[1].error, "INVALID_FIELDS");
});

test("targets, ranges and queries are checked: one order or one delivery, named exactly", () => {
  assert.deepEqual(storeOps.target({ kind: "order", id: "pi_3QabcDEF12345678" }), { kind: "order", id: "pi_3QabcDEF12345678" });
  assert.deepEqual(storeOps.target({ kind: "subscription", id: "sub_1Abc234567_2027-01_2" }), { kind: "subscription", id: "sub_1Abc234567_2027-01_2" });
  assert.deepEqual(storeOps.target({ kind: "subscription", id: "sub_1Abc234567_first" }), { kind: "subscription", id: "sub_1Abc234567_first" });
  for (const bad of [null, {}, { kind: "order", id: "ABC12345" }, { kind: "order", id: "pi_x" }, { kind: "subscription", id: "sub_1Abc234567" },
    { kind: "subscription", id: "pi_3QabcDEF12345678" }, { kind: "order", id: "pi_3QabcDEF12345678/../x" }, { kind: "refund", id: "pi_3QabcDEF12345678" }]) {
    assert.throws(() => storeOps.target(bad), { code: "INVALID_TARGET" }, JSON.stringify(bad));
  }
  assert.deepEqual(storeOps.range(undefined, NOW), { from: "2026-11-22", to: "2026-11-22" });
  assert.deepEqual(storeOps.range({ from: "2026-11-01" }, NOW), { from: "2026-11-01", to: "2026-11-01" });
  for (const bad of [{ from: "2026-11-22", to: "2026-11-01" }, { from: "2026/11/01" }, { from: "2026-01-01", to: "2026-11-22" }]) {
    assert.throws(() => storeOps.range(bad, NOW), { code: "INVALID_RANGE" });
  }
});

// ---- inventory.status: the stock and its reconciliation, read only ----------------------------------------------
const inventory = require("./inventory");
const { lotOf } = require("./catalog");
const stockStatus = require("./factory-inventory-status");

// Firestore as the op reads it: documents, equality / in / range filters (also on the document id), order and limit.
// No update, set or transaction exists here: anything but the nonce's create would throw.
function memoryDb(seed) {
  const store = new Map(Object.entries(seed).map(([k, v]) => [k, structuredClone(v)]));
  const writes = [];
  const snap = (key) => ({ id: key.split("/").pop(), exists: store.has(key), data: () => structuredClone(store.get(key)) });
  const ref = (key) => ({ key, path: key, get: async () => snap(key),
    create: async (v) => { if (store.has(key)) { const e = new Error("6 ALREADY_EXISTS"); e.code = 6; throw e; } writes.push(key); store.set(key, structuredClone(v)); } });
  const value = (key, field) => (field === "__name__" ? key.split("/").pop() : store.get(key)[field]);
  const ms = (v) => (v instanceof Date ? v.getTime() : v);
  const OPS = { "==": (a, b) => a === b, in: (a, b) => b.includes(a), ">=": (a, b) => a >= b, "<": (a, b) => a < b };
  const query = (name, { filters = [], order = null, max = Infinity } = {}) => ({
    where: (f, op, v) => query(name, { filters: [...filters, [f, op, v]], order, max }),
    orderBy: (f, dir = "asc") => query(name, { filters, order: [f, dir], max }),
    limit: (n) => query(name, { filters, order, max: n }),
    get: async () => {
      let keys = [...store.keys()].filter((k) => k.startsWith(`${name}/`) && filters.every(([f, op, v]) => OPS[op](value(k, f), v))).sort();
      if (order) keys = keys.filter((k) => value(k, order[0]) !== undefined).sort((x, y) => (ms(value(x, order[0])) - ms(value(y, order[0]))) * (order[1] === "desc" ? -1 : 1));
      return { docs: keys.slice(0, max).map(snap) };
    },
  });
  return { store, writes, collection: (name) => ({ ...query(name), doc: (id) => ref(`${name}/${id}`) }) };
}

const T = Date.UTC(2026, 10, 22, 3); // 12:00 JST, 2026-11-22
const ago = (ms) => new Date(T - ms);
const s = (ready, held, sold) => ({ ready, held, sold });
const contract = (extra) => ({ email: "buyer@example.com", name: "Test Buyer", livemode: true, startMonth: "2026-12", frequency: 1, skips: [], changes: {},
  shipping: { name: "Test Buyer", postalCode: "100-0001", prefecture: "東京都", city: "千代田区", line1: "1-2-3", phone: "0900000000" }, ...extra });
const shipTo = { name: "Test Buyer", postalCode: "247-0062", prefecture: "神奈川県", city: "鎌倉市", line1: "1-2-3", phone: "0900000000" };
const BRAZIL = "brazil-amarelo-bourbon";
// A ledger that agrees with its records:
//  - enma-jimma: 2 sold by a paid store order not shipped yet (holds nothing), 1 held by a 定期便 delivery being prepared;
//  - the Brazil lot: an open checkout holds 1 禅 + 1 アマレロ (2 lot bags), a delivery being prepared 1 アマレロ (1 lot bag);
//  - the featured グアテマラ: 2 held by an open checkout; the regular グアテマラ: 1 held by a delivery being prepared;
//  - a delivery cancelled before shipping and a released checkout hold nothing; a shipped delivery sold 1 カラモ + 1 キンディオ.
function consistentLedger() {
  return {
    "inventory/enma-jimma": s(12, 1, 2), "inventory/enma-zen-dark-roast": s(3, 1, 1), "inventory/enma-amarelo-bourbon": s(5, 2, 1),
    [`inventoryLots/${BRAZIL}`]: s(6, 3, 2), "inventory/enma-featured-quequesques": s(15, 2, 0), "inventory/enma-quequesques": s(5, 1, 0),
    "inventory/enma-karamo": s(5, 0, 1), "inventory/enma-kindiio": s(5, 0, 1), "inventory/enma-andes-blue": s(5, 1, 0), "inventory/enma-coffee-bag": s(3, 0, 0),
    "inventory/mokkan-oku-yame-hojicha": s(5, 0, 0), "inventory/mokkan-oku-yame-genmaicha": s(1, 0, 4),
    "inventory/enma-featured-andes-blue": s(2, 0, 5), // an earlier featured coffee: its record stays, not sold any more
    "inventoryReservations/11111111-1111-4111-8111-111111111111": { status: "paid", items: [{ id: "enma-jimma", quantity: 2 }], paymentIntentId: "pi_PaidNotShipped01", createdAt: ago(7200e3) },
    "inventoryReservations/22222222-2222-4222-8222-222222222222": { status: "reserved", items: [{ id: "enma-zen-dark-roast", quantity: 1 }, { id: "enma-amarelo-bourbon", quantity: 1 }],
      lots: [{ id: BRAZIL, quantity: 2 }], paymentIntentId: "pi_OpenCheckout001", createdAt: ago(60e3) },
    "inventoryReservations/33333333-3333-4333-8333-333333333333": { status: "reserved", items: [{ id: "enma-featured-quequesques", quantity: 2 }], paymentIntentId: "pi_OpenCheckout002", createdAt: ago(3600e3) },
    "inventoryReservations/44444444-4444-4444-8444-444444444444": { status: "released", items: [{ id: "enma-amarelo-bourbon", quantity: 1 }], lots: [{ id: BRAZIL, quantity: 1 }], createdAt: ago(9000e3) },
    "coffeeSubscriptionShipments/sub_AAAAAA0001_first": { subscriptionId: "sub_AAAAAA0001", kind: "first", month: "2026-11", status: "preparing", shipTo,
      beans: [{ sku: "enma-jimma", lot: null }, { sku: "enma-amarelo-bourbon", lot: BRAZIL }] },
    "coffeeSubscriptionShipments/sub_BBBBBB0002_first": { subscriptionId: "sub_BBBBBB0002", kind: "first", month: "2026-11", status: "shipped", shipTo,
      beans: [{ sku: "enma-karamo", lot: null }, { sku: "enma-kindiio", lot: null }] },
    "coffeeSubscriptionShipments/sub_CCCCCC0003_first": { subscriptionId: "sub_CCCCCC0003", kind: "first", month: "2026-11", status: "cancelled_before_shipping", beans: null },
    "coffeeSubscriptionShipments/sub_DDDDDD0004_first": { subscriptionId: "sub_DDDDDD0004", kind: "first", month: "2026-11", status: "preparing", shipTo,
      beans: [{ sku: "enma-quequesques", lot: null }, { sku: "enma-andes-blue", lot: null }] },
    "coffeeSubscriptionShipments/sub_EEEEEE0005_first": { subscriptionId: "sub_EEEEEE0005", kind: "first", month: "2026-11", status: "planned" },
    "coffeeSubscriptions/sub_AAAAAA0001": contract({ status: "trialing", frequency: 2 }),
    "coffeeSubscriptions/sub_BBBBBB0002": contract({ status: "active" }),
    "coffeeSubscriptions/sub_CCCCCC0003": contract({ status: "trialing", cancelRequestedAt: ago(86400e3), firstUnchargedMonth: "2026-12" }),
    "coffeeSubscriptions/sub_DDDDDD0004": contract({ status: "trialing", skips: ["2026-12"] }),
    "coffeeSubscriptions/sub_EEEEEE0005": contract({ status: "past_due", frequency: 3, changes: { "2026-12": 1 } }),
    "coffeeSubscriptions/sub_FFFFFF0006": contract({ status: "canceled" }),
    "orders/pi_PaidNotShipped01": { status: "paid", livemode: true, paidAt: ago(7200e3), items: [{ id: "enma-jimma", quantity: 2, unitPrice: 1500 }],
      customer: { name: "Test Buyer", email: "buyer@example.com", phone: "0900000000", address: { state: "神奈川県", city: "鎌倉市", line1: "1-2-3" } } },
    "orders/pi_ShippedAlready01": { status: "paid", livemode: true, paidAt: ago(86400e3), fulfillment: { status: "shipped" }, customer: { name: "Test Buyer" } },
    "orders/pi_EarlierByHand001": { status: "paid", livemode: true, paidAt: new Date(Date.UTC(2026, 10, 10)), customer: { name: "Test Buyer" } },
    "inventoryAdjustments/req-arrival-000001": { sku: "enma-jimma", action: "stock_in", quantity: 4, actor: "factory-ceo:6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b",
      requestId: "req-arrival-000001", before: s(8, 0, 0), after: s(12, 0, 0), createdAt: ago(3 * 86400e3) },
    "inventoryInitialStock/abc": { paths: ["inventory/enma-jimma", `inventoryLots/${BRAZIL}`], plan: { "inventory/enma-jimma": 8, [`inventoryLots/${BRAZIL}`]: 8 },
      approval: "CEO承認 Test Buyer buyer@example.com", appliedAt: ago(5 * 86400e3) },
    "inventoryTransfers/approved-2026-11-22-quequesques-initial": { kind: "approved", id: "2026-11-22-quequesques-initial", status: "applied", from: "enma-quequesques",
      to: "enma-featured-quequesques", maxQuantity: 15, quantity: 15, approval: "CEO承認", at: ago(2 * 86400e3) },
    "orderRefunds/55555555-5555-4555-8555-555555555555": { orderId: "pi_Refunded000001", status: "refunded", actor: "ceo:order-admin-token", approval: "Test Buyer",
      restocked: [{ id: "enma-karamo", quantity: 1 }], settledAt: ago(86400e3) },
  };
}
const PERSONAL_DATA = /Test Buyer|buyer@example\.com|0900000000|1-2-3|鎌倉市|千代田区|100-0001|247-0062/;
const READ_ENV = { ...BASE_ENV, FACTORY_STORE_READ_ENABLED: "true", INVENTORY_ENABLED: "true" };

test("inventory.status: only {} or { lowThreshold: 1..20 }; anything else refused like the other reads", async (t) => {
  const db = memoryDb(consistentLedger());
  const { call } = await apiServer(t, READ_ENV, db);
  for (const extra of [{ sku: "enma-jimma" }, { range: { from: "2026-11-01" } }, { actor: "x" }, { approval: approval() }]) {
    assert.deepEqual(await call({ op: "inventory.status", ...extra }), [400, { error: "INVALID_FIELDS" }], JSON.stringify(extra));
  }
  for (const lowThreshold of [0, 21, -1, 2.5, "3", null, true, [3], { n: 3 }]) {
    assert.deepEqual(await call({ op: "inventory.status", lowThreshold }), [400, { error: "INVALID_QUERY", detail: null }], JSON.stringify(lowThreshold));
  }
  for (const body of [{ op: "inventory.status" }, { op: "inventory.status", lowThreshold: 1 }, { op: "inventory.status", lowThreshold: 20 }]) {
    const [status, answer] = await call(body);
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(answer.ok, true);
  }
  // Read only: the one-time nonces are the only documents written (no update, set or transaction exists in this stand-in).
  assert.ok(db.writes.every((key) => key.startsWith("factoryRefundRequests/")), db.writes.join());
  assert.deepEqual([...db.store.keys()].filter((k) => !k.startsWith("factoryRefundRequests/")).sort(), Object.keys(consistentLedger()).sort());
});

test("inventory.status: the numbers, the 定期便 needs and open orders, without anything personal", async (t) => {
  const db = memoryDb(consistentLedger());
  const { call } = await apiServer(t, READ_ENV, db);
  const [status, answer] = await call({ op: "inventory.status" });
  assert.equal(status, 200);
  assert.doesNotMatch(JSON.stringify(answer), PERSONAL_DATA, "no name, email, phone or address");
  assert.deepEqual(Object.keys(answer).sort(), ["adjustments", "asOf", "checks", "items", "lots", "ok", "openOrders", "subscriptions"]);
  assert.equal(answer.asOf, new Date(NOW).toISOString());
  const item = (sku) => answer.items.find((i) => i.sku === sku);
  assert.deepEqual(item("enma-jimma"), { sku: "enma-jimma", name: "閻魔　エチオピア ジンマ", kind: "beans", forSale: true, featured: false, lot: null,
    ready: 12, held: 1, sold: 2, available: 11, state: "in_stock" });
  assert.deepEqual([item("enma-featured-quequesques").featured, item("enma-featured-quequesques").forSale, item("enma-featured-quequesques").available], [true, true, 13]);
  assert.deepEqual([item("enma-quequesques").featured, item("enma-quequesques").state, item("enma-quequesques").available], [false, "not_for_sale", 4],
    "the featured coffee's regular product is off sale meanwhile; its own stock is kept apart");
  assert.equal(item("enma-featured-quequesques").name, item("enma-quequesques").name, "the same product name");
  assert.deepEqual(item("enma-featured-andes-blue"), { sku: "enma-featured-andes-blue", name: "閻魔　ペルー アンデスブルー", kind: "beans", forSale: false, featured: true,
    lot: null, ready: 2, held: 0, sold: 5, available: 2, state: "not_for_sale" });
  assert.deepEqual([item("enma-coffee-bag").kind, item("enma-coffee-bag").state], ["bag", "low"], "3 bags left: low at the default level 3");
  assert.deepEqual([item("mokkan-oku-yame-genmaicha").kind, item("mokkan-oku-yame-genmaicha").state], ["tea", "low"]);
  assert.deepEqual([item("enma-amarelo-bourbon").lot, item("enma-amarelo-bourbon").available], [BRAZIL, 3], "the smaller of its own 3 and the lot's 3");
  assert.ok(!answer.items.some((i) => i.sku === "woodbox-tea-bag"), "products without counted stock are not items");
  // Available is what /inventory/availability gives a customer.
  const shop = await inventory.availability(db, answer.items.map((i) => i.sku), (id) => lotOf(id));
  for (const i of answer.items) assert.equal(i.available, shop[i.sku], i.sku);
  assert.deepEqual(answer.lots, [{ lot: BRAZIL, skus: ["enma-zen-dark-roast", "enma-amarelo-bourbon"], ready: 6, held: 3, sold: 2, available: 3 }]);
  assert.deepEqual(answer.adjustments, [
    { at: ago(86400e3).toISOString(), sku: "enma-karamo", action: "refund_restock", quantity: 1, by: "ceo" },
    { at: ago(2 * 86400e3).toISOString(), sku: "enma-quequesques", action: "transfer_out", quantity: 15, by: "system" },
    { at: ago(2 * 86400e3).toISOString(), sku: "enma-featured-quequesques", action: "transfer_in", quantity: 15, by: "system" },
    { at: ago(3 * 86400e3).toISOString(), sku: "enma-jimma", action: "stock_in", quantity: 4, by: "ceo" },
    { at: ago(5 * 86400e3).toISOString(), sku: "enma-jimma", action: "initial_stock", quantity: 8, by: "ceo" },
  ]);
  assert.deepEqual(answer.subscriptions.contracts, { active: 1, trialing: 2, pastDue: 1, cancelRequested: 1, ended: 1 }, "each contract once");
  assert.deepEqual(answer.subscriptions.thisMonth, { month: "2026-11", deliveriesLeft: 3, bagsNeeded: 6 }, "2 being prepared + 1 planned");
  const { note, ...next } = answer.subscriptions.nextMonth;
  // 2 (A) + 1 (B) + 1 (E, changed to once a month) = 4; D skipped; C cancelled from December; F ended.
  assert.deepEqual(next, { month: "2026-12", deliveries: 4, bagsNeeded: 8, skipped: 1 });
  assert.match(note, /見込み/);
  assert.deepEqual(answer.subscriptions.preparing, { shipments: 2, bagsHeld: 4 });
  assert.deepEqual(answer.openOrders, { count: 1, oldestPaidAt: ago(7200e3).toISOString() }, "shipped and earlier (shipped by hand) orders are not open");
  assert.deepEqual([answer.checks.ok, answer.checks.findings], [true, []]);
  assert.ok(answer.checks.notes.some((n) => /20分以上前/.test(n)) && answer.checks.notes.some((n) => /sold/.test(n)), "what is not checked, and why");
  assert.ok(answer.checks.notes.some((n) => /木函 ほうじ茶袋/.test(n)), "products sold without counted stock are named");
  // A different low level.
  const [, five] = await call({ op: "inventory.status", lowThreshold: 5 });
  assert.equal(five.items.find((i) => i.sku === "enma-karamo").state, "low");
});

test("inventory.status: the state of a product", () => {
  const { stateOf } = stockStatus;
  assert.equal(stateOf({ forSale: false, available: 10 }, 3), "not_for_sale");
  assert.equal(stateOf({ forSale: false, available: 0 }, 3), "not_for_sale");
  assert.equal(stateOf({ forSale: true, available: 0 }, 3), "out");
  assert.equal(stateOf({ forSale: true, available: 1 }, 3), "low");
  assert.equal(stateOf({ forSale: true, available: 3 }, 3), "low");
  assert.equal(stateOf({ forSale: true, available: 4 }, 3), "in_stock");
  assert.equal(stateOf({ forSale: true, available: 1 }, 1), "low");
  assert.equal(stateOf({ forSale: true, available: 2 }, 1), "in_stock");
});

test("inventory.status: a held count that the records do not explain is a finding with the ledger's and the expected number", async (t) => {
  const seed = consistentLedger();
  seed["inventory/enma-jimma"] = s(12, 3, 2);
  const db = memoryDb(seed);
  const { call } = await apiServer(t, READ_ENV, db);
  const [, answer] = await call({ op: "inventory.status" });
  assert.equal(answer.checks.ok, false);
  assert.equal(answer.checks.findings.length, 1);
  const [finding] = answer.checks.findings;
  assert.deepEqual({ ...finding, detail: undefined }, { sku: "enma-jimma", field: "held", ledger: 3, expected: 1, detail: undefined });
  assert.match(finding.detail, /カート確保 0袋 \+ 発送準備中の定期便 1袋 = 1袋/);
  assert.deepEqual(db.writes.length, 1, "only the nonce: nothing is repaired");
  assert.deepEqual(db.store.get("inventory/enma-jimma"), s(12, 3, 2));
  // held above ready breaks the other rule too.
  const { reconcile } = stockStatus;
  assert.deepEqual(reconcile({ stock: { "enma-kindiio": s(1, 2, 0) }, reservations: [{ status: "reserved", items: [{ id: "enma-kindiio", quantity: 2 }] }] })
    .map((f) => [f.sku, f.ledger, f.expected]), [["enma-kindiio", 2, 1]], "held 2 is right, but more than the 1 bag on the shelf");
  assert.deepEqual(reconcile({ stock: { "enma-karamo": null }, reservations: [{ status: "reserved", items: [{ id: "enma-karamo", quantity: 1 }] }] })
    .map((f) => [f.sku, f.ledger, f.expected]), [["enma-karamo", 0, 1]], "a hold on a product without a record");
});

test("inventory.status: a 定期便 delivery cancelled before shipping holds nothing; a paid store order not shipped holds nothing", () => {
  const { reconcile } = stockStatus;
  const beans = [{ sku: "enma-karamo", lot: null }, { sku: "enma-amarelo-bourbon", lot: BRAZIL }];
  // The cancellation gave the bags back (held 0): agreed. Even with beans still listed on it, it is not counted.
  for (const delivery of [{ status: "cancelled_before_shipping", beans: null }, { status: "cancelled_before_shipping", beans }]) {
    assert.deepEqual(reconcile({ stock: { "enma-karamo": s(5, 0, 0), "enma-amarelo-bourbon": s(5, 0, 0) }, lots: { [BRAZIL]: s(6, 0, 0) }, shipments: [delivery] }), []);
  }
  // Bags still held for it (not given back): a finding on each record.
  const kept = reconcile({ stock: { "enma-karamo": s(5, 1, 0), "enma-amarelo-bourbon": s(5, 1, 0) }, lots: { [BRAZIL]: s(6, 1, 0) },
    shipments: [{ status: "cancelled_before_shipping", beans: null }] });
  assert.deepEqual(kept.map((f) => [f.sku || f.lot, f.ledger, f.expected]), [["enma-karamo", 1, 0], ["enma-amarelo-bourbon", 1, 0], [BRAZIL, 1, 0]]);
  // A paid order: its reservation is settled (paid), its bags are sold; shipped or not, it holds nothing.
  for (const fulfillment of [{ status: "new" }, { status: "preparing" }, { status: "shipped" }]) {
    assert.deepEqual(reconcile({ stock: { "enma-jimma": s(8, 0, 2) }, reservations: [{ status: "paid", items: [{ id: "enma-jimma", quantity: 2 }], fulfillment }] }), [], fulfillment.status);
  }
  // Delivered (shipped) deliveries and those held or planned hold nothing either; preparing ones hold one bag per bean.
  assert.deepEqual(reconcile({ stock: { "enma-karamo": s(5, 1, 1) }, shipments: [
    { status: "shipped", beans: [{ sku: "enma-karamo" }] }, { status: "held", beans: null }, { status: "planned" }, { status: "preparing", beans: [{ sku: "enma-karamo", lot: null }] },
  ] }), []);
});

test("inventory.status: a shared lot is counted once (the lot record holds the same bags as its products)", async (t) => {
  const { expectedHeld, reconcile } = stockStatus;
  const reservations = [{ status: "reserved", items: [{ id: "enma-zen-dark-roast", quantity: 1 }, { id: "enma-amarelo-bourbon", quantity: 1 }], lots: [{ id: BRAZIL, quantity: 2 }] }];
  const shipments = [{ status: "preparing", beans: [{ sku: "enma-jimma", lot: null }, { sku: "enma-amarelo-bourbon", lot: BRAZIL }] }];
  const wanted = expectedHeld({ reservations, shipments });
  assert.deepEqual(wanted.lots.get(BRAZIL), { checkout: 2, subscription: 1 }, "3 lot bags, not 3 + its products' 3");
  assert.deepEqual([wanted.skus.get("enma-zen-dark-roast"), wanted.skus.get("enma-amarelo-bourbon")], [{ checkout: 1, subscription: 0 }, { checkout: 1, subscription: 1 }]);
  const stock = { "enma-zen-dark-roast": s(3, 1, 1), "enma-amarelo-bourbon": s(5, 2, 1), "enma-jimma": s(9, 1, 0) };
  assert.deepEqual(reconcile({ stock, lots: { [BRAZIL]: s(6, 3, 2) }, reservations, shipments }), []);
  const doubled = reconcile({ stock, lots: { [BRAZIL]: s(8, 6, 2) }, reservations, shipments });
  assert.deepEqual(doubled.map((f) => [f.lot, f.field, f.ledger, f.expected]), [[BRAZIL, "held", 6, 3]]);
  assert.match(doubled[0].detail, /1回ずつ/);
  // Through the API: the lot row carries its own record, and its products' rows their own.
  const seed = consistentLedger();
  seed[`inventoryLots/${BRAZIL}`] = s(8, 6, 2);
  const { call } = await apiServer(t, READ_ENV, memoryDb(seed));
  const [, answer] = await call({ op: "inventory.status" });
  assert.deepEqual(answer.checks.findings.map((f) => [f.lot, f.ledger, f.expected]), [[BRAZIL, 6, 3]]);
  assert.deepEqual(answer.lots[0], { lot: BRAZIL, skus: ["enma-zen-dark-roast", "enma-amarelo-bourbon"], ready: 8, held: 6, sold: 2, available: 2 });
});

test("inventory.status: the featured product and its regular product are kept apart", async (t) => {
  const { reconcile } = stockStatus;
  const reservations = [{ status: "reserved", items: [{ id: "enma-featured-quequesques", quantity: 2 }] }];
  const shipments = [{ status: "preparing", beans: [{ sku: "enma-quequesques", lot: null }, { sku: "enma-andes-blue", lot: null }] }];
  const right = { "enma-featured-quequesques": s(15, 2, 0), "enma-quequesques": s(5, 1, 0), "enma-andes-blue": s(5, 1, 0) };
  assert.deepEqual(reconcile({ stock: right, reservations, shipments }), []);
  // The featured hold counted on the regular record instead: both records are wrong, each is told.
  const swapped = { ...right, "enma-featured-quequesques": s(15, 0, 0), "enma-quequesques": s(5, 3, 0) };
  assert.deepEqual(reconcile({ stock: swapped, reservations, shipments }).map((f) => [f.sku, f.ledger, f.expected]),
    [["enma-featured-quequesques", 0, 2], ["enma-quequesques", 3, 1]]);
  // Through the API, the same.
  const seed = consistentLedger();
  seed["inventory/enma-featured-quequesques"] = s(15, 0, 0);
  seed["inventory/enma-quequesques"] = s(5, 3, 0);
  const { call } = await apiServer(t, READ_ENV, memoryDb(seed));
  const [, answer] = await call({ op: "inventory.status" });
  assert.deepEqual(answer.checks.findings.map((f) => [f.sku, f.ledger, f.expected]), [["enma-quequesques", 3, 1], ["enma-featured-quequesques", 0, 2]]);
});

test("inventory.status: contracts are counted once each, by their current state", () => {
  const { contractState } = stockStatus;
  assert.equal(contractState({ status: "canceled", cancelRequestedAt: new Date() }), "ended");
  assert.equal(contractState({ status: "incomplete_expired" }), "ended");
  assert.equal(contractState({ status: "active", cancelRequestedAt: new Date() }), "cancelRequested");
  assert.equal(contractState({ status: "past_due", cancelRequestedAt: new Date() }), "cancelRequested");
  assert.equal(contractState({ status: "past_due" }), "pastDue");
  assert.equal(contractState({ status: "unpaid" }), "pastDue");
  assert.equal(contractState({ status: "active" }), "active");
  assert.equal(contractState({ status: "trialing" }), "trialing");
  assert.equal(contractState({ status: "incomplete_record" }), "trialing", "recorded from the sign-up invoice before Stripe's status");
  assert.equal(contractState({ status: "paused" }), null, "not one of the five: told in a note, not counted");
});
