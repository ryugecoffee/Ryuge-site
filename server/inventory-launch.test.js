"use strict";

// 2026-11-17: what turning inventory on in production needs from the code.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CATALOG, priceItems, managedItems } = require("./catalog");
const { reconcileExpired } = require("./inventory");

test("only counted, packed products are stock-gated; the storefront and the server agree on which", async () => {
  const priced = priceItems([{ id: "enma-karamo", quantity: 2 }, { id: "enma-coffee-bag", quantity: 1 }, { id: "woodbox-tea-bag", quantity: 1 }]);
  assert.deepEqual(managedItems(priced), [{ id: "enma-karamo", quantity: 2 }, { id: "enma-coffee-bag", quantity: 1 }],
    "the coffee bag is counted stock (CEO 2026-11-17); the hojicha bag has no stock record, gating it would refuse every order");
  const page = fs.readFileSync(path.join(__dirname, "..", "src", "pages", "ProductsPage.jsx"), "utf8");
  // The featured slot's SKU comes from the setting (FEATURED_COFFEE.sku), the rest are listed by name.
  const { PRODUCT_DATA, FEATURED_COFFEE } = await import(path.join(__dirname, "..", "src", "productData.js"));
  const skuSet = (name) => {
    const body = new RegExp(`const ${name} = new Set\\(\\[FEATURED_COFFEE\\.sku, ([^\\]]*)\\]\\);`).exec(page)[1];
    return [FEATURED_COFFEE.sku, ...body.match(/"([a-z0-9-]+)"/g).map((s) => s.slice(1, -1))];
  };
  const listed = skuSet("INVENTORY_MANAGED_SKUS");
  const managed = Object.keys(CATALOG).filter((id) => CATALOG[id].managedStock === true);
  assert.deepEqual([...listed].sort(), [...managed].sort());
  const requiredOnPage = skuSet("REQUIRES_INVENTORY_SKUS");
  const required = Object.keys(CATALOG).filter((id) => CATALOG[id].requiresInventory === true);
  assert.deepEqual([...requiredOnPage].sort(), [...required].sort());
  for (const id of required) assert.equal(CATALOG[id].managedStock, true, `${id} needs a stock record`);
  // Every counted product is on sale, except one the store shows as sold out (CEO 2026-11-22: both Brazil products), or
  // the regular product of the featured coffee (hidden while it is sold as 「今、飲んでほしい珈琲」, server/featured.js).
  // Its stock record stays (paid orders, lot), but the server refuses it and the store offers no cart button.
  const all = Object.values(PRODUCT_DATA).flat().filter((p) => p && p.id);
  const soldOut = new Set(all.filter((p) => p.isSoldOut === true).map((p) => p.id));
  const featuredSource = new Set(all.filter((p) => p.featuredAs && p.hidden === true).map((p) => p.id));
  const notOnSale = managed.filter((id) => CATALOG[id].availableForSale !== true);
  assert.deepEqual(notOnSale.sort(), ["enma-amarelo-bourbon", "enma-quequesques", "enma-zen-dark-roast"]);
  for (const id of notOnSale) assert.ok(soldOut.has(id) || featuredSource.has(id), `${id} is managed but not on sale, and neither sold out nor featured`);
});

test("checkout reserves only the managed part of the cart, and abandoned holds are settled without a scheduler", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const route = source.slice(source.indexOf('app.post("/create-payment-intent"'), source.indexOf('app.post("/calc-shipping"'));
  assert.match(route, /const stockItems = managedItems\(quote\.items\);\n\s+if \(INVENTORY_ENABLED && stockItems\.length\) \{\n\s+reconcileSoon\(\);/);
  assert.match(route, /reservationId = await inventory\.reserve\(db, stockItems, null, promo, lotItems\(quote\.items\)\);/);
  const availability = source.slice(source.indexOf('app.get("/inventory/availability"'), source.indexOf('app.post("/create-payment-intent"'));
  assert.match(availability, /reconcileSoon\(\);/);
  assert.match(availability, /inventory\.availability\(db, ids, \(id\) => lotOf\(id\)\)/, "a product of a lot shows what is left in the lot");
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

test("the coffee bag: counted with inventory on, and still on sale with inventory off (never stopped by this change)", () => {
  const { CATALOG: catalog } = require("./catalog");
  assert.equal(catalog["enma-coffee-bag"].managedStock, true);
  assert.notEqual(catalog["enma-coffee-bag"].requiresInventory, true, "inventory off must not stop the coffee bag");
  assert.equal(catalog["enma-coffee-bag"].availableForSale, true);
  const page = fs.readFileSync(path.join(__dirname, "..", "src", "pages", "ProductsPage.jsx"), "utf8");
  // With inventory off, a managed product that does not require inventory is shown as on sale ("unmanaged").
  assert.match(page, /if \(inventoryMode === "disabled"\) return REQUIRES_INVENTORY_SKUS\.has\(item\.id\) \? "comingSoon" : "unmanaged";/);
});
