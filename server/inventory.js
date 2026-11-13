"use strict";

// Firestore-backed inventory for physical, already packed products.
// No stock is created from raw-green-bean purchase quantities.
// Schema: inventory/{sku} = { ready: int, held: int, sold: int }
//         inventoryReservations/{id} = { status, items, paymentIntentId, createdAt }
// ready is physical unsold quantity, held is part of ready reserved for checkout.
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

async function reserve(db, items, paymentIntentId = null) {
  const sanitized = validItems(items);
  const id = crypto.randomUUID();
  const reservation = db.collection("inventoryReservations").doc(id);
  const refs = sanitized.map(({ id: sku }) => db.collection("inventory").doc(sku));

  await db.runTransaction(async (tx) => {
    // Firestore transactions require all reads before any writes.
    const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
    for (let i = 0; i < sanitized.length; i++) {
      if (!snaps[i].exists) throw new Error("OUT_OF_STOCK");
      const stock = snaps[i].data() || {};
      if (integer(stock.ready) - integer(stock.held) < sanitized[i].quantity) throw new Error("OUT_OF_STOCK");
    }
    sanitized.forEach(({ quantity }, i) => {
      tx.update(refs[i], { held: integer(snaps[i].data().held) + quantity });
    });
    tx.create(reservation, {
      status: "reserved",
      items: sanitized,
      paymentIntentId,
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
    docs.forEach((doc, i) => {
      if (!doc.exists || integer(doc.data().held) < items[i].quantity) throw new Error("INVENTORY_INCONSISTENCY");
    });
    items.forEach(({ quantity }, i) => {
      const stock = docs[i].data();
      tx.update(refs[i], action === "paid"
        ? {
            ready: integer(stock.ready) - quantity,
            held: integer(stock.held) - quantity,
            sold: integer(stock.sold) + quantity,
          }
        : { held: integer(stock.held) - quantity });
    });
    tx.update(ref, { status: action, finishedAt: new Date() });
    return true;
  });
}

async function availability(db, ids) {
  const requested = [...new Set(ids.filter((id) => /^[a-z0-9-]{1,90}$/.test(id)))].slice(0, 50);
  const snapshots = await Promise.all(requested.map((id) => db.collection("inventory").doc(id).get()));
  return Object.fromEntries(snapshots.map((s, i) => [
    requested[i],
    s.exists ? Math.max(0, integer(s.data().ready) - integer(s.data().held)) : 0,
  ]));
}

module.exports = { validItems, reserve, attachPaymentIntent, finish, availability };
