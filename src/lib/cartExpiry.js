// The cart is kept in this browser (localStorage) for 30 minutes after its last change: adding, removing or changing a
// quantity, or "extend". It is a convenience only: nothing is held in stock until payment is submitted on /checkout
// (the payment server reserves the bags then). On /checkout the cart is never emptied, however long the form takes;
// leaving it counts as a change. Pure helpers here; src/CartContext.jsx uses them, server/cart-expiry.test.js tests them.

export const ITEMS_KEY = "cart-items";
export const TOUCHED_KEY = "cart-touched-at";
export const CART_IDLE_MS = 30 * 60 * 1000;
export const WARN_BEFORE_MS = 5 * 60 * 1000;
// A clock moved back, or a value from another device's time: a "last change" in the future starts the 30 minutes now.
const FUTURE_TOLERANCE_MS = 60 * 1000;

// The last change as stored, or null when there is none or it cannot be trusted (then the 30 minutes start now).
export function touchedAtFrom(raw, now) {
  const at = Number(raw);
  if (raw === null || raw === undefined || raw === "" || !Number.isFinite(at) || at <= 0) return null;
  if (at > now + FUTURE_TOLERANCE_MS) return null;
  return at;
}

// What the cart's clock says now. `holding`: the customer is on /checkout (never emptied there).
export function cartClock({ touchedAt, now, holding = false, hasItems = true }) {
  if (!hasItems || touchedAt === null) return { expired: false, warn: false, remainingMs: CART_IDLE_MS, expiresAt: null };
  const expiresAt = touchedAt + CART_IDLE_MS;
  const remainingMs = Math.max(0, expiresAt - now);
  if (holding) return { expired: false, warn: false, remainingMs, expiresAt };
  return { expired: remainingMs === 0, warn: remainingMs > 0 && remainingMs <= WARN_BEFORE_MS, remainingMs, expiresAt };
}

// "4:59" for the countdown (minutes and seconds, rounded up so it never shows 0:00 before the cart is emptied).
export function countdownText(remainingMs) {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// The cart as stored, with what to do about it on opening the page (reload, new tab, coming back).
export function readStoredCart(storage, now, { holding = false } = {}) {
  let items = [];
  try {
    const saved = storage.getItem(ITEMS_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    items = Array.isArray(parsed) ? parsed : [];
  } catch {
    items = [];
  }
  let touchedAt = null;
  try { touchedAt = touchedAtFrom(storage.getItem(TOUCHED_KEY), now); } catch { touchedAt = null; }
  if (!items.length) return { items: [], touchedAt: null, expired: false, startClock: false };
  // A cart saved before this rule (or with an untrustworthy time): its 30 minutes start at this first visit.
  if (touchedAt === null) return { items, touchedAt: now, expired: false, startClock: true };
  const { expired } = cartClock({ touchedAt, now, holding });
  return expired ? { items: [], touchedAt: null, expired: true, startClock: false } : { items, touchedAt, expired: false, startClock: false };
}

export const CART_EXPIRY_TEXT = {
  ja: {
    warn: (t) => `カートはあと ${t} で空になります（最後の操作から30分）。`,
    extend: "カートを30分延長する",
    expired: "最後の操作から30分が過ぎたため、カートを空にしました。お手数ですが、もう一度商品をお選びください。",
    note: "カートの保存期限は在庫の確保ではありません。在庫はお支払いの手続きの際に確認します。",
    close: "閉じる",
  },
  en: {
    warn: (t) => `Your cart will be emptied in ${t} (30 minutes after your last change).`,
    extend: "Keep my cart 30 more minutes",
    expired: "Your cart was emptied because 30 minutes passed since your last change. Please choose your items again.",
    note: "Keeping the cart does not reserve stock; stock is checked when you pay.",
    close: "Close",
  },
  es: {
    warn: (t) => `Tu carrito se vaciará en ${t} (30 minutos después de tu último cambio).`,
    extend: "Mantener el carrito 30 minutos más",
    expired: "Vaciamos tu carrito porque pasaron 30 minutos desde tu último cambio. Vuelve a elegir tus productos, por favor.",
    note: "Guardar el carrito no reserva existencias; se comprueban al pagar.",
    close: "Cerrar",
  },
};
