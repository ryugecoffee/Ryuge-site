export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { sourceId, cartItems } = req.body;

  if (!sourceId || !cartItems || cartItems.length === 0) {
    return res.status(400).json({ error: "Invalid request: missing sourceId or cartItems" });
  }

  const amountMoney = cartItems.reduce(
    (sum, item) => sum + (item.price || 0) * item.quantity,
    0
  );

  if (amountMoney <= 0) {
    return res.status(400).json({ error: "Invalid amount: " + amountMoney });
  }

  const token = process.env.SQUARE_ACCESS_TOKEN;
  const env = process.env.SQUARE_ENVIRONMENT;

  console.log("ENV:", env);
  console.log("TOKEN prefix:", token?.slice(0, 10));
  console.log("Amount:", amountMoney);
  console.log("SourceId:", sourceId?.slice(0, 20));

  const url = env === "sandbox"
    ? "https://connect.squareupsandbox.com/v2/payments"
    : "https://connect.squareup.com/v2/payments";

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "Square-Version": "2024-01-18",
      },
      body: JSON.stringify({
        source_id: sourceId,
        idempotency_key: `${Date.now()}-${Math.random()}`,
        amount_money: {
          amount: amountMoney,
          currency: "JPY",
        },
        location_id: "L50FAXZHCP6YM",
      }),
    });

    const data = await response.json();
    console.log("Square response:", JSON.stringify(data, null, 2));

    if (!response.ok) {
      return res.status(400).json({
        error: data.errors?.[0]?.detail || "Payment failed",
        full: data,
      });
    }

    return res.status(200).json({ success: true, payment: data.payment });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
}