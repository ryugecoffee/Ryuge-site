"use strict";
// Factory -> Render: signed service request. Sandbox-only by default.
//
// Two independent conditions must BOTH hold before any inventory write:
//  1. Service authentication: HMAC-SHA256 over method, path, timestamp and the exact
//     body bytes with a shared secret held only by Render and the Factory server.
//  2. CEO operation approval: the signed body must carry the approval record ID
//     (used as the idempotent requestId), the approving Factory user ID, which must
//     equal the CEO ID configured on Render, and a fresh approval time.
// The audit actor is derived from Render configuration, never from free-form input.
const crypto = require("node:crypto");
const { adjustInventory } = require("./inventory-adjustments");
const { createRateLimiter, clientKey } = require("./rate-limit");

const PATH = "/internal/factory/inventory-adjust";
const DATE_WINDOW_MS = 5 * 60 * 1000;
const APPROVAL_MAX_AGE_MS = 15 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FIELDS = ["action", "approvedAt", "approvedBy", "quantity", "requestId", "sku"];

function enabled(env) {
  return env.INVENTORY_STAGING_ONLY === "true" &&
    env.FIRESTORE_CHECKOUT_ENABLED === "true" &&
    env.FIRESTORE_FACTORY_API_ENABLED === "true" &&
    env.FIREBASE_PROJECT_ID === "ryuge-inventory" &&
    env.FIREBASE_CLIENT_EMAIL ===
      "ryuge-inventory-render@ryuge-inventory.iam.gserviceaccount.com" &&
    /^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY || "") &&
    UUID_RE.test(env.FACTORY_CEO_USER_ID || "") &&
    typeof env.FACTORY_INVENTORY_HMAC_SECRET === "string" &&
    Buffer.byteLength(env.FACTORY_INVENTORY_HMAC_SECRET, "utf8") >= 32;
}

function signatureFor(secret, timestamp, rawBody) {
  return crypto.createHmac("sha256", secret)
    .update("POST\n" + PATH + "\n" + timestamp + "\n", "utf8")
    .update(rawBody)
    .digest("hex");
}

function verifyRequest({ secret, timestamp, signature, rawBody, now = Date.now() }) {
  if (typeof timestamp !== "string" || !/^[0-9]{13}$/.test(timestamp) ||
      !Number.isSafeInteger(Number(timestamp)) ||
      Math.abs(now - Number(timestamp)) > DATE_WINDOW_MS ||
      typeof signature !== "string" || !/^[a-f0-9]{64}$/.test(signature) ||
      !Buffer.isBuffer(rawBody)) return false;
  const computed = Buffer.from(signatureFor(secret, timestamp, rawBody), "hex");
  const received = Buffer.from(signature, "hex");
  return crypto.timingSafeEqual(computed, received);
}

function verifyCeoApproval(request, env, signedAt) {
  if (typeof request.approvedBy !== "string" || request.approvedBy !== env.FACTORY_CEO_USER_ID) {
    throw new Error("CEO_APPROVAL_REQUIRED");
  }
  // One approval record authorizes exactly one operation: its ID is the request ID.
  if (typeof request.requestId !== "string" || !UUID_RE.test(request.requestId)) {
    throw new Error("CEO_APPROVAL_REQUIRED");
  }
  const approvedAt = request.approvedAt;
  if (!Number.isSafeInteger(approvedAt) || approvedAt > signedAt + 1000 ||
      signedAt - approvedAt > APPROVAL_MAX_AGE_MS) {
    throw new Error("CEO_APPROVAL_EXPIRED");
  }
  return approvedAt;
}

async function processSignedAdjustment({ db, env, rawBody, timestamp, signature, now }) {
  if (!enabled(env)) throw new Error("FACTORY_API_DISABLED");
  if (!Buffer.isBuffer(rawBody) || rawBody.length > 4096) throw new Error("BODY_TOO_LARGE");
  if (!verifyRequest({ secret: env.FACTORY_INVENTORY_HMAC_SECRET,
    timestamp, signature, rawBody, now })) throw new Error("INVALID_FACTORY_SIGNATURE");
  let request;
  try { request = JSON.parse(rawBody.toString("utf8")); }
  catch { throw new Error("INVALID_JSON"); }
  if (!request || typeof request !== "object" || Array.isArray(request) ||
      Object.keys(request).sort().join(",") !== FIELDS.join(",")) {
    throw new Error("INVALID_FIELDS");
  }
  const approvedAt = verifyCeoApproval(request, env, Number(timestamp));
  return adjustInventory(db, {
    sku: request.sku, action: request.action, quantity: request.quantity,
    requestId: request.requestId,
    trustedActor: "factory-ceo:" + env.FACTORY_CEO_USER_ID,
    audit: { approvedAt: new Date(approvedAt), signedAt: new Date(Number(timestamp)),
      channel: "factory-signed-api" },
  });
}

const STATUS = Object.freeze({
  INVALID_FACTORY_SIGNATURE: 401,
  CEO_APPROVAL_REQUIRED: 403,
  CEO_APPROVAL_EXPIRED: 403,
  OUT_OF_STOCK: 409,
  INVENTORY_REQUEST_ID_CONFLICT: 409,
  INVALID_INVENTORY_ADJUSTMENT: 400,
  INVALID_FIELDS: 400,
  INVALID_JSON: 400,
  UNKNOWN_INVENTORY_SKU: 400,
  BODY_TOO_LARGE: 413,
});

function createHandler({ getDb, env = process.env, limiter = createRateLimiter(),
  clock = Date.now, log = console } = {}) {
  return async function factoryInventoryAdjust(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (!enabled(env)) return res.status(404).end();
    if (!limiter(clientKey(req).key)) return res.status(429).json({ error: "RATE_LIMITED" });
    try {
      const result = await processSignedAdjustment({
        db: getDb(), env, rawBody: req.body, now: clock(),
        timestamp: req.get("x-factory-timestamp"),
        signature: req.get("x-factory-signature"),
      });
      return res.json({ ok: true, ...result });
    } catch (error) {
      const message = String(error && error.message);
      const status = STATUS[message];
      if (status) {
        if (status === 401 || status === 403) log.warn("Factory inventory request refused:", message);
        return res.status(status).json({ error: message });
      }
      log.error("Factory preview inventory rejected:", message.slice(0, 100));
      return res.status(503).json({ error: "FACTORY_PREVIEW_UNAVAILABLE" });
    }
  };
}

module.exports = {
  PATH, enabled, signatureFor, verifyRequest, verifyCeoApproval,
  processSignedAdjustment, createRateLimiter, createHandler,
};
