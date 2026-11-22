"use strict";

// Factory (Jennifer, and ChatGPT through Factory) → the shop (2026-11-22), through the signed Factory API
// (server/factory-refund-api.js: service signature, one-time nonce, exact fields):
//   store.overview     sales for a period (store orders and 珈琲の定期便), what waits to ship, what is late
//   fulfillment.list   parcels: store orders and 定期便 deliveries, open / due soon / late / shipped
//   fulfillment.prepare, fulfillment.ship   only with the CEO's approval record (who, which request, when; 15 min)
// Two switches, so reading never brings acting with it: FACTORY_STORE_READ_ENABLED and FACTORY_STORE_SHIP_ENABLED.
// The shipping itself is the shop page's own code (#39), not a copy: order-fulfillment.js (a store order: no stock
// moves, it was settled at payment) and coffee-subscription-fulfillment.js (a 定期便 delivery: its own stock steps),
// with the same once-only "shipped" mail. The CEO's approval id is the request id: an approval acts once, a resend
// returns the first answer. Nothing personal goes back: no name, email, phone or street address (prefecture only).

const of = require("./order-fulfillment");
const plan = require("./coffee-subscription-plan");

const readEnabled = (env) => env.FACTORY_STORE_READ_ENABLED === "true";
const shipEnabled = (env) => env.FACTORY_STORE_SHIP_ENABLED === "true";
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ORDER_ID_RE = /^pi_[A-Za-z0-9]{8,80}$/;
const SHIPMENT_ID_RE = /^sub_[A-Za-z0-9]{6,80}_(first|\d{4}-\d{2}_[1-4])$/;
const MAX_DAYS = 92;

class StoreOpsError extends Error {
  constructor(code, status = 400, detail = null) { super(code); this.code = code; this.status = status; this.detail = detail; }
}
const fail = (code, status, detail) => { throw new StoreOpsError(code, status, detail); };
const jstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
const addDays = (day, n) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dayStart = (day) => new Date(Date.parse(`${day}T00:00:00+09:00`));
const subscriptionFulfillment = () => require("./coffee-subscription-fulfillment");

function range(input, now) {
  const today = jstDay(now);
  const from = input?.from === undefined ? today : String(input.from);
  const to = input?.to === undefined ? from : String(input.to);
  if (!DAY_RE.test(from) || !DAY_RE.test(to) || from > to) fail("INVALID_RANGE");
  if ((Date.parse(to) - Date.parse(from)) / 86400e3 > MAX_DAYS) fail("INVALID_RANGE");
  return { from, to };
}

// Parcels, store orders and 定期便 together, without anything personal.
async function list(db, { view = "open", kind = "all" } = {}, now = Date.now()) {
  if (!["open", "soon", "late", "shipped"].includes(view) || !["all", "order", "subscription"].includes(kind)) fail("INVALID_QUERY");
  const today = jstDay(now);
  const tomorrow = addDays(today, 1);
  const names = await of.productNames();
  const rows = [];
  if (kind !== "subscription") {
    for (const o of (await of.workList(db, { view: view === "shipped" ? "shipped" : "open" }, { now })).orders) {
      rows.push({ kind: "order", id: o.orderId, ref: o.ref, status: o.status, paidAt: o.paidAt, date: o.shipBy, aimDay: o.aimDay,
        items: o.items.map((i) => ({ name: names[i.id] || i.id, quantity: i.quantity })), amount: o.amount, prefecture: o.prefecture,
        countryCode: o.countryCode, method: o.method, trackingNumber: o.trackingNumber, mail: o.mail, paymentStatus: o.paymentStatus,
        amountRefunded: o.amountRefunded, blockers: o.blockers, warnings: o.warnings, late: o.late, livemode: o.livemode });
    }
  }
  if (kind !== "order") {
    const work = await subscriptionFulfillment().workList(db, { from: addDays(today, -31), to: addDays(today, view === "shipped" ? 0 : 14) }, { now });
    for (const d of work.deliveries) {
      if (view === "shipped" ? d.status !== "shipped" : d.status === "shipped") continue;
      rows.push({ kind: "subscription", id: d.shipmentId, ref: d.ref, status: d.status, date: d.date, label: d.kind === "first" ? "初回" : `${Number(String(d.month).slice(5))}月分 ${d.seq}回目`,
        beans: (d.beans || []).map((b) => names[b.sku] || b.sku), preference: d.preference || "", prefecture: d.prefecture, method: d.shippingMethod,
        trackingNumber: d.trackingNumber, mail: d.mail || null, blockers: d.blockers, late: d.overdue === true, livemode: d.livemode });
    }
  }
  const shown = rows.filter((r) => view === "late" ? r.late : view === "soon" ? !r.late && r.date && r.date <= tomorrow : true)
    .filter((r) => !r.blockers?.includes("EARLIER_ORDER"))
    .sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999")));
  return { view, kind, today, parcels: shown.slice(0, 100), total: shown.length };
}

// Sales and work for a period (JST days, at most 92).
async function overview(db, input, now = Date.now()) {
  const { from, to } = range(input, now);
  const start = dayStart(from);
  const end = dayStart(addDays(to, 1));
  const orders = (await db.collection(of.ORDERS).where("paidAt", ">=", start).where("paidAt", "<", end).get()).docs.map((d) => d.data()).filter((o) => o.livemode === true);
  const months = (await db.collection("coffeeSubscriptionMonths").where("paidAt", ">=", start).where("paidAt", "<", end).get()).docs.map((d) => d.data())
    .filter((m) => m.status === "paid" && Number(m.amount) > 0);
  const firsts = (await db.collection("coffeeSubscriptionShipments").where("createdAt", ">=", start).where("createdAt", "<", end).get()).docs.map((d) => d.data())
    .filter((s) => s.kind === "first");
  const sum = (list, f) => list.reduce((t, x) => t + (Number(f(x)) || 0), 0);
  const open = await list(db, { view: "open" }, now);
  return {
    from, to,
    orders: { count: orders.length, amount: sum(orders, (o) => o.amount), refunded: sum(orders, (o) => o.amountRefunded), shipping: sum(orders, (o) => o.shipping) },
    subscriptions: { firstCount: firsts.length, firstAmount: firsts.length * plan.FIRST_DELIVERY_PRICE, monthlyCount: months.length, monthlyAmount: sum(months, (m) => m.amount) },
    toShip: { total: open.total, late: open.parcels.filter((p) => p.late).length, orders: open.parcels.filter((p) => p.kind === "order").length,
      subscriptions: open.parcels.filter((p) => p.kind === "subscription").length },
  };
}

function target(input) {
  const kind = input?.kind;
  const id = String(input?.id || "");
  if (kind === "order" && ORDER_ID_RE.test(id)) return { kind, id };
  if (kind === "subscription" && SHIPMENT_ID_RE.test(id)) return { kind, id };
  return fail("INVALID_TARGET");
}

// 発送準備: a store order is marked; a 定期便 delivery reserves one bag of each of its two beans.
// A delivery held for want of stock (or stock and records that disagree) is told to the shop, as from the shop's page.
async function prepare(db, { target: t, skus, approval }, { actor, now = Date.now(), onStockShort = null }) {
  const { kind, id } = target(t);
  const requestId = `factory-${approval.requestId}`;
  if (kind === "order") return { kind, ...(await of.prepareOrder(db, { orderId: id, requestId, actor }, { now })) };
  if (!Array.isArray(skus) || skus.length !== 2) fail("INVALID_BEANS");
  const f = subscriptionFulfillment();
  const { notify, ...out } = await f.prepareShipment(db, { shipmentId: id, skus, requestId, actor }, { now });
  if (notify && out.applied !== false && onStockShort) {
    await Promise.resolve(onStockShort({ type: out.review ? "inventory_inconsistency" : "out_of_stock", shipmentId: out.shipmentId,
      ref: f.contractRef(String(out.shipmentId).replace(/_(first|\d{4}-\d{2}_[1-4])$/, "")), shortSkus: out.shortSkus || [] })).catch(() => {});
  }
  return { kind, ...out };
}

// 発送済み: with the method and the tracking number; the customer's mail goes once.
async function ship(db, { target: t, method, trackingNumber, approval }, { actor, now = Date.now(), sendMail, log, onMailFailed }) {
  const { kind, id } = target(t);
  const requestId = `factory-${approval.requestId}`;
  if (kind === "order") {
    return { kind, ...(await of.shipOrderAndNotify(db, { orderId: id, requestId, actor, method, trackingNumber }, { sendMail, log, now, onMailFailed })) };
  }
  return { kind, ...(await subscriptionFulfillment().shipShipmentAndNotify(db, { shipmentId: id, requestId, actor, method: method || undefined, trackingNumber },
    { sendMail, log, now, onMailFailed })) };
}

module.exports = { readEnabled, shipEnabled, StoreOpsError, range, list, overview, target, prepare, ship };
