"use strict";

// 2026-11-18: 珈琲の定期便 on real Firestore transactions (local emulator only): the same Stripe events delivered many
// times, at the same moment and in any order, give one contract, one first delivery and one set of monthly deliveries.
// Skipped unless FIRESTORE_EMULATOR_HOST is set (CI runs it under `firebase emulators:exec`).
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const plan = require("./coffee-subscription-plan");
const records = require("./coffee-subscription-records");
const checkout = require("./coffee-subscription-checkout");
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
    customer_details: { email: `${sub}@example.com`, name: "E" }, metadata: { ...meta, preference: "浅煎りが好き" } };
  const invoice = (id, reason, amount, month) => ({ id, customer: "cus_e", billing_reason: reason, amount_paid: amount, livemode: false,
    status_transitions: { paid_at: plan.billingStartUnix(month) + 3600 }, parent: { subscription_details: { subscription: sub, metadata: meta } },
    lines: { data: [{ type: "subscription", pricing: { price_details: { price: "price_m3" } }, period: { start: plan.billingStartUnix(month), end: plan.billingStartUnix(plan.addMonths(month, 1)) } }] } });
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
  assert.equal(contract.email, `${sub}@example.com`);
  assert.equal(contract.preference.text, "浅煎りが好き");
  assert.equal(contract.frequency, 3);
});

test("one sign-up per email on real transactions: eight requests at once share one Checkout page", { skip }, async () => {
  const email = `same-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const config = checkout.configFrom({ COFFEE_SUBSCRIPTION_ENABLED: "true", STRIPE_PRICE_COFFEE_SUB_1: "price_m1", STRIPE_PRICE_COFFEE_SUB_2: "price_m2",
    STRIPE_PRICE_COFFEE_SUB_3: "price_m3", STRIPE_PRICE_COFFEE_SUB_4: "price_m4", STRIPE_PRICE_COFFEE_SUB_FIRST: "price_first" });
  let created = 0;
  const stripe = { checkout: { sessions: { create: async (params) => { created += 1; await new Promise((r) => setTimeout(r, 200));
    return { id: `cs_${created}`, url: `https://checkout.stripe.test/${email}/${created}`, expires_at: params.expires_at }; } } } };
  const out = await Promise.all(Array.from({ length: 8 }, () => checkout.createCheckout({ db, stripe, config, input: { frequency: 2, email }, now: Date.now() })));
  assert.equal(created, 1);
  assert.equal(new Set(out.map((o) => o.url)).size, 1);
});

test("two subscriptions for one email finishing at the same moment: exactly one owns the email and is shipped to", { skip }, async () => {
  const email = `twin-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const meta = { kind: records.KIND, frequency: "1", startMonth: "2026-12" };
  const subs = ["a", "b"].map((x) => `sub_twin_${x}_${crypto.randomUUID().slice(0, 6)}`);
  const ev = (type, object) => ({ type, data: { object } });
  const session = (sub) => ({ id: `cs_${sub}`, mode: "subscription", subscription: sub, customer: `cus_${sub}`, livemode: false, customer_details: { email }, metadata: meta });
  const invoice = (sub) => ({ id: `in_${sub}`, customer: `cus_${sub}`, customer_email: email, billing_reason: "subscription_create", amount_paid: 3000, livemode: false,
    status_transitions: { paid_at: Math.floor(Date.now() / 1000) }, parent: { subscription_details: { subscription: sub, metadata: meta } }, lines: { data: [] } });
  await Promise.all(subs.flatMap((sub) => [records.handleEvent(db, ev("invoice.paid", invoice(sub)), CONFIG), records.handleEvent(db, ev("checkout.session.completed", session(sub)), CONFIG)]));
  const contracts = await Promise.all(subs.map(async (sub) => (await db.collection(records.SUBS).doc(sub).get()).data()));
  const owners = contracts.filter((c) => !c.duplicateOf);
  assert.equal(owners.length, 1, "one owner");
  const shipped = [];
  for (const sub of subs) shipped.push(...(await db.collection(records.SHIPMENTS).where("subscriptionId", "==", sub).get()).docs.map((d) => d.id));
  assert.equal(shipped.length, 1, "one first delivery");
  const email_ = (await db.collection(records.EMAILS).doc(records.emailKey(email)).get()).data();
  assert.ok(shipped[0].startsWith(email_.subscriptionId), "the owner is the one shipped to");
});

test("account (②) on real transactions: one link → one session; one request id → one change; crossing address changes agree with Stripe", { skip }, async () => {
  const account = require("./coffee-subscription-account");
  const sub = `sub_acc_${crypto.randomUUID().slice(0, 8)}`;
  const email = `${sub}@example.com`;
  await db.collection(records.SUBS).doc(sub).set({ email, customerId: `cus_${sub}`, status: "trialing", frequency: 2, startMonth: "2026-12", skips: [], changes: {},
    planVersion: 0, ownerChecked: true, duplicateOf: null, shipping: null });
  await db.collection(records.EMAILS).doc(records.emailKey(email)).set({ status: "active", subscriptionId: sub });
  const mails = [];
  const now = Date.now();
  await account.requestLogin({ db, config: { siteUrl: "https://ryuge.test" }, sendMail: async (m) => { mails.push(m); }, email, now });
  const token = mails[0].text.match(/#login=([A-Za-z0-9_-]+)/)[1];
  const tries = await Promise.allSettled(Array.from({ length: 6 }, () => account.startSession({ db, token, now })));
  assert.equal(tries.filter((r) => r.status === "fulfilled").length, 1, "a link starts one session, even six times at once");
  const sessionToken = tries.find((r) => r.status === "fulfilled").value.sessionToken;
  const auth = await account.authenticate({ db, header: `Bearer ${sessionToken}`, now });
  assert.equal(auth.subscriptionId, sub);
  // The same request id sent six times at once: the change runs once; the others get its answer or "in progress".
  let runs = 0;
  const requestId = `req-${crypto.randomUUID()}`;
  const same = await Promise.allSettled(Array.from({ length: 6 }, () => account.once({ db, auth, requestId, action: "preference", now,
    run: async () => { runs += 1; await new Promise((r) => setTimeout(r, 100)); return { ok: true }; } })));
  assert.equal(runs, 1);
  assert.ok(same.every((r) => r.status === "fulfilled" || r.reason.code === "REQUEST_IN_PROGRESS"));
  // Address changes crossing each other: Firestore and the (stand-in) Stripe customer end the same.
  const stripeCustomer = {};
  const stripe = { customers: { update: async (id, p) => { await new Promise((r) => setTimeout(r, Math.random() * 40)); Object.assign(stripeCustomer, structuredClone(p)); } } };
  const addr = (city) => account.validateAddress({ name: "山田 太郎", postalCode: "1000001", prefecture: "東京都", city, line1: "1-1", phone: "0312345678" });
  await Promise.all(["港区", "中央区", "新宿区", "渋谷区"].map((city) => account.changeAddress({ db, stripe, auth, address: addr(city), now })));
  const c = (await db.collection(records.SUBS).doc(sub).get()).data();
  assert.equal(c.shippingPending, null);
  assert.equal(stripeCustomer.shipping.address.city, c.shipping.city);
  assert.equal(stripeCustomer.metadata.coffeeShippingVersion, String(c.shippingSyncedVersion));
});

test("③ Factory reads on real Firestore: list/get/schedule queries; one contact view per request even when sent at once", { skip }, async () => {
  const read = require("./factory-subscription-read");
  const id = `sub_emu3${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
  await db.collection(records.SUBS).doc(id).set({ email: `${id}@example.com`, status: "active", frequency: 1, startMonth: "2026-12", skips: [], changes: {},
    shipping: { name: "エミュ 花子", prefecture: "京都府", city: "京都市", line1: "1-1", postalCode: "600-0000", phone: "0750000000" }, preference: { text: "中煎り" }, createdAt: new Date() });
  await db.collection(records.SHIPMENTS).doc(`${id}_2026-12_1`).set({ subscriptionId: id, kind: "monthly", month: "2026-12", seq: 1, plannedDate: "2026-12-07", status: "planned", grams: 200 });
  const now = Date.UTC(2026, 11, 9, 3);
  const list = await read.listSubscriptions(db, { filter: "all", limit: 100 }, now);
  assert.ok(list.subscriptions.some((s) => s.ref === read.contractRef(id) && s.prefecture === "京都府"));
  assert.equal((await read.getSubscription(db, id, now)).subscription.preference.text, "中煎り");
  const week = await read.schedule(db, "week", now);
  assert.ok(week.deliveries.some((d) => d.ref === read.contractRef(id) && d.date === "2026-12-07"));
  assert.ok(!JSON.stringify([list, week]).includes("エミュ 花子"));
  const env = { FACTORY_CEO_USER_ID: "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b" };
  const view = { requestId: crypto.randomUUID(), viewedBy: env.FACTORY_CEO_USER_ID, viewedAt: Date.now() - 1000 };
  const tries = await Promise.allSettled(Array.from({ length: 5 }, () => read.contact(db, id, view, env, Date.now())));
  assert.equal(tries.filter((r) => r.status === "fulfilled").length, 1, "one view record, one answer");
  const audit = (await db.collection(read.VIEWS).doc(view.requestId).get()).data();
  assert.ok(!JSON.stringify(audit).includes("エミュ 花子") && !JSON.stringify(audit).includes("0750000000"));
});

test("the welcome mail on real transactions: the same sign-up events many times at once → one mail", { skip }, async () => {
  const mailer = require("./coffee-subscription-mail");
  const sub = "sub_emu_mail_" + crypto.randomUUID().slice(0, 8);
  const meta = { kind: records.KIND, frequency: "1", startMonth: "2026-12" };
  const session = { id: "cs_" + sub, mode: "subscription", subscription: sub, customer: "cus_m", livemode: false,
    customer_details: { email: `${sub}@example.com`, name: "M" }, metadata: meta };
  const first = { id: "in_first_" + sub, customer: "cus_m", billing_reason: "subscription_create", amount_paid: 3000, livemode: false,
    status_transitions: { paid_at: plan.billingStartUnix("2026-12") - 86400 * 10 }, parent: { subscription_details: { subscription: sub, metadata: meta } },
    lines: { data: [{ type: "subscription", pricing: { price_details: { price: "price_m1" } }, period: { start: plan.billingStartUnix("2026-12"), end: plan.billingStartUnix("2027-01") } }] } };
  const sent = [];
  const deliver = async (event) => {
    await records.handleEvent(db, event, CONFIG);
    return mailer.sendWelcomeIfReady({ db, event, siteUrl: "https://ryuge.biz", sendMail: async (m) => { sent.push(m.to); } });
  };
  const evs = [{ type: "checkout.session.completed", data: { object: session } }, { type: "invoice.paid", data: { object: first } }];
  await Promise.all([...evs, ...evs, ...evs, ...evs].map(deliver));
  assert.deepEqual(sent, [`${sub}@example.com`]);
});
