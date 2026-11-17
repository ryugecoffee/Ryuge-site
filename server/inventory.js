"use strict";

// Firestore-backed inventory for physical, already packed products.
// No stock is created from raw-green-bean purchase quantities.
// Schema: inventory/{sku} = { ready: int, held: int, sold: int }
//         inventoryLots/{lot} = { ready: int, held: int, sold: int }
//         inventoryReservations/{id} = { status, items, lots, paymentIntentId, createdAt }
// ready is physical unsold quantity, held is part of ready reserved for checkout.
// inventory/{sku} is the sales cap of one product. inventoryLots/{lot} is what can really be roasted from one purchase
// of green beans, shared by every product made from it (server/catalog.js lot): e.g. the regular Brazil and the
// promotional dark roast are two products from the same beans, and an order must fit both its product caps and the lot.
// A lot without a record sells nothing (fail closed).
const crypto = require("node:crypto");

function validItems(items) {
  if (!Array.isArray(items) || !items.length || items.length > 25) throw new Error("INVALID_ITEMS");
  const seen = new Set();
  return items.map((item) => {
    const id = String(item?.id || "");
    const quantity = Number(item?.quantity);
    if (!/^[a-z0-9-]{1,90}$/.test(id) || seen.has(id) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 50) {
      throw new Error("INVALID_ITEMS");
    }
    seen.add(id);
    return { id, quantity };
  });
}

function integer(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

// promo (optional): { keys: [sha256 hex], quantity, limit } from server/promo.js. The promotional bags are counted per
// customer key (promoLedger/{key} = { held, bought }) in the same transaction as the stock.
function validPromo(promo) {
  if (!promo) return null;
  const keys = Array.isArray(promo.keys) ? [...new Set(promo.keys)] : [];
  if (!keys.length || keys.length > 4 || !keys.every((key) => /^[a-f0-9]{64}$/.test(key))) throw new Error("INVALID_PROMO");
  if (!Number.isSafeInteger(promo.quantity) || promo.quantity < 1 || !Number.isSafeInteger(promo.limit) || promo.limit < 1) {
    throw new Error("INVALID_PROMO");
  }
  return { keys, quantity: promo.quantity, limit: promo.limit };
}

// lots (optional): [{ id: lot, quantity }] from catalog.lotItems(), the same bags counted against their shared lot.
async function reserve(db, items, paymentIntentId = null, promo = null, lots = []) {
  const sanitized = validItems(items);
  const lotItems = lots && lots.length ? validItems(lots) : [];
  const promoClaim = validPromo(promo);
  const id = crypto.randomUUID();
  const reservation = db.collection("inventoryReservations").doc(id);
  const refs = sanitized.map(({ id: sku }) => db.collection("inventory").doc(sku));
  const lotRefs = lotItems.map(({ id: lot }) => db.collection("inventoryLots").doc(lot));
  const promoRefs = promoClaim ? promoClaim.keys.map((key) => db.collection("promoLedger").doc(key)) : [];

  await db.runTransaction(async (tx) => {
    // Firestore transactions require all reads before any writes.
    const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
    const lotSnaps = await Promise.all(lotRefs.map((ref) => tx.get(ref)));
    const promoSnaps = await Promise.all(promoRefs.map((ref) => tx.get(ref)));
    for (let i = 0; i < sanitized.length; i++) {
      if (!snaps[i].exists) throw new Error("OUT_OF_STOCK");
      const stock = snaps[i].data() || {};
      if (integer(stock.ready) - integer(stock.held) < sanitized[i].quantity) throw new Error("OUT_OF_STOCK");
    }
    for (let i = 0; i < lotItems.length; i++) {
      if (!lotSnaps[i].exists) throw new Error("OUT_OF_STOCK");
      const lot = lotSnaps[i].data() || {};
      if (integer(lot.ready) - integer(lot.held) < lotItems[i].quantity) throw new Error("OUT_OF_STOCK");
    }
    for (const snap of promoSnaps) {
      const used = snap.exists ? integer(snap.data().held) + integer(snap.data().bought) : 0;
      if (used + promoClaim.quantity > promoClaim.limit) throw new Error("PROMO_CUSTOMER_LIMIT");
    }
    sanitized.forEach(({ quantity }, i) => {
      tx.update(refs[i], { held: integer(snaps[i].data().held) + quantity });
    });
    lotItems.forEach(({ quantity }, i) => {
      tx.update(lotRefs[i], { held: integer(lotSnaps[i].data().held) + quantity });
    });
    promoSnaps.forEach((snap, i) => {
      if (snap.exists) tx.update(promoRefs[i], { held: integer(snap.data().held) + promoClaim.quantity, updatedAt: new Date() });
      else tx.create(promoRefs[i], { held: promoClaim.quantity, bought: 0, updatedAt: new Date() });
    });
    tx.create(reservation, {
      status: "reserved",
      items: sanitized,
      ...(lotItems.length ? { lots: lotItems } : {}),
      paymentIntentId,
      ...(promoClaim ? { promo: { keys: promoClaim.keys, quantity: promoClaim.quantity } } : {}),
      createdAt: new Date(),
    });
  });

  return id;
}

async function attachPaymentIntent(db, reservationId, paymentIntentId) {
  const ref = db.collection("inventoryReservations").doc(reservationId);
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists || snapshot.data().status !== "reserved") throw new Error("UNKNOWN_RESERVATION");
    tx.update(ref, { paymentIntentId });
  });
}

async function finish(db, reservationId, paymentIntentId, action) {
  if (!["paid", "released"].includes(action)) throw new Error("INVALID_ACTION");
  if (!/^[a-f0-9-]{36}$/.test(String(reservationId))) throw new Error("INVALID_RESERVATION");
  const ref = db.collection("inventoryReservations").doc(reservationId);
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new Error("UNKNOWN_RESERVATION");
    const res = snapshot.data();
    if (res.paymentIntentId && res.paymentIntentId !== paymentIntentId) throw new Error("PAYMENT_MISMATCH");
    if (res.status === action) return false; // duplicate Stripe webhook
    if (res.status !== "reserved") throw new Error("RESERVATION_ALREADY_FINALIZED");
    const items = validItems(res.items);
    const refs = items.map(({ id }) => db.collection("inventory").doc(id));
    const docs = await Promise.all(refs.map((r) => tx.get(r)));
    const lotItems = Array.isArray(res.lots) && res.lots.length ? validItems(res.lots) : [];
    const lotRefs = lotItems.map(({ id }) => db.collection("inventoryLots").doc(id));
    const lotDocs = await Promise.all(lotRefs.map((r) => tx.get(r)));
    const promoKeys = Array.isArray(res.promo?.keys) ? res.promo.keys : [];
    const promoQuantity = integer(res.promo?.quantity);
    const promoRefs = promoKeys.map((key) => db.collection("promoLedger").doc(key));
    const promoDocs = await Promise.all(promoRefs.map((r) => tx.get(r)));
    docs.forEach((doc, i) => {
      if (!doc.exists || integer(doc.data().held) < items[i].quantity) throw new Error("INVENTORY_INCONSISTENCY");
    });
    lotDocs.forEach((doc, i) => {
      if (!doc.exists || integer(doc.data().held) < lotItems[i].quantity) throw new Error("INVENTORY_INCONSISTENCY");
    });
    // Promotional bags: settled with the payment (bought) or given back (released).
    promoDocs.forEach((doc, i) => {
      if (!doc.exists) return;
      const ledger = doc.data();
      const held = Math.max(0, integer(ledger.held) - promoQuantity);
      tx.update(promoRefs[i], action === "paid"
        ? { held, bought: integer(ledger.bought) + promoQuantity, updatedAt: new Date() }
        : { held, updatedAt: new Date() });
    });
    const settle = (ref, stock, quantity) => tx.update(ref, action === "paid"
      ? {
          ready: integer(stock.ready) - quantity,
          held: integer(stock.held) - quantity,
          sold: integer(stock.sold) + quantity,
        }
      : { held: integer(stock.held) - quantity });
    items.forEach(({ quantity }, i) => settle(refs[i], docs[i].data(), quantity));
    lotItems.forEach(({ quantity }, i) => settle(lotRefs[i], lotDocs[i].data(), quantity));
    tx.update(ref, { status: action, finishedAt: new Date() });
    return true;
  });
}

// The PaymentIntent could not be created (or its id never reached us): no customer can pay this reservation, so its
// stock and promotional bags are given back at once instead of waiting for manual review.
async function releaseWithoutPayment(db, reservationId) {
  if (!/^[a-f0-9-]{36}$/.test(String(reservationId))) throw new Error("INVALID_RESERVATION");
  const ref = db.collection("inventoryReservations").doc(reservationId);
  const snapshot = await ref.get();
  if (!snapshot.exists) return false;
  const res = snapshot.data();
  if (res.status !== "reserved" || res.paymentIntentId) return false;
  // finish() releases only when the stored PaymentIntent id matches; with none stored, any placeholder id is accepted.
  return finish(db, reservationId, "none", "released");
}

// lotOf (optional): sku -> lot (catalog.lotOf). A product of a lot shows at most what is left in the lot.
async function availability(db, ids, lotOf = () => null) {
  const requested = [...new Set(ids.filter((id) => /^[a-z0-9-]{1,90}$/.test(id)))].slice(0, 50);
  const left = (s) => (s.exists ? Math.max(0, integer(s.data().ready) - integer(s.data().held)) : 0);
  const snapshots = await Promise.all(requested.map((id) => db.collection("inventory").doc(id).get()));
  const lots = [...new Set(requested.map((id) => lotOf(id)).filter(Boolean))];
  const lotSnapshots = await Promise.all(lots.map((lot) => db.collection("inventoryLots").doc(lot).get()));
  const lotLeft = Object.fromEntries(lotSnapshots.map((s, i) => [lots[i], left(s)]));
  return Object.fromEntries(snapshots.map((s, i) => {
    const lot = lotOf(requested[i]);
    return [requested[i], lot ? Math.min(left(s), lotLeft[lot]) : left(s)];
  }));
}


const asDate = (value) => (value && typeof value.toDate === "function" ? value.toDate() : new Date(value));

async function reconcileExpired(db, stripe, limit = 30) {
  const cutoff = new Date(Date.now() - 20 * 60 * 1000);
  // Equality on status only: no composite index is needed in production Firestore (status + createdAt would need
  // one, and without it the query fails). Open reservations are few (checkouts in progress), so age is checked here.
  const snapshot = await db.collection("inventoryReservations")
    .where("status", "==", "reserved")
    .limit(500)
    .get();
  const stale = snapshot.docs
    .filter((doc) => asDate(doc.data().createdAt) < cutoff)
    .slice(0, Math.min(Math.max(limit, 1), 50));
  const results = [];
  for (const doc of stale) {
    const reservation = doc.data();
    if (!reservation.paymentIntentId) {
      results.push({ id: doc.id, action: "manual-review-missing-intent" });
      continue;
    }
    try {
      let intent = await stripe.paymentIntents.retrieve(reservation.paymentIntentId);
      if (intent.status === "succeeded") {
        await finish(db, doc.id, intent.id, "paid");
        results.push({ id: doc.id, action: "paid" });
      } else if (intent.status === "canceled") {
        await finish(db, doc.id, intent.id, "released");
        results.push({ id: doc.id, action: "released" });
      } else if (["requires_payment_method", "requires_confirmation", "requires_action"].includes(intent.status)) {
        // Cancel at Stripe *before* releasing. A customer must not be able to pay afterward.
        intent = await stripe.paymentIntents.cancel(intent.id);
        if (intent.status !== "canceled") throw new Error("CANCEL_NOT_CONFIRMED");
        await finish(db, doc.id, intent.id, "released");
        results.push({ id: doc.id, action: "canceled-and-released" });
      } else {
        // processing or requires_capture: never free stock before verified final status.
        results.push({ id: doc.id, action: "pending-reconciliation" });
      }
    } catch (error) {
      results.push({ id: doc.id, action: "error", reason: error.message });
    }
  }
  return results;
}

module.exports = { validItems, reserve, attachPaymentIntent, finish, releaseWithoutPayment, availability, reconcileExpired };
