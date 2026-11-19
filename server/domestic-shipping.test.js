"use strict";

// 2026-11-19 CEO decision (final): 100 g bean bags 1–2 → Click Post ¥250 nationwide; 3–15 → Yu-Pack at the earlier
// regional fee (Honshu/Shikoku ¥250, Hokkaido/Kyushu ¥500, Okinawa ¥550; the shop pays the rest); 16+ → contact;
// other products and international unchanged. The storefront's numbers must equal the server's.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const D = require("./domestic-shipping");
const { quoteOrder, QuoteError } = require("./quote");
const { CATALOG } = require("./catalog");

const bag = (quantity) => ({ quantity, clickpost: true });
const code = (fn) => { try { fn(); return null; } catch (e) { return [e.code, e.contact]; } };
const HOKKAIDO_KYUSHU = ["北海道", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県"];
const regional = (p) => (p === "沖縄県" ? 550 : HOKKAIDO_KYUSHU.includes(p) ? 500 : 250);

test("all 47 prefectures at every boundary: 1, 2 → ¥250 Click Post; 3, 6, 7, 15 → regional fee by Yu-Pack; 16 → contact", () => {
  assert.equal(D.PREFECTURES.length, 47);
  for (const p of D.PREFECTURES) {
    for (const n of [1, 2]) assert.deepEqual([D.domesticShipping([bag(n)], p).shipping, D.domesticShipping([bag(n)], p).detail.method], [250, "clickpost"], `${p} ${n}`);
    for (const n of [3, 6, 7, 15]) assert.deepEqual([D.domesticShipping([bag(n)], p).shipping, D.domesticShipping([bag(n)], p).detail.method], [regional(p), "yupack"], `${p} ${n}`);
    assert.deepEqual(code(() => D.domesticShipping([bag(16)], p)), ["DOMESTIC_CONTACT_LARGE_ORDER", true], p);
  }
  // Bags of several products count together; still one fee per order.
  assert.equal(D.domesticShipping([bag(1), bag(1), bag(1)], "沖縄県").shipping, 550);
  assert.equal(D.domesticShipping([bag(1), bag(1)], "沖縄県").shipping, 250);
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
  const q = quoteOrder([{ id: "enma-jimma", quantity: 1, price: 1, shipping: 0, category: "subscription", clickpost: false }], { prefecture: "沖縄県", shipping: 0 });
  assert.deepEqual([q.shipping, q.subtotal, q.shippingDetail.method], [250, 1500, "clickpost"]);
  const old = quoteOrder([{ id: "enma-jimma", quantity: 3, price: 1, shipping: 9999 }], { prefecture: "沖縄県" });
  assert.deepEqual([old.shipping, old.total], [550, 4500 + 550]);
  assert.throws(() => quoteOrder([{ id: "enma-jimma", quantity: 16 }], { prefecture: "沖縄県" }), (e) => e instanceof QuoteError && e.code === "DOMESTIC_CONTACT_LARGE_ORDER" && e.contact === true);
  assert.throws(() => quoteOrder([{ id: "enma-jimma", quantity: 2.5 }], { prefecture: "東京都" }), /INVALID_ITEMS/);
  assert.throws(() => quoteOrder([{ id: "enma-zen-dark-roast", quantity: 3 }], { prefecture: "東京都" }), /PROMO_LIMIT/, "promo limit unchanged");
});

test("which products go by Click Post: exactly the 100 g bean bags of the catalogue", () => {
  const flat = Object.entries(CATALOG).filter(([, p]) => p.clickpost).map(([id]) => id).sort();
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
  assert.deepEqual(DOMESTIC, { clickpostFee: D.CLICKPOST.fee, clickpostMaxBags: D.CLICKPOST.maxBags, maxBags: D.MAX_BAGS, regional: { ...D.LEGACY_FEES } });
});
