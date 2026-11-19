"use strict";

// 2026-11-19: 珈琲の定期便 ④ on real Firestore transactions (local emulator only): single orders and subscription
// deliveries competing for the same bags at the same moment, and the same shipping request sent many times at once.
// Skipped unless FIRESTORE_EMULATOR_HOST is set (CI runs it under `firebase emulators:exec`). Never production stock.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const plan = require("./coffee-subscription-plan");
const records = require("./coffee-subscription-records");
const inventory = require("./inventory");
const f = require("./coffee-subscription-fulfillment");
const { CALENDAR } = require("./coffee-subscription-calendar");

const emulator = process.env.FIRESTORE_EMULATOR_HOST;
const skip = emulator ? false : "FIRESTORE_EMULATOR_HOST not set";
const CONFIG = { priceIds: { 1: "price_m1", 2: "price_m2", 3: "price_m3", 4: "price_m4" }, calendar: CALENDAR };
const ACTOR = "shop:emulator-test";
const NOW = Date.UTC(2026, 10, 11, 3);
let db;

test.before(async () => {
  if (skip) return;
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(emulator)) throw new Error("EMULATOR_HOST_MUST_BE_LOCAL");
  const admin = require("firebase-admin");
  const app = admin.initializeApp({ projectId: "demo-ryuge-inventory" }, "fulfillment-" + crypto.randomUUID());
  db = admin.firestore(app);
});

const ev = (type, object) => ({ type, data: { object } });
async function signUp(sub) {
  const meta = { kind: records.KIND, frequency: "2", startMonth: "2026-12" };
  await records.handleEvent(db, ev("checkout.session.completed", { id: `cs_${sub}`, mode: "subscription", subscription: sub, customer: "cus_e", livemode: false,
    customer_details: { email: `${sub}@example.com`, name: "E" }, metadata: meta,
    collected_information: { shipping_details: { name: "E", address: { postal_code: "100-0001", state: "東京都", city: "千代田区", line1: "1", country: "JP" } } } }), CONFIG);
  const first = { id: `in_first_${sub}`, customer: "cus_e", livemode: false, billing_reason: "subscription_create", amount_paid: 3000,
    status_transitions: { paid_at: Math.floor(NOW / 1000) - 3600 }, parent: { subscription_details: { subscription: sub, metadata: meta } },
    lines: { data: [{ type: "subscription", pricing: { price_details: { price: "price_m2" } }, period: { start: plan.billingStartUnix("2026-12"), end: plan.billingStartUnix("2027-01") } }] } };
  await records.handleEvent(db, ev("invoice.paid", first), CONFIG);
  return { shipmentId: `${sub}_first`, first };
}
// Fresh stock records with their own names would not be beans of the catalogue: the test catalogue maps two test
// beans onto unique stock ids so runs never share counters.
function testCatalog(tag) {
  return { [`emu-a-${tag}`]: { kind: "beans", managedStock: true, contentG: 100, price: 1 }, [`emu-b-${tag}`]: { kind: "beans", managedStock: true, contentG: 100, price: 1 } };
}
const stock = async (sku) => (await db.collection("inventory").doc(sku).get()).data();

test("the last bags: single orders and deliveries at the same moment never take more than there is", { skip }, async () => {
  const tag = crypto.randomUUID().slice(0, 8);
  const catalog = testCatalog(tag);
  const [a, b] = Object.keys(catalog);
  await db.collection("inventory").doc(a).set({ ready: 2, held: 0, sold: 0 });
  await db.collection("inventory").doc(b).set({ ready: 10, held: 0, sold: 0 });
  const subs = await Promise.all([1, 2, 3].map((i) => signUp(`sub_emu${i}${tag}`)));
  const results = await Promise.allSettled([
    ...[1, 2, 3, 4].map((i) => inventory.reserve(db, [{ id: a, quantity: 1 }], `pi_${tag}_${i}`)),
    ...subs.map((s, i) => f.prepareShipment(db, { shipmentId: s.shipmentId, skus: [a, b], requestId: `req-${tag}-prep-${i}`, actor: ACTOR }, { now: NOW, catalog })),
  ]);
  const orders = results.slice(0, 4).filter((r) => r.status === "fulfilled").length;
  const prepared = results.slice(4).filter((r) => r.status === "fulfilled" && r.value.status === "preparing").length;
  const heldForShortage = results.slice(4).filter((r) => r.status === "fulfilled" && r.value.status === "held").length;
  assert.equal(orders + prepared, 2, "exactly the two bags were taken, by whoever came first");
  assert.equal(prepared + heldForShortage, 3, "every delivery was either prepared or held, none failed half-way");
  const s = await stock(a);
  assert.deepEqual(s, { ready: 2, held: 2, sold: 0 });
  assert.deepEqual(await stock(b), { ready: 10, held: prepared, sold: 0 }, "the second bean is reserved only with the first");
});

test("the same delivery shipped and prepared many times at once: stock moves once", { skip }, async () => {
  const tag = crypto.randomUUID().slice(0, 8);
  const catalog = testCatalog(tag);
  const [a, b] = Object.keys(catalog);
  await db.collection("inventory").doc(a).set({ ready: 5, held: 0, sold: 0 });
  await db.collection("inventory").doc(b).set({ ready: 5, held: 0, sold: 0 });
  const { shipmentId, first } = await signUp(`sub_emuship${tag}`);
  const prep = await Promise.allSettled(Array.from({ length: 6 }, (_, i) =>
    f.prepareShipment(db, { shipmentId, skus: [a, b], requestId: `req-${tag}-p${i % 2}`, actor: ACTOR }, { now: NOW, catalog })));
  assert.ok(prep.every((r) => r.status === "fulfilled"), JSON.stringify(prep.filter((r) => r.status === "rejected").map((r) => r.reason.message)));
  assert.deepEqual(await stock(a), { ready: 5, held: 1, sold: 0 });
  const ships = await Promise.allSettled([
    ...Array.from({ length: 8 }, (_, i) => f.shipShipment(db, { shipmentId, requestId: `req-${tag}-s${i % 3}`, actor: ACTOR }, { now: NOW })),
    records.handleEvent(db, ev("invoice.paid", first), CONFIG), records.handleEvent(db, ev("invoice.paid", first), CONFIG),
  ]);
  assert.ok(ships.every((r) => r.status === "fulfilled"));
  assert.equal(ships.slice(0, 8).filter((r) => r.value.applied !== false).length, 1, "one shipping applied");
  assert.deepEqual(await stock(a), { ready: 4, held: 0, sold: 1 });
  assert.deepEqual(await stock(b), { ready: 4, held: 0, sold: 1 });
  const shipment = (await db.collection(records.SHIPMENTS).doc(shipmentId).get()).data();
  assert.equal(shipment.status, "shipped");
  const opsDocs = await db.collection(f.OPS).where("shipmentId", "==", shipmentId).get();
  assert.deepEqual(opsDocs.docs.map((d) => d.data().action).sort(), ["prepare", "ship"], "one record per applied operation");
});

test("hold and ship racing: the bags are either shipped or given back, never both", { skip }, async () => {
  const tag = crypto.randomUUID().slice(0, 8);
  const catalog = testCatalog(tag);
  const [a, b] = Object.keys(catalog);
  await db.collection("inventory").doc(a).set({ ready: 3, held: 0, sold: 0 });
  await db.collection("inventory").doc(b).set({ ready: 3, held: 0, sold: 0 });
  const { shipmentId } = await signUp(`sub_emurace${tag}`);
  await f.prepareShipment(db, { shipmentId, skus: [a, b], requestId: `req-${tag}-prep`, actor: ACTOR }, { now: NOW, catalog });
  await Promise.allSettled([
    f.shipShipment(db, { shipmentId, requestId: `req-${tag}-ship`, actor: ACTOR }, { now: NOW }),
    f.holdShipment(db, { shipmentId, requestId: `req-${tag}-hold`, actor: ACTOR, reason: "OTHER" }, { now: NOW }),
  ]);
  const status = (await db.collection(records.SHIPMENTS).doc(shipmentId).get()).data().status;
  const s = await stock(a);
  if (status === "shipped") assert.deepEqual(s, { ready: 2, held: 0, sold: 1 });
  else assert.deepEqual([status, s], ["held", { ready: 3, held: 0, sold: 0 }]);
});

test("the work list's queries run on real Firestore (single-field queries only, no composite index needed)", { skip }, async () => {
  const tag = crypto.randomUUID().slice(0, 8);
  const { shipmentId } = await signUp(`sub_emulist${tag}`);
  const list = await f.workList(db, { from: "2026-11-01", to: "2026-11-30" }, { now: NOW });
  const row = list.deliveries.find((d) => d.shipmentId === shipmentId);
  assert.equal(row.status, "planned");
  assert.deepEqual(row.blockers, []);
  assert.ok(!JSON.stringify(row).includes("@example.com"));
});

test("staff sign-in on real Firestore: one link gives one session even when opened twice at once", { skip }, async () => {
  const staffAuth = require("./shop-staff-auth");
  const tag = crypto.randomUUID().slice(0, 8);
  const config = staffAuth.configFrom({ COFFEE_SUBSCRIPTION_FULFILLMENT_ENABLED: "true", SHOP_STAFF_EMAILS: `staff-${tag}@example.test` });
  const mails = [];
  await staffAuth.requestLogin({ db, config, sendMail: async (m) => mails.push(m), email: `staff-${tag}@example.test`, linkPath: "/admin/subscription-shipping", now: NOW });
  const token = /#login=([A-Za-z0-9_-]+)/.exec(mails[0].text)[1];
  const tries = await Promise.allSettled(Array.from({ length: 5 }, () => staffAuth.startSession({ db, config, token, now: NOW })));
  assert.equal(tries.filter((t) => t.status === "fulfilled").length, 1);
  const session = tries.find((t) => t.status === "fulfilled").value;
  const who = await staffAuth.authenticate({ db, config, header: `Bearer ${session.sessionToken}`, now: NOW });
  assert.match(who.actor, /^shop-staff:[0-9a-f]{12}$/);
  await staffAuth.endSession({ db, header: `Bearer ${session.sessionToken}` });
  await assert.rejects(staffAuth.authenticate({ db, config, header: `Bearer ${session.sessionToken}`, now: NOW }), { code: "SESSION_EXPIRED" });
});
