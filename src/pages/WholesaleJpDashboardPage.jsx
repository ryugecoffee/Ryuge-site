import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import RequireApproved from "../components/wholesale/RequireApproved";

export default function WholesaleJpDashboardPage() {
  return (
    <RequireApproved>
      <DashboardContent />
    </RequireApproved>
  );
}

function DashboardContent() {
  const { user, logout } = useAuth();

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#2a2a2a",
        fontFamily: "Cormorant Garamond, serif",
        color: "#e8e2d9",
      }}
    >
      {/* ヘッダー */}
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
            Products
          </Link>

          <Link
            to="/wholesale-jp/order"
            style={{
              fontSize: "0.68rem",
              color: "#888",
              textDecoration: "none",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            Order
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

      {/* メイン */}
      <div style={{ maxWidth: "1080px", margin: "0 auto", padding: "5rem 3rem 7rem" }}>
        {/* タイトル */}
        <div style={{ marginBottom: "4rem" }}>
          <p
            style={{
              fontSize: "0.65rem",
              letterSpacing: "0.26em",
              textTransform: "uppercase",
              color: "#666",
              margin: "0 0 0.8rem",
            }}
          >
            Wholesale — Dashboard
          </p>

          <h1
            style={{
              fontSize: "1.8rem",
              fontWeight: 400,
              letterSpacing: "0.06em",
              color: "#e8e2d9",
              margin: "0 0 0.6rem",
              lineHeight: 1.3,
            }}
          >
            ようこそ
          </h1>

          <p
            style={{
              fontSize: "0.75rem",
              color: "#555",
              margin: 0,
              letterSpacing: "0.06em",
            }}
          >
            {user?.email}
          </p>
        </div>

        {/* カードグリッド */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: "1.2rem",
            marginBottom: "5rem",
          }}
        >
          <DashboardCard
            eyebrow="Products"
            title="卸商品一覧"
            description="国内卸価格・商品ラインナップを確認できます。"
            linkTo="/wholesale-jp"
            linkLabel="View Products"
          />

          <DashboardCard
            eyebrow="Order"
            title="発注フォーム"
            description="商品を選んで発注内容を送信できます。後払い対応。"
            linkTo="/wholesale-jp/order"
            linkLabel="Go to Order"
          />

          <DashboardCard
            eyebrow="Original"
            title="オリジナルバッグ制作"
            description="貴社ロゴ入りのドリップバッグ制作のご相談はこちら。"
            linkHref="mailto:ryugecoffee@gmail.com?subject=オリジナルコーヒーバッグ制作のご相談"
            linkLabel="Contact"
          />

          <DashboardCard
            eyebrow="Support"
            title="お問い合わせ"
            description="ご注文・納期・お支払いについてはメールにてご連絡ください。"
            linkHref="mailto:ryugecoffee@gmail.com"
            linkLabel="Send Email"
          />
        </div>

        {/* 注意書き */}
        <div
          style={{
            borderTop: "1px solid #3a3a3a",
            paddingTop: "2rem",
          }}
        >
          <p
            style={{
              fontSize: "0.72rem",
              color: "#555",
              lineHeight: 2,
              margin: 0,
              letterSpacing: "0.04em",
            }}
          >
            このページは承認済みの卸取引先様専用です。内容の転用・共有はご遠慮ください。
          </p>
        </div>
      </div>
    </div>
  );
}

function DashboardCard({ eyebrow, title, description, linkTo, linkHref, linkLabel }) {
  return (
    <div
      style={{
        backgroundColor: "#333",
        border: "1px solid #3a3a3a",
        borderRadius: "2px",
        padding: "1.8rem 1.6rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        transition: "border-color 0.25s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#555";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#3a3a3a";
      }}
    >
      <p
        style={{
          fontSize: "0.62rem",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "#555",
          margin: 0,
        }}
      >
        {eyebrow}
      </p>

      <p
        style={{
          fontSize: "0.95rem",
          fontWeight: 500,
          color: "#e8e2d9",
          margin: 0,
          letterSpacing: "0.04em",
        }}
      >
        {title}
      </p>

      <p
        style={{
          fontSize: "0.75rem",
          color: "#777",
          margin: 0,
          lineHeight: 1.9,
          letterSpacing: "0.03em",
        }}
      >
        {description}
      </p>

      <div style={{ marginTop: "auto", paddingTop: "1.4rem" }}>
        {linkTo ? (
          <Link
            to={linkTo}
            style={{
              fontSize: "0.62rem",
              color: "#e8e2d9",
              border: "1px solid #555",
              padding: "0.4rem 1.1rem",
              textDecoration: "none",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              display: "inline-block",
              transition: "border-color 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#e8e2d9";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#555";
            }}
          >
            {linkLabel}
          </Link>
        ) : (
          <a
            href={linkHref}
            style={{
              fontSize: "0.62rem",
              color: "#e8e2d9",
              border: "1px solid #555",
              padding: "0.4rem 1.1rem",
              textDecoration: "none",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              display: "inline-block",
              transition: "border-color 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#e8e2d9";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#555";
            }}
          >
            {linkLabel}
          </a>
        )}
      </div>
    </div>
  );
}