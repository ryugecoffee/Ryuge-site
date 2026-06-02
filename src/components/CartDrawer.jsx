import { useCart } from "../CartContext";

export default function CartDrawer({ lang }) {
  const {
    cartItems,
    updateQuantity,
    removeFromCart,
    cartTotal,
    isCartOpen,
    setIsCartOpen,
    addToCart,
  } = useCart();

  const totalQuantity = cartItems
    .filter((i) => !i.id?.startsWith("subscription-"))
    .reduce((sum, i) => sum + (i.quantity || 0), 0);
  const isFreeShippingReached = totalQuantity >= 2;

  const bagRecommendations = [
    {
      id: "coffee-bag",
      name:
        lang === "ja"
          ? "珈琲袋"
          : lang === "es"
          ? "Bolsa de café"
          : "Coffee Bag",
      price: 350,
    },
    {
      id: "tea-bag",
      name:
        lang === "ja"
          ? "一煎袋"
          : lang === "es"
          ? "Bolsa de té"
          : "Tea Bag",
      price: 500,
    },
  ];

  if (!isCartOpen) return null;

  return (
    <div className="cart-overlay" onClick={() => setIsCartOpen(false)}>
      <aside className="cart-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="cart-header">
          <h2>
            {lang === "ja" ? "カート" : lang === "es" ? "Carrito" : "Cart"}
          </h2>
          <button
            className="cart-close"
            onClick={() => setIsCartOpen(false)}
          >
            ×
          </button>
        </div>

        <div className="cart-body">
          {cartItems.length === 0 ? (
            <p className="cart-empty">
              {lang === "ja"
                ? "カートは空です。"
                : lang === "es"
                ? "El carrito está vacío."
                : "Your cart is empty."}
            </p>
          ) : (
            cartItems.map((item) => (
              <div className="cart-item" key={item.id}>
                <div className="cart-item-image">
                  {item.image ? <img src={item.image} alt={item.name} /> : null}
                </div>

                <div className="cart-item-info">
                  <div className="cart-item-name">{item.name}</div>
                  <div className="cart-item-price">
                    ¥{item.price.toLocaleString()}
                  </div>

                  <div className="cart-qty-row">
                    <button
                      onClick={() =>
                        updateQuantity(item.id, item.quantity - 1)
                      }
                    >
                      −
                    </button>

                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) =>
                        updateQuantity(item.id, Number(e.target.value) || 1)
                      }
                    />

                    <button
                      onClick={() =>
                        updateQuantity(item.id, item.quantity + 1)
                      }
                    >
                      ＋
                    </button>
                  </div>

                  <button
                    className="cart-remove"
                    onClick={() => removeFromCart(item.id)}
                  >
                    {lang === "ja"
                      ? "削除"
                      : lang === "es"
                      ? "Eliminar"
                      : "Remove"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="cart-footer">
          <div className="cart-total">
            <span>{lang === "ja" ? "合計" : lang === "es" ? "Total" : "Total"}</span>
            <strong>¥{cartTotal.toLocaleString()}</strong>
          </div>

          {!isFreeShippingReached && cartItems.length > 0 && (
            <div className="cart-upsell">
              <p className="cart-upsell-shipping">
                {lang === "ja"
                  ? "もう1個追加で送料無料"
                  : lang === "es"
                  ? "Añade 1 artículo más para envío gratis"
                  : "Add 1 more item for free shipping"}
              </p>

              <div className="cart-upsell-list">
                {bagRecommendations.map((item) => (
                  <div key={item.id} className="cart-upsell-item">
                    <div className="cart-upsell-info">
                      <p className="cart-upsell-name">{item.name}</p>
                      <p className="cart-upsell-price">
                        ¥{item.price.toLocaleString()}
                      </p>
                    </div>

                    <button
                      type="button"
                      className="cart-upsell-add"
                      onClick={() =>
                        addToCart?.({
                          ...item,
                          quantity: 1,
                        })
                      }
                    >
                      {lang === "ja"
                        ? "追加"
                        : lang === "es"
                        ? "Añadir"
                        : "Add"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            className="cart-checkout-button"
            disabled={cartItems.length === 0}
          >
            {lang === "ja"
              ? "購入へ進む"
              : lang === "es"
              ? "Ir al pago"
              : "Proceed to Checkout"}
          </button>
        </div>
      </aside>
    </div>
  );
}