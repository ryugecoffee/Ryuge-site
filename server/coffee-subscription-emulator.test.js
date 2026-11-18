"use strict";

// 2026-11-18: 珈琲の定期便 on real Firestore transactions (local emulator only): the same Stripe events delivered many
// times, at the same moment and in any order, give one contract, one first delivery and one set of monthly deliveries.
// Skipped unless FIRESTORE_EMULATOR_HOST is set (CI runs it under `firebase emulators:exec`).
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const plan = require("./coffee-subscription-plan");
const records = require("./coffee-subscription-records");
const { CALENDAR } = require("./coffee-subscription-calendar");

const emulator = process.env.FIRESTORE_EMULATOR_HOST;
const skip = emulator ? false : "FIRESTORE_EMULATOR_HOST not set";
const CONFIG = { priceIds: { 1: "price_m1", 2: "price_m2", 3: "price_m3", 4: "price_m4" }, calendar: CALENDAR };
let db;

test.before(async () => {
  if (skip) return;
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(emulator)) throw new Error("EMULATOR_HOST_MUST_BE_LOCAL");
  const admin = require("firebase-admin");
  const app = admin.initializeApp({ projectId: "demo-ryuge-inventory" }, "coffee-sub-" + crypto.randomUUID());
  db = admin.firestore(app);
});

test("duplicate and simultaneous events: one contract, one first delivery, one set of deliveries per paid month", { skip }, async () => {
  const sub = "sub_emu_" + crypto.randomUUID().slice(0, 8);
  const meta = { kind: records.KIND, frequency: "3", startMonth: "2026-12" };
  const session = { id: "cs_" + sub, mode: "subscription", subscription: sub, customer: "cus_e", livemode: false,
    customer_details: { email: "e@example.com", name: "E" }, metadata: { ...meta, preference: "浅煎りが好き" } };
  const invoice = (id, reason, amount, month) => ({ id, customer: "cus_e", billing_reason: reason, amount_paid: amount, livemode: false,
    status_transitions: { paid_at: plan.monthStartUnix(month) + 3600 }, parent: { subscription_details: { subscription: sub, metadata: meta } },
    lines: { data: [{ type: "subscription", pricing: { price_details: { price: "price_m3" } }, period: { start: plan.monthStartUnix(month), end: plan.monthStartUnix(plan.addMonths(month, 1)) } }] } });
  const ev = (type, object) => ({ type, data: { object } });
  const first = invoice("in_first", "subscription_create", 3000, "2026-11");
  const dec = invoice("in_dec", "subscription_cycle", 8550, "2026-12");
  // Everything at once, several times, in mixed order.
  await Promise.all([
    records.handleEvent(db, ev("invoice.paid", first), CONFIG), records.handleEvent(db, ev("checkout.session.completed", session), CONFIG),
    records.handleEvent(db, ev("invoice.paid", first), CONFIG), records.handleEvent(db, ev("checkout.session.completed", session), CONFIG),
    records.handleEvent(db, ev("invoice.paid", dec), CONFIG), records.handleEvent(db, ev("invoice.paid", dec), CONFIG),
    records.handleEvent(db, ev("invoice.payment_failed", { ...dec, amount_paid: 0 }), CONFIG), records.handleEvent(db, ev("invoice.paid", dec), CONFIG),
  ]);
  const shipments = (await db.collection(records.SHIPMENTS).where("subscriptionId", "==", sub).get()).docs.map((d) => d.id).sort();
  assert.deepEqual(shipments, [`${sub}_2026-12_1`, `${sub}_2026-12_2`, `${sub}_2026-12_3`, `${sub}_first`]);
  const month = (await db.collection(records.MONTHS).doc(`${sub}_2026-12`).get()).data();
  assert.equal(month.status, "paid", "a failure notice racing the payment never wins over it");
  const contract = (await db.collection(records.SUBS).doc(sub).get()).data();
  assert.equal(contract.email, "e@example.com");
  assert.equal(contract.preference.text, "浅煎りが好き");
  assert.equal(contract.frequency, 3);
});
