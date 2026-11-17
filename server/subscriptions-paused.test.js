"use strict";

// 2026-11-17: new subscriptions paused (CEO). Existing subscriptions are not touched.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(root, ...p), "utf8");

test("the subscription checkout API refuses every new subscription before Stripe is called, however it is reached", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder_never_used";
  process.env.VERCEL_ENV = "production";
  const { SUBSCRIPTIONS_PAUSED } = await import(path.join(root, "src", "productData.js"));
  assert.equal(SUBSCRIPTIONS_PAUSED, true);
  const { default: handler } = await import(path.join(root, "api", "create-subscription-checkout.js"));
  for (const planId of ["coffee-bag", "mame", "zen"]) {
    let status = 0;
    let body = null;
    const res = { status(code) { status = code; return this; }, json(value) { body = value; return this; } };
    const req = { method: "POST", headers: { origin: "https://ryuge.biz" },
      body: { cartItems: [{ id: `subscription-${planId}`, quantity: 1 }], customer: { countryCode: "JP", email: "a@example.com" } } };
    await handler(req, res);
    assert.equal(status, 403, planId);
    assert.deepEqual(body, { error: "SUBSCRIPTIONS_PAUSED" });
  }
  const source = read("api", "create-subscription-checkout.js");
  assert.ok(source.indexOf("if (SUBSCRIPTIONS_PAUSED)") < source.indexOf("stripe.checkout.sessions.create"), "refused before any Stripe call");
});

test("the store shows the notice and no sign-up button; checkout does not send a subscription left in a cart", () => {
  const products = read("src", "pages", "ProductsPage.jsx");
  assert.match(products, /SUBSCRIPTIONS_PAUSED \? \(/);
  assert.match(products, /className="modal-cta-link is-disabled" disabled/);
  assert.match(read("src", "productData.js"), /ja: "現在、新規受付を休止しています"/);
  const checkout = read("src", "pages", "CheckoutPage.jsx");
  assert.match(checkout, /const isBlocked {3}= subscriptionPaused \|\|/);
  assert.ok(checkout.indexOf("if (SUBSCRIPTIONS_PAUSED) {") < checkout.indexOf('fetch("/api/create-subscription-checkout"'));
  const concierge = read("api", "coffee-concierge.js");
  assert.match(concierge, /新規受付を休止中/);
  assert.doesNotMatch(concierge, /定期便もさりげなく案内する/);
});

test("one-time sales are untouched: beans and the coffee bag stay on sale", () => {
  const { CATALOG } = require("./catalog");
  for (const id of ["enma-karamo", "enma-kindiio", "enma-coffee-bag"]) assert.equal(CATALOG[id].availableForSale, true, id);
});
