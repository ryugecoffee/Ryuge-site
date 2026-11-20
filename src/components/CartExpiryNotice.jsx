import { useEffect, useState } from "react";
import { useCart } from "../CartContext";
import { CART_EXPIRY_TEXT, cartClock, countdownText } from "../lib/cartExpiry";

// A quiet notice in the corner: from 5 minutes before the cart is emptied (with the time left and "keep 30 more
// minutes"), and once after it was emptied (why). Shown once per cycle: closing it keeps it closed until the cart
// changes again. Never on /checkout. The cart's 30 minutes are not a stock reservation (said in both notices).
export default function CartExpiryNotice({ lang = "ja" }) {
  const { cartItems, cartTouchedAt, cartHolding, extendCart, cartExpiredNotice, dismissCartExpiredNotice } = useCart();
  const t = CART_EXPIRY_TEXT[lang] || CART_EXPIRY_TEXT.ja;
  const [now, setNow] = useState(() => Date.now());
  const [closedFor, setClosedFor] = useState(null);
  const active = cartItems.length > 0 && Boolean(cartTouchedAt) && !cartHolding;

  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);

  if (cartHolding) return null;
  if (cartExpiredNotice && cartItems.length === 0) {
    return (
      <div className="cart-expiry-notice" role="status">
        <p className="cart-expiry-text">{t.expired}</p>
        <p className="cart-expiry-note">{t.note}</p>
        <div className="cart-expiry-actions">
          <button type="button" className="cart-expiry-close" onClick={dismissCartExpiredNotice}>{t.close}</button>
        </div>
      </div>
    );
  }
  if (!active || closedFor === cartTouchedAt) return null;
  const clock = cartClock({ touchedAt: cartTouchedAt, now: Math.max(now, cartTouchedAt), hasItems: true });
  if (!clock.warn) return null;
  return (
    <div className="cart-expiry-notice" role="region" aria-label={t.extend}>
      <p className="cart-expiry-text">{t.warn(countdownText(clock.remainingMs))}</p>
      <p className="cart-expiry-note">{t.note}</p>
      <div className="cart-expiry-actions">
        <button type="button" className="cart-expiry-extend" onClick={extendCart}>{t.extend}</button>
        <button type="button" className="cart-expiry-close" onClick={() => setClosedFor(cartTouchedAt)}>{t.close}</button>
      </div>
    </div>
  );
}

