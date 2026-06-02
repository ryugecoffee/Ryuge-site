import { trackBeginCheckout } from "../lib/analytics";
import { useState, useEffect, useMemo } from "react";
import { useCart } from "../CartContext";
import { useNavigate } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

const SINGLE_ITEM_SHIPPING = 200;

const PREFECTURES = [
  "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県",
  "茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県",
  "新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県",
  "静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県",
  "奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県",
  "徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県",
  "熊本県","大分県","宮崎県","鹿児島県","沖縄県",
];

const UI = {
  ja: {
    eyebrow: "Checkout",
    title: "ご注文内容",
    orderSummary: "注文内容",
    shipping: "送料",
    free: "無料",
    total: "合計",
    shippingInfo: "お届け先",
    cardInfo: "カード情報",
    name: "お名前",
    email: "メールアドレス",
    postalCode: "郵便番号（例：2480012）",
    prefecture: "都道府県",
    address1Ja: "市区町村・番地",
    address2Ja: "建物名・部屋番号",
    processing: "処理中...",
    pay: "を支払う",
    startSubscription: "サブスクを開始する",
    back: "← 戻る",
    subscriptionOnlyOne: "サブスクは1プランのみ購入できます。通常商品とは分けて決済してください。",
    checkoutInitError: "決済情報の初期化に失敗しました。",
    cardNotReady: "カード入力フォームの準備ができていません。",
    paymentFailed: "決済に失敗しました。",
    subscriptionStartError: "サブスク決済の開始に失敗しました。",
    couponLabel: "クーポンコード",
    couponApply: "適用",
    couponApplied: "クーポン適用済み",
    couponInvalid: "無効なクーポンコードです",
    couponApplying: "確認中...",
  },
  en: {
    eyebrow: "Checkout",
    title: "Order Summary",
    orderSummary: "Items",
    shipping: "Shipping",
    free: "Free",
    total: "Total",
    shippingInfo: "Shipping Address",
    cardInfo: "Card Details",
    name: "Full Name",
    email: "Email Address",
    postalCode: "Postal Code",
    prefecture: "Prefecture",
    address1Ja: "City, street address",
    address2Ja: "Building / Apt",
    processing: "Processing...",
    pay: "Pay",
    startSubscription: "Start Subscription",
    back: "← Back",
    subscriptionOnlyOne: "Subscription checkout supports one plan only. Please purchase regular items separately.",
    checkoutInitError: "Failed to initialize checkout.",
    cardNotReady: "Card form is not ready yet.",
    paymentFailed: "Payment failed.",
    subscriptionStartError: "Failed to start subscription checkout.",
    couponLabel: "Coupon Code",
    couponApply: "Apply",
    couponApplied: "Coupon applied",
    couponInvalid: "Invalid coupon code",
    couponApplying: "Checking...",
  },
  es: {
    eyebrow: "Checkout",
    title: "Resumen del pedido",
    orderSummary: "Pedido",
    shipping: "Envío",
    free: "Gratis",
    total: "Total",
    shippingInfo: "Dirección de envío",
    cardInfo: "Información de la tarjeta",
    name: "Nombre completo",
    email: "Correo electrónico",
    postalCode: "Código postal",
    prefecture: "Prefectura",
    address1Ja: "Ciudad, calle y número",
    address2Ja: "Edificio / Apartamento",
    processing: "Procesando...",
    pay: "Pagar",
    startSubscription: "Iniciar suscripción",
    back: "← Volver",
    subscriptionOnlyOne: "La suscripción solo admite un plan por compra. Compra los productos normales por separado.",
    checkoutInitError: "No se pudo inicializar el pago.",
    cardNotReady: "El formulario de tarjeta aún no está listo.",
    paymentFailed: "El pago falló.",
    subscriptionStartError: "No se pudo iniciar la suscripción.",
    couponLabel: "Código de cupón",
    couponApply: "Aplicar",
    couponApplied: "Cupón aplicado",
    couponInvalid: "Código de cupón inválido",
    couponApplying: "Verificando...",
  },
};

const CARD_STYLE = {
  style: {
    base: {
      color: "#ffffff",
      fontFamily: "Inter, sans-serif",
      fontSize: "16px",
      fontSmoothing: "antialiased",
      "::placeholder": { color: "rgba(255,255,255,0.42)" },
    },
    invalid: { color: "#ff6b6b", iconColor: "#ff6b6b" },
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

function isSubscriptionItem(item) {
  return item?.id?.startsWith("subscription-");
}

function CheckoutForm({ cartItems, onSuccess, lang = "ja" }) {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const t = UI[lang] || UI.ja;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [prefecture, setPrefecture] = useState("神奈川県");
  const [addressLine1Ja, setAddressLine1Ja] = useState("");
  const [addressLine2Ja, setAddressLine2Ja] = useState("");

  const [shipping, setShipping] = useState(null);
  const [total, setTotal] = useState(null);
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponStatus, setCouponStatus] = useState("idle");
  const [couponDiscount, setCouponDiscount] = useState(null);

  const hasSubscription = useMemo(
    () => (cartItems || []).some((item) => isSubscriptionItem(item)),
    [cartItems]
  );

  const cartSubtotal = useMemo(
    () => (cartItems || []).reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0),
    [cartItems]
  );

  const totalQuantity = useMemo(
    () => (cartItems || []).filter((i) => !isSubscriptionItem(i)).reduce((sum, i) => sum + (i.quantity || 0), 0),
    [cartItems]
  );

  // 送料を先にフロントで計算して即表示
  const computedShipping = hasSubscription ? 0 : totalQuantity <= 1 ? SINGLE_ITEM_SHIPPING : 0;

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
              prefecture,
              countryType: "japan",
              shipping: computedShipping,
              couponCode: couponStatus === "valid" ? couponCode : "",
              email: "tmp@tmp.com",
              name: "tmp",
              address: "tmp",
            }),
          }
        );

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || t.checkoutInitError);

        // 送料はフロントで計算した値を正とし、サーバー値で上書きしない
        // クーポン適用時はサーバーが割引後合計を計算するのでそちらを使う
        setShipping(computedShipping);
        setTotal(couponStatus === "valid" ? data.total : cartSubtotal + computedShipping);
        setClientSecret(data.clientSecret);
      } catch (err) {
        setShipping(computedShipping);
        setTotal(cartSubtotal + computedShipping);
        setClientSecret("");
        setError(err.message || t.checkoutInitError);
      }
    };

    initCheckout();
  }, [cartItems, prefecture, hasSubscription, cartSubtotal, couponStatus, couponCode]);

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponStatus("applying");
    try {
      const res = await fetch("https://ryuge-site.onrender.com/validate-coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ couponCode: couponCode.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setCouponStatus("valid");
        setCouponDiscount(data.discount || null);
      } else {
        setCouponStatus("invalid");
        setCouponDiscount(null);
      }
    } catch {
      setCouponStatus("invalid");
      setCouponDiscount(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    trackBeginCheckout(cartItems);
    setLoading(true);
    setError("");

    const finalAddress = (prefecture + " " + addressLine1Ja + " " + addressLine2Ja).trim();

    try {
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
              name, email, postalCode, prefecture,
              address: finalAddress,
              lang,
            },
          }),
        });
        const data = await response.json();
        if (!response.ok || !data.url) throw new Error(data.error || t.subscriptionStartError);
        window.location.href = data.url;
        return;
      }

      if (!stripe || !elements || !clientSecret) {
        setError(t.cardNotReady);
        setLoading(false);
        return;
      }

      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        setError(t.cardNotReady);
        setLoading(false);
        return;
      }

      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            name, email,
            address: { country: "JP", postal_code: postalCode, state: prefecture, line1: addressLine1Ja, line2: addressLine2Ja },
          },
        },
      });

      if (result.error) {
        setError(result.error.message || t.paymentFailed);
        setLoading(false);
        return;
      }

      await fetch("https://ryuge-site.onrender.com/order-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cartItems, name, email, postalCode,
          address: finalAddress,
          prefecture,
          countryType: "japan",
          couponCode: couponStatus === "valid" ? couponCode : "",
          total, shipping,
          lang,
        }),
      });

      onSuccess();
      navigate("/checkout/complete", {
        state: {
          name, email, postalCode, prefecture,
          address: (addressLine1Ja + " " + addressLine2Ja).trim(),
          total, shipping,
          items: cartItems,
          lang,
        },
      });
    } catch (err) {
      setError(err.message || t.paymentFailed);
      setLoading(false);
    }

    setLoading(false);
  };

  const displayShipping = shipping ?? computedShipping;
  const displayTotal = total ?? (cartSubtotal + computedShipping);

  return (
    <form onSubmit={handleSubmit} className="checkout-inner">
      <p className="checkout-eyebrow">{t.eyebrow}</p>
      <h1 className="checkout-title">{t.title}</h1>

      <div className="checkout-order-summary">
        <p className="checkout-section-label">{t.orderSummary}</p>
        {cartItems.map((item) => (
          <div key={item.id} className="checkout-order-item">
            <span className="checkout-order-title">{item.name}</span>
            <span className="checkout-order-qty">{"×"} {item.quantity}</span>
            <span className="checkout-order-price">{"¥"}{((item.price || 0) * (item.quantity || 0)).toLocaleString()}</span>
          </div>
        ))}

        <div className="checkout-order-item">
          <span className="checkout-order-title">{t.shipping}</span>
          <span className="checkout-order-price">
            {displayShipping === 0 ? t.free : "¥" + displayShipping.toLocaleString()}
          </span>
        </div>

        <div className="checkout-order-total">
          <span>{t.total}</span>
          <span>{"¥"}{displayTotal.toLocaleString()}</span>
        </div>
      </div>

      <div className="checkout-card-section">
        <p className="checkout-section-label">{t.shippingInfo}</p>
        <div className="checkout-card-container" style={{ display: "grid", gap: "12px" }}>
          <input type="text" placeholder={t.name} value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} />
          <input type="email" placeholder={t.email} value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} />
          <input type="text" placeholder={t.postalCode} value={postalCode} onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, "").slice(0, 7))} required style={inputStyle} />
          <select value={prefecture} onChange={(e) => setPrefecture(e.target.value)} style={{ ...inputStyle, background: "#111" }}>
            {PREFECTURES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <input type="text" placeholder={t.address1Ja} value={addressLine1Ja} onChange={(e) => setAddressLine1Ja(e.target.value)} required style={inputStyle} />
          <input type="text" placeholder={t.address2Ja} value={addressLine2Ja} onChange={(e) => setAddressLine2Ja(e.target.value)} style={inputStyle} />
        </div>
      </div>

      {!hasSubscription && (
        <div className="checkout-card-section">
          <p className="checkout-section-label">{t.couponLabel}</p>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <input
              type="text"
              placeholder={t.couponLabel}
              value={couponCode}
              onChange={(e) => {
                setCouponCode(e.target.value);
                if (couponStatus !== "idle") setCouponStatus("idle");
              }}
              style={{ ...inputStyle, flex: 1 }}
              disabled={couponStatus === "valid"}
            />
            <button
              type="button"
              onClick={handleApplyCoupon}
              disabled={couponStatus === "applying" || couponStatus === "valid" || !couponCode.trim()}
              style={{
                border: "1px solid rgba(255,255,255,0.2)",
                background: "transparent",
                color: "rgba(255,255,255,0.8)",
                borderRadius: "999px",
                padding: "8px 16px",
                fontSize: "12px",
                cursor: "pointer",
                whiteSpace: "nowrap",
                opacity: couponStatus === "valid" ? 0.5 : 1,
              }}
            >
              {couponStatus === "applying" ? t.couponApplying : t.couponApply}
            </button>
          </div>
          {couponStatus === "valid" && (
            <p style={{ margin: "6px 0 0", fontSize: "12px", color: "rgba(100,255,150,0.9)" }}>{"✓"} {t.couponApplied}</p>
          )}
          {couponStatus === "invalid" && (
            <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#ff6b6b" }}>{t.couponInvalid}</p>
          )}
        </div>
      )}

      {!hasSubscription && (
        <div className="checkout-card-section">
          <p className="checkout-section-label">{t.cardInfo}</p>
          <div className="checkout-card-container" style={{ position: "relative", zIndex: 1 }}>
            <CardElement options={CARD_STYLE} />
          </div>
        </div>
      )}

      {error && <p className="checkout-error">{error}</p>}

      <button
        type="submit"
        className="checkout-pay-button"
        disabled={
          loading ||
          (!hasSubscription && (!stripe || !clientSecret))
        }
      >
        {loading ? t.processing
          : hasSubscription ? t.startSubscription
          : "¥" + (displayTotal ? displayTotal.toLocaleString() : "...") + " " + t.pay}
      </button>

      <button type="button" className="checkout-back-button" onClick={() => window.history.back()}>
        {t.back}
      </button>
    </form>
  );
}

export default function CheckoutPage({ lang = "ja" }) {
  const { cartItems, clearCart } = useCart();
  return (
    <div className="checkout-page">
      <Elements stripe={stripePromise}>
        <CheckoutForm cartItems={cartItems} onSuccess={clearCart} lang={lang} />
      </Elements>
    </div>
  );
}
