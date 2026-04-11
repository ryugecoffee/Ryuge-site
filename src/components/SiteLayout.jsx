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
  const cartRef = useRef(null);
useEffect(() => {
  const handleClickOutside = (e) => {
    if (cartRef.current && !cartRef.current.contains(e.target)) {
      setIsCartOpen(false);
    }
  };

  document.addEventListener("mousedown", handleClickOutside);

  return () => {
    document.removeEventListener("mousedown", handleClickOutside);
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
<button
  type="button"
  className="cart-indicator"
  onClick={() => setIsCartOpen((prev) => !prev)}
>
  🛒 {(cartItems || []).reduce((sum, item) => sum + item.quantity, 0)}
</button>

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
          {isCartOpen && (
<div className="cart-dropdown" ref={cartRef}>
    {cartItems.length === 0 ? (
      <p className="cart-empty">カートは空です</p>
    ) : (
      <div className="cart-dropdown-list">
        {cartItems.map((item) => (
  <div key={item.id} className="cart-dropdown-item">
    <div className="cart-dropdown-info">
      <span className="cart-dropdown-title">{item.title}</span>
      <span className="cart-dropdown-qty">× {item.quantity}</span>
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
      </header>

      <Outlet />
    </div>
  );
}