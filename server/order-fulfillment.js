"use strict";

// Store orders (one-time purchases) on the shop's shipping page (2026-11-21), next to 珈琲の定期便. The orders are the
// paid records written from Stripe's signed payment_intent.succeeded (server/orders.js, orders/{paymentIntentId});
// this module only adds how each one leaves the shop:
//   orders/{pi}.fulfillment = { status: new|preparing|shipped|held, method, trackingNumber, holdReason, … }
// Rules:
//  - stock is NOT touched here: a store order's bags were settled when it was paid (server/inventory.js), so shipping
//    never takes them again (珈琲の定期便 keeps its own reserve-then-ship stock steps);
//  - only a paid order may be prepared or shipped (status paid, or partially_refunded with a visible warning); a
//    refunded one never;
//  - every action runs once per request id, in one transaction with the order (orderFulfillmentOps/{requestId});
//  - "shipped" claims the customer's mail in the same transaction (server/shipping-notice.js), so it is sent once;
//  - the customer's name is shown to signed-in staff; the street address only on request, and each look is recorded.

const notice = require("./shipping-notice");
const plan = require("./coffee-subscription-plan");
const { CALENDAR } = require("./coffee-subscription-calendar");

const ORDERS = "orders";
const OPS = "orderFulfillmentOps";
const ADDRESS_VIEWS = "orderAddressViews";
const STATES = ["new", "preparing", "shipped", "held"];
const HOLD_REASONS = ["CUSTOMER_REQUEST", "ADDRESS_CHECK", "PAYMENT_CHECK", "OUT_OF_STOCK", "OTHER"];
const ORDER_ID_RE = /^pi_[A-Za-z0-9]{8,80}$/;
const REQUEST_RE = /^[A-Za-z0-9_-]{12,100}$/;
// The shop aims to ship the day after the order and promises within 3 working days (CEO 2026-11-21; 3 working days by
// the same calendar as 珈琲の定期便's first delivery).
const PROMISED_WORKING_DAYS = 3;

class OrderFulfillmentError extends Error {
  constructor(code, status = 400, detail = null) { super(code); this.code = code; this.status = status; this.detail = detail; }
}
const fail = (code, status, detail) => { throw new OrderFulfillmentError(code, status, detail); };
const ref = (id) => `R-${String(id).replace(/^pi_/, "").slice(-8).toUpperCase()}`;
const stateOf = (order) => (STATES.includes(order?.fulfillment?.status) ? order.fulfillment.status : "new");
const toMs = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : v instanceof Date ? v.getTime() : Number(v) || 0);
const jstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
const nextDay = (day) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

// Why an order may not be prepared or shipped now (empty: it may). A warning does not block.
function blockers(order) {
  if (!order) return ["UNKNOWN_ORDER"];
  if (order.status === "refunded") return ["REFUNDED"];
  if (!["paid", "partially_refunded"].includes(order.status)) return ["NOT_PAID"];
  return [];
}
const warnings = (order) => (order?.status === "partially_refunded" ? ["PARTIALLY_REFUNDED"] : []);

// Product names for the mail (the store's own titles; the id if the store data cannot be read).
let names = null;
async function productNames() {
  if (names) return names;
  try {
    const { PRODUCT_DATA } = await import("../src/productData.js");
    names = Object.fromEntries(Object.values(PRODUCT_DATA).flat().filter((p) => p && p.id).map((p) => [p.id, p.title?.ja || p.id]));
  } catch {
    names = {};
  }
  return names;
}

// ---- One action, once per request id --------------------------------------------------------------------------
async function operate(db, { action, orderId, requestId, actor, method = null, tracking = null, reason = null }, now, step) {
  if (!ORDER_ID_RE.test(String(orderId || ""))) fail("INVALID_ORDER");
  if (!REQUEST_RE.test(String(requestId || ""))) fail("INVALID_REQUEST_ID");
  const print = JSON.stringify([action, orderId, method, tracking, reason]);
  const opRef = db.collection(OPS).doc(requestId);
  const orderRef = db.collection(ORDERS).doc(orderId);
  const records = require("./coffee-subscription-records");
  return records.retryOnContention(() => db.runTransaction(async (tx) => {
    const op = await tx.get(opRef);
    if (op.exists) {
      if (op.data().print !== print) fail("REQUEST_ID_CONFLICT", 409);
      return { ...op.data().result, applied: false, replay: true };
    }
    const snap = await tx.get(orderRef);
    if (!snap.exists) fail("UNKNOWN_ORDER", 404);
    const result = await step({ tx, orderRef, order: snap.data(), now, actor });
    if (result.applied !== false) {
      const { mail: _mail, ...stored } = result; // the mail's recipient is never kept in the request record
      tx.create(opRef, { action, orderId, print, actor, result: stored, at: new Date(now) });
    }
    return result;
  }));
}

const patch = (order, fields, now, actor) => ({ fulfillment: { ...(order.fulfillment || {}), ...fields, updatedAt: new Date(now), updatedBy: actor } });

async function prepareOrder(db, { orderId, requestId, actor }, { now = Date.now() } = {}) {
  return operate(db, { action: "prepare", orderId, requestId, actor }, now, async ({ tx, orderRef, order }) => {
    const state = stateOf(order);
    if (state === "preparing") return { orderId, status: "preparing", applied: false };
    if (state !== "new") fail("INVALID_STATE", 409, state);
    const blocked = blockers(order);
    if (blocked.length) fail("NOT_SHIPPABLE", 409, blocked);
    tx.update(orderRef, patch(order, { status: "preparing", preparedAt: new Date(now), preparedBy: actor }, now, actor));
    return { orderId, status: "preparing" };
  });
}

// Shipped: the method (and tracking number if any) recorded, the customer's mail claimed in the same transaction.
async function shipOrder(db, { orderId, requestId, actor, method, trackingNumber = null }, { now = Date.now() } = {}) {
  const m = (() => { try { return notice.validMethod(method); } catch (e) { return fail(e.code); } })();
  const t = (() => { try { return notice.validTracking(trackingNumber); } catch (e) { return fail(e.code); } })();
  return operate(db, { action: "ship", orderId, requestId, actor, method: m, tracking: t }, now, async ({ tx, orderRef, order }) => {
    const state = stateOf(order);
    if (state === "shipped") return { orderId, status: "shipped", applied: false };
    if (!["new", "preparing"].includes(state)) fail("INVALID_STATE", 409, state);
    const blocked = blockers(order);
    if (blocked.length) fail("NOT_SHIPPABLE", 409, blocked);
    const claim = await notice.readClaim(tx, db, `order_${orderId}`);
    const email = String(order.customer?.email || "").trim();
    const live = order.livemode === true;
    const mail = !email ? "no_email" : !live ? "skipped_test" : claim.exists ? "already" : "sending";
    claim.create({ kind: "order", orderId, status: mail === "sending" ? "sending" : mail });
    tx.update(orderRef, patch(order, { status: "shipped", method: m, trackingNumber: t, shippedAt: new Date(now), shippedBy: actor }, now, actor));
    return { orderId, status: "shipped", method: m, trackingNumber: t, mail: mail === "sending" ? { to: email, order } : null, mailStatus: mail };
  });
}

async function holdOrder(db, { orderId, requestId, actor, reason }, { now = Date.now() } = {}) {
  if (!HOLD_REASONS.includes(reason)) fail("INVALID_REASON");
  return operate(db, { action: "hold", orderId, requestId, actor, reason }, now, async ({ tx, orderRef, order }) => {
    const state = stateOf(order);
    if (state === "held" && order.fulfillment?.holdReason === reason) return { orderId, status: "held", applied: false };
    if (!["new", "preparing", "held"].includes(state)) fail("INVALID_STATE", 409, state);
    tx.update(orderRef, patch(order, { status: "held", holdReason: reason, heldAt: new Date(now) }, now, actor));
    return { orderId, status: "held", holdReason: reason };
  });
}

async function resumeOrder(db, { orderId, requestId, actor }, { now = Date.now() } = {}) {
  return operate(db, { action: "resume", orderId, requestId, actor }, now, async ({ tx, orderRef, order }) => {
    const state = stateOf(order);
    if (state === "new") return { orderId, status: "new", applied: false };
    if (!["held", "preparing"].includes(state)) fail("INVALID_STATE", 409, state);
    tx.update(orderRef, patch(order, { status: "new", holdReason: null }, now, actor));
    return { orderId, status: "new" };
  });
}

// The mail claimed by shipOrder, sent after its transaction (or a failed one sent again by staff).
async function sendShippedMail(db, { orderId, to, order }, sendMail, log) {
  const n = await productNames();
  const items = (order.items || []).map((i) => ({ name: n[i.id] || i.id, quantity: i.quantity }));
  const f = order.fulfillment || {};
  const message = notice.orderShippedMail({ to, name: order.customer?.name, ref: ref(orderId), items, method: f.method, trackingNumber: f.trackingNumber,
    english: String(order.countryCode || "JP").toUpperCase() !== "JP" });
  return notice.deliver(db, `order_${orderId}`, message, sendMail, log);
}

// ---- The work list (names yes, street addresses no) -----------------------------------------------------------
async function workList(db, { view = "open" } = {}, { now = Date.now() } = {}) {
  if (!["open", "shipped", "all"].includes(view)) fail("INVALID_VIEW");
  const snaps = await db.collection(ORDERS).orderBy("paidAt", "desc").limit(200).get();
  const all = snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
  const mails = await notice.mailStatus(db, all.filter((o) => stateOf(o) === "shipped").map((o) => `order_${o.id}`));
  const rows = all.map((o) => {
    const paidDay = jstDay(toMs(o.paidAt));
    const state = stateOf(o);
    let shipBy = null;
    try { shipBy = plan.workingDayAfter(paidDay, PROMISED_WORKING_DAYS, CALENDAR); } catch { shipBy = null; }
    const f = o.fulfillment || {};
    return {
      orderId: o.id, ref: ref(o.id), paidAt: toMs(o.paidAt), paymentStatus: o.status, livemode: o.livemode === true,
      amount: o.amount, shipping: o.shipping, amountRefunded: o.amountRefunded || 0, countryCode: o.countryCode || "",
      items: (o.items || []).map((i) => ({ id: i.id, quantity: i.quantity })),
      name: o.customer?.name || "", prefecture: o.customer?.address?.state || "", city: o.customer?.address?.city || "",
      status: state, method: f.method || null, trackingNumber: f.trackingNumber || null, holdReason: f.holdReason || null,
      shippedAt: f.shippedAt ? toMs(f.shippedAt) : null, mail: state === "shipped" ? mails[`order_${o.id}`] || null : null,
      aimDay: nextDay(paidDay), shipBy, late: state !== "shipped" && Boolean(shipBy) && jstDay(now) > shipBy,
      blockers: blockers(o), warnings: warnings(o),
    };
  });
  const shown = rows.filter((r) => view === "all" || (view === "shipped" ? r.status === "shipped" : r.status !== "shipped" && !r.blockers.includes("REFUNDED")));
  const counts = Object.fromEntries(STATES.map((s) => [s, rows.filter((r) => r.status === s).length]));
  return { orders: shown, counts, refundedOpen: rows.filter((r) => r.status !== "shipped" && r.blockers.includes("REFUNDED")).length };
}

// The address of one order, for its label: staff only, each look recorded (never the address itself).
async function orderAddress(db, orderId, actor, now = Date.now()) {
  if (!ORDER_ID_RE.test(String(orderId || ""))) fail("INVALID_ORDER");
  const snap = await db.collection(ORDERS).doc(orderId).get();
  if (!snap.exists) fail("UNKNOWN_ORDER", 404);
  const c = snap.data().customer || {};
  await db.collection(ADDRESS_VIEWS).add({ orderId, by: actor, at: new Date(now) });
  return { orderId, ref: ref(orderId), name: c.name || "", phone: c.phone || "", email: c.email || "", address: c.address || {}, countryCode: snap.data().countryCode || "" };
}

// ---- Routes (mounted by coffee-subscription-fulfillment.js after its staff sign-in check) ------------------------
function addRoutes(router, { getDb, sendMail, clock, log }) {
  const handle = (fn) => async (req, res) => {
    try {
      return res.json(await fn(req.body || {}, req, req.staff.actor));
    } catch (error) {
      if (error instanceof OrderFulfillmentError) return res.status(error.status).json({ error: error.code, detail: error.detail ?? null });
      log.error("Order fulfillment failed:", String(error?.message || "").slice(0, 120));
      return res.status(500).json({ error: "FULFILLMENT_FAILED" });
    }
  };
  router.get("/orders", handle((_b, req) => workList(getDb(), { view: String(req.query.view || "open") }, { now: clock() })));
  router.get("/orders/:orderId/address", handle((_b, req, actor) => orderAddress(getDb(), req.params.orderId, actor, clock())));
  router.post("/orders/prepare", handle((b, _r, actor) => prepareOrder(getDb(), { orderId: b.orderId, requestId: b.requestId, actor }, { now: clock() })));
  router.post("/orders/hold", handle((b, _r, actor) => holdOrder(getDb(), { orderId: b.orderId, requestId: b.requestId, reason: b.reason, actor }, { now: clock() })));
  router.post("/orders/resume", handle((b, _r, actor) => resumeOrder(getDb(), { orderId: b.orderId, requestId: b.requestId, actor }, { now: clock() })));
  router.post("/orders/ship", handle(async (b, _r, actor) => {
    const r = await shipOrder(getDb(), { orderId: b.orderId, requestId: b.requestId, actor, method: b.method, trackingNumber: b.trackingNumber }, { now: clock() });
    let mailStatus = r.mailStatus || null;
    if (r.mail) {
      const fresh = (await getDb().collection(ORDERS).doc(r.orderId).get()).data();
      mailStatus = await sendShippedMail(getDb(), { orderId: r.orderId, to: r.mail.to, order: fresh }, sendMail, log);
    }
    const { mail: _m, ...out } = r;
    return { ...out, mailStatus };
  }));
  // A failed shipping mail, sent again (only from "failed", once).
  router.post("/orders/resend-mail", handle(async (b) => {
    if (!ORDER_ID_RE.test(String(b.orderId || ""))) fail("INVALID_ORDER");
    if (!(await notice.claimRetry(getDb(), `order_${b.orderId}`))) fail("MAIL_NOT_FAILED", 409);
    const order = (await getDb().collection(ORDERS).doc(b.orderId).get()).data();
    return { orderId: b.orderId, mailStatus: await sendShippedMail(getDb(), { orderId: b.orderId, to: String(order.customer?.email || "").trim(), order }, sendMail, log) };
  }));
}

module.exports = { ORDERS, OPS, ADDRESS_VIEWS, STATES, HOLD_REASONS, OrderFulfillmentError, blockers, stateOf, prepareOrder, shipOrder, holdOrder,
  resumeOrder, sendShippedMail, workList, orderAddress, addRoutes, ref, productNames };
