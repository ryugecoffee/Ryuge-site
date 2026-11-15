"use strict";
// Factory -> Render: signed service request only. Sandbox-only by default.
// This is NOT CEO approval verification: caller must enforce CEO approval separately.
const crypto = require("node:crypto");
const { adjustInventory } = require("./inventory-adjustments");

const PATH = "/internal/factory/inventory-adjust";
const DATE_WINDOW_MS = 5 * 60 * 1000;

function enabled(env) {
  return env.INVENTORY_STAGING_ONLY === "true" &&
    env.FIRESTORE_CHECKOUT_ENABLED === "true" &&
    env.FIRESTORE_FACTORY_API_ENABLED === "true" &&
    env.FIREBASE_PROJECT_ID === "ryuge-inventory" &&
    env.FIREBASE_CLIENT_EMAIL ===
      "ryuge-inventory-render@ryuge-inventory.iam.gserviceaccount.com" &&
    /^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY || "") &&
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

async function processSignedAdjustment({ db, env, rawBody, timestamp, signature, now }) {
  if (!enabled(env)) throw new Error("FACTORY_API_DISABLED");
  if (!verifyRequest({ secret: env.FACTORY_INVENTORY_HMAC_SECRET,
    timestamp, signature, rawBody, now })) throw new Error("INVALID_FACTORY_SIGNATURE");
  if (rawBody.length > 4096) throw new Error("BODY_TOO_LARGE");
  let request;
  try { request = JSON.parse(rawBody.toString("utf8")); }
  catch { throw new Error("INVALID_JSON"); }
  if (!request || typeof request !== "object" || Array.isArray(request) ||
      Object.keys(request).some((key) =>
        !["sku", "action", "quantity", "requestId"].includes(key))) {
    throw new Error("INVALID_FIELDS");
  }
  // Actor is controlled by this server, not accepted in the caller's JSON.
  return adjustInventory(db, {
    sku: request.sku, action: request.action, quantity: request.quantity,
    requestId: request.requestId, trustedActor: "factory-ceo:ryugecoffee",
  });
}

module.exports = { PATH, enabled, signatureFor, verifyRequest, processSignedAdjustment };
