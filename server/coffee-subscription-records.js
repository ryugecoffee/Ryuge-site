"use strict";

// 珈琲の定期便: what Stripe tells us, recorded in Firestore so the shop (and later Jennifer) knows what to ship.
//   coffeeSubscriptions/{subscriptionId}        the contract: customer, address, frequency, preference, status
//   coffeeSubscriptionMonths/{sub}_{YYYY-MM}    one record per monthly invoice: paid / not_charged / payment_failed
//   coffeeSubscriptionShipments/{sub}_first     the first 200 g delivery (paid at sign-up)
//   coffeeSubscriptionShipments/{sub}_{YYYY-MM}_{n}  the n-th delivery of a paid month
// Rules that keep a charge and a delivery from ever happening twice:
//  - a delivery is created only from a PAID invoice (never from a checkout page, a failed or a zero invoice);
//  - every record has a fixed id (subscription, month, number), created once inside a transaction, so a Stripe resend,
//    two events at the same moment, or events in any order write it once;
//  - a second paid invoice for a month that already has one, or a paid invoice for a month the customer skipped, is
//    never turned into deliveries: it is flagged for review (refund decided by the CEO, server/refunds.js).
// Only Stripe objects marked metadata.kind = "coffee-subscription-v2" are handled; everything else is left alone.

const plan = require("./coffee-subscription-plan");
const { CALENDAR } = require("./coffee-subscription-calendar");
const { normalizePreference, preferenceIssues } = require("./coffee-subscription-preference");

const KIND = "coffee-subscription-v2";
const SUBS = "coffeeSubscriptions";
const MONTHS = "coffeeSubscriptionMonths";
const SHIPMENTS = "coffeeSubscriptionShipments";

const idOf = (value) => (typeof value === "string" ? value : value?.id || null);

// Works with Stripe API versions before and after invoice.subscription moved under invoice.parent.
function invoiceSubscription(invoice) {
  const details = invoice?.parent?.subscription_details || invoice?.subscription_details || {};
  return { id: idOf(details.subscription) || idOf(invoice?.subscription), metadata: details.metadata || {} };
}

function subscriptionLine(invoice) {
  return (invoice?.lines?.data || []).find((line) => {
    const price = line.pricing?.price_details?.price || line.price?.id || line.price;
    return idOf(price) && line.period?.start && (line.type === "subscription" || line.parent?.type === "subscription_item_details" || line.subscription_item || line.parent?.subscription_item_details);
  }) || null;
}

const linePrice = (line) => idOf(line?.pricing?.price_details?.price || line?.price);

function frequencyOfPrice(priceId, config) {
  const hit = Object.entries(config.priceIds || {}).find(([, id]) => id && id === priceId);
  return hit ? Number(hit[0]) : null;
}

function shippingFrom(session) {
  const details = session.collected_information?.shipping_details || session.shipping_details || session.shipping || null;
  if (!details?.address) return null;
  const a = details.address;
  return { name: String(details.name || ""), postalCode: String(a.postal_code || ""), prefecture: String(a.state || ""),
    city: String(a.city || ""), line1: String(a.line1 || ""), line2: String(a.line2 || ""), country: String(a.country || "") };
}

// checkout.session.completed: the contract with the customer's details and preference. The paid first delivery is
// created from the paid invoice (handleInvoicePaid), whichever of the two events comes first.
async function handleCheckoutCompleted(db, session, config, now = Date.now()) {
  if (session?.mode !== "subscription" || session.metadata?.kind !== KIND) return { handled: false };
  const subscriptionId = idOf(session.subscription);
  if (!subscriptionId) return { handled: false, reason: "NO_SUBSCRIPTION" };
  const preference = normalizePreference(session.metadata?.preference || "");
  const safePreference = preferenceIssues(preference).length ? "" : preference;
  const details = {
    customerId: idOf(session.customer),
    email: String(session.customer_details?.email || session.customer_email || "").trim().toLowerCase(),
    name: String(session.customer_details?.name || ""),
    shipping: shippingFrom(session),
    frequency: plan.validFrequency(session.metadata?.frequency),
    startMonth: String(session.metadata?.startMonth || ""),
    checkoutSessionId: session.id,
    livemode: session.livemode === true,
  };
  const ref = db.collection(SUBS).doc(subscriptionId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      tx.create(ref, { ...details, status: "trialing", preference: { text: safePreference, updatedAt: new Date(now) },
        skips: [], changes: {}, cancelFrom: null, createdAt: new Date(now), updatedAt: new Date(now) });
      return { handled: true, created: true };
    }
    const current = snap.data();
    if (current.checkoutSessionId === session.id) return { handled: true, duplicate: true };
    // An invoice event came first and left a minimal record: fill in what only the checkout knows.
    tx.update(ref, { ...details, preference: current.preference?.text ? current.preference : { text: safePreference, updatedAt: new Date(now) },
      updatedAt: new Date(now) });
    return { handled: true, completed: true };
  });
}

async function ensureSubscription(tx, db, subscriptionId, invoice, now) {
  const ref = db.collection(SUBS).doc(subscriptionId);
  const snap = await tx.get(ref);
  if (snap.exists) return { ref, data: snap.data(), exists: true };
  const minimal = { customerId: idOf(invoice.customer), email: String(invoice.customer_email || "").toLowerCase(), status: "incomplete_record",
    skips: [], changes: {}, cancelFrom: null, preference: { text: "", updatedAt: new Date(now) }, livemode: invoice.livemode === true,
    createdAt: new Date(now), updatedAt: new Date(now) };
  return { ref, data: minimal, exists: false };
}

// invoice.paid: the first delivery (sign-up invoice) or a month's deliveries (monthly invoice).
async function handleInvoicePaid(db, invoice, config, now = Date.now()) {
  const sub = invoiceSubscription(invoice);
  if (!sub.id || sub.metadata.kind !== KIND) return { handled: false };
  const reason = invoice.billing_reason;
  const amount = Number(invoice.amount_paid || 0);
  return db.runTransaction(async (tx) => {
    const contract = await ensureSubscription(tx, db, sub.id, invoice, now);
    const writes = [];
    const contractPatch = { paymentIssue: false, updatedAt: new Date(now) };
    let result;
    if (reason === "subscription_create") {
      // The sign-up invoice: the first 200 g (¥3,000) and the zero-priced start of the subscription.
      const ref = db.collection(SHIPMENTS).doc(`${sub.id}_first`);
      const snap = await tx.get(ref);
      if (amount !== plan.FIRST_DELIVERY_PRICE) {
        result = { handled: true, review: "UNEXPECTED_FIRST_AMOUNT" };
        Object.assign(contractPatch, { needsReview: true, reviewReason: "UNEXPECTED_FIRST_AMOUNT" });
      } else if (snap.exists) {
        result = { handled: true, duplicate: true };
      } else {
        writes.push(() => tx.create(ref, { subscriptionId: sub.id, kind: "first", month: plan.monthOf(Number(invoice.status_transitions?.paid_at || 0) * 1000 || now),
          seq: 0, plannedDate: null, grams: plan.GRAMS_PER_DELIVERY, status: "planned", invoiceId: invoice.id, createdAt: new Date(now) }));
        result = { handled: true, shipments: 1 };
      }
    } else if (reason === "subscription_cycle") {
      const line = subscriptionLine(invoice);
      if (!line) return { handled: true, review: "NO_SUBSCRIPTION_LINE" };
      const month = plan.monthOf(Number(line.period.start) * 1000);
      const monthRef = db.collection(MONTHS).doc(`${sub.id}_${month}`);
      const monthSnap = await tx.get(monthRef);
      const frequency = frequencyOfPrice(linePrice(line), config);
      if (monthSnap.exists && monthSnap.data().status === "paid" && monthSnap.data().invoiceId !== invoice.id && amount > 0) {
        // A second charge for the same month: never shipped twice; flagged for a refund decision.
        writes.push(() => tx.update(monthRef, { needsReview: true, reviewReason: "SECOND_PAID_INVOICE", extraInvoiceId: invoice.id, updatedAt: new Date(now) }));
        result = { handled: true, review: "SECOND_PAID_INVOICE" };
      } else if (monthSnap.exists && monthSnap.data().invoiceId === invoice.id && monthSnap.data().status === "paid") {
        result = { handled: true, duplicate: true };
      } else if (amount <= 0) {
        writes.push(() => tx.set(monthRef, { subscriptionId: sub.id, month, status: "not_charged", invoiceId: invoice.id, amount: 0, updatedAt: new Date(now) }, { merge: true }));
        result = { handled: true, shipments: 0 };
      } else if ((contract.data.skips || []).includes(month) || !frequency) {
        // Charged for a month that should not have been (skipped) or at an unknown price: no deliveries, review.
        const why = frequency ? "CHARGED_SKIPPED_MONTH" : "UNKNOWN_PRICE";
        writes.push(() => tx.set(monthRef, { subscriptionId: sub.id, month, status: "paid", invoiceId: invoice.id, amount, needsReview: true, reviewReason: why, updatedAt: new Date(now) }, { merge: true }));
        result = { handled: true, review: why };
      } else {
        const dates = plan.shippingDates(month, frequency, config.calendar || CALENDAR);
        const refs = dates.map((_, i) => db.collection(SHIPMENTS).doc(`${sub.id}_${month}_${i + 1}`));
        const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
        writes.push(() => tx.set(monthRef, { subscriptionId: sub.id, month, status: "paid", invoiceId: invoice.id, amount, frequency,
          paidAt: new Date(Number(invoice.status_transitions?.paid_at || 0) * 1000 || now), updatedAt: new Date(now) }, { merge: true }));
        refs.forEach((ref, i) => {
          if (!snaps[i].exists) writes.push(() => tx.create(ref, { subscriptionId: sub.id, kind: "monthly", month, seq: i + 1, plannedDate: dates[i],
            grams: plan.GRAMS_PER_DELIVERY, status: "planned", invoiceId: invoice.id, createdAt: new Date(now) }));
        });
        result = { handled: true, shipments: dates.length };
      }
    } else {
      return { handled: true, ignored: reason };
    }
    // One write per document in the transaction: the contract is created or updated once, at the end.
    for (const write of writes) write();
    if (contract.exists) tx.update(contract.ref, contractPatch);
    else tx.create(contract.ref, { ...contract.data, ...contractPatch });
    return result;
  });
}

// invoice.payment_failed: the month is not shipped (deliveries come only from a paid invoice); Stripe retries.
async function handleInvoicePaymentFailed(db, invoice, config, now = Date.now()) {
  const sub = invoiceSubscription(invoice);
  if (!sub.id || sub.metadata.kind !== KIND || invoice.billing_reason !== "subscription_cycle") return { handled: false };
  const line = subscriptionLine(invoice);
  const month = line ? plan.monthOf(Number(line.period.start) * 1000) : plan.monthOf(now);
  const monthRef = db.collection(MONTHS).doc(`${sub.id}_${month}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(monthRef);
    const contract = await ensureSubscription(tx, db, sub.id, invoice, now);
    if (snap.exists && snap.data().status === "paid") return { handled: true, alreadyPaid: true };
    tx.set(monthRef, { subscriptionId: sub.id, month, status: "payment_failed", invoiceId: invoice.id, attempts: Number(invoice.attempt_count || 0),
      nextAttemptAt: invoice.next_payment_attempt ? new Date(invoice.next_payment_attempt * 1000) : null, updatedAt: new Date(now) }, { merge: true });
    if (contract.exists) tx.update(contract.ref, { paymentIssue: true, updatedAt: new Date(now) });
    else tx.create(contract.ref, { ...contract.data, paymentIssue: true });
    return { handled: true, shipments: 0 };
  });
}

// customer.subscription.updated / deleted: the contract's status and end as Stripe has them.
async function handleSubscriptionChanged(db, subscription, config, now = Date.now()) {
  if (subscription?.metadata?.kind !== KIND) return { handled: false };
  const ref = db.collection(SUBS).doc(subscription.id);
  const price = idOf(subscription.items?.data?.[0]?.price);
  await ref.set({ status: subscription.status, frequencyNow: frequencyOfPrice(price, config),
    cancelAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null,
    canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
    customerId: idOf(subscription.customer), updatedAt: new Date(now) }, { merge: true });
  return { handled: true };
}

const HANDLERS = {
  "checkout.session.completed": handleCheckoutCompleted,
  "invoice.paid": handleInvoicePaid,
  "invoice.payment_failed": handleInvoicePaymentFailed,
  "customer.subscription.updated": handleSubscriptionChanged,
  "customer.subscription.deleted": handleSubscriptionChanged,
};

async function handleEvent(db, event, config, now = Date.now()) {
  const handler = HANDLERS[event?.type];
  if (!handler) return { handled: false };
  return handler(db, event.data.object, config, now);
}

module.exports = { KIND, SUBS, MONTHS, SHIPMENTS, EVENT_TYPES: Object.keys(HANDLERS), handleEvent, handleCheckoutCompleted,
  handleInvoicePaid, handleInvoicePaymentFailed, handleSubscriptionChanged, invoiceSubscription, subscriptionLine };
