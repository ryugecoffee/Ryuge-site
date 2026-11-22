"use strict";

// 2026-11-22 (CEO, final): 「今、飲んでほしい珈琲」, the permanent featured slot (server/featured.js,
// server/featured-coffee.json, server/featured-stock.js, docs/featured-coffee.md). One coffee, top left, always 100 g at
// ¥1,000 incl. tax, at most 2 bags per customer in total (every featured coffee and the earlier 禅の深煎り counted
// together). Now: Guatemala Quequesques. Its own SKU, price, stock and sales history; the same beans are never sold on
// the regular shelf meanwhile. Peru Andes Blue is a regular ¥1,500 coffee without the limit; 禅の深煎り is gone from the
// list (history kept); the regular Brazil stays listed as sold out.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const CONFIG = require("./featured-coffee.json");
const { CATALOG, BASE_CATALOG, FEATURED, priceItems, itemsMetadata, managedItems, lotItems } = require("./catalog");
const { withFeatured, validateFeatured, featuredSkuOf, sourceOfFeaturedSku, FEATURED_PRICE_YEN } = require("./featured");
const { quoteOrder, QuoteError, PROMO_MAX_BAGS } = require("./quote");
const { parseItemsMetadata } = require("./orders");
const { reserve, attachPaymentIntent, finish, availability, releaseWithoutPayment } = require("./inventory");
const { promoKeys } = require("./promo");
const { allowedPaths } = require("./initial-stock");
const { validTransfer, previewFeaturedTransfer, applyFeaturedTransfer, LOG_COLLECTION } = require("./featured-stock");

const SKU = "enma-featured-quequesques";
const GUATEMALA = "enma-quequesques";
const PERU = "enma-andes-blue";
const ZEN = "enma-zen-dark-roast";
const AMARELO = "enma-amarelo-bourbon";
const LABEL = { ja: "今、飲んでほしい珈琲", en: "Coffee We Recommend Now", es: "El café que recomendamos ahora" };
const storefront = () => import(path.join(__dirname, "..", "src", "productData.js"));
const hanako = { email: "Hanako.Yamada+coffee@gmail.com", countryCode: "JP", postalCode: "248-0006", address: "神奈川県 鎌倉市小町1-1" };
const claim = (who, quantity) => ({ keys: promoKeys(who), quantity, limit: PROMO_MAX_BAGS });

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
        update(ref, patch) { writes.push(() => { if (!store.has(ref.key)) throw new Error("NOT_FOUND"); store.set(ref.key, { ...store.get(ref.key), ...patch }); }); },
        create(ref, value) { writes.push(() => { if (store.has(ref.key)) throw new Error("ALREADY_EXISTS"); store.set(ref.key, value); }); },
      };
      const result = await callback(tx);
      writes.forEach((write) => write());
      return result;
    },
  };
}
const stock = (db, sku) => { const s = db.store.get(`inventory/${sku}`); return s && { ready: s.ready, held: s.held, sold: s.sold }; };
const paid = async (db, items, promo, pi) => {
  const id = await reserve(db, items, null, promo);
  await attachPaymentIntent(db, id, pi);
  assert.equal(await finish(db, id, pi, "paid"), true);
};

test("the setting: Guatemala Quequesques in the slot, 100 g, ¥1,000, the label in ja/en/es", () => {
  assert.equal(CONFIG.product, GUATEMALA);
  assert.deepEqual([CONFIG.priceYen, CONFIG.contentG, FEATURED_PRICE_YEN, PROMO_MAX_BAGS], [1000, 100, 1000, 2]);
  assert.deepEqual(CONFIG.label, LABEL);
  assert.deepEqual(FEATURED, { product: GUATEMALA, sku: SKU, priceYen: 1000, contentG: 100, label: LABEL });
  assert.equal(featuredSkuOf(GUATEMALA), SKU);
  assert.equal(sourceOfFeaturedSku(SKU), GUATEMALA);
  assert.equal(sourceOfFeaturedSku(GUATEMALA), null);
});

test("server: the featured SKU at ¥1,000 with the 2-bag limit; regular Guatemala off sale; Peru regular ¥1,500; Brazil refused", () => {
  const f = CATALOG[SKU];
  assert.deepEqual([f.price, f.contentG, f.kind, f.flatMail, f.availableForSale, f.managedStock, f.requiresInventory, f.promo], [1000, 100, "beans", true, true, true, true, true]);
  assert.equal(f.lot, undefined, "no shared lot");
  assert.deepEqual([CATALOG[GUATEMALA].availableForSale, CATALOG[GUATEMALA].promo], [false, undefined], "the same beans are not sold twice");
  assert.deepEqual([CATALOG[PERU].price, CATALOG[PERU].availableForSale, CATALOG[PERU].promo], [1500, true, undefined], "Peru: regular, no limit");
  assert.deepEqual([CATALOG[AMARELO].price, CATALOG[AMARELO].availableForSale], [1300, false]);
  assert.deepEqual([CATALOG[ZEN].availableForSale, CATALOG[ZEN].promo, CATALOG[ZEN].lot], [false, true, "brazil-amarelo-bourbon"], "kept for its orders, never sold");
  for (const id of Object.keys(BASE_CATALOG)) if (id !== GUATEMALA) assert.deepEqual(CATALOG[id], BASE_CATALOG[id], `${id} unchanged`);
});

test("payment amount (Stripe PaymentIntent = quoteOrder) and the order record: ¥1,000 per bag, at most 2 in an order", () => {
  const one = quoteOrder([{ id: SKU, quantity: 1, price: 1 }], { prefecture: "東京都" });
  assert.deepEqual([one.subtotal, one.shipping, one.total, one.shippingDetail.method], [1000, 250, 1250, "letterpack_light"]);
  assert.equal(itemsMetadata(one.items), `${SKU}:1@1000`, "PaymentIntent metadata, read back by the webhook");
  assert.deepEqual(parseItemsMetadata(itemsMetadata(one.items)), [{ id: SKU, quantity: 1, unitPrice: 1000 }]);
  assert.equal(quoteOrder([{ id: SKU, quantity: 1 }], { prefecture: "沖縄県" }).total, 1250);
  assert.equal(quoteOrder([{ id: SKU, quantity: 2 }], { prefecture: "北海道" }).total, 2000 + 250);
  assert.throws(() => quoteOrder([{ id: SKU, quantity: 3 }], { prefecture: "東京都" }), (e) => e instanceof QuoteError && e.code === "PROMO_LIMIT");
  // Peru is not limited: 2 featured + 3 Peru is fine (5 bags by Yu-Pack, Tokyo ¥250).
  assert.equal(quoteOrder([{ id: SKU, quantity: 2 }, { id: PERU, quantity: 3 }], { prefecture: "東京都" }).total, 2000 + 4500 + 250);
  assert.equal(quoteOrder([{ id: PERU, quantity: 4 }], { prefecture: "東京都" }).total, 6000 + 250);
  assert.equal(quoteOrder([{ id: SKU, quantity: 2 }], { countryCode: "TW" }).subtotal, 2000);
  // Regular Guatemala, the Brazil products or an unknown featured SKU: refused before any payment.
  for (const cart of [[{ id: GUATEMALA, quantity: 1 }], [{ id: SKU, quantity: 1 }, { id: GUATEMALA, quantity: 1 }], [{ id: ZEN, quantity: 1 }], [{ id: AMARELO, quantity: 1 }]]) {
    assert.throws(() => quoteOrder(cart, { prefecture: "東京都" }), (e) => e instanceof QuoteError && e.code === "PRODUCT_NOT_AVAILABLE");
  }
  assert.throws(() => quoteOrder([{ id: "enma-featured-andes-blue", quantity: 1 }], { prefecture: "東京都" }), /UNKNOWN_PRODUCT/);
  // /create-payment-intent builds the per-customer claim from every promo item, so the featured bags are always claimed.
  const route = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  assert.match(route, /const promoQuantity = quote\.items\.filter\(\(item\) => item\.promo\)\.reduce\(\(sum, item\) => sum \+ item\.quantity, 0\);/);
  assert.match(route, /promo = \{ keys, quantity: promoQuantity, limit: PROMO_MAX_BAGS \};/);
});

test("2 bags per customer in total: earlier featured coffees and 禅の深煎り count; Peru never does", async () => {
  const db = fakeFirestore({
    [`inventory/${SKU}`]: { ready: 10, held: 0, sold: 0 },
    [`inventory/${ZEN}`]: { ready: 5, held: 0, sold: 0 },
    "inventory/enma-featured-andes-blue": { ready: 5, held: 0, sold: 0 },
    [`inventory/${PERU}`]: { ready: 10, held: 0, sold: 0 },
  });
  // Hanako bought 2 禅の深煎り before (the earlier recommendation): no featured bag any more, by e-mail or by address.
  await paid(db, [{ id: ZEN, quantity: 2 }], claim(hanako, 2), "pi_zen_past");
  await assert.rejects(reserve(db, [{ id: SKU, quantity: 1 }], null, claim(hanako, 1)), /PROMO_CUSTOMER_LIMIT/);
  await assert.rejects(reserve(db, [{ id: SKU, quantity: 1 }], null, claim({ ...hanako, email: "other@example.com" }, 1)), /PROMO_CUSTOMER_LIMIT/);
  // Peru is a regular coffee: no claim, so she can still buy it.
  const peruItems = priceItems([{ id: PERU, quantity: 3 }]);
  assert.equal(peruItems.some((item) => item.promo), false);
  assert.ok(await reserve(db, managedItems(peruItems)));
  // Taro bought 1 bag of an earlier featured coffee (Peru, when it was featured): 1 more featured bag, not 2.
  const taro = { email: "taro@example.com", countryCode: "JP", postalCode: "100-0001", address: "東京都千代田区千代田1-1" };
  await paid(db, [{ id: "enma-featured-andes-blue", quantity: 1 }], claim(taro, 1), "pi_featured_past");
  await assert.rejects(reserve(db, [{ id: SKU, quantity: 2 }], null, claim(taro, 2)), /PROMO_CUSTOMER_LIMIT/);
  const taroNow = await reserve(db, [{ id: SKU, quantity: 1 }], null, claim(taro, 1));
  assert.ok(taroNow);
  await assert.rejects(reserve(db, [{ id: SKU, quantity: 1 }], null, claim(taro, 1)), /PROMO_CUSTOMER_LIMIT/, "a held bag counts until settled");
  // A failed payment gives the claim back; nothing was sold from the featured stock.
  assert.equal(await releaseWithoutPayment(db, taroNow), true);
  assert.deepEqual(stock(db, SKU), { ready: 10, held: 0, sold: 0 });
  assert.ok(await reserve(db, [{ id: SKU, quantity: 1 }], null, claim(taro, 1)));
});

test("checkout holds only the featured stock record, never the regular Guatemala or any lot", async () => {
  const db = fakeFirestore({
    [`inventory/${SKU}`]: { ready: 3, held: 0, sold: 0 },
    [`inventory/${GUATEMALA}`]: { ready: 5, held: 0, sold: 7 },
  });
  const items = priceItems([{ id: SKU, quantity: 2 }]);
  assert.deepEqual(lotItems(items), []);
  const reservation = await reserve(db, managedItems(items), null, claim(hanako, 2), lotItems(items));
  await assert.rejects(reserve(db, [{ id: SKU, quantity: 2 }]), /OUT_OF_STOCK/, "only 1 left in the featured record");
  assert.deepEqual(await availability(db, [SKU, GUATEMALA]), { [SKU]: 1, [GUATEMALA]: 5 });
  await attachPaymentIntent(db, reservation, "pi_featured_1");
  assert.equal(await finish(db, reservation, "pi_featured_1", "paid"), true);
  assert.deepEqual(stock(db, SKU), { ready: 1, held: 0, sold: 2 }, "the featured sales history");
  assert.deepEqual(stock(db, GUATEMALA), { ready: 5, held: 0, sold: 7 }, "the regular Guatemala is untouched");
  // No featured stock record: not sold at all (never borrows the regular stock).
  await assert.rejects(reserve(fakeFirestore({ [`inventory/${GUATEMALA}`]: { ready: 15, held: 0, sold: 0 } }), [{ id: SKU, quantity: 1 }]), /OUT_OF_STOCK/);
});

test("never a subscription bean, and never registered as initial stock (bags only arrive by transfer)", () => {
  const { beanOf, validBeans } = require("./coffee-subscription-fulfillment");
  assert.equal(beanOf(SKU), null);
  assert.throws(() => validBeans([SKU, "enma-jimma"]), /NOT_A_SUBSCRIPTION_BEAN/);
  assert.deepEqual(beanOf(GUATEMALA), { sku: GUATEMALA, lot: null }, "the regular Guatemala's own bags can still go to subscribers");
  assert.ok(allowedPaths().includes(`inventory/${GUATEMALA}`));
  assert.ok(!allowedPaths().includes(`inventory/${SKU}`));
});

test("store: Guatemala featured top left; Peru regular without the badge; 禅の深煎り gone; regular Brazil sold out", async () => {
  const { PRODUCT_DATA, FEATURED_COFFEE } = await storefront();
  assert.deepEqual(FEATURED_COFFEE, { product: GUATEMALA, sku: SKU, priceNumber: 1000, label: LABEL });
  const listed = PRODUCT_DATA.enma.filter((p) => !p.hidden);
  const byId = Object.fromEntries(PRODUCT_DATA.enma.map((p) => [p.id, p]));
  const [first] = listed;
  assert.deepEqual([first.id, first.price, first.priceNumber, first.size, first.featuredFrom], [SKU, "¥1,000", 1000, "100g", GUATEMALA]);
  assert.deepEqual(first.promotion, { active: true, label: LABEL });
  assert.deepEqual([first.promo, first.isSoldOut, first.comingSoon, first.requiresInventory], [true, false, false, true]);
  for (const key of ["title", "roast", "origin", "process", "flavorNotes", "image", "notice"]) assert.deepEqual(first[key], byId[GUATEMALA][key], key);
  assert.equal(first.roast.ja, "浅煎り");
  // One badge only, and each coffee once.
  assert.deepEqual(listed.filter((p) => p.promotion?.active).map((p) => p.id), [SKU]);
  assert.deepEqual([byId[GUATEMALA].hidden, byId[GUATEMALA].featuredAs], [true, SKU]);
  assert.ok(!listed.some((p) => p.id === GUATEMALA), "not shown on the regular shelf too");
  const peru = listed.find((p) => p.id === PERU);
  assert.deepEqual([peru.priceNumber, peru.promo, peru.promotion, peru.isSoldOut, peru.roast.ja], [1500, undefined, undefined, false, "浅煎り"]);
  assert.ok(!listed.some((p) => p.id === ZEN), "禅の深煎り is not listed");
  assert.deepEqual([byId[ZEN].hidden, byId[ZEN].isSoldOut], [true, true], "kept only for past orders' names");
  const amarelo = listed.find((p) => p.id === AMARELO);
  assert.deepEqual([amarelo.priceNumber, amarelo.isSoldOut, amarelo.roast.ja], [1300, true, "中深煎り"]);
  // The page lists only these, stock-checks the featured SKU; the concierge does not suggest hidden products.
  const page = fs.readFileSync(path.join(__dirname, "..", "src", "pages", "ProductsPage.jsx"), "utf8");
  assert.match(page, /const listedEnma = products\.enma\.filter\(\(item\) => !item\.hidden\);/);
  assert.match(page, /\{listedEnma\.map\(\(item\) => \(/);
  assert.doesNotMatch(page, /\{products\.enma\.map\(/);
  assert.match(page, /const maxQuantity = \(item\) => Math\.min\(item\?\.promo \? PROMO_MAX_BAGS : 50,/, "2 at most in the cart");
  const concierge = fs.readFileSync(path.join(__dirname, "..", "api", "coffee-concierge.js"), "utf8");
  assert.match(concierge, /\(PRODUCT_DATA\.enma \|\| \[\]\)\.filter\(\(p\) => !p\.hidden\)\.forEach/);
  // The limit messages name the slot, in every language.
  const policy = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "shippingPolicy.js"), "utf8");
  assert.match(policy, /PROMO_CUSTOMER_LIMIT: "「今、飲んでほしい珈琲」は、お一人様2袋までです（これまでのおすすめ枠のご注文を含みます）。"/);
  assert.match(policy, /PROMO_CUSTOMER_LIMIT: "“Coffee We Recommend Now” is limited to 2 bags per customer/);
  assert.match(policy, /PROMO_CUSTOMER_LIMIT: "«El café que recomendamos ahora» está limitado a 2 bolsas por cliente/);
});

test("changing the coffee is one setting; settings that would mix with lots, sold-out or other prices are refused", () => {
  // Example: Peru in the slot instead. Its own SKU at ¥1,000 with the limit; Guatemala back on the regular shelf.
  const { catalog, featured } = withFeatured(BASE_CATALOG, { ...CONFIG, product: PERU });
  assert.equal(featured.sku, "enma-featured-andes-blue");
  assert.deepEqual([catalog["enma-featured-andes-blue"].price, catalog["enma-featured-andes-blue"].promo, catalog[PERU].availableForSale], [1000, true, false]);
  assert.deepEqual([catalog[GUATEMALA].price, catalog[GUATEMALA].availableForSale], [1000, true]);
  assert.equal(catalog[SKU], undefined, "the earlier featured SKU is no longer sold");
  // The roast is not fixed: it is whatever the coffee is.
  assert.equal(withFeatured(BASE_CATALOG, { ...CONFIG, product: "enma-kindiio" }).catalog["enma-featured-kindiio"].price, 1000);
  const refused = (config, why) => assert.throws(() => validateFeatured(config, BASE_CATALOG), /FEATURED_CONFIG_INVALID/, why);
  refused({ ...CONFIG, product: ZEN }, "removed, sold out and in the Brazil lot");
  refused({ ...CONFIG, product: AMARELO }, "sold out and in the Brazil lot");
  refused({ ...CONFIG, product: "enma-coffee-bag" }, "not a 100 g bag of beans");
  refused({ ...CONFIG, product: "woodbox-geisha" }, "not ENMA");
  refused({ ...CONFIG, product: "enma-nope" }, "unknown");
  refused({ ...CONFIG, product: SKU }, "a featured SKU itself");
  refused({ ...CONFIG, priceYen: 1200 }, "the price is always ¥1,000");
  refused({ ...CONFIG, contentG: 200 }, "always 100 g");
  refused({ ...CONFIG, label: { ja: LABEL.ja, en: LABEL.en } }, "every language");
  refused(null, "missing");
});

test("stock transfer: only free bags move, in one transaction, between a coffee and its featured product", async () => {
  const PROJECT = "ryuge-site";
  const db = fakeFirestore({ [`inventory/${GUATEMALA}`]: { ready: 15, held: 2, sold: 7 } });
  const into = { from: GUATEMALA, to: SKU, quantity: 10 };
  const before = new Map(db.store);
  const preview = await previewFeaturedTransfer(db, into, { projectId: PROJECT });
  assert.deepEqual(db.store, before, "preview writes nothing");
  assert.deepEqual(preview.current, { from: { ready: 15, held: 2, sold: 7 }, to: null });
  assert.deepEqual(preview.after, { from: { ready: 5, held: 2, sold: 7 }, to: { ready: 10, held: 0, sold: 0 } });
  const approve = { projectId: PROJECT, expectedProjectId: PROJECT, planHash: preview.planHash, approval: "CEO承認（テスト）" };
  await assert.rejects(applyFeaturedTransfer(db, into, { ...approve, approval: "" }), /APPROVAL_REQUIRED/);
  await assert.rejects(applyFeaturedTransfer(db, into, { ...approve, expectedProjectId: "other" }), /PROJECT_MISMATCH/);
  await assert.rejects(applyFeaturedTransfer(db, into, { ...approve, planHash: undefined }), /PLAN_HASH_REQUIRED/);
  assert.deepEqual(await applyFeaturedTransfer(db, into, approve), { applied: true, plan: into, after: preview.after });
  assert.deepEqual(stock(db, GUATEMALA), { ready: 5, held: 2, sold: 7 });
  assert.deepEqual(stock(db, SKU), { ready: 10, held: 0, sold: 0 });
  assert.equal(stock(db, GUATEMALA).ready + stock(db, SKU).ready, 15, "the same 15 physical bags, never counted twice");
  assert.ok(db.store.get(`${LOG_COLLECTION}/${preview.planHash}`).approval);
  assert.equal((await applyFeaturedTransfer(db, into, approve)).reason, "ALREADY_APPLIED", "the same approval again changes nothing");
  assert.deepEqual(stock(db, SKU), { ready: 10, held: 0, sold: 0 });
  await assert.rejects(previewFeaturedTransfer(db, { ...into, quantity: 4 }, { projectId: PROJECT }), /NOT_ENOUGH_FREE_STOCK/, "3 free (5 ready, 2 held)");
  const next = await previewFeaturedTransfer(db, { ...into, quantity: 1 }, { projectId: PROJECT });
  db.store.set(`inventory/${GUATEMALA}`, { ready: 5, held: 3, sold: 7 });
  await assert.rejects(applyFeaturedTransfer(db, { ...into, quantity: 1 }, { ...approve, planHash: next.planHash }), /PLAN_CHANGED/);
  const back = { from: SKU, to: GUATEMALA, quantity: 10 };
  const p2 = await previewFeaturedTransfer(db, back, { projectId: PROJECT });
  await applyFeaturedTransfer(db, back, { ...approve, planHash: p2.planHash });
  assert.deepEqual([stock(db, SKU).ready, stock(db, GUATEMALA).ready], [0, 15]);
});

test("stock transfer: no other moves are possible", () => {
  const ok = (t) => assert.deepEqual(validTransfer(t), t);
  const no = (t, code = /TRANSFER_NOT_ALLOWED/) => assert.throws(() => validTransfer(t), code);
  ok({ from: GUATEMALA, to: SKU, quantity: 1 });
  ok({ from: SKU, to: GUATEMALA, quantity: 1 });
  ok({ from: "enma-featured-andes-blue", to: PERU, quantity: 1 }); // an earlier featured SKU can always give its bags back
  no({ from: "enma-jimma", to: SKU, quantity: 1 });
  no({ from: PERU, to: "enma-featured-andes-blue", quantity: 1 }, "not the coffee featured now");
  no({ from: SKU, to: "enma-jimma", quantity: 1 });
  no({ from: ZEN, to: "enma-featured-zen-dark-roast", quantity: 1 });
  no({ from: "enma-featured-nope", to: "enma-nope", quantity: 1 });
  no({ from: GUATEMALA, to: PERU, quantity: 1 });
  no({ from: GUATEMALA, to: SKU, quantity: 0 }, /INVALID_QUANTITY/);
  no({ from: GUATEMALA, to: SKU, quantity: 1.5 }, /INVALID_QUANTITY/);
  no({ from: GUATEMALA, to: SKU, quantity: 1001 }, /INVALID_QUANTITY/);
  no({ from: GUATEMALA, to: GUATEMALA, quantity: 1 }, /INVALID_TRANSFER/);
  no(null, /INVALID_TRANSFER/);
});

test("the transfer route is off unless the inventory admin token is set, and checks it like initial stock", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const route = source.slice(source.indexOf('app.post("/internal/inventory/featured-transfer"'), source.indexOf("// Refunds and partial cancellations"));
  assert.match(route, /const token = process\.env\.INVENTORY_ADMIN_TOKEN;\n\s+if \(!token \|\| token\.length < 32\) return res\.status\(404\)\.end\(\);/);
  assert.match(route, /timingSafeEqual\(digest\(token\), digest\(supplied\)\)/);
  assert.match(route, /featuredStock\.previewFeaturedTransfer\(db, transfer, \{ projectId \}\)/);
  assert.match(route, /featuredStock\.applyFeaturedTransfer\(db, transfer, \{ projectId, expectedProjectId, planHash, approval \}\)/);
});
