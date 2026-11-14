"use strict";
// Staging-only checkout adapter. Production must never load or enable this file.
// Firestore reservations and checkout-key claims are atomically coupled.
const crypto = require("node:crypto");
const { validItems, attachPaymentIntent, finish, availability } = require("./inventory");

const KEY_RE = /^[a-f0-9-]{36}$/;
const SKU_RE = /^[a-z0-9-]{1,90}$/;

function previewAllowed(env) {
  return env.FIRESTORE_CHECKOUT_ENABLED === "true" &&
    env.INVENTORY_STAGING_ONLY === "true" &&
    env.FIREBASE_PROJECT_ID === "ryuge-inventory" &&
    env.FIREBASE_CLIENT_EMAIL ===
      "ryuge-inventory-render@ryuge-inventory.iam.gserviceaccount.com" &&
    /^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY || "");
}

function fingerprint(items) {
  return JSON.stringify([...items].sort((a, b) => a.id.localeCompare(b.id)));
}

async function claimCheckout(db, items, checkoutKey) {
  if (!KEY_RE.test(checkoutKey || "")) throw new Error("CHECKOUT_KEY_REQUIRED");
  const safe = validItems(items);
  const signature = fingerprint(safe);
  const checkoutRef = db.collection("inventoryCheckoutKeys").doc(checkoutKey);
  const reservationId = crypto.randomUUID();
  const reservationRef = db.collection("inventoryReservations").doc(reservationId);
  const stockRefs = safe.map(({ id }) => db.collection("inventory").doc(id));
  return db.runTransaction(async (tx) => {
    const existing = await tx.get(checkoutRef);
    if (existing.exists) {
      const previous = existing.data();
      if (previous.signature !== signature) throw new Error("CHECKOUT_KEY_CONFLICT");
      return { reservationId: previous.reservationId, created: false };
    }
    // Transaction reads must occur before any writes.
    const stocks = await Promise.all(stockRefs.map((ref) => tx.get(ref)));
    for (let i = 0; i < safe.length; i++) {
      const stock = stocks[i].exists ? stocks[i].data() : null;
      if (!stock || !Number.isSafeInteger(stock.ready) ||
          !Number.isSafeInteger(stock.held) || !Number.isSafeInteger(stock.sold) ||
          stock.ready < 0 || stock.held < 0 || stock.sold < 0 ||
          stock.held > stock.ready ||
          stock.ready - stock.held < safe[i].quantity) throw new Error("OUT_OF_STOCK");
    }
    safe.forEach(({ quantity }, i) => {
      tx.update(stockRefs[i], { held: stocks[i].data().held + quantity });
    });
    tx.create(reservationRef, {
      status: "reserved", items: safe, paymentIntentId: null,
      checkoutKey, createdAt: new Date(), environment: "firestore-preview",
    });
    tx.create(checkoutRef, {
      signature, reservationId, createdAt: new Date(),
    });
    return { reservationId, created: true };
  });
}

async function createCheckout(db, stripe, items, checkoutKey, prices, shippingCalculator) {
  const safe = validItems(items);
  if (safe.length > 10 || safe.some(({ id, quantity }) =>
      !SKU_RE.test(id) || !prices[id] || quantity > 15)) {
    throw new Error("INVALID_ITEM");
  }
  const claim = await claimCheckout(db, safe, checkoutKey);
  const reservationRef = db.collection("inventoryReservations").doc(claim.reservationId);
  const reservationDoc = await reservationRef.get();
  if (!reservationDoc.exists || reservationDoc.data()?.status !== "reserved") {
    throw new Error("CHECKOUT_ALREADY_FINALIZED");
  }
  const priced = safe.map((item) => ({
    ...item, price: prices[item.id].price, weightG: prices[item.id].weightG,
  }));
  const shipping = shippingCalculator(priced, "JP");
  const amount = priced.reduce((total, item) => total + item.price * item.quantity, 0) + shipping;
  if (!Number.isSafeInteger(amount) || amount < 50 || amount > 200000) {
    throw new Error("INVALID_TOTAL");
  }
  // Stripe idempotency key ensures parallel checkout requests cannot create 2 intents.
  // Ambiguous API failures leave the Firestore hold in place for reconciliation.
  const intent = await stripe.paymentIntents.create({
    amount, currency: "jpy",
    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    metadata: {
      inventoryEnvironment: "firestore-preview",
      inventoryReservationId: claim.reservationId,
      inventoryCheckoutKey: checkoutKey,
    },
  }, { idempotencyKey: "firestore-preview-" + checkoutKey });
  if (intent.livemode !== false || !intent.id || !intent.client_secret) {
    throw new Error("NON_TEST_INTENT_REFUSED");
  }
  const bound = await reservationRef.get();
  if (bound.data()?.paymentIntentId && bound.data().paymentIntentId !== intent.id) {
    throw new Error("PAYMENT_INTENT_CONFLICT");
  }
  if (!bound.data()?.paymentIntentId) {
    await attachPaymentIntent(db, claim.reservationId, intent.id);
  }
  return { clientSecret: intent.client_secret, shipping, total: amount };
}

async function settlePreviewEvent(db, intent, type) {
  if (intent?.livemode !== false ||
      intent?.metadata?.inventoryEnvironment !== "firestore-preview") {
    throw new Error("INVALID_PREVIEW_EVENT");
  }
  const reservationId = intent.metadata.inventoryReservationId;
  const checkoutKey = intent.metadata.inventoryCheckoutKey;
  if (!KEY_RE.test(reservationId || "") || !KEY_RE.test(checkoutKey || "")) {
    throw new Error("INVALID_PREVIEW_METADATA");
  }
  const [checkout, reservation] = await Promise.all([
    db.collection("inventoryCheckoutKeys").doc(checkoutKey).get(),
    db.collection("inventoryReservations").doc(reservationId).get(),
  ]);
  if (!checkout.exists || checkout.data().reservationId !== reservationId ||
      !reservation.exists || reservation.data().paymentIntentId !== intent.id ||
      reservation.data().checkoutKey !== checkoutKey ||
      reservation.data().environment !== "firestore-preview") {
    throw new Error("PREVIEW_PAYMENT_NOT_BOUND");
  }
  const action = type === "payment_intent.succeeded" ? "paid" :
    type === "payment_intent.canceled" ? "released" : null;
  if (!action) return false;
  return finish(db, reservationId, intent.id, action);
}

async function previewAvailability(db, ids) {
  const safe = [...new Set(ids.filter((id) => SKU_RE.test(id)))].slice(0, 40);
  return availability(db, safe);
}

module.exports = {
  previewAllowed, claimCheckout, createCheckout, settlePreviewEvent, previewAvailability,
};
