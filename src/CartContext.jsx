import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { trackAddToCart, trackRemoveFromCart } from "./lib/analytics";
import { CART_IDLE_MS, ITEMS_KEY, TOUCHED_KEY, readStoredCart } from "./lib/cartExpiry";

const CartContext = createContext(null);

// The cart lives in localStorage for 30 minutes after its last change (src/lib/cartExpiry.js). Every change writes the
// time of that change next to the items; another tab sees both. Never emptied on /checkout (the payment in progress).
function saveCart(items, now = Date.now()) {
  try {
    localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
    if (items.length) localStorage.setItem(TOUCHED_KEY, String(now));
    else localStorage.removeItem(TOUCHED_KEY);
  } catch {
    // Private mode or storage full: the cart still works in this tab.
  }
}
function forgetCart() {
  try { localStorage.removeItem(ITEMS_KEY); localStorage.removeItem(TOUCHED_KEY); } catch { /* nothing stored */ }
}

// Promotional beans: at most 2 bags per customer (the payment server enforces it across orders as well).
const PROMO_MAX_BAGS = 2;
const capped = (item, quantity) => (item?.promo ? Math.min(quantity, PROMO_MAX_BAGS) : quantity);

export function CartProvider({ children }) {
  const holding = useLocation().pathname === "/checkout";
  const holdingRef = useRef(holding);
  useEffect(() => { holdingRef.current = holding; }, [holding]);
  const [initial] = useState(() => {
    try { return readStoredCart(localStorage, Date.now(), { holding }); } catch { return { items: [], touchedAt: null, expired: false, startClock: false }; }
  });
  const [cartItems, setCartItems] = useState(initial.items);
  const [touchedAt, setTouchedAt] = useState(initial.touchedAt);
  const [expiredNotice, setExpiredNotice] = useState(initial.expired);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const itemsRef = useRef(cartItems);
  useEffect(() => { itemsRef.current = cartItems; }, [cartItems]);

  // On opening the page: an expired cart is removed from storage; a cart saved before this rule starts its 30 minutes.
  useEffect(() => {
    if (initial.expired) forgetCart();
    if (initial.startClock) {
      try { localStorage.setItem(TOUCHED_KEY, String(initial.touchedAt)); } catch { /* not stored */ }
    }
  }, [initial]);

  const changed = () => { setTouchedAt(Date.now()); setExpiredNotice(false); };

  const expire = useCallback(() => {
    forgetCart();
    setCartItems([]);
    setTouchedAt(null);
    setExpiredNotice(true);
    setIsCartOpen(false);
  }, []);

  // Storage is shared by the tabs: re-read it (another tab may have changed, extended or emptied the cart) and empty
  // the cart if its 30 minutes are over (unless this tab is on /checkout).
  const check = useCallback(() => {
    let stored;
    try { stored = readStoredCart(localStorage, Date.now(), { holding: holdingRef.current }); } catch { return; }
    if (stored.expired) { expire(); return; }
    if (stored.startClock) {
      try { localStorage.setItem(TOUCHED_KEY, String(stored.touchedAt)); } catch { /* not stored */ }
    }
    // On /checkout another tab never empties this cart (the payment in progress uses it): it is written back, so a
    // reload of /checkout still has it.
    if (holdingRef.current && !stored.items.length) {
      if (itemsRef.current.length) saveCart(itemsRef.current);
      return;
    }
    setCartItems((prev) => (JSON.stringify(prev) === JSON.stringify(stored.items) ? prev : stored.items));
    setTouchedAt(stored.touchedAt);
  }, [expire]);

  // Coming back to the tab, focusing the window, or a change in another tab.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    const onStorage = (e) => { if (e.key === null || e.key === ITEMS_KEY || e.key === TOUCHED_KEY) check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    window.addEventListener("storage", onStorage);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
      window.removeEventListener("storage", onStorage);
    };
  }, [check]);

  // While the page stays open: at the moment the 30 minutes end.
  const expiresAt = cartItems.length > 0 && touchedAt ? touchedAt + CART_IDLE_MS : null;
  useEffect(() => {
    if (!expiresAt || holding) return undefined;
    const timer = setTimeout(check, Math.max(0, expiresAt - Date.now()) + 50);
    return () => clearTimeout(timer);
  }, [expiresAt, holding, check]);

  // While /checkout is open, the cart's time is kept current (every minute and when the page is left), so no other tab
  // empties it during the payment and leaving the page, however, starts from a fresh 30 minutes.
  useEffect(() => {
    if (!holding) return undefined;
    const keep = () => {
      try { if (localStorage.getItem(ITEMS_KEY) && localStorage.getItem(ITEMS_KEY) !== "[]") localStorage.setItem(TOUCHED_KEY, String(Date.now())); } catch { /* not stored */ }
    };
    keep();
    const timer = setInterval(keep, 60 * 1000);
    window.addEventListener("pagehide", keep);
    return () => { clearInterval(timer); window.removeEventListener("pagehide", keep); keep(); };
  }, [holding]);

  // Leaving /checkout counts as a change: the 30 minutes start again then (the payment form may have taken long).
  const wasHolding = useRef(holding);
  useEffect(() => {
    const left = wasHolding.current && !holding;
    wasHolding.current = holding;
    if (!left) return undefined;
    let items = [];
    try { items = readStoredCart(localStorage, Date.now(), { holding: true }).items; } catch { items = []; }
    if (!items.length) return undefined;
    saveCart(items);
    const timer = setTimeout(check, 0); // picks up the new time (and any change made on /checkout)
    return () => clearTimeout(timer);
  }, [holding, check]);

  const addToCart = (product, quantity = 1) => {
    setCartItems((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      let next;
      if (existing) {
        next = prev.map((item) =>
          item.id === product.id
            ? { ...item, quantity: capped(item, item.quantity + quantity) }
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
            promo: product.promo === true,
            quantity: capped(product, quantity),
          },
        ];
      }
      saveCart(next);
      return next;
    });
    changed();
    trackAddToCart(product, quantity);
  };

  const setItem = (product, quantity) => {
    const before = cartItems.find((item) => item.id === product.id)?.quantity || 0;
    const after = quantity > 0 ? capped(product, quantity) : 0;
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
                promo: product.promo === true,
                quantity: capped(product, quantity),
              },
            ]
          : []),
      ];
      saveCart(next);
      return next;
    });
    changed();
    // GA4: the product page sets the quantity directly; the difference is what was added or taken out.
    if (after > before) trackAddToCart(product, after - before);
    else if (after < before) trackRemoveFromCart(product, before - after);
  };

  const removeFromCart = (id) => {
    const removed = cartItems.find((item) => item.id === id);
    setCartItems((prev) => {
      const next = prev.filter((item) => item.id !== id);
      saveCart(next);
      return next;
    });
    changed();
    if (removed) trackRemoveFromCart(removed, removed.quantity || 1);
  };

  const updateQuantity = (id, quantity) => {
    if (quantity <= 0) {
      removeFromCart(id);
      return;
    }
    const current = cartItems.find((item) => item.id === id);
    const after = current ? capped(current, quantity) : 0;
    if (current && after > current.quantity) trackAddToCart(current, after - current.quantity);
    else if (current && after < current.quantity) trackRemoveFromCart(current, current.quantity - after);
    setCartItems((prev) => {
      const next = prev.map((item) =>
        item.id === id ? { ...item, quantity: capped(item, quantity) } : item
      );
      saveCart(next);
      return next;
    });
    changed();
  };

  // Unchanged: after a successful payment (CheckoutPage) and wherever the cart is emptied on purpose.
  const clearCart = () => {
    setCartItems([]);
    setTouchedAt(null);
    forgetCart();
  };

  // "Keep my cart 30 more minutes": the same as a change, without changing anything.
  const extendCart = () => {
    setCartItems((prev) => { saveCart(prev); return prev; });
    changed();
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
        cartTouchedAt: touchedAt,
        cartHolding: holding,
        extendCart,
        cartExpiredNotice: expiredNotice,
        dismissCartExpiredNotice: () => setExpiredNotice(false),
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
