"use strict";

// 珈琲の定期便 ③: what Factory (Jennifer) may read about subscriptions — read only, through the signed connection of
// server/factory-refund-api.js. Off unless FACTORY_SUBSCRIPTION_READ_ENABLED=true (separate from refunds).
//  - subscriptions.list / .get / .schedule carry no personal details: a contract number (SUB-XXXXXX), the prefecture,
//    the state, the plan and charges, deliveries and the coffee preference (checked at entry to hold no personal
//    details). These are what may appear in Jennifer's chat.
//  - subscriptions.contact (name, email, phone, address) answers only a request carrying the CEO's fresh view record
//    (the Factory user id must be FACTORY_CEO_USER_ID, at most 2 minutes old, used once). That the CEO looked is recorded
//    (factorySubscriptionContactViews/{requestId}: contract and time only); the details themselves are never stored or
//    logged here.
// Only 珈琲の定期便 contracts (coffeeSubscriptions) exist here; the old plans' subscriptions are not visible.

const plan = require("./coffee-subscription-plan");
const records = require("./coffee-subscription-records");
const account = require("./coffee-subscription-account");
const { CALENDAR } = require("./coffee-subscription-calendar");

const VIEWS = "factorySubscriptionContactViews";
const CONTACT_VIEW_MAX_AGE_MS = 2 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FILTERS = ["all", "active", "payment_issue", "review", "cancel_scheduled", "skip_next"];
const ENDED = ["canceled", "incomplete_expired"];

class ReadError extends Error { constructor(code) { super(code); this.code = code; } }
const deny = (code) => { throw new ReadError(code); };
const toMs = (v) => (v?.toMillis ? v.toMillis() : v instanceof Date ? v.getTime() : typeof v === "number" ? v : null);

const readEnabled = (env) => env.FACTORY_SUBSCRIPTION_READ_ENABLED === "true";

// The contract number Jennifer shows: short, stable, no personal detail.
const contractRef = (id) => `SUB-${String(id).replace(/^sub_/, "").slice(-6).toUpperCase()}`;

// Days in Japan time (YYYY-MM-DD). This week: Monday to Sunday; this month: the 1st to the last day.
function jstDay(at) {
  const d = new Date(new Date(at).getTime() + 9 * 3600 * 1000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}
const key = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
function rangeFor(kind, at) {
  const { y, m, d } = jstDay(at);
  if (kind === "week") {
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
    const back = (weekday + 6) % 7; // days since Monday
    return { kind, from: key(y, m, d - back), to: key(y, m, d - back + 6) };
  }
  if (kind === "month") return { kind, from: key(y, m, 1), to: key(y, m + 1, 0) };
  return deny("INVALID_RANGE");
}

async function allContracts(db) {
  const snap = await db.collection(records.SUBS).limit(500).get();
  return snap.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
}

// The contract a request names: its Stripe id (sub_…) or its number (SUB-XXXXXX).
async function findContract(db, value) {
  const v = String(value || "").trim();
  if (/^sub_[A-Za-z0-9]{6,80}$/.test(v)) {
    const snap = await db.collection(records.SUBS).doc(v).get();
    return snap.exists ? { id: v, data: snap.data() } : deny("UNKNOWN_SUBSCRIPTION");
  }
  if (!/^SUB-[A-Z0-9]{6}$/i.test(v)) deny("INVALID_QUERY");
  const hits = (await allContracts(db)).filter((c) => contractRef(c.id) === v.toUpperCase());
  if (!hits.length) deny("UNKNOWN_SUBSCRIPTION");
  if (hits.length > 1) deny("AMBIGUOUS_SUBSCRIPTION");
  return hits[0];
}

// What every view shares about a contract: never a name, email, phone or street address.
function headline(id, c, now) {
  const changeable = plan.firstChangeableMonth(now);
  const next = plan.monthPlan({ startMonth: c.startMonth, frequency: c.frequency, changes: c.changes || {}, skips: c.skips || [], cancelFrom: c.firstUnchargedMonth || null },
    plan.monthOf(now) >= c.startMonth ? plan.addMonths(plan.monthOf(now), 1) : c.startMonth, 1)[0] || null;
  return {
    ref: contractRef(id), subscriptionId: id, status: c.status || null, livemode: c.livemode === true,
    frequency: Number(c.frequencyNow || c.frequency) || null, startMonth: c.startMonth || null, prefecture: c.shipping?.prefecture || "",
    nextCharge: next ? { month: next.month, skipped: next.skipped, amount: next.skipped ? 0 : plan.MONTHLY_PRICES[next.frequency], frequency: next.frequency } : null,
    skips: (c.skips || []).filter((m) => m >= plan.monthOf(now)), firstChangeableMonth: changeable,
    paymentIssue: c.paymentIssue === true, needsReview: c.needsReview === true, reviewReason: c.reviewReason || null,
    cancellation: c.cancelRequestedAt ? { endsAt: toMs(c.cancelAt), firstUnchargedMonth: c.firstUnchargedMonth || null } : null,
    duplicate: Boolean(c.duplicateOf),
  };
}

async function listSubscriptions(db, query = {}, now) {
  if (!query || typeof query !== "object" || Array.isArray(query)) deny("INVALID_QUERY");
  const filter = query.filter === undefined ? "all" : String(query.filter);
  if (!FILTERS.includes(filter)) deny("INVALID_QUERY");
  const limit = Math.min(Math.max(Number.isSafeInteger(query.limit) ? query.limit : 30, 1), 100);
  const nextMonth = plan.addMonths(plan.monthOf(now), 1);
  const rows = (await allContracts(db)).map(({ id, data }) => ({ ...headline(id, data, now), createdAt: toMs(data.createdAt) }));
  const keep = {
    all: () => true,
    active: (r) => !ENDED.includes(r.status) && !r.cancellation,
    payment_issue: (r) => r.paymentIssue || ["past_due", "unpaid"].includes(r.status),
    review: (r) => r.needsReview || r.duplicate,
    cancel_scheduled: (r) => Boolean(r.cancellation) && !ENDED.includes(r.status),
    skip_next: (r) => r.skips.includes(nextMonth),
  }[filter];
  const list = rows.filter(keep).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return { filter, total: list.length, subscriptions: list.slice(0, limit) };
}

async function getSubscription(db, value, now) {
  const { id, data } = await findContract(db, value);
  const s = await account.summary({ db, auth: { subscriptionId: id, contract: data }, now, config: { calendar: CALENDAR, portalConfigurationId: null } });
  const months = (await db.collection(records.MONTHS).where("subscriptionId", "==", id).get()).docs.map((d) => d.data())
    .map((m) => ({ month: m.month, status: m.status, amount: m.amount ?? null, attempts: m.attempts ?? null, needsReview: m.needsReview === true, reviewReason: m.reviewReason || null }))
    .sort((a, b) => String(b.month).localeCompare(String(a.month))).slice(0, 12);
  return {
    subscription: {
      ...headline(id, data, now),
      changeDeadline: s.changeDeadline, plan: s.months, charges: months, shipments: s.shipments,
      preference: { text: data.preference?.text || "", updatedAt: toMs(data.preference?.updatedAt) },
      refundProposal: data.refundProposal ? { amount: data.refundProposal.amount, status: data.refundProposal.status, reason: data.refundProposal.reason } : null,
      createdAt: toMs(data.createdAt),
    },
  };
}

async function schedule(db, range, now) {
  const r = rangeFor(String(range || ""), now);
  const months = [...new Set([plan.addMonths(r.from.slice(0, 7), -1), r.from.slice(0, 7), r.to.slice(0, 7)])];
  const contracts = new Map((await allContracts(db)).map((c) => [c.id, c.data]));
  const docs = (await db.collection(records.SHIPMENTS).where("month", "in", months).get()).docs.map((d) => d.data());
  const deliveries = docs
    .map((s) => ({ ...s, date: s.plannedDate || s.shipBy || null }))
    .filter((s) => s.date && s.date >= r.from && s.date <= r.to && s.status !== "cancelled_before_shipping")
    .map((s) => {
      const c = contracts.get(s.subscriptionId) || {};
      return { date: s.date, ref: contractRef(s.subscriptionId), kind: s.kind, month: s.month, seq: s.seq ?? null, status: s.status,
        byDate: !s.plannedDate && Boolean(s.shipBy), grams: s.grams || plan.GRAMS_PER_DELIVERY, prefecture: c.shipping?.prefecture || "",
        preference: c.preference?.text || "", livemode: c.livemode === true };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref));
  const inRange = (ms) => ms && new Date(ms + 9 * 3600e3).toISOString().slice(0, 10) >= r.from && new Date(ms + 9 * 3600e3).toISOString().slice(0, 10) <= r.to;
  const skipped = [];
  const ending = [];
  for (const [id, c] of contracts) {
    if ((c.skips || []).some((m) => months.slice(1).includes(m))) skipped.push({ ref: contractRef(id), months: (c.skips || []).filter((m) => months.slice(1).includes(m)) });
    if (c.cancelRequestedAt && inRange(toMs(c.cancelAt))) ending.push({ ref: contractRef(id), endsAt: toMs(c.cancelAt) });
  }
  return { range: r, deliveries, totalDeliveries: deliveries.length, totalGrams: deliveries.reduce((n, d) => n + d.grams, 0), skipped, ending };
}

// The CEO's view record for contact details: exactly these keys, the CEO's Factory user id, fresh, used once.
function verifyContactView(view, env, now) {
  if (!view || typeof view !== "object" || Array.isArray(view) || Object.keys(view).sort().join(",") !== "requestId,viewedAt,viewedBy") deny("CEO_VIEW_REQUIRED");
  if (view.viewedBy !== env.FACTORY_CEO_USER_ID || !UUID_RE.test(String(view.requestId))) deny("CEO_VIEW_REQUIRED");
  if (!Number.isSafeInteger(view.viewedAt) || view.viewedAt > now + 1000 || now - view.viewedAt > CONTACT_VIEW_MAX_AGE_MS) deny("CEO_VIEW_EXPIRED");
  return view;
}

async function contact(db, value, view, env, now) {
  const v = verifyContactView(view, env, now);
  const { id, data } = await findContract(db, value);
  // The fact of looking, without the details: which contract and when (one record per view request).
  try {
    await db.collection(VIEWS).doc(v.requestId).create({ subscriptionId: id, ref: contractRef(id), viewedAt: new Date(now), by: "factory-ceo" });
  } catch {
    deny("REPLAYED_REQUEST");
  }
  const s = data.shipping || {};
  return { contact: { ref: contractRef(id), name: s.name || "", email: data.email || "", phone: s.phone || "",
    address: { postalCode: s.postalCode || "", prefecture: s.prefecture || "", city: s.city || "", line1: s.line1 || "", line2: s.line2 || "" } } };
}

module.exports = { VIEWS, ReadError, readEnabled, contractRef, rangeFor, listSubscriptions, getSubscription, schedule, contact, verifyContactView, FILTERS, CONTACT_VIEW_MAX_AGE_MS };
