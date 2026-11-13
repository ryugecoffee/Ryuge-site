"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { validItems, reserve, attachPaymentIntent, finish, availability } = require("./inventory");

class FakeDoc {
  constructor(store, key) { this.store = store; this.key = key; this.id = key.split("/").at(-1); }
  async get() { return snapshot(this.store, this.key); }
}
function snapshot(store, key) {
  const data = store.get(key);
  return { exists: data !== undefined, data: () => data };
}
function fakeFirestore(initial = {}) {
  const store = new Map(Object.entries(initial));
  const db = {
    collection(name) {
      return { doc(id) { return new FakeDoc(store, name + "/" + id); } };
    },
    async runTransaction(callback) {
      const writes = [];
      const tx = {
        get: async (ref) => snapshot(store, ref.key),
        update(ref, patch) { writes.push(() => store.set(ref.key, { ...store.get(ref.key), ...patch })); },
        create(ref, value) { writes.push(() => {
          if (store.has(ref.key)) throw new Error("ALREADY_EXISTS");
          store.set(ref.key, value);
        }); },
      };
      const result = await callback(tx);
      writes.forEach((write) => write());
      return result;
    },
  };
  return { db, store };
}

test("quantity input must be valid, unique and within limits", () => {
  assert.deepEqual(validItems([{ id: "enma-jimma", quantity: 2 }]), [{ id: "enma-jimma", quantity: 2 }]);
  for (const bad of [
    [], [{ id: "?", quantity: 1 }], [{ id: "x", quantity: 0 }],
    [{ id: "x", quantity: 1.5 }], [{ id: "x", quantity: 1 }, { id: "x", quantity: 2 }],
  ]) assert.throws(() => validItems(bad), /INVALID_ITEMS/);
});

test("reservation, capture and duplicate webhook are idempotent", async () => {
  const { db, store } = fakeFirestore({ "inventory/enma-jimma": { ready: 15, held: 0, sold: 0 } });
  const id = await reserve(db, [{ id: "enma-jimma", quantity: 2 }]);
  assert.deepEqual(await availability(db, ["enma-jimma"]), { "enma-jimma": 13 });
  await attachPaymentIntent(db, id, "pi_test_1");
  assert.equal(await finish(db, id, "pi_test_1", "paid"), true);
  assert.equal(await finish(db, id, "pi_test_1", "paid"), false);
  assert.deepEqual(store.get("inventory/enma-jimma"), { ready: 13, held: 0, sold: 2 });
  await assert.rejects(() => finish(db, id, "pi_test_1", "released"), /RESERVATION_ALREADY_FINALIZED/);
});

test("failed order can release its hold, without subtracting actual stock", async () => {
  const { db, store } = fakeFirestore({ "inventory/enma-karamo": { ready: 2, held: 0, sold: 0 } });
  const id = await reserve(db, [{ id: "enma-karamo", quantity: 2 }]);
  await assert.rejects(() => reserve(db, [{ id: "enma-karamo", quantity: 1 }]), /OUT_OF_STOCK/);
  await attachPaymentIntent(db, id, "pi_test_2");
  assert.equal(await finish(db, id, "pi_test_2", "released"), true);
  assert.deepEqual(store.get("inventory/enma-karamo"), { ready: 2, held: 0, sold: 0 });
  await assert.rejects(() => finish(db, id, "wrong-payment", "paid"), /PAYMENT_MISMATCH/);
});

test("missing seeded inventory fails closed", async () => {
  const { db } = fakeFirestore();
  assert.deepEqual(await availability(db, ["enma-jimma"]), { "enma-jimma": 0 });
  await assert.rejects(() => reserve(db, [{ id: "enma-jimma", quantity: 1 }]), /OUT_OF_STOCK/);
});
