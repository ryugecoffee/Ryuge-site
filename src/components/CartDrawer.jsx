import { useCart } from "../context/CartContext";

export default function CartDrawer() {
  const {
    cartItems,
    updateQuantity,
    removeFromCart,
    cartTotal,
    isCartOpen,
    setIsCartOpen,
  } = useCart();

  if (!isCartOpen) return null;

  return (
    <div className="cart-overlay" onClick={() => setIsCartOpen(false)}>
      <aside className="cart-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="cart-header">
          <h2>Cart</h2>
          <button
            className="cart-close"
            onClick={() => setIsCartOpen(false)}
          >
            ×
          </button>
        </div>

        <div className="cart-body">
          {cartItems.length === 0 ? (
            <p className="cart-empty">カートは空です。</p>
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
                    削除
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="cart-footer">
          <div className="cart-total">
            <span>合計</span>
            <strong>¥{cartTotal.toLocaleString()}</strong>
          </div>

          <button className="cart-checkout-button" disabled={cartItems.length === 0}>
            購入へ進む
          </button>
        </div>
      </aside>
    </div>
  );
}