"use strict";

// 2026-11-17: Factory (Jennifer) -> signed orders and refunds with CEO approval (server/factory-refund-api.js).
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const express = require("express");
const api = require("./factory-refund-api");

const SECRET = "factory-refund-test-secret-0123456789abcdef";
const CEO = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const ENV = { FACTORY_REFUND_API_ENABLED: "true", FACTORY_REFUND_HMAC_SECRET: SECRET, FACTORY_CEO_USER_ID: CEO };
const PI = "pi_FactoryOrder0001";
const RES = "d0000000-0000-4000-8000-000000000001";

function fakeFirestore(initial) {
  const store = new Map(Object.entries(initial).map(([k, v]) => [k, structuredClone(v)]));
  const snap = (key) => ({ id: key.split("/").pop(), exists: store.has(key), data: () => structuredClone(store.get(key)) });
  const query = (name, filters = [], order = null, max = 1000) => ({
    where: (f, op, v) => query(name, [...filters, [f, op, v]], order, max),
    orderBy: (f, dir) => query(name, filters, [f, dir], max),
    limit: (n) => query(name, filters, order, n),
    get: async () => {
      let docs = [...store.keys()].filter((k) => k.startsWith(name + "/")).map(snap);
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
    async runTransaction(cb) {
      const writes = [];
      const tx = { get: async (ref) => snap(ref.key),
        update(ref, p) { writes.push(() => store.set(ref.key, { ...store.get(ref.key), ...structuredClone(p) })); },
        create(ref, v) { writes.push(() => { if (store.has(ref.key)) throw new Error("ALREADY_EXISTS"); store.set(ref.key, structuredClone(v)); }); } };
      const r = await cb(tx);
      writes.forEach((w) => w());
      return r;
    },
  };
}
function fakeStripe(amount) {
  const refunds = [];
  const byKey = new Map();
  const refunded = () => refunds.filter((r) => r.status !== "failed").reduce((s, r) => s + r.amount, 0);
  return {
    refundsMade: refunds,
    paymentIntents: { retrieve: async (id) => ({ id, status: "succeeded", latest_charge: { id: "ch", amount, amount_captured: amount, amount_refunded: refunded() } }) },
    refunds: {
      create: async (p, o) => { if (byKey.has(o.idempotencyKey)) return byKey.get(o.idempotencyKey);
        const r = { id: "re_" + refunds.length, amount: p.amount, status: "succeeded", metadata: p.metadata, payment_intent: p.payment_intent }; refunds.push(r); byKey.set(o.idempotencyKey, r); return r; },
      list: async ({ payment_intent }) => ({ data: refunds.filter((r) => r.payment_intent === payment_intent) }),
    },
  };
}
function world(now) {
  const db = fakeFirestore({
    [`orders/${PI}`]: { status: "paid", amount: 3850, subtotal: 3600, shipping: 250, couponCode: "", livemode: false, paidAt: new Date(now - 3600e3),
      items: [{ id: "enma-karamo", quantity: 2, unitPrice: 1800 }], inventoryReservationId: RES, customer: { name: "Hanako", email: "hanako@example.com" } },
    [`inventoryReservations/${RES}`]: { status: "paid", items: [{ id: "enma-karamo", quantity: 2 }] },
    "inventory/enma-karamo": { ready: 28, held: 0, sold: 2 },
  });
  return { db, stripe: fakeStripe(3850) };
}

async function server(t, { env = ENV, now = Date.UTC(2026, 10, 17, 12) } = {}) {
  const w = world(now);
  const app = express();
  app.post(api.PATH, express.raw({ type: "application/json", limit: "8kb" }), api.createHandler({ getDb: () => w.db, getStripe: () => w.stripe, env, clock: () => now, log: { warn() {}, error() {} } }));
  const srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  t.after(() => srv.close());
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (body, { ts = String(now), secret = SECRET, mutate = null, raw = null } = {}) => {
    const text = raw ?? JSON.stringify({ nonce: crypto.randomUUID(), ...body });
    const sig = api.signatureFor(secret, ts, Buffer.from(text));
    const sent = mutate ? mutate(text) : text;
    const r = await fetch(base + api.PATH, { method: "POST", headers: { "content-type": "application/json", "x-factory-timestamp": ts, "x-factory-signature": sig }, body: sent });
    return [r.status, await r.json().catch(() => null)];
  };
  return { w, call, now, base };
}
const LINES = [{ id: "enma-karamo", quantity: 1, shipped: false }];
const approval = (now, extra = {}) => ({ requestId: crypto.randomUUID(), approvedBy: CEO, approvedAt: now - 60e3, ...extra });

test("off by default: no flag, short secret or no CEO id -> 404 and nothing runs", async (t) => {
  for (const env of [{}, { ...ENV, FACTORY_REFUND_API_ENABLED: "TRUE" }, { ...ENV, FACTORY_REFUND_HMAC_SECRET: "short" }, { ...ENV, FACTORY_CEO_USER_ID: "ceo" }]) {
    const { call } = await server(t, { env });
    const [status] = await call({ op: "orders.search", query: {} });
    assert.equal(status, 404);
  }
});

test("search and look up orders, with their refunds", async (t) => {
  const { call } = await server(t);
  let [s, b] = await call({ op: "orders.search", query: { email: "Hanako@Example.com" } });
  assert.equal(b.orders[0]?.orderId, PI, "found whatever the case of the address typed");
  [s, b] = await call({ op: "orders.search", query: { email: "hanako@example.com" } });
  assert.equal(s, 200);
  assert.equal(b.orders[0].orderId, PI);
  [s, b] = await call({ op: "orders.search", query: { orderId: PI } });
  assert.equal(b.orders.length, 1);
  [s, b] = await call({ op: "orders.get", orderId: PI });
  assert.equal(b.order.amount, 3850);
  assert.deepEqual(b.refunds, []);
});

test("signature: wrong secret, tampered body, old or future timestamp are refused before anything is read", async (t) => {
  const { call, now, w } = await server(t);
  assert.equal((await call({ op: "orders.search", query: {} }, { secret: "x".repeat(40) }))[0], 401);
  assert.equal((await call({ op: "refund.preview", orderId: PI, lines: LINES }, { mutate: (s) => s.replace('"quantity":1', '"quantity":2') }))[0], 401, "tampered");
  assert.equal((await call({ op: "orders.search", query: {} }, { ts: String(now - 6 * 60e3) }))[0], 401, "expired");
  assert.equal((await call({ op: "orders.search", query: {} }, { ts: String(now + 6 * 60e3) }))[0], 401, "future");
  assert.equal([...w.db.store.keys()].some((k) => k.startsWith("factoryRefundRequests/")), false);
});

test("replay: the same signed request sent twice is refused the second time", async (t) => {
  const { call } = await server(t);
  const raw = JSON.stringify({ nonce: crypto.randomUUID(), op: "orders.search", query: {} });
  assert.equal((await call(null, { raw }))[0], 200);
  const [s, b] = await call(null, { raw });
  assert.equal(s, 409);
  assert.equal(b.error, "REPLAYED_REQUEST");
});

test("unknown fields (e.g. an actor) and unknown operations are refused", async (t) => {
  const { call } = await server(t);
  assert.equal((await call({ op: "refund.preview", orderId: PI, lines: LINES, actor: "someone" }))[1].error, "INVALID_FIELDS");
  assert.equal((await call({ op: "refund.delete", orderId: PI }))[1].error, "INVALID_OPERATION");
  assert.equal((await call({ op: "orders.search", query: {} }, { raw: JSON.stringify({ op: "orders.search", query: {} }) }))[1].error, "NONCE_REQUIRED");
});

test("apply needs the CEO's fresh approval and the exact previewed plan; then refunds once and restocks", async (t) => {
  const { call, now, w } = await server(t);
  const [ps, p] = await call({ op: "refund.preview", orderId: PI, lines: LINES });
  assert.equal(ps, 200);
  assert.equal(p.plan.amount, 1800);
  const apply = (extra) => call({ op: "refund.apply", orderId: PI, lines: LINES, planHash: p.planHash, ...extra });
  assert.equal((await apply({}))[1].error, "CEO_APPROVAL_REQUIRED");
  assert.equal((await apply({ approval: approval(now, { approvedBy: "11111111-2222-4333-8444-555555555555" }) }))[1].error, "CEO_APPROVAL_REQUIRED", "not the CEO");
  assert.equal((await apply({ approval: approval(now, { approvedAt: now - 16 * 60e3 }) }))[1].error, "CEO_APPROVAL_EXPIRED");
  assert.equal((await apply({ approval: approval(now, { approvedAt: now + 60e3 }) }))[1].error, "CEO_APPROVAL_EXPIRED", "approved in the future");
  const changed = await call({ op: "refund.apply", orderId: PI, lines: [{ id: "enma-karamo", quantity: 2, shipped: false }], planHash: p.planHash, approval: approval(now) });
  assert.equal(changed[1].error, "PLAN_CHANGED", "the approval is for the previewed plan only");
  assert.equal(w.stripe.refundsMade.length, 0);
  const a = approval(now);
  const [as, done] = await apply({ approval: a });
  assert.equal(as, 200);
  assert.equal(done.status, "refunded");
  assert.equal(done.refundId, a.requestId, "one approval = one refund");
  assert.deepEqual(w.db.store.get("inventory/enma-karamo"), { ready: 29, held: 0, sold: 1 });
  const audit = w.db.store.get(`orderRefunds/${a.requestId}`);
  assert.equal(audit.actor, "factory-ceo:" + CEO);
  // The same approval resent (new nonce): no second refund.
  const [rs, again] = await apply({ approval: a });
  assert.equal(rs, 200);
  assert.equal(again.status, "refunded");
  assert.equal(w.stripe.refundsMade.length, 1);
  // A new approval for the old preview: refused, the order changed since.
  assert.equal((await apply({ approval: approval(now) }))[0], 409);
  assert.equal(w.stripe.refundsMade.length, 1);
  const [, st] = await call({ op: "refund.status", refundId: a.requestId });
  assert.equal(st.refund.status, "refunded");
  assert.deepEqual(st.refund.transitions.map((x) => x.status), ["approved", "refunded"]);
  const [, got] = await call({ op: "orders.get", orderId: PI });
  assert.equal(got.refunds.length, 1);
  assert.equal(got.order.status, "partially_refunded");
});

test("wiring: mounted with the raw body before express.json and off by default", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const mount = source.indexOf("app.post(factoryRefundApi.PATH, express.raw(");
  assert.ok(mount > 0 && mount < source.indexOf("app.use(express.json());"));
  assert.equal(api.enabled({}), false);
});
