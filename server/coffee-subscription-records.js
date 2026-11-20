"use strict";

// 珈琲の定期便: what Stripe tells us, recorded in Firestore so the shop (and later Jennifer) knows what to ship.
//   coffeeSubscriptions/{subscriptionId}        the contract: customer, address, frequency, preference, status
//   coffeeSubscriptionMonths/{sub}_{YYYY-MM}    one record per monthly invoice: paid / not_charged / payment_failed
//   coffeeSubscriptionShipments/{sub}_first     the first 200 g delivery (paid at sign-up)
//   coffeeSubscriptionShipments/{sub}_{YYYY-MM}_{n}  the n-th delivery of a paid month
//   coffeeSubscriptionEmails/{sha256(email)}    one sign-up per email: the pending Checkout (reservation) and the
//                                               subscription that owns the email (duplicate detection)
// Rules that keep a charge and a delivery from ever happening twice:
//  - a delivery is created only from a PAID invoice (never from a checkout page, a failed or a zero invoice);
//  - every record has a fixed id (subscription, month, number), created once inside a transaction, so a Stripe resend,
//    two events at the same moment, or events in any order write it once;
//  - a second paid invoice for a month that already has one, or a paid invoice for a month the customer skipped, is
//    never turned into deliveries: it is flagged for review (refund decided by the CEO, server/refunds.js).
//  - one running subscription per email: sign-up reserves the email first (coffee-subscription-checkout.js), and the
//    first record of a subscription claims the email in the same transaction; a second running subscription for an
//    email gets no deliveries at all and is flagged for review (DUPLICATE_SUBSCRIPTION; cancel and refund by the CEO).
// Only Stripe objects marked metadata.kind = "coffee-subscription-v2" are handled; everything else is left alone.

const crypto = require("crypto");
const plan = require("./coffee-subscription-plan");
const { CALENDAR } = require("./coffee-subscription-calendar");
const { normalizePreference, preferenceIssues } = require("./coffee-subscription-preference");

const KIND = "coffee-subscription-v2";
const SUBS = "coffeeSubscriptions";
const MONTHS = "coffeeSubscriptionMonths";
const SHIPMENTS = "coffeeSubscriptionShipments";
const EMAILS = "coffeeSubscriptionEmails";
// Stripe statuses (and our own minimal record) of a subscription that still holds its email.
const RUNNING = ["trialing", "active", "past_due", "unpaid", "incomplete", "incomplete_record"];

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

// Several events about one subscription at the same moment (Stripe sends checkout.session.completed and invoice.paid
// together, and may resend either) wait on the same documents. When Firestore gives up waiting, the transaction was
// never committed and has written nothing: gRPC 10 ABORTED after the client's own retries, or 3 INVALID_ARGUMENT for a
// transaction the database already dropped ("invalid or closed" on the emulator, "expired or no longer valid" on
// Firestore). Running it again is safe: every handler reads what is already recorded and creates each record once
// (fixed ids, tx.create). Retried here, a few times with a short random pause, so one delivery of an event is enough
// and nothing depends on Stripe sending it again. Any other error is never retried.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const notCommitted = (error) => error?.code === 10
  || (error?.code === 3 && /transaction (is invalid or closed|has expired|.*no longer valid)/i.test(String(error?.message || "")));
async function retryOnContention(run, { attempts = 4, pauseMs = 150 } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try { return await run(); } catch (error) {
      if (!notCommitted(error) || attempt >= attempts) throw error;
      await sleep(pauseMs * attempt + Math.floor(Math.random() * pauseMs));
    }
  }
}
const emailKey = (email) => crypto.createHash("sha256").update(normalizeEmail(email)).digest("hex");

const idOf = (value) => (typeof value === "string" ? value : value?.id || null);

// Reads (inside a transaction, before any write) whether this subscription may own its email, and returns the write
// that claims it. A subscription already checked keeps its decision; an owner that has ended frees the email.
async function readOwnership(tx, db, subscriptionId, email, contract, now) {
  if (contract?.ownerChecked) return { duplicateOf: contract.duplicateOf || null, write: () => {}, patch: {} };
  if (!normalizeEmail(email)) return { duplicateOf: null, write: () => {}, patch: {} };
  const ref = db.collection(EMAILS).doc(emailKey(email));
  const snap = await tx.get(ref);
  const owner = snap.exists ? snap.data().subscriptionId || null : null;
  let duplicateOf = null;
  if (owner && owner !== subscriptionId) {
    const ownerSnap = await tx.get(db.collection(SUBS).doc(owner));
    if (ownerSnap.exists && RUNNING.includes(ownerSnap.data().status)) duplicateOf = owner;
  }
  const patch = duplicateOf
    ? { ownerChecked: true, duplicateOf, needsReview: true, reviewReason: "DUPLICATE_SUBSCRIPTION" }
    : { ownerChecked: true, duplicateOf: null };
  const write = () => { if (!duplicateOf) tx.set(ref, { status: "active", subscriptionId, updatedAt: new Date(now) }, { merge: true }); };
  return { duplicateOf, write, patch };
}

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
    city: String(a.city || ""), line1: String(a.line1 || ""), line2: String(a.line2 || ""), country: String(a.country || ""),
    phone: String(details.phone || session.customer_details?.phone || "") };
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
    const current = snap.exists ? snap.data() : null;
    if (current && current.checkoutSessionId === session.id) return { handled: true, duplicate: true };
    const owner = await readOwnership(tx, db, subscriptionId, details.email, current, now);
    owner.write();
    if (!current) {
      tx.create(ref, { ...details, status: "trialing", preference: { text: safePreference, updatedAt: new Date(now) },
        skips: [], changes: {}, cancelFrom: null, planVersion: 0, ...owner.patch, createdAt: new Date(now), updatedAt: new Date(now) });
      return { handled: true, created: true, duplicateOf: owner.duplicateOf };
    }
    // An invoice event came first and left a minimal record: fill in what only the checkout knows.
    tx.update(ref, { ...details, preference: current.preference?.text ? current.preference : { text: safePreference, updatedAt: new Date(now) },
      ...owner.patch, updatedAt: new Date(now) });
    return { handled: true, completed: true, duplicateOf: owner.duplicateOf };
  });
}

// checkout.session.expired: the customer left the Checkout page; the email's reservation is freed for a new sign-up.
async function handleCheckoutExpired(db, session, config, now = Date.now()) {
  if (session?.mode !== "subscription" || session.metadata?.kind !== KIND) return { handled: false };
  const email = session.customer_email || session.customer_details?.email;
  if (!normalizeEmail(email)) return { handled: true, released: false };
  const ref = db.collection(EMAILS).doc(emailKey(email));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().sessionId !== session.id || snap.data().status !== "pending") return { handled: true, released: false };
    tx.update(ref, { status: "released", updatedAt: new Date(now) });
    return { handled: true, released: true };
  });
}

async function ensureSubscription(tx, db, subscriptionId, invoice, now) {
  const ref = db.collection(SUBS).doc(subscriptionId);
  const snap = await tx.get(ref);
  if (snap.exists) return { ref, data: snap.data(), exists: true };
  const minimal = { customerId: idOf(invoice.customer), email: normalizeEmail(invoice.customer_email), status: "incomplete_record",
    skips: [], changes: {}, cancelFrom: null, planVersion: 0, preference: { text: "", updatedAt: new Date(now) }, livemode: invoice.livemode === true,
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
    const owner = await readOwnership(tx, db, sub.id, contract.data.email || invoice.customer_email, contract.exists ? contract.data : null, now);
    const writes = [owner.write];
    const contractPatch = { paymentIssue: false, ...owner.patch, updatedAt: new Date(now) };
    let result;
    if (owner.duplicateOf && amount > 0) {
      // A second running subscription for the same email: nothing is shipped; the CEO decides (cancel, refund).
      const line = subscriptionLine(invoice);
      if (reason === "subscription_cycle" && line) {
        const month = plan.monthOf(Number(line.period.start) * 1000);
        writes.push(() => tx.set(db.collection(MONTHS).doc(`${sub.id}_${month}`), { subscriptionId: sub.id, month, status: "paid", invoiceId: invoice.id,
          amount, needsReview: true, reviewReason: "DUPLICATE_SUBSCRIPTION", updatedAt: new Date(now) }, { merge: true }));
      }
      result = { handled: true, review: "DUPLICATE_SUBSCRIPTION" };
    } else if (reason === "subscription_create") {
      // The sign-up invoice: the first 200 g (¥3,000) and the zero-priced start of the subscription.
      const ref = db.collection(SHIPMENTS).doc(`${sub.id}_first`);
      const snap = await tx.get(ref);
      if (amount !== plan.FIRST_DELIVERY_PRICE) {
        result = { handled: true, review: "UNEXPECTED_FIRST_AMOUNT" };
        Object.assign(contractPatch, { needsReview: true, reviewReason: "UNEXPECTED_FIRST_AMOUNT" });
      } else if (snap.exists) {
        result = { handled: true, duplicate: true };
      } else {
        const paidMs = Number(invoice.status_transitions?.paid_at || 0) * 1000 || now;
        // The first 200 g goes out after the sign-up payment, within 3 working days.
        const shipBy = (() => { try { return plan.workingDayAfter(plan.dayOf(paidMs), plan.LATE_SHIP_WITHIN_WORKING_DAYS, config.calendar || CALENDAR); } catch { return null; } })();
        writes.push(() => tx.create(ref, { subscriptionId: sub.id, kind: "first", month: plan.monthOf(paidMs), shipBy,
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
        const paidMs = Number(invoice.status_transitions?.paid_at || 0) * 1000 || now;
        const { review, deliveries } = plan.deliveryPlan(month, frequency, plan.dayOf(paidMs), config.calendar || CALENDAR);
        const refs = deliveries.map((_, i) => db.collection(SHIPMENTS).doc(`${sub.id}_${month}_${i + 1}`));
        const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
        writes.push(() => tx.set(monthRef, { subscriptionId: sub.id, month, status: "paid", invoiceId: invoice.id, amount, frequency,
          paidAt: new Date(paidMs), ...(review ? { needsReview: true, reviewReason: review } : {}), updatedAt: new Date(now) }, { merge: true }));
        // A late delivery that cannot be planned safely waits for review instead of going out (never twice).
        refs.forEach((ref, i) => {
          const d = deliveries[i];
          if (!snaps[i].exists) writes.push(() => tx.create(ref, { subscriptionId: sub.id, kind: "monthly", month, seq: i + 1, plannedDate: d.plannedDate,
            originalDate: d.originalDate, ...(d.paidLate ? { paidLate: true, shipBy: d.shipBy || null } : {}), grams: plan.GRAMS_PER_DELIVERY,
            status: d.paidLate && review ? "needs_review" : "planned", invoiceId: invoice.id, createdAt: new Date(now) }));
        });
        if (review) Object.assign(contractPatch, { needsReview: true, reviewReason: review });
        result = { handled: true, shipments: deliveries.length, ...(review ? { review } : {}) };
      }
    } else {
      // Other invoices of the subscription (a skipped month starts with a zero "subscription_update" invoice): a zero
      // invoice is recorded as not charged; any amount is never shipped and is flagged (it should not happen).
      const line = subscriptionLine(invoice);
      const month = line ? plan.monthOf(Number(line.period.start) * 1000) : null;
      if (amount <= 0) {
        if (month) {
          const monthRef = db.collection(MONTHS).doc(`${sub.id}_${month}`);
          const monthSnap = await tx.get(monthRef);
          if (!monthSnap.exists) writes.push(() => tx.create(monthRef, { subscriptionId: sub.id, month, status: "not_charged", invoiceId: invoice.id, amount: 0, reason, updatedAt: new Date(now) }));
        }
        result = { handled: true, shipments: 0 };
      } else {
        Object.assign(contractPatch, { needsReview: true, reviewReason: "UNEXPECTED_INVOICE", unexpectedInvoiceId: invoice.id });
        result = { handled: true, review: "UNEXPECTED_INVOICE" };
      }
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
  // Stripe's own retry settings decide when an unpaid subscription ends; the reason is kept (e.g. payment_failed).
  await ref.set({ status: subscription.status, frequencyNow: frequencyOfPrice(price, config),
    endedReason: subscription.status === "canceled" ? subscription.cancellation_details?.reason || null : null,
    cancelAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null,
    canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
    customerId: idOf(subscription.customer), updatedAt: new Date(now) }, { merge: true });
  return { handled: true };
}

const HANDLERS = {
  "checkout.session.completed": handleCheckoutCompleted,
  "checkout.session.expired": handleCheckoutExpired,
  "invoice.paid": handleInvoicePaid,
  "invoice.payment_failed": handleInvoicePaymentFailed,
  "customer.subscription.updated": handleSubscriptionChanged,
  "customer.subscription.deleted": handleSubscriptionChanged,
};

async function handleEvent(db, event, config, now = Date.now()) {
  const handler = HANDLERS[event?.type];
  if (!handler) return { handled: false };
  return retryOnContention(() => handler(db, event.data.object, config, now));
}

module.exports = { KIND, SUBS, MONTHS, SHIPMENTS, EMAILS, RUNNING, normalizeEmail, emailKey, retryOnContention, EVENT_TYPES: Object.keys(HANDLERS), handleEvent,
  handleCheckoutCompleted, handleCheckoutExpired,
  handleInvoicePaid, handleInvoicePaymentFailed, handleSubscriptionChanged, invoiceSubscription, subscriptionLine };
