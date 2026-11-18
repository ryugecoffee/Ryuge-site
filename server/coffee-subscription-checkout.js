"use strict";

// 珈琲の定期便: sign-up. One Stripe Checkout session in subscription mode:
//  - the first 200 g at ¥3,000 (a one-time price) is charged now and shipped once paid (invoice.paid);
//  - the monthly price for the chosen frequency starts at 00:00 JST on the 1st of the start month (a trial until then:
//    nothing else is charged before it), next month for a sign-up on the 1st–15th, the month after for the 16th–end;
//  - the coffee preference (optional, at most 300 characters, no personal or payment details) travels in the metadata.
// Off (404) unless COFFEE_SUBSCRIPTION_ENABLED=true and the five price ids are set; the store also keeps sign-ups
// paused (src/productData.js SUBSCRIPTIONS_PAUSED). Nothing here creates products or prices.

const plan = require("./coffee-subscription-plan");
const { KIND, SUBS } = require("./coffee-subscription-records");
const { normalizePreference, preferenceIssues } = require("./coffee-subscription-preference");

const PATH = "/coffee-subscription/checkout";

function configFrom(env = process.env) {
  const priceIds = { 1: env.STRIPE_PRICE_COFFEE_SUB_1, 2: env.STRIPE_PRICE_COFFEE_SUB_2, 3: env.STRIPE_PRICE_COFFEE_SUB_3, 4: env.STRIPE_PRICE_COFFEE_SUB_4 };
  const firstPriceId = env.STRIPE_PRICE_COFFEE_SUB_FIRST;
  const complete = Object.values(priceIds).every((id) => /^price_[A-Za-z0-9]+$/.test(String(id || ""))) && /^price_[A-Za-z0-9]+$/.test(String(firstPriceId || ""));
  return { enabled: env.COFFEE_SUBSCRIPTION_ENABLED === "true" && complete, priceIds, firstPriceId,
    siteUrl: String(env.SITE_URL || "https://ryuge.biz").replace(/\/+$/, "") };
}

class CheckoutError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}

const ACTIVE = ["trialing", "active", "past_due", "incomplete_record"];

async function createCheckout({ db, stripe, config, input, now = Date.now(), idempotencyKey }) {
  if (!config.enabled) throw new CheckoutError("DISABLED", 404);
  const frequency = (() => { try { return plan.validFrequency(input?.frequency); } catch { throw new CheckoutError("INVALID_FREQUENCY"); } })();
  const email = String(input?.email || "").trim().toLowerCase();
  if (!/^[^\s@]{1,100}@[^\s@]{1,150}\.[^\s@]+$/.test(email)) throw new CheckoutError("EMAIL_REQUIRED");
  const preference = normalizePreference(input?.preference || "");
  const issues = preferenceIssues(preference);
  if (issues.length) throw new CheckoutError(`PREFERENCE_${issues[0]}`);
  // One running subscription per email: a second sign-up would mean a second charge and a second delivery.
  const existing = await db.collection(SUBS).where("email", "==", email).limit(10).get();
  if (existing.docs.some((d) => ACTIVE.includes(d.data().status))) throw new CheckoutError("ALREADY_SUBSCRIBED", 409);
  const startMonth = plan.startMonthFor(now);
  const metadata = { kind: KIND, frequency: String(frequency), startMonth };
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: config.priceIds[frequency], quantity: 1 }, { price: config.firstPriceId, quantity: 1 }],
    subscription_data: { trial_end: plan.monthStartUnix(startMonth), metadata,
      trial_settings: { end_behavior: { missing_payment_method: "cancel" } } },
    payment_method_collection: "always",
    customer_email: email,
    shipping_address_collection: { allowed_countries: ["JP"] },
    locale: "ja",
    metadata: { ...metadata, preference },
    success_url: `${config.siteUrl}/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.siteUrl}/products#oriori`,
  }, idempotencyKey ? { idempotencyKey } : undefined);
  return { url: session.url, startMonth, firstCharge: plan.FIRST_DELIVERY_PRICE, monthly: plan.MONTHLY_PRICES[frequency] };
}

function createHandler({ getDb, getStripe, env = process.env, clock = Date.now } = {}) {
  return async function coffeeSubscriptionCheckout(req, res) {
    res.setHeader("Cache-Control", "no-store");
    const config = configFrom(env);
    if (!config.enabled) return res.status(404).end();
    try {
      const key = String(req.get("idempotency-key") || "");
      const result = await createCheckout({ db: getDb(), stripe: getStripe(), config, input: req.body, now: clock(),
        idempotencyKey: /^[A-Za-z0-9_-]{16,80}$/.test(key) ? `coffee-sub-${key}` : undefined });
      return res.json(result);
    } catch (error) {
      if (error instanceof CheckoutError) return res.status(error.status).json({ error: error.code });
      console.error("coffee subscription checkout failed:", String(error?.message).slice(0, 120));
      return res.status(500).json({ error: "CHECKOUT_FAILED" });
    }
  };
}

module.exports = { PATH, configFrom, createCheckout, createHandler, CheckoutError };
