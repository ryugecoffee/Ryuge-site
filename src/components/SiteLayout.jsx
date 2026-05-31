import { useEffect } from "react";
import { Outlet, Link, useNavigate } from "react-router-dom";
import { useCart } from "../CartContext";

export default function SiteLayout({ lang, setLang }) {
  const {
    cartItems,
    cartTotal,
    cartCount,
    addToCart,
    removeFromCart,
    updateQuantity,
    isCartOpen,
    setIsCartOpen,
  } = useCart();
  const navigate = useNavigate();

  useEffect(() => {
    document.body.style.overflow = isCartOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isCartOpen]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setIsCartOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const FREE_SHIPPING = 3000;
  const remaining = Math.max(0, FREE_SHIPPING - cartTotal);
  const hasSubscription = cartItems.some(
    (item) =>
      item.id?.includes("subscription") ||
      item.id === "light" ||
      item.id === "basic" ||
      item.id === "premium"
  );

  return (
    <div className="site-shell">
      <header className="site-header minimal-header">
        <div className="site-header-side left" />
        <Link to="/" className="site-logo centered-logo">Ryuge Coffee</Link>
        <div className="lang-switch header-lang-switch">
          <button type="button" className="cart-indicator" onClick={() => setIsCartOpen(true)}>
            {lang === "ja" ? "カート" : lang === "es" ? "Carrito" : "Cart"}
            {cartCount > 0 && ` (${cartCount})`}
          </button>
          <button className={lang === "ja" ? "active" : ""} onClick={() => setLang("ja")}>JP</button>
          <button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>EN</button>
          <button className={lang === "es" ? "active" : ""} onClick={() => setLang("es")}>ES</button>
        </div>
      </header>

      {isCartOpen && (
        <div className="cart-modal-backdrop" onClick={() => setIsCartOpen(false)}>
          <div className="cart-modal" onClick={(e) => e.stopPropagation()}>
            <button className="cart-modal-close" onClick={() => setIsCartOpen(false)}>×</button>
            <p className="cart-modal-heading">
              {lang === "ja" ? "カート" : lang === "es" ? "Carrito" : "Cart"}
            </p>

            {cartItems.length === 0 ? (
              <p className="cart-empty">
                {lang === "ja" ? "カートは空です" : lang === "es" ? "El carrito está vacío" : "Your cart is empty"}
              </p>
            ) : (
              <>
                <div className="cart-dropdown-list">
                  {cartItems.map((item) => (
                    <div key={item.id} className="cart-dropdown-item">
                      <div className="cart-dropdown-info">
                        <div className="cart-item-meta">
                          <span className="cart-dropdown-title">{item.name}</span>
                          <span className="cart-dropdown-price">¥{(item.price || 0).toLocaleString()}</span>
                        </div>
                        <div className="cart-qty-controls">
                          <button type="button" className="cart-qty-button" onClick={() => updateQuantity(item.id, item.quantity - 1)}>−</button>
                          <span className="cart-dropdown-qty">{item.quantity}</span>
                          <button type="button" className="cart-qty-button" onClick={() => updateQuantity(item.id, item.quantity + 1)}>＋</button>
                        </div>
                      </div>
                      <button type="button" className="cart-remove-button" onClick={() => removeFromCart(item.id)}>×</button>
                    </div>
                  ))}
                </div>

                <div className="cart-modal-footer">
                  <div className="cart-total-row">
                    <span>{lang === "ja" ? "合計" : "Total"}</span>
                    <span className="cart-total-amount">¥{cartTotal.toLocaleString()}</span>
                  </div>
                  <p className="cart-total-note">
                    {lang === "ja" ? "送料・税は別途" : lang === "es" ? "Envío e impuestos no incluidos" : "Shipping and taxes calculated separately"}
                  </p>

                  {!hasSubscription && remaining > 0 && (
                    <div className="cart-upsell">
                      <p className="cart-upsell-shipping">
                        {lang === "ja"
                          ? `あと ¥${remaining.toLocaleString()} で送料無料`
                          : lang === "es"
                          ? `Envío gratis con ¥${remaining.toLocaleString()} más`
                          : `Add ¥${remaining.toLocaleString()} more for free shipping`}
                      </p>
                    </div>
                  )}

                  <button className="cart-checkout-button" onClick={() => { setIsCartOpen(false); navigate("/checkout"); }}>
                    {lang === "ja" ? "決済へ進む" : lang === "es" ? "Ir al pago" : "Proceed to Checkout"}
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
