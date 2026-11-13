"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { reserve, attachPaymentIntent, finish, availability, reconcileExpired } = require("./inventory");

// Serialized fake transactions provide a deterministic simulation of Firestore's
// atomic commit behavior; these tests do not substitute for live Stripe E2E.
function storeWithTransactions(initial) {
  const dbStore = new Map(Object.entries(initial));
  let lock = Promise.resolve();
  function doc(path) {
    return { path, id: path.split("/").at(-1), get: async () => snapshot(path) };
  }
  function snapshot(path) {
    const d = dbStore.get(path);
    return { exists: !!d, data: () => d };
  }
  const db = {
    collection(name) {
      return {
        doc: (id) => doc(name + "/" + id),
        where(field, op, value) {
          assert.equal(name, "inventoryReservations");
          return {
            where() { throw new Error("UNSUPPORTED"); },
            limit(n) {
              return {
                async get() {
                  const docs = [...dbStore.entries()]
                    .filter(([key, value]) => key.startsWith("inventoryReservations/") &&
                      value.status === "reserved" && value.createdAt < value)
                    .slice(0, n)
                    .map(([key, v]) => ({ id: key.split("/").at(-1), data: () => v }));
                  return { docs };
                },
              };
            },
          };
        },
      };
    },
    async runTransaction(callback) {
      let unlock;
      const prior = lock;
      lock = new Promise((resolve) => { unlock = resolve; });
      await prior;
      const pending = [];
      const tx = {
        get: async (ref) => snapshot(ref.path),
        update: (ref, patch) => pending.push(() => dbStore.set(ref.path, { ...dbStore.get(ref.path), ...patch })),
        create: (ref, value) => pending.push(() => {
          assert.equal(dbStore.has(ref.path), false);
          dbStore.set(ref.path, value);
        }),
      };
      try {
        const result = await callback(tx);
        pending.forEach((update) => update());
        return result;
      } finally {
        unlock();
      }
    },
  };
  return { db, dbStore };
}

test("two buyers compete for the final bag: only one can reserve it", async () => {
  const { db } = storeWithTransactions({
    "inventory/enma-karamo": { ready: 1, held: 0, sold: 0 },
  });
  const results = await Promise.allSettled([
    reserve(db, [{ id: "enma-karamo", quantity: 1 }]),
    reserve(db, [{ id: "enma-karamo", quantity: 1 }]),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), ["fulfilled", "rejected"]);
  assert.deepEqual(await availability(db, ["enma-karamo"]), { "enma-karamo": 0 });
  const reservationId = results.find((r) => r.status === "fulfilled").value;
  await attachPaymentIntent(db, reservationId, "pi_sandbox_mock_1");
  assert.equal(await finish(db, reservationId, "pi_sandbox_mock_1", "paid"), true);
  assert.equal(await finish(db, reservationId, "pi_sandbox_mock_1", "paid"), false);
});

test("failed card attempt releases inventory without a sale", async () => {
  const { db, dbStore } = storeWithTransactions({
    "inventory/enma-karamo": { ready: 15, held: 0, sold: 0 },
  });
  const reservationId = await reserve(db, [{ id: "enma-karamo", quantity: 1 }]);
  await attachPaymentIntent(db, reservationId, "pi_sandbox_mock_2");
  assert.deepEqual(await availability(db, ["enma-karamo"]), { "enma-karamo": 14 });
  assert.equal(await finish(db, reservationId, "pi_sandbox_mock_2", "released"), true);
  assert.deepEqual(dbStore.get("inventory/enma-karamo"), { ready: 15, held: 0, sold: 0 });
});
