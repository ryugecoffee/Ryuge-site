import { useState, useEffect, useRef } from "react";
import { Outlet, Link } from "react-router-dom";

export default function SiteLayout({
  lang,
  setLang,
  cartItems,
  removeFromCart,
  updateCartQuantity,
}) {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const cartWrapRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (cartWrapRef.current && !cartWrapRef.current.contains(e.target)) {
        setIsCartOpen(false);
      }
    };

    document.addEventListener("click", handleClickOutside);

    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, []);

  return (
    <div className="site-shell">
      <header className="site-header minimal-header">
        <div className="site-header-side left" />

        <Link to="/" className="site-logo centered-logo">
          Ryuge Coffee
        </Link>

        <div className="lang-switch header-lang-switch">
          <div className="cart-wrap" ref={cartWrapRef}>
            <button
              type="button"
              className="cart-indicator"
              onClick={(e) => {
                e.stopPropagation();
                setIsCartOpen((prev) => !prev);
              }}
            >
              🛒 {(cartItems || []).reduce((sum, item) => sum + item.quantity, 0)}
            </button>

            {isCartOpen && (
              <div
  className="cart-dropdown"
  onClick={(e) => e.stopPropagation()}
style={{
  width: "70vw",
  maxWidth: "900px",
  padding: "28px 32px",
  right: "50%",
  transform: "translateX(50%)",
}}
>
                {cartItems.length === 0 ? (
                  <p className="cart-empty">カートは空です</p>
                ) : (
                  <div className="cart-dropdown-list">
                    {cartItems.map((item) => (
                      <div key={item.id} className="cart-dropdown-item">
                        <div className="cart-dropdown-info">
                          <span className="cart-dropdown-title">{item.title}</span>

                          <div className="cart-qty-controls">
                            <button
                              type="button"
                              className="cart-qty-button"
                              onClick={() =>
                                updateCartQuantity(item.id, item.quantity - 1)
                              }
                            >
                              −
                            </button>

                            <span className="cart-dropdown-qty">
                              {item.quantity}
                            </span>

                            <button
                              type="button"
                              className="cart-qty-button"
                              onClick={() =>
                                updateCartQuantity(item.id, item.quantity + 1)
                              }
                            >
                              ＋
                            </button>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="cart-remove-button"
                          onClick={() => removeFromCart(item.id)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            className={lang === "ja" ? "active" : ""}
            onClick={() => setLang("ja")}
          >
            JA
          </button>
          <button
            className={lang === "en" ? "active" : ""}
            onClick={() => setLang("en")}
          >
            EN
          </button>
          <button
            className={lang === "es" ? "active" : ""}
            onClick={() => setLang("es")}
          >
            ES
          </button>
        </div>
      </header>

      <Outlet />
    </div>
  );
}