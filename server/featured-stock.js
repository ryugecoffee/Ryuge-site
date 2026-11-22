"use strict";

// Moving bags between a coffee and its 「今、飲んでほしい珈琲」 featured product (server/featured.js), CEO, 2026-11-22.
// The two are the same physical beans with separate stock records, so bags are MOVED, never registered twice:
//   into the slot:  inventory/{featured product} -> inventory/{featured SKU}  (only for the coffee featured now)
//   back:           inventory/enma-featured-X    -> inventory/enma-X           (any featured SKU, now or earlier)
// Only free bags move (ready - held: never a bag held by a checkout in progress), and both records change in one
// Firestore transaction, so the total never changes. Same flow as server/initial-stock.js: preview (shows the current
// records and a plan hash) -> the CEO approves that preview -> apply with the same hash, refused if anything changed in
// between. Each apply leaves one audit record (inventoryTransfers/{plan hash}); a repeat changes nothing.
const crypto = require("node:crypto");
const { BASE_CATALOG, FEATURED } = require("./catalog");
const { sourceOfFeaturedSku } = require("./featured");

const MAX_QUANTITY = 1000;
const LOG_COLLECTION = "inventoryTransfers";
const SKU_RE = /^[a-z0-9-]{1,90}$/;

class TransferError extends Error {}
const fail = (code) => { throw new TransferError(code); };

// { from, to, quantity } -> the same, if it is one of the two allowed moves.
function validTransfer(raw, { base = BASE_CATALOG, featured = FEATURED } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("INVALID_TRANSFER");
  const { from, to, quantity } = raw;
  if (!SKU_RE.test(String(from || "")) || !SKU_RE.test(String(to || "")) || from === to) fail("INVALID_TRANSFER");
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) fail("INVALID_QUANTITY");
  const intoSlot = from === featured.product && to === featured.sku;
  const source = sourceOfFeaturedSku(from);
  const back = source !== null && to === source && base[source]?.managedStock === true;
  if (!intoSlot && !back) fail("TRANSFER_NOT_ALLOWED");
  return { from, to, quantity };
}

const stockRef = (db, sku) => db.collection("inventory").doc(sku);
const stockOf = (snapshot) => {
  if (!snapshot.exists) return null;
  const { ready, held, sold } = snapshot.data() || {};
  return { ready: ready ?? null, held: held ?? null, sold: sold ?? null };
};
const counted = (s) => s && [s.ready, s.held, s.sold].every((n) => Number.isSafeInteger(n) && n >= 0) && s.held <= s.ready;

function planHash(projectId, plan, current) {
  return crypto.createHash("sha256").update(JSON.stringify({ kind: "featured-transfer", projectId, plan, current })).digest("hex");
}

// What the move would do, from the two records as they are now.
function outcome(plan, current) {
  const { from, to } = current;
  if (!counted(from)) fail("UNKNOWN_OR_INVALID_SOURCE");
  if (to !== null && !counted(to)) fail("INVALID_TARGET");
  const free = from.ready - from.held;
  if (plan.quantity > free) fail("NOT_ENOUGH_FREE_STOCK");
  return {
    from: { ...from, ready: from.ready - plan.quantity },
    to: to ? { ...to, ready: to.ready + plan.quantity } : { ready: plan.quantity, held: 0, sold: 0 },
  };
}

async function previewFeaturedTransfer(db, raw, { projectId, base, featured } = {}) {
  const plan = validTransfer(raw, { base, featured });
  const [fromSnap, toSnap] = await Promise.all([stockRef(db, plan.from).get(), stockRef(db, plan.to).get()]);
  const current = { from: stockOf(fromSnap), to: stockOf(toSnap) };
  const after = outcome(plan, current);
  return { projectId, plan, current, after, planHash: planHash(projectId, plan, current) };
}

async function applyFeaturedTransfer(db, raw, { projectId, expectedProjectId, planHash: approvedHash, approval, base, featured } = {}) {
  const plan = validTransfer(raw, { base, featured });
  if (!expectedProjectId || expectedProjectId !== projectId) fail("PROJECT_MISMATCH");
  if (!/^[a-f0-9]{64}$/.test(String(approvedHash || ""))) fail("PLAN_HASH_REQUIRED");
  const note = String(approval || "").trim();
  if (note.length < 4 || note.length > 500) fail("APPROVAL_REQUIRED");
  const logRef = db.collection(LOG_COLLECTION).doc(approvedHash);
  const { retryOnContention } = require("./coffee-subscription-records");
  return retryOnContention(() => db.runTransaction(async (tx) => {
    const log = await tx.get(logRef);
    if (log.exists) return { applied: false, reason: "ALREADY_APPLIED", plan: log.data().plan, after: log.data().after };
    const [fromSnap, toSnap] = await Promise.all([tx.get(stockRef(db, plan.from)), tx.get(stockRef(db, plan.to))]);
    const current = { from: stockOf(fromSnap), to: stockOf(toSnap) };
    if (planHash(projectId, plan, current) !== approvedHash) fail("PLAN_CHANGED");
    const after = outcome(plan, current);
    const at = new Date();
    tx.update(stockRef(db, plan.from), { ready: after.from.ready });
    if (current.to) tx.update(stockRef(db, plan.to), { ready: after.to.ready });
    else tx.create(stockRef(db, plan.to), { ...after.to, createdAt: at, createdBy: "featured-transfer" });
    tx.create(logRef, { projectId, plan, before: current, after, approval: note, appliedAt: at });
    return { applied: true, plan, after };
  }));
}

module.exports = { validTransfer, previewFeaturedTransfer, applyFeaturedTransfer, TransferError, LOG_COLLECTION, MAX_QUANTITY };
