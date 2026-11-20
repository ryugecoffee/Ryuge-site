"use strict";

// 珈琲の定期便: applying the customer's plan (skips, frequency changes) and cancellations to Stripe. Not reachable from
// the store yet: the customer's management page and its API come in step ② and call these functions.
//  - Skips and changes are a Stripe subscription schedule, set when the customer asks (by the 25th for the next month,
//    after it for the month after). A skipped month is a trial phase: Stripe charges nothing and sends a zero invoice
//    (billing_reason "subscription_update"), so nothing is shipped. A change is a new price from the 1st, no pro-rating.
//    The month being charged (and every month before the first changeable one) is never touched.
//  - The plan lives in Firestore (coffeeSubscriptions/{id}: skips, changes, planVersion); the schedule is rebuilt from
//    it each time, so two requests at the same moment end with Stripe showing the latest plan (planVersion check).
//  - A cancellation stops the next charge whenever it is not paid yet (plan.cancellationFor). A cancellation before
//    the first 200 g is shipped records a refund proposal of ¥3,000 for the CEO; nothing is refunded automatically.
// Verified against Stripe test mode with test clocks (2026-11-18): server/coffee-subscription-stripe-e2e.js.

const plan = require("./coffee-subscription-plan");
const { SUBS, SHIPMENTS, retryOnContention } = require("./coffee-subscription-records");
const fulfillment = require("./coffee-subscription-fulfillment");

// A first delivery that has not left yet (④: planned, held, or being prepared with its bags reserved).
const NOT_SHIPPED = ["planned", "held", "preparing"];

class PlanChangeError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}

const idOf = (value) => (typeof value === "string" ? value : value?.id || null);
const ENDED = ["canceled", "incomplete_expired"];

// The full list of phases for subscriptionSchedules.update: the current (and any already fixed) phases as Stripe has
// them, cut at the first month the customer may still change, then the plan from that month on.
function buildSchedulePhases({ existingPhases, state, now, priceIds }) {
  const nowSec = Math.floor(now / 1000);
  const changeable = plan.firstChangeableMonth(now);
  const fromMonth = changeable > state.startMonth ? changeable : state.startMonth;
  const cut = plan.billingStartUnix(fromMonth);
  const kept = (existingPhases || [])
    .filter((p) => p.end_date > nowSec && p.start_date < cut)
    .map((p) => {
      const end = Math.min(p.end_date, cut);
      return { start_date: p.start_date, end_date: end, items: p.items.map((i) => ({ price: idOf(i.price), quantity: i.quantity || 1 })),
        proration_behavior: "none", ...(p.trial_end ? { trial_end: Math.min(p.trial_end, end) } : {}), metadata: p.metadata || {} };
    });
  // Months between the last fixed phase and the cut follow the same plan (it cannot have changed for them).
  const lastEnd = kept.length ? kept[kept.length - 1].end_date : null;
  const genFrom = lastEnd && lastEnd < cut ? plan.monthOf(lastEnd * 1000) : fromMonth;
  const { phases, endBehavior } = plan.schedulePhases({ ...state, cancelFrom: null }, genFrom, priceIds);
  const all = [...kept, ...phases];
  for (let i = 1; i < all.length; i++) if (all[i].start_date !== all[i - 1].end_date) throw new PlanChangeError("SCHEDULE_GAP", 500);
  return { phases: all, endBehavior, fromMonth };
}

async function readContract(db, subscriptionId) {
  const snap = await db.collection(SUBS).doc(subscriptionId).get();
  if (!snap.exists) throw new PlanChangeError("NOT_FOUND", 404);
  return snap.data();
}

// Brings the Stripe schedule in line with the plan in Firestore. Repeats when the plan changed while it ran.
async function syncSchedule({ db, stripe, subscriptionId, config, now = Date.now() }) {
  for (let round = 0; round < 3; round++) {
    const contract = await readContract(db, subscriptionId);
    const version = Number(contract.planVersion || 0);
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (ENDED.includes(subscription.status) || subscription.cancel_at) throw new PlanChangeError("SUBSCRIPTION_ENDING", 409);
    let scheduleId = idOf(subscription.schedule);
    if (!scheduleId) {
      // Two requests at once may both try to create it; the second uses the first one's.
      try { scheduleId = (await stripe.subscriptionSchedules.create({ from_subscription: subscriptionId })).id; }
      catch (error) { scheduleId = idOf((await stripe.subscriptions.retrieve(subscriptionId)).schedule); if (!scheduleId) throw error; }
    }
    const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
    const state = { startMonth: contract.startMonth, frequency: contract.frequency, changes: contract.changes || {}, skips: contract.skips || [] };
    const { phases, endBehavior } = buildSchedulePhases({ existingPhases: schedule.phases, state, now, priceIds: config.priceIds });
    await stripe.subscriptionSchedules.update(scheduleId, { phases, end_behavior: endBehavior, proration_behavior: "none",
      metadata: { planVersion: String(version) } });
    const applied = await db.runTransaction(async (tx) => {
      const ref = db.collection(SUBS).doc(subscriptionId);
      const snap = await tx.get(ref);
      if (Number(snap.data().planVersion || 0) !== version) return false;
      tx.update(ref, { appliedPlanVersion: version, scheduleId, updatedAt: new Date(now) });
      return true;
    });
    if (applied) return { scheduleId, planVersion: version, phases: phases.length };
  }
  throw new PlanChangeError("PLAN_CHANGING", 409);
}

// A customer's request: { skip: "YYYY-MM" } / { unskip: "YYYY-MM" } / { frequency: n, from: "YYYY-MM" }. Recorded in
// Firestore (only for months still changeable), then applied to Stripe.
async function requestPlanChange({ db, stripe, subscriptionId, request, config, now = Date.now() }) {
  const changeable = plan.firstChangeableMonth(now);
  const month = String(request.skip || request.unskip || request.from || "");
  plan.parseMonth(month);
  if (month < changeable) throw new PlanChangeError("CHANGE_DEADLINE_PASSED", 409);
  const ref = db.collection(SUBS).doc(subscriptionId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new PlanChangeError("NOT_FOUND", 404);
    const contract = snap.data();
    if (contract.cancelRequestedAt || ENDED.includes(contract.status)) throw new PlanChangeError("SUBSCRIPTION_ENDING", 409);
    if (month < contract.startMonth) throw new PlanChangeError("BEFORE_START", 409);
    const skips = new Set(contract.skips || []);
    const changes = { ...(contract.changes || {}) };
    if (request.skip) skips.add(month);
    else if (request.unskip) skips.delete(month);
    else changes[month] = plan.validFrequency(request.frequency);
    tx.update(ref, { skips: [...skips].sort(), changes, planVersion: Number(contract.planVersion || 0) + 1, updatedAt: new Date(now) });
  });
  return syncSchedule({ db, stripe, subscriptionId, config, now });
}

// This month's monthly invoice as Stripe has it (null when there is none: initial period, a skipped month).
async function currentMonthInvoice(stripe, subscriptionId, now) {
  const month = plan.monthOf(now);
  const list = await stripe.invoices.list({ subscription: subscriptionId, limit: 5 });
  return list.data.find((inv) => inv.billing_reason === "subscription_cycle" && (inv.lines?.data || []).some((l) => l.period?.start
    && plan.monthOf(l.period.start * 1000) === month)) || null;
}

// What a cancellation asked now would do, for the customer to confirm first: the decision and a key that changes when
// the decision would (e.g. the clock passing 09:00 on the 1st, or this month's invoice being paid meanwhile).
const decisionKey = (d, late = null) => [d.action, d.cancelAt || "", d.voidInvoice || "", d.firstUnchargedMonth || "",
  late ? `${late.month}:${late.amount}` : ""].join("|");

// A cancellation asked by email (coffee-subscription-email-cancel.js) counts from when the email arrived. If it arrived
// before 09:00 on the 1st but the shop entered it after this month's invoice was paid, this month is treated as never
// charged: its deliveries are not shipped, and its amount is proposed for refund (by hand, after the CEO's check).
// Only this month: an email older than last month's charge is refused (REQUEST_TOO_OLD) and left to the CEO.
function lateCharge({ requestedAt, now, invoice }) {
  if (requestedAt == null) return null;
  const month = plan.monthOf(now);
  const billing = plan.billingStartUnix(month) * 1000;
  if (!(requestedAt < billing && now >= billing && invoice?.status === "paid")) return null;
  if (requestedAt < plan.billingStartUnix(plan.addMonths(month, -1)) * 1000) throw new PlanChangeError("REQUEST_TOO_OLD", 409);
  return { month, amount: Number(invoice.amount_paid || 0), invoiceId: invoice.id };
}

async function cancellationPreview({ db, stripe, subscriptionId, now = Date.now(), requestedAt = null }) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const ended = ENDED.includes(subscription.status);
  const invoice = ended ? null : await currentMonthInvoice(stripe, subscriptionId, now);
  const decision = plan.cancellationFor(now, invoice);
  const late = ended ? null : lateCharge({ requestedAt, now, invoice });
  const first = await db.collection(SHIPMENTS).doc(`${subscriptionId}_first`).get();
  const firstNotShipped = first.exists && NOT_SHIPPED.includes(first.data().status);
  return { ended, decision, late, key: decisionKey(decision, late), firstNotShipped, refundProposalAmount: firstNotShipped ? plan.FIRST_DELIVERY_PRICE : 0 };
}

async function cancelSubscription({ db, stripe, subscriptionId, now = Date.now(), expectKey = null, requestedAt = null, via = "customer_page" }) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const invoice = ENDED.includes(subscription.status) ? null : await currentMonthInvoice(stripe, subscriptionId, now);
  const decision = plan.cancellationFor(now, invoice);
  const late = ENDED.includes(subscription.status) ? null : lateCharge({ requestedAt, now, invoice });
  // The customer (or the shop, for an email) confirmed a preview: if what would happen has changed since, nothing is done.
  if (expectKey && expectKey !== decisionKey(decision, late) && !ENDED.includes(subscription.status)) throw new PlanChangeError("CANCEL_CHANGED", 409);
  if (!ENDED.includes(subscription.status)) {
    // A schedule would keep (or restart) the plan; the cancellation replaces it.
    if (idOf(subscription.schedule)) await stripe.subscriptionSchedules.release(idOf(subscription.schedule));
    if (decision.action === "CANCEL_AT") {
      await stripe.subscriptions.update(subscriptionId, { cancel_at: decision.cancelAt, proration_behavior: "none" });
    } else {
      await stripe.subscriptions.cancel(subscriptionId, { invoice_now: false, prorate: false });
      if (decision.action === "VOID_AND_CANCEL_NOW") await stripe.invoices.voidInvoice(decision.voidInvoice);
    }
  }
  // Contention (nothing committed) is run again here; a repeat finds cancelRequestedAt and changes nothing.
  return retryOnContention(() => db.runTransaction(async (tx) => {
    const ref = db.collection(SUBS).doc(subscriptionId);
    const firstRef = db.collection(SHIPMENTS).doc(`${subscriptionId}_first`);
    const [snap, first] = [await tx.get(ref), await tx.get(firstRef)];
    if (!snap.exists) throw new PlanChangeError("NOT_FOUND", 404);
    const contract = snap.data();
    // Already cancelled (e.g. on the customer's page after 09:00), but an email asking for it arrived before the
    // charge: the paid month is still treated as never charged (once). Otherwise a repeat changes nothing.
    const lateAfterCancel = Boolean(contract.cancelRequestedAt && late && !contract.monthRefundProposal
      && String(contract.firstUnchargedMonth || "9999-99") > late.month);
    if (contract.cancelRequestedAt && !lateAfterCancel) {
      return { ...decision, duplicate: true, firstUnchargedMonth: contract.firstUnchargedMonth || decision.firstUnchargedMonth,
        refundProposal: contract.refundProposal || null, monthRefundProposal: contract.monthRefundProposal || null };
    }
    const firstOpen = first.exists && NOT_SHIPPED.includes(first.data().status);
    // A late-entered email cancellation: this month's deliveries not shipped yet are stopped too.
    const lateShipments = [];
    if (late) {
      const all = await tx.get(db.collection(SHIPMENTS).where("subscriptionId", "==", subscriptionId));
      for (const d of all.docs) {
        const s = d.data();
        if (s.kind === "monthly" && s.month === late.month) lateShipments.push({ ref: d.ref, data: s, stop: [...NOT_SHIPPED, "needs_review"].includes(s.status) });
      }
    }
    // Bags reserved for the deliveries being stopped go back to stock (all read before any write, one write per bean).
    const releaseBags = await fulfillment.readRelease(tx, db, ...(firstOpen ? [first.data()] : []), ...lateShipments.filter((x) => x.stop).map((x) => x.data));
    const patch = lateAfterCancel ? { firstUnchargedMonth: late.month, cancelRequestReceivedAt: new Date(requestedAt), updatedAt: new Date(now) }
      : { cancelRequestedAt: new Date(now), cancelDecision: decision.action, firstUnchargedMonth: late ? late.month : decision.firstUnchargedMonth,
        cancelAt: decision.cancelAt ? new Date(decision.cancelAt * 1000) : new Date(now), cancelVia: via,
        ...(requestedAt != null ? { cancelRequestReceivedAt: new Date(requestedAt) } : {}), updatedAt: new Date(now) };
    let monthRefundProposal = null;
    if (late) {
      for (const x of lateShipments) if (x.stop) tx.update(x.ref, { status: "cancelled_before_shipping", beans: null, updatedAt: new Date(now) });
      monthRefundProposal = { reason: "EMAIL_CANCEL_BEFORE_CHARGE", month: late.month, amount: late.amount, invoiceId: late.invoiceId,
        shippedBefore: lateShipments.filter((x) => ["shipped", "delivered"].includes(x.data.status)).length, status: "awaiting_ceo_approval", createdAt: new Date(now) };
      Object.assign(patch, { monthRefundProposal, needsReview: true, reviewReason: "REFUND_PROPOSAL" });
    }
    let refundProposal = null;
    releaseBags();
    if (firstOpen) {
      // The first 200 g was paid but not shipped yet: not shipped, and ¥3,000 proposed for refund (CEO approval).
      tx.update(firstRef, { status: "cancelled_before_shipping", beans: null, updatedAt: new Date(now) });
      refundProposal = { reason: "CANCELLED_BEFORE_FIRST_SHIPMENT", amount: plan.FIRST_DELIVERY_PRICE, invoiceId: first.data().invoiceId || null,
        status: "awaiting_ceo_approval", createdAt: new Date(now) };
      Object.assign(patch, { refundProposal, needsReview: true, reviewReason: "REFUND_PROPOSAL" });
    }
    tx.update(ref, patch);
    return { ...decision, firstUnchargedMonth: patch.firstUnchargedMonth, refundProposal, monthRefundProposal };
  }));
}

module.exports = { PlanChangeError, buildSchedulePhases, syncSchedule, requestPlanChange, cancelSubscription, cancellationPreview, decisionKey, lateCharge,
  currentMonthInvoice, ENDED };
