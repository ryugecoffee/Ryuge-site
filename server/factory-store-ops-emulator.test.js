"use strict";

// 2026-11-22: Factory (Jennifer / ChatGPT through Factory) reads and ships through the signed Factory API, on real
// Firestore transactions (local emulator only), and the shop's notices reach a local signed receiver.
//  - reading: sales, open parcels, deadlines, without anything personal
//  - 発送準備 / 発送済み: only with the CEO's approval; once per approval; the shop page's own steps and its one mail
//  - notices: new payment, low stock, deadlines, mail failures, stock shortages; once each
// Mail goes to a stub (never sent). Skipped unless FIRESTORE_EMULATOR_HOST is set. Never production data.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const express = require("express");
const api = require("./factory-refund-api");
const orders = require("./orders");
const records = require("./coffee-subscription-records");
const plan = require("./coffee-subscription-plan");
const { CALENDAR } = require("./coffee-subscription-calendar");
const notice = require("./shipping-notice");
const notify = require("./factory-notify");
const events = require("./store-events");

const emulator = process.env.FIRESTORE_EMULATOR_HOST;
const skip = emulator ? false : "FIRESTORE_EMULATOR_HOST not set";
const SECRET = "factory-refund-test-secret-0123456789abcdef";
const NOTIFY_SECRET = "ryuge-notify-test-secret-0123456789abcdef";
const CEO = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const NOW = Date.UTC(2026, 10, 22, 3); // 12:00 JST, 2026-11-22
const ENV = { FACTORY_REFUND_API_ENABLED: "true", FACTORY_REFUND_HMAC_SECRET: SECRET, FACTORY_CEO_USER_ID: CEO,
  FACTORY_STORE_READ_ENABLED: "true", FACTORY_STORE_SHIP_ENABLED: "true" };
const PERSONAL = /Test Buyer|buyer-[a-f0-9]+@example\.com|0900000000|1-2-3|鎌倉市|千代田区|@example\.com/;
let db;
let receiver;

test.before(async () => {
  if (skip) return;
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(emulator)) throw new Error("EMULATOR_HOST_MUST_BE_LOCAL");
  const admin = require("firebase-admin");
  db = admin.firestore(admin.initializeApp({ projectId: "demo-ryuge-inventory" }, "store-ops-" + crypto.randomUUID()));
  // Factory's side, as a local receiver that checks the signature like Factory does.
  const got = [];
  const srv = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      const ts = req.headers["x-ryuge-timestamp"];
      const ok = req.headers["x-ryuge-signature"] === notify.signatureFor(NOTIFY_SECRET, req.url, ts, body);
      got.push({ ok, body: JSON.parse(body), raw: body });
      res.statusCode = ok ? 200 : 401;
      res.end("{}");
    });
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  receiver = { srv, got, env: { FACTORY_NOTIFY_URL: `http://127.0.0.1:${srv.address().port}/api/store/events`, FACTORY_NOTIFY_HMAC_SECRET: NOTIFY_SECRET } };
});
test.after(() => receiver?.srv.close());

const deps = () => ({ env: receiver.env, log: { error() {} } });
const noticesFor = (needle) => receiver.got.filter((n) => n.raw.includes(needle));

async function paidOrder({ livemode = true, paidAt = NOW - 3600e3, items = "enma-jimma:2@1500" } = {}) {
  const id = "pi_sto" + crypto.randomBytes(8).toString("hex");
  const email = `buyer-${id.slice(-6)}@example.com`;
  const intent = { id, object: "payment_intent", status: "succeeded", amount: 3250, currency: "jpy", livemode, created: Math.floor(paidAt / 1000),
    metadata: { items, subtotal: "3000", shipping: "250", countryCode: "JP" }, latest_charge: { id: "ch_" + id.slice(3), created: Math.floor(paidAt / 1000),
      billing_details: { name: "Test Buyer", email, phone: "0900000000", address: { country: "JP", postal_code: "2470062", state: "神奈川県", city: "鎌倉市", line1: "1-2-3", line2: "" } } } };
  assert.deepEqual(await orders.recordPaidOrder(db, null, intent), { recorded: true });
  return { id, email };
}

async function apiServer(t, { sendMail, env = ENV } = {}) {
  const mails = [];
  const shortages = [];
  const app = express();
  app.post(api.PATH, express.raw({ type: "application/json", limit: "8kb" }), api.createHandler({ getDb: () => db, getStripe: () => null, env, clock: () => NOW,
    log: { warn() {}, error() {} }, sendMail: sendMail || (async (m) => { mails.push(m); }),
    onMailFailed: (failure) => events.mailFailed(db, failure, deps()),
    onStockShort: async (n) => { shortages.push(n); await events.stockShort(db, n, deps()); } }));
  const srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  t.after(() => srv.close());
  const call = async (body) => {
    const text = JSON.stringify({ nonce: crypto.randomUUID(), ...body });
    const r = await fetch(`http://127.0.0.1:${srv.address().port}${api.PATH}`, { method: "POST",
      headers: { "content-type": "application/json", "x-factory-timestamp": String(NOW), "x-factory-signature": api.signatureFor(SECRET, String(NOW), Buffer.from(text)) }, body: text });
    return [r.status, await r.json().catch(() => null), text];
  };
  return { call, mails, shortages };
}
const approval = () => ({ requestId: crypto.randomUUID(), approvedBy: CEO, approvedAt: NOW - 60e3 });

test("reading: sales and open parcels, with the order number, products and prefecture, never a name, email, phone or street", { skip }, async (t) => {
  const { call } = await apiServer(t);
  const a = await paidOrder();
  const [s1, list] = await call({ op: "fulfillment.list", view: "open", kind: "order" });
  assert.equal(s1, 200);
  const row = list.parcels.find((p) => p.id === a.id);
  assert.ok(row, "the new order is listed");
  assert.deepEqual([row.kind, row.status, row.prefecture, row.amount, row.livemode], ["order", "new", "神奈川県", 3250, true]);
  assert.equal(row.date, "2026-11-26", "期限: 3 working days after payment (11/23 is a holiday)");
  assert.ok(row.items[0].name && row.items[0].quantity === 2);
  assert.doesNotMatch(JSON.stringify(list), PERSONAL);
  const [s2, ov] = await call({ op: "store.overview", range: { from: "2026-11-22", to: "2026-11-22" } });
  assert.equal(s2, 200);
  assert.ok(ov.orders.count >= 1 && ov.orders.amount >= 3250);
  assert.ok(ov.toShip.total >= 1);
  assert.doesNotMatch(JSON.stringify(ov), PERSONAL);
  assert.equal((await call({ op: "fulfillment.list", view: "everything", kind: "all" }))[1].error, "INVALID_QUERY");
  assert.equal((await call({ op: "store.overview", range: { from: "2026-01-01", to: "2026-11-22" } }))[1].error, "INVALID_RANGE");
});

test("a store order shipped from Factory: once per approval, one mail, the shop's own record; no stock moves", { skip }, async (t) => {
  const { call, mails } = await apiServer(t);
  const a = await paidOrder();
  await db.collection("inventory").doc("enma-jimma").set({ ready: 10, held: 0, sold: 2 });
  const before = (await db.collection("inventory").doc("enma-jimma").get()).data();
  const target = { kind: "order", id: a.id };
  const [ps, prepared] = await call({ op: "fulfillment.prepare", target, skus: [], approval: approval() });
  assert.equal(ps, 200);
  assert.deepEqual([prepared.kind, prepared.status], ["order", "preparing"]);
  const ok = approval();
  const ship = (ap) => call({ op: "fulfillment.ship", target, method: "yupack", trackingNumber: "1234-5678-9012", approval: ap });
  const results = await Promise.all([ship(ok), ship(ok), ship(ok)]);
  assert.ok(results.every(([s]) => s === 200));
  assert.equal(results.filter(([, b]) => b.applied !== false).length, 1, "one approval, one shipment");
  assert.equal(mails.length, 1, "the customer is mailed once");
  assert.equal(mails[0].to, a.email);
  assert.match(mails[0].text, /ゆうパック[\s\S]*1234-5678-9012/);
  for (const [, body] of results) assert.doesNotMatch(JSON.stringify(body), PERSONAL, "nothing personal goes back to Factory");
  const order = (await db.collection("orders").doc(a.id).get()).data();
  assert.deepEqual([order.status, order.fulfillment.status, order.fulfillment.method, order.fulfillment.trackingNumber, order.fulfillment.shippedBy],
    ["paid", "shipped", "yupack", "1234-5678-9012", "factory-ceo:" + CEO]);
  assert.deepEqual((await db.collection("inventory").doc("enma-jimma").get()).data(), before);
  // Another approval for a shipped order: told it is done, nothing sent again.
  const [, again] = await ship(approval());
  assert.equal(again.applied, false);
  assert.equal(mails.length, 1);
  // The same approval for a different action is refused.
  const [cs, conflict] = await call({ op: "fulfillment.ship", target, method: "letterpack_light", trackingNumber: null, approval: ok });
  assert.deepEqual([cs, conflict.error], [409, "REQUEST_ID_CONFLICT"]);
  // A test order never mails; an unknown or unpaid target is refused.
  const test1 = await paidOrder({ livemode: false });
  const [, tr] = await call({ op: "fulfillment.ship", target: { kind: "order", id: test1.id }, method: "yupack", trackingNumber: null, approval: approval() });
  assert.equal(tr.mailStatus, "skipped_test");
  assert.equal(mails.length, 1);
  const [us, unknown] = await call({ op: "fulfillment.ship", target: { kind: "order", id: "pi_stoUnknown000000" }, method: "yupack", trackingNumber: null, approval: approval() });
  assert.deepEqual([us, unknown.error], [404, "UNKNOWN_ORDER"]);
  const [bs, badMethod] = await call({ op: "fulfillment.ship", target: { kind: "order", id: (await paidOrder()).id }, method: "drone", trackingNumber: null, approval: approval() });
  assert.equal(bs, 400);
  assert.ok(badMethod.error);
});

test("a mail that fails: the parcel stays shipped and Factory is told once (no address in the notice)", { skip }, async (t) => {
  const { call } = await apiServer(t, { sendMail: async () => { throw new Error("SMTP down"); } });
  const a = await paidOrder();
  const [s, r] = await call({ op: "fulfillment.ship", target: { kind: "order", id: a.id }, method: "yupack", trackingNumber: null, approval: approval() });
  assert.equal(s, 200);
  assert.deepEqual([r.status, r.mailStatus], ["shipped", "failed"]);
  assert.equal((await db.collection(notice.MAILS).doc(`order_${a.id}`).get()).data().status, "failed");
  const got = noticesFor(`mail.failed:order:${a.id}`);
  assert.equal(got.length, 1);
  assert.ok(got[0].ok, "signed");
  assert.equal(got[0].body.severity, "action");
  assert.doesNotMatch(got[0].raw, PERSONAL);
});

test("a 珈琲の定期便 delivery: prepared and shipped from Factory with the shop's stock steps; a shortage holds it and is told", { skip }, async (t) => {
  const { call, mails, shortages } = await apiServer(t);
  const [a, b] = ["enma-karamo", "enma-kindiio"];
  await db.collection("inventory").doc(a).set({ ready: 4, held: 0, sold: 0 });
  await db.collection("inventory").doc(b).set({ ready: 4, held: 0, sold: 0 });
  const CONFIG = { priceIds: { 1: "price_m1", 2: "price_m2", 3: "price_m3", 4: "price_m4" }, calendar: CALENDAR };
  const signUp = async (sub) => {
    const meta = { kind: records.KIND, frequency: "1", startMonth: "2026-12" };
    await records.handleEvent(db, { type: "checkout.session.completed", data: { object: { id: `cs_${sub}`, mode: "subscription", subscription: sub, customer: "cus_s", livemode: true,
      customer_details: { email: `${sub}@example.com`, name: "Test Buyer" }, metadata: meta,
      collected_information: { shipping_details: { name: "Test Buyer", address: { postal_code: "100-0001", state: "東京都", city: "千代田区", line1: "1-2-3", country: "JP" } } } } } }, CONFIG);
    await records.handleEvent(db, { type: "invoice.paid", data: { object: { id: `in_first_${sub}`, customer: "cus_s", livemode: true, billing_reason: "subscription_create", amount_paid: 3000,
      status_transitions: { paid_at: Math.floor(NOW / 1000) - 3600 }, parent: { subscription_details: { subscription: sub, metadata: meta } },
      lines: { data: [{ type: "subscription", pricing: { price_details: { price: "price_m1" } }, period: { start: plan.billingStartUnix("2026-12"), end: plan.billingStartUnix("2027-01") } }] } } } }, CONFIG);
    return `${sub}_first`;
  };
  const tag = crypto.randomBytes(4).toString("hex");
  const shipmentId = await signUp(`sub_stoops${tag}`);
  const [ls, list] = await call({ op: "fulfillment.list", view: "open", kind: "subscription" });
  assert.equal(ls, 200);
  const row = list.parcels.find((p) => p.id === shipmentId);
  assert.ok(row, "the delivery is listed");
  assert.deepEqual([row.kind, row.label, row.prefecture], ["subscription", "初回", "東京都"]);
  assert.doesNotMatch(JSON.stringify(list), PERSONAL);
  const target = { kind: "subscription", id: shipmentId };
  assert.equal((await call({ op: "fulfillment.prepare", target, skus: [a], approval: approval() }))[1].error, "INVALID_BEANS", "two beans");
  const [ps, prepared] = await call({ op: "fulfillment.prepare", target, skus: [a, b], approval: approval() });
  assert.equal(ps, 200);
  assert.equal(prepared.status, "preparing");
  assert.doesNotMatch(JSON.stringify(prepared), PERSONAL);
  const [ss, shipped] = await call({ op: "fulfillment.ship", target, method: "letterpack_plus", trackingNumber: "1111-2222-3333", approval: approval() });
  assert.equal(ss, 200);
  assert.deepEqual([shipped.status, shipped.mailStatus], ["shipped", "sent"]);
  assert.doesNotMatch(JSON.stringify(shipped), PERSONAL);
  assert.equal(mails.length, 1);
  assert.equal(mails[0].subject, "【龍華珈琲】珈琲を発送いたしました");
  assert.deepEqual((await db.collection("inventory").doc(a).get()).data(), { ready: 3, held: 0, sold: 1 }, "one bag each, at shipping");

  // Out of stock: held, the shop told (and Factory, once), nothing sold.
  await db.collection("inventory").doc(a).set({ ready: 0, held: 0, sold: 1 });
  const short = await signUp(`sub_stoshort${tag}`);
  const [hs, held] = await call({ op: "fulfillment.prepare", target: { kind: "subscription", id: short }, skus: [a, b], approval: approval() });
  assert.equal(hs, 200);
  assert.equal(held.status, "held");
  assert.equal(held.notify, undefined, "the internal flag stays inside");
  assert.equal(shortages.length, 1);
  assert.deepEqual(shortages[0].shortSkus, [a]);
  const got = noticesFor(`stock.short:${short}`);
  assert.equal(got.length, 1);
  assert.doesNotMatch(got[0].raw, PERSONAL);
});

test("notices: a new paid order once (Stripe resends too), low stock once per level, deadlines once each", { skip }, async () => {
  await db.collection("inventory").doc("enma-quequesques").set({ ready: 3, held: 0, sold: 12 });
  const a = await paidOrder({ items: "enma-quequesques:1@2000" });
  await events.orderPaid(db, a.id, deps());
  await events.orderPaid(db, a.id, deps());
  const paid = noticesFor(`order.paid:${a.id}`);
  assert.equal(paid.length, 1);
  assert.ok(paid[0].ok);
  assert.deepEqual([paid[0].body.type, paid[0].body.severity, paid[0].body.siteId, paid[0].body.data.prefecture, paid[0].body.data.shipBy],
    ["order.paid", "info", "ryuge-coffee", "神奈川県", "2026-11-26"]);
  assert.doesNotMatch(paid[0].raw, PERSONAL);
  assert.equal(noticesFor("stock.low:enma-quequesques:3").length, 1);

  // Paid 11/22 (Sun; 11/23 a holiday): 期限 11/26. Told "due soon" on 11/25, "late" on 11/27, once each however often swept.
  const soon = await paidOrder();
  await events.sweep(db, deps(), Date.UTC(2026, 10, 22, 3));
  assert.equal(noticesFor(`deadline.soon:${soon.id}`).length, 0, "not yet");
  await events.sweep(db, deps(), Date.UTC(2026, 10, 25, 3));
  await events.sweep(db, deps(), Date.UTC(2026, 10, 25, 4));
  assert.equal(noticesFor(`deadline.soon:${soon.id}`).length, 1);
  await events.sweep(db, deps(), Date.UTC(2026, 10, 27, 3));
  await events.sweep(db, deps(), Date.UTC(2026, 10, 27, 4));
  const overdue = noticesFor(`deadline.overdue:${soon.id}`);
  assert.equal(overdue.length, 1);
  assert.equal(overdue[0].body.severity, "action");
  assert.doesNotMatch(overdue[0].raw, PERSONAL);
  assert.equal(noticesFor(`deadline.overdue:${a.id}`).length, 1, "the first order (also unshipped), once");
  assert.ok(receiver.got.every((n) => n.ok), "every notice signed");
});
