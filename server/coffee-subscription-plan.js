"use strict";

// 珈琲の定期便 (CEO, 2026-11-18): the rules, as pure functions (no Stripe, no Firestore), so each one is tested alone.
//  - one plan; 1–4 deliveries a month; 100 g × 2 per delivery; tax and shipping included, the same everywhere in Japan;
//  - sign-up pays ¥3,000 for a first 200 g delivery; the monthly charge starts on the 1st of the next month (sign-up on
//    the 1st–15th) or of the month after (16th–end), so the first delivery and the first monthly charge never crowd;
//  - the monthly price is charged in full on the 1st, at 09:00 JST (00:00 UTC); no pro-rating. Stripe counts monthly
//    periods in UTC: a period starting at 00:00 JST (15:00 UTC the day before) slides to the last day of the previous
//    month after a 30-day month (verified with Stripe test clocks, 2026-11-18). 00:00 UTC on the 1st never slides;
//  - changes and skips: by the 25th, from the next month; after the 25th, from the month after;
//  - a skipped month is neither charged nor shipped: it is a zero-price (trial) phase of the Stripe subscription schedule,
//    set when the customer asks, so Stripe never creates a charge for it (nothing is voided afterwards);
//  - cancellation: any time; the next monthly charge is stopped whenever it has not been paid yet.
// Stripe creates the monthly invoice at 09:00 JST as a draft and finalizes and charges it about an hour later.

const TZ_OFFSET_MS = 9 * 60 * 60 * 1000; // JST, no daylight saving

const MONTHLY_PRICES = Object.freeze({ 1: 3000, 2: 5800, 3: 8550, 4: 11200 });
const FIRST_DELIVERY_PRICE = 3000;
const GRAMS_PER_DELIVERY = 200;
const CHANGE_DEADLINE_DAY = 25;
const START_NEXT_MONTH_UNTIL_DAY = 15;
const SHIPPING_DAYS = Object.freeze({ 1: [5], 2: [5, 20], 3: [5, 15, 25], 4: [5, 12, 19, 26] });

class PlanError extends Error {
  constructor(code) { super(code); this.code = code; }
}

function validFrequency(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || !MONTHLY_PRICES[n]) throw new PlanError("INVALID_FREQUENCY");
  return n;
}

// Calendar parts of an instant, in JST.
function jst(at) {
  const d = new Date(new Date(at).getTime() + TZ_OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

const monthKey = (year, month) => `${year}-${String(month).padStart(2, "0")}`;
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

function parseMonth(key) {
  const m = MONTH_RE.exec(String(key));
  if (!m) throw new PlanError("INVALID_MONTH");
  return { year: Number(m[1]), month: Number(m[2]) };
}

function addMonths(key, n) {
  const { year, month } = parseMonth(key);
  const index = year * 12 + (month - 1) + n;
  return monthKey(Math.floor(index / 12), (index % 12) + 1);
}

const monthOf = (at) => { const p = jst(at); return monthKey(p.year, p.month); };

// When a month is charged: 09:00 JST (00:00 UTC) on the 1st, as a Unix timestamp in seconds (what Stripe takes). Every
// period boundary given to Stripe (trial end, schedule phases, cancel_at) is one of these.
function billingStartUnix(key) {
  const { year, month } = parseMonth(key);
  return Math.floor(Date.UTC(year, month - 1, 1) / 1000);
}

// First month charged monthly: next month for a sign-up on the 1st–15th, the month after for the 16th–end.
function startMonthFor(signedUpAt) {
  const { day } = jst(signedUpAt);
  return addMonths(monthOf(signedUpAt), day <= START_NEXT_MONTH_UNTIL_DAY ? 1 : 2);
}

// First month a change or a skip asked for now can apply to: by the 25th (JST) the next month, after it the month after.
function firstChangeableMonth(now) {
  const { day } = jst(now);
  return addMonths(monthOf(now), day <= CHANGE_DEADLINE_DAY ? 1 : 2);
}

// Shop working days (Mon–Fri, not a public holiday, not a shop closure). Holidays and closures come from
// server/coffee-subscription-calendar.js, kept as data so they are updated without touching these rules.
function isWorkingDay(year, month, day, calendar) {
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  const key = `${monthKey(year, month)}-${String(day).padStart(2, "0")}`;
  return !calendar.holidays.has(key) && !calendar.closures.has(key);
}

// Shipping dates of a month for a frequency: the 5th / 5th·20th / 5th·15th·25th / 5th·12th·19th·26th, each moved to
// the next working day when it is not one (never earlier: the monthly charge on the 1st comes first). Two deliveries
// never share a date; a date that would leave the month is an error (it cannot happen with these days and a
// calendar of at most a few closed days in a row, and is tested).
function shippingDates(key, frequency, calendar) {
  const { year, month } = parseMonth(key);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dates = [];
  for (const base of SHIPPING_DAYS[validFrequency(frequency)]) {
    let day = base;
    while (day <= last && (!isWorkingDay(year, month, day, calendar) || dates.includes(day))) day += 1;
    if (day > last) throw new PlanError("NO_SHIPPING_DAY_IN_MONTH");
    dates.push(day);
  }
  return dates.map((day) => `${key}-${String(day).padStart(2, "0")}`);
}

// The n-th working day after a day ("YYYY-MM-DD", JST), across months. Throws when none comes within 60 days.
function workingDayAfter(dayKey, n, calendar) {
  const [y, m, d] = String(dayKey).split("-").map(Number);
  let found = 0;
  for (let i = 1; i <= 60; i++) {
    const at = new Date(Date.UTC(y, m - 1, d + i));
    if (isWorkingDay(at.getUTCFullYear(), at.getUTCMonth() + 1, at.getUTCDate(), calendar) && ++found === n) return at.toISOString().slice(0, 10);
  }
  throw new PlanError("NO_WORKING_DAY");
}

const dayOf = (at) => { const p = jst(at); return `${monthKey(p.year, p.month)}-${String(p.day).padStart(2, "0")}`; };

// A paid month's deliveries (CEO, 2026-11-18): on-time ones keep their dates. When the payment came after a date (a
// retried payment), that delivery goes out after the payment: from the next working day, within 3 working days. Two
// late deliveries, a late one reaching the next planned delivery, or one that cannot be scheduled are not planned:
// they go to review (no delivery is ever made twice or before payment). Retry counts and days are Stripe's settings and
// are not assumed here.
const LATE_SHIP_WITHIN_WORKING_DAYS = 3;
function deliveryPlan(month, frequency, paidDay, calendar) {
  const dates = shippingDates(month, frequency, calendar);
  const late = dates.filter((d) => d < paidDay);
  if (!late.length) return { review: null, deliveries: dates.map((d) => ({ plannedDate: d, originalDate: d, paidLate: false })) };
  let review = null;
  let from = null;
  let shipBy = null;
  try {
    from = workingDayAfter(paidDay, 1, calendar);
    shipBy = workingDayAfter(paidDay, LATE_SHIP_WITHIN_WORKING_DAYS, calendar);
  } catch { review = "LATE_DELIVERY_UNSCHEDULABLE"; }
  let next = dates.find((d) => d >= paidDay);
  if (!next) { try { next = shippingDates(addMonths(month, 1), frequency, calendar)[0]; } catch { next = null; } }
  if (!review && (late.length > 1 || (next && shipBy >= next))) review = "LATE_DELIVERIES_OVERLAP";
  return { review, deliveries: dates.map((d) => (d < paidDay
    ? { plannedDate: review ? null : from, shipBy: review ? null : shipBy, originalDate: d, paidLate: true }
    : { plannedDate: d, originalDate: d, paidLate: false })) };
}

// The month-by-month plan the customer has asked for, from the first monthly month: a frequency per month, or a skip.
// state: { startMonth, frequency (from startMonth), changes: { "YYYY-MM": frequency } (from that month on),
//          skips: ["YYYY-MM"], cancelFrom: "YYYY-MM" | null (first month not charged) }
function monthPlan(state, fromMonth, count) {
  const months = [];
  let frequency = validFrequency(state.frequency);
  const changes = state.changes || {};
  const skips = new Set(state.skips || []);
  for (let key = state.startMonth; months.length < count; key = addMonths(key, 1)) {
    if (changes[key]) frequency = validFrequency(changes[key]);
    if (state.cancelFrom && key >= state.cancelFrom) break;
    if (key >= fromMonth) months.push({ month: key, frequency, skipped: skips.has(key) });
  }
  return months;
}

// Stripe subscription schedule phases for that plan, from `fromMonth` on: one phase per run of identical months, each
// from 09:00 JST on the 1st; skipped months are trial phases (Stripe charges nothing for them). The last phase is open
// ended (released to the plain subscription), unless the customer cancelled.
// priceIds: { 1: "price_…", …, 4: "price_…" }.
function schedulePhases(state, fromMonth, priceIds, horizonMonths = 24) {
  const months = monthPlan(state, fromMonth, horizonMonths);
  if (!months.length) return { phases: [], endBehavior: "cancel" };
  const lastExplicit = [...Object.keys(state.changes || {}), ...(state.skips || [])].sort().pop() || fromMonth;
  const runs = [];
  for (const m of months) {
    const prev = runs[runs.length - 1];
    if (prev && prev.frequency === m.frequency && prev.skipped === m.skipped) prev.months += 1;
    else runs.push({ start: m.month, frequency: m.frequency, skipped: m.skipped, months: 1 });
    if (!state.cancelFrom && m.month >= lastExplicit && !m.skipped) break; // the last change is in place: the plain plan continues
  }
  const phases = runs.map((run) => {
    const price = priceIds[run.frequency];
    if (!price) throw new PlanError("PRICE_NOT_CONFIGURED");
    return {
      start_date: billingStartUnix(run.start),
      end_date: billingStartUnix(addMonths(run.start, run.months)),
      items: [{ price, quantity: 1 }],
      proration_behavior: "none",
      ...(run.skipped ? { trial: true } : {}),
      metadata: { months: String(run.months), skipped: run.skipped ? "true" : "false" },
    };
  });
  return { phases, endBehavior: state.cancelFrom ? "cancel" : "release" };
}

// What a cancellation asked for `now` does. The next monthly charge is stopped whenever it has not been paid:
//  - before 09:00 JST on the 1st, this month is not charged yet: the subscription ends at 09:00, before the charge;
//  - `currentMonthInvoice` is this month's monthly invoice as Stripe has it (null when there is none: initial period,
//    a skipped month);
//  - paid: this month was paid for, so its deliveries go out; the subscription ends at the next 1st (no refund);
//  - draft (the hour between 09:00 and the charge): the subscription ends now; Stripe then never finalizes or charges
//    the draft (a subscription's draft cannot be deleted or voided; verified with test clocks);
//  - open / uncollectible (not paid, being retried): that invoice is voided and the subscription ends now;
//  - in every unpaid case nothing more is shipped for this month (deliveries come only from a paid invoice).
// The 25th deadline is for changes and skips only; a cancellation is never pushed to a later month.
function cancellationFor(now, currentMonthInvoice) {
  const month = monthOf(now);
  const status = currentMonthInvoice?.status || null;
  const previous = addMonths(month, -1);
  if (Math.floor(new Date(now).getTime() / 1000) < billingStartUnix(month)) {
    return { action: "CANCEL_AT", cancelAt: billingStartUnix(month), firstUnchargedMonth: month, lastChargedMonth: previous };
  }
  if (status === "draft") return { action: "CANCEL_NOW", firstUnchargedMonth: month, lastChargedMonth: previous };
  if (status && status !== "paid" && status !== "void") {
    return { action: "VOID_AND_CANCEL_NOW", voidInvoice: currentMonthInvoice.id, firstUnchargedMonth: month, lastChargedMonth: previous };
  }
  return { action: "CANCEL_AT", cancelAt: billingStartUnix(addMonths(month, 1)), firstUnchargedMonth: addMonths(month, 1),
    lastChargedMonth: status === "paid" ? month : previous };
}

module.exports = {
  PlanError, MONTHLY_PRICES, FIRST_DELIVERY_PRICE, GRAMS_PER_DELIVERY, CHANGE_DEADLINE_DAY, START_NEXT_MONTH_UNTIL_DAY,
  SHIPPING_DAYS, validFrequency, jst, monthOf, addMonths, parseMonth, billingStartUnix, startMonthFor, firstChangeableMonth,
  isWorkingDay, shippingDates, workingDayAfter, dayOf, deliveryPlan, LATE_SHIP_WITHIN_WORKING_DAYS, monthPlan, schedulePhases, cancellationFor,
};
