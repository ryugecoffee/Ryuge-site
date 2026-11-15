"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { adjustInventory } = require("./inventory-adjustments");

// Transaction fake serializes calls and enforces the Firestore read-before-write shape.
function fakeFirestore(initial) {
  const state = new Map(Object.entries(initial));
  let queue = Promise.resolve();
  const db = {
    collection(name) {
      return { doc(id) {
        const path = name + "/" + id;
        return { path };
      } };
    },
    async runTransaction(callback) {
      const before = queue;
      let release;
      queue = new Promise((resolve) => { release = resolve; });
      await before;
      let writing = false;
      const changes = [];
      const tx = {
        async get(ref) {
          if (writing) throw new Error("READ_AFTER_WRITE");
          const doc = state.get(ref.path);
          return { exists: doc !== undefined, data: () => doc };
        },
        update(ref, patch) {
          writing = true;
          changes.push(() => state.set(ref.path, { ...state.get(ref.path), ...patch }));
        },
        create(ref, value) {
          writing = true;
          changes.push(() => {
            assert.equal(state.has(ref.path), false);
            state.set(ref.path, value);
          });
        },
      };
      try {
        const result = await callback(tx);
        changes.forEach((change) => change());
        return result;
      } finally {
        release();
      }
    },
  };
  return { db, state };
}

const actor = "factory-ceo:ryugecoffee";
function args(requestId, extra = {}) {
  return { sku: "enma-karamo", action: "retail_sale", quantity: 1,
    requestId, trustedActor: actor, ...extra };
}

test("retail sale reduces only unheld stock and records audit trail", async () => {
  const { db, state } = fakeFirestore({
    "inventory/enma-karamo": { ready: 15, held: 2, sold: 0 },
  });
  const result = await adjustInventory(db, args("retail-unique-one"));
  assert.deepEqual(result, { applied: true, remaining: 12 });
  assert.deepEqual(state.get("inventory/enma-karamo"), { ready: 14, held: 2, sold: 1 });
  const audit = state.get("inventoryAdjustments/retail-unique-one");
  assert.equal(audit.actor, actor);
  assert.equal(audit.before.ready, 15);
  assert.equal(audit.after.ready, 14);
});

test("duplicate command only changes stock once", async () => {
  const { db, state } = fakeFirestore({
    "inventory/enma-karamo": { ready: 15, held: 0, sold: 0 },
  });
  const [a, b] = await Promise.all([
    adjustInventory(db, args("retail-unique-two")),
    adjustInventory(db, args("retail-unique-two")),
  ]);
  assert.equal([a.applied, b.applied].filter(Boolean).length, 1);
  assert.equal(state.get("inventory/enma-karamo").ready, 14);
  assert.equal(state.get("inventory/enma-karamo").sold, 1);
});

test("stock replenishment increases ready, preserves sold, and records audit", async () => {
  const { db, state } = fakeFirestore({
    "inventory/enma-karamo": { ready: 3, held: 1, sold: 12 },
  });
  const result = await adjustInventory(db, args("stock-in-unique-three", {
    action: "stock_in", quantity: 15,
  }));
  assert.deepEqual(result, { applied: true, remaining: 17 });
  assert.deepEqual(state.get("inventory/enma-karamo"), { ready: 18, held: 1, sold: 12 });
});

test("stockout, malformed request and reused key with changed payload fail closed", async () => {
  const { db, state } = fakeFirestore({
    "inventory/enma-karamo": { ready: 2, held: 2, sold: 1 },
  });
  await assert.rejects(() => adjustInventory(db, args("retail-empty-four")), /OUT_OF_STOCK/);
  await assert.rejects(() => adjustInventory(db, args("bad", { action: "stock_in" })),
    /INVALID_INVENTORY_ADJUSTMENT/);
  await adjustInventory(db, args("retail-unique-five", { action: "stock_in" }));
  await assert.rejects(() => adjustInventory(db, args("retail-unique-five", {
    action: "stock_in", quantity: 2,
  })), /INVENTORY_REQUEST_ID_CONFLICT/);
  assert.equal(state.get("inventory/enma-karamo").ready, 3);
});
