// src/pages/WholesaleJpPage.jsx
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import WholesaleProductCard from "../components/wholesale/WholesaleProductCard";

const WHOLESALE_PRODUCTS = [
  {
    id: "wh-001",
    name: "ドリップバッグ｜龍華ブレンド",
    description: "鎌倉の静けさをイメージした、穏やかな酸味と甘みのブレンド。",
    image: "/images/product-drip.jpg",
    wholesalePrice: 180,
    unit: "袋",
  },
  {
    id: "wh-002",
    name: "ドリップバッグ｜シングルオリジン",
    description: "季節ごとに産地が変わるシングルオリジン。",
    image: "/images/product-single.jpg",
    wholesalePrice: 210,
    unit: "袋",
  },
  {
    id: "wh-003",
    name: "コーヒー豆｜龍華ブレンド 200g",
    description: "焙煎後すぐに出荷。鮮度を保ったままお届けします。",
    image: "/images/product-beans.jpg",
    wholesalePrice: 1200,
    unit: "袋",
  },
];

const styles = {
  page: {
    minHeight: "100vh",
    backgroundColor: "#f7f5f2",
    fontFamily: "Cormorant Garamond, serif",
    color: "#2a2a2a",
  },
  header: {
    borderBottom: "1px solid #ddd8d0",
    backgroundColor: "#f7f5f2",
    padding: "1.2rem 3rem",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    position: "sticky",
    top: 0,
    zIndex: 100,
  },
  logo: {
    textDecoration: "none",
    fontSize: "0.95rem",
    letterSpacing: "0.18em",
    color: "#2a2a2a",
    textTransform: "uppercase",
  },
  navLink: {
    fontSize: "0.72rem",
    color: "#888",
    textDecoration: "none",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    transition: "color 0.2s",
  },
  loginBtn: {
    fontSize: "0.72rem",
    color: "#2a2a2a",
    textDecoration: "none",
    border: "1px solid #2a2a2a",
    padding: "0.4rem 1.1rem",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    transition: "background 0.2s, color 0.2s",
  },
  container: {
    maxWidth: "1080px",
    margin: "0 auto",
    padding: "5rem 3rem 6rem",
  },
  eyebrow: {
    fontSize: "0.68rem",
    letterSpacing: "0.22em",
    textTransform: "uppercase",
    color: "#aaa",
    marginBottom: "1rem",
  },
  heading: {
    fontSize: "2rem",
    fontWeight: 400,
    letterSpacing: "0.06em",
    color: "#2a2a2a",
    margin: 0,
    lineHeight: 1.3,
  },
  subtext: {
    fontSize: "0.82rem",
    color: "#888",
    marginTop: "1rem",
    lineHeight: 2,
    letterSpacing: "0.04em",
  },
  notice: {
    marginTop: "1.8rem",
    padding: "1rem 1.4rem",
    backgroundColor: "#f0ece6",
    fontSize: "0.78rem",
    color: "#666",
    letterSpacing: "0.04em",
    lineHeight: 1.8,
    borderLeft: "2px solid #c8bfb4",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "1.8rem",
    marginTop: "4rem",
    marginBottom: "5rem",
  },
  divider: {
    borderTop: "1px solid #ddd8d0",
    paddingTop: "3rem",
  },
  sectionTitle: {
    fontSize: "0.72rem",
    letterSpacing: "0.2em",
    textTransform: "uppercase",
    color: "#aaa",
    marginBottom: "1rem",
  },
  bodyText: {
    fontSize: "0.8rem",
    color: "#888",
    lineHeight: 2.1,
    margin: 0,
    letterSpacing: "0.04em",
  },
};

export default function WholesaleJpPage() {
  const { user, approved, logout } = useAuth();

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <Link to="/" style={styles.logo}>
          Ryuge Coffee
        </Link>

        <div style={{ display: "flex", gap: "2rem", alignItems: "center" }}>
          {user ? (
            <>
              <Link to="/wholesale-jp/dashboard" style={styles.navLink}>
                Dashboard
              </Link>
              <button
                onClick={logout}
                style={{
                  ...styles.navLink,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Logout
              </button>
            </>
          ) : (
            <Link to="/wholesale-jp/login" style={styles.loginBtn}>
              Login
            </Link>
          )}
        </div>
      </div>

      <div style={styles.container}>
        <div style={{ marginBottom: "0" }}>
          <p style={styles.eyebrow}>Wholesale — Japan</p>
          <h1 style={styles.heading}>卸販売｜国内</h1>

          <p style={styles.subtext}>
            Ryuge Coffeeの卸販売ページです。ご購入には承認済みアカウントが必要です。
            <br />
            お取引のご希望は{" "}
            <a
              href="mailto:ryugecoffee@gmail.com"
              style={{ color: "#888", textDecoration: "underline" }}
            >
              ryugecoffee@gmail.com
            </a>{" "}
            までご連絡ください。
          </p>

          {!user && (
            <div style={styles.notice}>
              卸価格を確認するには{" "}
              <Link
                to="/wholesale-jp/login"
                style={{
                  color: "#2a2a2a",
                  textDecoration: "underline",
                  letterSpacing: "0.04em",
                }}
              >
                ログイン
              </Link>{" "}
              が必要です。
            </div>
          )}

          {user && !approved && (
            <div style={styles.notice}>
              アカウントの承認をお待ちください。承認後に卸価格が表示されます。
            </div>
          )}
        </div>

        <div style={styles.grid}>
          {WHOLESALE_PRODUCTS.map((product) => (
            <WholesaleProductCard key={product.id} product={product} />
          ))}
          <OriginalBagCard approved={approved} />
        </div>

        <div style={styles.divider}>
          <p style={styles.sectionTitle}>Order & Trade</p>
          <p style={styles.bodyText}>
            最低注文数量・納期・お支払い条件については、お問い合わせの上ご確認ください。
            <br />
            初回ご注文の前に取引承認が必要です。
            <a
              href="mailto:ryugecoffee@gmail.com"
              style={{
                color: "#888",
                marginLeft: "0.4em",
                textDecoration: "underline",
              }}
            >
              ryugecoffee@gmail.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function OriginalBagCard({ approved }) {
  return (
    <div
      style={{
        border: "1px solid #ddd8d0",
        borderRadius: "3px",
        overflow: "hidden",
        backgroundColor: "#fff",
        display: "flex",
        flexDirection: "column",
        transition: "box-shadow 0.25s ease, transform 0.25s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 6px 24px rgba(0,0,0,0.06)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div
        style={{
          aspectRatio: "1 / 1",
          backgroundColor: "#f0ece6",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: "2rem", opacity: 0.4 }}>✦</span>
      </div>

      <div
        style={{
          padding: "1.6rem 1.4rem",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        <p
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: "1rem",
            fontWeight: 500,
            margin: 0,
            letterSpacing: "0.04em",
          }}
        >
          オリジナルコーヒーバッグ制作
        </p>

        <p
          style={{
            fontSize: "0.78rem",
            color: "#999",
            margin: 0,
            lineHeight: 1.9,
            letterSpacing: "0.03em",
          }}
        >
          貴社ロゴ・デザインを印刷したオリジナルドリップバッグを制作します。ギフト・ノベルティ・OEM対応。
        </p>

        <div
          style={{
            marginTop: "0.8rem",
            padding: "0.8rem 1rem",
            backgroundColor: "#f7f5f2",
            fontSize: "0.72rem",
            color: "#888",
            lineHeight: 2,
            letterSpacing: "0.04em",
            borderLeft: "1px solid #ddd8d0",
          }}
        >
          <p
            style={{
              margin: "0 0 0.2rem",
              color: "#666",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              fontSize: "0.65rem",
            }}
          >
            入稿条件
          </p>
          サイズ：110mm × 110mm（枠なし）
          <br />
          形式：PDF / PNG / JPG
          <br />
          ※ Word・PowerPoint は PDF または画像化の上ご提出ください
        </div>

        <div style={{ marginTop: "auto", paddingTop: "1.2rem" }}>
          {approved ? (
            <a
              href="mailto:ryugecoffee@gmail.com?subject=オリジナルコーヒーバッグ制作のご相談"
              style={{
                display: "inline-block",
                fontSize: "0.68rem",
                color: "#2a2a2a",
                border: "1px solid #2a2a2a",
                padding: "0.45rem 1.2rem",
                textDecoration: "none",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                transition: "background 0.2s, color 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#2a2a2a";
                e.currentTarget.style.color = "#fff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "#2a2a2a";
              }}
            >
              Contact
            </a>
          ) : (
            <p
              style={{
                fontSize: "0.75rem",
                color: "#bbb",
                margin: 0,
                fontStyle: "italic",
                letterSpacing: "0.04em",
              }}
            >
              ログイン後に詳細を表示
            </p>
          )}
        </div>
      </div>
    </div>
  );
}