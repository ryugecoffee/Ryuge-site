"use strict";

// 珈琲の定期便: sign-up. One Stripe Checkout session in subscription mode:
//  - the first 200 g at ¥3,000 (a one-time price) is charged now and shipped once paid (invoice.paid);
//  - the monthly price for the chosen frequency starts at 00:00 JST on the 1st of the start month (a trial until then:
//    nothing else is charged before it), next month for a sign-up on the 1st–15th, the month after for the 16th–end;
//  - the coffee preference (optional, at most 300 characters, no personal or payment details) travels in the metadata.
// One sign-up per email (2026-11-18: searching contracts by email cannot stop it, because a contract is only recorded
// when a Checkout is paid, so two Checkout pages opened before either is paid both pass the search):
//  - the email is reserved first, in a transaction on coffeeSubscriptionEmails/{sha256(email)}; while its Checkout is
//    open, another request for the same email gets the same Checkout page (one page, so one payment) instead of a new
//    one; a running subscription for the email refuses the sign-up (409);
//  - the reservation ends with the Checkout (30 minutes, or checkout.session.expired); a paid Checkout makes its
//    subscription the email's owner (coffee-subscription-records.js), and a second owner is never shipped to.
// Off (404) unless COFFEE_SUBSCRIPTION_ENABLED=true and the five price ids are set; the store also keeps sign-ups
// paused (src/productData.js SUBSCRIPTIONS_PAUSED). Nothing here creates products or prices.

const crypto = require("crypto");
const plan = require("./coffee-subscription-plan");
const { KIND, SUBS, EMAILS, RUNNING, emailKey } = require("./coffee-subscription-records");
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

const CHECKOUT_MINUTES = 30; // Stripe's shortest Checkout lifetime
const WAIT_FOR_OTHER_MS = 8000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const toMs = (value) => (value?.toMillis ? value.toMillis() : value instanceof Date ? value.getTime() : Number(value || 0));

// Reserves the email for one Checkout. Returns { url } of the open Checkout, { wait: true } while another request is
// creating it, or { nonce } when this request is to create it.
async function reserveEmail(db, email, now) {
  const ref = db.collection(EMAILS).doc(emailKey(email));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? snap.data() : null;
    if (current?.subscriptionId) {
      const owner = await tx.get(db.collection(SUBS).doc(current.subscriptionId));
      if (owner.exists && RUNNING.includes(owner.data().status)) throw new CheckoutError("ALREADY_SUBSCRIBED", 409);
    }
    if (current?.status === "pending" && toMs(current.expiresAt) > now + 60_000) {
      if (current.url) return { url: current.url, reused: true };
      if (toMs(current.reservedAt) > now - 60_000) return { wait: true };
    }
    const nonce = crypto.randomBytes(12).toString("hex");
    tx.set(ref, { status: "pending", nonce, sessionId: null, url: null, reservedAt: new Date(now),
      expiresAt: new Date(now + CHECKOUT_MINUTES * 60_000), updatedAt: new Date(now) }, { merge: true });
    return { nonce };
  });
}

async function finishReservation(db, email, nonce, patch) {
  const ref = db.collection(EMAILS).doc(emailKey(email));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.data().nonce === nonce) tx.update(ref, patch);
  });
}

// The terms next to Stripe's pay button (定期購入: amounts, the second charge's date, how to change or cancel).
// The pay button is on Stripe's page, where the card, the delivery address and the phone are entered: every item of
// 特定商取引法 第12条の6 is repeated next to it (Stripe's limit: 1,200 characters).
function submitTerms(startMonth, frequency) {
  const [y, m] = startMonth.split("-").map(Number);
  const days = plan.SHIPPING_DAYS[frequency].map((d) => `${d}日`).join("・");
  const T = plan.TERMS_JA;
  return `定期購入のお申し込みです。${T.term}`
    + `内容：当店おまかせの珈琲豆2種類（100g×2袋＝1回200g）を月${frequency}回お届けします。`
    + `本日のお支払いは初回200gの${plan.FIRST_DELIVERY_PRICE.toLocaleString("ja-JP")}円です（3営業日以内に発送）。`
    + `${y}年${m}月1日から毎月1日に月額${plan.MONTHLY_PRICES[frequency].toLocaleString("ja-JP")}円（税込・全国一律送料込み）を自動でお支払いいただき、毎月${days}に発送します（土日祝は翌営業日）。`
    + plan.annualReferenceText(frequency, startMonth)
    + `配送回数の変更・スキップは前月${plan.CHANGE_DEADLINE_DAY}日までのお手続きで翌月分から反映します。`
    + "解約はいつでも管理ページから行えます。毎月1日9時のご請求より前に解約されると、その月以降のご請求はありません。"
    + T.emailCancelShort + T.noFee + "お支払い済みの月の分はお届けし、日割りの返金はありません。" + T.refund + T.returns;
}

async function createCheckout({ db, stripe, config, input, now = Date.now(), waitMs = WAIT_FOR_OTHER_MS }) {
  if (!config.enabled) throw new CheckoutError("DISABLED", 404);
  const frequency = (() => { try { return plan.validFrequency(input?.frequency); } catch { throw new CheckoutError("INVALID_FREQUENCY"); } })();
  const email = String(input?.email || "").trim().toLowerCase();
  if (!/^[^\s@]{1,100}@[^\s@]{1,150}\.[^\s@]+$/.test(email)) throw new CheckoutError("EMAIL_REQUIRED");
  const preference = normalizePreference(input?.preference || "");
  const issues = preferenceIssues(preference);
  if (issues.length) throw new CheckoutError(`PREFERENCE_${issues[0]}`);
  // Contracts recorded before reservations existed (none in production yet; kept as a second check).
  const existing = await db.collection(SUBS).where("email", "==", email).limit(10).get();
  if (existing.docs.some((d) => RUNNING.includes(d.data().status))) throw new CheckoutError("ALREADY_SUBSCRIBED", 409);
  const startMonth = plan.startMonthFor(now);
  const summary = { startMonth, firstCharge: plan.FIRST_DELIVERY_PRICE, monthly: plan.MONTHLY_PRICES[frequency] };

  let reservation = await reserveEmail(db, email, now);
  for (let waited = 0; reservation.wait && waited < waitMs; waited += 250) {
    await sleep(250);
    reservation = await reserveEmail(db, email, now + waited);
  }
  if (reservation.wait) throw new CheckoutError("SIGNUP_IN_PROGRESS", 409);
  // The same open Checkout page for the same email: one page can only be paid once.
  if (reservation.url) return { url: reservation.url, reused: true, ...summary };

  const metadata = { kind: KIND, frequency: String(frequency), startMonth };
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: config.priceIds[frequency], quantity: 1 }, { price: config.firstPriceId, quantity: 1 }],
      subscription_data: { trial_end: plan.billingStartUnix(startMonth), metadata,
        trial_settings: { end_behavior: { missing_payment_method: "cancel" } } },
      payment_method_collection: "always",
      customer_email: email,
      shipping_address_collection: { allowed_countries: ["JP"] },
      phone_number_collection: { enabled: true },
      locale: "ja",
      // The terms next to Stripe's pay button (submitTerms); the same terms are on /subscription/apply.
      custom_text: { submit: { message: submitTerms(startMonth, frequency) } },
      expires_at: Math.floor(now / 1000) + CHECKOUT_MINUTES * 60,
      metadata: { ...metadata, preference },
      success_url: `${config.siteUrl}/subscription/manage?started=1`,
      cancel_url: `${config.siteUrl}/products#oriori`,
    }, { idempotencyKey: `coffee-sub-${reservation.nonce}` });
  } catch (error) {
    await finishReservation(db, email, reservation.nonce, { status: "released", updatedAt: new Date(now) }).catch(() => {});
    throw error;
  }
  await finishReservation(db, email, reservation.nonce, { sessionId: session.id, url: session.url,
    expiresAt: new Date(Number(session.expires_at || 0) * 1000 || now + CHECKOUT_MINUTES * 60_000), updatedAt: new Date(now) });
  return { url: session.url, ...summary };
}

function createHandler({ getDb, getStripe, env = process.env, clock = Date.now } = {}) {
  return async function coffeeSubscriptionCheckout(req, res) {
    res.setHeader("Cache-Control", "no-store");
    const config = configFrom(env);
    if (!config.enabled) return res.status(404).end();
    try {
      // Repeated requests are made safe by the email reservation (the same open Checkout is returned).
      const result = await createCheckout({ db: getDb(), stripe: getStripe(), config, input: req.body, now: clock() });
      return res.json(result);
    } catch (error) {
      if (error instanceof CheckoutError) return res.status(error.status).json({ error: error.code });
      console.error("coffee subscription checkout failed:", String(error?.message).slice(0, 120));
      return res.status(500).json({ error: "CHECKOUT_FAILED" });
    }
  };
}

module.exports = { PATH, configFrom, createCheckout, createHandler, CheckoutError, submitTerms };
