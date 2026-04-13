import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const SUBSCRIPTION_PRICE_IDS = {
  light: process.env.STRIPE_PRICE_LIGHT,
  basic: process.env.STRIPE_PRICE_BASIC,
  premium: process.env.STRIPE_PRICE_PREMIUM,
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { cartItems, customer } = req.body;

    if (!cartItems || cartItems.length !== 1) {
      return res
        .status(400)
        .json({ error: "Subscription checkout requires exactly one item." });
    }

    const item = cartItems[0];

    const planId = item.id.replace("subscription-", "");

    if (!["light", "basic", "premium"].includes(planId)) {
      return res.status(400).json({ error: "Invalid subscription plan." });
    }

    const priceId = SUBSCRIPTION_PRICE_IDS[planId];

    if (!priceId) {
      return res.status(400).json({ error: "Missing Stripe price ID." });
    }

    const origin =
      req.headers.origin ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "https://ryuge-site.vercel.app";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${origin}/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout`,
      customer_email: customer?.email || undefined,
      metadata: {
        planId: planId,
        customerName: customer?.name || "",
        postalCode: customer?.postalCode || "",
        prefecture: customer?.prefecture || "",
        address: customer?.address || "",
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("create-subscription-checkout error:", err);
    return res.status(500).json({
      error: err.message || "Failed to create subscription checkout session.",
    });
  }
}