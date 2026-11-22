"use strict";
// Factory (Jennifer) -> Ryuge-site: orders and refunds, signed. Off unless configured (404). 珈琲の定期便 can also be
// read here (server/factory-subscription-read.js), behind its own switch FACTORY_SUBSCRIPTION_READ_ENABLED.
//
// Every request needs, independently:
//  1. Service signature: X-Factory-Timestamp (13-digit ms, within ±5 min) and X-Factory-Signature =
//     hex HMAC-SHA256(FACTORY_REFUND_HMAC_SECRET, "POST\n/internal/factory/order-refund\n" + timestamp + "\n" + rawBody).
//     The secret is only on Render and on the Factory server; it is separate from any other secret.
//  2. A one-time nonce (UUID) in the signed body: a captured request cannot be replayed (factoryRefundRequests/{nonce}).
// Executing a refund additionally needs the CEO's approval record from Factory: its id (UUID, one approval = one
// refund, used as the refund id, so resending an approval never refunds twice), the approving Factory user id (must be
// FACTORY_CEO_USER_ID on Render) and the approval time (at most 15 minutes old). The approved planHash must equal the
// plan computed now (server/refunds.js re-checks the order, its Stripe charge and its stock reservation).
// The refund itself, the stock given back and the audit trail are server/refunds.js; this module only authenticates.
const crypto = require("node:crypto");
const refunds = require("./refunds");
const subscriptionRead = require("./factory-subscription-read");
const storeOps = require("./factory-store-ops");
const { createRateLimiter, clientKey } = require("./rate-limit");

const PATH = "/internal/factory/order-refund";
const DATE_WINDOW_MS = 5 * 60 * 1000;
const APPROVAL_MAX_AGE_MS = 15 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NONCES = "factoryRefundRequests";
const MAX_BODY = 8192;
// Read-only unless refunds are switched on separately: with only the three settings above, Factory can search and
// look up orders, and every refund operation (preview, apply, resume, status) is refused before anything is touched.
const READ_ONLY_OPS = new Set(["orders.search", "orders.get"]);
// 珈琲の定期便 (server/factory-subscription-read.js): read only, behind their own switch FACTORY_SUBSCRIPTION_READ_ENABLED
// (refused before anything is stored while it is off); contact details also need the CEO's fresh view record.
const SUBSCRIPTION_OPS = new Set(["subscriptions.list", "subscriptions.get", "subscriptions.schedule", "subscriptions.contact"]);
// The shop's sales and parcels (server/factory-store-ops.js, 2026-11-22): reading behind FACTORY_STORE_READ_ENABLED,
// 発送準備・発送済み behind FACTORY_STORE_SHIP_ENABLED and the CEO's approval record. Each refused before anything is stored.
const STORE_READ_OPS = new Set(["store.overview", "fulfillment.list"]);
const STORE_SHIP_OPS = new Set(["fulfillment.prepare", "fulfillment.ship"]);
const refundOpsEnabled = (env) => env.FACTORY_REFUND_OPS_ENABLED === "true";

function enabled(env) {
  return env.FACTORY_REFUND_API_ENABLED === "true" &&
    typeof env.FACTORY_REFUND_HMAC_SECRET === "string" && Buffer.byteLength(env.FACTORY_REFUND_HMAC_SECRET, "utf8") >= 32 &&
    UUID_RE.test(env.FACTORY_CEO_USER_ID || "");
}

function signatureFor(secret, timestamp, rawBody) {
  return crypto.createHmac("sha256", secret).update("POST\n" + PATH + "\n" + timestamp + "\n", "utf8").update(rawBody).digest("hex");
}

function verifySignature({ secret, timestamp, signature, rawBody, now }) {
  if (typeof timestamp !== "string" || !/^[0-9]{13}$/.test(timestamp) || Math.abs(now - Number(timestamp)) > DATE_WINDOW_MS) return false;
  if (typeof signature !== "string" || !/^[a-f0-9]{64}$/.test(signature) || !Buffer.isBuffer(rawBody)) return false;
  return crypto.timingSafeEqual(Buffer.from(signatureFor(secret, timestamp, rawBody), "hex"), Buffer.from(signature, "hex"));
}

class ApiError extends Error { constructor(code) { super(code); this.code = code; } }
const deny = (code) => { throw new ApiError(code); };

// Only these fields, per operation; anything else is refused (no hidden parameters such as an actor).
const FIELDS = {
  "orders.search": ["nonce", "op", "query"],
  "orders.get": ["nonce", "op", "orderId"],
  "refund.preview": ["nonce", "op", "orderId", "lines", "refundShipping", "acknowledgeExternalRefunds"],
  "refund.apply": ["nonce", "op", "orderId", "lines", "refundShipping", "acknowledgeExternalRefunds", "planHash", "approval"],
  "refund.resume": ["nonce", "op", "refundId"],
  "refund.status": ["nonce", "op", "refundId"],
  "subscriptions.list": ["nonce", "op", "query"],
  "subscriptions.get": ["nonce", "op", "subscription"],
  "subscriptions.schedule": ["nonce", "op", "range"],
  "subscriptions.contact": ["nonce", "op", "subscription", "view"],
  "store.overview": ["nonce", "op", "range"],
  "fulfillment.list": ["nonce", "op", "view", "kind"],
  "fulfillment.prepare": ["nonce", "op", "target", "skus", "approval"],
  "fulfillment.ship": ["nonce", "op", "target", "method", "trackingNumber", "approval"],
};

function parse(rawBody) {
  if (!Buffer.isBuffer(rawBody) || rawBody.length > MAX_BODY) deny("BODY_TOO_LARGE");
  let body;
  try { body = JSON.parse(rawBody.toString("utf8")); } catch { deny("INVALID_JSON"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) deny("INVALID_FIELDS");
  const allowed = FIELDS[body.op];
  if (!allowed) deny("INVALID_OPERATION");
  if (!Object.keys(body).every((k) => allowed.includes(k))) deny("INVALID_FIELDS");
  if (!UUID_RE.test(String(body.nonce || ""))) deny("NONCE_REQUIRED");
  return body;
}

function verifyCeoApproval(approval, env, now) {
  if (!approval || typeof approval !== "object" || Array.isArray(approval) ||
      Object.keys(approval).sort().join(",") !== "approvedAt,approvedBy,requestId") deny("CEO_APPROVAL_REQUIRED");
  if (approval.approvedBy !== env.FACTORY_CEO_USER_ID || !UUID_RE.test(String(approval.requestId))) deny("CEO_APPROVAL_REQUIRED");
  if (!Number.isSafeInteger(approval.approvedAt) || approval.approvedAt > now + 1000 || now - approval.approvedAt > APPROVAL_MAX_AGE_MS) {
    deny("CEO_APPROVAL_EXPIRED");
  }
  return approval;
}

const toMillis = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : v instanceof Date ? v.getTime() : v ?? null);
// The customer as Factory sees an order (refunds, the CEO's chat): name, email and address, never the phone (kept for
// the shipping label on the shop's own page only, 2026-11-21).
const customerForFactory = (c) => {
  if (!c) return null;
  const { phone: _phone, ...rest } = c;
  return rest;
};
function orderSummary(id, o) {
  return {
    orderId: id, status: o.status, amount: o.amount, subtotal: o.subtotal, shipping: o.shipping, couponCode: o.couponCode || "",
    items: o.items || [], customer: customerForFactory(o.customer), countryCode: o.countryCode || "", livemode: o.livemode === true,
    paidAt: toMillis(o.paidAt), amountRefunded: o.amountRefunded || 0, needsReview: o.needsReview === true,
    refundLedger: o.refundLedger ? { lines: o.refundLedger.lines || {}, shippingRefunded: o.refundLedger.shippingRefunded === true,
      inFlight: Object.keys(o.refundLedger.pending || {}), external: o.refundLedger.external || {} } : null,
  };
}
function refundSummary(id, r) {
  return {
    refundId: id, orderId: r.orderId, status: r.status, amount: r.amount, plan: r.plan, actor: r.actor, approval: r.approval,
    stripeRefundId: r.stripeRefundId || null, restocked: r.restocked || [], review: r.review || [],
    stripeFailedAfterSettle: r.stripeFailedAfterSettle || null, createdAt: toMillis(r.createdAt), settledAt: toMillis(r.settledAt),
    transitions: (r.transitions || []).map((t) => ({ ...t, at: toMillis(t.at) })),
  };
}

async function searchOrders(db, query = {}) {
  if (!query || typeof query !== "object") deny("INVALID_QUERY");
  if (query.orderId) {
    if (!/^pi_[A-Za-z0-9]{6,80}$/.test(String(query.orderId))) deny("INVALID_QUERY");
    const snap = await db.collection("orders").doc(query.orderId).get();
    return snap.exists ? [orderSummary(snap.id, snap.data())] : [];
  }
  const limit = Math.min(Math.max(Number.isSafeInteger(query.limit) ? query.limit : 20, 1), 50);
  let docs;
  if (query.email) {
    const typed = String(query.email).trim();
    if (!/^[^@\s]{1,100}@[^@\s]{1,150}$/.test(typed)) deny("INVALID_QUERY");
    // The email as Stripe stored it may differ in case: both spellings. Equality only (no composite index needed);
    // newest first, sorted here.
    const spellings = [...new Set([typed, typed.toLowerCase()])];
    docs = (await db.collection("orders").where("customer.email", "in", spellings).limit(50).get()).docs;
  } else {
    docs = (await db.collection("orders").orderBy("paidAt", "desc").limit(limit).get()).docs;
  }
  return docs.map((d) => orderSummary(d.id, d.data())).sort((a, b) => (b.paidAt || 0) - (a.paidAt || 0)).slice(0, limit);
}

async function process_({ db, stripe, env, rawBody, timestamp, signature, now, sendMail = async () => {}, log = console, onMailFailed = null, onStockShort = null }) {
  if (!enabled(env)) deny("DISABLED");
  if (!verifySignature({ secret: env.FACTORY_REFUND_HMAC_SECRET, timestamp, signature, rawBody, now })) deny("INVALID_FACTORY_SIGNATURE");
  const body = parse(rawBody);
  // Before the nonce is stored: a refused refund operation leaves no trace in Firestore and never reaches Stripe.
  if (SUBSCRIPTION_OPS.has(body.op)) {
    if (!subscriptionRead.readEnabled(env)) deny("SUBSCRIPTION_READ_DISABLED");
  } else if (STORE_READ_OPS.has(body.op)) {
    if (!storeOps.readEnabled(env)) deny("STORE_READ_DISABLED");
  } else if (STORE_SHIP_OPS.has(body.op)) {
    if (!storeOps.shipEnabled(env)) deny("STORE_SHIP_DISABLED");
    verifyCeoApproval(body.approval, env, now);
  } else if (!READ_ONLY_OPS.has(body.op) && !refundOpsEnabled(env)) deny("REFUND_OPS_DISABLED");
  // One-time nonce: a captured request is refused the second time, whatever it asks.
  try {
    await db.collection(NONCES).doc(body.nonce).create({ op: body.op, at: new Date(now), signedAt: new Date(Number(timestamp)) });
  } catch {
    deny("REPLAYED_REQUEST");
  }
  const request = { orderId: body.orderId, lines: body.lines, refundShipping: body.refundShipping, acknowledgeExternalRefunds: body.acknowledgeExternalRefunds };
  switch (body.op) {
    case "orders.search": return { orders: await searchOrders(db, body.query) };
    case "orders.get": {
      if (!/^pi_[A-Za-z0-9]{6,80}$/.test(String(body.orderId))) deny("INVALID_QUERY");
      const snap = await db.collection("orders").doc(body.orderId).get();
      if (!snap.exists) return { order: null, refunds: [] };
      const list = (await db.collection("orderRefunds").where("orderId", "==", body.orderId).limit(50).get()).docs;
      return { order: orderSummary(snap.id, snap.data()), refunds: list.map((d) => refundSummary(d.id, d.data())).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)) };
    }
    case "refund.preview": return refunds.previewRefund(db, stripe, request);
    case "refund.apply": {
      const approval = verifyCeoApproval(body.approval, env, now);
      return refunds.applyRefund(db, stripe, request, {
        planHash: body.planHash, refundId: approval.requestId, actor: "factory-ceo:" + env.FACTORY_CEO_USER_ID,
        approval: `Factory CEO approval ${approval.requestId} at ${new Date(approval.approvedAt).toISOString()}`,
      });
    }
    case "refund.resume": return refunds.resumeRefund(db, stripe, body.refundId);
    case "refund.status": {
      if (!UUID_RE.test(String(body.refundId))) deny("INVALID_QUERY");
      const snap = await db.collection("orderRefunds").doc(body.refundId).get();
      return { refund: snap.exists ? refundSummary(snap.id, snap.data()) : null };
    }
    case "subscriptions.list": return subscriptionRead.listSubscriptions(db, body.query, now);
    case "subscriptions.get": return subscriptionRead.getSubscription(db, body.subscription, now);
    case "subscriptions.schedule": return subscriptionRead.schedule(db, body.range, now);
    case "subscriptions.contact": return subscriptionRead.contact(db, body.subscription, body.view, env, now);
    case "store.overview": return storeOps.overview(db, body.range, now);
    case "fulfillment.list": return storeOps.list(db, { view: body.view, kind: body.kind }, now);
    case "fulfillment.prepare":
      return storeOps.prepare(db, { target: body.target, skus: body.skus, approval: body.approval }, { actor: "factory-ceo:" + env.FACTORY_CEO_USER_ID, now, onStockShort });
    case "fulfillment.ship":
      return storeOps.ship(db, { target: body.target, method: body.method, trackingNumber: body.trackingNumber, approval: body.approval },
        { actor: "factory-ceo:" + env.FACTORY_CEO_USER_ID, now, sendMail, log, onMailFailed });
    default: return deny("INVALID_OPERATION");
  }
}

const STATUS = {
  INVALID_FACTORY_SIGNATURE: 401, REFUND_OPS_DISABLED: 403, CEO_APPROVAL_REQUIRED: 403, CEO_APPROVAL_EXPIRED: 403, REPLAYED_REQUEST: 409,
  BODY_TOO_LARGE: 413, INVALID_JSON: 400, INVALID_FIELDS: 400, INVALID_OPERATION: 400, NONCE_REQUIRED: 400, INVALID_QUERY: 400,
  SUBSCRIPTION_READ_DISABLED: 403, STORE_READ_DISABLED: 403, STORE_SHIP_DISABLED: 403, CEO_VIEW_REQUIRED: 403, CEO_VIEW_EXPIRED: 403, UNKNOWN_SUBSCRIPTION: 404, AMBIGUOUS_SUBSCRIPTION: 409, INVALID_RANGE: 400,
};
const REFUND_CONFLICTS = ["PLAN_CHANGED", "EXCEEDS_REMAINING_QUANTITY", "SHIPPING_ALREADY_REFUNDED", "ALREADY_FULLY_REFUNDED",
  "EXTERNAL_REFUNDS_PRESENT", "EXCEEDS_STRIPE_REFUNDABLE", "EXCEEDS_ORDER_TOTAL", "REFUND_ID_CONFLICT"];

function createHandler({ getDb, getStripe, env = process.env, limiter = createRateLimiter({ limit: 30, windowMs: 60 * 1000 }), clock = Date.now, log = console,
  sendMail = async () => {}, onMailFailed = null, onStockShort = null } = {}) {
  return async function factoryOrderRefund(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (!enabled(env)) return res.status(404).end();
    if (!limiter(clientKey(req).key)) return res.status(429).json({ error: "RATE_LIMITED" });
    try {
      const result = await process_({ db: getDb(), stripe: getStripe(), env, rawBody: req.body, now: clock(),
        timestamp: req.get("x-factory-timestamp"), signature: req.get("x-factory-signature"), sendMail, log, onMailFailed, onStockShort });
      return res.json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof ApiError || error instanceof subscriptionRead.ReadError) {
        const status = STATUS[error.code] || 400;
        if (status === 401 || status === 403 || status === 409) log.warn("Factory refund request refused:", error.code);
        return res.status(status).json({ error: error.code });
      }
      // The shop's own refusals (shipping state, beans, method, tracking number), passed on as they are.
      if (error instanceof storeOps.StoreOpsError || error?.constructor?.name === "OrderFulfillmentError" || error?.constructor?.name === "FulfillmentError") {
        return res.status(error.status || 400).json({ error: error.code, detail: error.detail ?? null });
      }
      if (error instanceof refunds.RefundError) {
        return res.status(REFUND_CONFLICTS.includes(error.code) ? 409 : 400).json({ error: error.code, detail: error.detail ?? null });
      }
      log.error("Factory refund request failed:", String(error && error.message).slice(0, 120));
      return res.status(500).json({ error: "FACTORY_REFUND_FAILED" });
    }
  };
}

module.exports = { PATH, enabled, refundOpsEnabled, signatureFor, verifySignature, verifyCeoApproval, createHandler, process: process_ };
