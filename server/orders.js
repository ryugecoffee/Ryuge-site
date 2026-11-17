"use strict";

// Paid order records (2026-11-17). One document per Stripe PaymentIntent, written from Stripe's signed
// payment_intent.succeeded event, so the sales history exists even when the customer's browser closes before
// /order-complete. Duplicate and late deliveries never write twice (the document id is the PaymentIntent id).
// Schema: orders/{paymentIntentId} = { status, amount, subtotal, shipping, items[{id, quantity, unitPrice}],
//   customer{name, email, phone, address}, couponCode, countryCode, inventoryReservationId, livemode,
//   paidAt, recordedAt, amountRefunded? }
const { validItems } = require("./inventory");

// "sku:qty@unitPrice,..." written by /create-payment-intent (server/catalog.js itemsMetadata).
function parseItemsMetadata(value) {
  if (typeof value !== "string" || !value || value.length > 500) throw new Error("NOT_A_STORE_ORDER");
  const parsed = value.split(",").map((part) => {
    const match = /^([a-z0-9-]{1,90}):(\d{1,3})@(\d{1,7})$/.exec(part);
    if (!match) throw new Error("NOT_A_STORE_ORDER");
    return { id: match[1], quantity: Number(match[2]), unitPrice: Number(match[3]) };
  });
  const valid = validItems(parsed);
  return valid.map((item, index) => ({ ...item, unitPrice: parsed[index].unitPrice }));
}

const whole = (value) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
};

function customerFrom(charge) {
  const billing = charge?.billing_details || {};
  const address = billing.address || {};
  return {
    name: String(billing.name || ""),
    email: String(billing.email || ""),
    phone: String(billing.phone || ""),
    address: {
      country: String(address.country || ""), postalCode: String(address.postal_code || ""),
      state: String(address.state || ""), city: String(address.city || ""),
      line1: String(address.line1 || ""), line2: String(address.line2 || ""),
    },
  };
}

// Returns { recorded: true } once per PaymentIntent, { recorded: false, reason } otherwise.
async function recordPaidOrder(db, stripe, intent) {
  if (!intent || intent.object !== "payment_intent" || intent.status !== "succeeded") {
    return { recorded: false, reason: "NOT_SUCCEEDED" };
  }
  let items;
  try {
    items = parseItemsMetadata(intent.metadata?.items);
  } catch {
    // Subscriptions and older checkouts carry no item list: nothing to record here.
    return { recorded: false, reason: "NOT_A_STORE_ORDER" };
  }
  const ref = db.collection("orders").doc(intent.id);
  const existing = await ref.get();
  if (existing.exists) return { recorded: false, reason: "DUPLICATE" };
  // The customer's name, email and address as given to Stripe at payment (billing details), not the browser call.
  const chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
  const charge = typeof intent.latest_charge === "object" && intent.latest_charge
    ? intent.latest_charge
    : chargeId ? await stripe.charges.retrieve(chargeId) : null;
  const metadata = intent.metadata || {};
  const order = {
    status: "paid",
    amount: intent.amount,
    currency: intent.currency,
    subtotal: whole(metadata.subtotal),
    shipping: whole(metadata.shipping),
    items,
    customer: customerFrom(charge),
    couponCode: String(metadata.couponCode || ""),
    countryCode: String(metadata.countryCode || ""),
    inventoryReservationId: metadata.inventoryReservationId || null,
    chargeId: chargeId || null,
    livemode: Boolean(intent.livemode),
    paidAt: new Date((Number(charge?.created) || Number(intent.created) || Date.now() / 1000) * 1000),
    recordedAt: new Date(),
  };
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (snapshot.exists) return { recorded: false, reason: "DUPLICATE" };
    tx.create(ref, order);
    return { recorded: true };
  });
}

// charge.refunded: the order keeps its history and shows what was refunded. Stock is not returned automatically
// (a refunded bag may not come back); the CEO adjusts stock through the approved route.
async function recordRefund(db, charge) {
  const paymentIntentId = typeof charge?.payment_intent === "string" ? charge.payment_intent : charge?.payment_intent?.id;
  if (!paymentIntentId || !/^pi_[A-Za-z0-9]+$/.test(paymentIntentId)) return { updated: false, reason: "NO_PAYMENT_INTENT" };
  const ref = db.collection("orders").doc(paymentIntentId);
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) return { updated: false, reason: "UNKNOWN_ORDER" };
    const refunded = whole(charge.amount_refunded) || 0;
    const amount = whole(snapshot.data().amount) || 0;
    tx.update(ref, { amountRefunded: refunded, status: refunded >= amount ? "refunded" : "partially_refunded", refundedAt: new Date() });
    return { updated: true };
  });
}

module.exports = { parseItemsMetadata, recordPaidOrder, recordRefund };
