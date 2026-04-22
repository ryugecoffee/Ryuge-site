// src/pages/WholesaleJpPage.jsx
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import WholesaleProductCard from "../components/wholesale/WholesaleProductCard";

const WHOLESALE_PRODUCTS = [
  {
    id: "wh-enma-100",
    name: "閻魔",
    subtitle: "Enma / 100g",
    description:
      "龍華珈琲の象徴となる定番。静かな輪郭と余韻を持つ主軸の珈琲。",
    image: "/images/top.enma.jpg",
    wholesalePrice: 980,
    unit: "袋",
  },
  {
    id: "wh-enma-200",
    name: "閻魔",
    subtitle: "Enma / 200g",
    description:
      "卸導入向けの基本仕様。店頭・ギフトの両方で扱いやすい分量です。",
    image: "/images/top.enma.jpg",
    wholesalePrice: 1780,
    unit: "袋",
  },
  {
    id: "wh-woodbox",
    name: "木函",
    subtitle: "Wooden Edition",
    description:
      "木の質感と余白を大切にした上位仕様。贈答・特別販売向け。",
    image: "/images/top.woodbox-3.jpg",
    wholesalePrice: 2400,
    unit: "箱",
  },
  {
    id: "wh-oriori-drip",
    name: "折々",
    subtitle: "Oriori / Drip Bag",
    description:
      "日々の導入に向くドリップバッグ。軽やかに龍華の輪郭を届けます。",
    image: "/images/top.oriori.jpg",
    wholesalePrice: 180,
    unit: "袋",
  },
  {
    id: "wh-oriori-seasonal",
    name: "折々",
    subtitle: "Oriori / Seasonal",
    description:
      "季節ごとに内容が移ろう卸向け提案。時期ごとの売場演出にも対応。",
    image: "/images/top.oriori.jpg",
    wholesalePrice: 1100,
    unit: "袋",
  },
];

const pageStyles = {
  bg: "#050505",
  headerBg: "rgba(5, 5, 5, 0.88)",
  border: "rgba(255,255,255,0.08)",
  softText: "rgba(255,255,255,0.72)",
  mutedText: "rgba(255,255,255,0.42)",
  strongText: "rgba(255,255,255,0.92)",
  cardBg: "#0b0b0b",
  buttonBorder: "rgba(255,255,255,0.18)",
  buttonHover: "rgba(255,255,255,0.85)",
};

export default function WholesaleJpPage() {
  const { user, approved, logout } = useAuth();
  const navigate = useNavigate();
  const [cart, setCart] = useState({});

  const addToCart = (productId) => {
    setCart((prev) => ({ ...prev, [productId]: (prev[productId] || 0) + 1 }));
  };

  const removeFromCart = (productId) => {
    setCart((prev) => {
      const next = { ...prev };
      if (next[productId] > 1) {
        next[productId] -= 1;
      } else {
        delete next[productId];
      }
      return next;
    });
  };

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);

  const cartItems = useMemo(() => {
    return WHOLESALE_PRODUCTS.filter((p) => cart[p.id]).map((p) => ({
      ...p,
      quantity: cart[p.id],
    }));
  }, [cart]);

  const handleGoToOrder = () => {
    navigate("/wholesale-jp/order", { state: { cartItems } });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: pageStyles.bg,
        color: pageStyles.strongText,
        fontFamily:
          '"Cormorant Garamond", "Noto Serif JP", "Hiragino Mincho ProN", serif',
      }}
    >
      {/* Header */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          backgroundColor: pageStyles.headerBg,
          backdropFilter: "blur(8px)",
          borderBottom: `1px solid ${pageStyles.border}`,
        }}
      >
        <div
          style={{
            maxWidth: "1440px",
            margin: "0 auto",
            padding: "1.3rem 3.4rem",
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: "1rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <Link
              to="/"
              style={{
                textDecoration: "none",
                color: pageStyles.strongText,
                fontSize: "0.95rem",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              RYUGE COFFEE
            </Link>
          </div>

          <nav
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "2rem",
              alignItems: "center",
            }}
          >
            <Link
              to="/products"
              style={navLinkStyle}
            >
              商品
            </Link>
            <Link
              to="/wholesale-jp"
              style={navLinkStyle}
            >
              卸
            </Link>
          </nav>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "1.4rem",
              alignItems: "center",
            }}
          >
            {user && (
              <Link
                to="/wholesale-jp/dashboard"
                style={rightLinkStyle}
              >
                Dashboard
              </Link>
            )}

            {approved && cartCount > 0 && (
              <button
                onClick={handleGoToOrder}
                style={{
                  ...ghostButtonStyle,
                  padding: "0.45rem 1.1rem",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.borderColor = pageStyles.buttonHover)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.borderColor = pageStyles.buttonBorder)
                }
              >
                Cart ({cartCount})
              </button>
            )}

            {user ? (
              <button
                onClick={logout}
                style={{
                  background: "none",
                  border: "none",
                  color: pageStyles.mutedText,
                  fontSize: "0.7rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  padding: 0,
                  fontFamily: "inherit",
                }}
              >
                Logout
              </button>
            ) : (
              <Link
                to="/wholesale-jp/login"
                style={rightLinkStyle}
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </header>

      <main>
        <section
          style={{
            maxWidth: "1440px",
            margin: "0 auto",
            padding: "4.5rem 3.4rem 2rem",
          }}
        >
          <p
            style={{
              margin: "0 0 1rem",
              color: pageStyles.mutedText,
              fontSize: "0.72rem",
              letterSpacing: "0.26em",
              textTransform: "uppercase",
            }}
          >
            Wholesale — Japan
          </p>

          <h1
            style={{
              margin: "0 0 2rem",
              color: pageStyles.strongText,
              fontSize: "3rem",
              fontWeight: 400,
              letterSpacing: "0.05em",
              lineHeight: 1.24,
            }}
          >
            卸販売｜国内
          </h1>

          <div
            style={{
              maxWidth: "760px",
            }}
          >
            <p
              style={{
                margin: 0,
                color: pageStyles.softText,
                fontSize: "0.94rem",
                lineHeight: 2.15,
                letterSpacing: "0.04em",
              }}
            >
              Ryuge Coffeeの卸販売ページです。一般販売ページの静けさをそのままに、
              国内向けのお取引導線として整えています。
              <br />
              価格閲覧・発注には承認済みアカウントが必要です。お取引のご希望は{" "}
              <a
                href="mailto:ryugecoffee@gmail.com"
                style={{
                  color: pageStyles.softText,
                  textDecoration: "underline",
                  textUnderlineOffset: "3px",
                }}
              >
                ryugecoffee@gmail.com
              </a>{" "}
              までご連絡ください。
            </p>
          </div>

          {!user && (
            <div style={noticeStyle}>
              卸価格の表示と発注には
              <Link
                to="/wholesale-jp/login"
                style={{
                  color: pageStyles.strongText,
                  margin: "0 0.35em",
                  textDecoration: "underline",
                  textUnderlineOffset: "3px",
                }}
              >
                ログイン
              </Link>
              が必要です。
            </div>
          )}

          {user && !approved && (
            <div style={noticeStyle}>
              アカウント承認待ちです。承認後に卸価格表示と発注が可能になります。
            </div>
          )}
        </section>

        <section
          style={{
            maxWidth: "1440px",
            margin: "0 auto",
            padding: "1.5rem 3.4rem 7rem",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
              gap: "1.35rem",
              alignItems: "stretch",
            }}
          >
            {WHOLESALE_PRODUCTS.map((product) => (
              <WholesaleProductCard
                key={product.id}
                product={product}
                quantity={cart[product.id] || 0}
                onAdd={() => addToCart(product.id)}
                onRemove={() => removeFromCart(product.id)}
                cardBg={pageStyles.cardBg}
                borderColor={pageStyles.border}
                mutedText={pageStyles.mutedText}
                softText={pageStyles.softText}
                strongText={pageStyles.strongText}
                approved={approved}
              />
            ))}

            <OriginalBagCard user={user} approved={approved} />
          </div>
        </section>

        <section
          style={{
            maxWidth: "1440px",
            margin: "0 auto",
            padding: "0 3.4rem 5rem",
          }}
        >
          <div
            style={{
              borderTop: `1px solid ${pageStyles.border}`,
              paddingTop: "2.4rem",
            }}
          >
            <p
              style={{
                margin: "0 0 0.9rem",
                color: pageStyles.mutedText,
                fontSize: "0.68rem",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
              }}
            >
              Order & Trade
            </p>

            <p
              style={{
                margin: 0,
                color: pageStyles.softText,
                fontSize: "0.85rem",
                lineHeight: 2.1,
                letterSpacing: "0.04em",
              }}
            >
              最低注文数量・納期・お支払い条件は個別にご案内いたします。
              卸のお取引は基本的に後払い請求ベースを想定しています。
            </p>
          </div>
        </section>
      </main>

      {approved && cartCount > 0 && (
        <div
          style={{
            position: "fixed",
            right: "2.4rem",
            bottom: "2.4rem",
            zIndex: 120,
          }}
        >
          <button
            onClick={handleGoToOrder}
            style={{
              backgroundColor: "rgba(255,255,255,0.92)",
              color: "#050505",
              border: "none",
              padding: "1rem 1.8rem",
              fontSize: "0.72rem",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              cursor: "pointer",
              fontFamily: "inherit",
              boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
            }}
          >
            発注フォームへ（{cartCount}点）
          </button>
        </div>
      )}
    </div>
  );
}

function OriginalBagCard({ user, approved }) {
  return (
    <div
      style={{
        backgroundColor: "#0b0b0b",
        border: "1px solid rgba(255,255,255,0.08)",
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          aspectRatio: "1 / 1",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.04))",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.9rem",
        }}
      >
        <span style={{ fontSize: "2rem", color: "rgba(255,255,255,0.35)" }}>✦</span>
        <span
          style={{
            border: "1px solid rgba(255,255,255,0.08)",
            padding: "0.25rem 0.75rem",
            color: "rgba(255,255,255,0.35)",
            fontSize: "0.56rem",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          For approved partners
        </span>
      </div>

      <div
        style={{
          padding: "1.2rem 1rem 1rem",
          display: "flex",
          flexDirection: "column",
          flex: 1,
        }}
      >
        <p
          style={{
            margin: "0 0 0.45rem",
            color: "rgba(255,255,255,0.92)",
            fontSize: "1rem",
            lineHeight: 1.5,
            letterSpacing: "0.03em",
          }}
        >
          オリジナルコーヒーバッグ制作
        </p>

        <p
          style={{
            margin: "0 0 1.2rem",
            color: "rgba(255,255,255,0.44)",
            fontSize: "0.74rem",
            lineHeight: 1.95,
          }}
        >
          貴社ロゴ・デザインを反映したオリジナル仕様の制作相談ページです。
          卸導入後の展開や別注対応について、個別にご案内いたします。
        </p>

        <div
          style={{
            marginTop: "auto",
            paddingTop: "1rem",
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {approved ? (
            <a
              href="mailto:ryugecoffee@gmail.com?subject=オリジナルコーヒーバッグ制作のご相談"
              style={{
                display: "inline-block",
                color: "rgba(255,255,255,0.9)",
                border: "1px solid rgba(255,255,255,0.16)",
                textDecoration: "none",
                padding: "0.65rem 1rem",
                fontSize: "0.64rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              制作について相談する
            </a>
          ) : !user ? (
            <p
              style={{
                margin: 0,
                color: "rgba(255,255,255,0.34)",
                fontSize: "0.68rem",
                lineHeight: 1.8,
              }}
            >
              取引開始後にご案内
            </p>
          ) : (
            <p
              style={{
                margin: 0,
                color: "rgba(255,255,255,0.34)",
                fontSize: "0.68rem",
                lineHeight: 1.8,
              }}
            >
              承認済み取引先様向けサービス
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const navLinkStyle = {
  textDecoration: "none",
  color: "rgba(255,255,255,0.68)",
  fontSize: "0.82rem",
  letterSpacing: "0.08em",
};

const rightLinkStyle = {
  textDecoration: "none",
  color: "rgba(255,255,255,0.42)",
  fontSize: "0.7rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const ghostButtonStyle = {
  background: "none",
  border: "1px solid rgba(255,255,255,0.18)",
  color: "rgba(255,255,255,0.88)",
  cursor: "pointer",
  fontSize: "0.68rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  fontFamily: '"Cormorant Garamond", "Noto Serif JP", serif',
};

const noticeStyle = {
  marginTop: "1.6rem",
  padding: "1rem 1.2rem",
  borderLeft: "1px solid rgba(255,255,255,0.14)",
  backgroundColor: "rgba(255,255,255,0.03)",
  color: "rgba(255,255,255,0.55)",
  fontSize: "0.76rem",
  lineHeight: 1.95,
  letterSpacing: "0.04em",
};