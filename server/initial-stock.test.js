"use strict";

// 2026-11-17: initial stock registration — preview, CEO approval, create-only apply.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { allowedPaths, validPlan, previewInitialStock, applyInitialStock, LOG_COLLECTION } = require("./initial-stock");

function fakeFirestore(initial = {}) {
  const store = new Map(Object.entries(initial));
  const snapshot = (key) => ({ exists: store.has(key), data: () => store.get(key) });
  return {
    store,
    collection(name) { return { doc(id) { return { key: `${name}/${id}`, get: async () => snapshot(`${name}/${id}`) }; } }; },
    async runTransaction(callback) {
      const writes = [];
      const tx = {
        get: async (ref) => snapshot(ref.key),
        update() { throw new Error("initial stock must never update"); },
        set() { throw new Error("initial stock must never set (overwrite)"); },
        create(ref, value) { writes.push(() => { if (store.has(ref.key)) throw new Error("ALREADY_EXISTS"); store.set(ref.key, value); }); },
      };
      const result = await callback(tx);
      writes.forEach((write) => write());
      return result;
    },
  };
}

const PROJECT = "ryuge-site";
// Example quantities only; the real ones are the CEO's.
const plan = () => ({
  "inventory/enma-jimma": 15, "inventory/enma-quequesques": 15, "inventory/enma-andes-blue": 15,
  "inventory/enma-zen-dark-roast": 6, "inventory/enma-amarelo-bourbon": 12, "inventoryLots/brazil-amarelo-bourbon": 15,
  "inventory/enma-kindiio": 4,
});

test("only the 9 stock records the checkout uses can be written, with whole quantities 0–1000", () => {
  assert.deepEqual(allowedPaths().sort(), [
    "inventory/enma-amarelo-bourbon", "inventory/enma-andes-blue", "inventory/enma-coffee-bag", "inventory/enma-jimma", "inventory/enma-karamo",
    "inventory/enma-kindiio", "inventory/enma-quequesques", "inventory/enma-zen-dark-roast", "inventoryLots/brazil-amarelo-bourbon",
  ]);
  assert.throws(() => validPlan({ "inventory/woodbox-tea-bag": 5 }), /UNKNOWN_STOCK_RECORD/, "not a stock-managed product");
  assert.deepEqual(validPlan({ "inventory/enma-coffee-bag": 20 }), { "inventory/enma-coffee-bag": 20 }, "the coffee bag is counted stock");
  assert.throws(() => validPlan({ "orders/x": 1 }), /UNKNOWN_STOCK_RECORD/);
  assert.throws(() => validPlan({ "inventory/enma-jimma": "15" }), /INVALID_QUANTITY/, "a string would read as 0 stock");
  assert.throws(() => validPlan({ "inventory/enma-jimma": 1.5 }), /INVALID_QUANTITY/);
  assert.throws(() => validPlan({ "inventory/enma-jimma": 1001 }), /INVALID_QUANTITY/);
  assert.throws(() => validPlan({}), /INVALID_PLAN/);
  assert.throws(() => validPlan(null), /INVALID_PLAN/);
});

test("preview reads everything, changes nothing, and shows what exists, what would be created and what stays missing", async () => {
  const db = fakeFirestore({ "inventory/enma-karamo": { ready: 15, held: 0, sold: 0 } });
  const before = new Map(db.store);
  const preview = await previewInitialStock(db, { ...plan(), "inventory/enma-karamo": 9 }, { projectId: PROJECT });
  assert.deepEqual(db.store, before, "preview writes nothing");
  assert.equal(preview.projectId, PROJECT);
  assert.equal(preview.databaseId, "(default)");
  const by = Object.fromEntries(preview.records.map((r) => [r.path, r]));
  assert.equal(by["inventory/enma-jimma"].action, "create");
  assert.deepEqual(by["inventory/enma-jimma"].planned, { ready: 15, held: 0, sold: 0 });
  assert.equal(by["inventory/enma-karamo"].action, "refused-exists", "an existing record is never overwritten");
  assert.deepEqual(by["inventory/enma-karamo"].current, { ready: 15, held: 0, sold: 0 });
  assert.deepEqual(preview.refused, ["inventory/enma-karamo"]);
  const withoutKaramo = await previewInitialStock(db, plan(), { projectId: PROJECT });
  assert.equal(Object.fromEntries(withoutKaramo.records.map((r) => [r.path, r.action]))["inventory/enma-karamo"], "keep");
  assert.deepEqual(withoutKaramo.missingAfter, ["inventory/enma-coffee-bag"], "a stock record left out of the plan is reported");
  assert.match(withoutKaramo.planHash, /^[a-f0-9]{64}$/);
});

test("apply needs the previewed plan hash, this project and the CEO's approval; creates held 0 / sold 0; once only", async () => {
  const db = fakeFirestore({ "inventory/enma-karamo": { ready: 15, held: 0, sold: 0 } });
  const { planHash } = await previewInitialStock(db, plan(), { projectId: PROJECT });
  const opts = { projectId: PROJECT, expectedProjectId: PROJECT, planHash, approval: "CEO承認 2026-11-17" };
  await assert.rejects(applyInitialStock(db, plan(), { ...opts, expectedProjectId: "other" }), /PROJECT_MISMATCH/);
  await assert.rejects(applyInitialStock(db, plan(), { ...opts, approval: "" }), /APPROVAL_REQUIRED/);
  await assert.rejects(applyInitialStock(db, plan(), { ...opts, planHash: undefined }), /PLAN_HASH_REQUIRED/);
  await assert.rejects(applyInitialStock(db, { ...plan(), "inventory/enma-jimma": 16 }, opts), /PLAN_CHANGED/, "a different number than approved");
  const result = await applyInitialStock(db, plan(), opts);
  assert.equal(result.applied, true);
  assert.equal(result.created.length, 7);
  const jimma = db.store.get("inventory/enma-jimma");
  assert.deepEqual([jimma.ready, jimma.held, jimma.sold], [15, 0, 0]);
  assert.deepEqual(db.store.get("inventoryLots/brazil-amarelo-bourbon").ready, 15);
  assert.deepEqual(db.store.get("inventory/enma-karamo"), { ready: 15, held: 0, sold: 0 }, "untouched");
  const log = db.store.get(`${LOG_COLLECTION}/${planHash}`);
  assert.equal(log.approval, "CEO承認 2026-11-17");
  assert.equal(log.paths.length, 7);
  // A resend is a no-op.
  assert.deepEqual(await applyInitialStock(db, plan(), opts), { applied: false, reason: "ALREADY_APPLIED", created: log.paths });
});

test("apply refuses the whole plan if any record already exists or appeared after the preview", async () => {
  const db = fakeFirestore({ "inventory/enma-karamo": { ready: 15, held: 0, sold: 0 } });
  const withKaramo = { ...plan(), "inventory/enma-karamo": 9 };
  const preview = await previewInitialStock(db, withKaramo, { projectId: PROJECT });
  await assert.rejects(applyInitialStock(db, withKaramo, { projectId: PROJECT, expectedProjectId: PROJECT, planHash: preview.planHash, approval: "CEO承認" }), /ALREADY_EXISTS/);
  assert.equal(db.store.get("inventory/enma-karamo").ready, 15, "not overwritten");
  assert.equal(db.store.has("inventory/enma-jimma"), false, "nothing else was written either");
  // Someone creates a record between preview and apply: refused, nothing written.
  const fresh = fakeFirestore();
  const p = await previewInitialStock(fresh, plan(), { projectId: PROJECT });
  fresh.store.set("inventory/enma-jimma", { ready: 3, held: 0, sold: 0 });
  await assert.rejects(applyInitialStock(fresh, plan(), { projectId: PROJECT, expectedProjectId: PROJECT, planHash: p.planHash, approval: "CEO承認" }), /PLAN_CHANGED/);
  assert.equal(fresh.store.size, 1);
});

test("the route is off unless its token is set on Render, checks the token in constant time, and is rate limited", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const route = source.slice(source.indexOf('app.post("/internal/inventory/initial-stock"'), source.indexOf('app.get("/inventory/availability"'));
  assert.match(route, /if \(!token \|\| token\.length < 32\) return res\.status\(404\)\.end\(\);/);
  assert.match(route, /timingSafeEqual\(digest\(token\), digest\(supplied\)\)/);
  assert.match(route, /initialStockLimit\(clientKey\(req\)\.key\)/);
  assert.doesNotMatch(route, /INVENTORY_ENABLED/, "works while inventory is off (registration comes first)");
  assert.ok(source.indexOf("app.use(express.json());") < source.indexOf('app.post("/internal/inventory/initial-stock"'));
});
