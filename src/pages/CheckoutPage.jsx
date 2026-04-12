import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const SQUARE_APP_ID = "sandbox-sq0idb-6860ODXZ1N4xXKLOem9WJQ";
const SQUARE_LOCATION_ID = "LS35CQ8K36VVV";

export default function CheckoutPage({ cartItems, setCartItems, lang }) {
  const navigate = useNavigate();
  const paymentsRef = useRef(null);
  const cardInstanceRef = useRef(null);
  const initializedRef = useRef(false);

  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const total = cartItems.reduce(
    (sum, item) => sum + (item.price || 0) * item.quantity,
    0
  );

  useEffect(() => {
    if (cartItems.length === 0) {
      navigate("/products");
    }
  }, []);

  useEffect(() => {
    if (initializedRef.current) return;

    const initSquare = async () => {
      if (!window.Square) {
        setErrorMessage("Square SDKの読み込みに失敗しました");
        return;
      }
      if (initializedRef.current) return;
      initializedRef.current = true;

      try {
        const payments = window.Square.payments(SQUARE_APP_ID, SQUARE_LOCATION_ID);
        paymentsRef.current = payments;
        const card = await payments.card();
        await card.attach("#card-container");
        cardInstanceRef.current = card;
      } catch (err) {
        console.error("Square init error:", err);
        setErrorMessage("カード入力フォームの初期化に失敗しました");
        initializedRef.current = false;
      }
    };

    if (window.Square) {
      initSquare();
      return;
    }

    const existing = document.querySelector(
      'script[src="https://sandbox.web.squarecdn.com/v1/square.js"]'
    );
    if (existing) {
      existing.addEventListener("load", initSquare);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://sandbox.web.squarecdn.com/v1/square.js";
    script.onload = initSquare;
    script.onerror = () => setErrorMessage("Square SDKの読み込みに失敗しました");
    document.head.appendChild(script);

    return () => {
      if (cardInstanceRef.current) {
        cardInstanceRef.current.destroy().catch(() => {});
        cardInstanceRef.current = null;
      }
    };
  }, []);

  const handlePay = async () => {
    if (!cardInstanceRef.current) return;

    setStatus("processing");
    setErrorMessage("");

    try {
      const result = await cardInstanceRef.current.tokenize();
      console.log("tokenize result:", JSON.stringify(result));

      if (result.status !== "OK") {
        setErrorMessage("カード情報を確認してください");
        setStatus("idle");
        return;
      }

      const res = await fetch("/api/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: result.token, cartItems }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || "決済に失敗しました");
        setStatus("idle");
        return;
      }

      setCartItems([]);
      navigate("/checkout/complete");
    } catch (err) {
      console.error(err);
      setErrorMessage("通信エラーが発生しました");
      setStatus("idle");
    }
  };

  return (
    <div className="checkout-page">
      <div className="checkout-inner">
        <p className="checkout-eyebrow">Checkout</p>
        <h1 className="checkout-title">お支払い</h1>

        <div className="checkout-order-summary">
          <p className="checkout-section-label">注文内容</p>
          {cartItems.map((item) => (
            <div key={item.id} className="checkout-order-item">
              <span className="checkout-order-title">{item.title}</span>
              <span className="checkout-order-qty">× {item.quantity}</span>
              <span className="checkout-order-price">
                ¥{((item.price || 0) * item.quantity).toLocaleString()}
              </span>
            </div>
          ))}
          <div className="checkout-order-total">
            <span>合計</span>
            <span>¥{total.toLocaleString()}</span>
          </div>
        </div>

        <div className="checkout-card-section">
          <p className="checkout-section-label">カード情報</p>
          <div id="card-container" className="checkout-card-container" />
        </div>

        {errorMessage && (
          <p className="checkout-error">{errorMessage}</p>
        )}

        <button
          className="checkout-pay-button"
          onClick={handlePay}
          disabled={status === "processing"}
        >
          {status === "processing" ? "処理中..." : `¥${total.toLocaleString()} を支払う`}
        </button>

        <button
          className="checkout-back-button"
          onClick={() => navigate("/products")}
        >
          ← 商品ページに戻る
        </button>
      </div>
    </div>
  );
}