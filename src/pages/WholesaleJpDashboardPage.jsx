// src/pages/WholesaleJpDashboardPage.jsx
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
    <div style={{
      minHeight: "100vh",
      backgroundColor: "#faf9f7",
      fontFamily: "Cormorant Garamond, serif",
    }}>

      {/* ヘッダー */}
      <div style={{
        borderBottom: "1px solid #e8e2d9",
        backgroundColor: "#fff",
        padding: "1rem 2rem",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <Link to="/" style={{ textDecoration: "none" }}>
          <span style={{ fontSize: "1.1rem", letterSpacing: "0.1em", color: "#2a2a2a" }}>
            Ryuge Coffee
          </span>
        </Link>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <Link
            to="/wholesale-jp"
            style={{ fontSize: "0.78rem", color: "#555", textDecoration: "none" }}
          >
            卸ページへ
          </Link>
          <button
            onClick={logout}
            style={{
              fontSize: "0.78rem",
              color: "#888",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            ログアウト
          </button>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "3rem 2rem" }}>

        {/* あいさつ */}
        <div style={{ marginBottom: "2.5rem" }}>
          <h1 style={{
            fontSize: "1.5rem",
            fontWeight: 500,
            letterSpacing: "0.06em",
            color: "#2a2a2a",
            margin: 0,
          }}>
            ダッシュボード
          </h1>
          <p style={{ fontSize: "0.83rem", color: "#888", marginTop: "0.5rem" }}>
            {user?.email}
          </p>
        </div>

        {/* カードグリッド */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: "1.2rem",
        }}>

          {/* 卸商品一覧へ */}
          <DashboardCard
            title="卸商品一覧"
            description="国内卸価格・商品ラインナップを確認できます。"
            linkTo="/wholesale-jp"
            linkLabel="商品を見る"
          />

          {/* オリジナルバッグ相談 */}
          <DashboardCard
            title="オリジナルバッグ制作"
            description="貴社ロゴ入りのドリップバッグ制作のご相談はこちら。"
            linkHref="mailto:ryugecoffee@gmail.com?subject=オリジナルコーヒーバッグ制作のご相談"
            linkLabel="メールで相談"
          />

          {/* お問い合わせ */}
          <DashboardCard
            title="お問い合わせ"
            description="ご注文・納期・お支払いについてはメールにてご連絡ください。"
            linkHref="mailto:ryugecoffee@gmail.com"
            linkLabel="メールを送る"
          />
        </div>

        {/* 注意書き */}
        <div style={{
          marginTop: "3rem",
          borderTop: "1px solid #e8e2d9",
          paddingTop: "1.5rem",
          fontSize: "0.78rem",
          color: "#aaa",
          lineHeight: 1.9,
        }}>
          <p style={{ margin: 0 }}>
            このページは承認済みの卸取引先様専用です。<br />
            内容の転用・共有はご遠慮ください。
          </p>
        </div>
      </div>
    </div>
  );
}

function DashboardCard({ title, description, linkTo, linkHref, linkLabel }) {
  return (
    <div style={{
      backgroundColor: "#fff",
      border: "1px solid #e8e2d9",
      borderRadius: "4px",
      padding: "1.5rem",
      display: "flex",
      flexDirection: "column",
      gap: "0.6rem",
    }}>
      <p style={{
        fontSize: "1rem",
        fontWeight: 500,
        color: "#2a2a2a",
        margin: 0,
        letterSpacing: "0.04em",
      }}>
        {title}
      </p>
      <p style={{ fontSize: "0.8rem", color: "#888", margin: 0, lineHeight: 1.7 }}>
        {description}
      </p>
      <div style={{ marginTop: "auto", paddingTop: "0.8rem" }}>
        {linkTo ? (
          <Link
            to={linkTo}
            style={{
              fontSize: "0.78rem",
              color: "#2a2a2a",
              border: "1px solid #2a2a2a",
              borderRadius: "2px",
              padding: "0.35rem 0.9rem",
              textDecoration: "none",
              letterSpacing: "0.05em",
            }}
          >
            {linkLabel}
          </Link>
        ) : (
          
            href={linkHref}
            style={{
              fontSize: "0.78rem",
              color: "#2a2a2a",
              border: "1px solid #2a2a2a",
              borderRadius: "2px",
              padding: "0.35rem 0.9rem",
              textDecoration: "none",
              letterSpacing: "0.05em",
            }}
          >
            {linkLabel}
          </a>
        )}
      </div>
    </div>
  );
}