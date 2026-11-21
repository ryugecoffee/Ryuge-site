"use strict";

// 2026-11-17: new subscriptions paused (CEO). Existing subscriptions are not touched. 2026-11-20: 珈琲の定期便 may reopen
// on the store; these tests keep what must hold either way.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(root, ...p), "utf8");

// 2026-11-20: the store's switch (SUBSCRIPTIONS_PAUSED) may reopen 珈琲の定期便; what protects production is on the server:
// the earlier plans stay closed for good, and the new sign-up opens only with COFFEE_SUBSCRIPTION_ENABLED=true on Render.
test("the earlier plans' checkout API refuses every new subscription before Stripe is called, paused or not", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder_never_used";
  process.env.VERCEL_ENV = "production";
  const { OLD_SUBSCRIPTION_PLANS_CLOSED } = await import(path.join(root, "src", "productData.js"));
  assert.equal(OLD_SUBSCRIPTION_PLANS_CLOSED, true, "closed for good, whatever SUBSCRIPTIONS_PAUSED says");
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
  assert.ok(source.indexOf("if (OLD_SUBSCRIPTION_PLANS_CLOSED || SUBSCRIPTIONS_PAUSED)") < source.indexOf("stripe.checkout.sessions.create"), "refused before any Stripe call");
});

test("reopening the store alone opens nothing: the 珈琲の定期便 sign-up stays closed (404, no Stripe call) until COFFEE_SUBSCRIPTION_ENABLED=true and all five prices are set", async () => {
  const checkout = require("./coffee-subscription-checkout");
  const prices = { STRIPE_PRICE_COFFEE_SUB_1: "price_a1", STRIPE_PRICE_COFFEE_SUB_2: "price_a2", STRIPE_PRICE_COFFEE_SUB_3: "price_a3",
    STRIPE_PRICE_COFFEE_SUB_4: "price_a4", STRIPE_PRICE_COFFEE_SUB_FIRST: "price_af" };
  let stripeCalls = 0;
  const stripe = { checkout: { sessions: { create: async () => { stripeCalls += 1; return {}; } } } };
  const closed = [{}, prices, { ...prices, COFFEE_SUBSCRIPTION_ENABLED: "1" }, { ...prices, COFFEE_SUBSCRIPTION_ENABLED: "true", STRIPE_PRICE_COFFEE_SUB_FIRST: "" }];
  for (const env of closed) {
    const config = checkout.configFrom(env);
    assert.equal(config.enabled, false, JSON.stringify(env));
    await assert.rejects(checkout.createCheckout({ db: null, stripe, config, input: { frequency: 1, email: "a@example.com" } }), (e) => e.code === "DISABLED" && e.status === 404);
  }
  assert.equal(stripeCalls, 0);
  assert.equal(checkout.configFrom({ ...prices, COFFEE_SUBSCRIPTION_ENABLED: "true" }).enabled, true, "only the full setting opens it");
});

test("the store follows its switch: paused → the notice and a disabled button; open → only a link to the final confirmation screen; a cart never carries a subscription", () => {
  // 珈琲の定期便: the detail (src/components/CoffeeSubscriptionDetail.jsx) never starts a sign-up itself. Paused, the
  // button is disabled; reopened, it is a link to /subscription/apply, where the terms are shown before Stripe's page.
  const detail = read("src", "components", "CoffeeSubscriptionDetail.jsx");
  assert.match(detail, /const closedText = SUBSCRIPTIONS_PAUSED \? loc\(SUBSCRIPTIONS_PAUSED_TEXT, lang\)/);
  assert.match(detail, /<button type="button" className="modal-cta-link is-disabled" disabled>\{closedText\}<\/button>/);
  assert.match(detail, /\{SUBSCRIPTIONS_PAUSED \? \([\s\S]*?is-disabled[\s\S]*?\) : \([\s\S]*?<Link className="modal-cta-link" to="\/subscription\/apply"/);
  assert.doesNotMatch(detail, /setItem|fetch\(|onSubmit/, "nothing in the detail starts a sign-up");
  // The final confirmation screen keeps its own closed state while paused.
  assert.match(read("src", "pages", "SubscriptionApplyPage.jsx"), /const closed = SUBSCRIPTIONS_PAUSED;/);
  assert.match(read("src", "pages", "ProductsPage.jsx"), /<CoffeeSubscriptionDetail lang=\{lang\} \/>/);
  assert.match(read("src", "productData.js"), /ja: "現在、新規受付を休止しています"/);
  const checkout = read("src", "pages", "CheckoutPage.jsx");
  assert.match(checkout, /const isBlocked {3}= subscriptionPaused \|\|/);
  assert.ok(checkout.indexOf("if (OLD_SUBSCRIPTION_PLANS_CLOSED || SUBSCRIPTIONS_PAUSED) {") < checkout.indexOf('fetch("/api/create-subscription-checkout"'));
  // The bean concierge follows the same switch: "paused, do not offer" or "point to the store's detail".
  const concierge = read("api", "coffee-concierge.js");
  assert.match(concierge, /SUBSCRIPTIONS_PAUSED\s*\?\s*"[^"]*新規受付を休止中/);
  assert.doesNotMatch(concierge, /定期便もさりげなく案内する/);
});

test("one-time sales are untouched: beans and the coffee bag stay on sale", () => {
  const { CATALOG } = require("./catalog");
  for (const id of ["enma-karamo", "enma-kindiio", "enma-coffee-bag"]) assert.equal(CATALOG[id].availableForSale, true, id);
});

test("reopening 珈琲の定期便 never reopens the earlier plans: they have their own permanent switch", async () => {
  const { OLD_SUBSCRIPTION_PLANS_CLOSED } = await import(path.join(root, "src", "productData.js"));
  assert.equal(OLD_SUBSCRIPTION_PLANS_CLOSED, true);
  // The old API and the cart path test OLD_SUBSCRIPTION_PLANS_CLOSED on its own (an OR with the pause), so they stay closed
  // with SUBSCRIPTIONS_PAUSED = false.
  assert.match(read("api", "create-subscription-checkout.js"), /if \(OLD_SUBSCRIPTION_PLANS_CLOSED \|\| SUBSCRIPTIONS_PAUSED\)/);
  assert.match(read("src", "pages", "CheckoutPage.jsx"), /hasSubscription && \(OLD_SUBSCRIPTION_PLANS_CLOSED \|\| SUBSCRIPTIONS_PAUSED\)/);
});

test("footer (CEO 2026-11-21): one link for subscribers, to 珈琲の定期便's own page, shown also while sign-ups are paused; no earlier-plan Stripe link", () => {
  const footer = read("src", "components", "SiteFooter.jsx");
  assert.doesNotMatch(footer, /billing\.stripe\.com/, "the earlier plans' Stripe login link is gone");
  assert.match(footer, /<Link to="\/subscription\/manage">\{t\.coffeeSubscription\}<\/Link>/);
  assert.doesNotMatch(footer, /SUBSCRIPTIONS_PAUSED/, "subscribers keep the link whatever the sign-up switch says");
});
