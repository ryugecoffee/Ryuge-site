"use strict";

// 2026-11-19 CEO decision: domestic shipping by Click Post (1–2 bags of beans, ¥250 nationwide) and Yu-Pack (3+ bags,
// Japan Post base rates from Kanagawa of 2026-10-01). The storefront's numbers must equal the server's.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const D = require("./domestic-shipping");
const { quoteOrder, QuoteError } = require("./quote");
const { CATALOG } = require("./catalog");

const confirmed = { yupack: { ...D.YUPACK, confirmed: true } };
const bag = (quantity) => ({ quantity, clickpost: true });
const code = (fn) => { try { fn(); return null; } catch (e) { return [e.code, e.contact]; } };

test("boundaries: 1 and 2 bags Click Post ¥250 in every prefecture; 3 bags Yu-Pack 60; 6 → 60; 7 → 80; 15 → 80; 16 → contact", () => {
  for (const p of D.PREFECTURES) {
    for (const n of [1, 2]) assert.deepEqual([D.domesticShipping([bag(n)], p).shipping, D.domesticShipping([bag(n)], p).detail.method], [250, "clickpost"], `${p} ${n}`);
  }
  const at = (n, p) => D.domesticShipping([bag(n)], p, confirmed);
  assert.deepEqual([at(3, "東京都").shipping, at(3, "東京都").detail.size], [970, 60]);
  assert.deepEqual([at(6, "東京都").shipping, at(6, "東京都").detail.size], [970, 60]);
  assert.deepEqual([at(7, "東京都").shipping, at(7, "東京都").detail.size], [1320, 80]);
  assert.deepEqual([at(15, "東京都").shipping, at(15, "東京都").detail.size], [1320, 80]);
  assert.deepEqual(code(() => at(16, "東京都")), ["DOMESTIC_CONTACT_LARGE_ORDER", true]);
  // Bags of several products count together; still one fee per order.
  assert.equal(D.domesticShipping([bag(1), bag(1), bag(1)], "大阪府", confirmed).shipping, 1090);
});

test("Yu-Pack from Kanagawa: Japan Post's zones and 2026-10-01 base rates (60 / 80)", () => {
  const expect = { "神奈川県": [840, 1150], "東京都": [970, 1320], "青森県": [970, 1320], "新潟県": [970, 1320], "石川県": [970, 1320], "愛知県": [970, 1320],
    "大阪府": [1090, 1440], "広島県": [1270, 1580], "高知県": [1270, 1580], "福岡県": [1550, 1880], "鹿児島県": [1550, 1880], "北海道": [1550, 1880], "沖縄県": [1600, 1990] };
  for (const [p, [r60, r80]] of Object.entries(expect)) {
    assert.equal(D.domesticShipping([bag(3)], p, confirmed).shipping, r60, `${p} 60`);
    assert.equal(D.domesticShipping([bag(10)], p, confirmed).shipping, r80, `${p} 80`);
  }
  assert.equal(Object.keys(D.ZONE_OF).length, 47, "every prefecture has a zone");
  assert.deepEqual([...new Set(Object.values(D.ZONE_OF))].sort(), Object.keys(D.YUPACK.rates).sort());
});

test("never charged from an unconfirmed or incomplete table; tampered or unknown input refused", () => {
  assert.equal(D.YUPACK.confirmed, false, "the CEO confirms the table before 3+ bags can be paid");
  assert.deepEqual(code(() => D.domesticShipping([bag(3)], "東京都")), ["YUPACK_RATE_PENDING", true]);
  const broken = { yupack: { ...D.YUPACK, confirmed: true, rates: { ...D.YUPACK.rates, kinki: { 60: 0, 80: null } } } };
  assert.deepEqual(code(() => D.domesticShipping([bag(3)], "大阪府", broken)), ["SHIPPING_RATE_UNAVAILABLE", true]);
  assert.deepEqual(code(() => D.domesticShipping([bag(1)], "Tokyo")), ["PREFECTURE_REQUIRED", false]);
  assert.throws(() => D.domesticShipping([], "東京都"), /INVALID_ITEMS/);
  // The browser's own shipping, price or category is never read: only ids, quantities and the prefecture.
  const q = quoteOrder([{ id: "enma-jimma", quantity: 1, price: 1, shipping: 0, category: "subscription", clickpost: false }], { prefecture: "沖縄県", shipping: 0 });
  assert.deepEqual([q.shipping, q.subtotal, q.shippingDetail.method], [250, 1500, "clickpost"]);
  assert.throws(() => quoteOrder([{ id: "enma-jimma", quantity: 3 }], { prefecture: "沖縄県" }), (e) => e instanceof QuoteError && e.code === "YUPACK_RATE_PENDING" && e.contact === true);
});

test("which products go by Click Post: exactly the 100 g bean bags of the catalogue", () => {
  const flat = Object.entries(CATALOG).filter(([, p]) => p.clickpost).map(([id]) => id).sort();
  assert.deepEqual(flat, ["enma-amarelo-bourbon", "enma-andes-blue", "enma-jimma", "enma-karamo", "enma-kindiio", "enma-quequesques", "enma-zen-dark-roast"]);
  for (const id of flat) assert.deepEqual([CATALOG[id].kind, CATALOG[id].contentG], ["beans", 100], id);
  // Two bags side by side (about 24 × 20 × 2.5 cm, 240 g) fit Click Post: longest side ≤ 34, three sides ≤ 60, ≤ 2 kg.
  const packed = { long: 24, short: 20, thick: 2.5, grams: 2 * CATALOG["enma-jimma"].weightG };
  assert.ok(packed.long <= 34 && packed.long + packed.short + packed.thick <= 60 && packed.thick <= 3 && packed.grams <= 2000);
});

test("international shipping unchanged: the same quote for the same order", () => {
  const q = quoteOrder([{ id: "enma-karamo", quantity: 2 }], { countryCode: "TW" });
  assert.equal(q.shippingDetail.service, "airpacket");
  assert.equal(q.shippingDetail.weightG, 390);
});

test("the storefront shows the server's numbers (src/lib/shippingPolicy.js DOMESTIC)", async () => {
  const { DOMESTIC } = await import(pathToFileURL(path.join(__dirname, "..", "src", "lib", "shippingPolicy.js")).href);
  assert.equal(DOMESTIC.clickpostFee, D.CLICKPOST.fee);
  assert.equal(DOMESTIC.clickpostMaxBags, D.CLICKPOST.maxBags);
  assert.deepEqual(DOMESTIC.yupackSizes, D.YUPACK.sizes.map((s) => ({ ...s })));
  assert.deepEqual(Object.fromEntries(DOMESTIC.yupackZones.map((z) => [z.key, z.rates])), JSON.parse(JSON.stringify(D.YUPACK.rates)));
  assert.deepEqual(DOMESTIC.regional, { ...D.LEGACY_FEES });
});
