// （上はそのままなので省略なしで全部書く）

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

// ==============================
// ここから修正ポイント
// ==============================

// ❌ 元は全体に制限かかってた
// ✅ 海外だけ制限に変更
function getOrderLimitError(cartItems = [], t, countryType) {
  if (countryType !== "international") return "";

  const beanCount = countBeanItems(cartItems);
  const coffeeBagCount = countCoffeeBagItems(cartItems);

  if (beanCount > 10) return t.beanLimitError;
  if (coffeeBagCount > 20) return t.coffeeBagLimitError;
  return "";
}

// ==============================
// CheckoutForm
// ==============================

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

  const hasSubscription = useMemo(
    () => (cartItems || []).some((item) => isSubscriptionItem(item)),
    [cartItems]
  );

  const cartSubtotal = useMemo(
    () =>
      (cartItems || []).reduce(
        (sum, item) => sum + (item.price || 0) * (item.quantity || 0),
        0
      ),
    [cartItems]
  );

  const selectedZoneKey =
    countryType === "international" ? getZoneByCountryCode(countryCode) : null;

  // ✅ ここ修正
  const orderLimitError = useMemo(
    () => getOrderLimitError(cartItems, t, countryType),
    [cartItems, t, countryType]
  );

  const selectedCountryName = getCountryName(countryCode);

  useEffect(() => {
    if (!cartItems || cartItems.length === 0) return;

    if (hasSubscription) {
      setShipping(0);
      setTotal(cartSubtotal);
      setClientSecret("");
      setError("");
      return;
    }

    // ✅ 日本なら制限無視
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

        const response = await fetch(
          "https://ryuge-site.onrender.com/create-payment-intent",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: cartItems,
              prefecture:
                countryType === "japan" ? prefecture : selectedZoneKey,
              countryType,
              countryCode,
              countryName: selectedCountryName,
              shippingZone: selectedZoneKey,
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
        setShipping(null);
        setTotal(null);
        setClientSecret("");
        setError(err.message || "Failed to initialize checkout.");
      }
    };

    initCheckout();
  }, [
    cartItems,
    prefecture,
    countryType,
    countryCode,
    selectedZoneKey,
    selectedCountryName,
    hasSubscription,
    cartSubtotal,
    orderLimitError,
    t.unsupportedCountry,
  ]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // ✅ 海外だけ制限
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
          billing_details: {
            name,
            email,
          },
        },
      });

      if (result.error) {
        setError(result.error.message || "Payment failed.");
        setLoading(false);
        return;
      }

      onSuccess();
      navigate("/checkout/complete");
    } catch (err) {
      setError(err.message || "Payment failed.");
      setLoading(false);
    }

    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <button
        type="submit"
        disabled={
          loading ||
          (countryType === "international" && !!orderLimitError) ||
          (!hasSubscription && (!stripe || !clientSecret)) ||
          (countryType === "international" && !countryCode)
        }
      >
        {loading ? t.processing : `¥${total ?? "..."} ${t.pay}`}
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