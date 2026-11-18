"use strict";

// 珈琲の定期便: verification against Stripe TEST mode and the local Firestore emulator. Run by hand, never in CI:
//   STRIPE_SECRET_KEY=<test-mode key> npx --yes firebase-tools@13.35.1 emulators:exec --only firestore \
//     --project demo-ryuge-inventory "node server/coffee-subscription-stripe-e2e.js"
// The key needs, in test mode: Subscriptions, Test clocks, Customers, PaymentMethods, Products, Prices,
// Checkout Sessions and Invoices (write), and Events (read).
// Safety: refuses a live-mode key or account and a non-local Firestore. Everything it makes in Stripe is on test clocks
// named "coffee-sub-e2e …" and is deleted with them at the end (a deleted test clock takes its customers,
// subscriptions and invoices along); its test products and prices (lookup keys coffee_sub_e2e_*) are reused by later
// runs. Stripe events are read through the Events API and given to the same handler as the webhook
// (coffee-subscription-records.js handleEvent); signatures are the webhook's own job and are not involved.
// Subscriptions are created with exactly the parameters the sign-up builds (createCheckout's subscription data), because
// a Checkout page cannot be paid without a browser; the Checkout session itself is created for real and its amount
// due today is checked.

const crypto = require("crypto");
const Stripe = require("stripe");
const admin = require("firebase-admin");
const plan = require("./coffee-subscription-plan");
const records = require("./coffee-subscription-records");
const checkout = require("./coffee-subscription-checkout");
const ops = require("./coffee-subscription-stripe");
const { CALENDAR } = require("./coffee-subscription-calendar");

const KEY = String(process.env.STRIPE_SECRET_KEY || "");
if (!/^(sk|rk)_test_/.test(KEY)) { console.error("REFUSING: STRIPE_SECRET_KEY must be a test-mode key"); process.exit(2); }
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(String(process.env.FIRESTORE_EMULATOR_HOST || ""))) { console.error("REFUSING: run under the Firestore emulator"); process.exit(2); }

const stripe = Stripe(KEY, { httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 2 });
const TAG = "coffee-sub-e2e";
const RUN = crypto.randomBytes(3).toString("hex");
const appOf = (name) => admin.initializeApp({ projectId: "demo-ryuge-inventory" }, `${name}-${RUN}`);
const db = admin.firestore(appOf("e2e"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jst = (y, m, d, h = 12, min = 0) => Date.UTC(y, m - 1, d, h - 9, min);
const fmt = (sec) => (sec ? new Date(sec * 1000 + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ") + " JST" : "-");

const results = [];
const twins = []; // subscriptions whose owner depends on event order (scenario E backstop)
function check(item, name, ok, detail = "") {
  results.push({ item, name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} [${item}] ${name}${detail ? " — " + detail : ""}`);
}

// ---- Stripe setup ---------------------------------------------------------------------------------------------
async function ensurePrices() {
  const keys = { 1: "coffee_sub_e2e_1", 2: "coffee_sub_e2e_2", 3: "coffee_sub_e2e_3", 4: "coffee_sub_e2e_4", first: "coffee_sub_e2e_first" };
  const found = await stripe.prices.list({ lookup_keys: Object.values(keys), limit: 10 });
  const byKey = Object.fromEntries(found.data.map((p) => [p.lookup_key, p.id]));
  let product = null;
  for (const [n, key] of Object.entries(keys)) {
    if (byKey[key]) continue;
    product ||= await stripe.products.create({ name: "TEST 珈琲の定期便 (e2e)", metadata: { tag: TAG } });
    const monthly = n !== "first";
    byKey[key] = (await stripe.prices.create({ product: product.id, currency: "jpy", lookup_key: key, metadata: { tag: TAG },
      unit_amount: monthly ? plan.MONTHLY_PRICES[n] : plan.FIRST_DELIVERY_PRICE, ...(monthly ? { recurring: { interval: "month" } } : {}) })).id;
  }
  return { enabled: true, priceIds: { 1: byKey[keys[1]], 2: byKey[keys[2]], 3: byKey[keys[3]], 4: byKey[keys[4]] }, firstPriceId: byKey[keys.first],
    siteUrl: "https://example.com", calendar: CALENDAR };
}

const clocks = [];
async function newClock(atMs, name) {
  const clock = await stripe.testHelpers.testClocks.create({ frozen_time: Math.floor(atMs / 1000), name: `${TAG} ${RUN} ${name}` });
  clocks.push(clock.id);
  return clock;
}
async function advance(clock, atMs) {
  await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: Math.floor(atMs / 1000) });
  for (let i = 0; i < 150; i++) {
    const c = await stripe.testHelpers.testClocks.retrieve(clock.id);
    if (c.status === "ready") return c;
    if (c.status === "internal_failure") throw new Error("test clock failed");
    await sleep(2000);
  }
  throw new Error("test clock did not finish");
}

// ---- Events → the webhook handler -------------------------------------------------------------------------------
const TYPES = records.EVENT_TYPES;
const delivered = []; // every event given to the handler, for the replay checks
const seen = new Set();
const watched = new Set(); // customer and Checkout session ids of this run
let pumping = Promise.resolve();
const pump = (config) => (pumping = pumping.then(() => pumpOnce(config), () => pumpOnce(config)));
async function pumpOnce(config) {
  const fresh = [];
  for await (const ev of stripe.events.list({ types: TYPES, limit: 100, created: { gte: Math.floor(jst(2026, 11, 1) / 1000) } })) {
    if (seen.has(ev.id)) continue;
    const o = ev.data.object;
    const owner = typeof o.customer === "string" ? o.customer : o.customer?.id;
    if (!watched.has(owner) && !watched.has(o.id)) continue;
    seen.add(ev.id);
    fresh.push(ev);
  }
  fresh.sort((a, b) => a.created - b.created);
  for (const ev of fresh) { delivered.push(ev); await records.handleEvent(db, ev, config); }
  return fresh.length;
}
async function settle(config) { await sleep(2500); await pump(config); await sleep(1500); await pump(config); }

// Sign-up exactly as the store does it (createCheckout's parameters), paid with a test card on a test clock.
async function signUp(config, clock, { frequency, email, pm = "pm_card_visa", reuseParams = null }) {
  let params = reuseParams;
  const capture = { checkout: { sessions: { create: async (p) => { params = p; return { id: `cs_capture_${crypto.randomBytes(4).toString("hex")}`, url: "about:blank", expires_at: p.expires_at }; } } } };
  if (!params) await checkout.createCheckout({ db, stripe: capture, config, input: { frequency, email, preference: "深煎りが好き" }, now: clock.frozen_time * 1000 });
  const customer = await stripe.customers.create({ test_clock: clock.id, email, metadata: { tag: TAG } });
  watched.add(customer.id);
  const method = await stripe.paymentMethods.attach(pm, { customer: customer.id });
  await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: method.id } });
  const [monthly, first] = params.line_items;
  const sub = await stripe.subscriptions.create({ customer: customer.id, items: [monthly], add_invoice_items: [first],
    trial_end: params.subscription_data.trial_end, trial_settings: params.subscription_data.trial_settings, metadata: params.subscription_data.metadata });
  // The Checkout page's completion, with what Checkout would report (shipping address, preference).
  const session = { id: `cs_e2e_${sub.id}`, object: "checkout.session", mode: "subscription", subscription: sub.id, customer: customer.id, livemode: false,
    customer_email: email, customer_details: { email, name: "テスト 花子" }, metadata: params.metadata,
    collected_information: { shipping_details: { name: "テスト 花子", address: { postal_code: "248-0006", state: "神奈川県", city: "鎌倉市", line1: "1-1", country: "JP" } } } };
  const ev = { id: `evt_e2e_${sub.id}`, type: "checkout.session.completed", created: clock.frozen_time, data: { object: session } };
  delivered.push(ev);
  await records.handleEvent(db, ev, config);
  return { sub, customer, params };
}

const shipmentsOf = async (subId) => (await db.collection(records.SHIPMENTS).where("subscriptionId", "==", subId).get()).docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.id.localeCompare(b.id));
const monthOf = async (subId, month) => (await db.collection(records.MONTHS).doc(`${subId}_${month}`).get()).data() || null;
const contractOf = async (subId) => (await db.collection(records.SUBS).doc(subId).get()).data() || null;
async function invoicesOf(subId) { return (await stripe.invoices.list({ subscription: subId, limit: 20 })).data.reverse(); }
const cycleFor = (invoices, month) => invoices.filter((i) => (i.lines.data || []).some((l) => l.period?.start && plan.monthOf(l.period.start * 1000) === month) && i.billing_reason !== "subscription_create");
const paidTotal = (invoices) => invoices.reduce((s, i) => s + (i.status === "paid" ? i.amount_paid : 0), 0);
const prorations = (invoices) => invoices.flatMap((i) => i.lines.data).filter((l) => l.parent?.subscription_item_details?.proration || l.proration).length;

// ---- Scenario A: first payment, month start (1st–15th), skip, change, concurrent changes, cancel ---------------
async function scenarioA(config) {
  const clock = await newClock(jst(2026, 11, 10, 10), "A");
  const a1 = await signUp(config, clock, { frequency: 2, email: `a1-${RUN}@example.com` });
  const a2 = await signUp(config, clock, { frequency: 1, email: `a2-${RUN}@example.com` });
  const a3 = await signUp(config, clock, { frequency: 2, email: `a3-${RUN}@example.com` });
  await settle(config);
  for (const [label, x, monthly] of [["A1", a1, 5800], ["A2", a2, 3000], ["A3", a3, 5800]]) {
    const inv = await invoicesOf(x.sub.id);
    const s = await stripe.subscriptions.retrieve(x.sub.id);
    check(1, `${label}: sign-up charges ¥3,000 only (monthly ¥${monthly} not yet)`, paidTotal(inv) === 3000 && inv.length === 1 && inv[0].billing_reason === "subscription_create",
      inv.map((i) => `${i.billing_reason}:${i.status}:${i.amount_paid}`).join(","));
    check(2, `${label}: signed up on the 10th → monthly from 2026-12-01 09:00 JST`, s.status === "trialing" && s.trial_end === plan.billingStartUnix("2026-12"), `${s.status} trial_end ${fmt(s.trial_end)}`);
    const sh = await shipmentsOf(x.sub.id);
    check(1, `${label}: one first delivery (200 g) from the paid sign-up`, sh.length === 1 && sh[0].kind === "first", sh.map((x) => x.id).join(","));
  }

  // Nov 20: A2 skips January; A3 goes to 4 a month from January.
  await advance(clock, jst(2026, 11, 20, 12));
  await ops.requestPlanChange({ db, stripe, subscriptionId: a2.sub.id, request: { skip: "2027-01" }, config, now: jst(2026, 11, 20, 12) });
  await ops.requestPlanChange({ db, stripe, subscriptionId: a3.sub.id, request: { frequency: 4, from: "2027-01" }, config, now: jst(2026, 11, 20, 12) });
  // Nov 26: after the 25th, December can no longer be skipped.
  await advance(clock, jst(2026, 11, 26, 0, 1));
  const late = await ops.requestPlanChange({ db, stripe, subscriptionId: a2.sub.id, request: { skip: "2026-12" }, config, now: jst(2026, 11, 26, 0, 1) }).catch((e) => e);
  check(3, "A2: skipping December on the 26th is refused (deadline: the 25th)", late?.code === "CHANGE_DEADLINE_PASSED", late?.code || "accepted");

  // Dec 1: 08:59 nothing yet; 10:30 everyone charged for December at the December price.
  await advance(clock, jst(2026, 12, 1, 8, 59));
  const before = (await invoicesOf(a1.sub.id)).filter((i) => i.billing_reason === "subscription_cycle");
  check(2, "A1: no monthly invoice before 09:00 JST on 12/1", before.length === 0, `${before.length}`);
  await advance(clock, jst(2026, 12, 1, 10, 30));
  await settle(config);
  for (const [label, x, amount, n] of [["A1", a1, 5800, 2], ["A2", a2, 3000, 1], ["A3", a3, 5800, 2]]) {
    const dec = cycleFor(await invoicesOf(x.sub.id), "2026-12");
    const line = dec[0]?.lines.data[0];
    check(2, `${label}: December charged ¥${amount} on 12/1 09:00 JST (period 12/1→1/1)`, dec.length === 1 && dec[0].status === "paid" && dec[0].amount_paid === amount
      && line.period.start === plan.billingStartUnix("2026-12") && line.period.end === plan.billingStartUnix("2027-01"),
      dec.map((i) => `${i.status}:${i.amount_paid} ${fmt(i.lines.data[0].period.start)}→${fmt(i.lines.data[0].period.end)}`).join(","));
    const sh = (await shipmentsOf(x.sub.id)).filter((s) => s.month === "2026-12");
    check(2, `${label}: ${n} December deliveries from the paid invoice`, sh.length === n, sh.map((s) => s.plannedDate).join(","));
  }

  // Dec 10: two changes for A3 at the same moment (skip March; 1 a month from April): both end up in Stripe.
  await advance(clock, jst(2026, 12, 10, 12));
  const now10 = jst(2026, 12, 10, 12);
  await Promise.all([
    ops.requestPlanChange({ db, stripe, subscriptionId: a3.sub.id, request: { skip: "2027-03" }, config, now: now10 }),
    ops.requestPlanChange({ db, stripe, subscriptionId: a3.sub.id, request: { frequency: 1, from: "2027-04" }, config, now: now10 }),
  ]);
  const c3 = await contractOf(a3.sub.id);
  const sched = await stripe.subscriptionSchedules.retrieve((await stripe.subscriptions.retrieve(a3.sub.id)).schedule);
  const shape = sched.phases.filter((p) => p.end_date > now10 / 1000).map((p) => `${plan.monthOf(p.start_date * 1000)}:${Object.entries(config.priceIds).find(([, id]) => id === (p.items[0].price.id || p.items[0].price))?.[0]}${p.trial_end === p.end_date ? "(skip)" : ""}`);
  check(8, "A3: two changes at the same moment are both applied (plan version and Stripe schedule agree)",
    c3.appliedPlanVersion === c3.planVersion && shape.join(" ") === "2026-12:2 2027-01:4 2027-03:4(skip) 2027-04:1", `${shape.join(" ")} v${c3.planVersion}/${c3.appliedPlanVersion}`);

  // Jan 1: A2 skipped (no charge, no delivery); A3 at 4 a month, no pro-rating; A1 as usual.
  await advance(clock, jst(2027, 1, 1, 10, 30));
  await settle(config);
  const a2jan = cycleFor(await invoicesOf(a2.sub.id), "2027-01");
  check(3, "A2: skipped January — Stripe charged nothing", a2jan.length === 1 && a2jan[0].amount_paid === 0 && a2jan[0].amount_due === 0,
    a2jan.map((i) => `${i.billing_reason}:${i.status}:${i.amount_due}`).join(","));
  check(3, "A2: skipped January — no deliveries; month recorded as not charged",
    (await shipmentsOf(a2.sub.id)).every((s) => s.month !== "2027-01") && (await monthOf(a2.sub.id, "2027-01"))?.status === "not_charged", (await monthOf(a2.sub.id, "2027-01"))?.status);
  const a3inv = await invoicesOf(a3.sub.id);
  const a3jan = cycleFor(a3inv, "2027-01");
  check(4, "A3: January charged at the new price ¥11,200, no pro-rating anywhere", a3jan.length === 1 && a3jan[0].amount_paid === 11200 && prorations(a3inv) === 0,
    `${a3jan.map((i) => i.amount_paid)} prorations=${prorations(a3inv)}`);
  check(4, "A3: four January deliveries", (await shipmentsOf(a3.sub.id)).filter((s) => s.month === "2027-01").length === 4);

  // Jan 10: A1 cancels a paid month → January deliveries stay, nothing charged from February.
  await advance(clock, jst(2027, 1, 10, 12));
  const cancelA1 = await ops.cancelSubscription({ db, stripe, subscriptionId: a1.sub.id, now: jst(2027, 1, 10, 12) });
  check(5, "A1: cancel on 1/10 (January paid) → ends 2/1 09:00 JST", cancelA1.action === "CANCEL_AT" && cancelA1.cancelAt === plan.billingStartUnix("2027-02"), `${cancelA1.action} ${fmt(cancelA1.cancelAt)}`);

  // Feb 1: A2 charged again; A3 4 a month; A1 ended without a charge.
  await advance(clock, jst(2027, 2, 1, 10, 30));
  await settle(config);
  check(3, "A2: February charged again after the skipped month (¥3,000)", cycleFor(await invoicesOf(a2.sub.id), "2027-02").map((i) => i.amount_paid).join() === "3000");
  const a1inv = await invoicesOf(a1.sub.id);
  const a1sub = await stripe.subscriptions.retrieve(a1.sub.id);
  check(5, "A1: no charge after the cancellation; subscription ended", cycleFor(a1inv, "2027-02").length === 0 && a1sub.status === "canceled",
    `${a1sub.status} invoices=${a1inv.map((i) => `${i.billing_reason}:${i.amount_paid}`).join(",")}`);
  check(5, "A1: January deliveries kept (paid month)", (await shipmentsOf(a1.sub.id)).filter((s) => s.month === "2027-01").length === 2);

  // Feb 10: A2 (with a schedule) cancels → the schedule is released, nothing charged in March.
  await advance(clock, jst(2027, 2, 10, 12));
  await ops.cancelSubscription({ db, stripe, subscriptionId: a2.sub.id, now: jst(2027, 2, 10, 12) });
  await advance(clock, jst(2027, 3, 1, 10, 30));
  await settle(config);
  const a2sub = await stripe.subscriptions.retrieve(a2.sub.id);
  check(5, "A2: cancelled with a schedule → no March charge, ended", cycleFor(await invoicesOf(a2.sub.id), "2027-03").length === 0 && a2sub.status === "canceled", a2sub.status);
  check(8, "A3: March skipped as set on 12/10 (no charge)", cycleFor(await invoicesOf(a3.sub.id), "2027-03").every((i) => i.amount_paid === 0));
  await advance(clock, jst(2027, 4, 1, 10, 30));
  await settle(config);
  const apr = cycleFor(await invoicesOf(a3.sub.id), "2027-04");
  check(8, "A3: April at 1 a month (¥3,000) as set on 12/10; periods still on the 1st", apr.length === 1 && apr[0].amount_paid === 3000 && apr[0].lines.data[0].period.start === plan.billingStartUnix("2027-04"),
    apr.map((i) => `${i.amount_paid} ${fmt(i.lines.data[0].period.start)}`).join());
  check(4, "A3: no pro-rating through Dec→Apr (2→4→skip→1)", prorations(await invoicesOf(a3.sub.id)) === 0);
}

// ---- Scenario B: sign-up on the 16th–end, cancel before the first delivery, payment failure and recovery --------
async function scenarioB(config) {
  const clock = await newClock(jst(2026, 11, 20, 10), "B");
  const b1 = await signUp(config, clock, { frequency: 3, email: `b1-${RUN}@example.com` });
  const b2 = await signUp(config, clock, { frequency: 2, email: `b2-${RUN}@example.com` });
  const b3 = await signUp(config, clock, { frequency: 2, email: `b3-${RUN}@example.com` });
  await settle(config);
  const s1 = await stripe.subscriptions.retrieve(b1.sub.id);
  check(2, "B1: signed up on the 20th → monthly from 2027-01-01 09:00 JST", s1.trial_end === plan.billingStartUnix("2027-01"), fmt(s1.trial_end));

  // Nov 22: B2 cancels before the first 200 g is shipped → ends before any monthly charge; ¥3,000 refund proposed.
  await advance(clock, jst(2026, 11, 22, 12));
  const c2 = await ops.cancelSubscription({ db, stripe, subscriptionId: b2.sub.id, now: jst(2026, 11, 22, 12) });
  const k2 = await contractOf(b2.sub.id);
  const first2 = (await shipmentsOf(b2.sub.id)).find((s) => s.kind === "first");
  check(5, "B2: cancel before the first shipment → first delivery stopped, ¥3,000 refund proposed for CEO approval",
    c2.refundProposal?.amount === 3000 && k2.refundProposal?.status === "awaiting_ceo_approval" && first2?.status === "cancelled_before_shipping", `${first2?.status} ${k2.refundProposal?.status}`);
  const pi2 = await stripe.paymentIntents.list({ customer: b2.customer.id, limit: 10 });
  const refunds = pi2.data.length ? (await stripe.refunds.list({ payment_intent: pi2.data[0].id, limit: 5 })).data.length : -1;
  check(5, "B2: nothing refunded automatically", refunds === 0 && pi2.data.length === 1 && pi2.data[0].amount_received === 3000, `${pi2.data.length} payment(s), ${refunds} refund(s)`);

  // Dec 20: B3's card starts failing.
  await advance(clock, jst(2026, 12, 20, 12));
  const failing = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", { customer: b3.customer.id });
  await stripe.customers.update(b3.customer.id, { invoice_settings: { default_payment_method: failing.id } });

  // Jan 1: B1 charged for January (3 a month); B2 ended without a charge; B3 fails.
  await advance(clock, jst(2027, 1, 1, 10, 30));
  await settle(config);
  const jan1 = cycleFor(await invoicesOf(b1.sub.id), "2027-01");
  check(2, "B1: January charged ¥8,550 on 1/1 09:00 JST", jan1.length === 1 && jan1[0].amount_paid === 8550 && jan1[0].lines.data[0].period.start === plan.billingStartUnix("2027-01"));
  check(2, "B1: three January deliveries on working days", (await shipmentsOf(b1.sub.id)).filter((s) => s.month === "2027-01").map((s) => s.plannedDate).join() === plan.shippingDates("2027-01", 3, CALENDAR).join(),
    (await shipmentsOf(b1.sub.id)).filter((s) => s.month === "2027-01").map((s) => s.plannedDate).join());
  const b2inv = await invoicesOf(b2.sub.id);
  check(5, "B2: no monthly charge at all after cancelling in the initial period", paidTotal(b2inv) === 3000 && (await stripe.subscriptions.retrieve(b2.sub.id)).status === "canceled",
    b2inv.map((i) => `${i.billing_reason}:${i.amount_paid}`).join(","));
  const b3jan = cycleFor(await invoicesOf(b3.sub.id), "2027-01")[0];
  check(6, "B3: January payment failed → no deliveries; month recorded as payment_failed",
    b3jan?.status === "open" && (await shipmentsOf(b3.sub.id)).every((s) => s.month !== "2027-01") && (await monthOf(b3.sub.id, "2027-01"))?.status === "payment_failed",
    `${b3jan?.status} attempts=${b3jan?.attempt_count} next=${fmt(b3jan?.next_payment_attempt)}`);

  // Retries: still nothing shipped while unpaid.
  await advance(clock, jst(2027, 1, 9, 12));
  await settle(config);
  const retried = await stripe.invoices.retrieve(b3jan.id);
  check(6, "B3: after Stripe's retries (1/9) still unpaid → still no deliveries", retried.status !== "paid" && (await shipmentsOf(b3.sub.id)).every((s) => s.month !== "2027-01"),
    `status=${retried.status} attempts=${retried.attempt_count} next=${fmt(retried.next_payment_attempt)} sub=${(await stripe.subscriptions.retrieve(b3.sub.id)).status}`);

  // The customer fixes the card and the invoice is paid: January is shipped once.
  const good = await stripe.paymentMethods.attach("pm_card_visa", { customer: b3.customer.id });
  await stripe.customers.update(b3.customer.id, { invoice_settings: { default_payment_method: good.id } });
  await stripe.invoices.pay(b3jan.id, { payment_method: good.id });
  await settle(config);
  const b3sh = (await shipmentsOf(b3.sub.id)).filter((s) => s.month === "2027-01");
  check(6, "B3: paid late → January deliveries created once; month paid", b3sh.length === 2 && (await monthOf(b3.sub.id, "2027-01"))?.status === "paid",
    b3sh.map((s) => `${s.plannedDate}${s.paidLate ? "(late)" : ""}`).join(","));
}

// ---- Scenario C: a card that always fails → what Stripe does in the end; nothing shipped -------------------------
async function scenarioC(config) {
  const clock = await newClock(jst(2026, 11, 3, 10), "C");
  const c1 = await signUp(config, clock, { frequency: 1, email: `c1-${RUN}@example.com` });
  await settle(config);
  const failing = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", { customer: c1.customer.id });
  await stripe.customers.update(c1.customer.id, { invoice_settings: { default_payment_method: failing.id } });
  const trail = [];
  for (const at of [jst(2026, 12, 1, 10, 30), jst(2026, 12, 10, 12), jst(2026, 12, 20, 12), jst(2027, 1, 1, 10, 30), jst(2027, 1, 15, 12)]) {
    await advance(clock, at);
    await settle(config);
    const sub = await stripe.subscriptions.retrieve(c1.sub.id);
    const inv = await invoicesOf(c1.sub.id);
    trail.push(`${fmt(at / 1000).slice(0, 10)} sub=${sub.status} ${inv.filter((i) => i.billing_reason === "subscription_cycle").map((i) => `${plan.monthOf(i.lines.data[0].period.start * 1000)}:${i.status}/${i.attempt_count}`).join(" ")}`);
  }
  const monthly = (await shipmentsOf(c1.sub.id)).filter((s) => s.kind === "monthly");
  check(6, "C1: card always failing → no monthly delivery at any point", monthly.length === 0, trail.join(" | "));
  const k = await contractOf(c1.sub.id);
  check(6, "C1: the contract shows the payment problem", k.paymentIssue === true || ["canceled", "unpaid", "past_due"].includes(k.status), `paymentIssue=${k.paymentIssue} status=${k.status}`);
}

// ---- Scenario D: the 1st of the month — cancel just before 09:00, cancel and skip in the draft hour -----------------
async function scenarioD(config) {
  const clock = await newClock(jst(2026, 11, 3, 10), "D");
  const d1 = await signUp(config, clock, { frequency: 2, email: `d1-${RUN}@example.com` });
  const d2 = await signUp(config, clock, { frequency: 2, email: `d2-${RUN}@example.com` });
  const d3 = await signUp(config, clock, { frequency: 2, email: `d3-${RUN}@example.com` });
  await settle(config);
  await advance(clock, jst(2026, 12, 1, 8, 59));
  const c1 = await ops.cancelSubscription({ db, stripe, subscriptionId: d1.sub.id, now: jst(2026, 12, 1, 8, 59) });
  check(8, "D1: cancel at 12/1 08:59 → ends at 09:00, before December is charged", c1.action === "CANCEL_AT" && c1.cancelAt === plan.billingStartUnix("2026-12"), `${c1.action} ${fmt(c1.cancelAt)}`);
  await advance(clock, jst(2026, 12, 1, 9, 30));
  const draft = cycleFor(await invoicesOf(d2.sub.id), "2026-12")[0];
  const c2 = await ops.cancelSubscription({ db, stripe, subscriptionId: d2.sub.id, now: jst(2026, 12, 1, 9, 30) });
  check(8, "D2: cancel at 09:30 while December is a draft → ends now", draft?.status === "draft" && c2.action === "CANCEL_NOW", `${draft?.status} ${c2.action}`);
  await ops.requestPlanChange({ db, stripe, subscriptionId: d3.sub.id, request: { skip: "2027-01" }, config, now: jst(2026, 12, 1, 9, 30) });
  await advance(clock, jst(2026, 12, 1, 13));
  await settle(config);
  const d1dec = cycleFor(await invoicesOf(d1.sub.id), "2026-12");
  check(8, "D1: nothing charged for December", d1dec.every((i) => i.amount_paid === 0) && (await stripe.subscriptions.retrieve(d1.sub.id)).status === "canceled",
    d1dec.map((i) => `${i.status}:${i.amount_paid}`).join(",") || "no invoice");
  const d2dec = await stripe.invoices.retrieve(draft.id);
  check(8, "D2: the December draft was never charged", d2dec.amount_paid === 0 && d2dec.status !== "paid", `${d2dec.status} paid=${d2dec.amount_paid}`);
  check(8, "D1/D2: no December deliveries", [...await shipmentsOf(d1.sub.id), ...await shipmentsOf(d2.sub.id)].every((s) => s.kind === "first"));
  const d3dec = cycleFor(await invoicesOf(d3.sub.id), "2026-12");
  check(8, "D3: a skip asked in the draft hour leaves December's charge as it was (¥5,800, 2 deliveries)",
    d3dec.length === 1 && d3dec[0].amount_paid === 5800 && (await shipmentsOf(d3.sub.id)).filter((s) => s.month === "2026-12").length === 2);
  await advance(clock, jst(2027, 1, 1, 10, 30));
  await settle(config);
  const d3jan = cycleFor(await invoicesOf(d3.sub.id), "2027-01");
  check(8, "D3: …and January is skipped (no charge, no delivery)", d3jan.every((i) => i.amount_paid === 0) && (await shipmentsOf(d3.sub.id)).every((s) => s.month !== "2027-01"));
}

// ---- Scenario E: one sign-up per email (reservation) and the duplicate backstop with real Stripe events ---------
async function scenarioE(config) {
  const email = `e-${RUN}@example.com`;
  let created = 0;
  const counting = { checkout: { sessions: { create: (...a) => { created += 1; return stripe.checkout.sessions.create(...a); } } } };
  const before = await db.collection(records.SUBS).where("email", "==", email).get();
  const out = await Promise.all(Array.from({ length: 5 }, () => checkout.createCheckout({ db, stripe: counting, config, input: { frequency: 2, email }, now: Date.now() })));
  check("dup", "5 sign-ups at once for one email → one Checkout page (search alone would have let all 5 through: no contract exists before payment)",
    created === 1 && new Set(out.map((o) => o.url)).size === 1 && before.size === 0, `sessions created=${created}, contracts before payment=${before.size}`);
  const sessionId = (await db.collection(records.EMAILS).doc(records.emailKey(email)).get()).data().sessionId;
  watched.add(sessionId);
  const live = await stripe.checkout.sessions.retrieve(sessionId);
  check(1, "Checkout page asks ¥3,000 today (first 200 g; monthly ¥0 until the start month)", live.amount_total === 3000 && live.mode === "subscription",
    `amount_total=${live.amount_total}`);
  await stripe.checkout.sessions.expire(sessionId);
  await settle(config);
  const again = await checkout.createCheckout({ db, stripe: counting, config, input: { frequency: 2, email }, now: Date.now() });
  check("dup", "after the page expires (checkout.session.expired), a new sign-up gets a new page", created === 2 && again.url !== out[0].url);
  const second = (await db.collection(records.EMAILS).doc(records.emailKey(email)).get()).data().sessionId;
  watched.add(second);
  await stripe.checkout.sessions.expire(second);

  // Backstop: two subscriptions for one email reach Stripe anyway (e.g. made outside the store).
  const clock = await newClock(jst(2026, 11, 5, 10), "E");
  const twin = `twin-${RUN}@example.com`;
  const e1 = await signUp(config, clock, { frequency: 1, email: twin });
  const blocked = await checkout.createCheckout({ db, stripe: counting, config, input: { frequency: 1, email: twin }, now: clock.frozen_time * 1000 }).catch((e) => e);
  check("dup", "a new sign-up for an email with a running subscription is refused (409)", blocked?.code === "ALREADY_SUBSCRIBED", blocked?.code);
  // Made outside the store (the reservation bypassed), with the same parameters:
  const e2 = await signUp(config, clock, { frequency: 1, email: twin, reuseParams: e1.params });
  twins.push(e1.sub.id, e2.sub.id);
  await settle(config);
  const k2 = await contractOf(e2.sub.id);
  check("dup", "a second subscription for the same email: flagged, no first delivery",
    k2.duplicateOf === e1.sub.id && k2.reviewReason === "DUPLICATE_SUBSCRIPTION" && (await shipmentsOf(e2.sub.id)).length === 0 && (await shipmentsOf(e1.sub.id)).length === 1,
    `duplicateOf=${k2.duplicateOf}`);
  await advance(clock, jst(2026, 12, 1, 10, 30));
  await settle(config);
  check("dup", "…and no monthly deliveries for it either", (await shipmentsOf(e2.sub.id)).length === 0 && (await shipmentsOf(e1.sub.id)).filter((s) => s.month === "2026-12").length === 1);
}

// ---- Item 7: webhooks again, at once, and in reverse order ---------------------------------------------------
async function snapshot(store) {
  const out = {};
  for (const name of [records.SHIPMENTS, records.MONTHS]) {
    for (const d of (await store.collection(name).get()).docs) {
      if (!d.id.includes("_")) continue;
      const v = d.data();
      out[`${name}/${d.id}`] = name === records.SHIPMENTS ? `${v.kind}:${v.month}:${v.plannedDate}:${v.invoiceId}` : `${v.status}:${v.invoiceId}`;
    }
  }
  return out;
}
async function inBatches(items, size, fn) {
  const errors = [];
  for (let i = 0; i < items.length; i += size) {
    for (const r of await Promise.allSettled(items.slice(i, i + size).map(fn))) if (r.status === "rejected") errors.push(r.reason?.message);
  }
  return errors;
}
async function replayChecks(config) {
  const before = await snapshot(db);
  const shuffled = [...delivered, ...delivered].sort(() => Math.random() - 0.5);
  const errors = await inBatches(shuffled, 12, (ev) => records.handleEvent(db, ev, config));
  const after = await snapshot(db);
  const changed = Object.keys({ ...before, ...after }).filter((k) => before[k] !== after[k]);
  check(7, `every Stripe event (${delivered.length}) delivered twice more, 12 at a time, in random order → nothing changes`, changed.length === 0 && errors.length === 0,
    `changed=${changed.slice(0, 5).join(", ")} errors=${errors.slice(0, 2).join(" | ")}`);
  // A fresh database receiving the same events in reverse order, each twice: the same deliveries.
  const fresh = admin.firestore(appOf("e2e-reverse"));
  for (const ev of [...delivered].reverse()) { await records.handleEvent(fresh, ev, config); await records.handleEvent(fresh, ev, config); }
  const freshSnap = await snapshot(fresh);
  const orderFree = (k) => k.startsWith(records.SHIPMENTS) && !twins.some((t) => k.includes(t));
  const a = Object.keys(before).filter(orderFree);
  const b = Object.keys(freshSnap).filter(orderFree);
  const missing = a.filter((k) => !b.includes(k));
  const extra = b.filter((k) => !a.includes(k));
  check(7, "the same events in reverse order (each twice) into an empty database → the same deliveries, none extra", missing.length === 0 && extra.length === 0,
    `deliveries=${a.length} missing=${missing.slice(0, 3)} extra=${extra.slice(0, 3)}`);
  if (twins.length) {
    const owners = twins.filter((t) => Object.keys(freshSnap).some((k) => k.startsWith(records.SHIPMENTS) && k.includes(t)));
    check(7, "reverse order with two subscriptions for one email: still only one of them is shipped to", owners.length === 1, `shipped: ${owners.join(",")}`);
  }
}

async function cleanup() {
  if (process.env.KEEP_TEST_CLOCKS === "1") { console.log("test clocks kept:", clocks.join(", ")); return; }
  for (const id of clocks) await stripe.testHelpers.testClocks.del(id).catch((e) => console.log("could not delete", id, e.message));
  console.log(`deleted ${clocks.length} test clocks (with their customers, subscriptions and invoices)`);
}

(async () => {
  const balance = await stripe.balance.retrieve();
  if (balance.livemode !== false) throw new Error("REFUSING: live mode");
  const config = await ensurePrices();
  const started = Date.now();
  try {
    // Separate test clocks, run side by side.
    const outcomes = await Promise.allSettled([scenarioA(config), scenarioB(config), scenarioC(config), scenarioD(config), scenarioE(config)]);
    outcomes.forEach((o, i) => { if (o.status === "rejected") check("run", `scenario ${"ABCDE"[i]} finished`, false, o.reason?.stack?.split("\n").slice(0, 3).join(" | ")); });
    await settle(config);
    await replayChecks(config);
  } finally {
    await cleanup();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed in ${Math.round((Date.now() - started) / 1000)} s (run ${RUN})`);
  if (process.env.E2E_REPORT) require("fs").writeFileSync(process.env.E2E_REPORT, JSON.stringify({ run: RUN, results }, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
