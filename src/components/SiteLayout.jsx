import { useEffect } from "react";
import { Outlet, Link, useNavigate } from "react-router-dom";
import { useCart } from "../CartContext";
import { trackViewCart } from "../lib/analytics";

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

  return (
    <div className="site-shell">
      <header className="site-header minimal-header">
        <Link to="/" className="site-logo">Ryuge Coffee</Link>
        <nav className="site-nav store-nav" aria-label={lang === "ja" ? "ストアのメニュー" : "Store navigation"}>
          <button type="button" className="cart-indicator" onClick={() => { setIsCartOpen(true); trackViewCart(cartItems, cartTotal); }}>
            {lang === "ja" ? "カート" : lang === "es" ? "Carrito" : "Cart"}
            {cartCount > 0 && ` (${cartCount})`}
          </button>
        </nav>
        <div className="lang-switch header-lang-switch">
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
                    {lang === "ja" ? "税込価格。送料は決済画面で計算します（1回のご注文につき1回。コーヒー豆1〜2袋は全国一律250円、3袋以上は本州・四国250円／北海道・九州500円／沖縄550円）。" : lang === "es" ? "Precios con impuestos incluidos. El envío se calcula en el pago (una vez por pedido; 1–2 bolsas de café ¥250 a todo Japón; 3 o más: ¥250 / ¥500 Hokkaido y Kyushu / ¥550 Okinawa)." : "Prices include tax. Shipping is calculated at checkout (once per order; 1–2 bags of beans ¥250 anywhere in Japan; 3+: ¥250, Hokkaido/Kyushu ¥500, Okinawa ¥550)."}
                  </p>

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
