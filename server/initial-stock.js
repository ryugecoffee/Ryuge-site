"use strict";

// One-time initial stock registration (CEO, 2026-11-17), through the payment server's own Firebase Admin connection.
// It only CREATES stock records that do not exist yet; it never changes an existing one (an existing record is shown in
// the preview and refused at apply). The flow is: preview (reads the current records, returns what would be created and
// a plan hash) -> the CEO approves that preview -> apply with the same plan hash. Apply re-reads everything in one
// Firestore transaction and refuses if anything changed since the preview. Each apply leaves an audit record.
// Only the stock records the checkout uses can be written: inventory/{managed product} and inventoryLots/{lot}.
const crypto = require("node:crypto");
const { CATALOG } = require("./catalog");

const MAX_QUANTITY = 1000;
const LOG_COLLECTION = "inventoryInitialStock";

// "inventory/enma-jimma", ..., "inventoryLots/brazil-amarelo-bourbon"
function allowedPaths(catalog = CATALOG) {
  const products = Object.keys(catalog).filter((id) => catalog[id].managedStock === true).map((id) => `inventory/${id}`);
  const lots = [...new Set(Object.values(catalog).map((p) => p.lot).filter(Boolean))].map((lot) => `inventoryLots/${lot}`);
  return [...products, ...lots];
}

function validPlan(plan, catalog = CATALOG) {
  const allowed = new Set(allowedPaths(catalog));
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) throw new Error("INVALID_PLAN");
  const entries = Object.entries(plan);
  if (!entries.length || entries.length > allowed.size) throw new Error("INVALID_PLAN");
  for (const [path, quantity] of entries) {
    if (!allowed.has(path)) throw new Error("UNKNOWN_STOCK_RECORD");
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > MAX_QUANTITY) throw new Error("INVALID_QUANTITY");
  }
  return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
}

const ref = (db, path) => {
  const [collection, id] = path.split("/");
  return db.collection(collection).doc(id);
};

const stockOf = (snapshot) => {
  if (!snapshot.exists) return null;
  const { ready, held, sold } = snapshot.data() || {};
  return { ready: ready ?? null, held: held ?? null, sold: sold ?? null };
};

// The hash binds an approval to this project, this plan and the state that was shown.
function planHash(projectId, plan, current) {
  return crypto.createHash("sha256").update(JSON.stringify({ projectId, plan, current })).digest("hex");
}

// Reads every stock record the checkout uses (planned or not), so the CEO sees the whole picture.
async function previewInitialStock(db, rawPlan, { projectId, catalog = CATALOG } = {}) {
  const plan = validPlan(rawPlan, catalog);
  const paths = allowedPaths(catalog);
  const snapshots = await Promise.all(paths.map((path) => ref(db, path).get()));
  const current = Object.fromEntries(paths.map((path, i) => [path, stockOf(snapshots[i])]));
  const records = paths.map((path) => {
    const planned = Object.prototype.hasOwnProperty.call(plan, path) ? plan[path] : null;
    const action = current[path] ? (planned === null ? "keep" : "refused-exists") : planned === null ? "missing" : "create";
    return { path, current: current[path], planned: planned === null ? null : { ready: planned, held: 0, sold: 0 }, action };
  });
  const plannedCurrent = Object.fromEntries(Object.keys(plan).map((path) => [path, current[path]]));
  return {
    projectId,
    databaseId: "(default)",
    records,
    refused: records.filter((r) => r.action === "refused-exists").map((r) => r.path),
    missingAfter: records.filter((r) => r.action === "missing").map((r) => r.path),
    planHash: planHash(projectId, plan, plannedCurrent),
  };
}

// Creates the planned records in one transaction, only if none of them exists and nothing changed since the preview.
async function applyInitialStock(db, rawPlan, { projectId, expectedProjectId, planHash: approvedHash, approval, catalog = CATALOG } = {}) {
  const plan = validPlan(rawPlan, catalog);
  if (!expectedProjectId || expectedProjectId !== projectId) throw new Error("PROJECT_MISMATCH");
  if (!/^[a-f0-9]{64}$/.test(String(approvedHash || ""))) throw new Error("PLAN_HASH_REQUIRED");
  const note = String(approval || "").trim();
  if (note.length < 4 || note.length > 500) throw new Error("APPROVAL_REQUIRED");
  const paths = Object.keys(plan);
  const logRef = db.collection(LOG_COLLECTION).doc(approvedHash);
  return db.runTransaction(async (tx) => {
    const log = await tx.get(logRef);
    if (log.exists) return { applied: false, reason: "ALREADY_APPLIED", created: log.data().paths || [] };
    const snapshots = await Promise.all(paths.map((path) => tx.get(ref(db, path))));
    const current = Object.fromEntries(paths.map((path, i) => [path, stockOf(snapshots[i])]));
    if (planHash(projectId, plan, current) !== approvedHash) throw new Error("PLAN_CHANGED");
    if (Object.values(current).some(Boolean)) throw new Error("ALREADY_EXISTS");
    const at = new Date();
    for (const path of paths) {
      tx.create(ref(db, path), { ready: plan[path], held: 0, sold: 0, createdAt: at, createdBy: "initial-stock" });
    }
    tx.create(logRef, { projectId, paths, plan, approval: note, appliedAt: at });
    return { applied: true, created: paths };
  });
}

module.exports = { allowedPaths, validPlan, previewInitialStock, applyInitialStock, LOG_COLLECTION };
