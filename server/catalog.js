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
// managedStock: true = sold from counted, packed bags (inventory/{sku}); with inventory on, checkout reserves them and
// refuses past zero. Others are not stock-gated. Must equal INVENTORY_MANAGED_SKUS in src/pages/ProductsPage.jsx.
const { validItems } = require("./inventory");

const CATALOG = Object.freeze({
  // CEO 2026-11-17: on sale, 15 bags each as the sales cap; Amarelo is the promotional bean (¥1,000, 2 per customer).
  "enma-amarelo-bourbon": { price: 1000, weightG: 120, kind: "beans", contentG: 100, availableForSale: true, managedStock: true, requiresInventory: true, promo: true },
  "enma-jimma": { price: 1300, weightG: 120, kind: "beans", contentG: 100, availableForSale: true, managedStock: true, requiresInventory: true },
  "enma-quequesques": { price: 1300, weightG: 120, kind: "beans", contentG: 100, availableForSale: true, managedStock: true, requiresInventory: true },
  "enma-andes-blue": { price: 1300, weightG: 120, kind: "beans", contentG: 100, availableForSale: true, managedStock: true, requiresInventory: true },
  "enma-karamo": { price: 1800, weightG: 120, kind: "beans", contentG: 100, availableForSale: true, managedStock: true },
  "enma-kindiio": { price: 2050, weightG: 120, kind: "beans", contentG: 100, availableForSale: true, managedStock: true },
  "enma-coffee-bag": { price: 2400, weightG: 100, kind: "bag", contentG: 100, availableForSale: true },
  "woodbox-tea-bag": { price: 2800, weightG: 120, kind: "tea", contentG: 100, availableForSale: true },
  "woodbox-geisha": { price: 2600, weightG: 170, kind: "beans", contentG: 100, availableForSale: false },
  "woodbox-ecuador": { price: 3000, weightG: 170, kind: "beans", contentG: 100, availableForSale: false },
  "mokkan-oku-yame-hojicha": { price: 2800, weightG: 100, kind: "tea", contentG: 100, availableForSale: false },
  "mokkan-oku-yame-genmaicha": { price: 2800, weightG: 100, kind: "tea", contentG: 100, availableForSale: false },
});

// Browser cart -> priced items. Only id and quantity are taken from the browser.
// Throws INVALID_ITEMS, UNKNOWN_PRODUCT or PRODUCT_NOT_AVAILABLE (answered as 400, nothing is charged).
function priceItems(items, catalog = CATALOG) {
  return validItems(items).map(({ id, quantity }) => {
    const product = Object.prototype.hasOwnProperty.call(catalog, id) ? catalog[id] : null;
    if (!product) throw new Error("UNKNOWN_PRODUCT");
    if (!product.availableForSale) throw new Error("PRODUCT_NOT_AVAILABLE");
    return { id, quantity, price: product.price, weightG: product.weightG, kind: product.kind, contentG: product.contentG, promo: product.promo === true,
      requiresInventory: product.requiresInventory === true };
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

module.exports = { CATALOG, priceItems, itemsMetadata, managedItems };
