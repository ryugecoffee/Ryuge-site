"use strict";

// Order quote: the one place the payment amount is decided (2026-11-17, CEO policy).
// Both the price shown before payment (/quote) and the PaymentIntent (/create-payment-intent) use quoteOrder(), so the
// customer is charged exactly what was shown, and nothing from the browser but product ids, quantities, destination
// country/prefecture and coupon code is used.
//
// Domestic: one shipping fee per order by prefecture (Honshu/Shikoku 250, Hokkaido/Kyushu 500, Okinawa 550).
// International: only countries in INTERNATIONAL_COUNTRIES (shipping and import conditions confirmed); Japan Post
// tracked rate for the packed weight, minus RYUGE's subsidy: min(30% of the rate, 1,000 yen), rounded down to the yen.
// No rate -> no payment (the customer is asked to contact us). Duties, import taxes and local fees are the buyer's.
// International orders: coffee beans only, 2-6 bags, at most 600 g of coffee; 7+ bags -> contact us.
// Promo beans: at most 2 bags per order (and per customer across orders, see server/promo.js).
const { priceItems } = require("./catalog");
const INTERNATIONAL = require("./international-rates");

const CONTACT_EMAIL = "ryugecoffee@gmail.com";
const PACKAGING_WEIGHT_G = 150;

const DOMESTIC_FEES = Object.freeze({ standard: 250, hokkaidoKyushu: 500, okinawa: 550 });
const HOKKAIDO_KYUSHU = new Set(["北海道", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県"]);
const PREFECTURES = new Set([
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県",
  "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県",
  "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県",
  "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
]);

const INTERNATIONAL_LIMITS = Object.freeze({ minBags: 2, maxBags: 6, maxCoffeeG: 600 });
const PROMO_MAX_BAGS = 2;
const SUBSIDY = Object.freeze({ rate: 0.3, maxYen: 1000 });

const COUPONS = Object.freeze({
  WELCOME10: { type: "percent", value: 10, label: "10% OFF" },
  FREESHIP: { type: "shipping", value: 100, label: "送料補助" },
});

class QuoteError extends Error {
  constructor(code, { contact = false, status = 400 } = {}) {
    super(code);
    this.code = code;
    this.contact = contact; // the customer is shown the contact address instead of a payment
    this.status = status;
  }
}

function domesticShipping(prefecture) {
  if (!PREFECTURES.has(prefecture)) throw new QuoteError("PREFECTURE_REQUIRED");
  if (prefecture === "沖縄県") return DOMESTIC_FEES.okinawa;
  return HOKKAIDO_KYUSHU.has(prefecture) ? DOMESTIC_FEES.hokkaidoKyushu : DOMESTIC_FEES.standard;
}

// Japan Post rate for the packed weight, or null when the table has no rate for it.
function japanPostRate(service, zone, weightG, tables = INTERNATIONAL.RATE_TABLES) {
  const table = tables[service]?.[zone];
  if (!Array.isArray(table)) return null;
  const row = table.find(([maxG]) => weightG <= maxG);
  return row && Number.isSafeInteger(row[1]) && row[1] > 0 ? row[1] : null;
}

function subsidyFor(actualYen) {
  return Math.min(Math.floor(actualYen * SUBSIDY.rate), SUBSIDY.maxYen);
}

function internationalShipping(items, countryCode, international = INTERNATIONAL, now = Date.now()) {
  const country = Object.prototype.hasOwnProperty.call(international.INTERNATIONAL_COUNTRIES, countryCode)
    ? international.INTERNATIONAL_COUNTRIES[countryCode] : null;
  if (!country) throw new QuoteError("COUNTRY_NOT_AVAILABLE", { contact: true });
  if (items.some((item) => item.kind !== "beans")) throw new QuoteError("INTL_BEANS_ONLY", { contact: true });
  const bags = items.reduce((sum, item) => sum + item.quantity, 0);
  if (bags > INTERNATIONAL_LIMITS.maxBags) throw new QuoteError("INTL_CONTACT_LARGE_ORDER", { contact: true });
  if (bags < INTERNATIONAL_LIMITS.minBags) throw new QuoteError("INTL_MIN_BAGS");
  const coffeeG = items.reduce((sum, item) => sum + item.contentG * item.quantity, 0);
  if (coffeeG > INTERNATIONAL_LIMITS.maxCoffeeG) throw new QuoteError("INTL_CONTACT_LARGE_ORDER", { contact: true });
  const weightG = items.reduce((sum, item) => sum + item.weightG * item.quantity, 0) + PACKAGING_WEIGHT_G;
  // Rates past their validity (Japan Post revision) are never used: no payment until the new table is entered.
  const validUntil = international.RATES_VALID_UNTIL ? Date.parse(international.RATES_VALID_UNTIL) : NaN;
  if (international.RATES_VALID_UNTIL && !(now < validUntil)) throw new QuoteError("SHIPPING_RATE_UNAVAILABLE", { contact: true });
  const actual = japanPostRate(country.service, country.zone, weightG, international.RATE_TABLES);
  if (actual === null) throw new QuoteError("SHIPPING_RATE_UNAVAILABLE", { contact: true });
  const subsidy = subsidyFor(actual);
  return { shipping: actual - subsidy, detail: { service: country.service, zone: country.zone, weightG, actual, subsidy, ratesVersion: international.INTERNATIONAL_RATES_VERSION } };
}

function applyCoupon(subtotal, shipping, couponCode) {
  const coupon = couponCode ? COUPONS[String(couponCode).trim().toUpperCase()] : null;
  if (!coupon) return { subtotal, shipping, coupon: "" };
  const code = String(couponCode).trim().toUpperCase();
  if (coupon.type === "percent") return { subtotal: subtotal - Math.round(subtotal * (coupon.value / 100)), shipping, coupon: code };
  if (coupon.type === "shipping") return { subtotal, shipping: Math.max(0, shipping - Math.round(shipping * (coupon.value / 100))), coupon: code };
  return { subtotal, shipping, coupon: "" };
}

// -> { items, subtotal, shipping, total, shippingDetail, countryCode, prefecture, coupon } or throws QuoteError.
function quoteOrder(cartItems, { countryCode = "JP", prefecture = "", couponCode = "", now = Date.now() } = {}, international = INTERNATIONAL) {
  let items;
  try {
    items = priceItems(cartItems);
  } catch (error) {
    throw new QuoteError(error.message);
  }
  const promoBags = items.filter((item) => item.promo).reduce((sum, item) => sum + item.quantity, 0);
  if (promoBags > PROMO_MAX_BAGS) throw new QuoteError("PROMO_LIMIT");
  const country = String(countryCode || "JP").toUpperCase();
  let shipping;
  let shippingDetail;
  if (country === "JP") {
    shipping = domesticShipping(String(prefecture || ""));
    shippingDetail = { domestic: true, prefecture: String(prefecture) };
  } else {
    ({ shipping, detail: shippingDetail } = internationalShipping(items, country, international, now));
  }
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discounted = applyCoupon(subtotal, shipping, couponCode);
  return {
    items, subtotal: discounted.subtotal, shipping: discounted.shipping, total: discounted.subtotal + discounted.shipping,
    shippingDetail, countryCode: country, prefecture: country === "JP" ? String(prefecture) : "", coupon: discounted.coupon,
  };
}

module.exports = {
  quoteOrder, QuoteError, domesticShipping, internationalShipping, japanPostRate, subsidyFor, applyCoupon,
  COUPONS, CONTACT_EMAIL, DOMESTIC_FEES, INTERNATIONAL_LIMITS, PROMO_MAX_BAGS, SUBSIDY, PACKAGING_WEIGHT_G,
};
