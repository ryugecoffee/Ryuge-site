"use strict";

// Internal inventory transaction primitive. Do not expose to browsers.
// The future Factory endpoint must authenticate the CEO, authorize actions,
// and pass a trusted actor identity (never take it from the request body).
const SKU_RE = /^[a-z0-9-]{1,90}$/;
const REQUEST_RE = /^[a-zA-Z0-9_-]{12,100}$/;

async function adjustInventory(db, { sku, action, quantity, requestId, trustedActor }) {
  if (!SKU_RE.test(sku || "") || !["stock_in", "retail_sale"].includes(action) ||
      !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000 ||
      !REQUEST_RE.test(requestId || "") || typeof trustedActor !== "string" ||
      !/^factory-ceo:[a-zA-Z0-9_-]{3,90}$/.test(trustedActor)) {
    throw new Error("INVALID_INVENTORY_ADJUSTMENT");
  }
  const stockRef = db.collection("inventory").doc(sku);
  const recordRef = db.collection("inventoryAdjustments").doc(requestId);
  return db.runTransaction(async (tx) => {
    const [record, snapshot] = await Promise.all([tx.get(recordRef), tx.get(stockRef)]);
    if (record.exists) {
      const previous = record.data() || {};
      // Same request ID must represent the exact same authorized operation.
      if (previous.sku !== sku || previous.action !== action ||
          previous.quantity !== quantity || previous.actor !== trustedActor) {
        throw new Error("INVENTORY_REQUEST_ID_CONFLICT");
      }
      return { applied: false, remaining: previous.remaining };
    }
    if (!snapshot.exists) throw new Error("UNKNOWN_INVENTORY_SKU");
    const stock = snapshot.data() || {};
    const { ready, held, sold } = stock;
    if (![ready, held, sold].every((n) => Number.isSafeInteger(n) && n >= 0) ||
        held > ready) throw new Error("INVALID_INVENTORY_STATE");
    if (action === "retail_sale" && ready - held < quantity) {
      throw new Error("OUT_OF_STOCK");
    }
    const updated = action === "stock_in"
      ? { ready: ready + quantity, held, sold }
      : { ready: ready - quantity, held, sold: sold + quantity };
    if (!Number.isSafeInteger(updated.ready) || !Number.isSafeInteger(updated.sold)) {
      throw new Error("INVENTORY_OVERFLOW");
    }
    tx.update(stockRef, updated);
    tx.create(recordRef, {
      sku, action, quantity, actor: trustedActor, requestId,
      before: { ready, held, sold },
      after: updated,
      remaining: updated.ready - updated.held,
      createdAt: new Date(),
    });
    return { applied: true, remaining: updated.ready - updated.held };
  });
}

module.exports = { adjustInventory };
