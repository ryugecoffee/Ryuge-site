"use strict";

// 2026-11-17: what turning inventory on in production needs from the code.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CATALOG, priceItems, managedItems } = require("./catalog");
const { reconcileExpired } = require("./inventory");

test("only counted, packed products are stock-gated; the storefront and the server agree on which", () => {
  const priced = priceItems([{ id: "enma-karamo", quantity: 2 }, { id: "enma-coffee-bag", quantity: 1 }, { id: "woodbox-tea-bag", quantity: 1 }]);
  assert.deepEqual(managedItems(priced), [{ id: "enma-karamo", quantity: 2 }],
    "coffee and tea bags have no stock record: gating them would refuse every order for them");
  const page = fs.readFileSync(path.join(__dirname, "..", "src", "pages", "ProductsPage.jsx"), "utf8");
  const listed = /const INVENTORY_MANAGED_SKUS = new Set\(\[([^\]]*)\]\);/.exec(page)[1].match(/"([a-z0-9-]+)"/g).map((s) => s.slice(1, -1));
  const managed = Object.keys(CATALOG).filter((id) => CATALOG[id].managedStock === true);
  assert.deepEqual([...listed].sort(), [...managed].sort());
  for (const id of managed) assert.equal(CATALOG[id].availableForSale, true, `${id} is managed but not on sale`);
});

test("checkout reserves only the managed part of the cart, and abandoned holds are settled without a scheduler", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const route = source.slice(source.indexOf('app.post("/create-payment-intent"'), source.indexOf('app.post("/calc-shipping"'));
  assert.match(route, /const stockItems = managedItems\(quote\.items\);\n\s+if \(INVENTORY_ENABLED && stockItems\.length\) \{\n\s+reconcileSoon\(\);/);
  assert.match(route, /reservationId = await inventory\.reserve\(db, stockItems\);/);
  const availability = source.slice(source.indexOf('app.get("/inventory/availability"'), source.indexOf('app.post("/create-payment-intent"'));
  assert.match(availability, /reconcileSoon\(\);/);
  assert.match(source, /if \(INVENTORY_ENABLED\) setInterval\(reconcileSoon, 5 \* 60 \* 1000\)/);
  assert.match(source, /if \(!INVENTORY_ENABLED \|\| reconciling \|\| Date\.now\(\) - lastReconcile < RECONCILE_MIN_INTERVAL_MS\) return;/,
    "at most once a minute, never two at a time");
});

test("reconciliation needs no composite Firestore index and only touches reservations older than 20 minutes", async () => {
  const now = Date.now();
  const docs = [
    { id: "a0000000-0000-4000-8000-000000000001", data: { status: "reserved", createdAt: { toDate: () => new Date(now - 30 * 60_000) }, paymentIntentId: "pi_old" } },
    { id: "a0000000-0000-4000-8000-000000000002", data: { status: "reserved", createdAt: new Date(now - 60_000), paymentIntentId: "pi_new" } },
  ];
  let filters = 0;
  const db = {
    collection(name) {
      assert.equal(name, "inventoryReservations");
      const query = {
        where(field, op, value) {
          filters += 1;
          assert.deepEqual([field, op, value], ["status", "==", "reserved"], "a second filter would need a composite index");
          return query;
        },
        limit() { return query; },
        async get() { return { docs: docs.map((d) => ({ id: d.id, data: () => d.data })) }; },
      };
      return query;
    },
  };
  const looked = [];
  const stripe = { paymentIntents: { retrieve: async (id) => { looked.push(id); return { id, status: "processing" }; } } };
  const results = await reconcileExpired(db, stripe, 30);
  assert.equal(filters, 1);
  assert.deepEqual(looked, ["pi_old"], "a checkout still within 20 minutes is left alone");
  assert.deepEqual(results, [{ id: "a0000000-0000-4000-8000-000000000001", action: "pending-reconciliation" }]);
});
