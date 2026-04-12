import { useState, useEffect } from "react";
import { Outlet, Link, useNavigate } from "react-router-dom";

export default function SiteLayout({
  lang,
  setLang,
  cartItems,
  removeFromCart,
  updateCartQuantity,
}) {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const navigate = useNavigate();

  // モーダルを開いているときはbodyのスクロールを止める
  useEffect(() => {
    document.body.style.overflow = isCartOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isCartOpen]);

  // ESCキーで閉じる
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setIsCartOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="site-shell">
      <header className="site-header minimal-header">
        <div className="site-header-side left" />

        <Link to="/" className="site-logo centered-logo">
          Ryuge Coffee
        </Link>

        <div className="lang-switch header-lang-switch">
          {/* カートボタン */}
          <button
            type="button"
            className="cart-indicator"
            onClick={() => setIsCartOpen(true)}
          >
            🛒 {(cartItems || []).reduce((sum, item) => sum + item.quantity, 0)}
          </button>

          {/* 言語切替 */}
          <button className={lang === "ja" ? "active" : ""} onClick={() => setLang("ja")}>JA</button>
          <button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>EN</button>
          <button className={lang === "es" ? "active" : ""} onClick={() => setLang("es")}>ES</button>
        </div>
      </header>

      {/* カートモーダル */}
      {isCartOpen && (
        <div
          className="cart-modal-backdrop"
          onClick={() => setIsCartOpen(false)}
        >
          <div
            className="cart-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 閉じるボタン */}
            <button
              className="cart-modal-close"
              onClick={() => setIsCartOpen(false)}
            >
              ×
            </button>

            <p className="cart-modal-heading">Cart</p>

            {cartItems.length === 0 ? (
              <p className="cart-empty">カートは空です</p>
            ) : (
              <>
                <div className="cart-dropdown-list">
                  {cartItems.map((item) => (
                    <div key={item.id} className="cart-dropdown-item">
                      <div className="cart-dropdown-info">
                        <span className="cart-dropdown-title">{item.title}</span>
                        <div className="cart-qty-controls">
                          <button
                            type="button"
                            className="cart-qty-button"
                            onClick={() => updateCartQuantity(item.id, item.quantity - 1)}
                          >
                            −
                          </button>
                          <span className="cart-dropdown-qty">{item.quantity}</span>
                          <button
                            type="button"
                            className="cart-qty-button"
                            onClick={() => updateCartQuantity(item.id, item.quantity + 1)}
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

                {/* 合計金額 */}
                <div className="cart-modal-footer">
                  <div className="cart-total-row">
                    <span>合計</span>
                    <span className="cart-total-amount">
                      ¥{cartItems
                        .reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0)
                        .toLocaleString()}
                    </span>
                  </div>
                  <p className="cart-total-note">送料・税は別途</p>
<button
  className="cart-checkout-button"
onClick={() => {
  setIsCartOpen(false);
  navigate("/checkout");
}}
>
  決済へ進む
</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <Outlet />
    </div>
  );
}