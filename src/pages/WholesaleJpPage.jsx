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
          {user ? (
            <>
              <Link to="/wholesale-jp/dashboard" style={{
                fontSize: "0.68rem",
                color: "#888",
                textDecoration: "none",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}>
                Dashboard
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
              }}>
                Logout
              </button>
            </>
          ) : (
            <Link to="/wholesale-jp/login" style={{
              fontSize: "0.68rem",
              color: "#e8e2d9",
              textDecoration: "none",
              border: "1px solid #555",
              padding: "0.4rem 1.2rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}>
              Login
            </Link>
          )}
        </div>
      </div>

      {/* メイン */}
      <div style={{ maxWidth: "1300px", margin: "0 auto", padding: "5rem 3rem 7rem" }}>

        {/* タイトルブロック */}
        <div style={{ marginBottom: "4rem" }}>
          <p style={{
            fontSize: "0.65rem",
            letterSpacing: "0.26em",
            textTransform: "uppercase",
            color: "#666",
            margin: "0 0 1rem",
          }}>
            Wholesale — Japan
          </p>
          <h1 style={{
            fontSize: "2.2rem",
            fontWeight: 400,
            letterSpacing: "0.06em",
            color: "#e8e2d9",
            margin: "0 0 1.2rem",
            lineHeight: 1.3,
          }}>
            卸販売｜国内
          </h1>
          <p style={{
            fontSize: "0.78rem",
            color: "#777",
            lineHeight: 2.1,
            letterSpacing: "0.04em",
            margin: 0,
          }}>
            Ryuge Coffeeの卸販売ページです。ご購入には承認済みアカウントが必要です。<br />
            お取引のご希望は{" "}
            <a href="mailto:ryugecoffee@gmail.com" style={{ color: "#999", textDecoration: "underline" }}>
              ryugecoffee@gmail.com
            </a>
            {" "}までご連絡ください。
          </p>

          {!user && (
            <div style={{
              marginTop: "2rem",
              padding: "1rem 1.4rem",
              borderLeft: "2px solid #444",
              backgroundColor: "#333",
              fontSize: "0.75rem",
              color: "#888",
              letterSpacing: "0.04em",
              lineHeight: 1.8,
            }}>
              卸価格を確認するには{" "}
              <Link to="/wholesale-jp/login" style={{ color: "#e8e2d9", textDecoration: "underline" }}>
                ログイン
              </Link>
              {" "}が必要です。
            </div>
          )}

          {user && !approved && (
            <div style={{
              marginTop: "2rem",
              padding: "1rem 1.4rem",
              borderLeft: "2px solid #444",
              backgroundColor: "#333",
              fontSize: "0.75rem",
              color: "#888",
              letterSpacing: "0.04em",
              lineHeight: 1.8,
            }}>
              アカウントの承認をお待ちください。承認後に卸価格が表示されます。
            </div>
          )}
        </div>

        {/* 商品グリッド */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: "1.2rem",
          marginBottom: "8rem",
        }}>
          {WHOLESALE_PRODUCTS.map((product) => (
            <WholesaleProductCard key={product.id} product={product} />
          ))}

          {/* オリジナルバッグ：商品一覧内のサービスカード */}
          <OriginalBagCard user={user} approved={approved} />

          <ComingSoonCard />
        </div>

        {/* フッター注記 */}
        <div style={{ borderTop: "1px solid #3a3a3a", paddingTop: "3rem" }}>
          <p style={{
            fontSize: "0.65rem",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "#555",
            marginBottom: "1rem",
          }}>
            Order & Trade
          </p>
          <p style={{
            fontSize: "0.78rem",
            color: "#666",
            lineHeight: 2.2,
            margin: 0,
            letterSpacing: "0.04em",
          }}>
            最低注文数量・納期・お支払い条件については、お問い合わせの上ご確認ください。<br />
            初回ご注文の前に取引承認が必要です。
            <a href="mailto:ryugecoffee@gmail.com" style={{ color: "#888", marginLeft: "0.4em", textDecoration: "underline" }}>
              ryugecoffee@gmail.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

// オリジナルバッグ：サービスカード
function OriginalBagCard({ user, approved }) {
  return (
    <div
      style={{
        border: "1px solid #3a3a3a",
        borderRadius: "2px",
        overflow: "hidden",
        backgroundColor: "#333",
        display: "flex",
        flexDirection: "column",
        transition: "border-color 0.25s ease",
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "#555"}
      onMouseLeave={e => e.currentTarget.style.borderColor = "#3a3a3a"}
    >
      {/* アイキャッチ */}
      <div style={{
        aspectRatio: "1 / 1",
        backgroundColor: "#3a3a3a",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.6rem",
      }}>
        <span style={{ fontSize: "1.6rem", opacity: 0.25, color: "#e8e2d9" }}>✦</span>
        {/* サービスラベル */}
        <span style={{
          fontSize: "0.55rem",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "#666",
          border: "1px solid #444",
          padding: "0.2rem 0.6rem",
        }}>
          For approved partners
        </span>
      </div>

      {/* テキストエリア */}
      <div style={{ padding: "1.2rem 1rem", flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <p style={{
          fontSize: "0.85rem",
          fontWeight: 500,
          margin: 0,
          color: "#e8e2d9",
          letterSpacing: "0.04em",
          lineHeight: 1.5,
        }}>
          オリジナルコーヒーバッグ制作
        </p>

        <p style={{
          fontSize: "0.7rem",
          color: "#777",
          margin: 0,
          lineHeight: 1.9,
          letterSpacing: "0.02em",
        }}>
          貴社ロゴ・デザインを印刷したオリジナルドリップバッグを制作します。
          既存取引先様、または導入をご検討中の法人様向けサービスです。
        </p>

        {/* 状態別CTA */}
        <div style={{
          marginTop: "auto",
          paddingTop: "0.8rem",
          borderTop: "1px solid #3a3a3a",
        }}>
          {approved ? (
            <a
              href="mailto:ryugecoffee@gmail.com?subject=オリジナルコーヒーバッグ制作のご相談"
              style={{
                display: "inline-block",
                fontSize: "0.62rem",
                color: "#e8e2d9",
                border: "1px solid #555",
                padding: "0.4rem 1rem",
                textDecoration: "none",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                transition: "border-color 0.2s",
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "#e8e2d9"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "#555"}
            >
              制作について相談する
            </a>
          ) : !user ? (
            <p style={{
              fontSize: "0.68rem",
              color: "#555",
              margin: 0,
              lineHeight: 1.8,
              letterSpacing: "0.03em",
            }}>
              取引開始後にご案内
            </p>
          ) : (
            <p style={{
              fontSize: "0.68rem",
              color: "#555",
              margin: 0,
              lineHeight: 1.8,
              letterSpacing: "0.03em",
            }}>
              承認済み取引先様向けサービス
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// 近日公開スロット
function ComingSoonCard() {
  return (
    <div style={{
      border: "1px dashed #3a3a3a",
      borderRadius: "2px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "280px",
      opacity: 0.35,
    }}>
      <p style={{
        fontSize: "0.6rem",
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        color: "#666",
        margin: 0,
      }}>
        Coming Soon
      </p>
    </div>
  );
}