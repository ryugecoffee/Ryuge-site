"use strict";

// Server-side catalogue for one-time checkout (2026-11-17).
// The payment amount is always computed from these prices and weights, never from the browser cart: before this,
// production (inventory off) charged whatever price the browser sent, and a browser-sent `category: "subscription"`
// made domestic shipping free. Keep in step with src/productData.js (a test checks the two agree).
// availableForSale: false keeps "coming soon" and archived products unpurchasable even if a cart still holds them.
// kind: "beans" (100 g roasted coffee; international orders allow beans only), "bag" (drip bags), "tea".
// contentG: coffee/tea weight in grams (the international 600 g limit); weightG: packed item weight for shipping.
// promo: a promotional bean (at most 2 bags per order and per customer); change it here and in src/productData.js.
// requiresInventory: sold only while inventory is on (a sales cap must hold; with inventory off it is not purchasable).
// lot: products roasted from the same purchase of green beans share inventoryLots/{lot} (what can really be roasted);
// each product keeps its own sales cap in inventory/{sku}. An order must fit both (server/inventory.js).
// flatMail: a flat 100 g bag of beans: 1–2 of them go by flat mail (レターパックライト for now), 3+ by ゆうパック
// (server/domestic-shipping.js).
// managedStock: true = sold from counted, packed bags (inventory/{sku}); with inventory on, checkout reserves them and
// refuses past zero. Others are not stock-gated. Must equal INVENTORY_MANAGED_SKUS in src/pages/ProductsPage.jsx.
const { validItems } = require("./inventory");

const CATALOG = Object.freeze({
  // CEO final prices (2026-11-17). The Brazil Amarelo Bourbon is sold as two products from the same green beans: the
  // promotional "Zen dark roast" (¥1,000, 2 per customer) and the regular medium-dark roast (¥1,300). They have their
  // own sales caps, orders and promo rules, and share one lot so together they never sell more than can be roasted.
  "enma-zen-dark-roast": { price: 1000, weightG: 120, kind: "beans", contentG: 100, flatMail: true, availableForSale: false, managedStock: true, requiresInventory: true, promo: true, lot: "brazil-amarelo-bourbon" },
  "enma-amarelo-bourbon": { price: 1300, weightG: 120, kind: "beans", contentG: 100, flatMail: true, availableForSale: false, managedStock: true, requiresInventory: true, lot: "brazil-amarelo-bourbon" },
  "enma-jimma": { price: 1500, weightG: 120, kind: "beans", contentG: 100, flatMail: true, availableForSale: true, managedStock: true, requiresInventory: true },
  "enma-quequesques": { price: 1000, weightG: 120, kind: "beans", contentG: 100, flatMail: true, availableForSale: true, managedStock: true, requiresInventory: true },
  "enma-andes-blue": { price: 1500, weightG: 120, kind: "beans", contentG: 100, flatMail: true, availableForSale: true, managedStock: true, requiresInventory: true },
  "enma-karamo": { price: 1800, weightG: 120, kind: "beans", contentG: 100, flatMail: true, availableForSale: true, managedStock: true },
  "enma-kindiio": { price: 2050, weightG: 120, kind: "beans", contentG: 100, flatMail: true, availableForSale: true, managedStock: true },
  // CEO 2026-11-17: counted stock (20 packs of 8). Managed, but not requiresInventory: still sold while inventory is off.
  // 閻魔 珈琲袋 (8 drip bags; formerly called 珈琲バッグ（折々）). Over 3 cm thick: never Letter Pack Light (not flatMail);
  // レターパックプラス if it fits, otherwise ゆうパック (docs/domestic-shipping.md).
  "enma-coffee-bag": { price: 2400, weightG: 100, kind: "bag", contentG: 100, availableForSale: true, managedStock: true },
  "woodbox-tea-bag": { price: 2800, weightG: 120, kind: "tea", contentG: 100, availableForSale: true },
  "woodbox-geisha": { price: 2600, weightG: 170, kind: "beans", contentG: 100, availableForSale: false },
  "woodbox-ecuador": { price: 3000, weightG: 170, kind: "beans", contentG: 100, availableForSale: false },
  // 木函のお茶 (CEO 2026-11-20): 5 of each, never more (inventory/{sku}; sold only while inventory is on). weightG: wooden
  // box 81.2 g + tea 30 g + 5 g margin = 116.2 g → 120 g provisional (packing material not measured yet). Over 3 cm thick:
  // never Letter Pack Light (not flatMail); the customer pays the regional fee, the shop sends it by レターパックプラス
  // if it fits and closes properly, otherwise ゆうパック (checked before posting).
  "mokkan-oku-yame-hojicha": { price: 2800, weightG: 120, kind: "tea", contentG: 30, availableForSale: true, managedStock: true, requiresInventory: true },
  "mokkan-oku-yame-genmaicha": { price: 2800, weightG: 120, kind: "tea", contentG: 30, availableForSale: true, managedStock: true, requiresInventory: true },
});

// Browser cart -> priced items. Only id and quantity are taken from the browser.
// Throws INVALID_ITEMS, UNKNOWN_PRODUCT or PRODUCT_NOT_AVAILABLE (answered as 400, nothing is charged).
function priceItems(items, catalog = CATALOG) {
  return validItems(items).map(({ id, quantity }) => {
    const product = Object.prototype.hasOwnProperty.call(catalog, id) ? catalog[id] : null;
    if (!product) throw new Error("UNKNOWN_PRODUCT");
    if (!product.availableForSale) throw new Error("PRODUCT_NOT_AVAILABLE");
    return { id, quantity, price: product.price, weightG: product.weightG, kind: product.kind, contentG: product.contentG, promo: product.promo === true,
      requiresInventory: product.requiresInventory === true, flatMail: product.flatMail === true };
  });
}

// "sku:qty@unitPrice,..." for the PaymentIntent metadata (Stripe allows 500 characters per value), so the paid order
// can be recorded from Stripe's own event, at the price charged, without trusting the browser.
function itemsMetadata(items) {
  const value = items.map(({ id, quantity, price }) => `${id}:${quantity}@${price}`).join(",");
  if (value.length > 500) throw new Error("INVALID_ITEMS");
  return value;
}

// The part of a priced cart that is sold from counted stock (what checkout reserves with inventory on).
function managedItems(items, catalog = CATALOG) {
  return items.filter(({ id }) => catalog[id]?.managedStock === true).map(({ id, quantity }) => ({ id, quantity }));
}

// sku -> its lot (or null).
function lotOf(id, catalog = CATALOG) {
  return Object.prototype.hasOwnProperty.call(catalog, id) ? catalog[id].lot || null : null;
}

// The managed part of a priced cart, summed per lot: [{ id: lot, quantity }] (what checkout holds in inventoryLots).
function lotItems(items, catalog = CATALOG) {
  const totals = new Map();
  for (const { id, quantity } of managedItems(items, catalog)) {
    const lot = lotOf(id, catalog);
    if (lot) totals.set(lot, (totals.get(lot) || 0) + quantity);
  }
  return [...totals].map(([id, quantity]) => ({ id, quantity }));
}

module.exports = { CATALOG, priceItems, itemsMetadata, managedItems, lotOf, lotItems };
