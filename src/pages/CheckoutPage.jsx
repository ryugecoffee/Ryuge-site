import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

const PREFECTURES = [
  "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県",
  "茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県",
  "新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県",
  "静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県",
  "奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県",
  "徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県",
  "熊本県","大分県","宮崎県","鹿児島県","沖縄県",
];

const CARD_STYLE = {
  style: {
    base: {
      color: "rgba(255,255,255,0.82)",
      fontFamily: "Inter, sans-serif",
      fontSize: "14px",
      "::placeholder": { color: "rgba(255,255,255,0.28)" },
    },
    invalid: { color: "rgba(255,100,100,0.9)" },
  },
};

function CheckoutForm({ cartItems, onSuccess }) {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [prefecture, setPrefecture] = useState("神奈川県");
  const [address, setAddress] = useState("");
  const [shipping, setShipping] = useState(null);
  const [total, setTotal] = useState(null);
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const subtotal = cartItems.reduce(
    (sum, item) => sum + item.price * item.quantity, 0
  );

  // 送料取得
  useEffect(() => {
    if (cartItems.length === 0) return;
    fetch("http://localhost:3001/create-payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: cartItems, prefecture, email: "tmp@tmp.com", name: "tmp", address: "tmp" }),
    })
      .then((r) => r.json())
      .then((data) => {
        setShipping(data.shipping);
        setTotal(data.total);
        setClientSecret(data.clientSecret);
      });
  }, [cartItems, prefecture]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements || !clientSecret) return;
    setLoading(true);
    setError("");

    const result = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: elements.getElement(CardElement),
        billing_details: { name, email },
      },
    });

    if (result.error) {
      setError(result.error.message);
      setLoading(false);
      return;
    }

    // 注文完了メール送信
    await fetch("http://localhost:3001/order-complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: cartItems, name, email, address, prefecture, total, shipping }),
    });

    onSuccess();
    navigate("/checkout/complete");
  };

  return (
    <form onSubmit={handleSubmit} className="checkout-inner">
      <p className="checkout-eyebrow">Checkout</p>
      <h1 className="checkout-title">ご注文内容</h1>

      {/* 注文サマリー */}
      <div className="checkout-order-summary">
        <p className="checkout-section-label">注文内容</p>
        {cartItems.map((item) => (
          <div key={item.id} className="checkout-order-item">
            <span className="checkout-order-title">{item.title}</span>
            <span className="checkout-order-qty">× {item.quantity}</span>
            <span className="checkout-order-price">
              ¥{(item.price * item.quantity).toLocaleString()}
            </span>
          </div>
        ))}
        <div className="checkout-order-item">
          <span className="checkout-order-title">送料</span>
          <span className="checkout-order-price">
            {shipping === null ? "計算中..." : shipping === 0 ? "無料" : `¥${shipping.toLocaleString()}`}
          </span>
        </div>
        <div className="checkout-order-total">
          <span>合計</span>
          <span>{total === null ? "計算中..." : `¥${total.toLocaleString()}`}</span>
        </div>
      </div>

      {/* お届け先 */}
      <div className="checkout-card-section">
        <p className="checkout-section-label">お届け先</p>
        <div className="checkout-card-container" style={{ display: "grid", gap: "12px" }}>
          <input
            type="text"
            placeholder="お名前"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={{
              background: "transparent",
              border: "none",
              borderBottom: "1px solid rgba(255,255,255,0.14)",
              color: "rgba(255,255,255,0.82)",
              padding: "8px 0",
              fontSize: "14px",
              outline: "none",
              width: "100%",
            }}
          />
          <input
            type="email"
            placeholder="メールアドレス"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              background: "transparent",
              border: "none",
              borderBottom: "1px solid rgba(255,255,255,0.14)",
              color: "rgba(255,255,255,0.82)",
              padding: "8px 0",
              fontSize: "14px",
              outline: "none",
              width: "100%",
            }}
          />
          <select
            value={prefecture}
            onChange={(e) => setPrefecture(e.target.value)}
            style={{
              background: "#111",
              border: "none",
              borderBottom: "1px solid rgba(255,255,255,0.14)",
              color: "rgba(255,255,255,0.82)",
              padding: "8px 0",
              fontSize: "14px",
              outline: "none",
              width: "100%",
            }}
          >
            {PREFECTURES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="市区町村・番地・建物名"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required
            style={{
              background: "transparent",
              border: "none",
              borderBottom: "1px solid rgba(255,255,255,0.14)",
              color: "rgba(255,255,255,0.82)",
              padding: "8px 0",
              fontSize: "14px",
              outline: "none",
              width: "100%",
            }}
          />
        </div>
      </div>

      {/* カード情報 */}
      <div className="checkout-card-section">
        <p className="checkout-section-label">カード情報</p>
        <div className="checkout-card-container">
          <CardElement options={CARD_STYLE} />
        </div>
      </div>

      {error && <p className="checkout-error">{error}</p>}

      <button
        type="submit"
        className="checkout-pay-button"
        disabled={!stripe || loading || !clientSecret}
      >
        {loading ? "処理中..." : `¥${total?.toLocaleString() ?? "..."} を支払う`}
      </button>

      <button
        type="button"
        className="checkout-back-button"
        onClick={() => window.history.back()}
      >
        ← 戻る
      </button>
    </form>
  );
}

export default function CheckoutPage({ cartItems, clearCart }) {
  return (
    <div className="checkout-page">
      <Elements stripe={stripePromise}>
        <CheckoutForm cartItems={cartItems} onSuccess={clearCart} />
      </Elements>
    </div>
  );
}