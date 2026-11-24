import { trackAddPaymentInfo, trackAddShippingInfo, trackBeginCheckout } from "../lib/analytics";
import { OLD_SUBSCRIPTION_PLANS_CLOSED, SUBSCRIPTIONS_PAUSED, SUBSCRIPTIONS_PAUSED_TEXT } from "../productData";
import { PAYMENT_API_BASE, stripePublishableKey } from "../lib/paymentEnv";
import { japanesePhone } from "../lib/addressFormat";
import { useState, useEffect, useMemo, useRef } from "react";
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
  CONTACT_EMAIL, DOMESTIC_METHOD_LABELS, INTERNATIONAL_COUNTRY_CODES, OTHER_COUNTRY, POLICY_TEXT, QUOTE_MESSAGES, SERVICE_LABELS, contactHref,
} from "../lib/shippingPolicy";

// Production builds use the live key; any other build only a Stripe test key (see paymentEnv).
const PUBLISHABLE_KEY = stripePublishableKey();
const stripePromise = PUBLISHABLE_KEY ? loadStripe(PUBLISHABLE_KEY) : Promise.resolve(null);

const PREFECTURES = [
  "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県",
  "茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県",
  "新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県",
  "静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県",
  "奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県",
  "徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県",
  "熊本県","大分県","宮崎県","鹿児島県","沖縄県",
];

// ── 国セレクト: 日本、配送を確認済みの国（server/international-rates.js と同じ）、その他（お問い合わせ）──
const COUNTRY_CODES_FOR_SELECT = ["JP", ...INTERNATIONAL_COUNTRY_CODES, OTHER_COUNTRY];

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
    phoneJa: "電話番号（配送の連絡用）",
    phoneInvalid: "電話番号は0から始まる10〜11桁の数字で入力してください（ハイフン可）。",
    processing: "処理中...",
    pay: "を支払う",
    startSubscription: "サブスクを開始する",
    back: "← 戻る",
    subscriptionOnlyOne: "サブスクは1プランのみ購入できます。通常商品とは分けて決済してください。",
    checkoutInitError: "決済情報の初期化に失敗しました。",
    checkoutItemUnavailable: "カートに現在販売していない商品が含まれています。カートから削除してから、もう一度お試しください。",
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
    phoneJa: "Phone number (for delivery)",
    phoneInvalid: "Please enter a Japanese phone number: 10–11 digits starting with 0 (hyphens allowed).",
    processing: "Processing...",
    pay: "Pay",
    startSubscription: "Start Subscription",
    back: "← Back",
    subscriptionOnlyOne: "Subscription checkout supports one plan only. Please purchase regular items separately.",
    checkoutInitError: "Failed to initialize checkout.",
    checkoutItemUnavailable: "Your cart contains an item that is not currently on sale. Please remove it and try again.",
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
    phoneJa: "Teléfono (para la entrega)",
    phoneInvalid: "Introduce un teléfono japonés: 10–11 dígitos que empiecen por 0 (se admiten guiones).",
    processing: "Procesando...",
    pay: "Pagar",
    startSubscription: "Iniciar suscripción",
    back: "← Volver",
    subscriptionOnlyOne: "La suscripción solo admite un plan por compra. Compra los productos normales por separado.",
    checkoutInitError: "No se pudo inicializar el pago.",
    checkoutItemUnavailable: "Tu carrito contiene un producto que no está a la venta. Elimínalo e inténtalo de nuevo.",
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

// ── サーチャブル国セレクト ────────────────────────────────────────────────────
function CountrySelect({ value, onChange, lang, countryJapanLabel, otherLabel, placeholder }) {
  const [query,   setQuery]   = useState("");
  const [open,    setOpen]    = useState(false);
  const containerRef          = useRef(null);

  const countryList = useMemo(() =>
    COUNTRY_CODES_FOR_SELECT.map((code) => ({
      code,
      name: code === "JP" ? countryJapanLabel : code === OTHER_COUNTRY ? otherLabel : getCountryName(code, lang),
    })),
    [lang, countryJapanLabel, otherLabel]
  );

  const selectedName = useMemo(() =>
    countryList.find((c) => c.code === value)?.name ?? "",
    [value, countryList]
  );

  const filtered = useMemo(() => {
    if (!query) return countryList;
    const q = query.toLowerCase();
    return countryList.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [query, countryList]);

  useEffect(() => {
    function onClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <input
        type="text"
        autoComplete="off"
        placeholder={placeholder}
        value={open ? query : selectedName}
        onFocus={() => { setOpen(true); setQuery(""); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        style={inputStyle}
      />
      {open && (
        <div style={{
          position:    "absolute",
          top:         "calc(100% + 4px)",
          left:        0,
          right:       0,
          background:  "#161616",
          border:      "1px solid rgba(255,255,255,0.14)",
          borderRadius:"4px",
          maxHeight:   "220px",
          overflowY:   "auto",
          zIndex:      200,
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "10px 12px", fontSize: "13px", color: "rgba(255,255,255,0.36)" }}>
              該当なし
            </div>
          ) : filtered.map((c) => (
            <div
              key={c.code}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(c.code);
                setOpen(false);
                setQuery("");
              }}
              style={{
                padding:    "9px 12px",
                fontSize:   "13px",
                cursor:     "pointer",
                color:      c.code === value ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.68)",
                background: c.code === value ? "rgba(255,255,255,0.07)" : "transparent",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = c.code === value ? "rgba(255,255,255,0.07)" : "transparent"; }}
            >
              {c.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
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

  // 決済状態。金額は決済サーバーの /quote（server/quote.js）だけが決める。
  const [quote,         setQuote]         = useState({ status: "idle" });
  // 送信で作った PaymentIntent。同じ内容でカード決済をやり直すときは作り直さない（在庫の二重確保を防ぐ）。
  const [pendingIntent, setPendingIntent] = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState("");
  const policy = POLICY_TEXT[lang] || POLICY_TEXT.ja;
  const quoteMessages = QUOTE_MESSAGES[lang] || QUOTE_MESSAGES.ja;

  // クーポン
  const [couponCode,   setCouponCode]   = useState("");
  const [couponStatus, setCouponStatus] = useState("idle");

  // ── 派生値 ──────────────────────────────────────────────────────────────
  const isInternational = country !== "JP";
  const isOtherCountry  = country === OTHER_COUNTRY;

  const hasSubscription = useMemo(
    () => (cartItems || []).some(isSubscriptionItem),
    [cartItems]
  );

  // 決済サーバーに送るのは商品ID・数量・お届け先・クーポンだけ
  const quoteRequest = useMemo(() => ({
    items: (cartItems || []).filter((i) => !isSubscriptionItem(i)).map(({ id, quantity }) => ({ id, quantity })),
    countryCode: country,
    prefecture: isInternational ? "" : prefecture,
    couponCode: couponStatus === "valid" ? couponCode : "",
  }), [cartItems, country, isInternational, prefecture, couponStatus, couponCode]);
  const quoteKey = JSON.stringify(quoteRequest);

  // ── 金額の見積もり（表示用。決済も同じ計算でサーバーが確定する）────────────
  useEffect(() => {
    if (hasSubscription || !quoteRequest.items.length) { setQuote({ status: "idle" }); return; }
    if (isOtherCountry) { setQuote({ status: "error", code: "COUNTRY_NOT_AVAILABLE", contact: true }); return; }
    let cancelled = false;
    const controller = new AbortController();
    setQuote({ status: "loading" });
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${PAYMENT_API_BASE}/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: quoteKey,
        });
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (response.ok) setQuote({ status: "ok", key: quoteKey, ...data });
        else setQuote({ status: "error", code: data.error || "QUOTE_UNAVAILABLE", contact: Boolean(data.contact) });
      } catch {
        // 送料を確認できないときは、推測の金額で決済させない。
        if (!cancelled && !controller.signal.aborted) setQuote({ status: "error", code: "QUOTE_UNAVAILABLE", contact: false });
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [quoteKey, hasSubscription, isOtherCountry, quoteRequest.items.length]);

  const quoteReady  = quote.status === "ok" && quote.key === quoteKey;
  const quoteError  = quote.status === "error" ? quote : null;
  // Subscriptions left in a cart are the earlier plans (closed for good); 珈琲の定期便 has its own sign-up page.
  const subscriptionPaused = hasSubscription && (OLD_SUBSCRIPTION_PLANS_CLOSED || SUBSCRIPTIONS_PAUSED);
  const isBlocked   = subscriptionPaused || (isInternational && hasSubscription) || (!hasSubscription && Boolean(quoteError));
  const canPay      = !hasSubscription && quoteReady;

  // ── クーポン検証 ─────────────────────────────────────────────────────────
  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponStatus("applying");
    try {
      const res = await fetch(`${PAYMENT_API_BASE}/validate-coupon`, {
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

  // GA4: 画面を開いたとき begin_checkout、お届け先が決まり送料が出たとき add_shipping_info（同じカートで1回ずつ）。
  useEffect(() => {
    if (!hasSubscription && cartItems?.length) trackBeginCheckout(cartItems);
  }, [hasSubscription, cartItems]);
  useEffect(() => {
    // 都道府県・国には初期値があるため、住所の入力が始まってから（送料はお届け先で決まる）。
    const chosen = (isInternational ? addressLine1 : addressLine1Ja).trim().length >= 3;
    if (!hasSubscription && cartItems?.length && chosen && quote.status === "ok") {
      trackAddShippingInfo(cartItems, quote.total, isInternational ? "intl_air_packet" : (quote.shippingDetail?.method || "domestic"));
    }
  }, [hasSubscription, isInternational, addressLine1, addressLine1Ja, quote, cartItems]);

  // ── フォーム送信 ─────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    trackAddPaymentInfo(cartItems, quote.status === "ok" ? quote.total : undefined);
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
        if (OLD_SUBSCRIPTION_PLANS_CLOSED || SUBSCRIPTIONS_PAUSED) {
          setError(SUBSCRIPTIONS_PAUSED_TEXT[lang] || SUBSCRIPTIONS_PAUSED_TEXT.ja);
          setLoading(false);
          return;
        }
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
      // Japan: a phone number for the delivery (the carrier may call); abroad it was already required.
      const domesticPhone = isInternational ? null : japanesePhone(phone);
      if (!isInternational && !domesticPhone) {
        setError(t.phoneInvalid);
        setLoading(false);
        return;
      }
      if (!stripe || !elements || !canPay) {
        setError(canPay ? t.cardNotReady : (quoteMessages.QUOTE_UNAVAILABLE));
        setLoading(false);
        return;
      }
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        setError(t.cardNotReady);
        setLoading(false);
        return;
      }

      // 決済はここで作る（お届け先が確定した後）。サーバーが同じ計算で金額を確定し、表示と違えば決済しない。
      let intent = pendingIntent && pendingIntent.key === quoteKey ? pendingIntent : null;
      if (!intent) {
        const response = await fetch(`${PAYMENT_API_BASE}/create-payment-intent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...quoteRequest, email, name, address: finalAddress, postalCode: isInternational ? intlPostalCode : postalCode }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const code = data.error || "";
          const unavailable = ["PRODUCT_NOT_AVAILABLE", "UNKNOWN_PRODUCT", "INVALID_ITEMS"].includes(code);
          if (quoteMessages[code]) setQuote({ status: "error", code, contact: Boolean(data.contact) });
          setError(unavailable ? t.checkoutItemUnavailable : (quoteMessages[code] || t.checkoutInitError));
          setLoading(false);
          return;
        }
        intent = { key: quoteKey, clientSecret: data.clientSecret, total: data.total, shipping: data.shipping };
        setPendingIntent(intent);
        if (data.total !== quote.total || data.shipping !== quote.shipping) {
          setQuote({ status: "ok", key: quoteKey, ...data });
          setError(quoteMessages.AMOUNT_CHANGED);
          setLoading(false);
          return;
        }
      }
      const total = intent.total;
      const shipping = intent.shipping;

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

      const result = await stripe.confirmCardPayment(intent.clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            name,
            email,
            address: billingAddress,
            // Kept by Stripe and copied into the order record (server/orders.js) for the shipping label.
            ...(isInternational ? (phone ? { phone } : {}) : { phone: domesticPhone }),
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
      await fetch(`${PAYMENT_API_BASE}/order-complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items:         cartItems,
          name,
          email,
          postalCode:    isInternational ? intlPostalCode : postalCode,
          address:       finalAddress,
          // Each part on its own (the server puts the address together once: src/lib/addressFormat.js).
          prefecture:    isInternational ? "" : prefecture,
          line1:         isInternational ? addressLine1 : addressLine1Ja,
          line2:         isInternational ? addressLine2 : addressLine2Ja,
          city:          isInternational ? city : "",
          stateProvince: isInternational ? stateProvince : "",
          phone:         isInternational ? phone : domesticPhone,
          paymentIntentId,
          shippingMethod: isInternational ? "intl_air_packet" : (quote.shippingDetail?.method || ""),
          countryCode:   country,
          countryName,
          couponCode:    couponStatus === "valid" ? couponCode : "",
          total,
          shipping,
          lang,
        }),
      });

      setPendingIntent(null);
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
          line1:         isInternational ? addressLine1 : addressLine1Ja,
          line2:         isInternational ? addressLine2 : addressLine2Ja,
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

  // ── 表示用の送料・合計（サーバーの見積もりだけを表示する）────────────────
  const displayShipping = hasSubscription ? 0 : quoteReady ? quote.shipping : null;
  const displayTotal    = hasSubscription
    ? (cartItems || []).reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0)
    : quoteReady ? quote.total : null;

  // ── ブロック・案内メッセージ ─────────────────────────────────────────────
  const blockMessage = subscriptionPaused
    ? SUBSCRIPTIONS_PAUSED_TEXT[lang] || SUBSCRIPTIONS_PAUSED_TEXT.ja
    : isInternational && hasSubscription
    ? t.intlSubscriptionBlocked
    : quoteError ? (quoteMessages[quoteError.code] || quoteMessages.QUOTE_UNAVAILABLE) : null;
  const showContact = Boolean(quoteError?.contact) || (isInternational && hasSubscription);

  return (
    <form onSubmit={handleSubmit} className="checkout-inner">
      <p className="checkout-eyebrow">{t.eyebrow}</p>
      <h1 className="checkout-title">{t.title}</h1>

      {/* ── 注文サマリー ─────────────────────────────────────────── */}
      <div className="checkout-order-summary">
        <p className="checkout-section-label">{t.orderSummary}</p>
        {cartItems.map((item) => {
          // The price charged is the server's (quote); the cart's own price is only shown until it arrives.
          const quoted = quoteReady ? (quote.items || []).find((q) => q.id === item.id) : null;
          const unitPrice = quoted ? quoted.price : (item.price || 0);
          return (
            <div key={item.id} className="checkout-order-item">
              <span className="checkout-order-title">{item.name}</span>
              <span className="checkout-order-qty">{"×"} {item.quantity}</span>
              <span className="checkout-order-price">{"¥"}{(unitPrice * (item.quantity || 0)).toLocaleString()}</span>
            </div>
          );
        })}

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

        {!isInternational && !hasSubscription && quoteReady && quote.shippingDetail?.method && (
          <p data-testid="domestic-method" style={{ fontSize: "11px", color: "rgba(255,255,255,0.7)", lineHeight: 1.8, marginTop: "8px", marginBottom: 0 }}>
            {(() => {
              const labels = DOMESTIC_METHOD_LABELS[lang] || DOMESTIC_METHOD_LABELS.ja;
              return labels[quote.shippingDetail.method] || "";
            })()}
          </p>
        )}
        {!isInternational && !hasSubscription && (
          <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.42)", lineHeight: 1.8, marginTop: "8px", marginBottom: 0 }}>
            {policy.domesticShipping}
          </p>
        )}

        {isInternational && !hasSubscription && (
          <div style={{ marginTop: "8px" }}>
            {quoteReady && quote.shippingDetail?.service ? (
              <>
                <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.42)", lineHeight: 1.8, margin: "0 0 4px" }}>
                  {(SERVICE_LABELS[lang] || SERVICE_LABELS.ja)[quote.shippingDetail.service] || quote.shippingDetail.service}
                </p>
                <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.42)", lineHeight: 1.8, margin: "0 0 4px" }}>
                  {policy.subsidy(quote.shippingDetail.actual, quote.shippingDetail.subsidy)}
                </p>
                <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.42)", lineHeight: 1.8, margin: "0 0 4px" }}>
                  {t.intlDeliveryDays}
                </p>
              </>
            ) : null}
            <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.42)", lineHeight: 1.8, margin: "0 0 4px" }}>
              {policy.intlLimits}
            </p>
            <p style={{ fontSize: "11px", color: "rgba(255,200,100,0.8)", lineHeight: 1.8, margin: 0 }}>
              ⚠ {policy.duties}
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
          {showContact && (
            <div style={{ marginTop: "8px" }}>
              <a href={contactHref("RYUGE Coffee order inquiry")} style={{ color: "rgba(255,220,180,0.95)" }}>
                {policy.contactLink}: {CONTACT_EMAIL}
              </a>
            </div>
          )}
        </div>
      )}

      {/* ── 配送先フォーム ────────────────────────────────────────────── */}
      <div className="checkout-card-section">
        <p className="checkout-section-label">{t.shippingInfo}</p>
        <div className="checkout-card-container" style={{ display: "grid", gap: "12px" }}>

          {/* 共通: 氏名・メール */}
          <input
            type="text" placeholder={t.name} value={name} autoComplete="name"
            onChange={(e) => setName(e.target.value)} required style={inputStyle}
          />
          <input
            type="email" placeholder={t.email} value={email} autoComplete="email"
            onChange={(e) => setEmail(e.target.value)} required style={inputStyle}
          />

          {/* 国選択 */}
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.42)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "6px" }}>
              {t.countryLabel}
            </label>
            <CountrySelect
              value={country}
              onChange={(code) => { setCountry(code); setError(""); setPendingIntent(null); }}
              lang={lang}
              countryJapanLabel={t.countryJapan}
              otherLabel={policy.countryOther}
              placeholder={t.countryLabel}
            />
          </div>

          {/* 国内フォーム */}
          {!isInternational && (
            <>
              <input
                type="text" placeholder={t.postalCode} value={postalCode} autoComplete="postal-code" inputMode="numeric"
                onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, "").slice(0, 7))}
                required style={inputStyle}
              />
              <select
                value={prefecture} autoComplete="address-level1"
                onChange={(e) => setPrefecture(e.target.value)}
                style={{ ...inputStyle, background: "#111" }}
              >
                {PREFECTURES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <input
                type="text" placeholder={t.address1Ja} value={addressLine1Ja} autoComplete="address-line1"
                onChange={(e) => setAddressLine1Ja(e.target.value)} required style={inputStyle}
              />
              <input
                type="text" placeholder={t.address2Ja} value={addressLine2Ja} autoComplete="address-line2"
                onChange={(e) => setAddressLine2Ja(e.target.value)} style={inputStyle}
              />
              <input
                type="tel" placeholder={t.phoneJa} value={phone} autoComplete="tel" inputMode="tel"
                onChange={(e) => setPhone(e.target.value)} required style={inputStyle}
              />
            </>
          )}

          {/* 国際フォーム */}
          {isInternational && (
            <>
              <input
                type="text" placeholder={t.addressLine1} value={addressLine1} autoComplete="address-line1"
                onChange={(e) => setAddressLine1(e.target.value)} required style={inputStyle}
              />
              <input
                type="text" placeholder={`${t.address2Ja} (optional)`} value={addressLine2} autoComplete="address-line2"
                onChange={(e) => setAddressLine2(e.target.value)} style={inputStyle}
              />
              <input
                type="text" placeholder={t.city} value={city} autoComplete="address-level2"
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
                type="tel" placeholder={t.phone} value={phone} autoComplete="tel"
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
          (!hasSubscription && (!stripe || !canPay))
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
