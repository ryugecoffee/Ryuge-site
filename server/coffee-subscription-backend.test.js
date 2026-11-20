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
const ops = require("./coffee-subscription-stripe");
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
  assert.equal(plan.billingStartUnix("2027-01"), Date.UTC(2027, 0, 1, 0, 0) / 1000, "09:00 JST (00:00 UTC) on the 1st");
  // Stripe counts months in UTC: every boundary must be on the 1st in UTC too, or periods slide after a 30-day month.
  for (let m = 0; m < 24; m++) {
    const key = plan.addMonths("2026-12", m);
    const at = new Date(plan.billingStartUnix(key) * 1000);
    assert.equal(at.getUTCDate(), 1, key);
    assert.equal(plan.monthOf(at.getTime()), key, `${key} is still the same month in Japan`);
  }
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
    ["2027-01-01", "price_m2", false, "1"], // January (09:00 JST = 00:00 UTC on the 1st)
    ["2027-02-01", "price_m2", true, "1"],  // February skipped
    ["2027-03-01", "price_m4", false, "1"], // from March: 4 a month, then released (continues)
  ]);
  assert.ok(phases.every((p) => p.proration_behavior === "none"));
  for (let i = 1; i < phases.length; i++) assert.equal(phases[i].start_date, phases[i - 1].end_date, "no gap, no overlap");
  const cancelled = plan.schedulePhases({ ...state, cancelFrom: "2027-03" }, "2027-01", PRICES);
  assert.equal(cancelled.endBehavior, "cancel");
  assert.equal(cancelled.phases.at(-1).end_date, plan.billingStartUnix("2027-03"));
  assert.throws(() => plan.schedulePhases(state, "2027-01", { 1: "p" }), /PRICE_NOT_CONFIGURED/);
});

test("cancellation: any time; the next charge stops if it is not paid yet; never pushed to the month after next", () => {
  const late = jstAt(2026, 11, 28);
  const paid = plan.cancellationFor(late, { id: "in_nov", status: "paid" });
  assert.deepEqual([paid.action, paid.cancelAt, paid.lastChargedMonth, paid.firstUnchargedMonth],
    ["CANCEL_AT", plan.billingStartUnix("2026-12"), "2026-11", "2026-12"], "on the 28th: December is not charged");
  const retrying = plan.cancellationFor(jstAt(2026, 12, 3), { id: "in_dec", status: "open" });
  assert.deepEqual([retrying.action, retrying.voidInvoice, retrying.firstUnchargedMonth], ["VOID_AND_CANCEL_NOW", "in_dec", "2026-12"], "unpaid: voided, nothing shipped");
  const draft = plan.cancellationFor(jstAt(2026, 12, 1, 9, 30), { id: "in_dec", status: "draft" });
  assert.deepEqual([draft.action, draft.firstUnchargedMonth], ["CANCEL_NOW", "2026-12"], "in the draft hour: ends now, the draft is never charged");
  const early = plan.cancellationFor(jstAt(2026, 12, 1, 8, 59), null);
  assert.deepEqual([early.action, early.cancelAt, early.firstUnchargedMonth], ["CANCEL_AT", plan.billingStartUnix("2026-12"), "2026-12"], "before 09:00 on the 1st: this month is not charged");
  const initial = plan.cancellationFor(jstAt(2026, 11, 20), null);
  assert.deepEqual([initial.action, initial.cancelAt], ["CANCEL_AT", plan.billingStartUnix("2026-12")]);
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
  lines: { data: [{ type: "subscription", pricing: { price_details: { price: "price_m2" } }, period: { start: plan.billingStartUnix("2026-12"), end: plan.billingStartUnix("2027-01") } }] }, ...over });
const cycle = (month, over = {}) => invoice({ id: `in_${month}`, billing_reason: "subscription_cycle", amount_paid: 5800,
  status_transitions: { paid_at: plan.billingStartUnix(month) + 3600 },
  lines: { data: [{ type: "subscription", pricing: { price_details: { price: "price_m2" } }, period: { start: plan.billingStartUnix(month), end: plan.billingStartUnix(plan.addMonths(month, 1)) } }] }, ...over });
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
  await records.handleEvent(db, ev("invoice.payment_failed", cycle("2026-12", { amount_paid: 0, attempt_count: 1, next_payment_attempt: plan.billingStartUnix("2026-12") + 86400 })), CONFIG);
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

test("sign-up session: ¥3,000 now, the monthly price from 09:00 JST on the 1st of the start month; off by default", async () => {
  assert.equal(checkout.configFrom({}).enabled, false);
  const env = { COFFEE_SUBSCRIPTION_ENABLED: "true", STRIPE_PRICE_COFFEE_SUB_1: "price_m1", STRIPE_PRICE_COFFEE_SUB_2: "price_m2",
    STRIPE_PRICE_COFFEE_SUB_3: "price_m3", STRIPE_PRICE_COFFEE_SUB_4: "price_m4", STRIPE_PRICE_COFFEE_SUB_FIRST: "price_first" };
  assert.equal(checkout.configFrom({ ...env, COFFEE_SUBSCRIPTION_ENABLED: "TRUE" }).enabled, false);
  assert.equal(checkout.configFrom({ ...env, STRIPE_PRICE_COFFEE_SUB_FIRST: "" }).enabled, false);
  const config = checkout.configFrom(env);
  const calls = [];
  const stripe = { checkout: { sessions: { create: async (params, opts) => { calls.push([params, opts]); return { id: `cs_${calls.length}`, url: `https://checkout.stripe.test/s${calls.length}`, expires_at: params.expires_at }; } } } };
  const db = fakeFirestore();
  const r = await checkout.createCheckout({ db, stripe, config, input: { frequency: 3, email: "A@example.com", preference: "  深煎りが好き  " }, now: jstAt(2026, 11, 20) });
  assert.deepEqual([r.startMonth, r.firstCharge, r.monthly], ["2027-01", 3000, 8550]);
  const [params, opts] = calls[0];
  assert.deepEqual(params.line_items, [{ price: "price_m3", quantity: 1 }, { price: "price_first", quantity: 1 }]);
  assert.equal(params.subscription_data.trial_end, plan.billingStartUnix("2027-01"));
  assert.deepEqual(params.subscription_data.metadata, { kind: records.KIND, frequency: "3", startMonth: "2027-01" });
  assert.equal(params.metadata.preference, "深煎りが好き");
  assert.deepEqual(params.shipping_address_collection, { allowed_countries: ["JP"] });
  assert.deepEqual(params.phone_number_collection, { enabled: true }, "a phone number for the delivery");
  assert.match(params.custom_text.submit.message, /本日のお支払いは初回200gの3,000円.*2027年1月1日から毎月1日に月額8,550円/, "the terms next to Stripe's pay button");
  assert.equal(params.success_url, "https://ryuge.biz/subscription/manage?started=1");
  assert.match(opts.idempotencyKey, /^coffee-sub-[0-9a-f]{24}$/);
  assert.equal(params.expires_at, jstAt(2026, 11, 20) / 1000 + 30 * 60, "the Checkout page lives 30 minutes");
  // One running subscription per email; preferences with personal details are refused; frequency 1–4 only.
  db.store.set(`${records.SUBS}/sub_x`, { email: "a@example.com", status: "active" });
  await assert.rejects(checkout.createCheckout({ db, stripe, config, input: { frequency: 1, email: "a@example.com" }, now: jstAt(2026, 11, 2) }), (e) => e.code === "ALREADY_SUBSCRIBED" && e.status === 409);
  await assert.rejects(checkout.createCheckout({ db: fakeFirestore(), stripe, config, input: { frequency: 1, email: "b@example.com", preference: "hanako@example.com" }, now: 0 }), (e) => e.code === "PREFERENCE_EMAIL");
  await assert.rejects(checkout.createCheckout({ db: fakeFirestore(), stripe, config, input: { frequency: 5, email: "b@example.com" }, now: 0 }), (e) => e.code === "INVALID_FREQUENCY");
  assert.equal(calls.length, 1, "refused before Stripe is called");
});

test("one sign-up per email: requests at the same moment share one Checkout page; a new page only after it ends", async () => {
  const config = checkout.configFrom({ COFFEE_SUBSCRIPTION_ENABLED: "true", STRIPE_PRICE_COFFEE_SUB_1: "price_m1", STRIPE_PRICE_COFFEE_SUB_2: "price_m2",
    STRIPE_PRICE_COFFEE_SUB_3: "price_m3", STRIPE_PRICE_COFFEE_SUB_4: "price_m4", STRIPE_PRICE_COFFEE_SUB_FIRST: "price_first" });
  let created = 0;
  const stripe = { checkout: { sessions: { create: async (params) => { created += 1; await new Promise((r) => setTimeout(r, 30));
    return { id: `cs_${created}`, url: `https://checkout.stripe.test/s${created}`, expires_at: params.expires_at }; } } } };
  const db = fakeFirestore();
  const now = jstAt(2026, 11, 20);
  // Without a reservation, five requests would all pass the contract search (no contract exists before payment).
  const results = await Promise.all(["a@example.com", "A@example.com ", "a@example.com", "a@EXAMPLE.com", "a@example.com"].map((email) =>
    checkout.createCheckout({ db, stripe, config, input: { frequency: 2, email }, now, waitMs: 2000 })));
  assert.equal(created, 1, "one Checkout page");
  assert.deepEqual(new Set(results.map((r) => r.url)), new Set(["https://checkout.stripe.test/s1"]));
  // Still open 20 minutes later: the same page.
  assert.equal((await checkout.createCheckout({ db, stripe, config, input: { frequency: 1, email: "a@example.com" }, now: now + 20 * 60_000 })).url, "https://checkout.stripe.test/s1");
  // The page expired (event): a new one may be made.
  await records.handleEvent(db, ev("checkout.session.expired", { id: "cs_1", mode: "subscription", customer_email: "a@example.com", metadata: meta }), CONFIG);
  assert.equal((await checkout.createCheckout({ db, stripe, config, input: { frequency: 1, email: "a@example.com" }, now: now + 21 * 60_000 })).url, "https://checkout.stripe.test/s2");
  // Or simply ran out (no event): after 30 minutes a new one may be made.
  assert.equal((await checkout.createCheckout({ db, stripe, config, input: { frequency: 1, email: "a@example.com" }, now: now + 60 * 60_000 })).url, "https://checkout.stripe.test/s3");
  // Once paid, the email belongs to that subscription: no new sign-up while it runs.
  await records.handleEvent(db, ev("checkout.session.completed", session({ id: "cs_3", customer_details: { email: "a@example.com" } })), CONFIG);
  await assert.rejects(checkout.createCheckout({ db, stripe, config, input: { frequency: 1, email: "a@example.com" }, now: now + 61 * 60_000 }), (e) => e.code === "ALREADY_SUBSCRIBED");
  // A Stripe failure frees the reservation.
  const failing = { checkout: { sessions: { create: async () => { throw new Error("stripe down"); } } } };
  await assert.rejects(checkout.createCheckout({ db, stripe: failing, config, input: { frequency: 1, email: "c@example.com" }, now }));
  assert.equal(db.store.get(`${records.EMAILS}/${records.emailKey("c@example.com")}`).status, "released");
});

test("a second subscription for the same email is never shipped to, whichever events come first", async () => {
  const SUB2 = "sub_test2";
  const inv2 = () => invoice({ id: "in_2", parent: { subscription_details: { subscription: SUB2, metadata: meta } }, customer_email: "hanako@example.com" });
  const ses2 = () => session({ id: "cs_2", subscription: SUB2 });
  for (const order of [["c1", "i1", "c2", "i2"], ["i2", "c1", "i1", "c2"], ["i1", "i2", "c2", "c1"]]) {
    const db = fakeFirestore();
    const send = { c1: () => records.handleEvent(db, ev("checkout.session.completed", session()), CONFIG),
      i1: () => records.handleEvent(db, ev("invoice.paid", invoice({ customer_email: "hanako@example.com" })), CONFIG),
      c2: () => records.handleEvent(db, ev("checkout.session.completed", ses2()), CONFIG),
      i2: () => records.handleEvent(db, ev("invoice.paid", inv2()), CONFIG) };
    for (const step of order) await send[step]();
    const first = order.findIndex((x) => x.endsWith("1")) < order.findIndex((x) => x.endsWith("2")) ? SUB : SUB2;
    const second = first === SUB ? SUB2 : SUB;
    assert.deepEqual(shipments(db), [`${records.SHIPMENTS}/${first}_first`], order.join(">"));
    const dup = db.store.get(`${records.SUBS}/${second}`);
    assert.deepEqual([dup.duplicateOf, dup.needsReview, dup.reviewReason], [first, true, "DUPLICATE_SUBSCRIPTION"], order.join(">"));
    // Its monthly charges are not shipped either.
    const r = await records.handleEvent(db, ev("invoice.paid", cycle("2026-12", { parent: { subscription_details: { subscription: second, metadata: meta } } })), CONFIG);
    assert.equal(r.review, "DUPLICATE_SUBSCRIPTION");
    assert.equal(shipments(db).length, 1);
  }
});

test("a skipped month's zero invoice (subscription_update) is not charged; any other paid invoice is flagged, never shipped", async () => {
  const db = fakeFirestore();
  await records.handleEvent(db, ev("checkout.session.completed", session()), CONFIG);
  const zero = await records.handleEvent(db, ev("invoice.paid", cycle("2027-01", { id: "in_skip", billing_reason: "subscription_update", amount_paid: 0 })), CONFIG);
  assert.equal(zero.shipments, 0);
  assert.equal(db.store.get(`${records.MONTHS}/${SUB}_2027-01`).status, "not_charged");
  const odd = await records.handleEvent(db, ev("invoice.paid", cycle("2027-02", { id: "in_odd", billing_reason: "subscription_update", amount_paid: 1200 })), CONFIG);
  assert.equal(odd.review, "UNEXPECTED_INVOICE");
  assert.equal(db.store.get(`${records.SUBS}/${SUB}`).reviewReason, "UNEXPECTED_INVOICE");
  assert.deepEqual(shipments(db), []);
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
  assert.match(index, /\} else if \(coffeeSubscription\.EVENT_TYPES\.includes\(event\.type\)\) \{\n\s*const subscriptionConfig = coffeeSubscriptionCheckout\.configFrom\(\);\n\s*await coffeeSubscription\.handleEvent\(db, event, subscriptionConfig\);/);
  // The confirmation mail comes after the event is recorded, in the same branch (only 珈琲の定期便 sign-ups).
  assert.match(index, /await coffeeSubscription\.handleEvent\(db, event, subscriptionConfig\);[\s\S]{0,200}await coffeeSubscriptionMail\.sendWelcomeIfReady\(\{ db, event,/);
  assert.ok(index.indexOf('event.type === "payment_intent.succeeded"') < index.indexOf("coffeeSubscription.EVENT_TYPES.includes"), "existing events first");
  assert.match(index, /app\.post\(coffeeSubscriptionCheckout\.PATH, coffeeSubscriptionCheckout\.createHandler/);
  assert.deepEqual(records.EVENT_TYPES.sort(), ["checkout.session.completed", "checkout.session.expired", "customer.subscription.deleted", "customer.subscription.updated", "invoice.paid", "invoice.payment_failed"]);
});

test("schedule rebuild: the month being charged and every month before the deadline stay as Stripe has them", () => {
  const B = plan.billingStartUnix;
  const day = (sec) => new Date(sec * 1000).toISOString().slice(0, 10);
  // Signed up 11/10 (December start); on 11/20 January is skipped: the initial trial phase is kept as it is.
  const trialing = [{ start_date: jstAt(2026, 11, 10, 10) / 1000, end_date: B("2026-12"), trial_end: B("2026-12"), items: [{ price: "price_m2", quantity: 1 }] },
    { start_date: B("2026-12"), end_date: B("2027-01"), items: [{ price: { id: "price_m2" }, quantity: 1 }] }];
  const state = { startMonth: "2026-12", frequency: 2, changes: {}, skips: ["2027-01"] };
  const a = ops.buildSchedulePhases({ existingPhases: trialing, state, now: jstAt(2026, 11, 20), priceIds: PRICES });
  assert.deepEqual(a.phases.map((p) => [day(p.start_date), p.items[0].price, !!(p.trial || p.trial_end)]),
    [["2026-11-10", "price_m2", true], ["2026-12-01", "price_m2", false], ["2027-01-01", "price_m2", true], ["2027-02-01", "price_m2", false]]);
  assert.equal(a.endBehavior, "release");
  // On 12/26 (after the deadline), a change for February: December's phase is cut at 1/1, January follows the plan as
  // it was, February changes.
  const active = [{ start_date: B("2026-12"), end_date: B("2027-01"), items: [{ price: "price_m2", quantity: 1 }] }];
  const b = ops.buildSchedulePhases({ existingPhases: active, state: { startMonth: "2026-12", frequency: 2, changes: { "2027-02": 3 }, skips: [] }, now: jstAt(2026, 12, 26), priceIds: PRICES });
  assert.deepEqual(b.phases.map((p) => [day(p.start_date), day(p.end_date), p.items[0].price]),
    [["2026-12-01", "2027-01-01", "price_m2"], ["2027-01-01", "2027-02-01", "price_m2"], ["2027-02-01", "2027-03-01", "price_m3"]]);
  assert.equal(b.fromMonth, "2027-02");
  // A phase that already ended is not sent again; a long current phase is cut at the first changeable month.
  const long = [{ start_date: B("2026-10"), end_date: B("2026-12"), items: [{ price: "price_m1", quantity: 1 }] },
    { start_date: B("2026-12"), end_date: B("2027-06"), items: [{ price: "price_m4", quantity: 1 }] }];
  const c = ops.buildSchedulePhases({ existingPhases: long, state: { startMonth: "2026-10", frequency: 4, changes: {}, skips: ["2027-03"] }, now: jstAt(2026, 12, 10), priceIds: PRICES });
  assert.deepEqual(c.phases.map((p) => [day(p.start_date), day(p.end_date), !!p.trial]),
    [["2026-12-01", "2027-01-01", false], ["2027-01-01", "2027-03-01", false], ["2027-03-01", "2027-04-01", true], ["2027-04-01", "2027-05-01", false]]);
  assert.ok(c.phases.every((p) => p.proration_behavior === "none"));
});

test("a late payment: shipped after it within 3 working days; overlapping or unschedulable deliveries go to review", () => {
  // On time: dates unchanged.
  assert.deepEqual(plan.deliveryPlan("2027-01", 2, "2027-01-01", CALENDAR).deliveries.map((d) => [d.plannedDate, d.paidLate]), [["2027-01-05", false], ["2027-01-20", false]]);
  // Paid on Sat 1/9: the 1/5 delivery goes from Tue 1/12 (Mon 1/11 is a holiday), by Thu 1/14; 1/20 as planned.
  const one = plan.deliveryPlan("2027-01", 2, "2027-01-09", CALENDAR);
  assert.equal(one.review, null);
  assert.deepEqual(one.deliveries.map((d) => [d.originalDate, d.plannedDate, d.shipBy || null]), [["2027-01-05", "2027-01-12", "2027-01-14"], ["2027-01-20", "2027-01-20", null]]);
  // Paid on 12/18: the late 12/7 delivery would reach the 12/21 one → review, not planned.
  const crowd = plan.deliveryPlan("2026-12", 2, "2026-12-18", CALENDAR);
  assert.equal(crowd.review, "LATE_DELIVERIES_OVERLAP");
  assert.deepEqual(crowd.deliveries.map((d) => d.plannedDate), [null, "2026-12-21"]);
  // Two deliveries already late → review.
  assert.equal(plan.deliveryPlan("2027-01", 4, "2027-01-14", CALENDAR).review, "LATE_DELIVERIES_OVERLAP");
  // A shop closed for weeks → cannot be scheduled → review.
  const closed = { holidays: new Set(), closures: new Set(Array.from({ length: 70 }, (_, i) => new Date(Date.UTC(2027, 0, 8 + i)).toISOString().slice(0, 10))) };
  assert.equal(plan.deliveryPlan("2027-01", 1, "2027-01-07", { ...closed, closures: new Set([...closed.closures].filter((d) => d !== "2027-01-05")) }).review, "LATE_DELIVERY_UNSCHEDULABLE");
  assert.equal(plan.workingDayAfter("2026-12-30", 1, CALENDAR), "2026-12-31");
  assert.equal(plan.workingDayAfter("2026-12-31", 1, CALENDAR), "2027-01-04", "1/1 is a holiday, 1/2–3 a weekend");
});

test("records: a late month's deliveries follow the plan; a crowded one is held for review; the end reason is kept", async () => {
  const db = fakeFirestore();
  await records.handleEvent(db, ev("checkout.session.completed", session()), CONFIG);
  await records.handleEvent(db, ev("invoice.paid", cycle("2026-12", { status_transitions: { paid_at: jstAt(2026, 12, 18, 15) / 1000 } })), CONFIG);
  const dec = shipments(db).map((k) => db.store.get(k)).filter((x) => x.month === "2026-12");
  assert.deepEqual(dec.map((x) => [x.originalDate, x.status, x.plannedDate]), [["2026-12-07", "needs_review", null], ["2026-12-21", "planned", "2026-12-21"]]);
  assert.equal(db.store.get(`${records.MONTHS}/${SUB}_2026-12`).reviewReason, "LATE_DELIVERIES_OVERLAP");
  // Replayed: nothing new.
  await records.handleEvent(db, ev("invoice.paid", cycle("2026-12", { status_transitions: { paid_at: jstAt(2026, 12, 18, 15) / 1000 } })), CONFIG);
  assert.equal(shipments(db).filter((k) => k.includes("2026-12")).length, 2);
  // The first delivery carries its ship-by date (3 working days after the sign-up payment).
  await records.handleEvent(db, ev("invoice.paid", invoice({ status_transitions: { paid_at: jstAt(2026, 11, 20, 10) / 1000 } })), CONFIG);
  assert.equal(db.store.get(`${records.SHIPMENTS}/${SUB}_first`).shipBy, "2026-11-26", "Mon 11/23 is a holiday");
  await records.handleEvent(db, ev("customer.subscription.deleted", { id: SUB, status: "canceled", metadata: meta, customer: "cus_1", canceled_at: jstAt(2026, 12, 20) / 1000,
    cancellation_details: { reason: "payment_failed" }, items: { data: [{ price: { id: "price_m2" } }] } }), CONFIG);
  assert.deepEqual([db.store.get(`${records.SUBS}/${SUB}`).status, db.store.get(`${records.SUBS}/${SUB}`).endedReason], ["canceled", "payment_failed"]);
});

test("contention: an ABORTED transaction (nothing written) is run again here; other errors and the last attempt are not hidden", async () => {
  let calls = 0;
  const aborted = Object.assign(new Error("10 ABORTED: Transaction lock timeout."), { code: 10 });
  assert.equal(await records.retryOnContention(async () => { calls += 1; if (calls < 3) throw aborted; return "ok"; }, { pauseMs: 1 }), "ok");
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(records.retryOnContention(async () => { calls += 1; throw aborted; }, { pauseMs: 1 }), /ABORTED/);
  assert.equal(calls, 4, "gives up after four attempts (the webhook then answers 500)");
  calls = 0;
  await assert.rejects(records.retryOnContention(async () => { calls += 1; throw Object.assign(new Error("exists"), { code: 6 }); }, { pauseMs: 1 }), /exists/);
  assert.equal(calls, 1, "ALREADY_EXISTS and every other error are never retried");
  calls = 0;
  const closed = Object.assign(new Error("3 INVALID_ARGUMENT: Transaction is invalid or closed."), { code: 3 });
  assert.equal(await records.retryOnContention(async () => { calls += 1; if (calls < 2) throw closed; return "ok"; }, { pauseMs: 1 }), "ok");
  calls = 0;
  await assert.rejects(records.retryOnContention(async () => { calls += 1; throw Object.assign(new Error("3 INVALID_ARGUMENT: bad field"), { code: 3 }); }, { pauseMs: 1 }));
  assert.equal(calls, 1, "other INVALID_ARGUMENT errors are bugs, not contention");
});

test("email cancellation words: a fully stopped month and a month partly shipped before the shop acted never contradict", () => {
  const ec = require("./coffee-subscription-email-cancel");
  const none = ec.monthRefundText({ month: "2026-12", amount: 5800, shippedBefore: 0 });
  assert.match(none, /5,800円）は.*全額.*この月の発送は行いません。$/);
  const one = ec.monthRefundText({ month: "2026-12", amount: 5800, shippedBefore: 1 });
  assert.match(one, /全額をお支払いのカードへ返金します.*すでに発送した1回分はそのままお受け取りください（お支払い・返品は不要です）。まだ発送していない分は発送しません。$/);
  assert.doesNotMatch(one, /この月の発送は行いません/);
  // From the registered address only with all three sender checks (From address, SPF/DKIM/DMARC PASS, DKIM domain = From domain).
  const at = Date.UTC(2026, 11, 2);
  const base = { email: "a@example.com", method: "registered_address", receivedAt: "2026-12-01T08:00:00+09:00" };
  const ok = { fromAddressMatches: true, spfDkimDmarcPass: true, dkimDomainAligned: true };
  assert.equal(ec.parse({ ...base, senderCheck: ok }, at).method, "registered_address");
  assert.throws(() => ec.parse(base, at), { code: "SENDER_CHECK_REQUIRED" });
  for (const k of Object.keys(ok)) assert.throws(() => ec.parse({ ...base, senderCheck: { ...ok, [k]: false } }, at), { code: "SENDER_CHECK_REQUIRED" }, k);
  assert.throws(() => ec.parse({ ...base, senderCheck: { ...ok, dkimDomainAligned: "true" } }, at), { code: "SENDER_CHECK_REQUIRED" });
  assert.throws(() => ec.parse({ ...base, senderAuthenticated: true }, at), { code: "SENDER_CHECK_REQUIRED" }, "the old single check is not enough");
  // The details check needs none of them.
  assert.equal(ec.parse({ ...base, method: "details", postalCode: "100-0001", phoneLast4: "5678" }, at).method, "details");
});
