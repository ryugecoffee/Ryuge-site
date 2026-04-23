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

const baseFontFamily =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';

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
        fontFamily: baseFontFamily,
      }}
    >
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
            padding: "0.9rem 1rem",
            display: "grid",
            gridTemplateColumns: "1fr auto auto",
            alignItems: "center",
            gap: "0.8rem",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <Link
              to="/"
              style={{
                textDecoration: "none",
                color: COLORS.text,
                fontSize: "0.78rem",
                letterSpacing: "0.14em",
                whiteSpace: "nowrap",
                textTransform: "uppercase",
              }}
            >
              Ryuge Coffee
            </Link>
          </div>

          <nav
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "0.9rem",
              minWidth: 0,
            }}
          >
            <Link to="/products" style={mobileNavLinkStyle}>
              商品
            </Link>
            <Link to="/wholesale-jp" style={mobileNavLinkStyle}>
              卸ページ
            </Link>
          </nav>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
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
          padding: "1.5rem 0.75rem 4rem",
        }}
      >
        <div style={{ marginBottom: "1.4rem" }}>
          <p
            style={{
              margin: "0 0 0.5rem",
              color: COLORS.mutedText,
              fontSize: "0.55rem",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
            }}
          >
            Wholesale Dashboard
          </p>

          <h1
            style={{
              margin: "0 0 0.6rem",
              fontSize: "1.25rem",
              fontWeight: 500,
              letterSpacing: "0.03em",
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
              fontSize: "0.66rem",
              lineHeight: 1.7,
              letterSpacing: "0.02em",
              overflowWrap: "anywhere",
            }}
          >
            {user?.email}
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "0.45rem",
            marginBottom: "2rem",
            alignItems: "stretch",
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
            buttonText="メール相談"
          />

          <DashboardCard
            title="お問い合わせ"
            body="ご注文・納期・お支払い条件についてはこちらからご連絡ください。"
            href="mailto:ryugecoffee@gmail.com?subject=卸販売についてのお問い合わせ"
            buttonText="メール送信"
          />
        </div>

        <div
          style={{
            borderTop: `1px solid ${COLORS.border}`,
            paddingTop: "1rem",
          }}
        >
          <p
            style={{
              margin: 0,
              color: COLORS.mutedText,
              fontSize: "0.58rem",
              lineHeight: 1.8,
              letterSpacing: "0.02em",
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
          margin: "0 0 0.45rem",
          color: COLORS.text,
          fontSize: "0.66rem",
          lineHeight: 1.45,
          letterSpacing: "0.02em",
          minHeight: "2.1em",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          wordBreak: "keep-all",
          overflowWrap: "anywhere",
        }}
      >
        {title}
      </p>

      <p
        style={{
          margin: "0 0 0.7rem",
          color: COLORS.softText,
          fontSize: "0.48rem",
          lineHeight: 1.55,
          minHeight: "4.8em",
          display: "-webkit-box",
          WebkitLineClamp: 4,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          overflowWrap: "anywhere",
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

const mobileNavLinkStyle = {
  textDecoration: "none",
  color: "rgba(255,255,255,0.62)",
  fontSize: "0.58rem",
  letterSpacing: "0.06em",
  whiteSpace: "nowrap",
};

const headerButtonStyle = {
  background: "none",
  border: "none",
  color: "rgba(255,255,255,0.52)",
  fontSize: "0.58rem",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  cursor: "pointer",
  fontFamily: baseFontFamily,
  padding: 0,
  whiteSpace: "nowrap",
};

const cardStyle = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  textDecoration: "none",
  backgroundColor: COLORS.panel,
  border: `1px solid ${COLORS.border}`,
  padding: "0.7rem 0.5rem",
  minHeight: "150px",
  aspectRatio: "0.92 / 1",
  boxSizing: "border-box",
};

const cardButtonStyle = {
  display: "inline-block",
  border: `1px solid ${COLORS.borderStrong}`,
  color: COLORS.text,
  padding: "0.38rem 0.42rem",
  fontSize: "0.42rem",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  textAlign: "center",
  lineHeight: 1.2,
};