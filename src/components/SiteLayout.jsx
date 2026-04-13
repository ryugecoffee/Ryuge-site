import { useState, useEffect } from "react";
import { Outlet, Link, useNavigate } from "react-router-dom";

export default function SiteLayout({
  lang,
  setLang,
  cartItems,
  removeFromCart,
  updateCartQuantity,
  addToCart,
})

{
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
            {lang === "ja" ? "カート" : lang === "es" ? "Carrito" : "Cart"}
{(cartItems || []).reduce((sum, item) => sum + item.quantity, 0) > 0 &&
  ` (${(cartItems || []).reduce((sum, item) => sum + item.quantity, 0)})`}
          </button>

          {/* 言語切替 */}
          <button className={lang === "ja" ? "active" : ""} onClick={() => setLang("ja")}>JP</button>
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

            <p className="cart-modal-heading">
  {lang === "ja" ? "カート" : lang === "es" ? "Carrito" : "Cart"}
</p>

            {cartItems.length === 0 ? (
              <p className="cart-empty">
  {lang === "ja"
    ? "カートは空です"
    : lang === "es"
    ? "El carrito está vacío"
    : "Your cart is empty"}
</p>
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
  <span>{lang === "ja" ? "合計" : lang === "es" ? "Total" : "Total"}</span>
                    <span className="cart-total-amount">
                      ¥{cartItems
                        .reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0)
                        .toLocaleString()}
                    </span>
                  </div>
                  <p className="cart-total-note">
  {lang === "ja"
    ? "送料・税は別途"
    : lang === "es"
    ? "Envío e impuestos no incluidos"
    : "Shipping and taxes calculated separately"}
</p>

{/* 送料無料誘導 */}
{(() => {
  const total = cartItems.reduce(
    (sum, item) => sum + (item.price || 0) * item.quantity,
    0
  );

  const FREE_SHIPPING = 6000;
  const remaining = Math.max(0, FREE_SHIPPING - total);

  if (remaining === 0) return null;

  return (
    <div className="cart-upsell">
      <p className="cart-upsell-shipping">
        {lang === "ja"
          ? `あと ¥${remaining.toLocaleString()} で送料無料`
          : lang === "es"
          ? `Envío gratis con ¥${remaining.toLocaleString()} más`
          : `Add ¥${remaining.toLocaleString()} more for free shipping`}
      </p>

      <div className="cart-upsell-list">
        {/* 珈琲バッグ */}
        <div className="cart-upsell-item">
<div className="cart-upsell-info">
  <p className="cart-upsell-name">
    {lang === "ja" ? "珈琲バッグ" : "Coffee Bag"}
  </p>

  <p className="cart-upsell-desc">
    {lang === "ja"
      ? "マグに入れてお湯を注ぐだけの手軽な一杯"
      : "Easy cup, just add hot water"}
  </p>

  <div className="cart-upsell-links">
    <button
      className="cart-upsell-detail"
      onClick={() => {
        setIsCartOpen(false);
        navigate("/products"); // 折々ページに飛ばすならここ変更
      }}
    >
      {lang === "ja" ? "詳細" : "Details"}
    </button>

    <p className="cart-upsell-price">¥350</p>
  </div>
</div>
          <button
            className="cart-upsell-add"
            onClick={() =>
              addToCart({
                id: "coffee-bag",
                name: "珈琲バッグ",
                priceNumber: 350,
                image: "",
              })
            }
          >
            {lang === "ja" ? "追加" : "Add"}
          </button>
        </div>

        {/* お茶バッグ */}
        <div className="cart-upsell-item">
<div className="cart-upsell-info">
  <p className="cart-upsell-name">
    {lang === "ja" ? "お茶バッグ" : "Tea Bag"}
  </p>

  <p className="cart-upsell-desc">
    {lang === "ja"
      ? "やわらかく広がる香りを手軽に楽しむ一杯"
      : "Easy and aromatic tea bag"}
  </p>

  <div className="cart-upsell-links">
    <button
      type="button"
      className="cart-upsell-detail"
      onClick={() => {
        setIsCartOpen(false);
        navigate("/products#oriori");
      }}
    >
      {lang === "ja" ? "詳細" : "Details"}
    </button>

    <p className="cart-upsell-price">¥500</p>
  </div>
</div>

          <button
            className="cart-upsell-add"
            onClick={() =>
              addToCart({
                id: "tea-bag",
                name: "お茶バッグ",
                priceNumber: 500,
                image: "",
              })
            }
          >
            {lang === "ja" ? "追加" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
})()}

<button
  className="cart-checkout-button"
  onClick={() => {
    setIsCartOpen(false);
    navigate("/checkout");
  }}
>
  {lang === "ja"
    ? "決済へ進む"
    : lang === "es"
    ? "Ir al pago"
    : "Proceed to Checkout"}
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