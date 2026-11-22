"use strict";

// 2026-11-19 CEO decision (final): 100 g bean bags 1–2 → Letter Pack Light ¥250 nationwide; 3–15 → Yu-Pack at the earlier
// regional fee (Honshu/Shikoku ¥250, Hokkaido/Kyushu ¥500, Okinawa ¥550; the shop pays the rest); 16+ → contact;
// other products and international unchanged. The storefront's numbers must equal the server's.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const D = require("./domestic-shipping");
const { quoteOrder, QuoteError } = require("./quote");
const { CATALOG } = require("./catalog");

const bag = (quantity) => ({ quantity, flatMail: true });
const code = (fn) => { try { fn(); return null; } catch (e) { return [e.code, e.contact]; } };
const HOKKAIDO_KYUSHU = ["北海道", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県"];
const regional = (p) => (p === "沖縄県" ? 550 : HOKKAIDO_KYUSHU.includes(p) ? 500 : 250);

test("all 47 prefectures at every boundary: 1, 2 → ¥250 Letter Pack Light; 3, 6, 7, 15 → regional fee by Yu-Pack; 16 → contact", () => {
  assert.equal(D.PREFECTURES.length, 47);
  for (const p of D.PREFECTURES) {
    for (const n of [1, 2]) assert.deepEqual([D.domesticShipping([bag(n)], p).shipping, D.domesticShipping([bag(n)], p).detail.method], [250, "letterpack_light"], `${p} ${n}`);
    for (const n of [3, 6, 7, 15]) assert.deepEqual([D.domesticShipping([bag(n)], p).shipping, D.domesticShipping([bag(n)], p).detail.method], [regional(p), "yupack"], `${p} ${n}`);
    assert.deepEqual(code(() => D.domesticShipping([bag(16)], p)), ["DOMESTIC_CONTACT_LARGE_ORDER", true], p);
  }
  // Bags of several products count together; still one fee per order.
  assert.equal(D.domesticShipping([bag(1), bag(1), bag(1)], "沖縄県").shipping, 550);
  assert.equal(D.domesticShipping([bag(1), bag(1)], "沖縄県").shipping, 250);
});

test("flat mail for 1–2 bags is レターパックライト for now: the customer pays ¥250, the shop ¥430", () => {
  assert.deepEqual({ ...D.FLAT_MAIL }, { method: "letterpack_light", fee: 250, japanPostCost: 430, maxBags: 2 });
  assert.equal(D.domesticShipping([bag(2)], "沖縄県").detail.method, "letterpack_light");
});

test("the shop's Yu-Pack cost table covers every prefecture (reference only, never charged)", () => {
  assert.equal(Object.keys(D.ZONE_OF).length, 47);
  assert.deepEqual([...new Set(Object.values(D.ZONE_OF))].sort(), Object.keys(D.YUPACK_COST.rates).sort());
  assert.deepEqual(D.YUPACK_COST.rates.okinawa, { 60: 1600, 80: 1990, 100: 2480 });
  // The customer's fee never depends on the box or the Japan Post rate.
  for (const p of D.PREFECTURES) assert.ok(D.domesticShipping([bag(3)], p).shipping <= 550);
});

test("tampered or unknown input refused; the browser's price, shipping and category are never read", () => {
  assert.deepEqual(code(() => D.domesticShipping([bag(1)], "Tokyo")), ["PREFECTURE_REQUIRED", false]);
  assert.throws(() => D.domesticShipping([], "東京都"), /INVALID_ITEMS/);
  const q = quoteOrder([{ id: "enma-jimma", quantity: 1, price: 1, shipping: 0, category: "subscription", flatMail: false }], { prefecture: "沖縄県", shipping: 0 });
  assert.deepEqual([q.shipping, q.subtotal, q.shippingDetail.method], [250, 1500, "letterpack_light"]);
  const old = quoteOrder([{ id: "enma-jimma", quantity: 3, price: 1, shipping: 9999 }], { prefecture: "沖縄県" });
  assert.deepEqual([old.shipping, old.total], [550, 4500 + 550]);
  assert.throws(() => quoteOrder([{ id: "enma-jimma", quantity: 16 }], { prefecture: "沖縄県" }), (e) => e instanceof QuoteError && e.code === "DOMESTIC_CONTACT_LARGE_ORDER" && e.contact === true);
  assert.throws(() => quoteOrder([{ id: "enma-jimma", quantity: 2.5 }], { prefecture: "東京都" }), /INVALID_ITEMS/);
  // The promotional Brazil is sold out (CEO 2026-11-22): refused as not on sale. The promo limit is unchanged for when
  // it is sold again (tested on a copy of the catalogue with it on sale).
  assert.throws(() => quoteOrder([{ id: "enma-zen-dark-roast", quantity: 1 }], { prefecture: "東京都" }), /PRODUCT_NOT_AVAILABLE/, "sold out");
  const onSale = { ...CATALOG, "enma-zen-dark-roast": { ...CATALOG["enma-zen-dark-roast"], availableForSale: true } };
  assert.throws(() => quoteOrder([{ id: "enma-zen-dark-roast", quantity: 3 }], { prefecture: "東京都" }, undefined, onSale), /PROMO_LIMIT/, "promo limit unchanged");
});

test("which products go by Letter Pack Light: exactly the 100 g bean bags of the catalogue", () => {
  const flat = Object.entries(CATALOG).filter(([, p]) => p.flatMail).map(([id]) => id).sort();
  assert.deepEqual(flat, ["enma-amarelo-bourbon", "enma-andes-blue", "enma-jimma", "enma-karamo", "enma-kindiio", "enma-quequesques", "enma-zen-dark-roast"]);
  for (const id of flat) assert.deepEqual([CATALOG[id].kind, CATALOG[id].contentG], ["beans", 100], id);
});

test("international shipping unchanged: the same quote for the same order", () => {
  const q = quoteOrder([{ id: "enma-karamo", quantity: 2 }], { countryCode: "TW" });
  assert.equal(q.shippingDetail.service, "airpacket");
  assert.equal(q.shippingDetail.weightG, 390);
  assert.equal(quoteOrder([{ id: "enma-karamo", quantity: 6 }], { countryCode: "SG" }).shippingDetail.service, "airpacket");
});

test("the storefront shows the server's numbers (src/lib/shippingPolicy.js DOMESTIC)", async () => {
  const { DOMESTIC } = await import(pathToFileURL(path.join(__dirname, "..", "src", "lib", "shippingPolicy.js")).href);
  assert.deepEqual(DOMESTIC, { flatMailFee: D.FLAT_MAIL.fee, flatMailMaxBags: D.FLAT_MAIL.maxBags, maxBags: D.MAX_BAGS, regional: { ...D.LEGACY_FEES } });
});

test("木函のお茶・閻魔 珈琲袋 (over 3 cm thick): any order holding one is never Letter Pack Light; the regional fee, mixed carts included", () => {
  const { priceItems } = require("./catalog");
  const carts = [
    [["mokkan-oku-yame-hojicha", 1]], [["mokkan-oku-yame-genmaicha", 5]], [["enma-coffee-bag", 1]],
    [["enma-jimma", 1], ["mokkan-oku-yame-hojicha", 1]], [["enma-karamo", 2], ["enma-coffee-bag", 1]],
    [["enma-jimma", 1], ["mokkan-oku-yame-genmaicha", 1], ["enma-coffee-bag", 1]], [["enma-jimma", 14], ["mokkan-oku-yame-hojicha", 1]],
  ];
  for (const cart of carts) {
    const items = priceItems(cart.map(([id, quantity]) => ({ id, quantity })));
    for (const p of D.PREFECTURES) {
      const { shipping, detail } = D.domesticShipping(items, p);
      assert.deepEqual([shipping, detail.method], [regional(p), "regional"], `${JSON.stringify(cart)} ${p}`);
    }
  }
  assert.deepEqual([regional("東京都"), regional("高知県"), regional("北海道"), regional("福岡県"), regional("沖縄県")], [250, 250, 500, 500, 550]);
  // The same beans alone still go by Letter Pack Light (unchanged).
  assert.equal(D.domesticShipping(priceItems([{ id: "enma-jimma", quantity: 2 }]), "北海道").detail.method, "letterpack_light");
  for (const id of ["mokkan-oku-yame-hojicha", "mokkan-oku-yame-genmaicha", "enma-coffee-bag"]) assert.notEqual(CATALOG[id].flatMail, true, id);
  // 閻魔 珈琲袋: sale, price and stock settings unchanged (CEO 2026-11-20).
  assert.deepEqual(CATALOG["enma-coffee-bag"], { price: 2400, weightG: 100, kind: "bag", contentG: 100, availableForSale: true, managedStock: true });
});

test("16 bags of beans or more: contact us even when a tea or 閻魔 珈琲袋 is in the same order; 15 still sells", () => {
  const { priceItems } = require("./catalog");
  const cart = (beans, other) => priceItems([{ id: "enma-jimma", quantity: beans }, ...other.map((id) => ({ id, quantity: 1 }))]);
  for (const other of [["mokkan-oku-yame-hojicha"], ["enma-coffee-bag"], ["mokkan-oku-yame-genmaicha", "enma-coffee-bag"]]) {
    for (const p of D.PREFECTURES) {
      assert.deepEqual(code(() => D.domesticShipping(cart(16, other), p)), ["DOMESTIC_CONTACT_LARGE_ORDER", true], `${other} ${p}`);
      assert.deepEqual([D.domesticShipping(cart(15, other), p).shipping, D.domesticShipping(cart(15, other), p).detail.method], [regional(p), "regional"]);
    }
  }
  // Split over several beans, the bags still add up.
  const split = priceItems([{ id: "enma-jimma", quantity: 8 }, { id: "enma-karamo", quantity: 8 }, { id: "enma-coffee-bag", quantity: 1 }]);
  assert.deepEqual(code(() => D.domesticShipping(split, "東京都")), ["DOMESTIC_CONTACT_LARGE_ORDER", true]);
  // Many teas or coffee bags alone are not bean bags: the regional fee (their own stock caps them).
  assert.equal(D.domesticShipping(priceItems([{ id: "enma-coffee-bag", quantity: 20 }]), "沖縄県").shipping, 550);
  // Through the quote the customer sees: the same refusal, before any payment.
  assert.throws(() => quoteOrder([{ id: "enma-jimma", quantity: 16 }, { id: "mokkan-oku-yame-hojicha", quantity: 1 }], { prefecture: "東京都" }),
    (e) => e instanceof QuoteError && e.code === "DOMESTIC_CONTACT_LARGE_ORDER" && e.contact === true);
});
