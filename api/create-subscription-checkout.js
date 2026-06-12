import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// プランIDは productData.js の plan.id (coffee-bag / mame / zen) に統一
const SUBSCRIPTION_PRICE_IDS = {
  "coffee-bag": process.env.STRIPE_PRICE_COFFEE_BAG,
  mame:         process.env.STRIPE_PRICE_MAME,
  zen:          process.env.STRIPE_PRICE_ZEN,
};

// プランタイトル（lang 別）- productData.js の plan.name と対応
const PLAN_TITLES = {
  "coffee-bag": { ja: "珈琲袋定期便",  en: "Coffee Bag Subscription",   es: "Suscripción de Coffee Bags" },
  mame:         { ja: "豆の定期便",    en: "Bean Subscription",         es: "Suscripción de Granos"      },
  zen:          { ja: "禅の仕立て便",  en: "Zen Selection",              es: "Selección Zen"              },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { cartItems, customer } = req.body;

    console.log("=== create-subscription-checkout start ===");
    console.log("cartItems:", cartItems);
    console.log("customer:", customer);
    console.log("env check:", {
      hasSecretKey:    !!process.env.STRIPE_SECRET_KEY,
      coffee_bag:      !!process.env.STRIPE_PRICE_COFFEE_BAG,
      mame:            !!process.env.STRIPE_PRICE_MAME,
      zen:             !!process.env.STRIPE_PRICE_ZEN,
      siteUrl:         process.env.NEXT_PUBLIC_SITE_URL,
      originHeader:    req.headers.origin,
      customerCountry: customer?.countryCode,
    });

    if (!cartItems || cartItems.length !== 1) {
      return res.status(400).json({ error: "Subscription checkout requires exactly one item." });
    }

    // ── 国チェック: 定期便は国内（JP）のみ ──────────────────────────────
    const customerCountryCode = customer?.countryCode || "JP";
    if (customerCountryCode !== "JP") {
      return res.status(400).json({
        error: "SUBSCRIPTION_DOMESTIC_ONLY",
        message: "Subscriptions are only available for delivery within Japan.",
      });
    }

    const item   = cartItems[0];
    const planId = item.id.replace("subscription-", "");
    console.log("planId:", planId);

    if (!["coffee-bag", "mame", "zen"].includes(planId)) {
      return res.status(400).json({ error: "Invalid subscription plan." });
    }

    const priceId = SUBSCRIPTION_PRICE_IDS[planId];
    if (!priceId) {
      return res.status(400).json({ error: "Missing Stripe price ID." });
    }

    const lang      = customer?.lang || "ja";
    const planTitle = PLAN_TITLES[planId]?.[lang] || PLAN_TITLES[planId]?.ja || planId;

    const origin =
      req.headers.origin ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "https://ryuge-site.vercel.app";

    console.log("origin:", origin);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/checkout`,
      customer_email: customer?.email || undefined,
      metadata: {
        planId,
        planTitle,
        customerEmail: customer?.email     || "",
        customerName:  customer?.name      || "",
        postalCode:    customer?.postalCode || "",
        prefecture:    customer?.prefecture || "",
        address:       customer?.address    || "",
        lang,
      },
    });

    console.log("session created:", session?.id, session?.url);
    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error("create-subscription-checkout error full:", err);
    return res.status(500).json({
      error: err.message || "Failed to create subscription checkout session.",
      type:  err.type   || null,
      code:  err.code   || null,
      param: err.param  || null,
    });
  }
}