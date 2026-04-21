// src/pages/WholesaleJpPage.jsx
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import WholesaleProductCard from "../components/wholesale/WholesaleProductCard";

// 卸商品データ（後から差し替え可能）
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

export default function WholesaleJpPage() {
  const { user, approved, logout } = useAuth();

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#faf9f7",
        fontFamily: "Cormorant Garamond, serif",
      }}
    >
      {/* ヘッダー */}
      <div
        style={{
          borderBottom: "1px solid #e8e2d9",
          backgroundColor: "#fff",
          padding: "1rem 2rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Link to="/" style={{ textDecoration: "none" }}>
          <span
            style={{
              fontSize: "1.1rem",
              letterSpacing: "0.1em",
              color: "#2a2a2a",
            }}
          >
            Ryuge Coffee
          </span>
        </Link>

        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          {user ? (
            <>
              <Link
                to="/wholesale-jp/dashboard"
                style={{ fontSize: "0.78rem", color: "#555", textDecoration: "none" }}
              >
                ダッシュボード
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
            </>
          ) : (
            <Link
              to="/wholesale-jp/login"
              style={{
                fontSize: "0.78rem",
                color: "#2a2a2a",
                textDecoration: "none",
                border: "1px solid #2a2a2a",
                padding: "0.35rem 0.9rem",
                borderRadius: "2px",
                letterSpacing: "0.05em",
              }}
            >
              ログイン
            </Link>
          )}
        </div>
      </div>

      {/* メインコンテンツ */}
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "3rem 2rem" }}>
        {/* ページタイトル */}
        <div style={{ marginBottom: "3rem" }}>
          <h1
            style={{
              fontSize: "1.8rem",
              fontWeight: 500,
              letterSpacing: "0.08em",
              color: "#2a2a2a",
              margin: 0,
            }}
          >
            卸販売｜国内
          </h1>

          <p
            style={{
              fontSize: "0.85rem",
              color: "#888",
              marginTop: "0.6rem",
              lineHeight: 1.8,
            }}
          >
            Ryuge Coffeeの卸販売ページです。ご購入には承認済みアカウントが必要です。
            <br />
            お取引のご希望は{" "}
            <a
              href="mailto:ryugecoffee@gmail.com"
              style={{ color: "#555", textDecoration: "underline" }}
            >
              ryugecoffee@gmail.com
            </a>{" "}
            までご連絡ください。
          </p>

          {/* 未ログイン時のログイン案内 */}
          {!user && (
            <div
              style={{
                marginTop: "1.2rem",
                padding: "0.9rem 1.2rem",
                backgroundColor: "#f5f0ea",
                borderRadius: "3px",
                fontSize: "0.82rem",
                color: "#555",
              }}
            >
              卸価格を確認するには{" "}
              <Link
                to="/wholesale-jp/login"
                style={{ color: "#2a2a2a", fontWeight: 600, textDecoration: "underline" }}
              >
                ログイン
              </Link>{" "}
              が必要です。
            </div>
          )}

          {/* ログイン済み・未承認の案内 */}
          {user && !approved && (
            <div
              style={{
                marginTop: "1.2rem",
                padding: "0.9rem 1.2rem",
                backgroundColor: "#f5f0ea",
                borderRadius: "3px",
                fontSize: "0.82rem",
                color: "#555",
              }}
            >
              アカウントの承認をお待ちください。承認後に卸価格が表示されます。
            </div>
          )}
        </div>

        {/* 商品グリッド */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: "1.5rem",
            marginBottom: "4rem",
          }}
        >
          {WHOLESALE_PRODUCTS.map((product) => (
            <WholesaleProductCard key={product.id} product={product} />
          ))}

          {/* オリジナルコーヒーバッグ制作カード */}
          <OriginalBagCard approved={approved} />
        </div>

        {/* 卸取引について */}
        <div
          style={{
            borderTop: "1px solid #e8e2d9",
            paddingTop: "2.5rem",
          }}
        >
          <h2
            style={{
              fontSize: "1rem",
              fontWeight: 500,
              letterSpacing: "0.06em",
              color: "#2a2a2a",
              marginBottom: "1rem",
            }}
          >
            ご注文・お取引について
          </h2>

          <p style={{ fontSize: "0.83rem", color: "#666", lineHeight: 2, margin: 0 }}>
            最低注文数量・納期・お支払い条件については、お問い合わせの上ご確認ください。
            <br />
            初回ご注文の前に取引承認が必要です。{" "}
            <a
              href="mailto:ryugecoffee@gmail.com"
              style={{ color: "#555", marginLeft: "0.3em", textDecoration: "underline" }}
            >
              ryugecoffee@gmail.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

// オリジナルコーヒーバッグ制作カード
function OriginalBagCard({ approved }) {
  return (
    <div
      style={{
        border: "1px solid #e8e2d9",
        borderRadius: "4px",
        overflow: "hidden",
        backgroundColor: "#fff",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* アイキャッチ */}
      <div
        style={{
          aspectRatio: "1 / 1",
          backgroundColor: "#f5f0ea",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: "2.5rem" }}>☕</span>
      </div>

      <div
        style={{
          padding: "1.2rem 1rem",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "0.4rem",
        }}
      >
        <p
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: "1.05rem",
            fontWeight: 500,
            margin: 0,
            color: "#2a2a2a",
          }}
        >
          オリジナルコーヒーバッグ制作
        </p>

        <p style={{ fontSize: "0.82rem", color: "#888", margin: 0, lineHeight: 1.7 }}>
          貴社ロゴ・デザインを印刷したオリジナルドリップバッグを制作します。
          ギフト・ノベルティ・OEM対応。
        </p>

        {/* 入稿条件 */}
        <div
          style={{
            marginTop: "0.6rem",
            padding: "0.7rem 0.8rem",
            backgroundColor: "#faf9f7",
            borderRadius: "3px",
            fontSize: "0.78rem",
            color: "#666",
            lineHeight: 1.8,
          }}
        >
          <p style={{ margin: "0 0 0.3rem", fontWeight: 600, color: "#444" }}>入稿条件</p>
          <p style={{ margin: 0 }}>
            サイズ：110mm × 110mm（枠なし）
            <br />
            形式：PDF / PNG / JPG
            <br />
            ※ Word・PowerPoint は PDF または画像化の上ご提出ください
          </p>
        </div>

        <div style={{ marginTop: "auto", paddingTop: "0.8rem" }}>
          {approved ? (
            <a
              href="mailto:ryugecoffee@gmail.com?subject=オリジナルコーヒーバッグ制作のご相談"
              style={{
                display: "inline-block",
                fontSize: "0.78rem",
                color: "#2a2a2a",
                border: "1px solid #2a2a2a",
                borderRadius: "2px",
                padding: "0.35rem 0.9rem",
                textDecoration: "none",
                letterSpacing: "0.05em",
              }}
            >
              お問い合わせ
            </a>
          ) : (
            <p style={{ fontSize: "0.82rem", color: "#aaa", margin: 0, fontStyle: "italic" }}>
              ログイン後に詳細を表示
            </p>
          )}
        </div>
      </div>
    </div>
  );
}