"use strict";

// 2026-11-17 (CEO final prices): the Brazil Amarelo Bourbon is sold as two products, the promotional "Zen dark roast"
// and the regular medium-dark roast. Separate SKUs (caps, promo rule, orders), one shared lot (what can be roasted).
// 2026-11-22 (CEO): both Brazil products are sold out (availableForSale: false, no new purchase). The lot, cap, promo
// and reservation rules stay in the code for when the lot is sold again, so they are still tested here on a copy of the
// catalogue with Brazil back on sale (ON_SALE); the real catalogue must refuse Brazil before any payment.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { CATALOG, priceItems, itemsMetadata, managedItems, lotOf, lotItems } = require("./catalog");
const { reserve, attachPaymentIntent, finish, availability, releaseWithoutPayment } = require("./inventory");
const { quoteOrder, QuoteError } = require("./quote");
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
// The catalogue as it was while Brazil was on sale (test only): the same prices, caps, promo rule and lot.
const ON_SALE = Object.freeze({ ...CATALOG, [ZEN]: { ...CATALOG[ZEN], availableForSale: true }, [REGULAR]: { ...CATALOG[REGULAR], availableForSale: true } });
const quoteOnSale = (cart, options) => quoteOrder(cart, options, undefined, ON_SALE);
// Example numbers only: the real caps and lot are set by the CEO (docs/inventory-rollout.md).
const stock = () => ({
  [`inventory/${ZEN}`]: { ready: 10, held: 0, sold: 0 },
  [`inventory/${REGULAR}`]: { ready: 10, held: 0, sold: 0 },
  [`inventoryLots/${LOT}`]: { ready: 12, held: 0, sold: 0 },
});
// What checkout does: the managed part of the priced cart, and the same bags per lot.
const checkout = (db, cart, promo = null) => {
  const items = priceItems(cart, ON_SALE);
  return reserve(db, managedItems(items, ON_SALE), null, promo, lotItems(items, ON_SALE));
};

test("final prices and roasts: the server charges exactly what the store shows", async () => {
  const expected = { [ZEN]: 1000, [REGULAR]: 1300, "enma-jimma": 1500, "enma-quequesques": 1000, "enma-andes-blue": 1500, "enma-karamo": 1800, "enma-kindiio": 2050 };
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
  // The amount charged follows the catalogue (Brazil back on sale): 1 regular + 2 promo + 1 Jimma, Tokyo.
  // 4 bags go by Yu-Pack at the regional fee (Tokyo ¥250, server/domestic-shipping.js).
  const quote = quoteOnSale([{ id: REGULAR, quantity: 1 }, { id: ZEN, quantity: 2 }, { id: "enma-jimma", quantity: 1 }], { prefecture: "東京都" });
  assert.equal(quote.total, 1300 + 2000 + 1500 + 250);
});

test("Guatemala Quequesques (light roast): 100 g at ¥1,000 incl. tax, shown and charged the same (CEO 2026-11-22)", async () => {
  // Sold as 「今、飲んでほしい珈琲」 (its featured SKU, server/featured.js); the regular SKU keeps ¥1,000 for its return.
  const SLOT = "enma-featured-quequesques";
  assert.deepEqual([CATALOG["enma-quequesques"].price, CATALOG[SLOT].price, CATALOG[SLOT].contentG, CATALOG[SLOT].availableForSale], [1000, 1000, 100, true]);
  const { PRODUCT_DATA } = await import(path.join(__dirname, "..", "src", "productData.js"));
  const guatemala = PRODUCT_DATA.enma.find((p) => p.id === SLOT);
  assert.deepEqual([guatemala.price, guatemala.priceNumber, guatemala.size, guatemala.roast.ja, guatemala.isSoldOut], ["¥1,000", 1000, "100g", "浅煎り", false]);
  // What /quote shows and /create-payment-intent charges (both quoteOrder): 1 bag by Letter Pack Light ¥250.
  const one = quoteOrder([{ id: SLOT, quantity: 1, price: 1500 }], { prefecture: "東京都" });
  assert.deepEqual([one.subtotal, one.shipping, one.total], [1000, 250, 1250], "the browser's price is never read");
  assert.equal(itemsMetadata(one.items), `${SLOT}:1@1000`, "the paid order is recorded at ¥1,000");
  const two = quoteOrder([{ id: SLOT, quantity: 2 }], { prefecture: "北海道" });
  assert.deepEqual([two.subtotal, two.total], [2000, 2250]);
});

test("sold out (CEO 2026-11-22): both Brazil products are refused before any payment is created", async () => {
  for (const id of [ZEN, REGULAR]) {
    assert.equal(CATALOG[id].availableForSale, false, id);
    assert.throws(() => priceItems([{ id, quantity: 1 }]), /PRODUCT_NOT_AVAILABLE/, id);
    // Alone or with a product that is on sale, the whole order is refused (400): nothing is quoted, held or charged.
    for (const cart of [[{ id, quantity: 1 }], [{ id: "enma-jimma", quantity: 1 }, { id, quantity: 1 }]]) {
      assert.throws(() => quoteOrder(cart, { prefecture: "東京都" }), (e) => e instanceof QuoteError && e.code === "PRODUCT_NOT_AVAILABLE" && e.status === 400, id);
      assert.throws(() => quoteOrder(cart, { countryCode: "TW" }), (e) => e instanceof QuoteError && e.code === "PRODUCT_NOT_AVAILABLE", `${id} abroad`);
    }
  }
  // The store shows them as sold out (no add to cart) and no longer as the recommended coffee.
  const { PRODUCT_DATA } = await import(path.join(__dirname, "..", "src", "productData.js"));
  for (const id of [ZEN, REGULAR]) {
    const p = PRODUCT_DATA.enma.find((item) => item.id === id);
    assert.equal(p.isSoldOut, true, id);
    assert.notEqual(p.promotion?.active, true, id);
  }
  // /create-payment-intent quotes (and so refuses) before reserving stock or creating the Stripe PaymentIntent.
  const fs = require("node:fs");
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const route = source.slice(source.indexOf('app.post("/create-payment-intent"'), source.indexOf('app.post("/calc-shipping"'));
  const quoted = route.indexOf("quote = quoteRequest(req.body);");
  assert.ok(quoted > 0);
  assert.ok(quoted < route.indexOf("inventory.reserve("), "quoted before stock is held");
  assert.ok(quoted < route.indexOf("paymentIntents.create("), "quoted before Stripe");
  assert.match(source, /function quoteRequest\(body\) \{\n\s+return quoteOrder\(body\?\.items, \{/, "the server never passes a catalogue of its own");
});

test("two SKUs: only the promotional Brazil is limited to 2, and an order records which one was bought", () => {
  assert.equal(CATALOG[ZEN].promo, true);
  assert.notEqual(CATALOG[REGULAR].promo, true);
  assert.throws(() => quoteOnSale([{ id: ZEN, quantity: 3 }], { prefecture: "東京都" }), /PROMO_LIMIT/);
  assert.equal(quoteOnSale([{ id: REGULAR, quantity: 3 }], { prefecture: "東京都" }).total, 3900 + 250, "the regular one is not a promo");
  const items = priceItems([{ id: ZEN, quantity: 2 }, { id: REGULAR, quantity: 1 }], ON_SALE);
  assert.deepEqual(parseItemsMetadata(itemsMetadata(items)), [
    { id: ZEN, quantity: 2, unitPrice: 1000 }, { id: REGULAR, quantity: 1, unitPrice: 1300 },
  ]);
});

test("both Brazil products draw on one lot; other products have none", () => {
  assert.equal(lotOf(ZEN), LOT);
  assert.equal(lotOf(REGULAR), LOT);
  for (const id of ["enma-jimma", "enma-quequesques", "enma-andes-blue", "enma-karamo", "enma-kindiio", "enma-coffee-bag", "nope"]) assert.equal(lotOf(id), null, id);
  assert.deepEqual(lotItems(priceItems([{ id: ZEN, quantity: 2 }, { id: REGULAR, quantity: 3 }, { id: "enma-jimma", quantity: 1 }], ON_SALE), ON_SALE), [{ id: LOT, quantity: 5 }]);
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
