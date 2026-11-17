"use strict";

// 2026-11-17: production (inventory off) charged the price the browser sent. Checkout now prices every cart from
// server/catalog.js; these tests pin that and keep the catalogue in step with the storefront's product data.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CATALOG, priceItems, itemsMetadata } = require("./catalog");
const { calcShipping } = require("./shipping");

test("the browser's price, weight and category are ignored; only id and quantity are used", () => {
  const tampered = [
    { id: "enma-karamo", quantity: 2, price: 1, weightG: 0, category: "subscription" },
    { id: "enma-kindiio", quantity: 1, price: 0 },
  ];
  const priced = priceItems(tampered);
  assert.deepEqual(priced, [
    { id: "enma-karamo", quantity: 2, price: 1800, weightG: 120 },
    { id: "enma-kindiio", quantity: 1, price: 2050, weightG: 120 },
  ]);
  const subtotal = priced.reduce((sum, item) => sum + item.price * item.quantity, 0);
  assert.equal(subtotal, 5650);
  assert.equal(calcShipping([priced[1]], "JP"), 200, "one bag in Japan pays shipping even if the browser says subscription");
  assert.equal(itemsMetadata(priced), "enma-karamo:2@1800,enma-kindiio:1@2050");
});

test("products not on sale, unknown ids and malformed carts are refused before anything is charged", () => {
  assert.throws(() => priceItems([{ id: "enma-jimma", quantity: 1, price: 1300 }]), /PRODUCT_NOT_AVAILABLE/);
  assert.throws(() => priceItems([{ id: "woodbox-geisha", quantity: 1 }]), /PRODUCT_NOT_AVAILABLE/);
  assert.throws(() => priceItems([{ id: "no-such-bean", quantity: 1 }]), /UNKNOWN_PRODUCT/);
  assert.throws(() => priceItems([{ id: "constructor", quantity: 1 }]), /UNKNOWN_PRODUCT/);
  assert.throws(() => priceItems([]), /INVALID_ITEMS/);
  assert.throws(() => priceItems([{ id: "enma-karamo", quantity: 0 }]), /INVALID_ITEMS/);
  assert.throws(() => priceItems([{ id: "enma-karamo", quantity: 1 }, { id: "enma-karamo", quantity: 1 }]), /INVALID_ITEMS/);
});

test("the server catalogue matches the storefront: same price, and on sale exactly when the shop sells it", async () => {
  const { PRODUCT_DATA } = await import(path.join(__dirname, "..", "src", "productData.js"));
  const shop = new Map();
  const walk = (value) => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!value || typeof value !== "object") return;
    if (value.id && value.priceNumber !== undefined && ["beans", "woodbox", "bag", "tea-bag"].includes(value.category) && !shop.has(value.id)) {
      shop.set(value.id, value);
    }
    Object.values(value).forEach(walk);
  };
  walk(PRODUCT_DATA);
  assert.ok(shop.size >= 10);
  for (const [id, product] of shop) {
    assert.ok(CATALOG[id], `${id} is missing from server/catalog.js`);
    assert.equal(CATALOG[id].price, product.priceNumber, `${id} price`);
    const onSale = !product.comingSoon && !product.archived && !product.isSoldOut;
    assert.equal(CATALOG[id].availableForSale, onSale, `${id} on sale`);
  }
  for (const id of Object.keys(CATALOG)) assert.ok(shop.has(id), `${id} is not in the storefront`);
});

test("checkout always prices from the catalogue, with inventory on or off", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const route = source.slice(source.indexOf('app.post("/create-payment-intent"'), source.indexOf('app.post("/calc-shipping"'));
  assert.match(route, /safeItems = priceItems\(items\);/);
  assert.doesNotMatch(route, /Array\.isArray\(items\) \? items : \[\]/, "the browser cart is never used as is");
  assert.ok(route.indexOf("priceItems(items)") < route.indexOf("if (INVENTORY_ENABLED"), "priced before any inventory branch");
  assert.match(route, /items: itemsMetadata\(safeItems\),/);
});
