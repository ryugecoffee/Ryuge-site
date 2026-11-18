"use strict";

// 2026-11-18: 珈琲の定期便 backend ① — rules, Stripe events into Firestore, and sign-up. No real Stripe here (fakes);
// what needs the real Stripe API is listed in the PR as not yet verified.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const plan = require("./coffee-subscription-plan");
const { CALENDAR } = require("./coffee-subscription-calendar");
const records = require("./coffee-subscription-records");
const checkout = require("./coffee-subscription-checkout");
const serverPref = require("./coffee-subscription-preference");

const jstAt = (y, m, d, h = 12, min = 0) => Date.UTC(y, m - 1, d, h - 9, min);
const PRICES = { 1: "price_m1", 2: "price_m2", 3: "price_m3", 4: "price_m4" };
const CONFIG = { priceIds: PRICES, firstPriceId: "price_first", calendar: CALENDAR };

test("start month: 1st–15th → next month, 16th–end → the month after (JST, across months and years)", () => {
  assert.equal(plan.startMonthFor(jstAt(2026, 11, 1, 0, 0)), "2026-12");
  assert.equal(plan.startMonthFor(jstAt(2026, 11, 15, 23, 59)), "2026-12");
  assert.equal(plan.startMonthFor(jstAt(2026, 11, 16, 0, 0)), "2027-01");
  assert.equal(plan.startMonthFor(Date.UTC(2026, 10, 15, 15, 0)), "2027-01", "15:00 UTC on the 15th is the 16th in Japan");
  assert.equal(plan.startMonthFor(jstAt(2026, 12, 31, 23, 0)), "2027-02");
  assert.equal(plan.monthStartUnix("2027-01"), Date.UTC(2026, 11, 31, 15, 0) / 1000, "00:00 JST on the 1st");
});

test("changes and skips: by the 25th from next month, after it from the month after", () => {
  assert.equal(plan.firstChangeableMonth(jstAt(2026, 11, 25, 23, 59)), "2026-12");
  assert.equal(plan.firstChangeableMonth(jstAt(2026, 11, 26, 0, 0)), "2027-01");
  assert.equal(plan.firstChangeableMonth(jstAt(2026, 12, 20)), "2027-01");
});

test("shipping dates: 5 / 5·20 / 5·15·25 / 5·12·19·26, moved to the next working day, never earlier, never twice, inside the month", () => {
  assert.deepEqual(plan.shippingDates("2026-11", 1, CALENDAR), ["2026-11-05"]);
  assert.deepEqual(plan.shippingDates("2026-11", 4, CALENDAR), ["2026-11-05", "2026-11-12", "2026-11-19", "2026-11-26"]);
  // 2026-05-05 and -06 are holidays (Tue, Wed) → Thu 7th; 2026-12-05 is a Saturday → Mon 7th; 2026-12-20 Sunday → 21st.
  assert.deepEqual(plan.shippingDates("2026-05", 1, CALENDAR), ["2026-05-07"]);
  assert.deepEqual(plan.shippingDates("2026-12", 2, CALENDAR), ["2026-12-07", "2026-12-21"]);
  // 2026-09-21..23 holidays: the 3rd delivery of a 3-a-month plan stays the 25th (Fri), the 2nd the 15th (Tue).
  assert.deepEqual(plan.shippingDates("2026-09", 3, CALENDAR), ["2026-09-07", "2026-09-15", "2026-09-25"]);
  for (let y = 2026; y <= 2027; y++) for (let m = 1; m <= 12; m++) for (const f of [1, 2, 3, 4]) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const dates = plan.shippingDates(key, f, CALENDAR);
    assert.equal(new Set(dates).size, f, key);
    for (const d of dates) {
      const [yy, mm, dd] = d.split("-").map(Number);
      assert.ok(plan.isWorkingDay(yy, mm, dd, CALENDAR), d);
      assert.ok(dd >= plan.SHIPPING_DAYS[f][dates.indexOf(d)], `${d} never earlier than the base day`);
    }
  }
  // A long closure is refused rather than pushed into the next month.
  const closed = { holidays: new Set(), closures: new Set(Array.from({ length: 10 }, (_, i) => `2026-11-${String(22 + i).padStart(2, "0")}`)) };
  assert.throws(() => plan.shippingDates("2026-11", 4, closed), /NO_SHIPPING_DAY_IN_MONTH/);
});

test("skip and change become Stripe schedule phases set in advance: a skipped month is a trial phase (no charge)", () => {
  const state = { startMonth: "2026-12", frequency: 2, changes: { "2027-03": 4 }, skips: ["2027-02"], cancelFrom: null };
  const { phases, endBehavior } = plan.schedulePhases(state, "2027-01", PRICES);
  assert.equal(endBehavior, "release");
  assert.deepEqual(phases.map((p) => [new Date(p.start_date * 1000).toISOString().slice(0, 10), p.items[0].price, p.trial === true, p.metadata.months]), [
    ["2026-12-31", "price_m2", false, "1"], // January (00:00 JST = 15:00 UTC the day before)
    ["2027-01-31", "price_m2", true, "1"],  // February skipped
    ["2027-02-28", "price_m4", false, "1"], // from March: 4 a month, then released (continues)
  ]);
  assert.ok(phases.every((p) => p.proration_behavior === "none"));
  for (let i = 1; i < phases.length; i++) assert.equal(phases[i].start_date, phases[i - 1].end_date, "no gap, no overlap");
  const cancelled = plan.schedulePhases({ ...state, cancelFrom: "2027-03" }, "2027-01", PRICES);
  assert.equal(cancelled.endBehavior, "cancel");
  assert.equal(cancelled.phases.at(-1).end_date, plan.monthStartUnix("2027-03"));
  assert.throws(() => plan.schedulePhases(state, "2027-01", { 1: "p" }), /PRICE_NOT_CONFIGURED/);
});

test("cancellation: any time; the next charge stops if it is not paid yet; never pushed to the month after next", () => {
  const late = jstAt(2026, 11, 28);
  const paid = plan.cancellationFor(late, { id: "in_nov", status: "paid" });
  assert.deepEqual([paid.action, paid.cancelAt, paid.lastDeliveredMonth, paid.firstUnchargedMonth],
    ["CANCEL_AT_NEXT_MONTH", plan.monthStartUnix("2026-12"), "2026-11", "2026-12"], "on the 28th: December is not charged");
  const retrying = plan.cancellationFor(jstAt(2026, 12, 3), { id: "in_dec", status: "open" });
  assert.deepEqual([retrying.action, retrying.voidInvoice, retrying.lastDeliveredMonth], ["VOID_AND_CANCEL_NOW", "in_dec", null], "unpaid: voided, nothing shipped");
  const initial = plan.cancellationFor(jstAt(2026, 11, 20), null);
  assert.equal(initial.action, "CANCEL_AT_NEXT_MONTH");
  assert.equal(initial.cancelAt, plan.monthStartUnix("2026-12"));
});

// In-memory Firestore with serialized transactions, create-once, merge and where.
function fakeFirestore() {
  const store = new Map();
  let lock = Promise.resolve();
  const snap = (key) => ({ id: key.split("/").pop(), exists: store.has(key), data: () => structuredClone(store.get(key)) });
  const merge = (a, b) => ({ ...(a || {}), ...structuredClone(b) });
  const doc = (name, id) => {
    const key = `${name}/${id}`;
    return { key, get: async () => snap(key), set: async (v, o) => { store.set(key, o?.merge ? merge(store.get(key), v) : structuredClone(v)); },
      create: async (v) => { if (store.has(key)) throw new Error("ALREADY_EXISTS"); store.set(key, structuredClone(v)); } };
  };
  return {
    store,
    collection: (name) => ({
      doc: (id) => doc(name, id),
      where: (f, op, v) => ({ limit: () => ({ get: async () => ({ docs: [...store.keys()].filter((k) => k.startsWith(name + "/")).map(snap).filter((s) => s.data()[f] === v) }) }) }),
    }),
    async runTransaction(cb) {
      const run = lock.then(async () => {
        const writes = [];
        const tx = { get: async (ref) => snap(ref.key),
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

const SUB = "sub_test1";
const meta = { kind: records.KIND, frequency: "2", startMonth: "2026-12" };
const session = (over = {}) => ({ id: "cs_1", mode: "subscription", subscription: SUB, customer: "cus_1", livemode: false,
  customer_details: { email: "Hanako@Example.com", name: "Hanako" }, metadata: { ...meta, preference: "苦味が好きです" },
  collected_information: { shipping_details: { name: "Hanako", address: { postal_code: "248-0006", state: "神奈川県", city: "鎌倉市", line1: "1-1", country: "JP" } } }, ...over });
const invoice = (over = {}) => ({ id: "in_1", customer: "cus_1", livemode: false, billing_reason: "subscription_create", amount_paid: 3000,
  status_transitions: { paid_at: jstAt(2026, 11, 10) / 1000 }, parent: { subscription_details: { subscription: SUB, metadata: meta } },
  lines: { data: [{ type: "subscription", pricing: { price_details: { price: "price_m2" } }, period: { start: plan.monthStartUnix("2026-12"), end: plan.monthStartUnix("2027-01") } }] }, ...over });
const cycle = (month, over = {}) => invoice({ id: `in_${month}`, billing_reason: "subscription_cycle", amount_paid: 5800,
  status_transitions: { paid_at: plan.monthStartUnix(month) + 3600 },
  lines: { data: [{ type: "subscription", pricing: { price_details: { price: "price_m2" } }, period: { start: plan.monthStartUnix(month), end: plan.monthStartUnix(plan.addMonths(month, 1)) } }] }, ...over });
const shipments = (db) => [...db.store.keys()].filter((k) => k.startsWith(records.SHIPMENTS + "/")).sort();
const ev = (type, object) => ({ type, data: { object } });

test("sign-up: the contract and exactly one first delivery, whichever event comes first or how often", async () => {
  for (const order of [["checkout", "invoice"], ["invoice", "checkout"]]) {
    const db = fakeFirestore();
    const send = { checkout: () => records.handleEvent(db, ev("checkout.session.completed", session()), CONFIG),
      invoice: () => records.handleEvent(db, ev("invoice.paid", invoice()), CONFIG) };
    await send[order[0]](); await send[order[1]](); await send.invoice(); await send.checkout();
    await Promise.all([send.invoice(), send.invoice()]);
    assert.deepEqual(shipments(db), [`${records.SHIPMENTS}/${SUB}_first`], order.join(">"));
    const contract = db.store.get(`${records.SUBS}/${SUB}`);
    assert.equal(contract.email, "hanako@example.com");
    assert.equal(contract.frequency, 2);
    assert.equal(contract.startMonth, "2026-12");
    assert.equal(contract.preference.text, "苦味が好きです");
    assert.equal(contract.shipping.prefecture, "神奈川県");
  }
});

test("monthly: deliveries only from a paid invoice, once; a failed month ships nothing until it is paid", async () => {
  const db = fakeFirestore();
  await records.handleEvent(db, ev("checkout.session.completed", session()), CONFIG);
  await records.handleEvent(db, ev("invoice.payment_failed", cycle("2026-12", { amount_paid: 0, attempt_count: 1, next_payment_attempt: plan.monthStartUnix("2026-12") + 86400 })), CONFIG);
  assert.deepEqual(shipments(db), []);
  assert.equal(db.store.get(`${records.MONTHS}/${SUB}_2026-12`).status, "payment_failed");
  assert.equal(db.store.get(`${records.SUBS}/${SUB}`).paymentIssue, true);
  await Promise.all([records.handleEvent(db, ev("invoice.paid", cycle("2026-12")), CONFIG), records.handleEvent(db, ev("invoice.paid", cycle("2026-12")), CONFIG)]);
  assert.deepEqual(shipments(db), [`${records.SHIPMENTS}/${SUB}_2026-12_1`, `${records.SHIPMENTS}/${SUB}_2026-12_2`]);
  assert.deepEqual(shipments(db).map((k) => db.store.get(k).plannedDate), ["2026-12-07", "2026-12-21"]);
  assert.equal(db.store.get(`${records.MONTHS}/${SUB}_2026-12`).status, "paid");
  assert.equal(db.store.get(`${records.SUBS}/${SUB}`).paymentIssue, false);
  // A late failure notice after the payment does not undo it.
  await records.handleEvent(db, ev("invoice.payment_failed", cycle("2026-12", { amount_paid: 0 })), CONFIG);
  assert.equal(db.store.get(`${records.MONTHS}/${SUB}_2026-12`).status, "paid");
});

test("never twice: a second paid invoice for a month, or a charge for a skipped month, makes no deliveries and is flagged", async () => {
  const db = fakeFirestore();
  await records.handleEvent(db, ev("checkout.session.completed", session()), CONFIG);
  await records.handleEvent(db, ev("invoice.paid", cycle("2026-12")), CONFIG);
  const r = await records.handleEvent(db, ev("invoice.paid", cycle("2026-12", { id: "in_dup" })), CONFIG);
  assert.equal(r.review, "SECOND_PAID_INVOICE");
  assert.equal(shipments(db).length, 2);
  assert.equal(db.store.get(`${records.MONTHS}/${SUB}_2026-12`).needsReview, true);
  db.store.set(`${records.SUBS}/${SUB}`, { ...db.store.get(`${records.SUBS}/${SUB}`), skips: ["2027-01"] });
  const skipped = await records.handleEvent(db, ev("invoice.paid", cycle("2027-01")), CONFIG);
  assert.equal(skipped.review, "CHARGED_SKIPPED_MONTH");
  assert.equal(shipments(db).length, 2);
  // A zero invoice (a skipped month as a trial phase) is recorded as not charged and ships nothing.
  const zero = await records.handleEvent(db, ev("invoice.paid", cycle("2027-02", { amount_paid: 0 })), CONFIG);
  assert.equal(zero.shipments, 0);
  assert.equal(db.store.get(`${records.MONTHS}/${SUB}_2027-02`).status, "not_charged");
  // The first invoice at an unexpected amount ships nothing.
  const odd = await records.handleEvent(fakeFirestore(), ev("invoice.paid", invoice({ amount_paid: 3300 })), CONFIG);
  assert.equal(odd.review, "UNEXPECTED_FIRST_AMOUNT");
});

test("only our subscriptions are touched; a preference with personal details is not stored", async () => {
  const db = fakeFirestore();
  assert.deepEqual(await records.handleEvent(db, ev("invoice.paid", invoice({ parent: { subscription_details: { subscription: "sub_old", metadata: { planId: "mame" } } } })), CONFIG), { handled: false });
  assert.deepEqual(await records.handleEvent(db, ev("checkout.session.completed", session({ mode: "payment" })), CONFIG), { handled: false });
  assert.deepEqual(await records.handleEvent(db, ev("payment_intent.succeeded", {}), CONFIG), { handled: false });
  assert.equal(db.store.size, 0);
  await records.handleEvent(db, ev("checkout.session.completed", session({ metadata: { ...meta, preference: "電話 090-1234-5678" } })), CONFIG);
  assert.equal(db.store.get(`${records.SUBS}/${SUB}`).preference.text, "");
  await records.handleEvent(db, ev("customer.subscription.updated", { id: SUB, status: "past_due", metadata: meta, customer: "cus_1", cancel_at: null, items: { data: [{ price: { id: "price_m3" } }] } }), CONFIG);
  assert.equal(db.store.get(`${records.SUBS}/${SUB}`).status, "past_due");
  assert.equal(db.store.get(`${records.SUBS}/${SUB}`).frequencyNow, 3);
});

test("sign-up session: ¥3,000 now, the monthly price from 00:00 JST on the 1st of the start month; off by default", async () => {
  assert.equal(checkout.configFrom({}).enabled, false);
  const env = { COFFEE_SUBSCRIPTION_ENABLED: "true", STRIPE_PRICE_COFFEE_SUB_1: "price_m1", STRIPE_PRICE_COFFEE_SUB_2: "price_m2",
    STRIPE_PRICE_COFFEE_SUB_3: "price_m3", STRIPE_PRICE_COFFEE_SUB_4: "price_m4", STRIPE_PRICE_COFFEE_SUB_FIRST: "price_first" };
  assert.equal(checkout.configFrom({ ...env, COFFEE_SUBSCRIPTION_ENABLED: "TRUE" }).enabled, false);
  assert.equal(checkout.configFrom({ ...env, STRIPE_PRICE_COFFEE_SUB_FIRST: "" }).enabled, false);
  const config = checkout.configFrom(env);
  const calls = [];
  const stripe = { checkout: { sessions: { create: async (params, opts) => { calls.push([params, opts]); return { url: "https://checkout.stripe.test/s" }; } } } };
  const db = fakeFirestore();
  const r = await checkout.createCheckout({ db, stripe, config, input: { frequency: 3, email: "A@example.com", preference: "  深煎りが好き  " }, now: jstAt(2026, 11, 20), idempotencyKey: "coffee-sub-abcdefghijklmnop" });
  assert.deepEqual([r.startMonth, r.firstCharge, r.monthly], ["2027-01", 3000, 8550]);
  const [params, opts] = calls[0];
  assert.deepEqual(params.line_items, [{ price: "price_m3", quantity: 1 }, { price: "price_first", quantity: 1 }]);
  assert.equal(params.subscription_data.trial_end, plan.monthStartUnix("2027-01"));
  assert.deepEqual(params.subscription_data.metadata, { kind: records.KIND, frequency: "3", startMonth: "2027-01" });
  assert.equal(params.metadata.preference, "深煎りが好き");
  assert.deepEqual(params.shipping_address_collection, { allowed_countries: ["JP"] });
  assert.deepEqual(opts, { idempotencyKey: "coffee-sub-abcdefghijklmnop" });
  // One running subscription per email; preferences with personal details are refused; frequency 1–4 only.
  db.store.set(`${records.SUBS}/sub_x`, { email: "a@example.com", status: "active" });
  await assert.rejects(checkout.createCheckout({ db, stripe, config, input: { frequency: 1, email: "a@example.com" }, now: jstAt(2026, 11, 2) }), (e) => e.code === "ALREADY_SUBSCRIBED" && e.status === 409);
  await assert.rejects(checkout.createCheckout({ db: fakeFirestore(), stripe, config, input: { frequency: 1, email: "b@example.com", preference: "hanako@example.com" }, now: 0 }), (e) => e.code === "PREFERENCE_EMAIL");
  await assert.rejects(checkout.createCheckout({ db: fakeFirestore(), stripe, config, input: { frequency: 5, email: "b@example.com" }, now: 0 }), (e) => e.code === "INVALID_FREQUENCY");
  assert.equal(calls.length, 1, "refused before Stripe is called");
});

test("the server's preference rules match the store's", async () => {
  const store = await import(path.join(__dirname, "..", "src", "lib", "subscriptionPreference.js"));
  const samples = ["", "酸味が少なく苦味のある珈琲", "あ".repeat(301), "4242 4242 4242 4242", "hanako@example.com", "090-1234-5678",
    "０９０ー１２３４ー５６７８", "https://x.example", "  a\u0000b\u200Bc\r\n\n\n\nd  ", "深煎りを月に2回、100gずつ"];
  for (const s of samples) {
    assert.deepEqual(serverPref.preferenceIssues(s), store.preferenceIssues(s), JSON.stringify(s));
    assert.equal(serverPref.normalizePreference(s), store.normalizePreference(s));
  }
  assert.equal(serverPref.PREFERENCE_MAX_LENGTH, store.PREFERENCE_MAX_LENGTH);
});

test("wiring: subscription events go to the new handlers; existing order and refund handling unchanged; sign-up route off by default", () => {
  const index = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  assert.match(index, /\} else if \(coffeeSubscription\.EVENT_TYPES\.includes\(event\.type\)\) \{\n\s*await coffeeSubscription\.handleEvent\(db, event, coffeeSubscriptionCheckout\.configFrom\(\)\);/);
  assert.ok(index.indexOf('event.type === "payment_intent.succeeded"') < index.indexOf("coffeeSubscription.EVENT_TYPES.includes"), "existing events first");
  assert.match(index, /app\.post\(coffeeSubscriptionCheckout\.PATH, coffeeSubscriptionCheckout\.createHandler/);
  assert.deepEqual(records.EVENT_TYPES.sort(), ["checkout.session.completed", "customer.subscription.deleted", "customer.subscription.updated", "invoice.paid", "invoice.payment_failed"]);
});
