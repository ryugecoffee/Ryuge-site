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

const SENDER_OK = { fromAddressMatches: true, spfDkimDmarcPass: true, dkimDomainAligned: true };
// ---- A cancellation asked by email (server/coffee-subscription-email-cancel.js) -------------------------------------
// Stripe is a stand-in that records what was asked of it: this month's invoice is already paid (09:05 on 1 December).
function fakeStripe(sub, { invoiceStatus = "paid" } = {}) {
  const calls = [];
  return { calls, subscriptions: {
    retrieve: async () => ({ id: sub, status: "active", schedule: null }),
    update: async (id, params) => { calls.push(["update", params.cancel_at]); return {}; },
    cancel: async () => { calls.push(["cancel"]); return {}; },
  }, subscriptionSchedules: { release: async () => ({}) },
  invoices: {
    list: async () => ({ data: [{ id: `in_dec_${sub}`, status: invoiceStatus, amount_paid: invoiceStatus === "paid" ? plan.MONTHLY_PRICES[2] : 0, billing_reason: "subscription_cycle",
      lines: { data: [{ period: { start: plan.billingStartUnix("2026-12"), end: plan.billingStartUnix("2027-01") } }] } }] }),
    voidInvoice: async () => { calls.push(["void"]); return {}; },
  } };
}
const DEC_2 = Date.UTC(2026, 11, 2, 1); // 2 December, 10:00 JST
async function signedUpAndDecemberPaid(sub, catalog, [a, b], { shipFirst = true } = {}) {
  const meta = { kind: records.KIND, frequency: "2", startMonth: "2026-12" };
  await records.handleEvent(db, ev("checkout.session.completed", { id: `cs_${sub}`, mode: "subscription", subscription: sub, customer: "cus_e", livemode: false,
    customer_details: { email: `${sub}@example.com`, name: "E" }, metadata: meta,
    collected_information: { shipping_details: { name: "E", phone: "090-1234-5678", address: { postal_code: "100-0001", state: "東京都", city: "千代田区", line1: "1", country: "JP" } } } }), CONFIG);
  const invoice = (id, reason, amount, paidAt, month) => ({ id, customer: "cus_e", livemode: false, billing_reason: reason, amount_paid: amount,
    status_transitions: { paid_at: Math.floor(paidAt / 1000) }, parent: { subscription_details: { subscription: sub, metadata: meta } },
    lines: { data: [{ type: "subscription", pricing: { price_details: { price: "price_m2" } }, period: { start: plan.billingStartUnix(month), end: plan.billingStartUnix(plan.addMonths(month, 1)) } }] } });
  await records.handleEvent(db, ev("invoice.paid", invoice(`in_first_${sub}`, "subscription_create", 3000, NOW - 3600e3, "2026-12")), CONFIG);
  await f.prepareShipment(db, { shipmentId: `${sub}_first`, skus: [a, b], requestId: `req-${sub}-first-p`, actor: ACTOR }, { now: NOW, catalog });
  if (shipFirst) await f.shipShipment(db, { shipmentId: `${sub}_first`, requestId: `req-${sub}-first-s`, actor: ACTOR }, { now: NOW });
  await records.handleEvent(db, ev("invoice.paid", invoice(`in_dec_${sub}`, "subscription_cycle", plan.MONTHLY_PRICES[2], plan.billingStartUnix("2026-12") * 1000 + 300e3, "2026-12")), CONFIG);
}

test("email cancellation: arrived before 09:00 on the 1st, entered after the charge → that month stopped, stock back, refund proposed once", { skip }, async () => {
  const ec = require("./coffee-subscription-email-cancel");
  const tag = crypto.randomUUID().slice(0, 8);
  const catalog = testCatalog(tag);
  const [a, b] = Object.keys(catalog);
  await db.collection("inventory").doc(a).set({ ready: 5, held: 0, sold: 0 });
  await db.collection("inventory").doc(b).set({ ready: 5, held: 0, sold: 0 });
  const sub = `sub_emumail${tag}`;
  await signedUpAndDecemberPaid(sub, catalog, [a, b]);
  // The 5 December delivery is already being prepared (one bag of each held).
  await f.prepareShipment(db, { shipmentId: `${sub}_2026-12_1`, skus: [a, b], requestId: `req-${tag}-dec1`, actor: ACTOR }, { now: DEC_2, catalog });
  assert.deepEqual(await stock(a), { ready: 4, held: 1, sold: 1 });
  const stripe = fakeStripe(sub);
  const receivedAt = "2026-12-01T08:30:00+09:00";
  const base = { email: `${sub}@example.com`, receivedAt };

  // Who: the registered address finds the contract; from another address the postal code and phone must match.
  await assert.rejects(ec.preview({ db, stripe, body: { ...base, email: `nobody-${tag}@example.com`, method: "registered_address", senderCheck: SENDER_OK }, now: DEC_2 }), { code: "NOT_VERIFIED" });
  // From the registered address only with the sender authenticated (SPF/DKIM/DMARC PASS); otherwise the details check.
  await assert.rejects(ec.preview({ db, stripe, body: { ...base, method: "registered_address" }, now: DEC_2 }), { code: "SENDER_CHECK_REQUIRED" });
  await assert.rejects(ec.preview({ db, stripe, body: { ...base, method: "details", postalCode: "1000001", phoneLast4: "0000" }, now: DEC_2 }), { code: "NOT_VERIFIED" });
  await assert.rejects(ec.preview({ db, stripe, body: { ...base, method: "details", postalCode: "100-0001" }, now: DEC_2 }), { code: "DETAILS_REQUIRED" });
  const p = await ec.preview({ db, stripe, body: { ...base, method: "details", postalCode: "１００-０００１", phoneLast4: "5678" }, now: DEC_2 });
  assert.deepEqual([p.firstUnchargedMonth, p.monthRefund, p.firstRefund], ["2026-12", { month: "2026-12", amount: plan.MONTHLY_PRICES[2], shippedBefore: 0 }, 0]);
  // Older than last month's charge: not handled here (the CEO decides).
  await assert.rejects(ec.preview({ db, stripe, body: { ...base, method: "registered_address", senderCheck: SENDER_OK, receivedAt: "2026-10-31T20:00:00+09:00" }, now: DEC_2 }), { code: "REQUEST_TOO_OLD" });

  // The same request sent several times, a second staff request, and the 5 December delivery shipped, all at once.
  const mails = [];
  const confirm = (requestId) => ec.confirm({ db, stripe, body: { ...base, method: "details", postalCode: "1000001", phoneLast4: "5678", key: p.key, requestId },
    actor: ACTOR, now: DEC_2, sendMail: async (m) => { mails.push(m); }, env: { SHOP_STAFF_EMAILS: "staff@example.com" }, log: { error() {} } });
  const results = await Promise.allSettled([
    ...[1, 2, 3].map(() => confirm(`req-${tag}-mailcancel`)), confirm(`req-${tag}-mailcancel-2`),
    f.shipShipment(db, { shipmentId: `${sub}_2026-12_1`, requestId: `req-${tag}-dec1-ship`, actor: ACTOR }, { now: DEC_2 }),
  ]);
  const unexpected = results.filter((r) => r.status === "rejected" && !["REQUEST_IN_PROGRESS", "AFTER_CANCELLATION", "INVALID_STATE"].includes(r.reason.code));
  assert.deepEqual(unexpected.map((r) => r.reason.message), []);
  const contract = (await db.collection(records.SUBS).doc(sub).get()).data();
  assert.equal(contract.firstUnchargedMonth, "2026-12");
  assert.equal(contract.cancelVia, "email");
  assert.equal(contract.monthRefundProposal.amount, plan.MONTHLY_PRICES[2]);
  assert.equal(contract.monthRefundProposal.status, "awaiting_ceo_approval", "never refunded automatically");
  const dec1 = (await db.collection(records.SHIPMENTS).doc(`${sub}_2026-12_1`).get()).data();
  // Either the bags left with the parcel (shipped before the cancellation) or they went back: never both, never twice.
  if (dec1.status === "shipped") {
    assert.deepEqual(await stock(a), { ready: 3, held: 0, sold: 2 });
    assert.equal(contract.monthRefundProposal.shippedBefore, 1);
  } else {
    assert.equal(dec1.status, "cancelled_before_shipping");
    assert.deepEqual(await stock(a), { ready: 4, held: 0, sold: 1 });
    assert.equal(contract.monthRefundProposal.shippedBefore, 0);
  }
  const dec2 = (await db.collection(records.SHIPMENTS).doc(`${sub}_2026-12_2`).get()).data();
  assert.equal(dec2.status, "cancelled_before_shipping");
  await assert.rejects(f.prepareShipment(db, { shipmentId: `${sub}_2026-12_2`, skus: [a, b], requestId: `req-${tag}-dec2`, actor: ACTOR }, { now: DEC_2, catalog }));
  // One mail to the registered address, one notice to the shop (contract number and amounts only).
  assert.deepEqual(mails.map((m) => m.to).sort(), [`${sub}@example.com`, "staff@example.com"].sort());
  const notice = mails.find((m) => m.to === "staff@example.com").text;
  assert.doesNotMatch(notice, /example\.com|090|100-0001|東京都/);
  const customerMail = mails.find((m) => m.to !== "staff@example.com");
  assert.equal(customerMail.subject, "【龍華珈琲】定期便の解約を承りました");
  assert.match(customerMail.text, /2026年12月分のご請求（5,800円）は、ご依頼が毎月1日9時のご請求より前に届いていたため、全額返金いたします。この月の発送はいたしません。/);
  assert.match(customerMail.text, /解約受付から7営業日以内に手続きいたします/);
  assert.match(customerMail.text, /・今後のお届け：ございません\n/, "the stopped month is not listed as coming");
  // Stripe: only "end at the next 1st" (no refund, no new charge asked of it).
  assert.ok(stripe.calls.every(([kind, at]) => kind === "update" && at === plan.billingStartUnix("2027-01")));
  const kept = (await db.collection(ec.REQUESTS).where("subscriptionId", "==", sub).get()).docs.map((d) => d.data());
  assert.equal(kept.length, 2);
  assert.ok(kept.every((r) => r.method === "details" && !JSON.stringify(r).includes("5678") && !JSON.stringify(r).includes("1000001")), "what was entered is never kept");
});

test("email cancellation: arrived after 09:00 on the 1st → the paid month is delivered, no month refund", { skip }, async () => {
  const ec = require("./coffee-subscription-email-cancel");
  const tag = crypto.randomUUID().slice(0, 8);
  const catalog = testCatalog(tag);
  const [a, b] = Object.keys(catalog);
  await db.collection("inventory").doc(a).set({ ready: 5, held: 0, sold: 0 });
  await db.collection("inventory").doc(b).set({ ready: 5, held: 0, sold: 0 });
  const sub = `sub_emumail2${tag}`;
  await signedUpAndDecemberPaid(sub, catalog, [a, b]);
  const stripe = fakeStripe(sub);
  const body = { email: `${sub}@example.com`, method: "registered_address", senderCheck: SENDER_OK, receivedAt: "2026-12-01T09:30:00+09:00" };
  const p = await ec.preview({ db, stripe, body, now: DEC_2 });
  assert.deepEqual([p.firstUnchargedMonth, p.monthRefund], ["2027-01", null]);
  const mails = [];
  const r = await ec.confirm({ db, stripe, body: { ...body, key: p.key, requestId: `req-${tag}-mailcancel` }, actor: ACTOR, now: DEC_2,
    sendMail: async (m) => { mails.push(m); }, env: { SHOP_STAFF_EMAILS: "staff@example.com" } });
  assert.equal(r.monthRefund, null);
  assert.deepEqual(mails.map((m) => m.to), [`${sub}@example.com`], "no refund, so no notice to the shop");
  const dec1 = (await db.collection(records.SHIPMENTS).doc(`${sub}_2026-12_1`).get()).data();
  assert.equal(dec1.status, "planned", "the paid month is still delivered");
});

test("email cancellation: the first delivery and this month's both being prepared with the same beans → both bags back, two refunds proposed", { skip }, async () => {
  const ec = require("./coffee-subscription-email-cancel");
  const tag = crypto.randomUUID().slice(0, 8);
  const catalog = testCatalog(tag);
  const [a, b] = Object.keys(catalog);
  await db.collection("inventory").doc(a).set({ ready: 5, held: 0, sold: 0 });
  await db.collection("inventory").doc(b).set({ ready: 5, held: 0, sold: 0 });
  const sub = `sub_emumail3${tag}`;
  await signedUpAndDecemberPaid(sub, catalog, [a, b], { shipFirst: false });
  await f.prepareShipment(db, { shipmentId: `${sub}_2026-12_1`, skus: [a, b], requestId: `req-${tag}-dec1`, actor: ACTOR }, { now: DEC_2, catalog });
  assert.deepEqual(await stock(a), { ready: 5, held: 2, sold: 0 });
  const stripe = fakeStripe(sub);
  const body = { email: `${sub}@example.com`, method: "registered_address", senderCheck: SENDER_OK, receivedAt: "2026-12-01T07:00:00+09:00" };
  const p = await ec.preview({ db, stripe, body, now: DEC_2 });
  const r = await ec.confirm({ db, stripe, body: { ...body, key: p.key, requestId: `req-${tag}-mailcancel` }, actor: ACTOR, now: DEC_2, env: {} });
  assert.deepEqual([r.firstRefund, r.monthRefund.amount], [3000, plan.MONTHLY_PRICES[2]]);
  assert.deepEqual(await stock(a), { ready: 5, held: 0, sold: 0 }, "one bag back for each delivery, not one in all");
  assert.deepEqual(await stock(b), { ready: 5, held: 0, sold: 0 });
});

test("email cancellation: the customer cancelled on their page after 09:00, but their email arrived before → that month still refunded once", { skip }, async () => {
  const ec = require("./coffee-subscription-email-cancel");
  const ops = require("./coffee-subscription-stripe");
  const tag = crypto.randomUUID().slice(0, 8);
  const catalog = testCatalog(tag);
  const [a, b] = Object.keys(catalog);
  await db.collection("inventory").doc(a).set({ ready: 5, held: 0, sold: 0 });
  await db.collection("inventory").doc(b).set({ ready: 5, held: 0, sold: 0 });
  const sub = `sub_emumail4${tag}`;
  await signedUpAndDecemberPaid(sub, catalog, [a, b]);
  const stripe = fakeStripe(sub);
  // On the page on 2 December: from January (December was paid).
  assert.equal((await ops.cancelSubscription({ db, stripe, subscriptionId: sub, now: DEC_2 })).firstUnchargedMonth, "2027-01");
  const body = { email: `${sub}@example.com`, method: "registered_address", senderCheck: SENDER_OK, receivedAt: "2026-12-01T08:50:00+09:00" };
  const p = await ec.preview({ db, stripe, body, now: DEC_2 + 3600e3 });
  assert.equal(p.alreadyCancelled, false);
  const send = (requestId) => ec.confirm({ db, stripe, body: { ...body, key: p.key, requestId }, actor: ACTOR, now: DEC_2 + 3600e3, env: {} });
  const r = await send(`req-${tag}-late-1`);
  assert.equal(r.monthRefund.amount, plan.MONTHLY_PRICES[2]);
  assert.equal((await send(`req-${tag}-late-2`)).alreadyCancelled, true, "a second request changes nothing");
  const contract = (await db.collection(records.SUBS).doc(sub).get()).data();
  assert.equal(contract.firstUnchargedMonth, "2026-12");
  assert.equal(contract.cancelVia, "customer_page", "the original cancellation is kept");
  assert.equal((await db.collection(records.SHIPMENTS).doc(`${sub}_2026-12_1`).get()).data().status, "cancelled_before_shipping");
});

test("email cancellation: before 09:00, entered after one of the month's deliveries left → full refund, the rest stopped, the words say so", { skip }, async () => {
  const ec = require("./coffee-subscription-email-cancel");
  const tag = crypto.randomUUID().slice(0, 8);
  const catalog = testCatalog(tag);
  const [a, b] = Object.keys(catalog);
  await db.collection("inventory").doc(a).set({ ready: 5, held: 0, sold: 0 });
  await db.collection("inventory").doc(b).set({ ready: 5, held: 0, sold: 0 });
  const sub = `sub_emumail5${tag}`;
  await signedUpAndDecemberPaid(sub, catalog, [a, b]);
  // The 5 December delivery left before the shop entered the email; the 20 December one is still planned.
  await f.prepareShipment(db, { shipmentId: `${sub}_2026-12_1`, skus: [a, b], requestId: `req-${tag}-dec1p`, actor: ACTOR }, { now: DEC_2, catalog });
  await f.shipShipment(db, { shipmentId: `${sub}_2026-12_1`, requestId: `req-${tag}-dec1s`, actor: ACTOR }, { now: DEC_2 });
  assert.deepEqual(await stock(a), { ready: 3, held: 0, sold: 2 });
  const stripe = fakeStripe(sub);
  const later = Date.UTC(2026, 11, 7, 1);
  const body = { email: `${sub}@example.com`, method: "registered_address", senderCheck: SENDER_OK, receivedAt: "2026-12-01T08:10:00+09:00" };
  const p = await ec.preview({ db, stripe, body, now: later });
  assert.deepEqual(p.monthRefund, { month: "2026-12", amount: plan.MONTHLY_PRICES[2], shippedBefore: 1 });
  const mails = [];
  const r = await ec.confirm({ db, stripe, body: { ...body, key: p.key, requestId: `req-${tag}-partial` }, actor: ACTOR, now: later,
    sendMail: async (m) => { mails.push(m); }, env: { SHOP_STAFF_EMAILS: "staff@example.com" } });
  // The refund proposed is the whole month, as the terms say; the shipped delivery stays shipped, the other is stopped.
  assert.deepEqual(r.monthRefund, { month: "2026-12", amount: plan.MONTHLY_PRICES[2], shippedBefore: 1 });
  const contract = (await db.collection(records.SUBS).doc(sub).get()).data();
  assert.deepEqual([contract.monthRefundProposal.amount, contract.monthRefundProposal.shippedBefore, contract.monthRefundProposal.status],
    [plan.MONTHLY_PRICES[2], 1, "awaiting_ceo_approval"]);
  const ships = async (n) => (await db.collection(records.SHIPMENTS).doc(`${sub}_2026-12_${n}`).get()).data().status;
  assert.deepEqual([await ships(1), await ships(2)], ["shipped", "cancelled_before_shipping"]);
  assert.deepEqual(await stock(a), { ready: 3, held: 0, sold: 2 }, "nothing taken back from the parcel that left, nothing released twice");
  const customer = mails.find((m) => m.to !== "staff@example.com").text;
  assert.match(customer, /2026年12月分のご請求（5,800円）は、ご依頼が毎月1日9時のご請求より前に届いていたため、全額返金いたします。/);
  assert.match(customer, /すでに発送した1回分は、そのままお受け取りください（お支払い・ご返品は不要です）。まだ発送していない分は発送いたしません。/);
  assert.doesNotMatch(customer, /この月の発送はいたしません/, "never says nothing ships when one already did");
  assert.match(mails.find((m) => m.to === "staff@example.com").text, /すでに発送済み 1件/);
  const kept = (await db.collection(ec.REQUESTS).doc(`req-${tag}-partial`).get()).data();
  assert.deepEqual(kept.senderCheck, ["fromAddressMatches", "spfDkimDmarcPass", "dkimDomainAligned"], "how the sender was checked is recorded");
});
