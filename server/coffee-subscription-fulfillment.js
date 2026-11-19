"use strict";

// 珈琲の定期便 ④: the shop prepares and ships each delivery (100 g × 2 different beans = 200 g) from the same counted
// stock as single orders. Off unless COFFEE_SUBSCRIPTION_FULFILLMENT_TOKEN is set (32+ characters) on the payment server.
//
// A delivery (coffeeSubscriptionShipments/{id}, created only from a paid invoice by coffee-subscription-records.js):
//   planned ──prepare──▶ preparing ──ship──▶ shipped
//      ▲  ╲                 │
//      │   ╲(stock short)   │ hold / resume (the reserved bags are given back)
//      │    ▼               ▼
//      └─resume── held ◀────┘          needs_review (late payment) ──resume──▶ planned
//
// Stock, in three separate steps (the same inventory/{sku} and inventoryLots/{lot} counters as single orders, in the
// same Firestore transactions, so a bag is never sold twice):
//  1. prepare  — the shop picks two different beans: one bag of each is reserved (held + 1). The address is copied
//                onto the delivery (later address changes do not move a delivery being prepared).
//  2. ship     — the bags leave: ready − 1, held − 1, sold + 1. Only now is stock really taken.
//  3. hold / resume from preparing — the reservation is given back (held − 1).
// Nothing is prepared or shipped for an unpaid, skipped, duplicate, ended or reviewed contract or month: see blockers().
// Not enough stock: nothing is reserved, the delivery is held (OUT_OF_STOCK) and the shop is told; nothing else moves.
// Each operation carries a request id (coffeeSubscriptionFulfillmentOps/{requestId}): sent again, it answers the first
// result and changes nothing; reused for another operation, it is refused. A shipped delivery is never shipped again.
// Stripe events never touch stock here: they only create deliveries (once), so repeated webhooks cannot move stock.
// The per-order reservations of single orders (inventoryReservations) are not used: their reconciliation would treat a
// reservation without a PaymentIntent as needing manual review.

const crypto = require("crypto");
const express = require("express");
const plan = require("./coffee-subscription-plan");
const records = require("./coffee-subscription-records");
const { CATALOG } = require("./catalog");
const { createRateLimiter, clientKey } = require("./rate-limit");

const PATH = "/internal/coffee-subscription/fulfillment";
const OPS = "coffeeSubscriptionFulfillmentOps";
const BAGS_PER_DELIVERY = 2;
const ENDED = ["canceled", "incomplete_expired"];
// Contract reviews that stop every delivery of the contract until the CEO has decided.
const BLOCKING_CONTRACT_REVIEWS = ["DUPLICATE_SUBSCRIPTION", "UNEXPECTED_FIRST_AMOUNT"];
const HOLD_REASONS = ["OUT_OF_STOCK", "CUSTOMER_REQUEST", "ADDRESS_CHECK", "PAYMENT_CHECK", "OTHER"];
const OPEN_STATES = ["planned", "held", "needs_review", "preparing"];

const SHIPMENT_ID_RE = /^sub_[A-Za-z0-9]{6,80}_(first|\d{4}-\d{2}_[1-4])$/;
const REQUEST_RE = /^[A-Za-z0-9_-]{12,100}$/;
const TRACKING_RE = /^[0-9-]{6,30}$/;
const SKU_RE = /^[a-z0-9-]{1,90}$/;

class FulfillmentError extends Error {
  constructor(code, status = 400, detail = null) { super(code); this.code = code; this.status = status; this.detail = detail; }
}
const fail = (code, status, detail) => { throw new FulfillmentError(code, status, detail); };
const integer = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : 0);
const contractRef = (id) => `SUB-${String(id).replace(/^sub_/, "").slice(-6).toUpperCase()}`;

// Beans a delivery may hold: 100 g roasted beans sold from counted stock.
function beanOf(sku, catalog = CATALOG) {
  const p = Object.prototype.hasOwnProperty.call(catalog, sku) ? catalog[sku] : null;
  return p && p.kind === "beans" && p.managedStock === true && p.contentG === 100 ? { sku, lot: p.lot || null } : null;
}
const beanSkus = (catalog = CATALOG) => Object.keys(catalog).filter((sku) => beanOf(sku, catalog));

function validBeans(skus, catalog = CATALOG) {
  if (!Array.isArray(skus) || skus.length !== BAGS_PER_DELIVERY || !skus.every((s) => typeof s === "string" && SKU_RE.test(s))) fail("INVALID_BEANS");
  const beans = skus.map((s) => beanOf(s, catalog) || fail("NOT_A_SUBSCRIPTION_BEAN", 400, s));
  if (beans[0].sku === beans[1].sku) fail("SAME_BEANS");
  // Two products roasted from the same green beans are not two different beans.
  if (beans[0].lot && beans[0].lot === beans[1].lot) fail("SAME_BEANS");
  return beans;
}

// Why a delivery may not be prepared or shipped now (empty: it may). Pure: the documents read in the transaction.
function blockers({ shipment, contract, month }) {
  const out = [];
  if (!shipment) return ["UNKNOWN_SHIPMENT"];
  if (shipment.status === "cancelled_before_shipping") out.push("CANCELLED");
  if (shipment.status === "needs_review") out.push("SHIPMENT_NEEDS_REVIEW");
  if (!contract) return [...out, "UNKNOWN_SUBSCRIPTION"];
  if (contract.duplicateOf) out.push("DUPLICATE_SUBSCRIPTION");
  else if (contract.needsReview && BLOCKING_CONTRACT_REVIEWS.includes(contract.reviewReason)) out.push(contract.reviewReason);
  if (shipment.kind === "monthly") {
    // Paid by the very invoice that created this delivery (a failed, refunded or replaced charge never ships).
    if (!month || month.status !== "paid" || month.invoiceId !== shipment.invoiceId) out.push("MONTH_NOT_PAID");
    if ((contract.skips || []).includes(shipment.month)) out.push("MONTH_SKIPPED");
    if (contract.firstUnchargedMonth && shipment.month >= contract.firstUnchargedMonth) out.push("AFTER_CANCELLATION");
    // Ended without our own cancellation (Stripe Dashboard, final payment failure): the CEO decides about what is left.
    if (ENDED.includes(contract.status) && !contract.firstUnchargedMonth) out.push("CONTRACT_ENDED");
  } else if (shipment.kind === "first") {
    if (ENDED.includes(contract.status)) out.push("CONTRACT_ENDED");
  } else {
    out.push("UNKNOWN_SHIPMENT_KIND");
  }
  return [...new Set(out)];
}

const stockRefs = (db, beans) => ({
  skus: beans.map((b) => db.collection("inventory").doc(b.sku)),
  lots: beans.filter((b) => b.lot).map((b) => db.collection("inventoryLots").doc(b.lot)),
});
async function readStock(tx, db, beans) {
  const refs = stockRefs(db, beans);
  return { refs, skus: await Promise.all(refs.skus.map((r) => tx.get(r))), lots: await Promise.all(refs.lots.map((r) => tx.get(r))) };
}
const left = (snap) => (snap.exists ? integer(snap.data().ready) - integer(snap.data().held) : 0);
function shortOf(beans, stock) {
  const short = [];
  beans.forEach((b, i) => { if (left(stock.skus[i]) < 1) short.push(b.sku); });
  let j = 0;
  beans.forEach((b) => { if (b.lot) { if (left(stock.lots[j]) < 1 && !short.includes(b.sku)) short.push(b.sku); j += 1; } });
  return short;
}
// The reserved bags are counted as reserved (held ≥ 1) and still on the shelf (ready ≥ held).
function consistent(stock) {
  return [...stock.skus, ...stock.lots].every((s) => s.exists && integer(s.data().held) >= 1 && integer(s.data().ready) >= integer(s.data().held));
}
function writeStock(tx, stock, change) {
  [...stock.refs.skus.map((r, i) => [r, stock.skus[i]]), ...stock.refs.lots.map((r, i) => [r, stock.lots[i]])].forEach(([ref, snap]) => {
    const s = snap.data();
    if (change === "reserve") tx.update(ref, { held: integer(s.held) + 1 });
    else if (change === "release") tx.update(ref, { held: Math.max(0, integer(s.held) - 1) });
    else tx.update(ref, { ready: integer(s.ready) - 1, held: integer(s.held) - 1, sold: integer(s.sold) + 1 });
  });
}

// For coffee-subscription-stripe.js: a delivery being prepared when its contract is cancelled gives its bags back.
// readRelease (inside the transaction, before any write) returns the write.
async function readRelease(tx, db, shipment) {
  if (shipment?.status !== "preparing" || !Array.isArray(shipment.beans) || !shipment.beans.length) return () => {};
  const stock = await readStock(tx, db, shipment.beans);
  return () => writeStock(tx, stock, "release");
}

const fingerprint = (parts) => crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex");

// One operation in one transaction: the request record, the delivery, its contract and month, and the stock.
async function operate(db, { action, shipmentId, requestId, actor, beans = null, tracking = null, reason = null }, now, step) {
  if (!SHIPMENT_ID_RE.test(String(shipmentId || ""))) fail("INVALID_SHIPMENT");
  if (!REQUEST_RE.test(String(requestId || ""))) fail("INVALID_REQUEST_ID");
  const print = fingerprint([action, shipmentId, beans ? beans.map((b) => b.sku) : null, tracking, reason]);
  const opRef = db.collection(OPS).doc(requestId);
  const ref = db.collection(records.SHIPMENTS).doc(shipmentId);
  return db.runTransaction(async (tx) => {
    const op = await tx.get(opRef);
    if (op.exists) {
      if (op.data().fingerprint !== print) fail("REQUEST_ID_CONFLICT", 409);
      return { ...op.data().result, applied: false, replay: true };
    }
    const snap = await tx.get(ref);
    if (!snap.exists) fail("UNKNOWN_SHIPMENT", 404);
    const shipment = snap.data();
    const contractSnap = await tx.get(db.collection(records.SUBS).doc(shipment.subscriptionId));
    const monthSnap = shipment.kind === "monthly" ? await tx.get(db.collection(records.MONTHS).doc(`${shipment.subscriptionId}_${shipment.month}`)) : null;
    const contract = contractSnap.exists ? contractSnap.data() : null;
    const ctx = { tx, db, ref, shipment, contract, month: monthSnap?.exists ? monthSnap.data() : null, now, actor };
    const result = await step(ctx);
    if (result.applied !== false) {
      tx.create(opRef, { action, shipmentId, fingerprint: print, actor, result, at: new Date(now) });
    }
    return result;
  });
}

const summaryOf = (shipmentId, status, extra = {}) => ({ shipmentId, status, ...extra });

async function prepareShipment(db, { shipmentId, skus, requestId, actor }, { now = Date.now(), catalog = CATALOG } = {}) {
  const beans = validBeans(skus, catalog);
  return operate(db, { action: "prepare", shipmentId, requestId, actor, beans }, now, async ({ tx, ref, shipment, contract, month }) => {
    if (shipment.status === "preparing") {
      const same = (shipment.beans || []).map((b) => b.sku).sort().join() === beans.map((b) => b.sku).sort().join();
      if (same) return { ...summaryOf(shipmentId, "preparing", { beans: shipment.beans }), applied: false };
      fail("ALREADY_PREPARING", 409);
    }
    if (!["planned", "held"].includes(shipment.status)) fail("INVALID_STATE", 409, shipment.status);
    const blocked = blockers({ shipment, contract, month });
    if (blocked.length) fail("NOT_SHIPPABLE", 409, blocked);
    const stock = await readStock(tx, db, beans);
    const short = shortOf(beans, stock);
    if (short.length) {
      // Not enough stock: nothing is reserved or shipped; the delivery waits and the shop is told.
      tx.update(ref, { status: "held", holdReason: "OUT_OF_STOCK", shortSkus: short, heldAt: new Date(now), updatedBy: actor, updatedAt: new Date(now) });
      return summaryOf(shipmentId, "held", { holdReason: "OUT_OF_STOCK", shortSkus: short, notify: true });
    }
    writeStock(tx, stock, "reserve");
    const s = contract.shipping || {};
    const shipTo = { name: s.name || "", postalCode: s.postalCode || "", prefecture: s.prefecture || "", city: s.city || "", line1: s.line1 || "",
      line2: s.line2 || "", phone: s.phone || "", version: Number(contract.shippingVersion || 0) };
    tx.update(ref, { status: "preparing", beans, shipTo, preparedAt: new Date(now), preparedBy: actor, holdReason: null, shortSkus: null,
      updatedBy: actor, updatedAt: new Date(now) });
    return summaryOf(shipmentId, "preparing", { beans });
  });
}

async function shipShipment(db, { shipmentId, requestId, actor, trackingNumber = null }, { now = Date.now() } = {}) {
  const tracking = trackingNumber === null || trackingNumber === undefined || trackingNumber === "" ? null : String(trackingNumber);
  if (tracking !== null && !TRACKING_RE.test(tracking)) fail("INVALID_TRACKING_NUMBER");
  return operate(db, { action: "ship", shipmentId, requestId, actor, tracking }, now, async ({ tx, ref, shipment, contract, month }) => {
    if (shipment.status === "shipped") return { ...summaryOf(shipmentId, "shipped"), applied: false };
    if (shipment.status !== "preparing") fail("INVALID_STATE", 409, shipment.status);
    // Checked again: the contract may have been cancelled or flagged since the bags were reserved.
    const blocked = blockers({ shipment, contract, month });
    if (blocked.length) fail("NOT_SHIPPABLE", 409, blocked);
    const stock = await readStock(tx, db, shipment.beans || []);
    if (!(shipment.beans || []).length || !consistent(stock)) {
      // Stock and delivery disagree: nothing is taken twice or guessed; the delivery is flagged for the CEO.
      tx.update(ref, { needsReview: true, reviewReason: "INVENTORY_INCONSISTENCY", updatedAt: new Date(now) });
      return summaryOf(shipmentId, "preparing", { review: "INVENTORY_INCONSISTENCY", notify: true });
    }
    writeStock(tx, stock, "ship");
    tx.update(ref, { status: "shipped", shippedAt: new Date(now), shippedBy: actor, trackingNumber: tracking, updatedBy: actor, updatedAt: new Date(now) });
    return summaryOf(shipmentId, "shipped", { beans: shipment.beans });
  });
}

async function holdShipment(db, { shipmentId, requestId, actor, reason }, { now = Date.now() } = {}) {
  if (!HOLD_REASONS.includes(reason)) fail("INVALID_REASON");
  return operate(db, { action: "hold", shipmentId, requestId, actor, reason }, now, async ({ tx, ref, shipment }) => {
    if (shipment.status === "held" && shipment.holdReason === reason) return { ...summaryOf(shipmentId, "held", { holdReason: reason }), applied: false };
    if (!["planned", "preparing", "held"].includes(shipment.status)) fail("INVALID_STATE", 409, shipment.status);
    const release = await readRelease(tx, db, shipment);
    release();
    tx.update(ref, { status: "held", holdReason: reason, heldAt: new Date(now), beans: null, shipTo: null, updatedBy: actor, updatedAt: new Date(now) });
    return summaryOf(shipmentId, "held", { holdReason: reason, released: shipment.status === "preparing" });
  });
}

// Back to planned: a held delivery, a delivery the CEO has reviewed (needs_review), or one being prepared (to pick other
// beans; its bags are given back).
async function resumeShipment(db, { shipmentId, requestId, actor }, { now = Date.now() } = {}) {
  return operate(db, { action: "resume", shipmentId, requestId, actor }, now, async ({ tx, ref, shipment }) => {
    if (shipment.status === "planned") return { ...summaryOf(shipmentId, "planned"), applied: false };
    if (!["held", "needs_review", "preparing"].includes(shipment.status)) fail("INVALID_STATE", 409, shipment.status);
    const release = await readRelease(tx, db, shipment);
    release();
    tx.update(ref, { status: "planned", holdReason: null, shortSkus: null, beans: null, shipTo: null, needsReview: false, reviewReason: null,
      ...(shipment.status === "needs_review" ? { reviewedBy: actor, reviewedAt: new Date(now) } : {}), updatedBy: actor, updatedAt: new Date(now) });
    return summaryOf(shipmentId, "planned", { released: shipment.status === "preparing" });
  });
}

// ---- The shop's work list (no name, email, phone or street address) ---------------------------------------------
const jstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

async function stockView(db, catalog = CATALOG) {
  const skus = beanSkus(catalog);
  const snaps = await Promise.all(skus.map((sku) => db.collection("inventory").doc(sku).get()));
  const lots = [...new Set(skus.map((sku) => catalog[sku].lot).filter(Boolean))];
  const lotSnaps = await Promise.all(lots.map((lot) => db.collection("inventoryLots").doc(lot).get()));
  const lotLeft = Object.fromEntries(lots.map((lot, i) => [lot, Math.max(0, left(lotSnaps[i]))]));
  const beans = skus.map((sku, i) => {
    const own = Math.max(0, left(snaps[i]));
    const lot = catalog[sku].lot || null;
    return { sku, lot, available: lot ? Math.min(own, lotLeft[lot]) : own };
  });
  // Bags that can really go out: a lot's products together never exceed the lot.
  const groups = new Map();
  for (const b of beans) {
    const key = b.lot || `sku:${b.sku}`;
    const g = groups.get(key) || { sum: 0, cap: b.lot ? lotLeft[b.lot] : Infinity };
    g.sum += b.available;
    groups.set(key, g);
  }
  const totals = [...groups.values()].map((g) => Math.min(g.sum, g.cap));
  // Each delivery needs two different beans: at most one bag per bean group per delivery.
  return { beans, bagsAvailable: totals.reduce((n, v) => n + v, 0), beanGroupsInStock: totals.filter((v) => v > 0).length };
}

async function workList(db, { from, to } = {}, { now = Date.now(), catalog = CATALOG } = {}) {
  const today = jstDay(now);
  const start = from === undefined ? today : String(from);
  const end = to === undefined ? jstDay(now + 14 * 86400e3) : String(to);
  if (!DAY_RE.test(start) || !DAY_RE.test(end) || start > end) fail("INVALID_RANGE");
  // Deliveries due in the range, plus every open one before it (late, held, being prepared).
  const months = [];
  for (let m = plan.addMonths(start.slice(0, 7), -2); m <= end.slice(0, 7) && months.length < 30; m = plan.addMonths(m, 1)) months.push(m);
  const docs = (await db.collection(records.SHIPMENTS).where("month", "in", months).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const due = (s) => s.plannedDate || s.shipBy || null;
  const rows = docs.filter((s) => {
    const d = due(s);
    if (s.status === "preparing" || s.status === "held" || s.status === "needs_review") return true;
    if (s.status === "planned") return d !== null && d <= end;
    if (s.status === "shipped") return d !== null && d >= start && d <= end;
    return false;
  });
  const ids = [...new Set(rows.map((s) => s.subscriptionId))];
  const contracts = new Map();
  for (const id of ids) {
    const snap = await db.collection(records.SUBS).doc(id).get();
    if (snap.exists) contracts.set(id, snap.data());
  }
  const monthDocs = new Map();
  for (const key of [...new Set(rows.filter((s) => s.kind === "monthly").map((s) => `${s.subscriptionId}_${s.month}`))]) {
    const snap = await db.collection(records.MONTHS).doc(key).get();
    if (snap.exists) monthDocs.set(key, snap.data());
  }
  // The beans each contract last received (shipped or being prepared), so the shop can vary them.
  const history = new Map();
  for (const id of ids) {
    const all = (await db.collection(records.SHIPMENTS).where("subscriptionId", "==", id).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
    history.set(id, all.filter((s) => Array.isArray(s.beans) && s.beans.length && ["preparing", "shipped", "delivered"].includes(s.status)));
  }
  const deliveries = rows.map((s) => {
    const c = contracts.get(s.subscriptionId) || null;
    const date = due(s);
    const previous = (history.get(s.subscriptionId) || []).filter((h) => h.id !== s.id && String(due(h) || "") <= String(date || "9999"))
      .sort((a, b) => String(due(b) || "").localeCompare(String(due(a) || "")))[0] || null;
    const blocked = s.status === "shipped" ? [] : blockers({ shipment: s, contract: c, month: monthDocs.get(`${s.subscriptionId}_${s.month}`) || null });
    const repeated = previous && Array.isArray(s.beans) ? s.beans.filter((b) => previous.beans.some((p) => p.sku === b.sku)).map((b) => b.sku) : [];
    return {
      shipmentId: s.id, ref: contractRef(s.subscriptionId), kind: s.kind, month: s.month, seq: s.seq ?? null, date, byDate: !s.plannedDate && Boolean(s.shipBy),
      overdue: s.status !== "shipped" && date !== null && date < today, paidLate: s.paidLate === true, status: s.status,
      holdReason: s.holdReason || null, shortSkus: s.shortSkus || null, review: s.needsReview ? s.reviewReason || null : null,
      blockers: blocked, grams: s.grams || plan.GRAMS_PER_DELIVERY, beans: s.beans || null, trackingNumber: s.trackingNumber || null,
      previousBeans: previous ? previous.beans.map((b) => b.sku) : [], repeatedBeans: repeated,
      preference: c?.preference?.text || "", prefecture: c?.shipping?.prefecture || "", livemode: c?.livemode === true,
    };
  }).sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || a.ref.localeCompare(b.ref) || String(a.shipmentId).localeCompare(String(b.shipmentId)));
  const stock = await stockView(db, catalog);
  const toPrepare = deliveries.filter((d) => ["planned", "held"].includes(d.status) && !d.blockers.length);
  const bagsNeeded = toPrepare.length * BAGS_PER_DELIVERY;
  return {
    range: { from: start, to: end, today }, deliveries,
    counts: Object.fromEntries(["planned", "preparing", "held", "needs_review", "shipped"].map((k) => [k, deliveries.filter((d) => d.status === k).length])),
    stock: { ...stock, bagsNeeded, short: bagsNeeded > stock.bagsAvailable || (toPrepare.length > 0 && stock.beanGroupsInStock < BAGS_PER_DELIVERY) },
  };
}

// The address of one delivery, for its label: only while it is being prepared or once shipped (copied at preparation).
async function shippingLabel(db, shipmentId) {
  if (!SHIPMENT_ID_RE.test(String(shipmentId || ""))) fail("INVALID_SHIPMENT");
  const snap = await db.collection(records.SHIPMENTS).doc(shipmentId).get();
  if (!snap.exists) fail("UNKNOWN_SHIPMENT", 404);
  const s = snap.data();
  if (!["preparing", "shipped"].includes(s.status) || !s.shipTo) fail("NOT_PREPARED", 409);
  return { shipmentId, ref: contractRef(s.subscriptionId), beans: s.beans || [], grams: s.grams || plan.GRAMS_PER_DELIVERY, shipTo: s.shipTo };
}

// ---- Router (token of the shop; the actor is fixed here, never taken from the request) -----------------------------
const enabled = (env) => String(env.COFFEE_SUBSCRIPTION_FULFILLMENT_TOKEN || "").length >= 32;

function createRouter({ getDb, notify = async () => {}, env = process.env, clock = Date.now, log = console,
  limiter = createRateLimiter({ limit: 60, windowMs: 60 * 1000 }) } = {}) {
  const router = express.Router();
  const digest = (v) => crypto.createHash("sha256").update(String(v)).digest();
  router.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (!enabled(env)) return res.status(404).end();
    if (!limiter(clientKey(req).key)) return res.status(429).json({ error: "RATE_LIMITED" });
    const supplied = req.headers["x-fulfillment-admin-token"];
    if (typeof supplied !== "string" || !crypto.timingSafeEqual(digest(env.COFFEE_SUBSCRIPTION_FULFILLMENT_TOKEN), digest(supplied))) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }
    return next();
  });
  const actor = "shop:fulfillment-token";
  const handle = (fn) => async (req, res) => {
    try {
      const result = await fn(req.body || {}, req);
      if (result?.notify && result.applied !== false) {
        // The shop is told (contract number, delivery and beans only; no personal details). A failed mail never undoes
        // the hold: the work list shows it too.
        try { await notify({ type: result.review ? "inventory_inconsistency" : "out_of_stock", shipmentId: result.shipmentId,
          ref: contractRef(String(result.shipmentId).replace(/_(first|\d{4}-\d{2}_[1-4])$/, "")), shortSkus: result.shortSkus || [] }); } catch (error) {
          log.error("Fulfillment notice failed:", error.message);
        }
      }
      const { notify: _n, ...out } = result || {};
      return res.json(out);
    } catch (error) {
      if (error instanceof FulfillmentError) return res.status(error.status).json({ error: error.code, detail: error.detail ?? null });
      log.error("Fulfillment failed:", error.message);
      return res.status(500).json({ error: "FULFILLMENT_FAILED" });
    }
  };
  router.get("/work", handle((_b, req) => workList(getDb(), { from: req.query.from, to: req.query.to }, { now: clock() })));
  router.get("/label/:shipmentId", handle((_b, req) => shippingLabel(getDb(), req.params.shipmentId)));
  router.post("/prepare", handle((b) => prepareShipment(getDb(), { shipmentId: b.shipmentId, skus: b.skus, requestId: b.requestId, actor }, { now: clock() })));
  router.post("/ship", handle((b) => shipShipment(getDb(), { shipmentId: b.shipmentId, requestId: b.requestId, trackingNumber: b.trackingNumber, actor }, { now: clock() })));
  router.post("/hold", handle((b) => holdShipment(getDb(), { shipmentId: b.shipmentId, requestId: b.requestId, reason: b.reason, actor }, { now: clock() })));
  router.post("/resume", handle((b) => resumeShipment(getDb(), { shipmentId: b.shipmentId, requestId: b.requestId, actor }, { now: clock() })));
  return router;
}

module.exports = { PATH, OPS, BAGS_PER_DELIVERY, HOLD_REASONS, OPEN_STATES, FulfillmentError, beanOf, beanSkus, validBeans, blockers, readRelease,
  prepareShipment, shipShipment, holdShipment, resumeShipment, workList, stockView, shippingLabel, enabled, createRouter };
