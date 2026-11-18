"use strict";

// 2026-11-18: 珈琲の定期便 ③ — Factory (Jennifer) reads subscriptions through the signed connection, read only.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const express = require("express");
const api = require("./factory-refund-api");
const read = require("./factory-subscription-read");
const plan = require("./coffee-subscription-plan");
const records = require("./coffee-subscription-records");

const SECRET = "factory-refund-test-secret-0123456789abcdef";
const CEO = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const BASE_ENV = { FACTORY_REFUND_API_ENABLED: "true", FACTORY_REFUND_HMAC_SECRET: SECRET, FACTORY_CEO_USER_ID: CEO };
const ENV = { ...BASE_ENV, FACTORY_SUBSCRIPTION_READ_ENABLED: "true" };
const jstAt = (y, m, d, h = 12, min = 0) => Date.UTC(y, m - 1, d, h - 9, min);
// Personal details of the test customers: none may appear in list / get / schedule answers.
const PII = ["花子", "太郎", "hanako@example.com", "taro@example.com", "0467000000", "0312345678", "小町1-1", "千代田1-1", "248-0006", "100-0001", "鎌倉市", "千代田区"];

function fakeFirestore(initial) {
  const store = new Map(Object.entries(initial).map(([k, v]) => [k, structuredClone(v)]));
  const snap = (key) => ({ id: key.split("/").pop(), exists: store.has(key), data: () => structuredClone(store.get(key)) });
  const query = (name, filters = [], max = 1000) => ({
    where: (f, op, v) => query(name, [...filters, [f, op, v]], max),
    orderBy: () => query(name, filters, max),
    limit: (n) => query(name, filters, n),
    get: async () => {
      let docs = [...store.keys()].filter((k) => k.startsWith(name + "/") && !k.slice(name.length + 1).includes("/")).map(snap);
      docs = docs.filter((d) => filters.every(([f, op, v]) => { const got = f.split(".").reduce((o, p) => o?.[p], d.data()); return op === "in" ? v.includes(got) : got === v; }));
      return { docs: docs.slice(0, max) };
    },
  });
  return {
    store,
    collection(name) {
      return { ...query(name), doc(id) { const key = `${name}/${id}`; return { key, get: async () => snap(key),
        create: async (v) => { if (store.has(key)) throw new Error("ALREADY_EXISTS"); store.set(key, structuredClone(v)); } }; } };
    },
  };
}

// Two contracts as ① and ② leave them, with a month record and deliveries.
function world() {
  const shipping = (name, pref, city, line1, postal, phone) => ({ name, prefecture: pref, city, line1, line2: "", postalCode: postal, phone, country: "JP" });
  return fakeFirestore({
    [`${records.SUBS}/sub_1AaaaaaAAAhanako`]: { email: "hanako@example.com", status: "active", frequency: 2, frequencyNow: 2, startMonth: "2026-12", skips: ["2027-01"],
      changes: {}, livemode: false, createdAt: new Date(jstAt(2026, 11, 10)), shipping: shipping("龍華 花子", "神奈川県", "鎌倉市", "小町1-1", "248-0006", "0467000000"),
      preference: { text: "苦味のある深煎りが好きです", updatedAt: new Date(jstAt(2026, 11, 10)) }, paymentIssue: false },
    [`${records.SUBS}/sub_2BbbbbbBBBtaroxx`]: { email: "taro@example.com", status: "past_due", frequency: 4, startMonth: "2026-12", skips: [], changes: {},
      livemode: false, createdAt: new Date(jstAt(2026, 11, 3)), shipping: shipping("龍華 太郎", "東京都", "千代田区", "千代田1-1", "100-0001", "0312345678"),
      preference: { text: "浅煎りも試したい" }, paymentIssue: true, cancelRequestedAt: new Date(jstAt(2026, 12, 20)), cancelAt: new Date(plan.billingStartUnix("2027-01") * 1000),
      firstUnchargedMonth: "2027-01" },
    [`${records.MONTHS}/sub_1AaaaaaAAAhanako_2026-12`]: { subscriptionId: "sub_1AaaaaaAAAhanako", month: "2026-12", status: "paid", amount: 5800 },
    [`${records.MONTHS}/sub_2BbbbbbBBBtaroxx_2026-12`]: { subscriptionId: "sub_2BbbbbbBBBtaroxx", month: "2026-12", status: "payment_failed", attempts: 2 },
    [`${records.SHIPMENTS}/sub_1AaaaaaAAAhanako_first`]: { subscriptionId: "sub_1AaaaaaAAAhanako", kind: "first", month: "2026-11", seq: 0, plannedDate: null, shipBy: "2026-11-13", status: "shipped", grams: 200 },
    [`${records.SHIPMENTS}/sub_1AaaaaaAAAhanako_2026-12_1`]: { subscriptionId: "sub_1AaaaaaAAAhanako", kind: "monthly", month: "2026-12", seq: 1, plannedDate: "2026-12-07", status: "planned", grams: 200 },
    [`${records.SHIPMENTS}/sub_1AaaaaaAAAhanako_2026-12_2`]: { subscriptionId: "sub_1AaaaaaAAAhanako", kind: "monthly", month: "2026-12", seq: 2, plannedDate: "2026-12-21", status: "planned", grams: 200 },
  });
}

async function server(t, { env = ENV, now = jstAt(2026, 12, 9) } = {}) {
  const db = world();
  const app = express();
  const warnings = [];
  app.post(api.PATH, express.raw({ type: "application/json", limit: "8kb" }), api.createHandler({ getDb: () => db, getStripe: () => ({}), env, clock: () => now,
    log: { warn: (...a) => warnings.push(a.join(" ")), error: (...a) => warnings.push(a.join(" ")) } }));
  const srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  t.after(() => srv.close());
  const call = async (body, nonce = crypto.randomUUID()) => {
    const text = JSON.stringify({ nonce, ...body });
    const ts = String(now);
    const r = await fetch(`http://127.0.0.1:${srv.address().port}${api.PATH}`, { method: "POST",
      headers: { "content-type": "application/json", "x-factory-timestamp": ts, "x-factory-signature": api.signatureFor(SECRET, ts, Buffer.from(text)) }, body: text });
    return [r.status, await r.json().catch(() => null)];
  };
  return { db, call, now, warnings };
}
const noPII = (value) => { const text = JSON.stringify(value); return PII.filter((p) => text.includes(p)); };
const view = (now, extra = {}) => ({ requestId: crypto.randomUUID(), viewedBy: CEO, viewedAt: now - 10e3, ...extra });

test("off by default: every subscription operation is refused before anything is stored; orders and refunds unchanged", async (t) => {
  const { db, call } = await server(t, { env: BASE_ENV });
  for (const body of [{ op: "subscriptions.list", query: {} }, { op: "subscriptions.get", subscription: "SUB-HANAKO" }, { op: "subscriptions.schedule", range: "week" },
    { op: "subscriptions.contact", subscription: "SUB-HANAKO", view: view(jstAt(2026, 12, 9)) }]) {
    assert.deepEqual(await call(body), [403, { error: "SUBSCRIPTION_READ_DISABLED" }], body.op);
  }
  assert.equal([...db.store.keys()].filter((k) => k.startsWith("factoryRefundRequests/") || k.startsWith(read.VIEWS)).length, 0, "no nonce, no view record");
  // Orders still readable; refunds still refused (FACTORY_REFUND_OPS_ENABLED unset) even with subscriptions on.
  assert.equal((await call({ op: "orders.search", query: {} }))[0], 200);
  const on = await server(t, { env: ENV });
  assert.deepEqual(await on.call({ op: "refund.preview", orderId: "pi_FactoryOrder0001", lines: [], refundShipping: false, acknowledgeExternalRefunds: false }), [403, { error: "REFUND_OPS_DISABLED" }]);
});

test("list: contract numbers, prefecture, state, next charge and filters — no name, email, phone or address", async (t) => {
  const { call } = await server(t);
  const [status, body] = await call({ op: "subscriptions.list", query: {} });
  assert.equal(status, 200);
  assert.deepEqual(noPII(body), []);
  assert.deepEqual(body.subscriptions.map((s) => [s.ref, s.prefecture, s.status, s.frequency]), [["SUB-HANAKO", "神奈川県", "active", 2], ["SUB-TAROXX", "東京都", "past_due", 4]]);
  const hanako = body.subscriptions[0];
  assert.deepEqual(hanako.nextCharge, { month: "2027-01", skipped: true, amount: 0, frequency: 2 }, "January skipped");
  const pick = async (filter) => (await call({ op: "subscriptions.list", query: { filter } }))[1].subscriptions.map((s) => s.ref);
  assert.deepEqual(await pick("payment_issue"), ["SUB-TAROXX"]);
  assert.deepEqual(await pick("cancel_scheduled"), ["SUB-TAROXX"]);
  assert.deepEqual(await pick("skip_next"), ["SUB-HANAKO"]);
  assert.deepEqual(await pick("active"), ["SUB-HANAKO"]);
  assert.deepEqual(await call({ op: "subscriptions.list", query: { filter: "everything" } }), [400, { error: "INVALID_QUERY" }]);
});

test("detail: plan, charges, deliveries, preference, skips and cancellation — by number or id; never personal details", async (t) => {
  const { call } = await server(t);
  const [status, body] = await call({ op: "subscriptions.get", subscription: "sub-hanako" });
  assert.equal(status, 200);
  assert.deepEqual(noPII(body), []);
  const s = body.subscription;
  assert.equal(s.preference.text, "苦味のある深煎りが好きです");
  assert.deepEqual(s.charges.map((c) => [c.month, c.status, c.amount]), [["2026-12", "paid", 5800]]);
  assert.deepEqual(s.plan.slice(0, 2).map((m) => [m.month, m.skipped, m.amount]), [["2026-12", false, 5800], ["2027-01", true, 0]]);
  assert.deepEqual(s.shipments.map((x) => x.status), ["shipped", "planned", "planned"]);
  const taro = (await call({ op: "subscriptions.get", subscription: "sub_2BbbbbbBBBtaroxx" }))[1].subscription;
  assert.deepEqual([taro.paymentIssue, taro.cancellation.firstUnchargedMonth, taro.charges[0].attempts], [true, "2027-01", 2]);
  assert.deepEqual(await call({ op: "subscriptions.get", subscription: "SUB-NOPE00" }), [404, { error: "UNKNOWN_SUBSCRIPTION" }]);
  assert.deepEqual(await call({ op: "subscriptions.get", subscription: "hanako@example.com" }), [400, { error: "INVALID_QUERY" }]);
});

test("this week is Monday–Sunday and this month the 1st–last day, in Japan time, across months and years", () => {
  assert.deepEqual(read.rangeFor("week", jstAt(2026, 12, 9)), { kind: "week", from: "2026-12-07", to: "2026-12-13" }, "Wednesday");
  assert.deepEqual(read.rangeFor("week", jstAt(2026, 12, 7, 0, 0)), { kind: "week", from: "2026-12-07", to: "2026-12-13" }, "Monday 00:00");
  assert.deepEqual(read.rangeFor("week", jstAt(2026, 12, 13, 23, 59)), { kind: "week", from: "2026-12-07", to: "2026-12-13" }, "Sunday 23:59");
  assert.deepEqual(read.rangeFor("week", jstAt(2026, 12, 31)), { kind: "week", from: "2026-12-28", to: "2027-01-03" }, "across the year");
  assert.deepEqual(read.rangeFor("week", jstAt(2027, 3, 1)), { kind: "week", from: "2027-03-01", to: "2027-03-07" });
  assert.deepEqual(read.rangeFor("week", jstAt(2027, 2, 28)), { kind: "week", from: "2027-02-22", to: "2027-02-28" }, "Sunday at the month's end");
  assert.deepEqual(read.rangeFor("month", jstAt(2027, 2, 10)), { kind: "month", from: "2027-02-01", to: "2027-02-28" });
  assert.deepEqual(read.rangeFor("month", jstAt(2028, 2, 10)), { kind: "month", from: "2028-02-01", to: "2028-02-29" }, "leap year");
  assert.deepEqual(read.rangeFor("month", Date.UTC(2026, 11, 31, 15, 30)), { kind: "month", from: "2027-01-01", to: "2027-01-31" }, "00:30 JST on 1/1 is January");
  assert.throws(() => read.rangeFor("year", Date.now()), /INVALID_RANGE/);
});

test("schedule: deliveries of this week / month by date, skips and endings; no personal details", async (t) => {
  const { call } = await server(t);
  const [, week] = await call({ op: "subscriptions.schedule", range: "week" });
  assert.deepEqual(noPII(week), []);
  assert.deepEqual([week.range.from, week.range.to], ["2026-12-07", "2026-12-13"]);
  assert.deepEqual(week.deliveries.map((d) => [d.date, d.ref, d.seq, d.preference]), [["2026-12-07", "SUB-HANAKO", 1, "苦味のある深煎りが好きです"]]);
  const [, month] = await call({ op: "subscriptions.schedule", range: "month" });
  assert.deepEqual(month.deliveries.map((d) => d.date), ["2026-12-07", "2026-12-21"]);
  assert.equal(month.totalGrams, 400);
  assert.deepEqual(month.ending.map((e) => e.ref), [], "Taro ends on 1/1 09:00 JST: not in December");
  const jan = await server(t, { now: jstAt(2027, 1, 5) });
  const [, janMonth] = await jan.call({ op: "subscriptions.schedule", range: "month" });
  assert.deepEqual(janMonth.skipped, [{ ref: "SUB-HANAKO", months: ["2027-01"] }]);
  assert.deepEqual(janMonth.ending.map((e) => e.ref), ["SUB-TAROXX"]);
  assert.deepEqual(await call({ op: "subscriptions.schedule", range: "year" }), [400, { error: "INVALID_RANGE" }]);
});

test("contact: only with the CEO's fresh view record, once; the view is recorded without the details; others refused", async (t) => {
  const { db, call, now, warnings } = await server(t);
  const v = view(now);
  const [status, body] = await call({ op: "subscriptions.contact", subscription: "SUB-HANAKO", view: v });
  assert.equal(status, 200);
  assert.deepEqual([body.contact.name, body.contact.email, body.contact.phone, body.contact.address.city], ["龍華 花子", "hanako@example.com", "0467000000", "鎌倉市"]);
  const audit = db.store.get(`${read.VIEWS}/${v.requestId}`);
  assert.deepEqual(Object.keys(audit).sort(), ["by", "ref", "subscriptionId", "viewedAt"]);
  assert.deepEqual(noPII(audit), [], "the record says who looked when, not what was seen");
  // The same view record again (new nonce): refused.
  assert.deepEqual(await call({ op: "subscriptions.contact", subscription: "SUB-HANAKO", view: v }), [409, { error: "REPLAYED_REQUEST" }]);
  // Not the CEO, too old, missing or extra keys: refused before anything is read or recorded.
  for (const bad of [view(now, { viewedBy: "11111111-2222-4333-8444-555555555555" }), view(now, { viewedAt: now - 3 * 60e3 }), { requestId: crypto.randomUUID(), viewedBy: CEO },
    { ...view(now), role: "ceo" }, null]) {
    const [s, b] = await call({ op: "subscriptions.contact", subscription: "SUB-HANAKO", view: bad });
    assert.equal(s, 403, JSON.stringify(bad));
    assert.match(b.error, /^CEO_VIEW_(REQUIRED|EXPIRED)$/);
  }
  assert.equal([...db.store.keys()].filter((k) => k.startsWith(read.VIEWS + "/")).length, 1);
  // Logs carry codes only.
  assert.deepEqual(noPII(warnings), []);
  // Unknown fields (e.g. a user id outside the view record) are refused.
  assert.deepEqual(await call({ op: "subscriptions.get", subscription: "SUB-HANAKO", actor: CEO }), [400, { error: "INVALID_FIELDS" }]);
});

test("the same signed request twice is refused the second time (read operations too)", async (t) => {
  const { call } = await server(t);
  const nonce = crypto.randomUUID();
  assert.equal((await call({ op: "subscriptions.list", query: {} }, nonce))[0], 200);
  assert.deepEqual(await call({ op: "subscriptions.list", query: {} }, nonce), [409, { error: "REPLAYED_REQUEST" }]);
});

test("read only: no subscription operation writes anything but its nonce (and a contact view record)", async (t) => {
  const { db, call, now } = await server(t);
  const before = new Map([...db.store].filter(([k]) => !k.startsWith("factoryRefundRequests/")).map(([k, v]) => [k, JSON.stringify(v)]));
  await call({ op: "subscriptions.list", query: { filter: "all" } });
  await call({ op: "subscriptions.get", subscription: "SUB-TAROXX" });
  await call({ op: "subscriptions.schedule", range: "month" });
  await call({ op: "subscriptions.contact", subscription: "SUB-TAROXX", view: view(now) });
  const changed = [...db.store].filter(([k, v]) => !k.startsWith("factoryRefundRequests/") && !k.startsWith(read.VIEWS + "/") && before.get(k) !== JSON.stringify(v));
  assert.deepEqual(changed.map(([k]) => k), []);
});
