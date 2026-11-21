"use strict";

// 2026-11-17: the storefront shows and charges only what the payment server quotes.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { INTERNATIONAL_COUNTRIES } = require("./international-rates");

const read = (...parts) => fs.readFileSync(path.join(__dirname, "..", ...parts), "utf8");
const checkout = read("src", "pages", "CheckoutPage.jsx");
const quoteSource = read("server", "quote.js");

test("the checkout shows the server's quote only and creates the payment when the order is sent", () => {
  assert.doesNotMatch(checkout, /lib\/shipping"|calcShipping|EMS_RATES/, "no shipping calculated in the browser");
  assert.match(checkout, /fetch\(`\$\{PAYMENT_API_BASE\}\/quote`/);
  const effects = checkout.split("useEffect(").slice(1).map((body) => body.slice(0, body.indexOf("}, [")));
  assert.ok(effects.every((body) => !body.includes("create-payment-intent")), "no payment is created when the page opens");
  const submit = checkout.slice(checkout.indexOf("const handleSubmit = async"));
  assert.match(submit, /create-payment-intent`/);
  assert.match(submit, /body: JSON\.stringify\(\{ \.\.\.quoteRequest, email, name, address: finalAddress, postalCode: isInternational \? intlPostalCode : postalCode \}\)/);
  assert.match(submit, /if \(data\.total !== quote\.total \|\| data\.shipping !== quote\.shipping\) \{/, "a changed amount is shown, never charged silently");
  assert.match(submit, /pendingIntent && pendingIntent\.key === quoteKey \? pendingIntent : null/, "a declined card retries the same payment");
  assert.match(checkout, /items: \(cartItems \|\| \[\]\)\.filter\(\(i\) => !isSubscriptionItem\(i\)\)\.map\(\(\{ id, quantity \}\) => \(\{ id, quantity \}\)\)/,
    "only ids and quantities are sent");
  assert.match(checkout, /setQuote\(\{ status: "error", code: "QUOTE_UNAVAILABLE", contact: false \}\)/, "no fallback amount when the server cannot quote");
  assert.match(checkout, /const canPay {6}= !hasSubscription && quoteReady;/);
});

test("countries: Japan, the enabled countries and 'other (contact us)'; the list equals the server's", async () => {
  const { INTERNATIONAL_COUNTRY_CODES, OTHER_COUNTRY } = await import(path.join(__dirname, "..", "src", "lib", "shippingPolicy.js"));
  assert.deepEqual([...INTERNATIONAL_COUNTRY_CODES].sort(), Object.keys(INTERNATIONAL_COUNTRIES).sort());
  assert.ok(!INTERNATIONAL_COUNTRY_CODES.includes("US"));
  assert.equal(OTHER_COUNTRY, "OTHER");
  assert.match(checkout, /const COUNTRY_CODES_FOR_SELECT = \["JP", \.\.\.INTERNATIONAL_COUNTRY_CODES, OTHER_COUNTRY\];/);
});

test("every refusal from the server has a message in Japanese, English and Spanish; contact cases show the email", async () => {
  const { QUOTE_MESSAGES, CONTACT_EMAIL, POLICY_TEXT } = await import(path.join(__dirname, "..", "src", "lib", "shippingPolicy.js"));
  const domesticSource = read("server", "domestic-shipping.js");
  const codes = [...quoteSource.matchAll(/new QuoteError\("([A-Z_]+)"/g), ...domesticSource.matchAll(/new DomesticShippingError\("([A-Z_]+)"/g)].map((m) => m[1]);
  assert.ok(codes.length >= 6);
  for (const lang of ["ja", "en", "es"]) {
    for (const code of [...codes, "QUOTE_UNAVAILABLE", "AMOUNT_CHANGED", "OUT_OF_STOCK"]) {
      assert.ok(QUOTE_MESSAGES[lang][code], `${lang} ${code}`);
    }
    assert.ok(POLICY_TEXT[lang].duties && POLICY_TEXT[lang].intlLimits && POLICY_TEXT[lang].domesticShipping);
  }
  assert.equal(QUOTE_MESSAGES.ja.INTL_CONTACT_LARGE_ORDER, "7袋以上のご注文はお問い合わせください。");
  assert.equal(CONTACT_EMAIL, "ryugecoffee@gmail.com");
  assert.match(checkout, /href=\{contactHref\(/);
  assert.match(checkout, /⚠ \{policy\.duties\}/, "duties are stated before payment for international orders");
});

test("no free-shipping promise is left in the cart or the shipping page", () => {
  const layout = read("src", "components", "SiteLayout.jsx");
  const shippingPage = read("src", "pages", "ShippingPage.jsx");
  assert.doesNotMatch(layout, /送料無料|free shipping|FREE_SHIPPING/i);
  assert.match(shippingPage, /コーヒー豆（100g）1〜2袋：レターパックライトで全国一律250円（北海道・九州・沖縄も250円）/);
  assert.match(shippingPage, /3〜15袋：ゆうパックで、本州・四国250円／北海道・九州500円／沖縄550円/);
  assert.doesNotMatch(shippingPage, /¥200|2個以上のご注文：送料無料/);
});

test("lead time (CEO 2026-11-21): roasted after the order, aim for the next day, within 3 working days; no EMS left; no promise of a date we never send", () => {
  const read = (...p) => fs.readFileSync(path.join(__dirname, "..", ...p), "utf8");
  const data = read("src", "productData.js");
  const shipping = read("src", "pages", "ShippingPage.jsx");
  const legal = read("src", "pages", "LegalNotice.jsx");
  assert.match(data, /ご注文後に焙煎・袋詰めし、通常はご注文の翌日の発送を目指して、原則3営業日以内に発送します/);
  assert.match(shipping, /通常はご注文の翌日の発送を目指し、原則3営業日以内に発送します。店舗は不定休です（年末年始の固定の休業日はありません）/);
  assert.match(legal, /ご注文後、原則3営業日以内に発送いたします/, "the legal notice gives the same lead time");
  // The old lead time and "no shipping at weekends" are gone, in every language.
  for (const text of [data, shipping, legal]) {
    assert.doesNotMatch(text, /3〜7|3–7|土日は出荷|土日を除く|not on weekends|do not ship on weekends|fines de semana/);
  }
  // "We email you when it ships" is what the shop's page does (server/shipping-notice.js, sent once per parcel).
  assert.match(shipping, /発送時にメールでお知らせします/);
  assert.match(read("server", "order-fulfillment.js"), /sendShippedMail/);
  for (const file of [["src", "productData.js"], ["src", "pages", "ShippingPage.jsx"]]) {
    assert.doesNotMatch(read(...file), /発送予定日を|発送予定日は|planned shipping date|fecha prevista de envío|shipping date is in your order confirmation/, file.join("/"));
  }
  for (const file of [["src", "pages", "CheckoutPage.jsx"], ["server", "index.js"]]) {
    assert.doesNotMatch(read(...file), /\bEMS\b/, `${file.join("/")}: international orders ship by Air Packet`);
  }
});
