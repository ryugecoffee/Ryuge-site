"use strict";

// 2026-11-17 (CEO final prices): the Brazil Amarelo Bourbon is sold as two products, the promotional "Zen dark roast"
// and the regular medium-dark roast. Separate SKUs (caps, promo rule, orders), one shared lot (what can be roasted).
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { CATALOG, priceItems, itemsMetadata, managedItems, lotOf, lotItems } = require("./catalog");
const { reserve, attachPaymentIntent, finish, availability, releaseWithoutPayment } = require("./inventory");
const { quoteOrder } = require("./quote");
const { parseItemsMetadata } = require("./orders");

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
        update(ref, patch) { writes.push(() => store.set(ref.key, { ...store.get(ref.key), ...patch })); },
        create(ref, value) { writes.push(() => { if (store.has(ref.key)) throw new Error("ALREADY_EXISTS"); store.set(ref.key, value); }); },
      };
      const result = await callback(tx);
      writes.forEach((write) => write());
      return result;
    },
  };
}

const ZEN = "enma-zen-dark-roast";
const REGULAR = "enma-amarelo-bourbon";
const LOT = "brazil-amarelo-bourbon";
// Example numbers only: the real caps and lot are set by the CEO (docs/inventory-rollout.md).
const stock = () => ({
  [`inventory/${ZEN}`]: { ready: 10, held: 0, sold: 0 },
  [`inventory/${REGULAR}`]: { ready: 10, held: 0, sold: 0 },
  [`inventoryLots/${LOT}`]: { ready: 12, held: 0, sold: 0 },
});
// What checkout does: the managed part of the priced cart, and the same bags per lot.
const checkout = (db, cart, promo = null) => {
  const items = priceItems(cart);
  return reserve(db, managedItems(items), null, promo, lotItems(items));
};

test("final prices and roasts: the server charges exactly what the store shows", async () => {
  const expected = { [ZEN]: 1000, [REGULAR]: 1300, "enma-jimma": 1500, "enma-quequesques": 1500, "enma-andes-blue": 1500, "enma-karamo": 1800, "enma-kindiio": 2050 };
  for (const [id, price] of Object.entries(expected)) assert.equal(CATALOG[id].price, price, id);
  const { PRODUCT_DATA } = await import(path.join(__dirname, "..", "src", "productData.js"));
  const byId = Object.fromEntries(PRODUCT_DATA.enma.map((p) => [p.id, p]));
  for (const [id, price] of Object.entries(expected)) assert.equal(byId[id].priceNumber, price, `${id} in the store`);
  const roasts = { [ZEN]: "深煎り", [REGULAR]: "中深煎り", "enma-jimma": "浅煎り", "enma-quequesques": "浅煎り", "enma-andes-blue": "浅煎り", "enma-karamo": "浅煎り", "enma-kindiio": "浅煎り" };
  for (const [id, roast] of Object.entries(roasts)) assert.equal(byId[id].roast.ja, roast, id);
  // Store and server agree on which products wait for inventory, and which is the promotional one.
  for (const p of PRODUCT_DATA.enma) {
    assert.equal(p.requiresInventory === true, CATALOG[p.id].requiresInventory === true, `${p.id} requiresInventory`);
    assert.equal(p.promo === true, CATALOG[p.id].promo === true, `${p.id} promo`);
  }
  // The amount charged follows the catalogue: 1 regular + 2 promo + 1 Jimma, Tokyo.
  // 4 bags go by Yu-Pack at the regional fee (Tokyo ¥250, server/domestic-shipping.js).
  const quote = quoteOrder([{ id: REGULAR, quantity: 1 }, { id: ZEN, quantity: 2 }, { id: "enma-jimma", quantity: 1 }], { prefecture: "東京都" });
  assert.equal(quote.total, 1300 + 2000 + 1500 + 250);
});

test("two SKUs: only the promotional Brazil is limited to 2, and an order records which one was bought", () => {
  assert.equal(CATALOG[ZEN].promo, true);
  assert.notEqual(CATALOG[REGULAR].promo, true);
  assert.throws(() => quoteOrder([{ id: ZEN, quantity: 3 }], { prefecture: "東京都" }), /PROMO_LIMIT/);
  assert.equal(quoteOrder([{ id: REGULAR, quantity: 3 }], { prefecture: "東京都" }).total, 3900 + 250, "the regular one is not a promo");
  const items = priceItems([{ id: ZEN, quantity: 2 }, { id: REGULAR, quantity: 1 }]);
  assert.deepEqual(parseItemsMetadata(itemsMetadata(items)), [
    { id: ZEN, quantity: 2, unitPrice: 1000 }, { id: REGULAR, quantity: 1, unitPrice: 1300 },
  ]);
});

test("both Brazil products draw on one lot; other products have none", () => {
  assert.equal(lotOf(ZEN), LOT);
  assert.equal(lotOf(REGULAR), LOT);
  for (const id of ["enma-jimma", "enma-quequesques", "enma-andes-blue", "enma-karamo", "enma-kindiio", "enma-coffee-bag", "nope"]) assert.equal(lotOf(id), null, id);
  assert.deepEqual(lotItems(priceItems([{ id: ZEN, quantity: 2 }, { id: REGULAR, quantity: 3 }, { id: "enma-jimma", quantity: 1 }])), [{ id: LOT, quantity: 5 }]);
  assert.deepEqual(lotItems(priceItems([{ id: "enma-jimma", quantity: 1 }])), []);
});

test("an order must fit its product cap and the shared lot; the lot is never sold twice", async () => {
  const db = fakeFirestore(stock());
  // Within each cap (10) but the two together pass the lot (12): once 11 are held, 2 more promo bags are refused.
  const first = await checkout(db, [{ id: REGULAR, quantity: 10 }]);
  assert.ok(await checkout(db, [{ id: ZEN, quantity: 1 }]));
  await assert.rejects(checkout(db, [{ id: ZEN, quantity: 2 }]), /OUT_OF_STOCK/);
  assert.equal(db.store.get(`inventoryLots/${LOT}`).held, 11, "10 regular + 1 promo held");
  assert.equal(db.store.get(`inventory/${ZEN}`).held, 1, "the refused order held nothing");
  // Availability shows the smaller of the product cap and the lot.
  assert.deepEqual(await availability(db, [ZEN, REGULAR], lotOf), { [ZEN]: 1, [REGULAR]: 0 });
  // Paid: both the product and the lot count the bags as sold.
  await attachPaymentIntent(db, first, "pi_brazil_1");
  assert.equal(await finish(db, first, "pi_brazil_1", "paid"), true);
  assert.deepEqual(db.store.get(`inventory/${REGULAR}`), { ready: 0, held: 0, sold: 10 });
  assert.deepEqual(db.store.get(`inventoryLots/${LOT}`), { ready: 2, held: 1, sold: 10 });
  assert.equal(await finish(db, first, "pi_brazil_1", "paid"), false, "a Stripe resend changes nothing");
  assert.deepEqual(db.store.get(`inventoryLots/${LOT}`), { ready: 2, held: 1, sold: 10 });
});

test("a canceled or failed checkout gives the lot back too", async () => {
  const db = fakeFirestore(stock());
  const canceled = await checkout(db, [{ id: ZEN, quantity: 2 }, { id: REGULAR, quantity: 4 }]);
  assert.equal(db.store.get(`inventoryLots/${LOT}`).held, 6);
  await attachPaymentIntent(db, canceled, "pi_brazil_2");
  await finish(db, canceled, "pi_brazil_2", "released");
  assert.deepEqual(db.store.get(`inventoryLots/${LOT}`), { ready: 12, held: 0, sold: 0 });
  const failed = await checkout(db, [{ id: REGULAR, quantity: 3 }]);
  assert.equal(await releaseWithoutPayment(db, failed), true);
  assert.deepEqual(db.store.get(`inventoryLots/${LOT}`), { ready: 12, held: 0, sold: 0 });
  assert.deepEqual(db.store.get(`inventory/${REGULAR}`), { ready: 10, held: 0, sold: 0 });
});

test("without a lot record, the Brazil products are not sold (never counted as 15 + 15)", async () => {
  const initial = stock();
  delete initial[`inventoryLots/${LOT}`];
  const db = fakeFirestore(initial);
  await assert.rejects(checkout(db, [{ id: ZEN, quantity: 1 }]), /OUT_OF_STOCK/);
  await assert.rejects(checkout(db, [{ id: REGULAR, quantity: 1 }]), /OUT_OF_STOCK/);
  assert.deepEqual(await availability(db, [ZEN, REGULAR], lotOf), { [ZEN]: 0, [REGULAR]: 0 });
  assert.equal(db.store.get(`inventory/${ZEN}`).held, 0, "nothing was held");
  // Other products are unaffected.
  const other = fakeFirestore({ "inventory/enma-jimma": { ready: 15, held: 0, sold: 0 } });
  assert.ok(await checkout(other, [{ id: "enma-jimma", quantity: 15 }]));
});
