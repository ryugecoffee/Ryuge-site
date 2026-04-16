import { useState, useEffect, useMemo } from "react";
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

const COUNTRY_CODES = `
AD,AE,AF,AG,AI,AL,AM,AO,AQ,AR,AS,AT,AU,AW,AX,AZ,
BA,BB,BD,BE,BF,BG,BH,BI,BJ,BL,BM,BN,BO,BQ,BR,BS,BT,BV,BW,BY,BZ,
CA,CC,CD,CF,CG,CH,CI,CK,CL,CM,CN,CO,CR,CU,CV,CW,CX,CY,CZ,
DE,DJ,DK,DM,DO,DZ,
EC,EE,EG,EH,ER,ES,ET,
FI,FJ,FK,FM,FO,FR,
GA,GB,GD,GE,GF,GG,GH,GI,GL,GM,GN,GP,GQ,GR,GS,GT,GU,GW,GY,
HK,HM,HN,HR,HT,HU,
ID,IE,IL,IM,IN,IO,IQ,IR,IS,IT,
JE,JM,JO,JP,
KE,KG,KH,KI,KM,KN,KP,KR,KW,KY,KZ,
LA,LB,LC,LI,LK,LR,LS,LT,LU,LV,LY,
MA,MC,MD,ME,MF,MG,MH,MK,ML,MM,MN,MO,MP,MQ,MR,MS,MT,MU,MV,MW,MX,MY,MZ,
NA,NC,NE,NF,NG,NI,NL,NO,NP,NR,NU,NZ,
OM,
PA,PE,PF,PG,PH,PK,PL,PM,PN,PR,PS,PT,PW,PY,
QA,
RE,RO,RS,RU,RW,
SA,SB,SC,SD,SE,SG,SH,SI,SJ,SK,SL,SM,SN,SO,SR,SS,ST,SV,SX,SY,SZ,
TC,TD,TF,TG,TH,TJ,TK,TL,TM,TN,TO,TR,TT,TV,TW,TZ,
UA,UG,UM,US,UY,UZ,
VA,VC,VE,VG,VI,VN,VU,
WF,WS,
XK,
YE,YT,
ZA,ZM,ZW
`
  .replace(/\s/g, "")
  .split(",")
  .filter(Boolean);

const regionNames =
  typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

const COUNTRY_OPTIONS = COUNTRY_CODES.map((code) => ({
  code,
  name: regionNames?.of(code) || code,
}))
  .filter((item) => item.code !== "JP")
  .sort((a, b) => a.name.localeCompare(b.name));

const SHIPPING_BY_ZONE = {
  zone1: 3400,
  zone2: 4550,
  zone3: 6700,
  zone4: 7900,
  zone5: 8100,
};

const ZONE_LABELS = {
  zone1: { ja: "第1地帯（中国・韓国・台湾）", en: "Zone 1 (China / South Korea / Taiwan)", es: "Zona 1 (China / Corea del Sur / Taiwán)" },
  zone2: { ja: "第2地帯（アジアその他）", en: "Zone 2 (Other Asia)", es: "Zona 2 (Resto de Asia)" },
  zone3: { ja: "第3地帯（オセアニア・カナダ・メキシコ・中近東・ヨーロッパ）", en: "Zone 3 (Oceania / Canada / Mexico / Middle East / Europe)", es: "Zona 3 (Oceanía / Canadá / México / Oriente Medio / Europa)" },
  zone4: { ja: "第4地帯（米国）", en: "Zone 4 (United States)", es: "Zona 4 (Estados Unidos)" },
  zone5: { ja: "第5地帯（中南米・アフリカ）", en: "Zone 5 (Latin America / Africa)", es: "Zona 5 (América Latina / África)" },
};

const ZONE1_CODES = new Set(["CN", "KR", "TW"]);
const ZONE4_CODES = new Set(["US"]);
const ZONE3_CODES = new Set([
  "AD","AL","AT","AX","BA","BE","BG","BY","CH","CY","CZ","DE","DK","EE",
  "ES","FI","FO","FR","GB","GG","GI","GL","GR","HR","HU","IE","IM","IS",
  "IT","JE","LI","LT","LU","LV","MC","MD","ME","MK","MT","NL","NO","PL",
  "PT","RO","RS","RU","SE","SI","SJ","SK","SM","UA","VA","XK",
  "AU","CC","CK","CX","FJ","FM","GU","HM","KI","MH","MP","NC","NF","NR",
  "NU","NZ","PF","PG","PN","PW","SB","TK","TO","TV","UM","VU","WF","WS",
  "CA","MX",
  "AE","AM","AZ","BH","GE","IL","IQ","IR","JO","KW","LB","OM","PS","QA",
  "SA","SY","TR","YE",
]);
const ZONE5_CODES = new Set([
  "AG","AI","AR","AW","BB","BL","BM","BO","BQ","BR","BS","BZ","CL","CO",
  "CR","CU","CW","DM","DO","EC","FK","GD","GF","GP","GS","GT","GY","HN",
  "HT","JM","KN","KY","LC","MF","MQ","MS","NI","PA","PE","PR","PY","SR",
  "SV","SX","TC","TT","UY","VC","VE","VG","VI",
  "AO","BF","BI","BJ","BW","CD","CF","CG","CI","CM","CV","DJ","DZ","EG",
  "EH","ER","ET","GA","GH","GM","GN","GQ","GW","KE","KM","LR","LS","LY",
  "MA","MG","ML","MR","MU","MW","MZ","NA","NE","NG","RE","RW","SC","SD",
  "SH","SL","SN","SO","SS","ST","SZ","TD","TF","TG","TN","TZ","UG","YT",
  "ZA","ZM","ZW",
]);

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
    subscriptionOnlyOne: "サブスクは1プランのみ購入できます。通常商品とは分けて決済してください。",
    beanLimitError: "閻魔・木函の合計は10個までです。10個を超える場合はお問い合わせください。",
    bagLimitError: "コーヒーバッグ・お茶バッグは合計20個までです。20個を超える場合はお問い合わせください。",
    selectCountry: "海外配送では国 / 地域を選択してください。",
    zone: "配送地帯",
    internationalRule: "海外配送は国に応じて自動で送料を計算します。閻魔・木函は合計10個まで、コーヒーバッグ・お茶バッグは合計20個までです。",
    unsupportedCountry: "この国 / 地域の送料判定に失敗しました。",
    shippingEstimate: "基本送料",
    shippingDiscount: "送料割引",
    cannotPurchaseLimit: "上限超過のため購入できません",
    checkoutInitError: "決済情報の初期化に失敗しました。",
    cardNotReady: "カード入力フォームの準備ができていません。",
    paymentFailed: "決済に失敗しました。",
    subscriptionStartError: "サブスク決済の開始に失敗しました。",
    couponLabel: "クーポンコード",
    couponApply: "適用",
    couponApplied: "クーポン適用済み",
    couponInvalid: "無効なクーポンコードです",
    couponApplying: "確認中...",
    discountStep1: "送料50%OFF適用中",
    discountStep2Zone123: "送料無料適用中",
    discountStep2Zone45: "送料70%OFF適用中",
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
    subscriptionOnlyOne: "Subscription checkout supports one plan only. Please purchase regular items separately.",
    beanLimitError: "Enma and Wood Box items are limited to 10 per order. Please contact us for larger orders.",
    bagLimitError: "Coffee bags and tea bags are limited to 20 per order. Please contact us for larger orders.",
    selectCountry: "Please select a country / region for international shipping.",
    zone: "Shipping Zone",
    internationalRule: "International shipping is calculated automatically by country. Enma and Wood Box are limited to 10 total, and coffee/tea bags are limited to 20.",
    unsupportedCountry: "We could not determine the shipping zone for this country / region.",
    shippingEstimate: "Base shipping",
    shippingDiscount: "Shipping discount",
    cannotPurchaseLimit: "Cannot purchase (limit exceeded)",
    checkoutInitError: "Failed to initialize checkout.",
    cardNotReady: "Card form is not ready yet.",
    paymentFailed: "Payment failed.",
    subscriptionStartError: "Failed to start subscription checkout.",
    couponLabel: "Coupon Code",
    couponApply: "Apply",
    couponApplied: "Coupon applied",
    couponInvalid: "Invalid coupon code",
    couponApplying: "Checking...",
    discountStep1: "50% shipping discount applied",
    discountStep2Zone123: "Free shipping applied",
    discountStep2Zone45: "70% shipping discount applied",
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
    subscriptionOnlyOne: "La suscripción solo admite un plan por compra. Compra los productos normales por separado.",
    beanLimitError: "Los productos Enma y Wood Box están limitados a 10 por pedido.",
    bagLimitError: "Las bolsas de café y té están limitadas a 20 por pedido.",
    selectCountry: "Selecciona un país / región para el envío internacional.",
    zone: "Zona de envío",
    internationalRule: "El envío internacional se calcula según el país. Enma y Wood Box están limitados a 10 en total, y las bolsas a 20.",
    unsupportedCountry: "No hemos podido determinar la zona de envío para este país.",
    shippingEstimate: "Envío base",
    shippingDiscount: "Descuento de envío",
    cannotPurchaseLimit: "No se puede comprar (límite excedido)",
    checkoutInitError: "No se pudo inicializar el pago.",
    cardNotReady: "El formulario de tarjeta aún no está listo.",
    paymentFailed: "El pago falló.",
    subscriptionStartError: "No se pudo iniciar la suscripción.",
    couponLabel: "Código de cupón",
    couponApply: "Aplicar",
    couponApplied: "Cupón aplicado",
    couponInvalid: "Código de cupón inválido",
    couponApplying: "Verificando...",
    discountStep1: "50% de descuento en envío aplicado",
    discountStep2Zone123: "Envío gratuito aplicado",
    discountStep2Zone45: "70% de descuento en envío aplicado",
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

function getCountryName(code) {
  return COUNTRY_OPTIONS.find((item) => item.code === code)?.name || "";
}

function getZoneByCountryCode(countryCode) {
  if (!countryCode) return null;
  if (ZONE1_CODES.has(countryCode)) return "zone1";
  if (ZONE4_CODES.has(countryCode)) return "zone4";
  if (ZONE3_CODES.has(countryCode)) return "zone3";
  if (ZONE5_CODES.has(countryCode)) return "zone5";
  return "zone2";
}

function getZoneLabel(zoneKey, lang = "ja") {
  if (!zoneKey) return "";
  return ZONE_LABELS[zoneKey]?.[lang] || ZONE_LABELS[zoneKey]?.ja || "";
}

function isSubscriptionItem(item) {
  return item?.id?.startsWith("subscription-");
}

function isBagItem(item) {
  const source = `${item?.id || ""} ${item?.title || ""}`.toLowerCase();
  return (
    source.includes("coffee-bag") ||
    source.includes("coffee_bag") ||
    source.includes("coffeebag") ||
    source.includes("coffee bag") ||
    source.includes("コーヒーバッグ") ||
    source.includes("お茶バッグ") ||
    source.includes("tea-bag") ||
    source.includes("tea_bag") ||
    source.includes("teabag")
  );
}

function isBeanItem(item) {
  if (isBagItem(item)) return false; // ← これを追加
  const source = `${item?.id || ""} ${item?.title || ""}`.toLowerCase();
  return (
    source.includes("enma") ||
    source.includes("woodbox") ||
    source.includes("wood-box") ||
    source.includes("wood_box") ||
    source.includes("閻魔") ||
    source.includes("木函")
  );
}

function countBeans(cartItems = []) {
  return cartItems
    .filter((item) => isBeanItem(item) && !isSubscriptionItem(item))
    .reduce((sum, item) => sum + (item.quantity || 0), 0);
}

function countBags(cartItems = []) {
  return cartItems
    .filter((item) => isBagItem(item) && !isSubscriptionItem(item))
    .reduce((sum, item) => sum + (item.quantity || 0), 0);
}

// 送料割引ステップを計算（フロント表示用）
function getShippingDiscountStep(beans, bags) {
  if (beans >= 10 && bags >= 20) return 2;
  if (beans >= 7 && bags >= 10) return 1;
  return 0;
}

// 送料割引後の金額を計算（フロント表示用のプレビュー）
function calcDiscountedShipping(baseShipping, step, zoneKey) {
  if (step === 2) {
    const zone45 = zoneKey === "zone4" || zoneKey === "zone5";
    return zone45 ? Math.round(baseShipping * 0.3) : 0;
  }
  if (step === 1) return Math.round(baseShipping * 0.5);
  return baseShipping;
}

function getOrderLimitError(cartItems = [], t, countryType) {
  if (countryType !== "international") return "";
  const beans = countBeans(cartItems);
  const bags = countBags(cartItems);
  if (beans > 10) return t.beanLimitError;
  if (bags > 20) return t.bagLimitError;
  return "";
}

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
  const [countryCode, setCountryCode] = useState("");
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

  // クーポン
  const [couponCode, setCouponCode] = useState("");
  const [couponStatus, setCouponStatus] = useState("idle"); // idle | applying | valid | invalid
  const [couponDiscount, setCouponDiscount] = useState(null); // { type: "percent"|"fixed", value: number, label: string }

  const hasSubscription = useMemo(
    () => (cartItems || []).some((item) => isSubscriptionItem(item)),
    [cartItems]
  );

  const cartSubtotal = useMemo(
    () => (cartItems || []).reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0),
    [cartItems]
  );

  const selectedZoneKey = countryType === "international" ? getZoneByCountryCode(countryCode) : null;
  const selectedCountryName = getCountryName(countryCode);

  const orderLimitError = useMemo(
    () => getOrderLimitError(cartItems, t, countryType),
    [cartItems, t, countryType]
  );

  // 送料割引ステップ（海外のみ）
  const beans = useMemo(() => countBeans(cartItems), [cartItems]);
  const bags = useMemo(() => countBags(cartItems), [cartItems]);
  const discountStep = countryType === "international" ? getShippingDiscountStep(beans, bags) : 0;

  // 割引ラベル表示
  const discountLabel = useMemo(() => {
    if (countryType !== "international" || discountStep === 0) return null;
    if (discountStep === 2) {
      const zone45 = selectedZoneKey === "zone4" || selectedZoneKey === "zone5";
      return zone45 ? t.discountStep2Zone45 : t.discountStep2Zone123;
    }
    return t.discountStep1;
  }, [discountStep, selectedZoneKey, countryType, t]);

  useEffect(() => {
    if (!cartItems || cartItems.length === 0) return;

    if (hasSubscription) {
      setShipping(0);
      setTotal(cartSubtotal);
      setClientSecret("");
      setError("");
      return;
    }

    if (countryType === "international" && orderLimitError) {
      setShipping(null);
      setTotal(null);
      setClientSecret("");
      setError(orderLimitError);
      return;
    }

    if (countryType === "international" && !countryCode) {
      setShipping(null);
      setTotal(null);
      setClientSecret("");
      setError("");
      return;
    }

    if (countryType === "international" && !selectedZoneKey) {
      setShipping(null);
      setTotal(null);
      setClientSecret("");
      setError(t.unsupportedCountry);
      return;
    }

    const initCheckout = async () => {
      try {
        setError("");
        const prefectureParam = countryType === "international" ? selectedZoneKey : prefecture;

        const response = await fetch(
          "https://ryuge-site.onrender.com/create-payment-intent",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: cartItems,
              prefecture: prefectureParam,
              countryType,
              countryCode,
              countryName: selectedCountryName,
              shippingZone: selectedZoneKey,
              shippingDiscountStep: discountStep,
              couponCode: couponStatus === "valid" ? couponCode : "",
              email: "tmp@tmp.com",
              name: "tmp",
              address: "tmp",
            }),
          }
        );

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || t.checkoutInitError);

        setShipping(data.shipping);
        setTotal(data.total);
        setClientSecret(data.clientSecret);
      } catch (err) {
        setShipping(null);
        setTotal(null);
        setClientSecret("");
        setError(err.message || t.checkoutInitError);
      }
    };

    initCheckout();
  }, [
    cartItems, prefecture, countryType, countryCode,
    selectedZoneKey, selectedCountryName, hasSubscription,
    cartSubtotal, orderLimitError, discountStep,
    couponStatus, couponCode,
    t.checkoutInitError, t.unsupportedCountry,
  ]);

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

  const buildFinalAddress = () => {
    if (countryType === "japan") {
      return `${prefecture} ${addressLine1Ja} ${addressLine2Ja}`.trim();
    }
    return [addressLine1, addressLine2, addressLine3, city, stateRegion, postalCode, selectedCountryName]
      .filter(Boolean).join(", ");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (countryType === "international" && orderLimitError) {
        setError(orderLimitError);
        setLoading(false);
        return;
      }
      if (countryType === "international" && !countryCode) {
        setError(t.selectCountry);
        setLoading(false);
        return;
      }
      if (countryType === "international" && !selectedZoneKey) {
        setError(t.unsupportedCountry);
        setLoading(false);
        return;
      }

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
              name, email, postalCode,
              prefecture: countryType === "japan" ? prefecture : selectedCountryName,
              address: finalAddress,
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
            name,
            email,
            address: countryType === "japan"
              ? { country: "JP", postal_code: postalCode, state: prefecture, line1: addressLine1Ja, line2: addressLine2Ja }
              : { country: countryCode, postal_code: postalCode, state: stateRegion, city, line1: addressLine1, line2: [addressLine2, addressLine3].filter(Boolean).join(" ") },
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
          prefecture: countryType === "japan" ? prefecture : selectedCountryName,
          countryType, countryCode, countryName: selectedCountryName,
          shippingZone: selectedZoneKey,
          shippingDiscountStep: discountStep,
          couponCode: couponStatus === "valid" ? couponCode : "",
          total, shipping,
        }),
      });

      onSuccess();
      navigate("/checkout/complete", {
        state: {
          name, email, postalCode,
          prefecture: countryType === "japan" ? prefecture : selectedCountryName,
          address: countryType === "japan"
            ? `${addressLine1Ja} ${addressLine2Ja}`.trim()
            : [addressLine1, addressLine2, addressLine3, city, stateRegion].filter(Boolean).join(", "),
          total, shipping,
          items: cartItems,
          countryType, countryCode, countryName: selectedCountryName,
          shippingZone: selectedZoneKey, lang,
        },
      });
    } catch (err) {
      setError(err.message || t.paymentFailed);
      setLoading(false);
    }

    setLoading(false);
  };

  // 送料プレビュー表示（バックエンドから返ってきた値を優先）
  const baseShipping = selectedZoneKey ? SHIPPING_BY_ZONE[selectedZoneKey] : null;
  const previewShipping = baseShipping !== null ? calcDiscountedShipping(baseShipping, discountStep, selectedZoneKey) : null;

  return (
    <form onSubmit={handleSubmit} className="checkout-inner">
      <p className="checkout-eyebrow">{t.eyebrow}</p>
      <h1 className="checkout-title">{t.title}</h1>

      {/* 注文内容 */}
      <div className="checkout-order-summary">
        <p className="checkout-section-label">{t.orderSummary}</p>
        {cartItems.map((item) => (
          <div key={item.id} className="checkout-order-item">
            <span className="checkout-order-title">{item.title}</span>
            <span className="checkout-order-qty">× {item.quantity}</span>
            <span className="checkout-order-price">¥{((item.price || 0) * (item.quantity || 0)).toLocaleString()}</span>
          </div>
        ))}

        <div className="checkout-order-item">
          <span className="checkout-order-title">{t.shipping}</span>
          <span className="checkout-order-price">
            {shipping === null
              ? (countryType === "international" && countryCode ? t.calculating : "-")
              : shipping === 0 ? t.free
              : `¥${shipping.toLocaleString()}`}
          </span>
        </div>

        {/* 送料割引バッジ */}
        {discountLabel && countryCode && (
          <div style={{ marginTop: "6px", padding: "8px 12px", borderRadius: "10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", fontSize: "12px", color: "rgba(255,255,255,0.78)", lineHeight: 1.6 }}>
            ✓ {discountLabel}
          </div>
        )}

        <div className="checkout-order-total">
          <span>{t.total}</span>
          <span>{total === null ? t.calculating : `¥${total.toLocaleString()}`}</span>
        </div>

        {countryType === "international" && orderLimitError && (
          <p style={{ marginTop: "8px", color: "#ff6b6b", fontSize: "13px", lineHeight: 1.6 }}>{orderLimitError}</p>
        )}
      </div>

      {/* お届け先 */}
      <div className="checkout-card-section">
        <p className="checkout-section-label">{t.shippingInfo}</p>
        <div className="checkout-card-container" style={{ display: "grid", gap: "12px" }}>
          <input type="text" placeholder={t.name} value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} />
          <input type="email" placeholder={t.email} value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} />

          <select
            value={countryType}
            onChange={(e) => {
              const nextType = e.target.value;
              setCountryType(nextType);
              setError("");
              setShipping(null);
              setTotal(null);
              setClientSecret("");
              if (nextType === "japan") {
                setCountryCode(""); setStateRegion(""); setCity("");
                setAddressLine1(""); setAddressLine2(""); setAddressLine3("");
              } else {
                setAddressLine1Ja(""); setAddressLine2Ja("");
              }
            }}
            style={{ ...inputStyle, background: "#111" }}
          >
            <option value="japan">{t.japan}</option>
            <option value="international">{t.other}</option>
          </select>

          {countryType === "japan" ? (
            <>
              <input type="text" placeholder={t.postalCode} value={postalCode} onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, "").slice(0, 7))} required style={inputStyle} />
              <select value={prefecture} onChange={(e) => setPrefecture(e.target.value)} style={{ ...inputStyle, background: "#111" }}>
                {PREFECTURES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <input type="text" placeholder={t.address1Ja} value={addressLine1Ja} onChange={(e) => setAddressLine1Ja(e.target.value)} required style={inputStyle} />
              <input type="text" placeholder={t.address2Ja} value={addressLine2Ja} onChange={(e) => setAddressLine2Ja(e.target.value)} style={inputStyle} />
            </>
          ) : (
            <>
              <select value={countryCode} onChange={(e) => setCountryCode(e.target.value)} required style={{ ...inputStyle, background: "#111" }}>
                <option value="">{t.country}</option>
                {COUNTRY_OPTIONS.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
              </select>

              {countryCode && selectedZoneKey && (
                <div style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: "14px", padding: "14px 16px", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.82)", fontSize: "13px", lineHeight: 1.7 }}>
                  <div><strong>{t.zone}:</strong> {getZoneLabel(selectedZoneKey, lang)}</div>
                  <div><strong>{t.shippingEstimate}:</strong> ¥{SHIPPING_BY_ZONE[selectedZoneKey].toLocaleString()}</div>
                  {discountStep > 0 && previewShipping !== null && (
                    <div style={{ marginTop: "6px", color: "rgba(255,255,255,0.6)" }}>
                      → {discountLabel}：¥{previewShipping.toLocaleString()}
                    </div>
                  )}
                </div>
              )}

              <p style={{ margin: 0, fontSize: "12px", lineHeight: 1.7, color: "rgba(255,255,255,0.58)" }}>
                {t.internationalRule}
              </p>

              <input type="text" placeholder={t.postalCode} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} required style={inputStyle} />
              <input type="text" placeholder={t.state} value={stateRegion} onChange={(e) => setStateRegion(e.target.value)} required style={inputStyle} />
              <input type="text" placeholder={t.city} value={city} onChange={(e) => setCity(e.target.value)} required style={inputStyle} />
              <input type="text" placeholder={t.address1} value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} required style={inputStyle} />
              <input type="text" placeholder={t.address2} value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} required style={inputStyle} />
              <input type="text" placeholder={t.address3} value={addressLine3} onChange={(e) => setAddressLine3(e.target.value)} style={inputStyle} />
            </>
          )}
        </div>
      </div>

      {/* クーポン入力 */}
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
            <p style={{ margin: "6px 0 0", fontSize: "12px", color: "rgba(100,255,150,0.9)" }}>✓ {t.couponApplied}</p>
          )}
          {couponStatus === "invalid" && (
            <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#ff6b6b" }}>{t.couponInvalid}</p>
          )}
        </div>
      )}

      {/* カード情報 */}
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
          (countryType === "international" && !!orderLimitError) ||
          (!hasSubscription && (!stripe || !clientSecret)) ||
          (countryType === "international" && !countryCode)
        }
      >
        {loading ? t.processing
          : hasSubscription ? t.startSubscription
          : countryType === "international" && orderLimitError ? t.cannotPurchaseLimit
          : `¥${total?.toLocaleString() ?? "..."} ${t.pay}`}
      </button>

      <button type="button" className="checkout-back-button" onClick={() => window.history.back()}>
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