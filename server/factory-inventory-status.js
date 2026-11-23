"use strict";

// inventory.status (2026-11-23): the stock as the shop's ledger has it, for Factory (Jennifer, and ChatGPT through
// Factory), through the signed Factory API (server/factory-refund-api.js → server/factory-store-ops.js, behind
// FACTORY_STORE_READ_ENABLED like store.overview). Nobody reads production Firestore directly: this answer is the only
// view of the ledger, and the only place where it is reconciled with orders and 珈琲の定期便 deliveries.
// Read only: nothing is written or repaired, and no reconciliation with Stripe is run (inventory.reconcileExpired stays
// the shop's own job). Nothing personal goes back: SKUs, counts, months and dates only.
//
// The check (checks), from what the code guarantees:
//  - held, per product (inventory/{sku}) and per lot (inventoryLots/{lot}), is exactly what the open records hold:
//      checkout reservations still "reserved" (inventory.reserve adds their items and lots; finish, paid or released,
//      takes them off again) + 珈琲の定期便 deliveries "preparing" (prepare holds one bag of each of their two beans and
//      of a bean's lot; ship, hold, resume and a cancellation take it off; coffee-subscription-fulfillment.js).
//    Nothing else moves held: a paid store order holds nothing (its bags were settled at payment and do not move at
//    shipping), a delivery cancelled before shipping has given its bags back, and adjustments, featured transfers,
//    initial stock and refunds change ready and sold only.
//  - held never exceeds ready: every step checks ready − held before holding and takes both down together.
// A lot record counts the same bags as its products (both move in the same transaction): its numbers are its own and are
// never added to theirs. A featured SKU (enma-featured-…) is its own record, compared only with its own holds.
// sold and ready are not reconstructed (NOTES): some records started from counts entered by hand, with no record.

const { CATALOG } = require("./catalog");
const { FEATURED_SKU_PREFIX, sourceOfFeaturedSku } = require("./featured");
const plan = require("./coffee-subscription-plan");
const records = require("./coffee-subscription-records");
const of = require("./order-fulfillment");
const initialStock = require("./initial-stock");
const featuredStock = require("./featured-stock");
const { LOW_STOCK } = require("./store-events");

const DEFAULT_LOW = LOW_STOCK; // the shop's own "low stock" level (stock.low notices)
const MAX_LOW = 20;
const MAX_OPEN = 500; // open reservations and deliveries being prepared are few (as inventory.reconcileExpired reads them)
const MAX_CONTRACTS = 500; // as factory-subscription-read.js
const MAX_ORDERS = 200; // as the shop's order work list (order-fulfillment.js)
const MAX_SHIPMENTS = 1000;
const MAX_ADJUSTMENTS = 20;
const STALE_MS = 20 * 60 * 1000; // an unpaid checkout reservation is settled from Stripe's state after 20 minutes
const ENDED = ["canceled", "incomplete_expired"];
const fulfillment = () => require("./coffee-subscription-fulfillment");

const integer = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : 0);
const toMs = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : v instanceof Date ? v.getTime() : typeof v === "number" ? v : null);
// A stock record as the shop's code reads it (inventory.js integer()), or null when there is none.
const countsOf = (snap) => {
  if (!snap.exists) return null;
  const d = snap.data() || {};
  return { ready: integer(d.ready), held: integer(d.held), sold: integer(d.sold), heldStored: d.held };
};
// What a customer can buy of one record: as inventory.availability (no record: nothing).
const left = (c) => (c ? Math.max(0, c.ready - c.held) : 0);

function stateOf({ forSale, available }, low) {
  if (!forSale) return "not_for_sale";
  if (available <= 0) return "out";
  if (available <= low) return "low";
  return "in_stock";
}

// ---- The check, pure: the records already read ---------------------------------------------------------------
// stock: { [sku]: counts | null }, lots: { [lot]: counts | null }, reservations: [{ status, items, lots }],
// shipments: [{ status, beans: [{ sku, lot }] }]. Only reservations "reserved" and deliveries "preparing" hold bags.
function expectedHeld({ reservations = [], shipments = [] }) {
  const skus = new Map();
  const lots = new Map();
  const add = (map, key, n, source) => {
    if (typeof key !== "string" || !key) return;
    const e = map.get(key) || { checkout: 0, subscription: 0 };
    e[source] += n;
    map.set(key, e);
  };
  for (const r of reservations) {
    if (r?.status !== "reserved") continue;
    for (const i of Array.isArray(r.items) ? r.items : []) add(skus, i?.id, integer(i?.quantity), "checkout");
    for (const l of Array.isArray(r.lots) ? r.lots : []) add(lots, l?.id, integer(l?.quantity), "checkout");
  }
  for (const s of shipments) {
    if (s?.status !== "preparing") continue;
    for (const b of Array.isArray(s.beans) ? s.beans : []) {
      add(skus, b?.sku, 1, "subscription");
      if (b?.lot) add(lots, b.lot, 1, "subscription");
    }
  }
  return { skus, lots };
}

function reconcile({ stock = {}, lots = {}, reservations = [], shipments = [] }) {
  const expected = expectedHeld({ reservations, shipments });
  const findings = [];
  const check = (kind, records, wanted) => {
    const keys = [...new Set([...Object.keys(records), ...wanted.keys()])];
    for (const key of keys) {
      const c = records[key] || null;
      const e = wanted.get(key) || { checkout: 0, subscription: 0 };
      const want = e.checkout + e.subscription;
      const ledger = c ? c.held : 0;
      if (ledger !== want) {
        const what = kind === "lot" ? "ロットの held" : "held";
        const malformed = c && c.heldStored !== undefined && !Number.isSafeInteger(c.heldStored) ? "（記録の値は0以上の整数ではありません）" : "";
        findings.push({ [kind]: key, field: "held", ledger, expected: want,
          detail: `${c ? "" : "在庫の記録がありません。"}${what} ${ledger}袋${malformed}。未完了のカート確保 ${e.checkout}袋 + 発送準備中の定期便 ${e.subscription}袋 = ${want}袋のはずです${kind === "lot" ? "（商品と同じ袋を1回ずつ数えます）" : ""}。` });
      }
      if (c && c.held > c.ready) {
        findings.push({ [kind]: key, field: "held", ledger: c.held, expected: c.ready,
          detail: `held ${c.held}袋が ready ${c.ready}袋を超えています（確保は棚にある袋の一部で、多くても ready までです）。` });
      }
    }
  };
  check("sku", stock, expected.skus);
  check("lot", lots, expected.lots);
  return findings;
}

// ---- 珈琲の定期便 ------------------------------------------------------------------------------------------------
// Each contract once, by its current state. "incomplete_record" is the record made from the sign-up invoice before
// Stripe's status reached us: the sign-up period, before the first monthly charge (a trial at Stripe).
function contractState(c) {
  if (ENDED.includes(c?.status)) return "ended";
  if (c?.cancelRequestedAt) return "cancelRequested";
  if (["past_due", "unpaid"].includes(c?.status)) return "pastDue";
  if (c?.status === "active") return "active";
  if (["trialing", "incomplete_record"].includes(c?.status)) return "trialing";
  return null;
}

// Next month from each running contract's plan (frequency, changes, skips, cancellation), as the customer's page and
// factory-subscription-read.js read it. Not charged yet: an estimate.
function nextMonthPlan(contracts, month) {
  let deliveries = 0;
  let skipped = 0;
  let unplanned = 0;
  for (const c of contracts) {
    const state = contractState(c);
    if (state === "ended" || state === null || c.duplicateOf) continue;
    let first;
    try {
      first = plan.monthPlan({ startMonth: c.startMonth, frequency: c.frequency, changes: c.changes || {}, skips: c.skips || [],
        cancelFrom: c.firstUnchargedMonth || null }, month, 1)[0];
    } catch {
      unplanned += 1;
      continue;
    }
    if (!first || first.month !== month) continue;
    if (first.skipped) skipped += 1;
    else deliveries += first.frequency;
  }
  return { deliveries, skipped, unplanned };
}

function subscriptions({ contracts, recent, preparing, now, bagsPerDelivery }) {
  const thisMonth = plan.monthOf(now);
  const nextMonth = plan.addMonths(thisMonth, 1);
  const states = { active: 0, trialing: 0, pastDue: 0, cancelRequested: 0, ended: 0 };
  const other = new Map();
  for (const c of contracts) {
    const state = contractState(c);
    if (state) states[state] += 1;
    else other.set(String(c?.status || "unknown"), (other.get(String(c?.status || "unknown")) || 0) + 1);
  }
  // Deliveries of this month (and any earlier one) still to go out: planned or being prepared.
  const toGo = recent.filter((s) => ["planned", "preparing"].includes(s.status) && String(s.month || "") <= thisMonth).length;
  const next = nextMonthPlan(contracts, nextMonth);
  const note = "来月分はまだ請求前のため、各契約の回数・スキップ・回数変更・解約予定から出した見込みです（新しいお申し込み、"
    + "お支払いの失敗、これからの変更は含みません）。" + (next.unplanned ? `申し込み内容が記録されていない契約 ${next.unplanned}件は含みません。` : "");
  return {
    value: {
      contracts: states,
      thisMonth: { month: thisMonth, deliveriesLeft: toGo, bagsNeeded: toGo * bagsPerDelivery },
      nextMonth: { month: nextMonth, deliveries: next.deliveries, bagsNeeded: next.deliveries * bagsPerDelivery, skipped: next.skipped, note },
      preparing: { shipments: preparing.length, bagsHeld: preparing.reduce((n, s) => n + (Array.isArray(s.beans) ? s.beans.length : 0), 0) },
    },
    other,
  };
}

// ---- Stock adjustments and arrivals (the latest, newest first; no approval text, no request ids, no actor ids) ----
const byOf = (actor) => (/^(factory-ceo|ceo):/.test(String(actor || "")) ? "ceo" : /^shop-staff:/.test(String(actor || "")) ? "staff" : "system");

async function recentAdjustments(db) {
  const latest = (name, field) => db.collection(name).orderBy(field, "desc").limit(MAX_ADJUSTMENTS).get().then((s) => s.docs.map((d) => d.data()));
  const [adjusted, initial, transferred, approved, refunded] = await Promise.all([
    latest("inventoryAdjustments", "createdAt"), // inventory-adjustments.js (stock_in / retail_sale, the CEO's approval)
    latest(initialStock.LOG_COLLECTION, "appliedAt"), // initial-stock.js (applied after the CEO approved the preview)
    latest(featuredStock.LOG_COLLECTION, "appliedAt"), // featured-stock.js, applied after the CEO approved the preview
    latest(featuredStock.LOG_COLLECTION, "at"), // featured-stock.js, approved in a PR and applied by the server
    latest("orderRefunds", "settledAt"), // refunds.js: unshipped bags given back with an approved refund
  ]);
  const rows = [];
  const row = (at, sku, action, quantity, by) => rows.push({ at: toMs(at), sku, action, quantity, by });
  for (const a of adjusted) row(a.createdAt, a.sku, a.action, a.quantity, byOf(a.actor));
  for (const i of initial) {
    for (const [path, quantity] of Object.entries(i.plan || {})) if (path.startsWith("inventory/")) row(i.appliedAt, path.slice("inventory/".length), "initial_stock", quantity, "ceo");
  }
  for (const t of transferred) {
    if (!t.plan) continue;
    row(t.appliedAt, t.plan.from, "transfer_out", t.plan.quantity, "ceo");
    row(t.appliedAt, t.plan.to, "transfer_in", t.plan.quantity, "ceo");
  }
  for (const t of approved) {
    if (t.kind !== "approved" || t.status !== "applied") continue;
    row(t.at, t.from, "transfer_out", t.quantity, "system");
    row(t.at, t.to, "transfer_in", t.quantity, "system");
  }
  for (const r of refunded) for (const x of r.restocked || []) row(r.settledAt, x?.id, "refund_restock", x?.quantity, byOf(r.actor));
  return rows
    .filter((r) => Number.isFinite(r.at) && /^[a-z0-9-]{1,90}$/.test(String(r.sku || "")) && Number.isSafeInteger(r.quantity) && r.quantity >= 0)
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_ADJUSTMENTS)
    .map((r) => ({ ...r, at: new Date(r.at).toISOString() }));
}

// ---- What cannot be verified from the records, and why --------------------------------------------------------
const NOTES = Object.freeze([
  // docs/inventory-rollout.md: inventory/enma-karamo = 15 (provisional) existed before server/initial-stock.js, which
  // only creates records and leaves a log; such a record has no starting count anywhere.
  "sold（販売済み）と ready（棚の袋）は照合していません。在庫記録には初期登録の仕組み（inventoryInitialStock）より前に手で置かれたもの"
    + "（enma-karamo の仮の15袋など）があり、始まりの数が記録に残っていないため、記録から正確に再計算できません。"
    + "照合しているのは held（確保中の袋）と、held が ready を超えていないことです。",
  "ロットの数はロットの記録そのものです。商品と同じ袋を数えているため、商品の数と足し合わせません。ロットの ready・sold は商品の合計とは比べられません"
    + "（ready は焙煎できる袋数で商品ごとの販売上限とは別に決め、店頭販売の調整は商品の記録だけを動かすため）。",
  "「今、飲んでほしい珈琲」（enma-featured-…）は通常の商品とは別の在庫記録です。確保・販売はそれぞれの SKU だけで照合し、互いの数には入れていません"
    + "（両者の間の袋の移動は ready だけを動かします）。",
  "決済済みで未発送の通常注文は在庫を確保していません（袋は決済時に販売済みになり、発送では動きません）。実際には発送済みでシステム上は未発送のままの注文があっても、"
    + "在庫の差にはならないため指摘しません。",
]);

// ---- inventory.status --------------------------------------------------------------------------------------------
async function status(db, { lowThreshold = DEFAULT_LOW, now = Date.now(), inventoryEnabled = true, catalog = CATALOG } = {}) {
  const managed = Object.keys(catalog).filter((sku) => catalog[sku].managedStock === true);
  const catalogLots = [...new Set(managed.map((sku) => catalog[sku].lot).filter(Boolean))];
  const doc = (name, id) => db.collection(name).doc(id).get();
  const [stockSnaps, lotSnaps, featuredSnaps, reservationSnaps, preparingSnaps, contractSnaps, recentSnaps, orderSnaps, adjustments, names] = await Promise.all([
    Promise.all(managed.map((sku) => doc("inventory", sku))),
    Promise.all(catalogLots.map((lot) => doc("inventoryLots", lot))),
    // Featured SKUs of earlier featured coffees keep their own records (bags not moved back stay there).
    db.collection("inventory").where("__name__", ">=", FEATURED_SKU_PREFIX).where("__name__", "<", `${FEATURED_SKU_PREFIX}`).limit(50).get(),
    // Equality on status only, as inventory.reconcileExpired: no composite index.
    db.collection("inventoryReservations").where("status", "==", "reserved").limit(MAX_OPEN).get(),
    db.collection(records.SHIPMENTS).where("status", "==", "preparing").limit(MAX_OPEN).get(),
    db.collection(records.SUBS).limit(MAX_CONTRACTS).get(),
    db.collection(records.SHIPMENTS).where("month", "in", [-2, -1, 0].map((n) => plan.addMonths(plan.monthOf(now), n))).limit(MAX_SHIPMENTS).get(),
    db.collection(of.ORDERS).orderBy("paidAt", "desc").limit(MAX_ORDERS).get(),
    recentAdjustments(db),
    of.productNames(),
  ]);
  const stock = Object.fromEntries(managed.map((sku, i) => [sku, countsOf(stockSnaps[i])]));
  for (const d of featuredSnaps.docs) if (!(d.id in stock) && sourceOfFeaturedSku(d.id)) stock[d.id] = countsOf(d);
  const lots = Object.fromEntries(catalogLots.map((lot, i) => [lot, countsOf(lotSnaps[i])]));
  const reservations = reservationSnaps.docs.map((d) => d.data());
  const preparing = preparingSnaps.docs.map((d) => d.data());
  // Records held by open checkouts or deliveries but not read yet (e.g. a product taken off the catalogue meanwhile).
  const held = expectedHeld({ reservations, shipments: preparing });
  const extraSkus = [...held.skus.keys()].filter((sku) => !(sku in stock) && /^[a-z0-9-]{1,90}$/.test(sku)).slice(0, 50);
  const extraLots = [...held.lots.keys()].filter((lot) => !(lot in lots) && /^[a-z0-9-]{1,90}$/.test(lot)).slice(0, 20);
  const [extraStock, extraLotSnaps] = await Promise.all([Promise.all(extraSkus.map((sku) => doc("inventory", sku))), Promise.all(extraLots.map((lot) => doc("inventoryLots", lot)))]);
  extraSkus.forEach((sku, i) => { stock[sku] = countsOf(extraStock[i]); });
  extraLots.forEach((lot, i) => { lots[lot] = countsOf(extraLotSnaps[i]); });

  const name = (sku) => names[sku] || names[sourceOfFeaturedSku(sku)] || sku;
  // Every counted product of the catalogue, then earlier featured SKUs (not sold any more).
  const shown = [...managed, ...Object.keys(stock).filter((sku) => !managed.includes(sku) && sourceOfFeaturedSku(sku))];
  const items = shown.map((sku) => {
    const p = Object.prototype.hasOwnProperty.call(catalog, sku) ? catalog[sku] : null;
    const lot = p?.lot || null;
    const c = stock[sku];
    const available = lot ? Math.min(left(c), left(lots[lot])) : left(c);
    const forSale = p?.availableForSale === true;
    return { sku, name: name(sku), kind: p?.kind || "beans", forSale, featured: p ? p.featured === true : true, lot,
      ready: c ? c.ready : 0, held: c ? c.held : 0, sold: c ? c.sold : 0, available, state: stateOf({ forSale, available }, lowThreshold) };
  });
  const lotRows = Object.keys(lots).map((lot) => {
    const c = lots[lot];
    return { lot, skus: managed.filter((sku) => catalog[sku].lot === lot), ready: c ? c.ready : null, held: c ? c.held : null, sold: c ? c.sold : null, available: left(c) };
  });

  const complete = reservations.length < MAX_OPEN && preparing.length < MAX_OPEN;
  const findings = complete ? reconcile({ stock, lots, reservations, shipments: preparing }) : [];
  const contracts = contractSnaps.docs.map((d) => d.data());
  const sub = subscriptions({ contracts, recent: recentSnaps.docs.map((d) => d.data()), preparing, now, bagsPerDelivery: fulfillment().BAGS_PER_DELIVERY });
  const openOrders = orderSnaps.docs.map((d) => d.data()).filter((o) => of.stateOf(o) !== "shipped" && !of.blockers(o).length);
  const oldest = openOrders.map((o) => toMs(o.paidAt)).filter(Number.isFinite).sort((a, b) => a - b)[0];

  const notes = [];
  if (!inventoryEnabled) notes.push("この店舗サーバーでは在庫管理（INVENTORY_ENABLED）が無効です。通常注文は在庫を確保・販売済みにせず、/inventory/availability も数を返しません。");
  if (!complete) notes.push(`未完了のカート確保または発送準備中の定期便が${MAX_OPEN}件以上あり、すべては読めないため、held の照合は行っていません。`);
  const stale = reservations.filter((r) => Number.isFinite(toMs(r.createdAt)) && toMs(r.createdAt) < now - STALE_MS).length;
  if (stale) notes.push(`${stale}件のカート確保は20分以上前のものですが、まだ袋を確保しています。店舗の自動照合が Stripe の状態を確かめてから、解放または販売済みにします（この照会では照合を実行しません）。`);
  const noRecord = managed.filter((sku) => !stock[sku]);
  if (noRecord.length) notes.push(`在庫の記録がない商品：${noRecord.join("、")}（記録がない商品は売れません）。`);
  const noLot = catalogLots.filter((lot) => !lots[lot]);
  if (noLot.length) notes.push(`ロットの記録がありません：${noLot.join("、")}（このロットの商品は売れません）。`);
  const uncounted = Object.keys(catalog).filter((sku) => catalog[sku].availableForSale === true && catalog[sku].managedStock !== true);
  if (uncounted.length) notes.push(`在庫を数えずに販売している商品（在庫の記録なし）：${uncounted.map(name).join("、")}。`);
  if (contracts.length >= MAX_CONTRACTS) notes.push(`定期便の契約が${MAX_CONTRACTS}件以上あり、最初の${MAX_CONTRACTS}件だけを数えています。`);
  if (sub.other.size) notes.push(`定期便の契約のうち、上の区分に当てはまらない状態のものは数えていません：${[...sub.other].map(([s, n]) => `${s} ${n}件`).join("、")}。`);
  const testContracts = contracts.filter((c) => c.livemode !== true).length;
  const testOrders = openOrders.filter((o) => o.livemode !== true).length;
  if (testContracts || testOrders) notes.push(`テストモードの記録を含みます（定期便の契約 ${testContracts}件、未発送の通常注文 ${testOrders}件）。`);
  notes.push(...NOTES);

  return {
    asOf: new Date(now).toISOString(),
    items,
    lots: lotRows,
    adjustments,
    subscriptions: sub.value,
    openOrders: { count: openOrders.length, oldestPaidAt: oldest === undefined ? null : new Date(oldest).toISOString() },
    checks: { ok: findings.length === 0, findings, notes },
  };
}

module.exports = { DEFAULT_LOW, MAX_LOW, MAX_OPEN, NOTES, stateOf, expectedHeld, reconcile, contractState, nextMonthPlan, subscriptions, recentAdjustments, status };
