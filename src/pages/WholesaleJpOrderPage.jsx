import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import RequireApproved from "../components/wholesale/RequireApproved";

export default function WholesaleJpOrderPage() {
  return (
    <RequireApproved>
      <OrderContent />
    </RequireApproved>
  );
}

function OrderContent() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const cartItems = location.state?.cartItems || [];

  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    email: user?.email || "",
    phone: "",
    postalCode: "",
    address: "",
    note: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const subtotal = cartItems.reduce(
    (sum, item) => sum + Number(item.wholesalePrice || 0) * Number(item.quantity || 0),
    0
  );

  const totalAmount = Math.floor(subtotal * 1.1);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (
      !form.companyName ||
      !form.contactName ||
      !form.email ||
      !form.phone ||
      !form.address
    ) {
      setError("必須項目をすべてご入力ください。");
      return;
    }

    if (cartItems.length === 0) {
      setError("商品が選択されていません。");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/wholesale-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cartItems,
          companyName: form.companyName,
          contactName: form.contactName,
          email: form.email,
          phone: form.phone,
          postalCode: form.postalCode,
          address: form.address,
          note: form.note,
          paymentMethod: "後払い（請求書払い）",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "送信に失敗しました。");
      }

      navigate("/wholesale-jp/order/complete");
    } catch (e) {
      console.error(e);
      setError(e.message || "送信に失敗しました。時間をおいて再度お試しください。");
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#2a2a2a",
        fontFamily: "Cormorant Garamond, serif",
        color: "#e8e2d9",
      }}
    >
      <div
        style={{
          borderBottom: "1px solid #3a3a3a",
          backgroundColor: "#2a2a2a",
          padding: "1.2rem 3rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <Link
          to="/"
          style={{
            textDecoration: "none",
            fontSize: "0.9rem",
            letterSpacing: "0.2em",
            color: "#e8e2d9",
            textTransform: "uppercase",
          }}
        >
          Ryuge Coffee
        </Link>

        <div style={{ display: "flex", gap: "2rem", alignItems: "center" }}>
          <Link
            to="/wholesale-jp"
            style={{
              fontSize: "0.68rem",
              color: "#888",
              textDecoration: "none",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            ← Products
          </Link>

          <button
            onClick={logout}
            style={{
              fontSize: "0.68rem",
              color: "#666",
              background: "none",
              border: "none",
              cursor: "pointer",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              padding: 0,
              fontFamily: "Cormorant Garamond, serif",
            }}
          >
            Logout
          </button>
        </div>
      </div>

      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "5rem 3rem 7rem" }}>
        <div style={{ marginBottom: "3.5rem" }}>
          <p
            style={{
              fontSize: "0.65rem",
              letterSpacing: "0.26em",
              textTransform: "uppercase",
              color: "#666",
              margin: "0 0 0.8rem",
            }}
          >
            Wholesale — Order
          </p>

          <h1
            style={{
              fontSize: "1.8rem",
              fontWeight: 400,
              letterSpacing: "0.06em",
              color: "#e8e2d9",
              margin: 0,
              lineHeight: 1.3,
            }}
          >
            発注フォーム
          </h1>
        </div>

        {cartItems.length === 0 && (
          <div
            style={{
              padding: "2rem",
              borderLeft: "2px solid #444",
              backgroundColor: "#333",
              marginBottom: "3rem",
            }}
          >
            <p style={{ fontSize: "0.78rem", color: "#888", margin: 0, lineHeight: 1.9 }}>
              選択された商品がありません。
              <Link
                to="/wholesale-jp"
                style={{ color: "#e8e2d9", marginLeft: "0.5em", textDecoration: "underline" }}
              >
                商品ページへ戻る
              </Link>
            </p>
          </div>
        )}

        {cartItems.length > 0 && (
          <div style={{ marginBottom: "3.5rem" }}>
            <p
              style={{
                fontSize: "0.65rem",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "#555",
                margin: "0 0 1.2rem",
              }}
            >
              Order Summary
            </p>

            <div
              style={{
                border: "1px solid #3a3a3a",
                backgroundColor: "#333",
              }}
            >
              {cartItems.map((item, i) => (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "1rem 1.4rem",
                    borderBottom: i < cartItems.length - 1 ? "1px solid #3a3a3a" : "none",
                  }}
                >
                  <div>
                    <p
                      style={{
                        fontSize: "0.82rem",
                        color: "#e8e2d9",
                        margin: "0 0 0.2rem",
                        letterSpacing: "0.03em",
                      }}
                    >
                      {item.name}
                    </p>
                    <p style={{ fontSize: "0.68rem", color: "#666", margin: 0 }}>
                      ¥{Number(item.wholesalePrice || 0).toLocaleString()} × {item.quantity}
                    </p>
                  </div>

                  <p
                    style={{
                      fontSize: "0.85rem",
                      color: "#e8e2d9",
                      margin: 0,
                      letterSpacing: "0.04em",
                    }}
                  >
                    ¥
                    {(
                      Number(item.wholesalePrice || 0) * Number(item.quantity || 0)
                    ).toLocaleString()}
                  </p>
                </div>
              ))}

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "1.2rem 1.4rem",
                  borderTop: "1px solid #444",
                  backgroundColor: "#2a2a2a",
                }}
              >
                <div>
                  <p style={{ fontSize: "0.68rem", color: "#666", margin: 0 }}>小計</p>
                  <p style={{ fontSize: "0.85rem", margin: 0 }}>
                    ¥{subtotal.toLocaleString()}
                  </p>
                </div>

                <div>
                  <p style={{ fontSize: "0.68rem", color: "#666", margin: 0 }}>
                    合計（税込）
                  </p>
                  <p style={{ fontSize: "1rem", margin: 0 }}>
                    ¥{totalAmount.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: "1rem",
                padding: "0.8rem 1.4rem",
                borderLeft: "2px solid #444",
                backgroundColor: "#333",
                fontSize: "0.72rem",
                color: "#777",
                letterSpacing: "0.04em",
                lineHeight: 1.8,
              }}
            >
              お支払い方法：<span style={{ color: "#aaa" }}>後払い（請求書払い）</span>
              　※ 発注確認後、請求書をお送りします。
            </div>
          </div>
        )}

        {error && (
          <div
            style={{
              marginBottom: "1.5rem",
              padding: "0.8rem 1rem",
              borderLeft: "2px solid #7a3a3a",
              backgroundColor: "#3a2a2a",
              fontSize: "0.75rem",
              color: "#c08080",
              letterSpacing: "0.04em",
              lineHeight: 1.8,
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <p
            style={{
              fontSize: "0.65rem",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#555",
              margin: "0 0 1.5rem",
            }}
          >
            Delivery Information
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.2rem" }}>
              <OrderField
                label="貴社名・店舗名"
                name="companyName"
                value={form.companyName}
                onChange={handleChange}
                required
              />
              <OrderField
                label="担当者名"
                name="contactName"
                value={form.contactName}
                onChange={handleChange}
                required
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.2rem" }}>
              <OrderField
                label="メールアドレス"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                required
              />
              <OrderField
                label="電話番号"
                name="phone"
                type="tel"
                value={form.phone}
                onChange={handleChange}
                required
              />
            </div>

            <OrderField
              label="郵便番号"
              name="postalCode"
              value={form.postalCode}
              onChange={handleChange}
              placeholder="例：248-0006"
            />

            <OrderField
              label="住所"
              name="address"
              value={form.address}
              onChange={handleChange}
              required
              placeholder="例：神奈川県鎌倉市..."
            />

            <div>
              <label
                style={{
                  fontSize: "0.65rem",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "#666",
                  display: "block",
                  marginBottom: "0.5rem",
                }}
              >
                備考
              </label>

              <textarea
                name="note"
                value={form.note}
                onChange={handleChange}
                rows={4}
                placeholder="納期のご希望・特記事項など（任意）"
                style={{
                  width: "100%",
                  padding: "0.7rem 0.9rem",
                  backgroundColor: "#333",
                  border: "1px solid #444",
                  color: "#e8e2d9",
                  fontSize: "0.82rem",
                  fontFamily: "Cormorant Garamond, serif",
                  outline: "none",
                  resize: "vertical",
                  lineHeight: 1.8,
                  letterSpacing: "0.03em",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading || cartItems.length === 0}
              style={{
                marginTop: "1rem",
                padding: "1rem",
                backgroundColor: "transparent",
                color: "#e8e2d9",
                border: "1px solid #666",
                fontSize: "0.72rem",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                cursor: loading || cartItems.length === 0 ? "not-allowed" : "pointer",
                opacity: loading || cartItems.length === 0 ? 0.4 : 1,
                fontFamily: "Cormorant Garamond, serif",
                transition: "border-color 0.2s",
              }}
              onMouseEnter={(e) => {
                if (!loading && cartItems.length > 0) {
                  e.currentTarget.style.borderColor = "#e8e2d9";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#666";
              }}
            >
              {loading ? "送信中..." : "注文を送信する"}
            </button>

            <p
              style={{
                fontSize: "0.68rem",
                color: "#555",
                margin: 0,
                lineHeight: 1.9,
                letterSpacing: "0.03em",
                textAlign: "center",
              }}
            >
              送信後、内容確認のうえご連絡いたします。
              <br />
              決済は行われません。
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

function OrderField({
  label,
  name,
  type = "text",
  value,
  onChange,
  required,
  placeholder,
}) {
  return (
    <div>
      <label
        style={{
          fontSize: "0.65rem",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "#666",
          display: "block",
          marginBottom: "0.5rem",
        }}
      >
        {label}
        {required && (
          <span style={{ color: "#7a5a5a", marginLeft: "0.4rem", fontSize: "0.6rem" }}>
            *
          </span>
        )}
      </label>

      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "0.7rem 0.9rem",
          backgroundColor: "#333",
          border: "1px solid #444",
          color: "#e8e2d9",
          fontSize: "0.82rem",
          fontFamily: "Cormorant Garamond, serif",
          outline: "none",
          letterSpacing: "0.03em",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}