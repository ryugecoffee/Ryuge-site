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
import {
  calcShipping,
  getZone,
  COUNTRY_ZONES,
} from "../lib/shipping";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

// ── 米国配送フラグ（環境変数 VITE_ENABLE_US_SHIPPING=true で有効化）──
const ENABLE_US_SHIPPING = import.meta.env.VITE_ENABLE_US_SHIPPING === "true";

const PREFECTURES = [
  "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県",
  "茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県",
  "新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県",
  "静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県",
  "奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県",
  "徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県",
  "熊本県","大分県","宮崎県","鹿児島県","沖縄県",
];

// ── 国セレクト用リスト（JP を先頭に、以降は COUNTRY_ZONES の全コードをアルファベット順）──
const COUNTRY_CODES_FOR_SELECT = [
  "JP",
  // 第1地帯
  "CN","KR","TW",
  // 第2地帯
  "BD","BT","HK","ID","IN","KH","LA","LK","MM","MN","MO","MV","MY",
  "NP","PH","PK","SG","TH","VN",
  // 第3地帯（欧州）
  "AL","AM","AT","AZ","BA","BE","BG","BY","CH","CY","CZ","DE","DK",
  "EE","ES","FI","FR","GB","GE","GR","HR","HU","IE","IL","IS","IT",
  "JO","LT","LU","LV","MD","ME","MK","MT","NL","NO","PL","PT","RO",
  "RS","RU","SE","SI","SK","TR","UA",
  // 第3地帯（中近東）
  "AE","BH","EG","IQ","IR","KW","LB","OM","QA","SA","SY","YE",
  // 第3地帯（オセアニア）
  "AU","FJ","NZ","PG","SB","TO","VU","WS",
  // 第3地帯（北米）
  "CA","MX",
  // 第4地帯（米国）
  "US",
  // 第5地帯（中南米）
  "AG","AR","BB","BO","BR","BS","BZ","CL","CO","CR","CU","DM","DO",
  "EC","GD","GT","GY","HN","HT","JM","KN","KY","LC","NI","PA","PE",
  "PY","SR","SV","TC","TT","UY","VC","VE",
  // 第5地帯（アフリカ）
  "AO","BF","BJ","BW","CD","CF","CG","CI","CM","DJ","DZ","EG","ER",
  "ET","GA","GH","GM","GN","GW","KE","LR","LS","LY","MA","MG","ML",
  "MR","MU","MW","MZ","NA","NE","NG","RE","RW","SC","SD","SL","SN",
  "SO","SZ","TD","TG","TN","TZ","UG","YT","ZA","ZM","ZW",
];

// Intl.DisplayNames でロケール別の国名を取得
function getCountryName(code, locale) {
  try {
    const dn = new Intl.DisplayNames(
      [locale === "ja" ? "ja" : locale === "es" ? "es" : "en"],
      { type: "region" }
    );
    return dn.of(code) || code;
  } catch {
    return code;
  }
}

// ── UI テキスト ──────────────────────────────────────────────────────────────
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
    shippingNote: "昨今の価格高騰の中でも、より多くの方に自宅でコーヒーを楽しんでいただけるよう、全国一律の送料設定としております。その分、包装は簡易的なものとなっておりますが、ご理解いただけますと幸いです。",
    // 国際配送
    countryLabel: "お届け先の国・地域",
    countryJapan: "日本（国内）",
    addressLine1: "番地・通り名 / Street Address",
    city: "市区町村 / City",
    state: "州・省 / State / Province",
    phone: "電話番号 / Phone Number",
    intlSubscriptionBlocked: "定期便は国内のみご利用いただけます。海外へのお届けには現在対応しておりません。",
    intlUSBlocked: "現在、米国への配送は準備中です。詳しくはお問い合わせください（ryugecoffee@gmail.com）。",
    intlUnsupported: "申し訳ございませんが、現在この国へのお届けには対応しておりません。お問い合わせください（ryugecoffee@gmail.com）。",
    intlOverWeight: "合計重量が2,000gを超えています。大口注文のお問い合わせはryugecoffee@gmail.comまでご連絡ください。",
    intlShippingMethod: "配送方法：日本郵便 EMS（国際スピード郵便）",
    intlDeliveryDays: "発送後、通常5〜10日程度でお届けします（地域・通関状況により異なります）。",
    customsDutyNote: "輸入関税・税金が課される場合があり、受取人のご負担となります。",
    calculatingShipping: "送料計算中...",
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
    shippingNote: "To make specialty coffee accessible to as many people as possible despite rising costs, we keep our shipping rates low nationwide. Packaging is kept simple to reflect this.",
    // International shipping
    countryLabel: "Destination Country / Region",
    countryJapan: "Japan (Domestic)",
    addressLine1: "Street Address",
    city: "City",
    state: "State / Province",
    phone: "Phone Number",
    intlSubscriptionBlocked: "Subscriptions are only available for delivery within Japan. International subscription shipping is not currently supported.",
    intlUSBlocked: "Shipping to the United States is currently being prepared. Please contact us at ryugecoffee@gmail.com for details.",
    intlUnsupported: "We're sorry, we cannot ship to this country at this time. Please contact us at ryugecoffee@gmail.com.",
    intlOverWeight: "Total weight exceeds 2,000g. For large orders, please contact us at ryugecoffee@gmail.com.",
    intlShippingMethod: "Shipping method: Japan Post EMS (Express Mail Service)",
    intlDeliveryDays: "Usually delivered within 5–10 days after shipment (varies by region and customs clearance).",
    customsDutyNote: "Import duties and taxes may apply and are the responsibility of the recipient.",
    calculatingShipping: "Calculating shipping...",
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
    shippingNote: "Para que el café de especialidad sea accesible a todos a pesar del aumento de costos, mantenemos tarifas de envío bajas en todo Japón. El embalaje es sencillo para reflejar esto.",
    // Envío internacional
    countryLabel: "País / Región de destino",
    countryJapan: "Japón (Nacional)",
    addressLine1: "Dirección",
    city: "Ciudad",
    state: "Estado / Provincia",
    phone: "Número de teléfono",
    intlSubscriptionBlocked: "Las suscripciones solo están disponibles para envíos dentro de Japón. El envío internacional de suscripciones no está disponible actualmente.",
    intlUSBlocked: "El envío a los Estados Unidos está en preparación. Contáctenos en ryugecoffee@gmail.com para más detalles.",
    intlUnsupported: "Lo sentimos, no podemos enviar a este país actualmente. Contáctenos en ryugecoffee@gmail.com.",
    intlOverWeight: "El peso total supera los 2.000g. Para pedidos grandes, contáctenos en ryugecoffee@gmail.com.",
    intlShippingMethod: "Método de envío: Japan Post EMS (Servicio de Correo Expreso Internacional)",
    intlDeliveryDays: "Generalmente entregado en 5–10 días tras el envío (varía según región y aduanas).",
    customsDutyNote: "Pueden aplicarse derechos de importación e impuestos, que son responsabilidad del destinatario.",
    calculatingShipping: "Calculando envío...",
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

// ── メイン Checkout フォーム ────────────────────────────────────────────────
function CheckoutForm({ cartItems, onSuccess, lang = "ja" }) {
  const stripe   = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const t = UI[lang] || UI.ja;

  // 共通フィールド
  const [name,    setName]    = useState("");
  const [email,   setEmail]   = useState("");
  const [country, setCountry] = useState("JP");

  // 国内フィールド
  const [postalCode,     setPostalCode]     = useState("");
  const [prefecture,     setPrefecture]     = useState("神奈川県");
  const [addressLine1Ja, setAddressLine1Ja] = useState("");
  const [addressLine2Ja, setAddressLine2Ja] = useState("");

  // 国際フィールド
  const [addressLine1,   setAddressLine1]   = useState("");
  const [addressLine2,   setAddressLine2]   = useState("");
  const [city,           setCity]           = useState("");
  const [stateProvince,  setStateProvince]  = useState("");
  const [intlPostalCode, setIntlPostalCode] = useState("");
  const [phone,          setPhone]          = useState("");

  // 決済状態
  const [shipping,      setShipping]      = useState(null);
  const [total,         setTotal]         = useState(null);
  const [clientSecret,  setClientSecret]  = useState("");
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState("");

  // クーポン
  const [couponCode,   setCouponCode]   = useState("");
  const [couponStatus, setCouponStatus] = useState("idle");

  // ── 派生値 ──────────────────────────────────────────────────────────────
  const isInternational = country !== "JP";
  const isUSBlocked     = country === "US" && !ENABLE_US_SHIPPING;

  const hasSubscription = useMemo(
    () => (cartItems || []).some(isSubscriptionItem),
    [cartItems]
  );

  const cartSubtotal = useMemo(
    () => (cartItems || []).reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0),
    [cartItems]
  );

  // クライアントサイドで送料を計算（即時表示用）
  const shippingCalcResult = useMemo(() => {
    if (hasSubscription) return { amount: 0 };
    const nonSubItems = (cartItems || []).filter((i) => !isSubscriptionItem(i));
    const result = calcShipping(nonSubItems, country);
    if (typeof result === "object" && result.error) return result;
    return { amount: result };
  }, [cartItems, country, hasSubscription]);

  const computedShipping = shippingCalcResult.amount ?? null;
  const shippingErrCode  = shippingCalcResult.error  ?? null;

  // ── ブロック条件 ─────────────────────────────────────────────────────────
  const isBlocked =
    (isInternational && hasSubscription) ||
    isUSBlocked ||
    (isInternational && (shippingErrCode === "OVER_WEIGHT" || shippingErrCode === "UNSUPPORTED_COUNTRY"));

  // ── PaymentIntent 初期化 ─────────────────────────────────────────────────
  useEffect(() => {
    if (!cartItems || cartItems.length === 0) return;

    if (hasSubscription) {
      setShipping(0);
      setTotal(cartSubtotal);
      setClientSecret("");
      setError("");
      return;
    }

    if (isBlocked) {
      setShipping(computedShipping);
      setTotal(null);
      setClientSecret("");
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
              items:       cartItems,
              countryCode: country,
              couponCode:  couponStatus === "valid" ? couponCode : "",
              email:       "tmp@tmp.com",
              name:        "tmp",
              address:     "tmp",
            }),
          }
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || t.checkoutInitError);

        // サーバーが送料を権威的に計算して返す
        setShipping(data.shipping);
        setTotal(data.total);
        setClientSecret(data.clientSecret);
      } catch (err) {
        // サーバー到達不可時はクライアント計算値でフォールバック
        setShipping(computedShipping);
        setTotal(
          couponStatus === "valid"
            ? null
            : cartSubtotal + (computedShipping ?? 0)
        );
        setClientSecret("");
        setError(err.message || t.checkoutInitError);
      }
    };

    initCheckout();
  }, [cartItems, country, hasSubscription, cartSubtotal, couponStatus, couponCode, isBlocked]);

  // ── クーポン検証 ─────────────────────────────────────────────────────────
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
      setCouponStatus(res.ok && data.valid ? "valid" : "invalid");
    } catch {
      setCouponStatus("invalid");
    }
  };

  // ── フォーム送信 ─────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    trackBeginCheckout(cartItems);
    setLoading(true);
    setError("");

    // 国内 / 海外でアドレスを組み立て
    const finalAddress = isInternational
      ? [addressLine1, addressLine2].filter(Boolean).join(", ")
      : [prefecture, addressLine1Ja, addressLine2Ja].filter(Boolean).join(" ");

    const countryName = getCountryName(country, lang);

    try {
      // ── 定期便 ──────────────────────────────────────
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
              name, email,
              postalCode:  postalCode,
              prefecture:  prefecture,
              address:     finalAddress,
              lang,
              countryCode: country, // サーバー側の国チェックに使用
            },
          }),
        });
        const data = await response.json();
        if (!response.ok || !data.url) throw new Error(data.error || t.subscriptionStartError);
        window.location.href = data.url;
        return;
      }

      // ── 通常決済 ─────────────────────────────────────
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

      // 国内 / 海外で billing_details を切り替え
      const billingAddress = isInternational
        ? {
            country:     country,
            postal_code: intlPostalCode,
            state:       stateProvince,
            city:        city,
            line1:       addressLine1,
            line2:       addressLine2,
          }
        : {
            country:     "JP",
            postal_code: postalCode,
            state:       prefecture,
            line1:       addressLine1Ja,
            line2:       addressLine2Ja,
          };

      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            name,
            email,
            address: billingAddress,
            ...(isInternational && phone ? { phone } : {}),
          },
        },
      });

      if (result.error) {
        setError(result.error.message || t.paymentFailed);
        setLoading(false);
        return;
      }

      const paymentIntentId = result.paymentIntent?.id;

      // 注文完了通知（メール送信）
      await fetch("https://ryuge-site.onrender.com/order-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items:         cartItems,
          name,
          email,
          postalCode:    isInternational ? intlPostalCode : postalCode,
          address:       finalAddress,
          prefecture:    isInternational ? "" : prefecture,
          city:          isInternational ? city : "",
          stateProvince: isInternational ? stateProvince : "",
          phone:         isInternational ? phone : "",
          countryCode:   country,
          countryName,
          couponCode:    couponStatus === "valid" ? couponCode : "",
          total,
          shipping,
          lang,
        }),
      });

      onSuccess();
      navigate("/checkout/complete", {
        state: {
          name,
          email,
          // 国内
          postalCode:    isInternational ? intlPostalCode : postalCode,
          prefecture:    isInternational ? "" : prefecture,
          address:       isInternational
            ? [addressLine1, addressLine2].filter(Boolean).join(", ")
            : [addressLine1Ja, addressLine2Ja].filter(Boolean).join(" "),
          // 国際
          city:          isInternational ? city : "",
          stateProvince: isInternational ? stateProvince : "",
          countryCode:   country,
          countryName,
          isInternational,
          total,
          shipping,
          items: cartItems,
          lang,
          paymentIntentId, // GA4 purchase イベント用
        },
      });
    } catch (err) {
      setError(err.message || t.paymentFailed);
      setLoading(false);
    }
  };

  // ── 表示用の送料・合計 ──────────────────────────────────────────────────
  const displayShipping = shipping ?? computedShipping;
  const displayTotal    = total    ?? (
    computedShipping !== null ? cartSubtotal + computedShipping : null
  );

  // ── ブロックメッセージの選択 ─────────────────────────────────────────────
  const blockMessage = (() => {
    if (isInternational && hasSubscription)               return t.intlSubscriptionBlocked;
    if (isUSBlocked)                                      return t.intlUSBlocked;
    if (shippingErrCode === "OVER_WEIGHT")                return t.intlOverWeight;
    if (shippingErrCode === "UNSUPPORTED_COUNTRY")        return t.intlUnsupported;
    return null;
  })();

  // ── 国コードが COUNTRY_ZONES に存在するか確認 ─────────────────────────
  const isSupportedCountry = country === "JP" || getZone(country) !== null;

  return (
    <form onSubmit={handleSubmit} className="checkout-inner">
      <p className="checkout-eyebrow">{t.eyebrow}</p>
      <h1 className="checkout-title">{t.title}</h1>

      {/* ── 注文サマリー ─────────────────────────────────────────── */}
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
            {isBlocked
              ? "—"
              : displayShipping === null
              ? t.calculatingShipping
              : displayShipping === 0
              ? t.free
              : "¥" + displayShipping.toLocaleString()}
          </span>
        </div>

        {!isInternational && (
          <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.42)", lineHeight: 1.8, marginTop: "8px", marginBottom: 0 }}>
            {t.shippingNote}
          </p>
        )}

        {isInternational && !isBlocked && (
          <div style={{ marginTop: "8px" }}>
            <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.42)", lineHeight: 1.8, margin: "0 0 4px" }}>
              {t.intlShippingMethod}
            </p>
            <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.42)", lineHeight: 1.8, margin: "0 0 4px" }}>
              {t.intlDeliveryDays}
            </p>
            <p style={{ fontSize: "11px", color: "rgba(255,200,100,0.7)", lineHeight: 1.8, margin: 0 }}>
              ⚠ {t.customsDutyNote}
            </p>
          </div>
        )}

        <div className="checkout-order-total">
          <span>{t.total}</span>
          <span>
            {isBlocked || displayTotal === null
              ? "—"
              : "¥" + displayTotal.toLocaleString()}
          </span>
        </div>
      </div>

      {/* ── ブロックメッセージ ────────────────────────────────────────── */}
      {blockMessage && (
        <div style={{
          margin: "0 0 16px",
          padding: "14px 16px",
          background: "rgba(255,100,100,0.1)",
          border: "1px solid rgba(255,100,100,0.3)",
          borderRadius: "8px",
          fontSize: "13px",
          color: "rgba(255,180,180,0.9)",
          lineHeight: 1.7,
        }}>
          {blockMessage}
        </div>
      )}

      {/* ── 配送先フォーム ────────────────────────────────────────────── */}
      <div className="checkout-card-section">
        <p className="checkout-section-label">{t.shippingInfo}</p>
        <div className="checkout-card-container" style={{ display: "grid", gap: "12px" }}>

          {/* 共通: 氏名・メール */}
          <input
            type="text" placeholder={t.name} value={name}
            onChange={(e) => setName(e.target.value)} required style={inputStyle}
          />
          <input
            type="email" placeholder={t.email} value={email}
            onChange={(e) => setEmail(e.target.value)} required style={inputStyle}
          />

          {/* 国選択 */}
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.42)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "6px" }}>
              {t.countryLabel}
            </label>
            <select
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
                setError("");
              }}
              style={{ ...inputStyle, background: "#111", appearance: "none", cursor: "pointer" }}
            >
              {COUNTRY_CODES_FOR_SELECT.map((code) => (
                <option key={code} value={code}>
                  {code === "JP" ? t.countryJapan : getCountryName(code, lang)}
                </option>
              ))}
            </select>
          </div>

          {/* 国内フォーム */}
          {!isInternational && (
            <>
              <input
                type="text" placeholder={t.postalCode} value={postalCode}
                onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, "").slice(0, 7))}
                required style={inputStyle}
              />
              <select
                value={prefecture}
                onChange={(e) => setPrefecture(e.target.value)}
                style={{ ...inputStyle, background: "#111" }}
              >
                {PREFECTURES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <input
                type="text" placeholder={t.address1Ja} value={addressLine1Ja}
                onChange={(e) => setAddressLine1Ja(e.target.value)} required style={inputStyle}
              />
              <input
                type="text" placeholder={t.address2Ja} value={addressLine2Ja}
                onChange={(e) => setAddressLine2Ja(e.target.value)} style={inputStyle}
              />
            </>
          )}

          {/* 国際フォーム */}
          {isInternational && (
            <>
              <input
                type="text" placeholder={t.addressLine1} value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)} required style={inputStyle}
              />
              <input
                type="text" placeholder={`${t.address2Ja} (optional)`} value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)} style={inputStyle}
              />
              <input
                type="text" placeholder={t.city} value={city}
                onChange={(e) => setCity(e.target.value)} required style={inputStyle}
              />
              <input
                type="text" placeholder={`${t.state} (optional)`} value={stateProvince}
                onChange={(e) => setStateProvince(e.target.value)} style={inputStyle}
              />
              <input
                type="text" placeholder={`${t.postalCode} (optional)`} value={intlPostalCode}
                onChange={(e) => setIntlPostalCode(e.target.value)} style={inputStyle}
              />
              <input
                type="tel" placeholder={t.phone} value={phone}
                onChange={(e) => setPhone(e.target.value)} required style={inputStyle}
              />
            </>
          )}
        </div>
      </div>

      {/* ── クーポン（国内・非サブスクのみ）────────────────────────── */}
      {!hasSubscription && !isInternational && (
        <div className="checkout-card-section">
          <p className="checkout-section-label">{t.couponLabel}</p>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <input
              type="text" placeholder={t.couponLabel} value={couponCode}
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
                border: "1px solid rgba(255,255,255,0.2)", background: "transparent",
                color: "rgba(255,255,255,0.8)", borderRadius: "999px",
                padding: "8px 16px", fontSize: "12px", cursor: "pointer",
                whiteSpace: "nowrap", opacity: couponStatus === "valid" ? 0.5 : 1,
              }}
            >
              {couponStatus === "applying" ? t.couponApplying : t.couponApply}
            </button>
          </div>
          {couponStatus === "valid"   && <p style={{ margin: "6px 0 0", fontSize: "12px", color: "rgba(100,255,150,0.9)" }}>{"✓"} {t.couponApplied}</p>}
          {couponStatus === "invalid" && <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#ff6b6b" }}>{t.couponInvalid}</p>}
        </div>
      )}

      {/* ── カード入力（通常購入かつブロックされていない場合）────────── */}
      {!hasSubscription && !isBlocked && (
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
          isBlocked ||
          (!hasSubscription && (!stripe || !clientSecret))
        }
      >
        {loading
          ? t.processing
          : hasSubscription
          ? t.startSubscription
          : isBlocked
          ? "—"
          : displayTotal !== null
          ? "¥" + displayTotal.toLocaleString() + " " + t.pay
          : t.processing}
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
