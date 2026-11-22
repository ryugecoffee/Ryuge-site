"use strict";

// 2026-11-22: the shop ↔ Factory for orders and shipping, without Firestore (the emulator test covers the real steps):
//  - notices to Factory (server/factory-notify.js, server/store-events.js): off without settings; once per event;
//    signed; nothing personal; kept and retried when Factory does not answer
//  - the signed Factory API (server/factory-refund-api.js): reading and shipping are separate switches; shipping needs
//    the CEO's approval record; a refused request leaves nothing behind
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

async function apiServer(t, env) {
  const db = fakeDb();
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
const READS = [{ op: "store.overview", range: { from: "2026-11-01", to: "2026-11-22" } }, { op: "fulfillment.list", view: "open", kind: "all" }];
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
