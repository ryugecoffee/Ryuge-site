import { useState, useEffect } from "react";
import { Outlet, Link, useNavigate } from "react-router-dom";

export default function SiteLayout({
  lang,
  setLang,
  cartItems,
  removeFromCart,
  updateCartQuantity,
  addToCart,
}) {
  const [isCartOpen, setIsCartOpen] = useState(false);
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

  const cartTotal = (cartItems || []).reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0);
  const cartCount = (cartItems || []).reduce((sum, item) => sum + item.quantity, 0);
  const FREE_SHIPPING = 7000;
  const remaining = Math.max(0, FREE_SHIPPING - cartTotal);

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
                          <span className="cart-dropdown-title">{item.title}</span>
                          <span className="cart-dropdown-price">¥{(item.price || 0).toLocaleString()}</span>
                        </div>
                        <div className="cart-qty-controls">
                          <button type="button" className="cart-qty-button" onClick={() => updateCartQuantity(item.id, item.quantity - 1)}>−</button>
                          <span className="cart-dropdown-qty">{item.quantity}</span>
                          <button type="button" className="cart-qty-button" onClick={() => updateCartQuantity(item.id, item.quantity + 1)}>＋</button>
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

                  {remaining > 0 && (
                    <div className="cart-upsell">
                      <p className="cart-upsell-shipping">
                        {lang === "ja"
                          ? `あと ¥${remaining.toLocaleString()} で送料無料`
                          : lang === "es"
                          ? `Envío gratis con ¥${remaining.toLocaleString()} más`
                          : `Add ¥${remaining.toLocaleString()} more for free shipping`}
                      </p>

                      <div className="cart-upsell-list">
                        <div className="cart-upsell-item">
                          <div className="cart-upsell-info">
                            <p className="cart-upsell-name">{lang === "ja" ? "珈琲バッグ" : "Coffee Bag"}</p>
                            <div className="cart-upsell-links">
                              <button type="button" className="cart-upsell-detail" onClick={() => { setIsCartOpen(false); navigate("/products"); }}>
                                {lang === "ja" ? "詳細" : "Details"}
                              </button>
                              <p className="cart-upsell-price">¥350</p>
                            </div>
                          </div>
                          <button type="button" className="cart-upsell-add" onClick={() => addToCart({ id: "coffee-bag", title: lang === "ja" ? "珈琲バッグ" : "Coffee Bag", price: 350, quantity: 1 })}>
                            {lang === "ja" ? "追加" : "Add"}
                          </button>
                        </div>

                        <div className="cart-upsell-item">
                          <div className="cart-upsell-info">
                            <p className="cart-upsell-name">{lang === "ja" ? "お茶バッグ" : "Tea Bag"}</p>
                            <div className="cart-upsell-links">
                              <button type="button" className="cart-upsell-detail" onClick={() => { setIsCartOpen(false); navigate("/products"); }}>
                                {lang === "ja" ? "詳細" : "Details"}
                              </button>
                              <p className="cart-upsell-price">¥500</p>
                            </div>
                          </div>
                          <button type="button" className="cart-upsell-add" onClick={() => addToCart({ id: "tea-bag", title: lang === "ja" ? "お茶バッグ" : "Tea Bag", price: 500, quantity: 1 })}>
                            {lang === "ja" ? "追加" : "Add"}
                          </button>
                        </div>
                      </div>
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