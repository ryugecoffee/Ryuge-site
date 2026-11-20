"use strict";

// 2026-11-20 (CEO): the cart is emptied 30 minutes after its last change; never on /checkout; a notice from 5 minutes
// before; carts saved before the rule start their 30 minutes at the first visit (src/lib/cartExpiry.js).
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const load = () => import(pathToFileURL(path.join(__dirname, "..", "src", "lib", "cartExpiry.js")).href);
const MIN = 60 * 1000;
const T0 = Date.UTC(2026, 10, 20, 3);
const storage = (values) => ({ getItem: (k) => (k in values ? values[k] : null) });
const items = JSON.stringify([{ id: "enma-jimma", quantity: 1, price: 1500 }]);

test("the 30-minute boundary: kept at 29:59, emptied at 30:00; the notice from 5:00 left", async () => {
  const c = await load();
  assert.equal(c.CART_IDLE_MS, 30 * MIN);
  const at = (ms) => c.cartClock({ touchedAt: T0, now: T0 + ms });
  assert.deepEqual([at(30 * MIN - 1000).expired, at(30 * MIN).expired, at(31 * MIN).expired], [false, true, true]);
  assert.deepEqual([at(25 * MIN - 1000).warn, at(25 * MIN).warn, at(29 * MIN).warn, at(30 * MIN).warn], [false, true, true, false]);
  assert.equal(at(25 * MIN).remainingMs, 5 * MIN);
  assert.deepEqual([c.countdownText(5 * MIN), c.countdownText(4 * MIN + 59500), c.countdownText(1), c.countdownText(0)], ["5:00", "5:00", "0:01", "0:00"]);
});

test("on /checkout the cart is never emptied and no notice is shown, however long it takes", async () => {
  const c = await load();
  const clock = c.cartClock({ touchedAt: T0, now: T0 + 120 * MIN, holding: true });
  assert.deepEqual([clock.expired, clock.warn], [false, false]);
  const stored = storage({ [c.ITEMS_KEY]: items, [c.TOUCHED_KEY]: String(T0) });
  assert.equal(c.readStoredCart(stored, T0 + 120 * MIN, { holding: true }).items.length, 1, "reloading /checkout keeps the cart");
  assert.equal(c.readStoredCart(stored, T0 + 120 * MIN).expired, true, "anywhere else, the same cart is emptied");
});

test("opening the page (reload, new tab, coming back): an old cart is emptied; a cart saved before the rule starts its 30 minutes now", async () => {
  const c = await load();
  const fresh = c.readStoredCart(storage({ [c.ITEMS_KEY]: items, [c.TOUCHED_KEY]: String(T0) }), T0 + 10 * MIN);
  assert.deepEqual([fresh.items.length, fresh.touchedAt, fresh.expired], [1, T0, false]);
  const old = c.readStoredCart(storage({ [c.ITEMS_KEY]: items, [c.TOUCHED_KEY]: String(T0) }), T0 + 31 * MIN);
  assert.deepEqual([old.items, old.expired], [[], true]);
  const legacy = c.readStoredCart(storage({ [c.ITEMS_KEY]: items }), T0);
  assert.deepEqual([legacy.items.length, legacy.touchedAt, legacy.startClock, legacy.expired], [1, T0, true, false]);
  // A broken or future time (a clock moved back) is not trusted: the 30 minutes start now, nothing is lost.
  for (const bad of ["abc", "-5", "0", String(T0 + 10 * MIN)]) {
    const r = c.readStoredCart(storage({ [c.ITEMS_KEY]: items, [c.TOUCHED_KEY]: bad }), T0);
    assert.deepEqual([r.items.length, r.touchedAt, r.expired], [1, T0, false], bad);
  }
  // An empty or unreadable cart has no clock.
  assert.deepEqual(c.readStoredCart(storage({ [c.ITEMS_KEY]: "[]", [c.TOUCHED_KEY]: String(T0) }), T0 + 31 * MIN), { items: [], touchedAt: null, expired: false, startClock: false });
  assert.deepEqual(c.readStoredCart(storage({ [c.ITEMS_KEY]: "{oops" }), T0).items, []);
  assert.deepEqual(c.readStoredCart({ getItem: () => { throw new Error("blocked"); } }, T0).items, []);
});

test("the customer is told, in every language, that keeping the cart is not a stock reservation", async () => {
  const c = await load();
  for (const lang of ["ja", "en", "es"]) {
    const t = c.CART_EXPIRY_TEXT[lang];
    assert.ok(t.warn("4:59").includes("4:59") && t.extend && t.expired && t.close, lang);
    assert.match(t.note, /在庫の確保ではありません|does not reserve stock|no reserva existencias/, lang);
  }
  assert.match(c.CART_EXPIRY_TEXT.ja.extend, /30分延長/);
});

test("the cart keeps its existing shape and the payment's own clearing (after a successful payment) is unchanged", () => {
  const fs = require("node:fs");
  const read = (...p) => fs.readFileSync(path.join(__dirname, "..", ...p), "utf8");
  const ctx = read("src", "CartContext.jsx");
  assert.match(ctx, /const ITEMS_KEY = "cart-items"|ITEMS_KEY/);
  assert.match(read("src", "lib", "cartExpiry.js"), /export const ITEMS_KEY = "cart-items";/, "the same storage key as before");
  assert.match(read("src", "pages", "CheckoutPage.jsx"), /<CheckoutForm cartItems=\{cartItems\} onSuccess=\{clearCart\}/, "cleared after payment, as before");
  assert.match(ctx, /pathname === "\/checkout"/, "held on the checkout page");
});
