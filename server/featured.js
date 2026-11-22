"use strict";

// 「今、飲んでほしい珈琲」: the permanent featured slot at the top left of the coffee list (CEO, 2026-11-22).
// The slot always sells 100 g at ¥1,000 incl. tax; the coffee in it changes with stock and purchasing. The one setting is
// `product` in server/featured-coffee.json (read here and by src/productData.js); docs/featured-coffee.md has the steps.
//
// The featured coffee is its own product: SKU "enma-featured-<product without enma->", own price, own stock record
// (inventory/{sku}), own orders and sales history. While a coffee is featured, its regular product is not sold (hidden in
// the store and refused by the server), so the same beans are never offered twice at two prices and nothing is counted
// twice. Bags move between the two only through the featured stock transfer (server/featured-stock.js), in one
// transaction. The featured product is never in a lot (not mixed with the Brazil lot or any other) and never a
// subscription bean.
// Purchase limit (CEO, 2026-11-22): at most 2 bags per customer in total, counting every featured coffee, past ones
// included. The featured SKU is therefore a promotional bean (promo: true): the existing per-customer promoLedger
// (server/promo.js, keyed by e-mail and delivery address, not by product) counts it together with every earlier featured
// SKU and the earlier recommendation 禅の深煎り, held and settled in the same transaction as the stock. The regular
// product it comes from is never promotional, so the limit never reaches the regular shelf.

const FEATURED_SKU_PREFIX = "enma-featured-";
const FEATURED_PRICE_YEN = 1000; // fixed by the CEO: the slot is always 100 g at ¥1,000 incl. tax
const FEATURED_CONTENT_G = 100;
const LANGS = ["ja", "en", "es"];

const featuredSkuOf = (product) => FEATURED_SKU_PREFIX + String(product).replace(/^enma-/, "");

// "enma-featured-andes-blue" -> "enma-andes-blue" (any featured SKU, current or earlier), or null.
function sourceOfFeaturedSku(sku) {
  const match = /^enma-featured-([a-z0-9-]{1,70})$/.exec(String(sku || ""));
  return match ? `enma-${match[1]}` : null;
}

class FeaturedConfigError extends Error {}
const refuse = (why) => { throw new FeaturedConfigError(`FEATURED_CONFIG_INVALID: ${why}`); };

// Checks the setting against the regular catalogue. Fails closed: a wrong setting stops the server from starting
// (and fails CI) rather than selling something at the wrong price.
function validateFeatured(config, baseCatalog) {
  if (!config || typeof config !== "object") refuse("missing");
  const product = config.product;
  if (typeof product !== "string" || !/^enma-[a-z0-9-]{1,70}$/.test(product) || product.startsWith(FEATURED_SKU_PREFIX)) refuse("product");
  if (config.priceYen !== FEATURED_PRICE_YEN) refuse("the featured price is always 1000");
  if (config.contentG !== FEATURED_CONTENT_G) refuse("the featured bag is always 100 g");
  for (const lang of LANGS) if (typeof config.label?.[lang] !== "string" || !config.label[lang].trim()) refuse(`label.${lang}`);
  const base = Object.prototype.hasOwnProperty.call(baseCatalog, product) ? baseCatalog[product] : null;
  if (!base) refuse(`${product} is not in the catalogue`);
  if (base.kind !== "beans" || base.contentG !== FEATURED_CONTENT_G || base.flatMail !== true) refuse(`${product} is not a 100 g bag of beans`);
  if (base.availableForSale !== true) refuse(`${product} is not on sale (sold out or archived)`);
  if (base.managedStock !== true) refuse(`${product} has no counted stock`);
  if (base.promo === true) refuse(`${product} is a promotional bean (2-bag limit)`);
  if (base.lot) refuse(`${product} shares a lot with other products`);
  const sku = featuredSkuOf(product);
  if (Object.prototype.hasOwnProperty.call(baseCatalog, sku)) refuse(`${sku} already exists`);
  return { product, sku, priceYen: FEATURED_PRICE_YEN, contentG: FEATURED_CONTENT_G, label: { ...config.label } };
}

// The regular catalogue plus the featured slot: the featured SKU on sale at ¥1,000, its regular product off sale.
function withFeatured(baseCatalog, config) {
  const featured = validateFeatured(config, baseCatalog);
  const base = baseCatalog[featured.product];
  const catalog = {
    ...baseCatalog,
    [featured.product]: Object.freeze({ ...base, availableForSale: false, featuredAs: featured.sku }),
    [featured.sku]: Object.freeze({
      price: featured.priceYen, weightG: base.weightG, kind: "beans", contentG: featured.contentG, flatMail: true,
      availableForSale: true, managedStock: true, requiresInventory: true, promo: true, featured: true, featuredFrom: featured.product,
    }),
  };
  return { catalog: Object.freeze(catalog), featured: Object.freeze(featured) };
}

module.exports = {
  FEATURED_SKU_PREFIX, FEATURED_PRICE_YEN, FEATURED_CONTENT_G, FeaturedConfigError,
  featuredSkuOf, sourceOfFeaturedSku, validateFeatured, withFeatured,
};
