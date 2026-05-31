/** gtag が利用可能か確認する */
function isGtagAvailable() {
  return typeof window !== "undefined" && typeof window.gtag === "function";
}

/** GA4 items 配列を共通フォーマットで生成 */
function toGa4Items(cartItems = []) {
  return cartItems.map((item) => ({
    item_id: item.id || "",
    item_name: item.name || item.title || "",
    item_category: item.category || "",
    price: item.price || 0,
    quantity: item.quantity || 1,
  }));
}

// ──────────────────────────────────────
// page_view
// ──────────────────────────────────────
export function pageview(path) {
  if (!isGtagAvailable()) return;
  window.gtag("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}

// ──────────────────────────────────────
// view_item  — 商品詳細を開いたとき
// ──────────────────────────────────────
export function trackViewItem(product) {
  if (!isGtagAvailable()) return;
  window.gtag("event", "view_item", {
    currency: "JPY",
    value: product.priceNumber ?? product.price ?? 0,
    items: [
      {
        item_id: product.id || "",
        item_name:
          typeof product.title === "object"
            ? product.title.ja || product.title.en || ""
            : product.name || product.title || "",
        item_category: product.category || "",
        price: product.priceNumber ?? product.price ?? 0,
        quantity: 1,
      },
    ],
  });
}

// ──────────────────────────────────────
// add_to_cart  — カートに追加したとき
// ──────────────────────────────────────
export function trackAddToCart(product, quantity = 1) {
  if (!isGtagAvailable()) return;
  window.gtag("event", "add_to_cart", {
    currency: "JPY",
    value: (product.price || product.priceNumber || 0) * quantity,
    items: [
      {
        item_id: product.id || "",
        item_name: product.name || product.title || "",
        item_category: product.category || "",
        price: product.price || product.priceNumber || 0,
        quantity,
      },
    ],
  });
}

// ──────────────────────────────────────
// view_cart  — カートを開いたとき
// ──────────────────────────────────────
export function trackViewCart(cartItems = [], cartTotal = 0) {
  if (!isGtagAvailable()) return;
  window.gtag("event", "view_cart", {
    currency: "JPY",
    value: cartTotal,
    items: toGa4Items(cartItems),
  });
}

// ──────────────────────────────────────
// begin_checkout  — チェックアウト開始
// ──────────────────────────────────────
export function trackBeginCheckout(cartItems = []) {
  if (!isGtagAvailable()) return;
  const value = cartItems.reduce(
    (sum, item) => sum + (item.price || 0) * (item.quantity || 1),
    0
  );
  window.gtag("event", "begin_checkout", {
    currency: "JPY",
    value,
    items: toGa4Items(cartItems),
  });
}

// ──────────────────────────────────────
// purchase  — 購入完了（金額・商品名含む）
// ──────────────────────────────────────
export function trackPurchase({ transactionId, cartItems = [], shipping = 0, tax = 0 }) {
  if (!isGtagAvailable()) return;
  if (!transactionId) return;

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
    items: toGa4Items(cartItems),
  });
}

// ──────────────────────────────────────
// view_promotion  — 送料無料まで〇円の表示
// ──────────────────────────────────────
export function trackFreeShippingPromotion(remaining, threshold) {
  if (!isGtagAvailable()) return;
  window.gtag("event", "view_promotion", {
    promotion_id: "free_shipping",
    promotion_name: `Free shipping from ¥${threshold}`,
    creative_name: `¥${remaining} to free shipping`,
  });
}
