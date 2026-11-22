"use strict";

// What the shop tells Factory, and when (2026-11-22; sent by server/factory-notify.js, once per event id):
//   order.paid          a store order paid (Stripe's payment_intent.succeeded, once the order is recorded)
//   subscription.paid   a 珈琲の定期便 payment (first 200 g or a month), from invoice.paid
//   payment.failed      a 珈琲の定期便 payment that failed (each retry once)
//   deadline.soon       a parcel due today or tomorrow and not shipped yet (order: 3 working days; 定期便: its date)
//   deadline.overdue    a parcel past its date and not shipped
//   stock.low           a counted product down to a few bags after an order (each level once)
//   stock.short         a 定期便 delivery held for want of stock, or stock and records that disagree
//   mail.failed         a "shipped" mail that could not be sent
//   webhook.failed      a Stripe event the shop could not process (Stripe retries it; someone should look)
// No name, email, phone or street address ever goes out: the order or contract number, amounts, products, prefecture.

const notify = require("./factory-notify");
const of = require("./order-fulfillment");
const records = require("./coffee-subscription-records");
const plan = require("./coffee-subscription-plan");

const LOW_STOCK = 3;
const subRef = (id) => `SUB-${String(id).replace(/^sub_/, "").slice(-6).toUpperCase()}`;
const jstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
const addDays = (day, n) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// After payment_intent.succeeded recorded a new store order.
async function orderPaid(db, orderId, deps = {}) {
  const snap = await db.collection(of.ORDERS).doc(orderId).get();
  if (!snap.exists) return;
  const o = snap.data();
  const names = await of.productNames();
  const list = (await of.workList(db, { view: "all" }, { now: Date.now() }).catch(() => ({ orders: [] }))).orders.find((r) => r.orderId === orderId);
  await notify.notify(db, { id: `order.paid:${orderId}`, type: "order.paid", data: {
    kind: "order", orderId, ref: of.ref(orderId), amount: o.amount, currency: o.currency, countryCode: o.countryCode,
    prefecture: o.customer?.address?.state || "", items: (o.items || []).map((i) => ({ name: names[i.id] || i.id, quantity: i.quantity })),
    shipBy: list?.shipBy || null, livemode: o.livemode === true } }, deps);
  await lowStockAfter(db, o.items || [], deps);
}

// A counted product down to LOW_STOCK bags or fewer: one notice per product and level.
async function lowStockAfter(db, items, deps = {}) {
  const { CATALOG } = require("./catalog");
  const inventory = require("./inventory");
  const ids = [...new Set(items.map((i) => i.id).filter((id) => CATALOG[id]?.managedStock === true))];
  if (!ids.length) return;
  const left = await inventory.availability(db, ids, (id) => CATALOG[id]?.lot || null);
  const names = await of.productNames();
  for (const id of ids) {
    if (left[id] > LOW_STOCK) continue;
    await notify.notify(db, { id: `stock.low:${id}:${left[id]}`, type: "stock.low", data: { sku: id, product: names[id] || id, left: left[id] } }, deps);
  }
}

// 珈琲の定期便 payments (paid or failed), after the event is recorded.
async function subscriptionInvoice(db, event, deps = {}) {
  const invoice = event?.data?.object;
  const sub = records.invoiceSubscription(invoice);
  if (!sub.id || sub.metadata?.kind !== records.KIND || !/^in_[A-Za-z0-9]+$/.test(String(invoice?.id || ""))) return;
  if (event.type === "invoice.paid" && Number(invoice.amount_paid) > 0) {
    const first = invoice.billing_reason === "subscription_create";
    const month = first ? null : plan.monthOf(Number(invoice.status_transitions?.paid_at || 0) * 1000 || Date.now());
    await notify.notify(db, { id: `subscription.paid:${invoice.id}`, type: "subscription.paid", data: {
      kind: "subscription", ref: subRef(sub.id), amount: invoice.amount_paid, currency: invoice.currency, label: first ? "初回200g" : `${month} の月額`,
      frequency: sub.metadata?.frequency || null, livemode: invoice.livemode === true } }, deps);
  } else if (event.type === "invoice.payment_failed") {
    const attempt = Number(invoice.attempt_count) || 1;
    await notify.notify(db, { id: `payment.failed:${invoice.id}:${attempt}`, type: "payment.failed", data: {
      kind: "subscription", ref: subRef(sub.id), amount: invoice.amount_due, currency: invoice.currency, attempt, livemode: invoice.livemode === true } }, deps);
  }
}

// A Stripe event the shop answered with an error (Stripe retries it).
async function webhookFailed(db, event, deps = {}) {
  if (!/^evt_[A-Za-z0-9]+$/.test(String(event?.id || ""))) return;
  await notify.notify(db, { id: `webhook.failed:${event.id}`, type: "webhook.failed", data: { eventType: String(event.type || "").slice(0, 60) } }, deps);
}

// A 定期便 delivery held for want of stock, or stock and records that disagree (from the shipping page).
async function stockShort(db, { type, shipmentId, ref, shortSkus = [] }, deps = {}) {
  const day = jstDay(Date.now());
  await notify.notify(db, { id: `stock.short:${shipmentId}:${day}`, type: "stock.short", data: {
    kind: "subscription", shipmentId, ref, skus: shortSkus, reason: type === "inventory_inconsistency" ? "INVENTORY_INCONSISTENCY" : "OUT_OF_STOCK" } }, deps);
}

// A "shipped" mail that could not be sent.
async function mailFailed(db, { kind, id, ref }, deps = {}) {
  await notify.notify(db, { id: `mail.failed:${kind}:${id}`, type: "mail.failed", data: { kind, ref, ...(kind === "order" ? { orderId: id } : { shipmentId: id }) } }, deps);
}

// Every sweep (server/index.js, every 30 minutes): parcels due today/tomorrow or late, once each; then what is due to send.
async function sweep(db, deps = {}, now = Date.now()) {
  const today = jstDay(now);
  const tomorrow = addDays(today, 1);
  const orders = (await of.workList(db, { view: "open" }, { now })).orders;
  for (const o of orders) {
    if (!o.shipBy || o.blockers.length || !["new", "preparing", "held"].includes(o.status)) continue;
    const type = today > o.shipBy ? "deadline.overdue" : o.shipBy <= tomorrow ? "deadline.soon" : null;
    if (type) await notify.notify(db, { id: `${type}:${o.orderId}`, type, data: { kind: "order", orderId: o.orderId, ref: o.ref, shipBy: o.shipBy, prefecture: o.prefecture, livemode: o.livemode } }, deps);
  }
  const f = require("./coffee-subscription-fulfillment");
  const work = await f.workList(db, { from: addDays(today, -31), to: tomorrow }, { now });
  for (const d of work.deliveries) {
    if (d.status === "shipped" || !d.date || d.blockers.length) continue;
    const type = today > d.date ? "deadline.overdue" : d.date <= tomorrow ? "deadline.soon" : null;
    if (type) await notify.notify(db, { id: `${type}:${d.shipmentId}`, type, data: { kind: "subscription", shipmentId: d.shipmentId, ref: d.ref, date: d.date, prefecture: d.prefecture, livemode: d.livemode } }, deps);
  }
  return notify.deliverDue(db, { ...deps, now });
}

module.exports = { LOW_STOCK, orderPaid, lowStockAfter, subscriptionInvoice, webhookFailed, stockShort, mailFailed, sweep };
