import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import WholesaleProductCard from "../components/wholesale/WholesaleProductCard";
import { PRODUCT_DATA, PRODUCT_SECTIONS } from "../productData";

const WHOLESALE_PRODUCTS = [
  {
    id: "wh-simple-600",
    detailType: "productData",
    detailId: "enma-ethiopia-dark",
    name: "無印",
    subtitle: "Simple Package",
    description: "シンプルなパッケージ仕様。",
    image: "/images/simple.jpg",
    wholesalePrice: 600,
    unit: "100g",
    summary: "シンプルなパッケージ仕様。",
    weight: "100g",
  },
  {
    id: "wh-simple-700",
    detailType: "productData",
    detailId: "enma-burundi-light",
    name: "無印",
    subtitle: "Simple Package",
    description: "シンプルなパッケージ仕様。",
    image: "/images/simple.jpg",
    wholesalePrice: 700,
    unit: "100g",
    summary: "シンプルなパッケージ仕様。",
    weight: "100g",
  },
  {
    id: "wh-simple-750",
    detailType: "productData",
    detailId: "enma-ethiopia-light",
    name: "無印",
    subtitle: "Simple Package",
    description: "シンプルなパッケージ仕様。",
    image: "/images/simple.jpg",
    wholesalePrice: 750,
    unit: "100g",
    summary: "シンプルなパッケージ仕様。",
    weight: "100g",
  },
  {
    id: "wh-enma-1700",
    detailType: "productData",
    detailId: "enma-ethiopia-dark",
    name: "閻魔",
    subtitle: "Enma",
    description: "静かに残る苦味と余韻",
    image: "/images/enma.jpg",
    wholesalePrice: 1190,
    unit: "180g",
  },
  {
    id: "wh-enma-1980",
    detailType: "productData",
    detailId: "enma-burundi-light",
    name: "閻魔",
    subtitle: "Enma",
    description: "明るさと透明感、やわらかな甘さ",
    image: "/images/enma.jpg",
    wholesalePrice: 1380,
    unit: "180g",
  },
  {
    id: "wh-enma-2100",
    detailType: "productData",
    detailId: "enma-ethiopia-light",
    name: "閻魔",
    subtitle: "Enma",
    description: "明るさと輪郭のある浅煎り",
    image: "/images/enma.jpg",
    wholesalePrice: 1470,
    unit: "180g",
  },
  {
    id: "wh-woodbox",
    detailType: "productData",
    detailId: "woodbox-geisha",
    name: "木函",
    subtitle: "Wooden Edition",
    description: "木箱で届く贈り物のような静かなプレミアム",
    image: "/images/woodbox.jpg",
    wholesalePrice: 1950,
    unit: "100g",
  },
];

const pageStyles = {
  bg: "#050505",
  headerBg: "rgba(5, 5, 5, 0.88)",
  border: "rgba(255,255,255,0.08)",
  softText: "rgba(255,255,255,0.72)",
  mutedText: "rgba(255,255,255,0.42)",
  strongText: "rgba(255,255,255,0.92)",
  buttonBorder: "rgba(255,255,255,0.18)",
  buttonHover: "rgba(255,255,255,0.85)",
};

const COUNTRY_KATAKANA_MAP = {
  Ethiopia: "エチオピア",
  Burundi: "ブルンジ",
  Honduras: "ホンジュラス",
};

const VARIETY_KATAKANA_MAP = {
  Bourbon: "ブルボン",
  Geisha: "ゲイシャ",
  Gesha: "ゲイシャ",
};

const baseFontFamily =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';

export default function WholesaleJpPage() {
  const { user, approved, logout } = useAuth();
  const navigate = useNavigate();
  const [cart, setCart] = useState({});
  const [activeItemId, setActiveItemId] = useState(null);
  const [viewportWidth, setViewportWidth] = useState(() => {
    if (typeof window === "undefined") return 1440;
    return window.innerWidth;
  });

  const isMobile = viewportWidth <= 768;
  const isTablet = viewportWidth > 768 && viewportWidth <= 1100;

  const contentPaddingX = isMobile ? "0.75rem" : isTablet ? "1.6rem" : "3.4rem";
  const heroTopPadding = isMobile ? "1.5rem" : "4.5rem";
  const productGridColumns = isMobile
    ? "repeat(5, minmax(0, 1fr))"
    : isTablet
      ? "repeat(4, minmax(0, 1fr))"
      : "repeat(5, minmax(0, 1fr))";

  const lang = "ja";
  const labels = PRODUCT_SECTIONS.ja.specLabels;
  const allDetailedProducts = [...PRODUCT_DATA.enma, ...PRODUCT_DATA.woodbox];

  const activeWholesaleProduct =
    WHOLESALE_PRODUCTS.find((item) => item.id === activeItemId) || null;

  const activeDetailedItem =
    activeWholesaleProduct?.detailType === "productData"
      ? allDetailedProducts.find(
          (item) => item.id === activeWholesaleProduct.detailId
        ) || null
      : null;

  const isSimpleWholesale = activeWholesaleProduct?.id?.startsWith("wh-simple-");

  const displayWeight = activeWholesaleProduct
    ? activeWholesaleProduct.weight || activeWholesaleProduct.unit
    : "";

  const displayPrice = activeWholesaleProduct
    ? `¥${activeWholesaleProduct.wholesalePrice?.toLocaleString()}`
    : "";

  const getCountryOnly = (origin = "") => {
    if (!origin) return "";
    const parts = origin.split(",");
    return parts[parts.length - 1]?.trim() || origin;
  };

  const toKatakanaCountry = (origin = "") => {
    const country = getCountryOnly(origin);
    return COUNTRY_KATAKANA_MAP[country] || country;
  };

  const toKatakanaVariety = (variety = "") => {
    return VARIETY_KATAKANA_MAP[variety] || variety;
  };

  const getDetailItemByProduct = (product) => {
    if (!product || product.detailType !== "productData") return null;
    return (
      allDetailedProducts.find((item) => item.id === product.detailId) || null
    );
  };

  const getLoggedInDisplayTitleByProduct = (product) => {
    const detailItem = getDetailItemByProduct(product);

    if (!detailItem) return product?.name || "";

    if (detailItem.id === "enma-ethiopia-dark") {
      return "深煎りの禅";
    }

    const country = toKatakanaCountry(detailItem.origin);
    const variety = toKatakanaVariety(detailItem.variety);

    if (country && variety) return `${country} ${variety}`;
    return country || variety || product?.name || "";
  };

  const getLoggedInDisplaySubtitleByProduct = (product) => {
    const detailItem = getDetailItemByProduct(product);
    if (!detailItem) return product?.subtitle || "";
    if (detailItem.id === "enma-ethiopia-dark") return "";
    return "";
  };

  const modalTitle = !user
    ? isSimpleWholesale
      ? activeWholesaleProduct?.name
      : activeDetailedItem?.modalTitle?.[lang] ||
        activeDetailedItem?.title?.[lang] ||
        activeWholesaleProduct?.name
    : getLoggedInDisplayTitleByProduct(activeWholesaleProduct);

  const modalSummary = isSimpleWholesale
    ? activeWholesaleProduct?.summary || activeWholesaleProduct?.description
    : activeDetailedItem?.summary?.[lang] ||
      activeWholesaleProduct?.description;

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

  const renderSpecRow = (label, value) => {
    if (!value) return null;
    return (
      <div className="product-spec-row" key={label}>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    );
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") setActiveItemId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    document.body.style.overflow = activeItemId ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [activeItemId]);

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: pageStyles.bg,
        color: pageStyles.strongText,
        fontFamily: baseFontFamily,
      }}
    >
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
            padding: isMobile ? "0.75rem" : "1.3rem 3.4rem",
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr auto" : "1fr auto 1fr",
            alignItems: "center",
            gap: isMobile ? "0.6rem" : "1rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "flex-start", minWidth: 0 }}>
            <Link
              to="/"
              style={{
                textDecoration: "none",
                color: pageStyles.strongText,
                fontSize: isMobile ? "0.72rem" : "0.95rem",
                letterSpacing: isMobile ? "0.14em" : "0.18em",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}
            >
              RYUGE COFFEE
            </Link>
          </div>

          {!isMobile && (
            <nav
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "2rem",
                alignItems: "center",
              }}
            >
              <Link to="/products" style={navLinkStyle}>商品</Link>
              <Link to="/wholesale-jp" style={navLinkStyle}>卸</Link>
            </nav>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: isMobile ? "0.6rem" : "1.4rem",
              alignItems: "center",
              minWidth: 0,
            }}
          >
            {!isMobile && user && (
              <Link to="/wholesale-jp/dashboard" style={rightLinkStyle}>
                Dashboard
              </Link>
            )}

            {approved && cartCount > 0 && (
              <button
                onClick={handleGoToOrder}
                style={{
                  ...ghostButtonStyle,
                  padding: isMobile ? "0.3rem 0.5rem" : "0.45rem 1.1rem",
                  fontSize: isMobile ? "0.52rem" : "0.68rem",
                }}
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
                  fontSize: isMobile ? "0.55rem" : "0.7rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  padding: 0,
                  fontFamily: baseFontFamily,
                  whiteSpace: "nowrap",
                }}
              >
                Logout
              </button>
            ) : (
              <Link
                to="/wholesale-jp/login"
                style={{
                  ...rightLinkStyle,
                  fontSize: isMobile ? "0.55rem" : rightLinkStyle.fontSize,
                }}
              >
                Login
              </Link>
            )}
          </div>
        </div>

        {isMobile && (
          <div
            style={{
              padding: "0 0.75rem 0.7rem",
              display: "flex",
              gap: "0.9rem",
              borderTop: `1px solid ${pageStyles.border}`,
            }}
          >
            <Link to="/products" style={mobileNavLinkStyle}>商品</Link>
            <Link to="/wholesale-jp" style={mobileNavLinkStyle}>卸</Link>
            {user && (
              <Link to="/wholesale-jp/dashboard" style={mobileNavLinkStyle}>
                Dashboard
              </Link>
            )}
          </div>
        )}
      </header>

      <main>
        <section
          style={{
            maxWidth: "1440px",
            margin: "0 auto",
            padding: `${heroTopPadding} ${contentPaddingX} 1rem`,
          }}
        >
          <div style={{ maxWidth: isMobile ? "100%" : "760px" }}>
            <p
              style={{
                margin: 0,
                color: pageStyles.softText,
                fontSize: isMobile ? "0.68rem" : "0.94rem",
                lineHeight: isMobile ? 1.8 : 2.15,
                letterSpacing: "0.04em",
              }}
            >
              Ryuge Coffeeの卸販売ページです。一般販売ページの静けさをそのままに、
              国内向けのお取引導線として整えています。
              <br />
              価格閲覧・発注には承認済みアカウントが必要です。お取引開始前の登録は{" "}
              <Link
                to="/wholesale-jp/register"
                style={{
                  color: pageStyles.softText,
                  textDecoration: "underline",
                  textUnderlineOffset: "3px",
                }}
              >
                こちら
              </Link>{" "}
              からお願いいたします。
            </p>
          </div>

          {!user && (
            <div
              style={{
                ...noticeStyle,
                marginTop: isMobile ? "0.9rem" : "1.6rem",
                padding: isMobile ? "0.7rem 0.8rem" : noticeStyle.padding,
                fontSize: isMobile ? "0.58rem" : noticeStyle.fontSize,
                lineHeight: isMobile ? 1.7 : noticeStyle.lineHeight,
              }}
            >
              卸価格の表示と発注には
              <Link
                to="/wholesale-jp/register"
                style={{
                  color: pageStyles.strongText,
                  margin: "0 0.25em",
                  textDecoration: "underline",
                  textUnderlineOffset: "3px",
                }}
              >
                登録
              </Link>
              または
              <Link
                to="/wholesale-jp/login"
                style={{
                  color: pageStyles.strongText,
                  margin: "0 0.25em",
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
            <div
              style={{
                ...noticeStyle,
                marginTop: isMobile ? "0.9rem" : "1.6rem",
                padding: isMobile ? "0.7rem 0.8rem" : noticeStyle.padding,
                fontSize: isMobile ? "0.58rem" : noticeStyle.fontSize,
                lineHeight: isMobile ? 1.7 : noticeStyle.lineHeight,
              }}
            >
              アカウント承認待ちです。承認後に卸価格表示と発注が可能になります。
            </div>
          )}
        </section>

        <section
          style={{
            maxWidth: "1440px",
            margin: "0 auto",
            padding: `0.7rem ${contentPaddingX} ${isMobile ? "4.8rem" : "7rem"}`,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: productGridColumns,
              gap: isMobile ? "0.4rem" : "1.35rem",
              alignItems: "stretch",
            }}
          >
            {WHOLESALE_PRODUCTS.map((product) => {
              const displayProduct = user
                ? {
                    ...product,
                    name: getLoggedInDisplayTitleByProduct(product),
                    subtitle: getLoggedInDisplaySubtitleByProduct(product),
                  }
                : product;

              return (
                <WholesaleProductCard
                  key={product.id}
                  product={displayProduct}
                  quantity={cart[product.id] || 0}
                  onAdd={() => addToCart(product.id)}
                  onRemove={() => removeFromCart(product.id)}
                  onOpenDetail={() => setActiveItemId(product.id)}
                />
              );
            })}

            <OriginalBagCard user={user} approved={approved} />
          </div>
        </section>

        <section
          style={{
            maxWidth: "1440px",
            margin: "0 auto",
            padding: `0 ${contentPaddingX} 5rem`,
          }}
        >
          <div
            style={{
              borderTop: `1px solid ${pageStyles.border}`,
              paddingTop: isMobile ? "1.1rem" : "2.4rem",
            }}
          >
            <p
              style={{
                margin: "0 0 0.6rem",
                color: pageStyles.mutedText,
                fontSize: isMobile ? "0.54rem" : "0.68rem",
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
                fontSize: isMobile ? "0.64rem" : "0.85rem",
                lineHeight: isMobile ? 1.75 : 2.1,
                letterSpacing: "0.04em",
              }}
            >
              最低注文数量・納期・お支払い条件は個別にご案内いたします。
              卸のお取引は基本的に後払い請求ベースを想定しています。
            </p>
          </div>
        </section>
      </main>

      {activeWholesaleProduct && (
        <div className="modal-backdrop" onClick={() => setActiveItemId(null)}>
          {!user ? (
            <div className="modal modal-premium" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setActiveItemId(null)}>
                ×
              </button>
              <div className="modal-image modal-image-premium">
                <img src={activeWholesaleProduct.image} alt="" />
              </div>
            </div>
          ) : (
            <div className="modal modal-premium" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setActiveItemId(null)}>
                ×
              </button>

              <div className="modal-image modal-image-premium">
                <img src={activeWholesaleProduct.image} alt="" />
              </div>

              <div className="modal-copy modal-copy-premium">
                <div className="modal-copy-inner modal-copy-classic">
                  <h3
                    className="modal-product-title modal-title-animate"
                    style={{ whiteSpace: "pre-line" }}
                  >
                    {modalTitle}
                  </h3>

                  <p className="modal-summary modal-product-summary modal-fade-up">
                    {modalSummary}
                  </p>

                  {activeDetailedItem ? (
                    <>
                      <dl className="product-specs product-specs-classic modal-fade-up">
                        {renderSpecRow(labels.origin, activeDetailedItem.origin)}
                        {renderSpecRow(labels.producer, activeDetailedItem.producer)}
                        {renderSpecRow(labels.process, activeDetailedItem.process)}
                        {renderSpecRow(labels.variety, activeDetailedItem.variety)}
                        {renderSpecRow(labels.altitude, activeDetailedItem.altitude)}
                        {renderSpecRow(labels.weight, displayWeight)}
                        {approved ? renderSpecRow(labels.price, displayPrice) : null}
                        {renderSpecRow(labels.flavor, activeDetailedItem.flavor)}
                      </dl>

                      <div className="simple-quantity-block">
                        <p className="simple-quantity-label">数量</p>
                        <div className="simple-quantity-control">
                          <button
                            type="button"
                            onClick={() => removeFromCart(activeWholesaleProduct.id)}
                          >
                            −
                          </button>

                          <input
                            type="number"
                            min="0"
                            value={cart[activeWholesaleProduct.id] || 0}
                            onChange={(e) => {
                              const value = Number(e.target.value);
                              const safeValue = Number.isNaN(value)
                                ? 0
                                : Math.max(0, value);

                              setCart((prev) => {
                                const next = { ...prev };
                                if (safeValue === 0) {
                                  delete next[activeWholesaleProduct.id];
                                } else {
                                  next[activeWholesaleProduct.id] = safeValue;
                                }
                                return next;
                              });
                            }}
                          />

                          <button
                            type="button"
                            onClick={() => addToCart(activeWholesaleProduct.id)}
                          >
                            ＋
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="modal-cta-link modal-fade-up"
                        onClick={() => setActiveItemId(null)}
                      >
                        カートに入れる
                      </button>
                    </>
                  ) : (
                    <>
                      <dl className="product-specs product-specs-classic modal-fade-up">
                        {renderSpecRow(labels.weight, displayWeight)}
                        {approved ? renderSpecRow(labels.price, displayPrice) : null}
                      </dl>

                      <div className="simple-quantity-block">
                        <p className="simple-quantity-label">数量</p>
                        <div className="simple-quantity-control">
                          <button
                            type="button"
                            onClick={() => removeFromCart(activeWholesaleProduct.id)}
                          >
                            −
                          </button>

                          <input
                            type="number"
                            min="0"
                            value={cart[activeWholesaleProduct.id] || 0}
                            onChange={(e) => {
                              const value = Number(e.target.value);
                              const safeValue = Number.isNaN(value)
                                ? 0
                                : Math.max(0, value);

                              setCart((prev) => {
                                const next = { ...prev };
                                if (safeValue === 0) {
                                  delete next[activeWholesaleProduct.id];
                                } else {
                                  next[activeWholesaleProduct.id] = safeValue;
                                }
                                return next;
                              });
                            }}
                          />

                          <button
                            type="button"
                            onClick={() => addToCart(activeWholesaleProduct.id)}
                          >
                            ＋
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="modal-cta-link modal-fade-up"
                        onClick={() => setActiveItemId(null)}
                      >
                        カートに入れる
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {approved && cartCount > 0 && (
        <div
          style={{
            position: "fixed",
            right: isMobile ? "0.75rem" : "2.4rem",
            bottom: isMobile ? "0.75rem" : "2.4rem",
            zIndex: 120,
          }}
        >
          <button
            onClick={handleGoToOrder}
            style={{
              backgroundColor: "rgba(255,255,255,0.92)",
              color: "#050505",
              border: "none",
              padding: isMobile ? "0.7rem 0.9rem" : "1rem 1.8rem",
              fontSize: isMobile ? "0.56rem" : "0.72rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              cursor: "pointer",
              fontFamily: baseFontFamily,
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
      <div style={{ aspectRatio: "1 / 1", overflow: "hidden" }}>
        <img
          src="/images/original.jpg"
          alt=""
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      </div>

      <div
        style={{
          padding: viewportPadding(approved, user),
          display: "flex",
          flexDirection: "column",
          flex: 1,
        }}
      >
        <p
          style={{
            margin: "0 0 0.25rem",
            color: "rgba(255,255,255,0.92)",
            fontSize: "0.64rem",
            lineHeight: 1.5,
            letterSpacing: "0.02em",
          }}
        >
          オリジナルコーヒーバッグ制作
        </p>

        <p
          style={{
            margin: "0 0 0.5rem",
            color: "rgba(255,255,255,0.44)",
            fontSize: "0.5rem",
            lineHeight: 1.65,
          }}
        >
          オリジナル仕様の制作が可能です。
        </p>

        <div
          style={{
            marginTop: "auto",
            paddingTop: "0.45rem",
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
                padding: "0.35rem 0.45rem",
                fontSize: "0.42rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              制作相談
            </a>
          ) : !user ? (
            <p
              style={{
                margin: 0,
                color: "rgba(255,255,255,0.34)",
                fontSize: "0.44rem",
                lineHeight: 1.55,
              }}
            >
              取引開始後にご案内
            </p>
          ) : (
            <p
              style={{
                margin: 0,
                color: "rgba(255,255,255,0.34)",
                fontSize: "0.44rem",
                lineHeight: 1.55,
              }}
            >
              承認済み取引先様向け
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function viewportPadding() {
  return "0.5rem 0.45rem 0.45rem";
}

const navLinkStyle = {
  textDecoration: "none",
  color: "rgba(255,255,255,0.68)",
  fontSize: "0.82rem",
  letterSpacing: "0.08em",
};

const mobileNavLinkStyle = {
  textDecoration: "none",
  color: "rgba(255,255,255,0.62)",
  fontSize: "0.58rem",
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
  fontFamily: baseFontFamily,
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