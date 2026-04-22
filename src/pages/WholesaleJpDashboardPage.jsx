// src/pages/WholesaleJpDashboardPage.jsx
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import RequireApproved from "../components/wholesale/RequireApproved";

const COLORS = {
  bg: "#050505",
  panel: "#0b0b0b",
  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.16)",
  text: "rgba(255,255,255,0.92)",
  softText: "rgba(255,255,255,0.68)",
  mutedText: "rgba(255,255,255,0.42)",
};

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
        backgroundColor: COLORS.bg,
        color: COLORS.text,
        fontFamily:
          '"Cormorant Garamond", "Noto Serif JP", "Hiragino Mincho ProN", serif',
      }}
    >
      {/* header */}
      <header
        style={{
          borderBottom: `1px solid ${COLORS.border}`,
          backgroundColor: "rgba(5,5,5,0.92)",
          backdropFilter: "blur(8px)",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div
          style={{
            maxWidth: "1440px",
            margin: "0 auto",
            padding: "1.35rem 3.2rem",
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
          }}
        >
          <div>
            <Link
              to="/"
              style={{
                textDecoration: "none",
                color: COLORS.text,
                fontSize: "0.95rem",
                letterSpacing: "0.18em",
              }}
            >
              Ryuge Coffee
            </Link>
          </div>

          <nav
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "2rem",
            }}
          >
            <Link to="/products" style={navLinkStyle}>
              商品
            </Link>
            <Link to="/wholesale-jp" style={navLinkStyle}>
              卸ページ
            </Link>
          </nav>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "1.5rem",
              alignItems: "center",
            }}
          >
            <button onClick={logout} style={headerButtonStyle}>
              Logout
            </button>
          </div>
        </div>
      </header>

      <main
        style={{
          maxWidth: "1180px",
          margin: "0 auto",
          padding: "5rem 3rem 7rem",
        }}
      >
        <div style={{ marginBottom: "3rem" }}>
          <p
            style={{
              margin: "0 0 1rem",
              color: COLORS.mutedText,
              fontSize: "0.7rem",
              letterSpacing: "0.24em",
              textTransform: "uppercase",
            }}
          >
            Wholesale Dashboard
          </p>

          <h1
            style={{
              margin: "0 0 1rem",
              fontSize: "2.8rem",
              fontWeight: 400,
              letterSpacing: "0.05em",
              lineHeight: 1.25,
              color: COLORS.text,
            }}
          >
            ダッシュボード
          </h1>

          <p
            style={{
              margin: 0,
              color: COLORS.softText,
              fontSize: "0.92rem",
              lineHeight: 1.95,
              letterSpacing: "0.03em",
            }}
          >
            {user?.email}
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "1.4rem",
            marginBottom: "4rem",
          }}
        >
          <DashboardCard
            title="卸商品一覧"
            body="国内卸価格・商品ラインナップをご確認いただけます。"
            buttonText="商品を見る"
            to="/wholesale-jp"
          />

          <DashboardCard
            title="オリジナルバッグ制作"
            body="貴社ロゴ入りのドリップバッグ制作についてご相談いただけます。"
            href="mailto:ryugecoffee@gmail.com?subject=オリジナルコーヒーバッグ制作のご相談"
            buttonText="メールで相談"
          />

          <DashboardCard
            title="お問い合わせ"
            body="ご注文・納期・お支払い条件についてはこちらからご連絡ください。"
            href="mailto:ryugecoffee@gmail.com?subject=卸販売についてのお問い合わせ"
            buttonText="メールを送る"
          />
        </div>

        <div
          style={{
            borderTop: `1px solid ${COLORS.border}`,
            paddingTop: "2rem",
          }}
        >
          <p
            style={{
              margin: 0,
              color: COLORS.mutedText,
              fontSize: "0.8rem",
              lineHeight: 2,
              letterSpacing: "0.03em",
            }}
          >
            このページは承認済みのお取引先様専用です。
            <br />
            内容の転用・共有はご遠慮ください。
          </p>
        </div>
      </main>
    </div>
  );
}

function DashboardCard({ title, body, buttonText, to, href }) {
  const content = (
    <>
      <p
        style={{
          margin: "0 0 1rem",
          color: COLORS.text,
          fontSize: "1.15rem",
          lineHeight: 1.5,
          letterSpacing: "0.03em",
        }}
      >
        {title}
      </p>

      <p
        style={{
          margin: "0 0 1.6rem",
          color: COLORS.softText,
          fontSize: "0.85rem",
          lineHeight: 1.95,
        }}
      >
        {body}
      </p>

      <span style={cardButtonStyle}>{buttonText}</span>
    </>
  );

  if (to) {
    return (
      <Link to={to} style={cardStyle}>
        {content}
      </Link>
    );
  }

  return (
    <a href={href} style={cardStyle}>
      {content}
    </a>
  );
}

const navLinkStyle = {
  textDecoration: "none",
  color: "rgba(255,255,255,0.62)",
  fontSize: "0.78rem",
  letterSpacing: "0.08em",
};

const headerButtonStyle = {
  background: "none",
  border: "none",
  color: "rgba(255,255,255,0.52)",
  fontSize: "0.76rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  cursor: "pointer",
  fontFamily: "inherit",
};

const cardStyle = {
  display: "block",
  textDecoration: "none",
  backgroundColor: COLORS.panel,
  border: `1px solid ${COLORS.border}`,
  padding: "1.8rem 1.7rem",
  minHeight: "220px",
};

const cardButtonStyle = {
  display: "inline-block",
  border: `1px solid ${COLORS.borderStrong}`,
  color: COLORS.text,
  padding: "0.7rem 1.2rem",
  fontSize: "0.72rem",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
};