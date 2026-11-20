"use strict";

// 珈琲の定期便 ②: the customer's page over real HTTP (express), with an in-memory Firestore, a Stripe stand-in and a
// mail stand-in (no mail is ever sent).
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const plan = require("./coffee-subscription-plan");
const records = require("./coffee-subscription-records");
const account = require("./coffee-subscription-account");

const ENV = { COFFEE_SUBSCRIPTION_MANAGE_ENABLED: "true", STRIPE_PRICE_COFFEE_SUB_1: "price_m1", STRIPE_PRICE_COFFEE_SUB_2: "price_m2",
  STRIPE_PRICE_COFFEE_SUB_3: "price_m3", STRIPE_PRICE_COFFEE_SUB_4: "price_m4", STRIPE_PRICE_COFFEE_SUB_FIRST: "price_first",
  STRIPE_PORTAL_CONFIGURATION_ID: "bpc_test123", SITE_URL: "https://ryuge.test" };
const jstAt = (y, m, d, h = 12, min = 0) => Date.UTC(y, m - 1, d, h - 9, min);

function fakeFirestore() {
  const store = new Map();
  let lock = Promise.resolve();
  let auto = 0;
  const snap = (key) => ({ id: key.split("/").pop(), exists: store.has(key), data: () => structuredClone(store.get(key)) });
  const merge = (a, b) => ({ ...(a || {}), ...structuredClone(b) });
  const doc = (name, id) => {
    const key = `${name}/${id}`;
    return { key, get: async () => snap(key), set: async (v, o) => { store.set(key, o?.merge ? merge(store.get(key), v) : structuredClone(v)); },
      create: async (v) => { if (store.has(key)) throw new Error("ALREADY_EXISTS"); store.set(key, structuredClone(v)); },
      update: async (v) => { if (!store.has(key)) throw new Error("NOT_FOUND"); store.set(key, merge(store.get(key), v)); },
      delete: async () => { store.delete(key); } };
  };
  const query = (name, f, v) => ({ get: async () => ({ docs: [...store.keys()].filter((k) => k.startsWith(name + "/")).map(snap).filter((s) => s.data()[f] === v) }) });
  return {
    store,
    collection: (name) => ({ doc: (id) => doc(name, id), add: async (v) => { auto += 1; store.set(`${name}/auto${auto}`, structuredClone(v)); },
      where: (f, op, v) => ({ ...query(name, f, v), limit: () => query(name, f, v) }) }),
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

// Stripe stand-in: one subscription per contract, schedules, invoices, customers, portal.
function fakeStripe() {
  const calls = [];
  const subs = new Map();
  const schedules = new Map();
  const customerStore = new Map();
  const invoiceStore = [];
  const log = (name, ...args) => calls.push([name, structuredClone(args)]);
  return {
    calls, subs, customerStore, invoiceStore,
    subscriptions: {
      retrieve: async (id) => structuredClone(subs.get(id)),
      update: async (id, p) => { log("subscriptions.update", id, p); Object.assign(subs.get(id), p); return subs.get(id); },
      cancel: async (id) => { log("subscriptions.cancel", id); subs.get(id).status = "canceled"; return subs.get(id); },
    },
    subscriptionSchedules: {
      create: async ({ from_subscription }) => { log("schedules.create", from_subscription); const id = `sub_sched_${from_subscription}`;
        const s = subs.get(from_subscription);
        schedules.set(id, { id, phases: [{ start_date: s.start, end_date: s.trial_end, trial_end: s.trial_end, items: [{ price: s.price, quantity: 1 }] }] });
        s.schedule = id; return schedules.get(id); },
      retrieve: async (id) => structuredClone(schedules.get(id)),
      update: async (id, p) => { log("schedules.update", id, p); schedules.get(id).phases = p.phases; return schedules.get(id); },
      release: async (id) => { log("schedules.release", id); for (const s of subs.values()) if (s.schedule === id) s.schedule = null; },
    },
    invoices: { list: async ({ subscription }) => ({ data: invoiceStore.filter((i) => i.subscription === subscription) }),
      voidInvoice: async (id) => { log("invoices.void", id); } },
    customers: { update: async (id, p) => { log("customers.update", id, p); await new Promise((r) => setTimeout(r, 5)); customerStore.set(id, { ...(customerStore.get(id) || {}), ...structuredClone(p) }); return customerStore.get(id); } },
    billingPortal: { sessions: { create: async (p) => { log("portal.create", p); return { url: `https://billing.stripe.test/p/${p.customer}` }; } } },
  };
}

async function setup({ env = ENV, now = jstAt(2026, 11, 20) } = {}) {
  const db = fakeFirestore();
  const stripe = fakeStripe();
  const mails = [];
  const clock = { now };
  const app = express();
  app.use(express.json());
  app.use(account.PATH, account.createRouter({ getDb: () => db, getStripe: () => stripe, sendMail: async (m) => { mails.push(m); }, env, clock: () => clock.now,
    log: { error: () => {}, warn: () => {} } }));
  const server = await new Promise((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}${account.PATH}`;
  const call = async (method, path, body, token) => {
    const res = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  // A contract as the sign-up leaves it (signed up 11/10, December start, 2 a month).
  const contract = (sub, email, over = {}) => {
    db.store.set(`${records.SUBS}/${sub}`, { email, customerId: `cus_${sub}`, status: "trialing", frequency: 2, startMonth: "2026-12", skips: [], changes: {},
      planVersion: 0, ownerChecked: true, duplicateOf: null, preference: { text: "深煎りが好き" },
      shipping: { name: "テスト 花子", postalCode: "248-0006", prefecture: "神奈川県", city: "鎌倉市", line1: "1-1", line2: "", phone: "0467000000", country: "JP" }, ...over });
    db.store.set(`${records.EMAILS}/${records.emailKey(email)}`, { status: "active", subscriptionId: sub });
    stripe.subs.set(sub, { id: sub, status: "trialing", start: jstAt(2026, 11, 10) / 1000, trial_end: plan.billingStartUnix("2026-12"), price: "price_m2", schedule: null, cancel_at: null });
    db.store.set(`${records.SHIPMENTS}/${sub}_first`, { subscriptionId: sub, kind: "first", status: "planned", invoiceId: `in_first_${sub}` });
  };
  const signIn = async (email) => {
    const before = mails.length;
    await call("POST", "/login", { email });
    const link = mails.slice(before).find((m) => m.to === email)?.text.match(/#login=([A-Za-z0-9_-]+)/)?.[1];
    const r = await call("POST", "/session", { token: link });
    return r.body.sessionToken;
  };
  return { db, stripe, mails, clock, call, contract, signIn, close: () => { server.closeAllConnections(); server.close(); } };
}

const rid = (n) => `req-${String(n).padStart(4, "0")}-${Math.random().toString(16).slice(2, 14)}`;

test("off by default: every route is 404 without its own switch (independent of sign-ups) or without prices", async () => {
  for (const env of [{}, { ...ENV, COFFEE_SUBSCRIPTION_MANAGE_ENABLED: "TRUE" }, { ...ENV, STRIPE_PRICE_COFFEE_SUB_4: "" }, { ...ENV, COFFEE_SUBSCRIPTION_MANAGE_ENABLED: undefined, COFFEE_SUBSCRIPTION_ENABLED: "true" }]) {
    const t = await setup({ env });
    for (const [m, p] of [["POST", "/login"], ["POST", "/session"], ["GET", "/me"], ["POST", "/plan"], ["PUT", "/address"], ["POST", "/portal"], ["GET", "/cancel"]]) {
      assert.equal((await t.call(m, p, m === "GET" ? null : {})).status, 404, `${m} ${p}`);
    }
    assert.equal(t.mails.length, 0);
    t.close();
  }
});

test("sign-in: same answer for unknown emails, a 15-minute single-use link, a 30-minute session, limits per email and connection", async () => {
  const t = await setup();
  t.contract("sub_a", "a@example.com");
  assert.deepEqual((await t.call("POST", "/login", { email: "nobody@example.com" })).body, { ok: true });
  assert.equal(t.mails.length, 0, "no mail for an unknown email, same answer");
  assert.deepEqual((await t.call("POST", "/login", { email: " A@Example.com " })).body, { ok: true });
  assert.equal(t.mails.length, 1);
  assert.match(t.mails[0].text, /^https:\/\/ryuge\.test\/subscription\/manage#login=[A-Za-z0-9_-]{43}$/m);
  assert.equal(t.mails[0].to, "a@example.com");
  const token = t.mails[0].text.match(/#login=([A-Za-z0-9_-]+)/)[1];
  assert.ok(![...t.db.store.keys()].some((k) => k.includes(token)), "only the link's hash is stored");
  const s = await t.call("POST", "/session", { token });
  assert.equal(s.status, 200);
  assert.equal((await t.call("POST", "/session", { token })).body.error, "LOGIN_LINK_USED", "usable once");
  assert.equal((await t.call("GET", "/me", null, s.body.sessionToken)).status, 200);
  // Expiry: a link after 15 minutes, a session after 30.
  await t.call("POST", "/login", { email: "a@example.com" });
  const late = t.mails[1].text.match(/#login=([A-Za-z0-9_-]+)/)[1];
  t.clock.now += 15 * 60 * 1000 + 1;
  assert.equal((await t.call("POST", "/session", { token: late })).body.error, "LOGIN_LINK_EXPIRED");
  t.clock.now += 15 * 60 * 1000;
  assert.equal((await t.call("GET", "/me", null, s.body.sessionToken)).body.error, "SESSION_EXPIRED");
  assert.equal((await t.call("GET", "/me", null, "x".repeat(43))).status, 401);
  assert.equal((await t.call("GET", "/me")).body.error, "SIGN_IN_REQUIRED");
  // Per email: 3 mails per 15 minutes, then the same answer and no mail.
  const before = t.mails.length;
  for (let i = 0; i < 4; i++) assert.deepEqual((await t.call("POST", "/login", { email: "a@example.com" })).body, { ok: true });
  assert.equal(t.mails.length - before, 3);
  // Per connection: 10 sign-in requests per 15 minutes.
  let limited = 0;
  for (let i = 0; i < 6; i++) if ((await t.call("POST", "/login", { email: `x${i}@example.com` })).status === 429) limited += 1;
  assert.ok(limited > 0, "connection limit");
  t.close();
});

test("only one's own contract: the session is checked against the email's owner on every request; body ids are ignored", async () => {
  const t = await setup();
  t.contract("sub_a", "a@example.com");
  t.contract("sub_b", "b@example.com");
  const a = await t.signIn("a@example.com");
  const r = await t.call("POST", "/plan", { action: "skip", month: "2027-01", requestId: rid(1), subscriptionId: "sub_b" }, a);
  assert.equal(r.status, 200);
  assert.deepEqual(t.db.store.get(`${records.SUBS}/sub_a`).skips, ["2027-01"]);
  assert.deepEqual(t.db.store.get(`${records.SUBS}/sub_b`).skips, [], "the other contract is untouched");
  // The email no longer owns sub_a (e.g. a new owner after the end): the session stops working.
  t.db.store.set(`${records.EMAILS}/${records.emailKey("a@example.com")}`, { status: "active", subscriptionId: "sub_other" });
  assert.equal((await t.call("GET", "/me", null, a)).body.error, "SESSION_EXPIRED");
  t.close();
});

test("plan: skip, unskip, frequency from a changeable month; the deadline; one request id applied once; changes at the same moment", async () => {
  const t = await setup();
  t.contract("sub_a", "a@example.com");
  const a = await t.signIn("a@example.com");
  const me = (await t.call("GET", "/me", null, a)).body;
  assert.equal(me.firstChangeableMonth, "2026-12");
  assert.equal(me.changeDeadline, "2026-11-25");
  assert.deepEqual(me.months.slice(0, 2).map((m) => [m.month, m.amount, m.shippingDates.length, m.changeable]), [["2026-12", 5800, 2, true], ["2027-01", 5800, 2, true]]);
  const id = rid(2);
  const first = await t.call("POST", "/plan", { action: "skip", month: "2027-01", requestId: id }, a);
  const again = await t.call("POST", "/plan", { action: "skip", month: "2027-01", requestId: id }, a);
  assert.deepEqual([first.status, again.status, again.body.repeated], [200, 200, true]);
  assert.equal(t.stripe.calls.filter(([n]) => n === "schedules.update").length, 1, "applied once");
  assert.equal(t.mails.filter((m) => m.subject.includes("変更")).length, 1, "one confirmation mail");
  assert.equal((await t.call("POST", "/plan", { action: "unskip", month: "2027-01", requestId: id }, a)).body.error, "REQUEST_ID_REUSED");
  // Two different changes at the same moment: both kept.
  await Promise.all([
    t.call("POST", "/plan", { action: "frequency", month: "2027-02", frequency: 4, requestId: rid(3) }, a),
    t.call("POST", "/plan", { action: "skip", month: "2027-03", requestId: rid(4) }, a),
  ]);
  const c = t.db.store.get(`${records.SUBS}/sub_a`);
  assert.deepEqual([c.skips, c.changes, c.planVersion, c.appliedPlanVersion], [["2027-01", "2027-03"], { "2027-02": 4 }, 3, 3]);
  const phases = t.stripe.calls.filter(([n]) => n === "schedules.update").at(-1)[1][1].phases;
  assert.ok(phases.every((p) => p.proration_behavior === "none"));
  assert.equal((await t.call("POST", "/plan", { action: "unskip", month: "2027-03", requestId: rid(5) }, a)).status, 200);
  assert.deepEqual(t.db.store.get(`${records.SUBS}/sub_a`).skips, ["2027-01"]);
  // After the 25th, December can no longer change; nor a month never skipped be unskipped.
  t.clock.now = jstAt(2026, 11, 26, 0, 1);
  const a2 = await t.signIn("a@example.com");
  assert.equal((await t.call("POST", "/plan", { action: "skip", month: "2026-12", requestId: rid(6) }, a2)).body.error, "CHANGE_DEADLINE_PASSED");
  assert.equal((await t.call("POST", "/plan", { action: "unskip", month: "2027-05", requestId: rid(7) }, a2)).body.error, "NOT_SKIPPED");
  assert.equal((await t.call("POST", "/plan", { action: "frequency", month: "2027-02", frequency: 5, requestId: rid(8) }, a2)).body.error, "INVALID_FREQUENCY");
  assert.equal((await t.call("POST", "/plan", { action: "skip", month: "2027-02" }, a2)).body.error, "REQUEST_ID_REQUIRED");
  t.close();
});

test("preference: saved after the same checks as the store; personal details refused", async () => {
  const t = await setup();
  t.contract("sub_a", "a@example.com");
  const a = await t.signIn("a@example.com");
  assert.equal((await t.call("PUT", "/preference", { text: "  酸味は控えめに ", requestId: rid(1) }, a)).status, 200);
  assert.equal(t.db.store.get(`${records.SUBS}/sub_a`).preference.text, "酸味は控えめに");
  assert.equal((await t.call("PUT", "/preference", { text: "電話は090-1234-5678", requestId: rid(2) }, a)).body.error, "PREFERENCE_PHONE");
  assert.equal((await t.call("PUT", "/preference", { text: "あ".repeat(301), requestId: rid(3) }, a)).body.error, "PREFERENCE_TOO_LONG");
  t.close();
});

test("address: validated; Firestore and the Stripe customer end the same, even for two changes at once; fixed deliveries untouched", async () => {
  const t = await setup();
  t.contract("sub_a", "a@example.com");
  t.db.store.set(`${records.SHIPMENTS}/sub_a_2026-11_1`, { subscriptionId: "sub_a", status: "shipped" });
  const a = await t.signIn("a@example.com");
  const addr = (city) => ({ name: "山田 太郎", postalCode: "１００－０００１", prefecture: "東京都", city, line1: "千代田1-1", line2: "", phone: "03-1234-5678" });
  for (const [bad, code] of [[{ postalCode: "123" }, "ADDRESS_POSTAL_CODE"], [{ prefecture: "東京" }, "ADDRESS_PREFECTURE"], [{ phone: "12345" }, "ADDRESS_PHONE"], [{ name: "" }, "ADDRESS_NAME"]]) {
    assert.equal((await t.call("PUT", "/address", { address: { ...addr("千代田区"), ...bad }, requestId: rid(1) }, a)).body.error, code);
  }
  const ok = await t.call("PUT", "/address", { address: addr("千代田区"), requestId: rid(2) }, a);
  assert.equal(ok.status, 200);
  assert.deepEqual([ok.body.appliesTo, ok.body.unchanged], [1, 1], "the planned first delivery follows; the shipped one does not");
  const c = t.db.store.get(`${records.SUBS}/sub_a`);
  assert.deepEqual([c.shipping.postalCode, c.shipping.phone, c.shippingPending], ["100-0001", "0312345678", null]);
  // Two changes at the same moment: whichever is recorded last is what both Firestore and Stripe hold.
  await Promise.all([t.call("PUT", "/address", { address: addr("港区"), requestId: rid(3) }, a), t.call("PUT", "/address", { address: addr("中央区"), requestId: rid(4) }, a)]);
  const after = t.db.store.get(`${records.SUBS}/sub_a`);
  const stripeCustomer = t.stripe.customerStore.get("cus_sub_a");
  assert.equal(after.shippingPending, null);
  assert.equal(stripeCustomer.shipping.address.city, after.shipping.city, "Stripe and Firestore agree");
  assert.equal(stripeCustomer.metadata.coffeeShippingVersion, String(after.shippingSyncedVersion));
  assert.deepEqual(t.db.store.get(`${records.SHIPMENTS}/sub_a_2026-11_1`), { subscriptionId: "sub_a", status: "shipped" }, "a shipped delivery is never changed");
  t.close();
});

test("cancel: preview first, confirmed with its key; a changed situation is shown again; the first-delivery refund only proposed", async () => {
  const t = await setup({ env: { ...ENV, SHOP_STAFF_EMAILS: "shop@example.test, second@example.test" } });
  t.contract("sub_a", "a@example.com");
  const a = await t.signIn("a@example.com");
  const preview = (await t.call("GET", "/cancel", null, a)).body;
  assert.deepEqual([preview.action, preview.endsAt, preview.firstNotShipped, preview.refundProposalAmount, preview.lastPaidMonth],
    ["CANCEL_AT", plan.billingStartUnix("2026-12") * 1000, true, 3000, null], "before any monthly charge: no paid month to mention");
  assert.equal((await t.call("POST", "/cancel", { key: "CANCEL_AT|1|x|2026-12", requestId: rid(1) }, a)).body.error, "CANCEL_CHANGED");
  assert.equal(t.stripe.calls.filter(([n]) => n.startsWith("subscriptions.")).length, 0, "nothing done on a stale preview");
  const id = rid(2);
  const done = await t.call("POST", "/cancel", { key: preview.key, requestId: id }, a);
  assert.deepEqual([done.status, done.body.refundProposal], [200, { amount: 3000, status: "awaiting_ceo_approval" }]);
  assert.equal((await t.call("POST", "/cancel", { key: preview.key, requestId: id }, a)).body.repeated, true);
  assert.equal(t.stripe.calls.filter(([n]) => n === "subscriptions.update").length, 1);
  assert.ok(!t.stripe.calls.some(([n]) => n.includes("refund")), "no refund call");
  // The customer is told the refund (full, within 7 business days); the shop is told at once, once, without personal details.
  const customer = t.mails.filter((m) => m.to === "a@example.com" && /解約を受け付けました/.test(m.subject));
  assert.equal(customer.length, 1);
  assert.match(customer[0].text, /2026年12月以降のご請求はありません/);
  assert.match(customer[0].text, /初回分3,000円を全額、お支払いのカードへ返金します（7営業日以内に手続きします）/);
  const shop = t.mails.filter((m) => /返金の確認/.test(m.subject));
  assert.equal(shop.length, 1, "one notice, the repeated request sends none");
  assert.equal(shop[0].to, "shop@example.test, second@example.test");
  assert.match(shop[0].text, /契約番号：SUB-[A-Z0-9]+/);
  assert.match(shop[0].text, /自動では返金されません/);
  assert.doesNotMatch(shop[0].text, /a@example\.com|example\.com/, "no customer details in the shop notice");
  assert.equal((await t.call("POST", "/plan", { action: "skip", month: "2027-01", requestId: rid(3) }, a)).body.error, "SUBSCRIPTION_ENDING");
  assert.ok((await t.call("GET", "/me", null, a)).body.cancellation.refundProposal);
  t.close();
});

test("card and invoices: Stripe's portal with the limited configuration; unavailable without it", async () => {
  const t = await setup();
  t.contract("sub_a", "a@example.com");
  const a = await t.signIn("a@example.com");
  // As Stripe Checkout leaves it: the subscription has its own card.
  t.stripe.subs.get("sub_a").default_payment_method = "pm_checkout_card";
  const r = await t.call("POST", "/portal", {}, a);
  assert.equal(r.body.url, "https://billing.stripe.test/p/cus_sub_a");
  const order = t.stripe.calls.map(([n]) => n).filter((n) => ["customers.update", "subscriptions.update", "portal.create"].includes(n));
  assert.deepEqual(order, ["customers.update", "subscriptions.update", "portal.create"], "card moved to the customer first, then the portal");
  assert.deepEqual(t.stripe.calls.find(([n]) => n === "customers.update")[1][1], { invoice_settings: { default_payment_method: "pm_checkout_card" } });
  assert.deepEqual(t.stripe.calls.find(([n]) => n === "subscriptions.update")[1][1], { default_payment_method: "" });
  // Opened again: nothing left to move.
  t.stripe.subs.get("sub_a").default_payment_method = null;
  await t.call("POST", "/portal", {}, a);
  assert.equal(t.stripe.calls.filter(([n]) => n === "subscriptions.update").length, 1);
  const [, [params]] = t.stripe.calls.find(([n]) => n === "portal.create");
  assert.deepEqual([params.configuration, params.customer, params.return_url], ["bpc_test123", "cus_sub_a", "https://ryuge.test/subscription/manage"]);
  t.close();
  const t2 = await setup({ env: { ...ENV, STRIPE_PORTAL_CONFIGURATION_ID: "" } });
  t2.contract("sub_a", "a@example.com");
  assert.equal((await t2.call("POST", "/portal", {}, await t2.signIn("a@example.com"))).body.error, "PORTAL_NOT_CONFIGURED");
  t2.close();
  assert.deepEqual(account.PORTAL_CONFIGURATION.features, { payment_method_update: { enabled: true }, invoice_history: { enabled: true },
    customer_update: { enabled: false }, subscription_cancel: { enabled: false }, subscription_update: { enabled: false } });
});

test("wiring: the account routes come after CORS and JSON; sign-up route too; mails use the shop's mail account", () => {
  const index = require("fs").readFileSync(require("path").join(__dirname, "index.js"), "utf8");
  const cors = index.indexOf("app.use(cors());");
  assert.ok(cors > index.indexOf("app.use(express.json());"));
  assert.ok(index.indexOf("app.post(coffeeSubscriptionCheckout.PATH") > cors);
  assert.ok(index.indexOf("app.use(coffeeSubscriptionAccount.PATH") > cors);
  assert.match(index, /sendMail: \(message\) => transporter\.sendMail\(\{ from: `"Ryuge Coffee" <\$\{process\.env\.EMAIL_USER\}>`, \.\.\.message \}\)/);
});

test("the store's pages say what the server does: prices, shipping days, start month, an answer for every refusal", async () => {
  const path = require("path");
  const fs = require("fs");
  const lib = await import(path.join(__dirname, "..", "src", "lib", "coffeeSubscriptionAccount.js"));
  const terms = await import(path.join(__dirname, "..", "src", "lib", "coffeeSubscriptionTerms.js"));
  assert.deepEqual(lib.MONTHLY_PRICES, plan.MONTHLY_PRICES);
  assert.equal(lib.FIRST_PRICE, plan.FIRST_DELIVERY_PRICE);
  assert.deepEqual(lib.SHIPPING_DAYS, plan.SHIPPING_DAYS);
  assert.equal(lib.CHANGE_DEADLINE_DAY, plan.CHANGE_DEADLINE_DAY);
  assert.deepEqual(lib.PREFECTURES, account.PREFECTURES);
  for (let day = 0; day < 800; day++) {
    const at = Date.UTC(2026, 0, 1, 0, 0) + day * 86400000 + (day % 24) * 3600000;
    assert.equal(lib.startMonthFor(at), plan.startMonthFor(at), new Date(at).toISOString());
  }
  const rows = terms.confirmationRows(3, "2027-01");
  for (const label of ["商品・分量", "初回のお支払い", "2回目以降のお支払い", "2回目のご請求日", "お支払い方法", "発送の時期", "契約期間", "変更・スキップ", "解約"]) {
    assert.ok(rows.some(([l]) => l === label), label);
  }
  assert.match(rows.find(([l]) => l === "2回目のご請求日")[1], /2027年1月1日/);
  assert.match(rows.find(([l]) => l === "2回目以降のお支払い")[1], /8,550円/);
  assert.match(rows.find(([l]) => l === "発送の時期")[1], /5日・15日・25日/);
  assert.equal(terms.LEGAL_TEXT_REVIEWED, false, "provisional wording until a specialist has checked it (before sign-ups reopen)");
  // Every refusal the server can give has a sentence for the customer.
  const codes = new Set();
  for (const file of ["coffee-subscription-account.js", "coffee-subscription-stripe.js", "coffee-subscription-checkout.js"]) {
    for (const m of fs.readFileSync(path.join(__dirname, file), "utf8").matchAll(/(?:AccountError|PlanChangeError|CheckoutError)\("([A-Z_]+)"/g)) codes.add(m[1]);
  }
  const internal = new Set(["SCHEDULE_GAP", "PLAN_CHANGING", "NOT_FOUND", "DISABLED", "BEFORE_START", "INVALID_ACTION", "INVALID_MONTH", "TOO_FAR_AHEAD", "REQUEST_ID_REQUIRED",
    "REQUEST_ID_REUSED", "NO_CUSTOMER", "CANCEL_PREVIEW_REQUIRED", "REQUEST_TOO_OLD" /* email cancellation, shop staff only */]);
  const missing = [...codes].filter((c) => !internal.has(c) && !lib.ERROR_TEXT[c]);
  assert.deepEqual(missing, []);
});
