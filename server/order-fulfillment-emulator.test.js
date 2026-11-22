"use strict";

// 2026-11-21: store orders and 珈琲の定期便 on one shipping page, on real Firestore transactions (local emulator only).
// Stock: a store order's bags were settled at payment, so shipping never moves stock; 珈琲の定期便 keeps its own steps.
// Mail: "shipped" mails the customer once, whatever is pressed twice or at the same moment; test orders never mail.
// Skipped unless FIRESTORE_EMULATOR_HOST is set (CI runs it under `firebase emulators:exec`). Never production data.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const of = require("./order-fulfillment");
const notice = require("./shipping-notice");
const orders = require("./orders");
const records = require("./coffee-subscription-records");
const plan = require("./coffee-subscription-plan");
const f = require("./coffee-subscription-fulfillment");
const { CALENDAR } = require("./coffee-subscription-calendar");

const emulator = process.env.FIRESTORE_EMULATOR_HOST;
const skip = emulator ? false : "FIRESTORE_EMULATOR_HOST not set";
const ACTOR = "shop-staff:emulatortest";
const NOW = Date.UTC(2026, 10, 21, 3);
let db;

test.before(async () => {
  if (skip) return;
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(emulator)) throw new Error("EMULATOR_HOST_MUST_BE_LOCAL");
  const admin = require("firebase-admin");
  db = admin.firestore(admin.initializeApp({ projectId: "demo-ryuge-inventory" }, "orders-" + crypto.randomUUID()));
});

const rid = () => crypto.randomUUID();
// A paid store order exactly as server/orders.js writes it from Stripe's payment_intent.succeeded.
async function paidOrder({ livemode = true, email = "buyer@example.com", country = "JP", items = "enma-jimma:2@1500,enma-coffee-bag:1@2400" } = {}) {
  const id = "pi_emu" + crypto.randomBytes(8).toString("hex");
  const intent = { id, object: "payment_intent", status: "succeeded", amount: 5650, currency: "jpy", livemode, created: Math.floor(NOW / 1000),
    metadata: { items, subtotal: "5400", shipping: "250", countryCode: country }, latest_charge: { id: "ch_" + id.slice(3), created: Math.floor(NOW / 1000),
      billing_details: { name: "Test Buyer", email, phone: "0900000000", address: { country, postal_code: "2470062", state: "神奈川県", city: "鎌倉市", line1: "1-2-3", line2: "" } } } };
  assert.deepEqual(await orders.recordPaidOrder(db, null, intent), { recorded: true });
  return id;
}
const stockOf = async (sku) => (await db.collection("inventory").doc(sku).get()).data();
const mailDoc = async (key) => (await db.collection(notice.MAILS).doc(key).get()).data();

// The route's own steps: ship, then send the claimed mail (as server/order-fulfillment.js addRoutes does).
async function shipLikeTheRoute(orderId, { requestId = rid(), method = "yupack", trackingNumber = "1234-5678-9012", sendMail }) {
  const r = await of.shipOrder(db, { orderId, requestId, actor: ACTOR, method, trackingNumber }, { now: NOW });
  if (!r.mail) return r;
  const fresh = (await db.collection(of.ORDERS).doc(orderId).get()).data();
  return { ...r, mailStatus: await of.sendShippedMail(db, { orderId, to: r.mail.to, order: fresh }, sendMail, { error() {} }) };
}

test("a paid store order: new → preparing → shipped; stock untouched (settled at payment); one mail although shipped many times at once", { skip }, async () => {
  const sku = "enma-jimma";
  await db.collection("inventory").doc(sku).set({ ready: 15, held: 0, sold: 3 });
  const id = await paidOrder();
  const before = await stockOf(sku);
  assert.equal(of.stateOf((await db.collection(of.ORDERS).doc(id).get()).data()), "new");
  assert.equal((await of.prepareOrder(db, { orderId: id, requestId: rid(), actor: ACTOR }, { now: NOW })).status, "preparing");
  const sent = [];
  const sendMail = async (m) => { sent.push(m); };
  const same = rid();
  const results = await Promise.all([
    ...Array.from({ length: 4 }, () => shipLikeTheRoute(id, { sendMail })),
    ...Array.from({ length: 3 }, () => shipLikeTheRoute(id, { requestId: same, sendMail })),
  ]);
  assert.equal(results.filter((r) => r.applied !== false).length, 1, "shipped once");
  assert.equal(sent.length, 1, "one mail");
  assert.equal(sent[0].to, "buyer@example.com");
  assert.equal(sent[0].subject, "【龍華珈琲】珈琲を発送いたしました");
  assert.match(sent[0].text, /ゆうパック[\s\S]*1234-5678-9012[\s\S]*trackings\.post\.japanpost\.jp/);
  assert.doesNotMatch(sent[0].text, /1-2-3|0900000000/, "no address or phone in the mail");
  assert.equal((await mailDoc(`order_${id}`)).status, "sent");
  assert.deepEqual(await stockOf(sku), before, "shipping a store order never moves stock");
  const order = (await db.collection(of.ORDERS).doc(id).get()).data();
  assert.deepEqual([order.status, order.fulfillment.status, order.fulfillment.method, order.fulfillment.trackingNumber], ["paid", "shipped", "yupack", "1234-5678-9012"]);
  // The request records never keep the customer's email.
  const ops = await db.collection(of.OPS).where("orderId", "==", id).get();
  assert.ok(ops.docs.every((d) => !JSON.stringify(d.data()).includes("buyer@example.com")));
  // Shipped is final: no prepare, hold or resume afterwards.
  for (const step of [of.prepareOrder, of.resumeOrder]) await assert.rejects(step(db, { orderId: id, requestId: rid(), actor: ACTOR }, { now: NOW }), { code: "INVALID_STATE" });
});

test("only paid orders ship: refunded ones never; partially refunded with a warning; a refund after shipping keeps both on record", { skip }, async () => {
  const refunded = await paidOrder();
  await orders.recordRefund(db, { payment_intent: refunded, amount_refunded: 5650 });
  await assert.rejects(of.prepareOrder(db, { orderId: refunded, requestId: rid(), actor: ACTOR }, { now: NOW }), (e) => e.code === "NOT_SHIPPABLE" && e.detail.includes("REFUNDED"));
  await assert.rejects(of.shipOrder(db, { orderId: refunded, requestId: rid(), actor: ACTOR, method: "yupack" }, { now: NOW }), { code: "NOT_SHIPPABLE" });
  const partial = await paidOrder();
  await orders.recordRefund(db, { payment_intent: partial, amount_refunded: 250 });
  assert.equal((await of.prepareOrder(db, { orderId: partial, requestId: rid(), actor: ACTOR }, { now: NOW })).status, "preparing");
  const unknown = "pi_emu" + crypto.randomBytes(8).toString("hex");
  await assert.rejects(of.prepareOrder(db, { orderId: unknown, requestId: rid(), actor: ACTOR }, { now: NOW }), { code: "UNKNOWN_ORDER" });
  const later = await paidOrder();
  await shipLikeTheRoute(later, { sendMail: async () => {} });
  await orders.recordRefund(db, { payment_intent: later, amount_refunded: 5650 });
  const o = (await db.collection(of.ORDERS).doc(later).get()).data();
  assert.deepEqual([o.status, o.fulfillment.status], ["refunded", "shipped"]);
  const list = await of.workList(db, { view: "all" }, { now: NOW });
  const row = (id) => list.orders.find((r) => r.orderId === id);
  assert.deepEqual(row(partial).warnings, ["PARTIALLY_REFUNDED"]);
  assert.deepEqual([row(refunded).blockers, row(later).paymentStatus, row(later).amountRefunded], [["REFUNDED"], "refunded", 5650]);
  assert.ok(!(await of.workList(db, { view: "open" }, { now: NOW })).orders.some((r) => r.orderId === refunded), "a refunded, unshipped order leaves the to-do list");
});

test("mails: a test order never mails; no email → nothing sent; a failed mail is sent again once, from staff, even pressed at once", { skip }, async () => {
  const sent = [];
  const testOrder = await paidOrder({ livemode: false });
  const r1 = await shipLikeTheRoute(testOrder, { sendMail: async (m) => { sent.push(m); } });
  assert.deepEqual([r1.mailStatus, sent.length, (await mailDoc(`order_${testOrder}`)).status], ["skipped_test", 0, "skipped_test"]);
  const failing = await paidOrder();
  const r2 = await shipLikeTheRoute(failing, { sendMail: async () => { throw new Error("SMTP down"); } });
  assert.equal(r2.mailStatus, "failed");
  const claims = await Promise.all([1, 2, 3].map(() => notice.claimRetry(db, `order_${failing}`)));
  assert.equal(claims.filter(Boolean).length, 1, "one resend at most");
  const order = (await db.collection(of.ORDERS).doc(failing).get()).data();
  assert.equal(await of.sendShippedMail(db, { orderId: failing, to: order.customer.email, order }, async (m) => { sent.push(m); }), "sent");
  assert.equal(sent.length, 1);
  assert.equal(await notice.claimRetry(db, `order_${failing}`), false, "a sent mail is never sent again");
  // International: in English, with the air packet.
  const intl = await paidOrder({ country: "TW", items: "enma-jimma:2@1500" });
  const r3 = await shipLikeTheRoute(intl, { method: "intl_air_packet", trackingNumber: "RR123456789JP", sendMail: async (m) => { sent.push(m); } });
  assert.equal(r3.mailStatus, "sent");
  assert.match(sent.at(-1).text, /was shipped today[\s\S]*International Air Packet[\s\S]*RR123456789JP/);
});

test("hold and resume; the work list shows names but no street address; the address is read on request and each look recorded", { skip }, async () => {
  const id = await paidOrder();
  assert.equal((await of.holdOrder(db, { orderId: id, requestId: rid(), actor: ACTOR, reason: "ADDRESS_CHECK" }, { now: NOW })).status, "held");
  await assert.rejects(of.shipOrder(db, { orderId: id, requestId: rid(), actor: ACTOR, method: "yupack" }, { now: NOW }), { code: "INVALID_STATE" });
  assert.equal((await of.resumeOrder(db, { orderId: id, requestId: rid(), actor: ACTOR }, { now: NOW })).status, "new");
  await assert.rejects(of.shipOrder(db, { orderId: id, requestId: rid(), actor: ACTOR, method: "airmail" }, { now: NOW }), { code: "INVALID_SHIPPING_METHOD" });
  await assert.rejects(of.shipOrder(db, { orderId: id, requestId: rid(), actor: ACTOR, method: "yupack", trackingNumber: "<script>" }, { now: NOW }), { code: "INVALID_TRACKING_NUMBER" });
  const list = await of.workList(db, { view: "open" }, { now: NOW });
  const row = list.orders.find((r) => r.orderId === id);
  assert.deepEqual([row.name, row.prefecture, row.status, row.aimDay], ["Test Buyer", "神奈川県", "new", "2026-11-22"]);
  assert.equal(row.shipBy, plan.workingDayAfter("2026-11-21", 3, CALENDAR));
  assert.doesNotMatch(JSON.stringify(list), /1-2-3|0900000000|buyer@example\.com|2470062/, "no street address, phone, email or postal code in the list");
  const address = await of.orderAddress(db, id, ACTOR, NOW);
  assert.equal(address.address.line1, "1-2-3");
  const views = await db.collection(of.ADDRESS_VIEWS).where("orderId", "==", id).get();
  assert.equal(views.size, 1);
  assert.doesNotMatch(JSON.stringify(views.docs[0].data()), /1-2-3/, "the record says who looked, not what they saw");
});

// ---- 珈琲の定期便: the same mail, its own stock steps -----------------------------------------------------------------
test("珈琲の定期便: shipped by レターパックプラス, stock moves once (its own steps), one mail; a test contract never mails", { skip }, async () => {
  const tag = crypto.randomUUID().slice(0, 8);
  const catalog = { [`emu-a-${tag}`]: { kind: "beans", managedStock: true, contentG: 100, price: 1 }, [`emu-b-${tag}`]: { kind: "beans", managedStock: true, contentG: 100, price: 1 } };
  const [a, b] = Object.keys(catalog);
  await db.collection("inventory").doc(a).set({ ready: 5, held: 0, sold: 0 });
  await db.collection("inventory").doc(b).set({ ready: 5, held: 0, sold: 0 });
  const CONFIG = { priceIds: { 1: "price_m1", 2: "price_m2", 3: "price_m3", 4: "price_m4" }, calendar: CALENDAR };
  const signUp = async (sub, livemode) => {
    const meta = { kind: records.KIND, frequency: "1", startMonth: "2026-12" };
    await records.handleEvent(db, { type: "checkout.session.completed", data: { object: { id: `cs_${sub}`, mode: "subscription", subscription: sub, customer: "cus_e", livemode,
      customer_details: { email: `${sub}@example.com`, name: "E" }, metadata: meta,
      collected_information: { shipping_details: { name: "E", address: { postal_code: "100-0001", state: "東京都", city: "千代田区", line1: "1", country: "JP" } } } } } }, CONFIG);
    await records.handleEvent(db, { type: "invoice.paid", data: { object: { id: `in_first_${sub}`, customer: "cus_e", livemode, billing_reason: "subscription_create", amount_paid: 3000,
      status_transitions: { paid_at: Math.floor(NOW / 1000) - 3600 }, parent: { subscription_details: { subscription: sub, metadata: meta } },
      lines: { data: [{ type: "subscription", pricing: { price_details: { price: "price_m1" } }, period: { start: plan.billingStartUnix("2026-12"), end: plan.billingStartUnix("2027-01") } }] } } } }, CONFIG);
    return `${sub}_first`;
  };
  const sent = [];
  for (const live of [true, false]) {
    const shipmentId = await signUp(`sub_emuord${live ? "l" : "t"}${tag}`, live);
    await f.prepareShipment(db, { shipmentId, skus: [a, b], requestId: rid(), actor: ACTOR }, { now: NOW, catalog });
    const route = async (requestId) => {
      const r = await f.shipShipment(db, { shipmentId, requestId, actor: ACTOR, method: "letterpack_plus", trackingNumber: "1111-2222-3333" }, { now: NOW });
      return r.mail ? { ...r, mailStatus: await f.sendSubscriptionShippedMail(db, { shipmentId, ...r.mail, beans: r.beans }, async (m) => { sent.push(m); }, { error() {} }) } : r;
    };
    const same = rid();
    const results = await Promise.all([route(rid()), route(rid()), route(same), route(same)]);
    assert.equal(results.filter((r) => r.applied !== false).length, 1);
    const s = (await db.collection(records.SHIPMENTS).doc(shipmentId).get()).data();
    assert.deepEqual([s.status, s.shippingMethod], ["shipped", "letterpack_plus"]);
    assert.equal((await mailDoc(`subscription_${shipmentId}`)).status, live ? "sent" : "skipped_test");
  }
  assert.deepEqual(await stockOf(a), { ready: 3, held: 0, sold: 2 }, "each delivery took its bag once, at shipping, as before");
  assert.equal(sent.length, 1, "only the live contract's delivery mailed, once");
  assert.equal(sent[0].subject, "【龍華珈琲】珈琲を発送いたしました");
  assert.match(sent[0].text, /珈琲の定期便（初回）[\s\S]*・数量：2袋[\s\S]*レターパックプラス[\s\S]*・お問い合わせ番号：1111-2222-3333[\s\S]*trackings\.post\.japanpost\.jp/);
  // The usual way stays レターパックライト when nothing is chosen; an international way is not offered for it.
  await assert.rejects(f.shipShipment(db, { shipmentId: `sub_x${tag}_first`, requestId: rid(), actor: ACTOR, method: "intl_air_packet" }, { now: NOW }), { code: "INVALID_SHIPPING_METHOD" });
});

test("orders paid before this page existed: listed under all only, nothing can be done to them, no mail", { skip }, async () => {
  const id = "pi_emu" + crypto.randomBytes(8).toString("hex");
  const before = Date.UTC(2026, 10, 19, 3);
  await orders.recordPaidOrder(db, null, { id, object: "payment_intent", status: "succeeded", amount: 2300, currency: "jpy", livemode: true, created: Math.floor(before / 1000),
    metadata: { items: "enma-kindiio:1@2050", subtotal: "2050", shipping: "250", countryCode: "JP" },
    latest_charge: { id: "ch_" + id.slice(3), created: Math.floor(before / 1000), billing_details: { name: "Earlier", email: "earlier@example.com", address: { country: "JP", state: "東京都", city: "港区" } } } });
  for (const step of [of.prepareOrder, (d, a, o) => of.shipOrder(d, { ...a, method: "yupack" }, o)]) {
    await assert.rejects(step(db, { orderId: id, requestId: rid(), actor: ACTOR }, { now: NOW }), (e) => e.code === "NOT_SHIPPABLE" && e.detail.includes("EARLIER_ORDER"));
  }
  assert.equal((await db.collection(notice.MAILS).doc(`order_${id}`).get()).exists, false);
  const open = await of.workList(db, { view: "open" }, { now: NOW });
  assert.ok(!open.orders.some((r) => r.orderId === id), "not on the to-do list");
  const all = await of.workList(db, { view: "all" }, { now: NOW });
  assert.deepEqual(all.orders.find((r) => r.orderId === id).blockers, ["EARLIER_ORDER"]);
});
