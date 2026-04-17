export function pageview(path) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;

  window.gtag("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}

export function trackAddToCart(product, quantity = 1) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;

  window.gtag("event", "add_to_cart", {
    currency: "JPY",
    value: (product.price || 0) * quantity,
    items: [
      {
        item_id: product.id || "",
        item_name: product.name || "",
        price: product.price || 0,
        quantity,
      },
    ],
  });
}

export function trackBeginCheckout(cartItems = []) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;

  const items = cartItems.map((item) => ({
    item_id: item.id || "",
    item_name: item.name || "",
    price: item.price || 0,
    quantity: item.quantity || 1,
  }));

  const value = cartItems.reduce(
    (sum, item) => sum + (item.price || 0) * (item.quantity || 1),
    0
  );

  window.gtag("event", "begin_checkout", {
    currency: "JPY",
    value,
    items,
  });
}

export function trackPurchase({
  transactionId,
  cartItems = [],
  shipping = 0,
  tax = 0,
}) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  if (!transactionId) return;

  const items = cartItems.map((item) => ({
    item_id: item.id || "",
    item_name: item.name || "",
    price: item.price || 0,
    quantity: item.quantity || 1,
  }));

  const itemValue = cartItems.reduce(
    (sum, item) => sum + (item.price || 0) * (item.quantity || 1),
    0
  );

  window.gtag("event", "purchase", {
    transaction_id: transactionId,
    currency: "JPY",
    value: itemValue + shipping + tax,
    shipping,
    tax,
    items,
  });
}