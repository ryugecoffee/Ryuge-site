import { PRODUCT_DATA } from "../productData";

/** gtag が利用可能か確認する */
function isGtagAvailable() {
  return typeof window !== "undefined" && typeof window.gtag === "function";
}

// GA4 の商品名は表示言語によらず、商品データの日本語名にそろえる（言語ごとに別商品として集計されないように）。
let namesById = null;
function itemName(id, fallback) {
  if (!namesById) {
    namesById = new Map();
    for (const list of Object.values(PRODUCT_DATA)) {
      if (!Array.isArray(list)) continue;
      for (const p of list) if (p?.id) namesById.set(p.id, typeof p.title === "object" ? p.title.ja || p.title.en || "" : p.title || "");
    }
  }
  return namesById.get(id) || (typeof fallback === "object" ? fallback?.ja || fallback?.en || "" : fallback || "");
}

/** GA4 items 配列を共通フォーマットで生成 */
function toGa4Items(cartItems = []) {
  return cartItems.map((item) => ({
    item_id: item.id || "",
    item_name: itemName(item.id, item.name || item.title),
    item_category: item.category || "",
    price: item.price || 0,
    quantity: item.quantity || 1,
  }));
}

const cartValue = (cartItems = []) => cartItems.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);
// 同じカートの内容で1回だけ送る（再読み込み・決済の再試行で二重に数えない）。
const cartKey = (cartItems = []) => cartItems.map((i) => `${i.id}x${i.quantity || 1}`).sort().join(",");
function once(key) {
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
  } catch { /* private mode: send */ }
  return true;
}

// ──────────────────────────────────────
// page_view
// ──────────────────────────────────────
// 決済・ログイン用の値は GA4 に送らない（URL の # 以降も送らない）。
const PRIVATE_PARAMS = ["session_id", "payment_intent", "payment_intent_client_secret", "redirect_status", "login", "token"];
function cleanPath(path) {
  const [pathname, query = ""] = String(path || "/").split("?");
  const params = new URLSearchParams(query);
  for (const key of PRIVATE_PARAMS) params.delete(key);
  const rest = params.toString();
  return rest ? `${pathname}?${rest}` : pathname;
}

export function pageview(path) {
  if (!isGtagAvailable()) return;
  const clean = cleanPath(path);
  window.gtag("event", "page_view", {
    page_path: clean,
    page_location: window.location.origin + clean,
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
        item_name: itemName(product.id, product.title || product.name),
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
        item_name: itemName(product.id, product.name || product.title),
        item_category: product.category || "",
        price: product.price || product.priceNumber || 0,
        quantity,
      },
    ],
  });
}

// ──────────────────────────────────────
// remove_from_cart  — カートから減らした・削除したとき
// ──────────────────────────────────────
export function trackRemoveFromCart(product, quantity = 1) {
  if (!isGtagAvailable() || !(quantity > 0)) return;
  const price = product.price ?? product.priceNumber ?? 0;
  window.gtag("event", "remove_from_cart", {
    currency: "JPY",
    value: price * quantity,
    items: [{ item_id: product.id || "", item_name: itemName(product.id, product.name || product.title), item_category: product.category || "", price, quantity }],
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
// begin_checkout  — チェックアウト画面を開いたとき（同じカートで1回）
// ──────────────────────────────────────
export function trackBeginCheckout(cartItems = []) {
  if (!isGtagAvailable() || !cartItems.length || !once(`ga_begin_checkout_${cartKey(cartItems)}`)) return;
  window.gtag("event", "begin_checkout", {
    currency: "JPY",
    value: cartValue(cartItems),
    items: toGa4Items(cartItems),
  });
}

// ──────────────────────────────────────
// add_shipping_info  — お届け先が決まり、送料が出たとき（同じカート・配送方法で1回）
// ──────────────────────────────────────
export function trackAddShippingInfo(cartItems = [], value, shippingTier = "") {
  if (!isGtagAvailable() || !cartItems.length || !once(`ga_shipping_${cartKey(cartItems)}_${shippingTier}`)) return;
  window.gtag("event", "add_shipping_info", {
    currency: "JPY",
    value: value ?? cartValue(cartItems),
    shipping_tier: shippingTier,
    items: toGa4Items(cartItems),
  });
}

// ──────────────────────────────────────
// add_payment_info  — 支払いボタンを押したとき（同じカートで1回）
// ──────────────────────────────────────
export function trackAddPaymentInfo(cartItems = [], value) {
  if (!isGtagAvailable() || !cartItems.length || !once(`ga_payment_${cartKey(cartItems)}`)) return;
  window.gtag("event", "add_payment_info", {
    currency: "JPY",
    value: value ?? cartValue(cartItems),
    payment_type: "card",
    items: toGa4Items(cartItems),
  });
}

// ──────────────────────────────────────
// purchase  — 購入完了（金額・商品名含む）
// ──────────────────────────────────────
// value は決済サーバーが決めた実際の請求額（クーポン・送料を含む）。同じ注文は別タブ・再読み込みでも1回だけ送る。
export function trackPurchase({ transactionId, cartItems = [], shipping = 0, tax = 0, value }) {
  if (!isGtagAvailable()) return false;
  if (!transactionId) return false;
  const key = `ga_purchase_${transactionId}`;
  try {
    if (localStorage.getItem(key) || sessionStorage.getItem(key)) return false;
  } catch { /* storage unavailable: GA4 still keeps one purchase per transaction_id */ }

  window.gtag("event", "purchase", {
    transaction_id: transactionId,
    currency: "JPY",
    value: Number.isFinite(value) ? value : cartValue(cartItems) + shipping + tax,
    shipping,
    tax,
    items: toGa4Items(cartItems),
  });
  try { localStorage.setItem(key, "1"); sessionStorage.setItem(key, "1"); } catch { /* ignore */ }
  return true;
}

// ──────────────────────────────────────
// purchase（珈琲の定期便）— Stripe の申し込み完了から戻ったとき。取引IDは Checkout Session の ID で、同じ申し込みは1回だけ。
// 金額は申し込み時の初回のお支払い（月額は毎月サーバー側で請求され、サイトの訪問とは結び付かないため送らない）。
// ──────────────────────────────────────
export function trackSubscriptionStart(sessionId, firstPrice) {
  if (!/^cs_(live|test)_[A-Za-z0-9]{8,200}$/.test(String(sessionId || "")) || !(firstPrice > 0)) return false;
  return trackPurchase({
    transactionId: sessionId,
    cartItems: [{ id: "coffee-subscription-first", name: "珈琲の定期便（初回）", category: "subscription", price: firstPrice, quantity: 1 }],
    shipping: 0,
    value: firstPrice,
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
