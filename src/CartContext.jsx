import { createContext, useContext, useMemo, useState } from "react";
import { trackAddToCart } from "./lib/analytics";

const CartContext = createContext(null);

function loadCart() {
  try {
    const saved = localStorage.getItem("cart-items");
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveCart(items) {
  localStorage.setItem("cart-items", JSON.stringify(items));
}

export function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState(loadCart);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const addToCart = (product, quantity = 1) => {
    setCartItems((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      let next;
      if (existing) {
        next = prev.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      } else {
        next = [
          ...prev,
          {
            id: product.id,
            name: product.name || product.title?.ja || product.title || "Product",
            price: product.priceNumber ?? product.price ?? 0,
            image: product.image || "",
            category: product.category,
            size: product.size,
            quantity,
          },
        ];
      }
      saveCart(next);
      return next;
    });
    trackAddToCart(product, quantity);
  };

  const setItem = (product, quantity) => {
    setCartItems((prev) => {
      const next = [
        ...prev.filter((item) => item.id !== product.id),
        ...(quantity > 0
          ? [
              {
                id: product.id,
                name: product.name || product.title?.ja || product.title || "Product",
                price: product.priceNumber ?? product.price ?? 0,
                image: product.image || "",
                category: product.category,
                size: product.size,
                quantity,
              },
            ]
          : []),
      ];
      saveCart(next);
      return next;
    });
  };

  const updateQuantity = (id, quantity) => {
    if (quantity <= 0) {
      removeFromCart(id);
      return;
    }
    setCartItems((prev) => {
      const next = prev.map((item) =>
        item.id === id ? { ...item, quantity } : item
      );
      saveCart(next);
      return next;
    });
  };

  const removeFromCart = (id) => {
    setCartItems((prev) => {
      const next = prev.filter((item) => item.id !== id);
      saveCart(next);
      return next;
    });
  };

  const clearCart = () => {
    setCartItems([]);
    localStorage.removeItem("cart-items");
  };

  const cartCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems]
  );

  const cartTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cartItems]
  );

  return (
    <CartContext.Provider
      value={{
        cartItems,
        addToCart,
        setItem,
        updateQuantity,
        removeFromCart,
        clearCart,
        cartCount,
        cartTotal,
        isCartOpen,
        setIsCartOpen,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within CartProvider");
  }
  return context;
}
