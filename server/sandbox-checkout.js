"use strict";
const crypto = require("node:crypto");
const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");
const { createStore } = require("./resp-client");
const { calcShipping } = require("./shipping");

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
app.get("/health", (_req, res) => res.json({ environment: "sandbox", paymentReady: true, inventoryEnabled: true, persistence: "ephemeral" }));
app.get("/inventory/availability", async (req, res) => {
  const ids = String(req.query.ids || "").split(",").filter((sku) => /^[a-z0-9-]{1,90}$/.test(sku)).slice(0, 40);
  try {
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
  const { items, countryCode = "JP", couponCode = "" } = req.body || {};
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
  const reservationId = crypto.randomUUID();
  const now = Date.now();
  try {
    const outcome = await redis("EVAL", reserveScript, 2, RESERVATION_KEY(reservationId), PENDING_KEY, reservationId, JSON.stringify(safe.map(({id,quantity})=>({id,quantity}))), now);
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

  // Test deliberately runs after the HTTP server starts so Stripe can reach the webhook.

  const port = Number(process.env.PORT || 10000);
  app.listen(port, "0.0.0.0");
  const timer = setInterval(() => { reconcile().catch((e) => console.error("reconcile:", e.message)); }, 60000);
  timer.unref();
  setTimeout(() => sandboxOneTimePaymentSmoke().catch((err) => {
    console.error("sandbox smoke error (no automatic retries):", err.message);
  }), 12000).unref();
  setTimeout(() => sandboxCancellationSmoke().catch((err) => {
    console.error("sandbox cancellation test error (no automatic retries):", err.message);
  }), 16000).unref();

}

start().catch((err) => { console.error("sandbox startup failed:", err.message); process.exit(1); });
