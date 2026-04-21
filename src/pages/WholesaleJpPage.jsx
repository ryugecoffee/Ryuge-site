// src/pages/WholesaleJpPage.jsx
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import WholesaleProductCard from "../components/wholesale/WholesaleProductCard";
import { PRODUCT_DATA } from "../productData";

// 🔥 商品データをメインサイトと完全同期
const WHOLESALE_PRODUCTS = [
  ...PRODUCT_DATA.enma.map((item) => ({
    id: item.id,
    name: item.title.ja,
    description: item.summary.ja,
    image: item.image,
    wholesalePrice: Math.round(item.priceNumber * 0.7), // 7掛け
    unit: "袋",
  })),
  ...PRODUCT_DATA.woodbox.map((item) => ({
    id: item.id,
    name: item.title.ja,
    description: item.summary.ja,
    image: item.image,
    wholesalePrice: Math.round(item.priceNumber * 0.75), // 木箱だけ7.5掛け
    unit: "箱",
  })),
];

export default function WholesaleJpPage() {
  const { user, approved, logout } = useAuth();

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
        padding: "1.2rem 3rem",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <Link to="/" style={{
          textDecoration: "none",
          fontSize: "0.9rem",
          letterSpacing: "0.2em",
          color: "#e8e2d9",
        }}>
          Ryuge Coffee
        </Link>

        {user ? (
          <button onClick={logout} style={{
            background: "none",
            border: "none",
            color: "#888",
            cursor: "pointer",
          }}>
            Logout
          </button>
        ) : (
          <Link to="/wholesale-jp/login" style={{
            border: "1px solid #555",
            padding: "0.4rem 1rem",
            color: "#e8e2d9",
            textDecoration: "none",
          }}>
            Login
          </Link>
        )}
      </div>

      {/* メイン */}
      <div style={{ maxWidth: "1300px", margin: "0 auto", padding: "4rem 2rem" }}>

        {/* タイトル */}
        <h1 style={{ fontWeight: 400, marginBottom: "1rem" }}>
          卸販売｜国内
        </h1>

        {!user && (
          <p style={{ color: "#777" }}>
            ログイン後に卸価格が表示されます
          </p>
        )}

        {user && !approved && (
          <p style={{ color: "#777" }}>
            承認後に卸価格が表示されます
          </p>
        )}

        {/* 商品 */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: "1.5rem",
          marginTop: "3rem",
        }}>
          {WHOLESALE_PRODUCTS.map((product) => (
            <WholesaleProductCard key={product.id} product={product} />
          ))}

          <OriginalBagCard user={user} approved={approved} />
          <ComingSoonCard />
        </div>
      </div>
    </div>
  );
}

// オリジナルバッグ
function OriginalBagCard({ user, approved }) {
  return (
    <div style={{
      border: "1px solid #3a3a3a",
      background: "#333",
      padding: "1.5rem",
    }}>
      <p>オリジナルバッグ制作</p>

      {approved ? (
        <a href="mailto:ryugecoffee@gmail.com">
          相談する
        </a>
      ) : (
        <p style={{ color: "#777" }}>
          取引開始後にご案内
        </p>
      )}
    </div>
  );
}

// Coming Soon
function ComingSoonCard() {
  return (
    <div style={{
      border: "1px dashed #444",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      Coming Soon
    </div>
  );
}