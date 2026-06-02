// src/pages/WholesaleJpOrderCompletePage.jsx
import { Link } from "react-router-dom";

export default function WholesaleJpOrderCompletePage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#2a2a2a",
        color: "#e8e2d9",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "3rem 2rem",
      }}
    >
      <div style={{ width: "100%", maxWidth: "520px", textAlign: "center" }}>
        <p
          style={{

            fontSize: "0.7rem",
            fontWeight: 500,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.55)",
            margin: "0 0 1.5rem",
          }}
        >
          Wholesale — Order Complete
        </p>

        <h1
          style={{
            fontSize: "1.8rem",
            fontWeight: 400,
            letterSpacing: "0.06em",
            color: "#e8e2d9",
            margin: "0 0 1.8rem",
            lineHeight: 1.4,
          }}
        >
          ご注文を受け付けました
        </h1>

        <p
          style={{
            fontSize: "0.8rem",
            color: "#777",
            lineHeight: 2.3,
            margin: "0 0 3rem",
            letterSpacing: "0.04em",
          }}
        >
          発注内容を確認の上、担当者よりご連絡いたします。
          <br />
          お支払いについては、請求書をお送りした後にご対応ください。
          <br />
          ご不明な点は{" "}
          <a
            href="mailto:ryugecoffee@gmail.com"
            style={{ color: "#999", textDecoration: "underline" }}
          >
            ryugecoffee@gmail.com
          </a>{" "}
          までご連絡ください。
        </p>

        <div
          style={{
            width: "40px",
            height: "1px",
            backgroundColor: "#3a3a3a",
            margin: "0 auto 3rem",
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            alignItems: "center",
          }}
        >
          <Link
            to="/wholesale-jp"
            style={{
              fontSize: "0.68rem",
              color: "#e8e2d9",
              border: "1px solid #555",
              padding: "0.7rem 2rem",
              textDecoration: "none",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              transition: "border-color 0.2s",
              display: "inline-block",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#e8e2d9")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#555")}
          >
            商品ページへ戻る
          </Link>

          <Link
            to="/wholesale-jp/dashboard"
            style={{
  
              fontSize: "0.65rem",
              fontWeight: 500,
              color: "#666",
              textDecoration: "none",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}