"use strict";

// 2026-11-17 CEO shipping policy (domestic part replaced 2026-11-19, see server/domestic-shipping.test.js): international by country and packed weight
// with a 30% subsidy capped at 1,000 yen; international orders 2-6 bags of beans (max 600 g); 7+ bags -> contact.
const test = require("node:test");
const assert = require("node:assert/strict");
const { quoteOrder, QuoteError, domesticShipping, subsidyFor, japanPostRate, CONTACT_EMAIL } = require("./quote");
const REAL = require("./international-rates");

// A test table (not Japan Post's): the real one is checked separately below.
const TEST_INTL = {
  INTERNATIONAL_RATES_VERSION: "test",
  RATE_TABLES: { testpost: { 1: [[500, 1500], [700, 2000], [1000, 4000]] } },
  INTERNATIONAL_COUNTRIES: { KR: { service: "testpost", zone: 1 }, DE: { service: "testpost", zone: 1 } },
};
const beans = (id, quantity) => ({ id, quantity });
const fails = (fn, code, contact) => assert.throws(fn, (error) => {
  assert.ok(error instanceof QuoteError);
  assert.equal(error.code, code);
  if (contact !== undefined) assert.equal(error.contact, contact);
  return true;
});

test("domestic (2026-11-19): beans 1–2 bags by Click Post ¥250 everywhere; 3+ by Yu-Pack (refused until confirmed); other products as before", () => {
  for (const pref of ["神奈川県", "東京都", "高知県", "北海道", "福岡県", "鹿児島県", "沖縄県"]) {
    assert.equal(domesticShipping([{ quantity: 1, clickpost: true }], pref).shipping, 250, pref);
    assert.equal(quoteOrder([beans("enma-karamo", 1), beans("enma-kindiio", 1)], { prefecture: pref }).shipping, 250, `2 bags to ${pref}`);
  }
  fails(() => domesticShipping([{ quantity: 1, clickpost: true }], ""), "PREFECTURE_REQUIRED");
  fails(() => domesticShipping([{ quantity: 1, clickpost: true }], "Kanagawa"), "PREFECTURE_REQUIRED");
  const two = quoteOrder([beans("enma-karamo", 2)], { prefecture: "北海道" });
  assert.equal(two.total, 2 * 1800 + 250, "one fee per order, never per item");
  assert.deepEqual([two.shippingDetail.method, two.shippingDetail.bags], ["clickpost", 2]);
  // 3 bags or more: Yu-Pack. Until the CEO confirms the table, no payment is possible (contact us).
  fails(() => quoteOrder([beans("enma-karamo", 3)], { prefecture: "東京都" }), "YUPACK_RATE_PENDING", true);
  fails(() => quoteOrder([beans("enma-karamo", 2), beans("enma-kindiio", 1)], { prefecture: "沖縄県" }), "YUPACK_RATE_PENDING", true);
  // Other products (drip bags, tea): the earlier regional fee, for now.
  assert.equal(quoteOrder([beans("enma-coffee-bag", 1)], { prefecture: "北海道" }).shipping, 500);
  assert.equal(quoteOrder([beans("enma-karamo", 1), beans("enma-coffee-bag", 1)], { prefecture: "沖縄県" }).shipping, 550);
  assert.equal(quoteOrder([beans("woodbox-tea-bag", 1)], { prefecture: "東京都" }).shipping, 250);
  assert.equal(quoteOrder([beans("enma-karamo", 12), beans("enma-coffee-bag", 1)], { prefecture: "沖縄県" }).shipping, 550, "mixed orders: no bag rule yet");
});

test("international: subsidy is 30% of the real rate, capped at 1,000 yen, rounded down to the yen", () => {
  assert.equal(subsidyFor(1500), 450);
  assert.equal(subsidyFor(2015), 604, "604.5 -> 604");
  assert.equal(subsidyFor(4000), 1000, "1,200 -> capped at 1,000");
  // 2 bags: 2 x 120 g + 150 g packaging = 390 g -> 1,500; customer pays 1,500 - 450.
  const two = quoteOrder([beans("enma-karamo", 2)], { countryCode: "KR" }, TEST_INTL);
  assert.equal(two.shipping, 1050);
  assert.deepEqual([two.shippingDetail.actual, two.shippingDetail.subsidy, two.shippingDetail.weightG], [1500, 450, 390]);
  assert.equal(two.total, 3600 + 1050);
  // 6 bags: 870 g -> 4,000; subsidy capped at 1,000.
  const six = quoteOrder([beans("enma-karamo", 3), beans("enma-kindiio", 3)], { countryCode: "de" }, TEST_INTL);
  assert.equal(six.shipping, 3000);
});

test("international limits: 2-6 bags of beans, at most 600 g; 7+ bags and other products go to contact", () => {
  fails(() => quoteOrder([beans("enma-karamo", 1)], { countryCode: "KR" }, TEST_INTL), "INTL_MIN_BAGS", false);
  fails(() => quoteOrder([beans("enma-karamo", 4), beans("enma-kindiio", 3)], { countryCode: "KR" }, TEST_INTL), "INTL_CONTACT_LARGE_ORDER", true);
  fails(() => quoteOrder([beans("enma-karamo", 7)], { countryCode: "KR" }, TEST_INTL), "INTL_CONTACT_LARGE_ORDER", true);
  fails(() => quoteOrder([beans("enma-karamo", 2), beans("enma-coffee-bag", 1)], { countryCode: "KR" }, TEST_INTL), "INTL_BEANS_ONLY", true);
  assert.equal(quoteOrder([beans("enma-karamo", 6)], { countryCode: "KR" }, TEST_INTL).items[0].quantity, 6, "6 bags are allowed");
});

test("countries not enabled (the United States and any other) cannot pay; no rate means no payment", () => {
  fails(() => quoteOrder([beans("enma-karamo", 2)], { countryCode: "US" }, TEST_INTL), "COUNTRY_NOT_AVAILABLE", true);
  fails(() => quoteOrder([beans("enma-karamo", 2)], { countryCode: "BR" }, TEST_INTL), "COUNTRY_NOT_AVAILABLE", true);
  fails(() => quoteOrder([beans("enma-karamo", 2)], { countryCode: "constructor" }, TEST_INTL), "COUNTRY_NOT_AVAILABLE", true);
  const missing = { ...TEST_INTL, RATE_TABLES: { testpost: { 1: [[300, 1000]] } } };
  fails(() => quoteOrder([beans("enma-karamo", 2)], { countryCode: "KR" }, missing), "SHIPPING_RATE_UNAVAILABLE", true);
  assert.equal(japanPostRate("testpost", 2, 100, TEST_INTL.RATE_TABLES), null);
  assert.ok(CONTACT_EMAIL === "ryugecoffee@gmail.com");
});

test("the real international table: the US is never enabled; every enabled country has a rate for 2 to 6 bags", () => {
  assert.equal(REAL.INTERNATIONAL_COUNTRIES.US, undefined);
  for (const [code, country] of Object.entries(REAL.INTERNATIONAL_COUNTRIES)) {
    for (let bags = 2; bags <= 6; bags++) {
      const quote = quoteOrder([beans("enma-karamo", bags)], { countryCode: code });
      assert.ok(quote.shippingDetail.actual > 0, `${code} ${bags} bags`);
      assert.equal(quote.shipping, quote.shippingDetail.actual - Math.min(Math.floor(quote.shippingDetail.actual * 0.3), 1000));
      assert.equal(country.service, quote.shippingDetail.service);
    }
  }
});

test("coupons still apply on the server; the browser's prices and categories never do", () => {
  const q = quoteOrder([{ id: "enma-kindiio", quantity: 2, price: 1, category: "subscription" }], { prefecture: "東京都", couponCode: "welcome10" });
  assert.equal(q.subtotal, 4100 - 410);
  assert.equal(q.shipping, 250);
  assert.equal(q.coupon, "WELCOME10");
  assert.equal(quoteOrder([beans("enma-kindiio", 1)], { prefecture: "東京都", couponCode: "FREESHIP" }).shipping, 0);
  assert.equal(quoteOrder([beans("enma-kindiio", 1)], { prefecture: "東京都", couponCode: "NOPE" }).coupon, "");
});

test("Japan Post Air Packet table as published (read 2026-11-17); it stops being used at the 2027-02-01 revision", () => {
  assert.equal(japanPostRate("airpacket", 1, 390, REAL.RATE_TABLES), 1020, "Taiwan, 2 bags (390 g): the 400 g step");
  assert.equal(japanPostRate("airpacket", 2, 870, REAL.RATE_TABLES), 1710, "Hong Kong / Singapore, 6 bags (870 g): the 900 g step");
  assert.equal(japanPostRate("airpacket", 3, 2000, REAL.RATE_TABLES), 4300);
  assert.equal(japanPostRate("airpacket", 1, 2001, REAL.RATE_TABLES), null, "over 2 kg: no rate");
  assert.deepEqual(Object.keys(REAL.INTERNATIONAL_COUNTRIES).sort(), ["HK", "SG", "TW"]);
  const tw = quoteOrder([beans("enma-karamo", 2)], { countryCode: "TW", now: Date.parse("2027-01-31T23:59:00+09:00") });
  assert.deepEqual([tw.shippingDetail.actual, tw.shippingDetail.subsidy, tw.shipping], [1020, 306, 714]);
  fails(() => quoteOrder([beans("enma-karamo", 2)], { countryCode: "TW", now: Date.parse("2027-02-01T00:00:00+09:00") }), "SHIPPING_RATE_UNAVAILABLE", true);
});
