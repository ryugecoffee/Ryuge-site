"use strict";

// Refunds and partial cancellations of paid store orders (2026-11-17), with stock given back only where it is safe.
//
// Flow: preview (reads the order, its Stripe charge and its stock reservation; writes nothing) -> the CEO approves that
// preview (planHash) -> apply (re-checks everything, records the approved refund, asks Stripe, then settles) ->
// resume (finishes a refund whose Stripe answer was lost) . Webhook: syncRefunds (charge.refunded) settles our own
// refunds and records refunds made elsewhere (e.g. the Stripe dashboard) WITHOUT giving stock back.
//
// Rules:
// - Never more than was bought: per line, refunded + in-flight <= ordered; shipping at most once; the amount never
//   exceeds what Stripe still holds on the charge.
// - Stock comes back only after Stripe reports the refund succeeded, only for units the CEO marked as not shipped, and
//   only up to what the order's paid stock reservation actually took (orders paid while inventory was off took none).
//   The shared Brazil lot comes back with its products.
// - Every step is idempotent: the Stripe refund uses an idempotency key and carries orderRefundId in its metadata;
//   orderRefunds/{id}.status moves approved -> stripe_pending? -> refunded | failed exactly once, in a transaction
//   together with the order ledger and the stock.
// - Audit: orderRefunds/{id} keeps the plan, the approval, the actor, the Stripe refund id, stock given back and each
//   transition. Callers pass a trusted actor (a token holder today; later the Factory/Jennifer signed CEO approval).
//
// Order ledger (orders/{paymentIntentId}.refundLedger):
//   { version, lines: { [sku]: { quantity, amount, restocked } }, shippingRefunded, shippingAmount,
//     pending: { [refundId]: { lines: [{ id, quantity, restock }], shipping } },
//     external: { [stripeRefundId]: { amount, at } } }
const crypto = require("node:crypto");
const { lotOf: catalogLotOf } = require("./catalog");

const ORDERS = "orders";
const REFUNDS = "orderRefunds";
const RESERVATIONS = "inventoryReservations";
const ID_RE = /^pi_[A-Za-z0-9]{6,80}$/;
const REFUND_ID_RE = /^[a-f0-9-]{36}$/;

class RefundError extends Error {
  constructor(code, detail) { super(code); this.code = code; this.detail = detail; }
}
const fail = (code, detail) => { throw new RefundError(code, detail); };
const int = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : 0);

function emptyLedger() {
  return { version: 0, lines: {}, shippingRefunded: false, shippingAmount: 0, pending: {}, external: {} };
}
function ledgerOf(order) {
  const l = order.refundLedger || {};
  return { ...emptyLedger(), ...l, lines: { ...(l.lines || {}) }, pending: { ...(l.pending || {}) }, external: { ...(l.external || {}) } };
}

// What each line really cost after the coupon. The order keeps list prices per line and the discounted subtotal;
// the discount is shared in proportion to each line's list total (largest remainder, so the lines add up exactly).
function lineNets(order) {
  const items = order.items || [];
  const gross = items.map((i) => int(i.unitPrice) * int(i.quantity));
  const total = gross.reduce((a, b) => a + b, 0);
  const subtotal = Number.isSafeInteger(order.subtotal) && order.subtotal >= 0 && order.subtotal <= total ? order.subtotal : total;
  const discount = total - subtotal;
  if (!discount || !total) return Object.fromEntries(items.map((i, n) => [i.id, gross[n]]));
  const exact = gross.map((g) => (discount * g) / total);
  const share = exact.map(Math.floor);
  let left = discount - share.reduce((a, b) => a + b, 0);
  const order_ = exact.map((e, n) => [e - share[n], n]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, n] of order_) { if (!left) break; share[n] += 1; left -= 1; }
  return Object.fromEntries(items.map((i, n) => [i.id, gross[n] - share[n]]));
}

// Amount for k more units of a line: proportional to what is left of the line, and exactly the rest for the last unit.
function lineRefundAmount(net, quantity, refundedQty, refundedAmount, k) {
  const remainingQty = quantity - refundedQty;
  const remainingNet = net - refundedAmount;
  if (k <= 0 || remainingQty <= 0) return 0;
  return k === remainingQty ? remainingNet : Math.floor((remainingNet * k) / remainingQty);
}

const pendingFor = (ledger, sku, field) => Object.values(ledger.pending)
  .flatMap((p) => p.lines || []).filter((l) => l.id === sku).reduce((sum, l) => sum + int(l[field]), 0);

async function readContext(db, stripe, orderId) {
  if (!ID_RE.test(String(orderId || ""))) fail("INVALID_ORDER");
  const orderSnap = await db.collection(ORDERS).doc(orderId).get();
  if (!orderSnap.exists) fail("UNKNOWN_ORDER");
  const order = orderSnap.data();
  if (order.status === "refunded") fail("ALREADY_FULLY_REFUNDED");
  if (!["paid", "partially_refunded"].includes(order.status)) fail("ORDER_NOT_REFUNDABLE");
  const intent = await stripe.paymentIntents.retrieve(orderId, { expand: ["latest_charge"] });
  const charge = intent && typeof intent.latest_charge === "object" ? intent.latest_charge : null;
  if (!intent || intent.status !== "succeeded" || !charge) fail("PAYMENT_NOT_REFUNDABLE");
  const captured = int(charge.amount_captured ?? charge.amount);
  const stripeRefunded = int(charge.amount_refunded);
  let reservation = null;
  if (order.inventoryReservationId && REFUND_ID_RE.test(order.inventoryReservationId)) {
    const r = await db.collection(RESERVATIONS).doc(order.inventoryReservationId).get();
    if (r.exists) reservation = r.data();
  }
  return { order, ledger: ledgerOf(order), charge: { id: charge.id, captured, refunded: stripeRefunded }, reservation };
}

// Units of a product that this order's paid reservation actually took from stock.
function stockTaken(reservation, sku) {
  if (!reservation || reservation.status !== "paid") return 0;
  return (reservation.items || []).filter((i) => i.id === sku).reduce((sum, i) => sum + int(i.quantity), 0);
}

function normalizeRequest(input) {
  const lines = Array.isArray(input?.lines) ? input.lines : [];
  if (lines.length > 25) fail("INVALID_REQUEST");
  const seen = new Set();
  const norm = lines.map((l) => {
    const id = String(l?.id || "");
    if (!/^[a-z0-9-]{1,90}$/.test(id) || seen.has(id)) fail("INVALID_REQUEST");
    if (!Number.isSafeInteger(l.quantity) || l.quantity < 1 || l.quantity > 1000) fail("INVALID_QUANTITY");
    if (typeof l.shipped !== "boolean") fail("SHIPPED_STATE_REQUIRED", id); // the CEO states it for every line
    seen.add(id);
    return { id, quantity: l.quantity, shipped: l.shipped };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const refundShipping = input?.refundShipping === true;
  if (!norm.length && !refundShipping) fail("NOTHING_TO_REFUND");
  return { lines: norm, refundShipping, acknowledgeExternalRefunds: input?.acknowledgeExternalRefunds === true };
}

function buildPlan(ctx, request, lotOf) {
  const { order, ledger, charge, reservation } = ctx;
  const items = Object.fromEntries((order.items || []).map((i) => [i.id, i]));
  const nets = lineNets(order);
  const lines = request.lines.map((l) => {
    const item = items[l.id];
    if (!item) fail("NOT_IN_ORDER", l.id);
    const done = ledger.lines[l.id] || { quantity: 0, amount: 0, restocked: 0 };
    const inFlight = pendingFor(ledger, l.id, "quantity");
    const remaining = int(item.quantity) - int(done.quantity) - inFlight;
    if (l.quantity > remaining) fail("EXCEEDS_REMAINING_QUANTITY", { id: l.id, remaining });
    // In-flight units are priced as if already refunded, so two refunds can never take the same yen.
    const pendingAmount = Object.values(ledger.pending).flatMap((p) => p.lines || []).filter((x) => x.id === l.id).reduce((s, x) => s + int(x.amount), 0);
    const amount = lineRefundAmount(nets[l.id], int(item.quantity), int(done.quantity) + inFlight, int(done.amount) + pendingAmount, l.quantity);
    const restockable = Math.max(0, stockTaken(reservation, l.id) - int(done.restocked) - pendingFor(ledger, l.id, "restock"));
    const restock = l.shipped ? 0 : Math.min(l.quantity, restockable);
    const restockNote = l.shipped ? "SHIPPED" : restock < l.quantity ? (stockTaken(reservation, l.id) ? "PARTLY_ALREADY_RETURNED" : "STOCK_NOT_TAKEN_BY_THIS_ORDER") : "UNSHIPPED";
    return { id: l.id, quantity: l.quantity, shipped: l.shipped, unitPrice: int(item.unitPrice), amount, restock, restockNote, lot: restock ? lotOf(l.id) : null };
  });
  const shippingPending = Object.values(ledger.pending).some((p) => p.shipping);
  if (request.refundShipping && (ledger.shippingRefunded || shippingPending)) fail("SHIPPING_ALREADY_REFUNDED");
  if (request.refundShipping && !int(order.shipping)) fail("NO_SHIPPING_TO_REFUND");
  const shippingAmount = request.refundShipping ? int(order.shipping) : 0;
  const amount = lines.reduce((s, l) => s + l.amount, 0) + shippingAmount;
  if (amount <= 0) fail("NOTHING_TO_REFUND");
  const externalTotal = Object.values(ledger.external).reduce((s, e) => s + int(e.amount), 0);
  if (externalTotal && !request.acknowledgeExternalRefunds) fail("EXTERNAL_REFUNDS_PRESENT", { externalTotal });
  const stripeRemaining = charge.captured - charge.refunded;
  if (amount > stripeRemaining) fail("EXCEEDS_STRIPE_REFUNDABLE", { stripeRemaining });
  const ourRefunded = Object.values(ledger.lines).reduce((s, x) => s + int(x.amount), 0) + int(ledger.shippingAmount);
  const pendingTotal = Object.values(ledger.pending).reduce((s, p) => s + int(p.amount), 0);
  if (ourRefunded + pendingTotal + externalTotal + amount > int(order.amount)) fail("EXCEEDS_ORDER_TOTAL");
  const stock = {};
  for (const l of lines) if (l.restock) {
    stock[`inventory/${l.id}`] = (stock[`inventory/${l.id}`] || 0) + l.restock;
    if (l.lot) stock[`inventoryLots/${l.lot}`] = (stock[`inventoryLots/${l.lot}`] || 0) + l.restock;
  }
  return { lines, shipping: request.refundShipping, shippingAmount, amount, stock, stripeRemaining, externalTotal };
}

function hashOf(orderId, plan, ctx) {
  const state = { version: int(ctx.ledger.version), chargeRefunded: ctx.charge.refunded, pending: Object.keys(ctx.ledger.pending).sort(),
    external: Object.keys(ctx.ledger.external).sort(), reservation: ctx.reservation?.status || null };
  return crypto.createHash("sha256").update(JSON.stringify({ orderId, plan, state })).digest("hex");
}

async function previewRefund(db, stripe, input, { lotOf = catalogLotOf } = {}) {
  const request = normalizeRequest(input);
  const ctx = await readContext(db, stripe, input.orderId);
  const plan = buildPlan(ctx, request, lotOf);
  const { order, ledger } = ctx;
  return {
    orderId: input.orderId,
    order: { amount: order.amount, subtotal: order.subtotal, shipping: order.shipping, couponCode: order.couponCode || "", items: order.items,
      status: order.status, livemode: order.livemode === true, paidAt: order.paidAt || null },
    alreadyRefunded: { lines: ledger.lines, shipping: ledger.shippingRefunded, external: ledger.external, inFlight: Object.keys(ledger.pending) },
    ledgerVersion: int(ledger.version),
    stripe: { chargeId: ctx.charge.id, captured: ctx.charge.captured, refunded: ctx.charge.refunded, remaining: plan.stripeRemaining },
    plan,
    planHash: hashOf(input.orderId, plan, ctx),
  };
}

function definiteStripeFailure(error) {
  // A 4xx answer means Stripe refused and created nothing; anything else (network, 5xx) may have created the refund.
  const status = Number(error?.statusCode);
  return Number.isInteger(status) && status >= 400 && status < 500 && status !== 409 && status !== 429;
}

const transition = (doc, status, extra = {}) => [...(doc.transitions || []), { status, at: new Date(), ...extra }];

async function applyRefund(db, stripe, input, { planHash, approval, actor, refundId = crypto.randomUUID(), lotOf = catalogLotOf } = {}) {
  if (!/^[a-f0-9]{64}$/.test(String(planHash || ""))) fail("PLAN_HASH_REQUIRED");
  const note = String(approval || "").trim();
  if (note.length < 4 || note.length > 500) fail("APPROVAL_REQUIRED");
  if (typeof actor !== "string" || !/^[a-z0-9:_-]{3,120}$/i.test(actor)) fail("ACTOR_REQUIRED");
  if (!REFUND_ID_RE.test(refundId)) fail("INVALID_REFUND_ID");
  const refundRef = db.collection(REFUNDS).doc(refundId);
  const existing = await refundRef.get();
  if (existing.exists) {
    if (existing.data().planHash !== planHash) fail("REFUND_ID_CONFLICT");
    return resumeRefund(db, stripe, refundId, { lotOf });
  }
  const preview = await previewRefund(db, stripe, input, { lotOf });
  if (preview.planHash !== planHash) fail("PLAN_CHANGED");
  const { orderId, plan } = preview;
  const orderRef = db.collection(ORDERS).doc(orderId);
  await db.runTransaction(async (tx) => {
    const [orderSnap, refundSnap] = await Promise.all([tx.get(orderRef), tx.get(refundRef)]);
    if (refundSnap.exists) fail("REFUND_ID_CONFLICT");
    const ledger = ledgerOf(orderSnap.data());
    // Every ledger change (refund started, settled, failed, external refund seen) bumps the version: the approved
    // preview still describes the order only if the version is unchanged.
    if (int(ledger.version) !== preview.ledgerVersion) fail("PLAN_CHANGED");
    ledger.pending[refundId] = { lines: plan.lines.map((l) => ({ id: l.id, quantity: l.quantity, amount: l.amount, restock: l.restock })), shipping: plan.shipping, amount: plan.amount };
    ledger.version = int(ledger.version) + 1;
    tx.update(orderRef, { refundLedger: ledger });
    tx.create(refundRef, {
      orderId, planHash, plan, amount: plan.amount, approval: note, actor, livemode: preview.order.livemode,
      status: "approved", createdAt: new Date(), transitions: [{ status: "approved", at: new Date(), actor }],
    });
  });
  return sendToStripe(db, stripe, refundId, { lotOf });
}

async function sendToStripe(db, stripe, refundId, { lotOf }) {
  const doc = (await db.collection(REFUNDS).doc(refundId).get()).data();
  let refund;
  try {
    // Same idempotency key on every attempt: Stripe returns the same refund instead of creating a second one.
    refund = await stripe.refunds.create({
      payment_intent: doc.orderId, amount: doc.amount, reason: "requested_by_customer",
      metadata: { orderRefundId: refundId, orderId: doc.orderId },
    }, { idempotencyKey: `ryuge-order-refund-${refundId}` });
  } catch (error) {
    if (definiteStripeFailure(error)) return markFailed(db, refundId, { code: String(error.code || error.type || "stripe_error") });
    return { refundId, status: "approved", retry: true, error: "STRIPE_UNCONFIRMED" };
  }
  return settleRefund(db, refundId, refund, { lotOf });
}

async function markFailed(db, refundId, detail) {
  const refundRef = db.collection(REFUNDS).doc(refundId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(refundRef);
    const doc = snap.data();
    if (["refunded", "failed"].includes(doc.status)) return { refundId, status: doc.status };
    const orderRef = db.collection(ORDERS).doc(doc.orderId);
    const ledger = ledgerOf((await tx.get(orderRef)).data());
    delete ledger.pending[refundId];
    ledger.version = int(ledger.version) + 1;
    tx.update(orderRef, { refundLedger: ledger });
    tx.update(refundRef, { status: "failed", failure: detail, transitions: transition(doc, "failed", detail) });
    return { refundId, status: "failed", failure: detail };
  });
}

// Settles our refund from Stripe's answer, once: ledger, stock and the refund record in one transaction.
async function settleRefund(db, refundId, stripeRefund, { lotOf = catalogLotOf } = {}) {
  if (!stripeRefund || stripeRefund.metadata?.orderRefundId !== refundId) fail("STRIPE_REFUND_MISMATCH");
  const refundRef = db.collection(REFUNDS).doc(refundId);
  if (["failed", "canceled"].includes(stripeRefund.status)) {
    const current = (await refundRef.get()).data();
    // Stripe can report a refund as succeeded and fail it later (it sends charge.refund.updated). Stock already given
    // back is not taken again automatically (it may have been sold since): the refund and the order are flagged.
    if (current?.status === "refunded") return flagFailedAfterSettle(db, refundId, stripeRefund);
    return markFailed(db, refundId, { code: `stripe_${stripeRefund.status}` });
  }
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(refundRef);
    if (!snap.exists) fail("UNKNOWN_REFUND");
    const doc = snap.data();
    if (doc.status === "refunded" || doc.status === "failed") return { refundId, status: doc.status, duplicate: true };
    if (int(stripeRefund.amount) !== int(doc.amount)) fail("STRIPE_AMOUNT_MISMATCH");
    if (stripeRefund.status !== "succeeded") {
      if (doc.status !== "stripe_pending") {
        tx.update(refundRef, { status: "stripe_pending", stripeRefundId: stripeRefund.id, transitions: transition(doc, "stripe_pending", { stripeStatus: stripeRefund.status }) });
      }
      return { refundId, status: "stripe_pending", stripeRefundId: stripeRefund.id };
    }
    const orderRef = db.collection(ORDERS).doc(doc.orderId);
    const restockLines = doc.plan.lines.filter((l) => l.restock > 0);
    const stockRefs = restockLines.map((l) => db.collection("inventory").doc(l.id));
    const lots = [...new Set(restockLines.map((l) => lotOf(l.id)).filter(Boolean))];
    const lotRefs = lots.map((lot) => db.collection("inventoryLots").doc(lot));
    const orderSnap = await tx.get(orderRef);
    const stockSnaps = await Promise.all(stockRefs.map((r) => tx.get(r)));
    const lotSnaps = await Promise.all(lotRefs.map((r) => tx.get(r)));
    const ledger = ledgerOf(orderSnap.data());
    const pending = ledger.pending[refundId];
    if (!pending) fail("LEDGER_INCONSISTENT");
    // Stock back, only what the order took and only while the counters agree; otherwise keep the refund, flag review.
    const restocked = [];
    const review = [];
    const lotGive = {};
    restockLines.forEach((l, n) => {
      const s = stockSnaps[n].exists ? stockSnaps[n].data() : null;
      if (!s || int(s.sold) < l.restock) { review.push({ id: l.id, reason: "STOCK_COUNTER_MISMATCH" }); return; }
      tx.update(stockRefs[n], { ready: int(s.ready) + l.restock, sold: int(s.sold) - l.restock });
      restocked.push({ id: l.id, quantity: l.restock });
      const lot = lotOf(l.id);
      if (lot) lotGive[lot] = (lotGive[lot] || 0) + l.restock;
    });
    lots.forEach((lot, n) => {
      if (!lotGive[lot]) return;
      const s = lotSnaps[n].exists ? lotSnaps[n].data() : null;
      if (!s || int(s.sold) < lotGive[lot]) { review.push({ lot, reason: "LOT_COUNTER_MISMATCH" }); return; }
      tx.update(lotRefs[n], { ready: int(s.ready) + lotGive[lot], sold: int(s.sold) - lotGive[lot] });
    });
    for (const l of doc.plan.lines) {
      const done = ledger.lines[l.id] || { quantity: 0, amount: 0, restocked: 0 };
      const back = restocked.find((r) => r.id === l.id)?.quantity || 0;
      ledger.lines[l.id] = { quantity: int(done.quantity) + l.quantity, amount: int(done.amount) + l.amount, restocked: int(done.restocked) + back };
    }
    if (doc.plan.shipping) { ledger.shippingRefunded = true; ledger.shippingAmount = int(doc.plan.shippingAmount); }
    delete ledger.pending[refundId];
    ledger.version = int(ledger.version) + 1;
    const order = orderSnap.data();
    const ours = Object.values(ledger.lines).reduce((s, x) => s + int(x.amount), 0) + int(ledger.shippingAmount);
    const external = Object.values(ledger.external).reduce((s, e) => s + int(e.amount), 0);
    const totalRefunded = Math.max(int(order.amountRefunded), ours + external);
    tx.update(orderRef, {
      refundLedger: ledger, amountRefunded: totalRefunded,
      status: totalRefunded >= int(order.amount) ? "refunded" : "partially_refunded",
      ...(review.length ? { needsReview: true } : {}),
    });
    tx.update(refundRef, {
      status: "refunded", stripeRefundId: stripeRefund.id, restocked, ...(review.length ? { review } : {}), settledAt: new Date(),
      transitions: transition(doc, "refunded", { stripeRefundId: stripeRefund.id }),
    });
    return { refundId, status: "refunded", stripeRefundId: stripeRefund.id, restocked, review };
  });
}

async function flagFailedAfterSettle(db, refundId, stripeRefund) {
  const refundRef = db.collection(REFUNDS).doc(refundId);
  return db.runTransaction(async (tx) => {
    const doc = (await tx.get(refundRef)).data();
    if (doc.stripeFailedAfterSettle) return { refundId, status: doc.status, stripeStatus: stripeRefund.status, duplicate: true };
    const orderRef = db.collection(ORDERS).doc(doc.orderId);
    await tx.get(orderRef);
    tx.update(orderRef, { needsReview: true });
    tx.update(refundRef, {
      stripeFailedAfterSettle: stripeRefund.status, review: [...(doc.review || []), { reason: "STRIPE_REFUND_FAILED_AFTER_SETTLE" }],
      transitions: transition(doc, "stripe_failed_after_settle", { stripeStatus: stripeRefund.status }),
    });
    return { refundId, status: doc.status, stripeStatus: stripeRefund.status, review: ["STRIPE_REFUND_FAILED_AFTER_SETTLE"] };
  });
}

// Finishes a refund whose Stripe answer was lost or still pending. Looks the refund up at Stripe first (by its
// orderRefundId), so a refund that Stripe did create is never created twice, even after the idempotency key expired.
async function resumeRefund(db, stripe, refundId, { lotOf = catalogLotOf } = {}) {
  if (!REFUND_ID_RE.test(String(refundId))) fail("INVALID_REFUND_ID");
  const snap = await db.collection(REFUNDS).doc(refundId).get();
  if (!snap.exists) fail("UNKNOWN_REFUND");
  const doc = snap.data();
  if (["refunded", "failed"].includes(doc.status)) return { refundId, status: doc.status };
  const list = await stripe.refunds.list({ payment_intent: doc.orderId, limit: 100 });
  const found = (list.data || []).find((r) => r.metadata?.orderRefundId === refundId);
  if (found) return settleRefund(db, refundId, found, { lotOf });
  if (doc.status === "stripe_pending") return { refundId, status: "stripe_pending" };
  return sendToStripe(db, stripe, refundId, { lotOf });
}

// Webhook (charge.refunded): our refunds are settled; refunds made elsewhere are recorded for review, never restocked.
async function syncRefunds(db, stripe, paymentIntentId, { lotOf = catalogLotOf } = {}) {
  if (!ID_RE.test(String(paymentIntentId || ""))) return { synced: false, reason: "NO_PAYMENT_INTENT" };
  const orderRef = db.collection(ORDERS).doc(paymentIntentId);
  if (!(await orderRef.get()).exists) return { synced: false, reason: "UNKNOWN_ORDER" };
  const list = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100 });
  const results = [];
  for (const refund of list.data || []) {
    const ours = refund.metadata?.orderRefundId;
    if (ours && REFUND_ID_RE.test(ours) && (await db.collection(REFUNDS).doc(ours).get()).exists) {
      results.push(await settleRefund(db, ours, refund, { lotOf }));
    }
  }
  const succeeded = (list.data || []).filter((r) => r.status === "succeeded");
  const stripeTotal = succeeded.reduce((s, r) => s + int(r.amount), 0);
  await db.runTransaction(async (tx) => {
    const order = (await tx.get(orderRef)).data();
    const ledger = ledgerOf(order);
    const refundDocs = await Promise.all(succeeded.map((r) => (r.metadata?.orderRefundId && REFUND_ID_RE.test(r.metadata.orderRefundId)
      ? tx.get(db.collection(REFUNDS).doc(r.metadata.orderRefundId)) : Promise.resolve({ exists: false }))));
    let added = false;
    succeeded.forEach((r, n) => {
      if (refundDocs[n].exists || ledger.external[r.id]) return;
      ledger.external[r.id] = { amount: int(r.amount), at: new Date((int(r.created) || Date.now() / 1000) * 1000) };
      added = true;
    });
    const total = Math.max(stripeTotal, int(order.amountRefunded));
    const patch = { amountRefunded: total, refundedAt: new Date() };
    if (total > 0) patch.status = total >= int(order.amount) ? "refunded" : "partially_refunded";
    if (added) { ledger.version = int(ledger.version) + 1; patch.refundLedger = ledger; patch.needsReview = true; }
    tx.update(orderRef, patch);
  });
  return { synced: true, settled: results, stripeRefunded: stripeTotal };
}

module.exports = { RefundError, lineNets, lineRefundAmount, previewRefund, applyRefund, resumeRefund, settleRefund, syncRefunds };
