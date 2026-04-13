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
  "北海道",
  "青森県",
  "岩手県",
  "宮城県",
  "秋田県",
  "山形県",
  "福島県",
  "茨城県",
  "栃木県",
  "群馬県",
  "埼玉県",
  "千葉県",
  "東京都",
  "神奈川県",
  "新潟県",
  "富山県",
  "石川県",
  "福井県",
  "山梨県",
  "長野県",
  "岐阜県",
  "静岡県",
  "愛知県",
  "三重県",
  "滋賀県",
  "京都府",
  "大阪府",
  "兵庫県",
  "奈良県",
  "和歌山県",
  "鳥取県",
  "島根県",
  "岡山県",
  "広島県",
  "山口県",
  "徳島県",
  "香川県",
  "愛媛県",
  "高知県",
  "福岡県",
  "佐賀県",
  "長崎県",
  "熊本県",
  "大分県",
  "宮崎県",
  "鹿児島県",
  "沖縄県",
];

const UI = {
  ja: {
    eyebrow: "Checkout",
    title: "ご注文内容",
    orderSummary: "注文内容",
    shipping: "送料",
    free: "無料",
    calculating: "計算中...",
    total: "合計",
    shippingInfo: "お届け先",
    cardInfo: "カード情報",
    name: "お名前",
    email: "メールアドレス",
    countryType: "配送先",
    japan: "日本",
    other: "海外",
    postalCode: "郵便番号（例：2480012）",
    prefecture: "都道府県",
    address1Ja: "市区町村・番地",
    address2Ja: "建物名・部屋番号",
    country: "国 / 地域",
    state: "州 / 地域",
    city: "市区町村",
    address1: "Address Line 1",
    address2: "Address Line 2",
    address3: "Address Line 3（任意）",
    processing: "処理中...",
    pay: "を支払う",
    startSubscription: "サブスクを開始する",
    back: "← 戻る",
    subscriptionOnlyOne:
      "サブスクは1プランのみ購入できます。通常商品とは分けて決済してください。",
  },
  en: {
    eyebrow: "Checkout",
    title: "Order Summary",
    orderSummary: "Items",
    shipping: "Shipping",
    free: "Free",
    calculating: "Calculating...",
    total: "Total",
    shippingInfo: "Shipping Address",
    cardInfo: "Card Details",
    name: "Full Name",
    email: "Email Address",
    countryType: "Shipping destination",
    japan: "Japan",
    other: "International",
    postalCode: "Postal Code",
    prefecture: "Prefecture",
    address1Ja: "City, street address",
    address2Ja: "Building / Apt",
    country: "Country / Region",
    state: "State / Province / Region",
    city: "City",
    address1: "Address Line 1",
    address2: "Address Line 2",
    address3: "Address Line 3 (Optional)",
    processing: "Processing...",
    pay: "Pay",
    startSubscription: "Start Subscription",
    back: "← Back",
    subscriptionOnlyOne:
      "Subscription checkout supports one plan only. Please purchase regular items separately.",
  },
  es: {
    eyebrow: "Checkout",
    title: "Resumen del pedido",
    orderSummary: "Pedido",
    shipping: "Envío",
    free: "Gratis",
    calculating: "Calculando...",
    total: "Total",
    shippingInfo: "Dirección de envío",
    cardInfo: "Información de la tarjeta",
    name: "Nombre completo",
    email: "Correo electrónico",
    countryType: "Destino del envío",
    japan: "Japón",
    other: "Internacional",
    postalCode: "Código postal",
    prefecture: "Prefectura",
    address1Ja: "Ciudad, calle y número",
    address2Ja: "Edificio / Apartamento",
    country: "País / Región",
    state: "Estado / Provincia / Región",
    city: "Ciudad",
    address1: "Dirección 1",
    address2: "Dirección 2",
    address3: "Dirección 3 (Opcional)",
    processing: "Procesando...",
    pay: "Pagar",
    startSubscription: "Iniciar suscripción",
    back: "← Volver",
    subscriptionOnlyOne:
      "La suscripción solo admite un plan por compra. Compra los productos normales por separado.",
  },
};

const CARD_STYLE = {
  style: {
    base: {
      color: "#ffffff",
      fontFamily: "Inter, sans-serif",
      fontSize: "16px",
      fontSmoothing: "antialiased",
      "::placeholder": {
        color: "rgba(255,255,255,0.42)",
      },
    },
    invalid: {
      color: "#ff6b6b",
      iconColor: "#ff6b6b",
    },
  },
  hidePostalCode: true,
};

const inputStyle = {
  background: "transparent",
  border: "none",
  borderBottom: "1px solid rgba(255,255,255,0.14)",
  color: "rgba(255,255,255,0.82)",
  padding: "10px 0",
  fontSize: "14px",
  outline: "none",
  width: "100%",
};

function CheckoutForm({ cartItems, onSuccess, lang = "ja" }) {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const t = UI[lang] || UI.ja;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const [countryType, setCountryType] = useState("japan");
  const [postalCode, setPostalCode] = useState("");
  const [prefecture, setPrefecture] = useState("神奈川県");
  const [addressLine1Ja, setAddressLine1Ja] = useState("");
  const [addressLine2Ja, setAddressLine2Ja] = useState("");

  const [country, setCountry] = useState("");
  const [stateRegion, setStateRegion] = useState("");
  const [city, setCity] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [addressLine3, setAddressLine3] = useState("");

  const [shipping, setShipping] = useState(null);
  const [total, setTotal] = useState(null);
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

 const hasSubscription = (cartItems || []).some((item) =>
  item.id?.startsWith("subscription-")
);


  const cartSubtotal = (cartItems || []).reduce(
    (sum, item) => sum + (item.price || 0) * item.quantity,
    0
  );

  useEffect(() => {
    if (!cartItems || cartItems.length === 0) return;

    if (hasSubscription) {
      setShipping(0);
      setTotal(cartSubtotal);
      setClientSecret("");
      setError("");
      return;
    }

    const initCheckout = async () => {
      try {
        setError("");

        const response = await fetch(
          "https://ryuge-site.onrender.com/create-payment-intent",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: cartItems,
              prefecture: countryType === "japan" ? prefecture : "overseas",
              email: "tmp@tmp.com",
              name: "tmp",
              address: "tmp",
            }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to initialize checkout.");
        }

        setShipping(data.shipping);
        setTotal(data.total);
        setClientSecret(data.clientSecret);
      } catch (err) {
        setError(err.message || "Failed to initialize checkout.");
      }
    };

    initCheckout();
  }, [cartItems, prefecture, countryType, hasSubscription, cartSubtotal]);

  const buildFinalAddress = () => {
    if (countryType === "japan") {
      return `${prefecture} ${addressLine1Ja} ${addressLine2Ja}`.trim();
    }

    return [
      addressLine1,
      addressLine2,
      addressLine3,
      city,
      stateRegion,
      postalCode,
      country,
    ]
      .filter(Boolean)
      .join(", ");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const finalAddress = buildFinalAddress();

      if (hasSubscription) {
        if (cartItems.length !== 1 || cartItems[0].quantity !== 1) {
          setError(t.subscriptionOnlyOne);
          setLoading(false);
          return;
        }

        const response = await fetch("/api/create-subscription-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cartItems,
            customer: {
              name,
              email,
              postalCode,
              prefecture: countryType === "japan" ? prefecture : country,
              address: finalAddress,
            },
          }),
        });

        const data = await response.json();

        if (!response.ok || !data.url) {
          throw new Error(
            data.error || "Failed to start subscription checkout."
          );
        }

        window.location.href = data.url;
        return;
      }

      if (!stripe || !elements || !clientSecret) {
        setLoading(false);
        return;
      }

      const cardElement = elements.getElement(CardElement);

      if (!cardElement) {
        setError("Card form is not ready yet.");
        setLoading(false);
        return;
      }

      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: { name, email },
        },
      });

      if (result.error) {
        setError(result.error.message || "Payment failed.");
        setLoading(false);
        return;
      }

      await fetch("https://ryuge-site.onrender.com/order-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cartItems,
          name,
          email,
          postalCode,
          address: finalAddress,
          prefecture: countryType === "japan" ? prefecture : country,
          total,
          shipping,
        }),
      });

      onSuccess();

      navigate("/checkout/complete", {
        state: {
          name,
          email,
          postalCode,
          prefecture: countryType === "japan" ? prefecture : country,
          address:
            countryType === "japan"
              ? `${addressLine1Ja} ${addressLine2Ja}`.trim()
              : [addressLine1, addressLine2, addressLine3, city, stateRegion]
                  .filter(Boolean)
                  .join(", "),
          total,
          shipping,
          items: cartItems,
          countryType,
          lang,
        },
      });
    } catch (err) {
      setError(err.message || "Payment failed.");
      setLoading(false);
      return;
    }

    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="checkout-inner">
      <p className="checkout-eyebrow">{t.eyebrow}</p>
      <h1 className="checkout-title">{t.title}</h1>

      <div className="checkout-order-summary">
        <p className="checkout-section-label">{t.orderSummary}</p>

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
          <span className="checkout-order-title">{t.shipping}</span>
          <span className="checkout-order-price">
            {shipping === null
              ? t.calculating
              : shipping === 0
              ? t.free
              : `¥${shipping.toLocaleString()}`}
          </span>
        </div>

        <div className="checkout-order-total">
          <span>{t.total}</span>
          <span>
            {total === null ? t.calculating : `¥${total.toLocaleString()}`}
          </span>
        </div>
      </div>

      <div className="checkout-card-section">
        <p className="checkout-section-label">{t.shippingInfo}</p>

        <div
          className="checkout-card-container"
          style={{ display: "grid", gap: "12px" }}
        >
          <input
            type="text"
            placeholder={t.name}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={inputStyle}
          />

          <input
            type="email"
            placeholder={t.email}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
          />

          <select
            value={countryType}
            onChange={(e) => setCountryType(e.target.value)}
            style={{ ...inputStyle, background: "#111" }}
          >
            <option value="japan">{t.japan}</option>
            <option value="other">{t.other}</option>
          </select>

          {countryType === "japan" ? (
            <>
              <input
                type="text"
                placeholder={t.postalCode}
                value={postalCode}
                onChange={(e) =>
                  setPostalCode(e.target.value.replace(/\D/g, "").slice(0, 7))
                }
                required
                style={inputStyle}
              />

              <select
                value={prefecture}
                onChange={(e) => setPrefecture(e.target.value)}
                style={{ ...inputStyle, background: "#111" }}
              >
                {PREFECTURES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>

              <input
                type="text"
                placeholder={t.address1Ja}
                value={addressLine1Ja}
                onChange={(e) => setAddressLine1Ja(e.target.value)}
                required
                style={inputStyle}
              />

              <input
                type="text"
                placeholder={t.address2Ja}
                value={addressLine2Ja}
                onChange={(e) => setAddressLine2Ja(e.target.value)}
                style={inputStyle}
              />
            </>
          ) : (
            <>
              <input
                type="text"
                placeholder={t.country}
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                required
                style={inputStyle}
              />

              <input
                type="text"
                placeholder={t.postalCode}
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                required
                style={inputStyle}
              />

              <input
                type="text"
                placeholder={t.state}
                value={stateRegion}
                onChange={(e) => setStateRegion(e.target.value)}
                required
                style={inputStyle}
              />

              <input
                type="text"
                placeholder={t.city}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                required
                style={inputStyle}
              />

              <input
                type="text"
                placeholder={t.address1}
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                required
                style={inputStyle}
              />

              <input
                type="text"
                placeholder={t.address2}
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
                required
                style={inputStyle}
              />

              <input
                type="text"
                placeholder={t.address3}
                value={addressLine3}
                onChange={(e) => setAddressLine3(e.target.value)}
                style={inputStyle}
              />
            </>
          )}
        </div>
      </div>

      {!hasSubscription && (
        <div className="checkout-card-section">
          <p className="checkout-section-label">{t.cardInfo}</p>

          <div
            className="checkout-card-container"
            style={{
              padding: "18px 20px",
              minHeight: "64px",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: "16px",
              background: "rgba(255,255,255,0.02)",
              position: "relative",
              zIndex: 1,
            }}
          >
            <CardElement options={CARD_STYLE} />
          </div>
        </div>
      )}

      {error && <p className="checkout-error">{error}</p>}

      <button
        type="submit"
        className="checkout-pay-button"
        disabled={loading || (!hasSubscription && (!stripe || !clientSecret))}
      >
        {loading
          ? t.processing
          : hasSubscription
          ? t.startSubscription
          : `¥${total?.toLocaleString() ?? "..."} ${t.pay}`}
      </button>

      <button
        type="button"
        className="checkout-back-button"
        onClick={() => window.history.back()}
      >
        {t.back}
      </button>
    </form>
  );
}

export default function CheckoutPage({ cartItems, clearCart, lang = "ja" }) {
  return (
    <div className="checkout-page">
      <Elements stripe={stripePromise}>
        <CheckoutForm cartItems={cartItems} onSuccess={clearCart} lang={lang} />
      </Elements>
    </div>
  );
}