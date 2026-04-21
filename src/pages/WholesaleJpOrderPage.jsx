// src/pages/WholesaleJpOrderPage.jsx
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

  const totalAmount = cartItems.reduce(
    (sum, item) => sum + item.wholesalePrice * item.quantity, 0
  );

  const handleSubmit = async () => {
    setError("");

    if (!form.companyName || !form.contactName || !form.email || !form.phone || !form.address) {
      setError("必須項目をすべてご入力ください。");
      return;
    }

    setLoading(true);

    try {
      // メール送信（mailto形式でフォールバック）
      const subject = encodeURIComponent("【卸発注】" + form.companyName);
      const itemLines = cartItems
        .map((item) => `・${item.name} × ${item.quantity}（¥${(item.wholesalePrice * item.quantity).toLocaleString()}）`)
        .join("\n");

      const body = encodeURIComponent(
        `【発注内容】\n${itemLines}\n\n合計：¥${totalAmount.toLocaleString()}（税抜）\n\n` +
        `【お届け先】\n` +
        `貴社名・店舗名：${form.companyName}\n` +
        `担当者名：${form.contactName}\n` +
        `メール：${form.email}\n` +
        `電話番号：${form.phone}\n` +
        `郵便番号：${form.postalCode}\n` +
        `住所：${form.address}\n` +
        `備考：${form.note || "なし"}\n\n` +
        `お支払い方法：後払い（請求書払い）`
      );

      window.location.href = `mailto:ryugecoffee@gmail.com?subject=${subject}&body=${body}`;

      // 少し待ってから完了ページへ
      setTimeout(() => {
        navigate("/wholesale-jp/order/complete");
      }, 1000);
    } catch (e) {
      console.error(e);
      setError("送信に失敗しました。直接メールにてご連絡ください。");
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: "#2a2a2a",
      fontFamily: "Cormorant Garamond, serif",
      color: "#e8e2d9",
    }}>

      {/* ヘッダー */}
      <div style={{
        borderBottom: "1px solid #3a3a3a",
        backgroundColor: "#2a2a2a",
        padding: "1.2rem 3rem",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}>
        <Link to="/" style={{
          textDecoration: "none",
          fontSize: "0.9rem",
          letterSpacing: "0.2em",
          color: "#e8e2d9",
          textTransform: "uppercase",
        }}>
          Ryuge Coffee
        </Link>
        <div style={{ display: "flex", gap: "2rem", alignItems: "center" }}>
          <Link to="/wholesale-jp" style={{
            fontSize: "0.68rem",
            color: "#888",
            textDecoration: "none",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}>
            ← Products
          </Link>
          <button onClick={logout} style={{
            fontSize: "0.68rem",
            color: "#666",
            background: "none",
            border: "none",
            cursor: "pointer",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            padding: 0,
            fontFamily: "Cormorant Garamond, serif",
          }}>
            Logout
          </button>
        </div>
      </div>

      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "5rem 3rem 7rem" }}>

        {/* タイトル */}
        <div style={{ marginBottom: "3.5rem" }}>
          <p style={{
            fontSize: "0.65rem",
            letterSpacing: "0.26em",
            textTransform: "uppercase",
            color: "#666",
            margin: "0 0 0.8rem",
          }}>
            Wholesale — Order
          </p>
          <h1 style={{
            fontSize: "1.8rem",
            fontWeight: 400,
            letterSpacing: "0.06em",
            color: "#e8e2d9",
            margin: 0,
            lineHeight: 1.3,
          }}>
            発注フォーム
          </h1>
        </div>

        {/* カートが空の場合 */}
        {cartItems.length === 0 && (
          <div style={{
            padding: "2rem",
            borderLeft: "2px solid #444",
            backgroundColor: "#333",
            marginBottom: "3rem",
          }}>
            <p style={{ fontSize: "0.78rem", color: "#888", margin: 0, lineHeight: 1.9 }}>
              選択された商品がありません。
              <Link to="/wholesale-jp" style={{ color: "#e8e2d9", marginLeft: "0.5em", textDecoration: "underline" }}>
                商品ページへ戻る
              </Link>
            </p>
          </div>
        )}

        {/* 注文内容確認 */}
        {cartItems.length > 0 && (
          <div style={{ marginBottom: "3.5rem" }}>
            <p style={{
              fontSize: "0.65rem",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#555",
              margin: "0 0 1.2rem",
            }}>
              Order Summary
            </p>

            <div style={{
              border: "1px solid #3a3a3a",
              backgroundColor: "#333",
            }}>
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
                    <p style={{ fontSize: "0.82rem", color: "#e8e2d9", margin: "0 0 0.2rem", letterSpacing: "0.03em" }}>
                      {item.name}
                    </p>
                    <p style={{ fontSize: "0.68rem", color: "#666", margin: 0 }}>
                      ¥{item.wholesalePrice.toLocaleString()} × {item.quantity}
                    </p>
                  </div>
                  <p style={{ fontSize: "0.85rem", color: "#e8e2d9", margin: 0, letterSpacing: "0.04em" }}>
                    ¥{(item.wholesalePrice * item.quantity).toLocaleString()}
                  </p>
                </div>
              ))}

              {/* 合計 */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "1.2rem 1.4rem",
                borderTop: "1px solid #444",
                backgroundColor: "#2a2a2a",
              }}>
                <p style={{ fontSize: "0.68rem", color: "#666", margin: 0, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Subtotal（税抜）
                </p>
                <p style={{ fontSize: "1rem", color: "#e8e2d9", margin: 0, letterSpacing: "0.04em" }}>
                  ¥{totalAmount.toLocaleString()}
                </p>
              </div>
            </div>

            {/* 支払い方法 */}
            <div style={{
              marginTop: "1rem",
              padding: "0.8rem 1.4rem",
              borderLeft: "2px solid #444",
              backgroundColor: "#333",
              fontSize: "0.72rem",
              color: "#777",
              letterSpacing: "0.04em",
              lineHeight: 1.8,
            }}>
              お支払い方法：<span style={{ color: "#aaa" }}>後払い（請求書払い）</span>
              　※ 発注確認後、請求書をお送りします。
            </div>
          </div>
        )}

        {/* エラー */}
        {error && (
          <div style={{
            marginBottom: "1.5rem",
            padding: "0.8rem 1rem",
            borderLeft: "2px solid #7a3a3a",
            backgroundColor: "#3a2a2a",
            fontSize: "0.75rem",
            color: "#c08080",
            letterSpacing: "0.04em",
            lineHeight: 1.8,
          }}>
            {error}
          </div>
        )}

        {/* 入力フォーム */}
        <div>
          <p style={{
            fontSize: "0.65rem",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "#555",
            margin: "0 0 1.5rem",
          }}>
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

            {/* 備考 */}
            <div>
              <label style={{
                fontSize: "0.65rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#666",
                display: "block",
                marginBottom: "0.5rem",
              }}>
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

            {/* 送信ボタン */}
            <button
              onClick={handleSubmit}
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
                cursor: (loading || cartItems.length === 0) ? "not-allowed" : "pointer",
                opacity: (loading || cartItems.length === 0) ? 0.4 : 1,
                fontFamily: "Cormorant Garamond, serif",
                transition: "border-color 0.2s",
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.borderColor = "#e8e2d9"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#666"; }}
            >
              {loading ? "送信中..." : "注文を送信する"}
            </button>

            <p style={{
              fontSize: "0.68rem",
              color: "#555",
              margin: 0,
              lineHeight: 1.9,
              letterSpacing: "0.03em",
              textAlign: "center",
            }}>
              送信後、内容確認のうえご連絡いたします。<br />
              決済は行われません。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderField({ label, name, type = "text", value, onChange, required, placeholder }) {
  return (
    <div>
      <label style={{
        fontSize: "0.65rem",
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "#666",
        display: "block",
        marginBottom: "0.5rem",
      }}>
        {label}
        {required && (
          <span style={{ color: "#7a5a5a", marginLeft: "0.4rem", fontSize: "0.6rem" }}>*</span>
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