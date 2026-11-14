"use strict";
const crypto = require("node:crypto");
const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");
const { createStore } = require("./resp-client");
const { calcShipping } = require("./shipping");
const firestorePreview = require("./firestore-preview-checkout");
const firestoreCheckoutRequested = process.env.FIRESTORE_CHECKOUT_ENABLED === "true";
function firestorePreviewDb() {
  if (!firestorePreview.previewAllowed(process.env)) throw new Error("FIRESTORE_PREVIEW_DISABLED");
  const admin = require("firebase-admin");
  const app = admin.apps.find((item) => item.name === "ryuge-inventory-sandbox-readonly");
  if (!app) throw new Error("FIRESTORE_NOT_CONNECTED");
  return admin.firestore(app);
}


// Disposable test-mode payment server. Never deploy this entrypoint as production.
// The free Render Key Value instance is nonpersistent: restarts erase test state.
const redis = createStore(process.env.SANDBOX_REDIS_URL);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const app = express();
app.disable("x-powered-by");

const PRICE_BY_SKU = Object.freeze({
  "enma-karamo": { price: 1800, weightG: 120 },
  "enma-kindiio": { price: 2050, weightG: 120 },
});
const STOCK_KEY = (sku) => "sandbox:inventory:" + sku;
const RESERVATION_KEY = (id) => "sandbox:reservation:" + id;
const PENDING_KEY = "sandbox:reservations:pending";

const seedScript = `
if redis.call('EXISTS', KEYS[1]) == 0 then
 redis.call('HSET', KEYS[1], 'ready', ARGV[1], 'held', 0, 'sold', 0)
 return 1
end
return 0`;
const reserveScript = `
-- A checkout key makes repeated browser initialization idempotent.
if KEYS[3] and KEYS[3] ~= '' then
 local existing = redis.call('GET', KEYS[3])
 if existing then return 'EXISTING:' .. existing end
end
local itemList = cjson.decode(ARGV[2])
for _,item in ipairs(itemList) do
 local key = 'sandbox:inventory:' .. item.id
 local ready = tonumber(redis.call('HGET', key, 'ready') or '0')
 local held = tonumber(redis.call('HGET', key, 'held') or '0')
 if ready-held < item.quantity then return 'OUT_OF_STOCK' end
end
if redis.call('EXISTS', KEYS[1]) == 1 then return 'ALREADY_EXISTS' end
for _,item in ipairs(itemList) do
 redis.call('HINCRBY', 'sandbox:inventory:' .. item.id, 'held', item.quantity)
end
redis.call('HSET', KEYS[1], 'status', 'reserved', 'items', ARGV[2], 'createdAt', ARGV[3])
redis.call('ZADD', KEYS[2], ARGV[3], ARGV[1])
if KEYS[3] and KEYS[3] ~= '' then redis.call('SET', KEYS[3], ARGV[1], 'EX', 86400) end
return 'RESERVED'`;
const finishScript = `
if redis.call('EXISTS', KEYS[1]) == 0 then return 'UNKNOWN_RESERVATION' end
local status = redis.call('HGET', KEYS[1], 'status')
if status == ARGV[2] then return 'ALREADY_FINALIZED' end
if status ~= 'reserved' then return 'INVALID_TRANSITION' end
local paymentId = redis.call('HGET', KEYS[1], 'paymentIntentId')
if paymentId and paymentId ~= ARGV[3] then return 'PAYMENT_MISMATCH' end
local items = cjson.decode(redis.call('HGET', KEYS[1], 'items'))
for _,item in ipairs(items) do
 local key = 'sandbox:inventory:' .. item.id
 if tonumber(redis.call('HGET', key, 'held') or '0') < item.quantity then return 'INCONSISTENT_STOCK' end
 if ARGV[2] == 'paid' and tonumber(redis.call('HGET', key, 'ready') or '0') < item.quantity then return 'INCONSISTENT_STOCK' end
end
for _,item in ipairs(items) do
 local key = 'sandbox:inventory:' .. item.id
 redis.call('HINCRBY', key, 'held', -item.quantity)
 if ARGV[2] == 'paid' then
  redis.call('HINCRBY', key, 'ready', -item.quantity)
  redis.call('HINCRBY', key, 'sold', item.quantity)
 end
end
redis.call('HSET', KEYS[1], 'status', ARGV[2])
redis.call('ZREM', KEYS[2], ARGV[1])
return 'OK'`;

async function settle(reservationId, intentId, status) {
  return redis("EVAL", finishScript, 2, RESERVATION_KEY(reservationId), PENDING_KEY, reservationId, status, intentId);
}

app.post("/stripe-inventory-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_INVENTORY_WEBHOOK_SECRET);
  } catch {
    return res.status(400).send("Invalid signature");
  }
  const intent = event.data?.object;
  const reservationId = intent?.metadata?.inventoryReservationId;
  // Signed events for the optional Firestore-backed preview never touch Redis.
  if (intent?.metadata?.inventoryEnvironment === "firestore-preview") {
    try {
      const db = firestorePreviewDb();
      const applied = await firestorePreview.settlePreviewEvent(db, intent, event.type);
      if (applied) console.log("Firestore checkout signed webhook: " + event.type);
      return res.json({ received: true });
    } catch (error) {
      console.error("Firestore preview webhook failed:", String(error.message).slice(0, 110));
      return res.status(500).json({ error: "FIRESTORE_PREVIEW_SETTLEMENT_FAILED" });
    }
  }
  // Independently route only the explicitly-marked ephemeral Firestore smoke run.
  // Real customer checkout remains in Redis. Signature has already been validated.
  if (intent?.metadata?.inventoryEnvironment === "firestore-smoke") {
    const runId = intent.metadata.firestoreSmokeRunId || "";
    if (process.env.INVENTORY_STAGING_ONLY !== "true" ||
        process.env.FIREBASE_PROJECT_ID !== "ryuge-inventory" ||
        process.env.FIREBASE_CLIENT_EMAIL !== "ryuge-inventory-render@ryuge-inventory.iam.gserviceaccount.com" ||
        !/^ryuge-stripe-firestore-[a-z0-9-]{8,50}$/.test(runId) ||
        !/^[a-f0-9-]{36}$/.test(reservationId || "") ||
        intent.livemode !== false) return res.status(400).send("INVALID_FIRESTORE_TEST");
    try {
      const admin = require("firebase-admin");
      const { finish } = require("./inventory");
      const app = admin.apps.find((a) => a.name === "ryuge-inventory-sandbox-readonly");
      if (!app) throw new Error("FIRESTORE_NOT_CONNECTED");
      const db = admin.firestore(app);
      const marker = await db.collection("inventorySmokePayments").doc(runId).get();
      if (!marker.exists || marker.data().reservationId !== reservationId ||
          marker.data().paymentIntentId !== intent.id) throw new Error("FIRESTORE_SMOKE_MISMATCH");
      const action = event.type === "payment_intent.succeeded" ? "paid" :
        event.type === "payment_intent.canceled" ? "released" : null;
      if (!action) return res.json({ received: true });
      const applied = await finish(db, reservationId, intent.id, action);
      console.log("Firestore signed Stripe webhook PASS: action=" + action +
        "; applied=" + applied + "; run=" + runId);
      return res.json({ received: true });
    } catch (error) {
      console.error("Firestore signed webhook FAILED:", String(error.message).slice(0, 110));
      return res.status(500).json({ error: "FIRESTORE_SMOKE_WEBHOOK_FAILED" });
    }
  }
  if (!reservationId) return res.json({ received: true });
  if (!/^[a-f0-9-]{36}$/.test(reservationId)) return res.status(400).send("Invalid reservation");
  if (intent.livemode !== false) return res.status(400).send("Not a test payment");
  try {
    let result = "IGNORED";
    if (event.type === "payment_intent.succeeded") result = await settle(reservationId, intent.id, "paid");
    else if (event.type === "payment_intent.canceled") result = await settle(reservationId, intent.id, "released");
    if (!["OK", "ALREADY_FINALIZED", "IGNORED"].includes(result)) throw new Error(result);
    if (result === "OK") console.log("sandbox Stripe signed webhook inventory settled; action=" + event.type + "; intent=" + intent.id);
    return res.json({ received: true });
  } catch (err) {
    console.error("sandbox webhook failure:", err.message);
    return res.status(500).json({ error: "WEBHOOK_SETTLEMENT_FAILED" });
  }
});

app.use(cors({
  origin(origin, callback) {
    if (!origin || /^https:\/\/[-a-z0-9]+\.vercel\.app$/.test(origin) || origin === "http://localhost:5173") callback(null, true);
    else callback(new Error("ORIGIN_NOT_ALLOWED"));
  },
}));
app.use(express.json({ limit: "32kb" }));
app.get("/health", (_req, res) => {
  const previewReady = firestoreCheckoutRequested && firestorePreview.previewAllowed(process.env);
  res.json({
    environment: "sandbox",
    paymentReady: !firestoreCheckoutRequested || previewReady,
    inventoryEnabled: !firestoreCheckoutRequested || previewReady,
    persistence: previewReady ? "firestore" : "ephemeral",
  });
});
app.get("/inventory/availability", async (req, res) => {
  const ids = String(req.query.ids || "").split(",").filter((sku) => /^[a-z0-9-]{1,90}$/.test(sku)).slice(0, 40);
  try {
    if (firestoreCheckoutRequested) {
      const db = firestorePreviewDb();
      const quantities = await firestorePreview.previewAvailability(db, ids);
      return res.json({ enabled: true, quantities, store: "firestore-preview" });
    }
    const quantities = {};
    for (const id of ids) {
      const data = await redis("HMGET", STOCK_KEY(id), "ready", "held");
      quantities[id] = Math.max(0, Number(data[0] || 0) - Number(data[1] || 0));
    }
    res.json({ enabled: true, quantities });
  } catch (err) {
    console.error("inventory lookup failed:", err.message);
    res.status(503).json({ error: "INVENTORY_UNAVAILABLE" });
  }
});

app.post("/create-payment-intent", async (req, res) => {
  const { items, countryCode = "JP", couponCode = "", checkoutKey } = req.body || {};
  if (typeof checkoutKey !== "string" || !/^[a-f0-9-]{36}$/.test(checkoutKey)) {
    return res.status(400).json({ error: "CHECKOUT_KEY_REQUIRED" });
  }
  if (!Array.isArray(items) || !items.length || items.length > 10 || countryCode !== "JP" || couponCode) {
    return res.status(400).json({ error: "SANDBOX_TEST_ONLY" });
  }
  const seen = new Set();
  let safe;
  try {
    safe = items.map(({ id, quantity }) => {
      if (!PRICE_BY_SKU[id] || seen.has(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 15) {
        throw new Error("INVALID_ITEM");
      }
      seen.add(id);
      return { id, quantity, price: PRICE_BY_SKU[id].price, weightG: PRICE_BY_SKU[id].weightG };
    });
  } catch {
    return res.status(400).json({ error: "INVALID_ITEM" });
  }
  if (firestoreCheckoutRequested) {
    try {
      const db = firestorePreviewDb();
      const payment = await firestorePreview.createCheckout(
        db, stripe, safe, checkoutKey, PRICE_BY_SKU, calcShipping
      );
      return res.json(payment);
    } catch (error) {
      console.error("Firestore preview checkout:", String(error.message).slice(0, 110));
      const code = error.message;
      if (["OUT_OF_STOCK", "CHECKOUT_KEY_CONFLICT", "CHECKOUT_ALREADY_FINALIZED"].includes(code)) {
        return res.status(409).json({ error: code });
      }
      if (["INVALID_ITEM", "INVALID_ITEMS", "INVALID_TOTAL"].includes(code)) {
        return res.status(400).json({ error: code });
      }
      return res.status(503).json({ error: "FIRESTORE_PREVIEW_UNAVAILABLE" });
    }
  }
  const reservationId = crypto.randomUUID();
  const now = Date.now();
  try {
    const selectedItems = JSON.stringify(safe.map(({id,quantity})=>({id,quantity})));
    const outcome = await redis("EVAL", reserveScript, 3,
      RESERVATION_KEY(reservationId), PENDING_KEY, "sandbox:checkout:" + checkoutKey,
      reservationId, selectedItems, now);
    if (String(outcome).startsWith("EXISTING:")) {
      const existingId = String(outcome).slice("EXISTING:".length);
      const key = RESERVATION_KEY(existingId);
      const existingItems = await redis("HGET", key, "items");
      const status = await redis("HGET", key, "status");
      if (existingItems !== selectedItems || status !== "reserved") {
        return res.status(409).json({ error: "CHECKOUT_KEY_CONFLICT" });
      }
      // Concurrent retries may arrive while Stripe is still creating the intent.
      let existingPaymentId = await redis("HGET", key, "paymentIntentId");
      for (let i = 0; i < 20 && !existingPaymentId; i++) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        existingPaymentId = await redis("HGET", key, "paymentIntentId");
      }
      if (!existingPaymentId) return res.status(503).json({ error: "CHECKOUT_INITIALIZING" });
      const existingIntent = await stripe.paymentIntents.retrieve(existingPaymentId);
      if (existingIntent.status === "canceled" || existingIntent.status === "succeeded") {
        return res.status(409).json({ error: "CHECKOUT_ALREADY_FINALIZED" });
      }
      const existingShipping = calcShipping(safe, "JP");
      return res.json({ clientSecret: existingIntent.client_secret,
        shipping: existingShipping,
        total: existingIntent.amount });
    }
    if (outcome !== "RESERVED") return res.status(outcome === "OUT_OF_STOCK" ? 409 : 400).json({ error: outcome });
    const shipping = calcShipping(safe, "JP");
    const total = safe.reduce((s, x) => s + x.price * x.quantity, 0) + shipping;
    // Sandbox-only key and idempotency prevent accidental second payment creation.
    const intent = await stripe.paymentIntents.create({
      amount: total,
      currency: "jpy",
      metadata: { inventoryReservationId: reservationId, inventoryEnvironment: "sandbox" },
    }, { idempotencyKey: "sandbox-intent-" + reservationId });
    await redis("HSET", RESERVATION_KEY(reservationId), "paymentIntentId", intent.id);
    res.json({ clientSecret: intent.client_secret, shipping, total });
  } catch (err) {
    // Keep the reservation held on any ambiguous create/response failure.
    // Reconciliation determines authoritative Stripe state before releasing.
    console.error("sandbox checkout unavailable:", err.message);
    res.status(503).json({ error: "SANDBOX_CHECKOUT_UNAVAILABLE" });
  }
});

// This endpoint is disabled in sandbox: never use browser-provided order data
// to issue receipts or trigger shipping fulfillment.
app.post("/order-complete", (_req, res) => res.status(200).json({ ok: true, sandbox: true, emailSent: false }));
app.post("/validate-coupon", (_req, res) => res.json({ valid: false }));

async function reconcile() {
  const stale = await redis("ZRANGEBYSCORE", PENDING_KEY, "-inf", Date.now() - 20 * 60 * 1000, "LIMIT", 0, 20);
  for (const id of stale) {
    try {
      const paymentId = await redis("HGET", RESERVATION_KEY(id), "paymentIntentId");
      if (!paymentId) continue; // fail closed; require manual investigation
      let intent = await stripe.paymentIntents.retrieve(paymentId);
      if (intent.status === "succeeded") await settle(id, paymentId, "paid");
      else if (intent.status === "canceled") await settle(id, paymentId, "released");
      else if (["requires_payment_method", "requires_confirmation", "requires_action"].includes(intent.status)) {
        intent = await stripe.paymentIntents.cancel(paymentId);
        if (intent.status === "canceled") await settle(id, paymentId, "released");
      }
    } catch (err) {
      console.error("sandbox reconciliation issue:", err.message);
    }
  }
}

async function sandboxOneTimePaymentSmoke() {
  const runId = process.env.SANDBOX_SMOKE_RUN_ID;
  if (!/^ryuge-sandbox-e2e-[a-z0-9-]{4,70}$/.test(runId || "")) return;
  // Only one test attempt per marker, even if Render restarts or redeploys.
  const locked = await redis("SET", "sandbox:smoke:" + runId, "started", "NX");
  if (locked !== "OK") {
    console.log("sandbox smoke: already attempted; not charging again");
    return;
  }
  const before = await redis("HMGET", STOCK_KEY("enma-karamo"), "ready", "held");
  if (Number(before[0]) !== 15 || Number(before[1]) !== 0) {
    console.log("sandbox smoke: skipped because stock is not initial 15");
    return;
  }
  const reservationId = crypto.randomUUID();
  const now = Date.now();
  const result = await redis("EVAL", reserveScript, 2,
    RESERVATION_KEY(reservationId), PENDING_KEY, reservationId,
    JSON.stringify([{ id: "enma-karamo", quantity: 1 }]), now);
  if (result !== "RESERVED") throw new Error("SANDBOX_SMOKE_RESERVATION_FAILED:" + result);
  // A Stripe-provided *test* PaymentMethod, not any customer's card information.
  // This performs a real sandbox PaymentIntent, with zero live charges.
  const intent = await stripe.paymentIntents.create({
    amount: 2000,
    currency: "jpy",
    payment_method: "pm_card_visa",
    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    confirm: true,
    metadata: {
      inventoryReservationId: reservationId,
      inventoryEnvironment: "sandbox",
      smokeRunId: runId,
    },
  }, { idempotencyKey: "ryuge-" + runId });
  await redis("HSET", RESERVATION_KEY(reservationId), "paymentIntentId", intent.id);
  console.log("sandbox smoke test payment created; status=" + intent.status + "; id=" + intent.id);
  // Webhook is the authority: do NOT settle inventory directly here.
}

async function checkFirestoreReadOnly() {
  // Connection check only. Redis remains the sandbox payment source of truth.
  // Never write test transactions into Firestore or expose service credentials.
  const id = process.env.FIREBASE_PROJECT_ID;
  const email = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!id || !email || !rawKey) {
    console.log("Firestore connection check: credentials incomplete; Redis unchanged");
    return;
  }
  if (id !== "ryuge-inventory" || !email.endsWith("@ryuge-inventory.iam.gserviceaccount.com")) {
    console.error("Firestore connection check: project identity mismatch; Redis unchanged");
    return;
  }
  const admin = require("firebase-admin");
  const appName = "ryuge-inventory-sandbox-readonly";
  const firebaseApp = admin.apps.find((app) => app.name === appName) ||
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: id,
        clientEmail: email,
        privateKey: rawKey.replace(/\\n/g, "\n"),
      }),
    }, appName);
  try {
    const doc = await admin.firestore(firebaseApp).collection("inventory").doc("enma-karamo").get();
    const stock = doc.data();
    if (!doc.exists || !["ready", "held", "sold"].every((key) =>
      Number.isSafeInteger(stock?.[key]) && stock[key] >= 0
    )) throw new Error("missing_or_invalid_stock");
    console.log("Firestore read-only PASS: project=ryuge-inventory; sku=enma-karamo; ready=" +
      stock.ready + "; held=" + stock.held + "; sold=" + stock.sold + "; no writes; Redis unchanged");
  } catch (err) {
    console.error("Firestore read-only FAILED (Redis unchanged):", err.code || err.message);
  }
}

async function checkFirestoreWriteTransactions() {
  // Explicitly enabled, one-shot, isolated Firestore transactional smoke test.
  // Never touch inventory/enma-karamo or any production SKU.
  const runId = process.env.FIRESTORE_WRITE_SMOKE_RUN_ID || "";
  if (!/^ryuge-firestore-smoke-[a-z0-9-]{8,60}$/.test(runId)) return;
  if (process.env.INVENTORY_STAGING_ONLY !== "true" ||
      process.env.FIREBASE_PROJECT_ID !== "ryuge-inventory" ||
      process.env.FIREBASE_CLIENT_EMAIL !==
        "ryuge-inventory-render@ryuge-inventory.iam.gserviceaccount.com") {
    console.error("Firestore transaction smoke BLOCK: sandbox/project/service-account mismatch");
    return;
  }
  const admin = require("firebase-admin");
  const { reserve, finish, availability } = require("./inventory");
  const firebaseApp = admin.apps.find((item) => item.name === "ryuge-inventory-sandbox-readonly");
  if (!firebaseApp) {
    console.error("Firestore transaction smoke BLOCK: verified Firebase app missing");
    return;
  }
  const db = admin.firestore(firebaseApp);
  const sku = "sandbox-smoke-" + runId.slice("ryuge-firestore-smoke-".length);
  const stockRef = db.collection("inventory").doc(sku);
  const markerRef = db.collection("inventorySmokeRuns").doc(runId);
  const markerCreated = await db.runTransaction(async (tx) => {
    const existing = await tx.get(markerRef);
    if (existing.exists) return false;
    tx.create(markerRef, { state: "started", sku, createdAt: new Date() });
    tx.create(stockRef, { ready: 2, held: 0, sold: 0, smokeTest: true });
    return true;
  });
  if (!markerCreated) {
    console.log("Firestore transaction smoke: run already claimed; no repeat writes");
    return;
  }
  let firstId, secondId;
  try {
    firstId = await reserve(db, [{ id: sku, quantity: 1 }], "pi_firestore_test_paid");
    let a = await availability(db, [sku]);
    if (a[sku] !== 1) throw new Error("RESERVE_NOT_HELD");
    if (await finish(db, firstId, "pi_firestore_test_paid", "paid") !== true) {
      throw new Error("PAID_NOT_APPLIED");
    }
    if (await finish(db, firstId, "pi_firestore_test_paid", "paid") !== false) {
      throw new Error("DUPLICATE_PAID_NOT_IGNORED");
    }
    let stock = (await stockRef.get()).data();
    if (stock.ready !== 1 || stock.held !== 0 || stock.sold !== 1) {
      throw new Error("PAID_INVENTORY_INCORRECT");
    }
    secondId = await reserve(db, [{ id: sku, quantity: 1 }], "pi_firestore_test_canceled");
    a = await availability(db, [sku]);
    if (a[sku] !== 0) throw new Error("RESERVED_LAST_BAG_NOT_ZERO");
    try {
      await reserve(db, [{ id: sku, quantity: 1 }]);
      throw new Error("SOLD_OUT_RESERVATION_ALLOWED");
    } catch (err) {
      if (err.message !== "OUT_OF_STOCK") throw err;
    }
    if (await finish(db, secondId, "pi_firestore_test_canceled", "released") !== true) {
      throw new Error("CANCEL_NOT_RELEASED");
    }
    if (await finish(db, secondId, "pi_firestore_test_canceled", "released") !== false) {
      throw new Error("DUPLICATE_CANCEL_NOT_IGNORED");
    }
    stock = (await stockRef.get()).data();
    if (stock.ready !== 1 || stock.held !== 0 || stock.sold !== 1) {
      throw new Error("CANCEL_INVENTORY_INCORRECT");
    }
    await markerRef.update({ state: "passed", finishedAt: new Date() });
    console.log("Firestore transaction smoke PASS: reserve, pay, duplicate ignored, sold-out blocked, cancel restored; isolated test SKU; no Stripe charge");
  } catch (err) {
    await markerRef.update({ state: "failed", reason: String(err.message).slice(0, 120) });
    console.error("Firestore transaction smoke FAILED:", String(err.message).slice(0, 120));
  } finally {
    // Remove temporary stock/reservations, retain a non-secret audit marker.
    await Promise.allSettled([
      stockRef.delete(),
      firstId ? db.collection("inventoryReservations").doc(firstId).delete() : Promise.resolve(),
      secondId ? db.collection("inventoryReservations").doc(secondId).delete() : Promise.resolve(),
    ]);
  }
}

async function sandboxStripeFirestoreSmoke() {
  // Unique one-shot test card charge in Stripe test mode, on a temporary SKU only.
  // Real stock /inven​tory/enma-karamo is NEVER modified.
  const runId = process.env.FIRESTORE_STRIPE_SMOKE_RUN_ID || "";
  if (!/^ryuge-stripe-firestore-[a-z0-9-]{8,50}$/.test(runId)) return;
  if (process.env.INVENTORY_STAGING_ONLY !== "true" ||
      process.env.FIREBASE_PROJECT_ID !== "ryuge-inventory" ||
      process.env.FIREBASE_CLIENT_EMAIL !== "ryuge-inventory-render@ryuge-inventory.iam.gserviceaccount.com" ||
      !/^sk_test_/.test(process.env.STRIPE_SECRET_KEY || "")) {
    console.error("Firestore Stripe smoke BLOCK: test-only identity mismatch");
    return;
  }
  const admin = require("firebase-admin");
  const { reserve, attachPaymentIntent } = require("./inventory");
  const firebaseApp = admin.apps.find((a) => a.name === "ryuge-inventory-sandbox-readonly");
  if (!firebaseApp) { console.error("Firestore Stripe smoke BLOCK: Firebase not connected"); return; }
  const db = admin.firestore(firebaseApp);
  const sku = "sandbox-stripe-" + runId.slice("ryuge-stripe-firestore-".length);
  const stockRef = db.collection("inventory").doc(sku);
  const markerRef = db.collection("inventorySmokePayments").doc(runId);
  const claimed = await db.runTransaction(async (tx) => {
    const marker = await tx.get(markerRef);
    if (marker.exists) return false;
    tx.create(markerRef, { status: "started", sku, createdAt: new Date(), testOnly: true });
    tx.create(stockRef, { ready: 1, held: 0, sold: 0, smokeTest: true });
    return true;
  });
  if (!claimed) {
    console.log("Firestore Stripe smoke: run previously claimed; no repeat charge");
    return;
  }
  try {
    const reservationId = await reserve(db, [{ id: sku, quantity: 1 }]);
    await markerRef.update({ reservationId });
    const intent = await stripe.paymentIntents.create({
      amount: 100,
      currency: "jpy",
      payment_method: "pm_card_visa",
      payment_method_types: ["card"],
      metadata: {
        inventoryEnvironment: "firestore-smoke",
        inventoryReservationId: reservationId,
        firestoreSmokeRunId: runId,
      },
    }, { idempotencyKey: "firestore-smoke-create-" + runId });
    await attachPaymentIntent(db, reservationId, intent.id);
    await markerRef.update({ paymentIntentId: intent.id, status: "awaiting-webhook" });
    // Confirm AFTER the Firestore payment binding and marker are persisted.
    const confirmed = await stripe.paymentIntents.confirm(intent.id, {},
      { idempotencyKey: "firestore-smoke-confirm-" + runId });
    if (confirmed.status !== "succeeded") throw new Error("PAYMENT_NOT_SUCCEEDED");
    console.log("Firestore Stripe smoke test payment succeeded; awaiting signed webhook; run=" + runId);
    let success = false;
    for (let attempt = 0; attempt < 18; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const [stockDoc, reservationDoc] = await Promise.all([
        stockRef.get(), db.collection("inventoryReservations").doc(reservationId).get(),
      ]);
      const stock = stockDoc.data() || {};
      if (reservationDoc.data()?.status === "paid" &&
          stock.ready === 0 && stock.held === 0 && stock.sold === 1) {
        success = true;
        break;
      }
    }
    if (!success) throw new Error("WEBHOOK_SETTLEMENT_PENDING");
    await markerRef.update({ status: "passed", completedAt: new Date() });
    console.log("Firestore Stripe E2E PASS: Stripe signed webhook -> Firestore ready 1 to 0, held 0, sold 1; isolated SKU; run=" + runId);
  } catch (error) {
    await markerRef.update({ status: "needs-review", reason: String(error.message).slice(0, 110) });
    console.error("Firestore Stripe E2E NOT COMPLETE:", String(error.message).slice(0, 110));
  }
}

async function sandboxCheckoutDedupSmoke() {
  // Disposable SKU used only to verify repeated checkout initialization.
  const sku = "sandbox-dedup-only";
  const reservationId = crypto.randomUUID();
  const checkoutKey = crypto.randomUUID();
  const items = JSON.stringify([{ id: sku, quantity: 1 }]);
  const reservationKey = RESERVATION_KEY(reservationId);
  const mapKey = "sandbox:checkout:" + checkoutKey;
  // Don't reuse a previous run's key.
  await redis("SET", "sandbox:inventory:" + sku + ":seed-once", "yes", "NX");
  await redis("HSET", STOCK_KEY(sku), "ready", 1, "held", 0, "sold", 0);
  const first = await redis("EVAL", reserveScript, 3,
    reservationKey, PENDING_KEY, mapKey, reservationId, items, Date.now());
  const second = await redis("EVAL", reserveScript, 3,
    RESERVATION_KEY(crypto.randomUUID()), PENDING_KEY, mapKey, crypto.randomUUID(), items, Date.now());
  const held = Number(await redis("HGET", STOCK_KEY(sku), "held"));
  if (first !== "RESERVED" || second !== "EXISTING:" + reservationId || held !== 1) {
    throw new Error("CHECKOUT_DEDUP_FAILED");
  }
  const released = await settle(reservationId, "", "released");
  const after = await redis("HMGET", STOCK_KEY(sku), "ready", "held", "sold");
  if (released !== "OK" || after.join(",") !== "1,0,0") {
    throw new Error("CHECKOUT_DEDUP_RELEASE_FAILED");
  }
  console.log("sandbox checkout idempotency PASS: repeat reserved once, stock restored, no Stripe PaymentIntent");
}

async function sandboxCancellationSmoke() {
  const runId = process.env.SANDBOX_CANCEL_TEST_RUN_ID;
  if (!/^ryuge-cancel-test-[a-z0-9-]{6,60}$/.test(runId || "")) return;
  const locked = await redis("SET", "sandbox:cancel-once:" + runId, "started", "NX");
  if (locked !== "OK") {
    console.log("sandbox cancellation: already attempted; no duplicate test intent");
    return;
  }
  const before = await redis("HMGET", STOCK_KEY("enma-karamo"), "ready", "held");
  const ready = Number(before[0] || 0);
  const held = Number(before[1] || 0);
  if (ready - held < 1 || held !== 0) {
    console.log("sandbox cancellation skipped: stock cannot be safely isolated");
    return;
  }
  const reservationId = crypto.randomUUID();
  const outcome = await redis("EVAL", reserveScript, 2,
    RESERVATION_KEY(reservationId), PENDING_KEY, reservationId,
    JSON.stringify([{ id: "enma-karamo", quantity: 1 }]), Date.now());
  if (outcome !== "RESERVED") throw new Error("CANCEL_RESERVE_FAILED:" + outcome);
  // Never supply a payment method or confirm: this test cannot charge a card.
  const intent = await stripe.paymentIntents.create({
    amount: 2000,
    currency: "jpy",
    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    metadata: { inventoryReservationId: reservationId, inventoryEnvironment: "sandbox", cancellationTest: runId },
  }, { idempotencyKey: "ryuge-cancel-create-" + runId });
  await redis("HSET", RESERVATION_KEY(reservationId), "paymentIntentId", intent.id);
  if (intent.livemode !== false || intent.status !== "requires_payment_method") {
    throw new Error("CANCEL_TEST_UNEXPECTED_PAYMENT_STATUS");
  }
  const during = await redis("HMGET", STOCK_KEY("enma-karamo"), "ready", "held");
  if (Number(during[0]) - Number(during[1]) !== ready - 1) {
    throw new Error("CANCEL_TEST_HOLD_MISMATCH");
  }
  const canceled = await stripe.paymentIntents.cancel(intent.id, {}, {
    idempotencyKey: "ryuge-cancel-finish-" + runId,
  });
  if (canceled.status !== "canceled") throw new Error("CANCEL_TEST_NOT_CANCELED");
  console.log("sandbox cancellation: Stripe intent canceled; webhook must release hold; intent=" + intent.id);
  // Do not settle locally; signed payment_intent.canceled webhook must do it.
  let verified = false;
  for (let attempt = 0; attempt < 15; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const state = await redis("HMGET", STOCK_KEY("enma-karamo"), "ready", "held", "sold");
    const status = await redis("HGET", RESERVATION_KEY(reservationId), "status");
    if (status === "released" && Number(state[0]) === ready && Number(state[1]) === held) {
      console.log("sandbox cancellation PASS: held 1 then released; available restored to " + ready + "; sold unchanged; intent=" + intent.id);
      verified = true;
      break;
    }
  }
  if (!verified) console.error("sandbox cancellation PENDING: signed webhook did not restore inventory within 30 seconds");
}

async function start() {
  await redis("PING");
  // Inventory seed occurs only once per live Redis instance, and only in test mode.
  await redis("EVAL", seedScript, 1, STOCK_KEY("enma-karamo"), 15);
  // Zero-stock scenario is never a purchasable unit. Test it without charging Stripe.
  await redis("EVAL", seedScript, 1, STOCK_KEY("enma-kindiio"), 0);
  const zeroStockReservation = crypto.randomUUID();
  const zeroCheck = await redis("EVAL", reserveScript, 2,
    RESERVATION_KEY(zeroStockReservation), PENDING_KEY, zeroStockReservation,
    JSON.stringify([{ id: "enma-kindiio", quantity: 1 }]), Date.now());
  if (zeroCheck !== "OUT_OF_STOCK") {
    throw new Error("ZERO_STOCK_TEST_FAILED:" + zeroCheck);
  }
  console.log("sandbox zero-stock checkout blocked with OUT_OF_STOCK");
  await sandboxCheckoutDedupSmoke();
  await checkFirestoreReadOnly();
  await checkFirestoreWriteTransactions();

  // Test deliberately runs after the HTTP server starts so Stripe can reach the webhook.

  const port = Number(process.env.PORT || 10000);
  app.listen(port, "0.0.0.0");
  const timer = setInterval(() => {
    if (firestoreCheckoutRequested) {
      try {
        const db = firestorePreviewDb();
        const { reconcileExpired } = require("./inventory");
        reconcileExpired(db, stripe, 30).then((results) => {
          const unresolved = results.filter((x) =>
            x.action === "error" || x.action === "manual-review-missing-intent");
          if (unresolved.length) console.error("Firestore checkout reconciliation needs review:", unresolved.length);
        }).catch((error) => {
          console.error("Firestore preview reconcile failed:", String(error.message).slice(0, 120));
        });
      } catch (error) {
        console.error("Firestore preview reconciliation disabled:", String(error.message).slice(0, 120));
      }
    } else {
      reconcile().catch((error) => console.error("Redis reconcile:", error.message));
    }
  }, 60000);
  timer.unref();
  setTimeout(() => sandboxOneTimePaymentSmoke().catch((err) => {
    console.error("sandbox smoke error (no automatic retries):", err.message);
  }), 12000).unref();
  setTimeout(() => sandboxStripeFirestoreSmoke().catch((err) => {
    console.error("Firestore Stripe smoke startup failed:", String(err.message).slice(0, 110));
  }), 20000).unref();
  setTimeout(() => sandboxCancellationSmoke().catch((err) => {
    console.error("sandbox cancellation test error (no automatic retries):", err.message);
  }), 16000).unref();

}

start().catch((err) => { console.error("sandbox startup failed:", err.message); process.exit(1); });
