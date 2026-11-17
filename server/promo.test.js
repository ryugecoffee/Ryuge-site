"use strict";

// 2026-11-17: promotional beans, at most 2 bags per customer across orders.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { normalizeEmail, normalizeAddress, promoKeys } = require("./promo");
const { reserve, attachPaymentIntent, finish, releaseWithoutPayment } = require("./inventory");
const { quoteOrder, PROMO_MAX_BAGS } = require("./quote");

function fakeFirestore(initial = {}) {
  const store = new Map(Object.entries(initial));
  const snapshot = (key) => ({ exists: store.has(key), data: () => store.get(key) });
  const db = {
    store,
    collection(name) { return { doc(id) { return { key: `${name}/${id}`, get: async () => snapshot(`${name}/${id}`) }; } }; },
    async runTransaction(callback) {
      const writes = [];
      const tx = {
        get: async (ref) => snapshot(ref.key),
        update(ref, patch) { writes.push(() => store.set(ref.key, { ...store.get(ref.key), ...patch })); },
        create(ref, value) { writes.push(() => { if (store.has(ref.key)) throw new Error("ALREADY_EXISTS"); store.set(ref.key, value); }); },
      };
      const result = await callback(tx);
      writes.forEach((write) => write());
      return result;
    },
  };
  return db;
}
const stock = () => ({ "inventory/enma-zen-dark-roast": { ready: 15, held: 0, sold: 0 } });
const claim = (who) => ({ keys: promoKeys(who), quantity: 0, limit: PROMO_MAX_BAGS });
const hanako = { email: "Hanako.Yamada+coffee@gmail.com", countryCode: "JP", postalCode: "248-0006", address: "神奈川県 鎌倉市小町1-1" };

test("one customer is recognised however the e-mail or address is written", () => {
  assert.equal(normalizeEmail("Hanako.Yamada+coffee@Gmail.com"), "hanakoyamada@gmail.com");
  assert.equal(normalizeEmail("hanakoyamada@googlemail.com"), "hanakoyamada@gmail.com");
  assert.equal(normalizeEmail("a.b+x@example.co.jp"), "a.b@example.co.jp");
  assert.equal(normalizeEmail("not-an-email"), "");
  assert.equal(normalizeAddress("JP", "２４８ー０００６", "神奈川県　鎌倉市小町１－１"), normalizeAddress("jp", "2480006", "神奈川県鎌倉市小町1-1"));
  assert.deepEqual(promoKeys(hanako), promoKeys({ ...hanako, email: "hanakoyamada@gmail.com", address: "神奈川県鎌倉市小町１ー１" }));
  assert.equal(promoKeys({ email: "", postalCode: "", address: "" }).length, 0);
  for (const key of promoKeys(hanako)) assert.match(key, /^[a-f0-9]{64}$/, "only hashes are stored");
});

test("2 promotional bags per customer across orders: a second order, a new e-mail to the same home, all refused", async () => {
  const db = fakeFirestore(stock());
  const first = await reserve(db, [{ id: "enma-zen-dark-roast", quantity: 2 }], null, { ...claim(hanako), quantity: 2 });
  await assert.rejects(reserve(db, [{ id: "enma-zen-dark-roast", quantity: 1 }], null, { ...claim(hanako), quantity: 1 }), /PROMO_CUSTOMER_LIMIT/);
  await assert.rejects(reserve(db, [{ id: "enma-zen-dark-roast", quantity: 1 }], null,
    { ...claim({ ...hanako, email: "other@example.com" }), quantity: 1 }), /PROMO_CUSTOMER_LIMIT/, "same delivery address");
  await assert.rejects(reserve(db, [{ id: "enma-zen-dark-roast", quantity: 1 }], null,
    { ...claim({ ...hanako, address: "東京都千代田区1-1", postalCode: "100-0001" }), quantity: 1 }), /PROMO_CUSTOMER_LIMIT/, "same e-mail");
  // Paid: the 2 bags stay counted as bought; a Stripe resend does not count them twice.
  await attachPaymentIntent(db, first, "pi_promo_1");
  await finish(db, first, "pi_promo_1", "paid");
  assert.equal(await finish(db, first, "pi_promo_1", "paid"), false);
  const ledgers = [...db.store.entries()].filter(([key]) => key.startsWith("promoLedger/")).map(([, value]) => value);
  assert.equal(ledgers.length, 2);
  for (const ledger of ledgers) assert.deepEqual([ledger.held, ledger.bought], [0, 2]);
  await assert.rejects(reserve(db, [{ id: "enma-zen-dark-roast", quantity: 1 }], null, { ...claim(hanako), quantity: 1 }), /PROMO_CUSTOMER_LIMIT/);
});

test("a canceled or abandoned checkout gives the promotional bags back", async () => {
  const db = fakeFirestore(stock());
  const first = await reserve(db, [{ id: "enma-zen-dark-roast", quantity: 2 }], null, { ...claim(hanako), quantity: 2 });
  await attachPaymentIntent(db, first, "pi_promo_2");
  await finish(db, first, "pi_promo_2", "released");
  const again = await reserve(db, [{ id: "enma-zen-dark-roast", quantity: 2 }], null, { ...claim(hanako), quantity: 2 });
  assert.ok(again);
  assert.equal(db.store.get("inventory/enma-zen-dark-roast").held, 2);
});

test("one order cannot carry more than 2 promotional bags; capped products need inventory on", () => {
  assert.throws(() => quoteOrder([{ id: "enma-zen-dark-roast", quantity: 3 }], { prefecture: "東京都" }), /PROMO_LIMIT/);
  assert.equal(quoteOrder([{ id: "enma-zen-dark-roast", quantity: 2 }], { prefecture: "東京都" }).total, 2000 + 250);
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const route = source.slice(source.indexOf('app.post("/create-payment-intent"'), source.indexOf('app.post("/calc-shipping"'));
  assert.match(route, /if \(!INVENTORY_ENABLED && quote\.items\.some\(\(item\) => item\.requiresInventory\)\) \{\n\s+return res\.status\(400\)\.json\(\{ error: "PRODUCT_NOT_AVAILABLE" \}\);/);
  assert.match(route, /if \(!keys\.length\) return res\.status\(400\)\.json\(\{ error: "EMAIL_REQUIRED" \}\);/);
  assert.match(route, /promo = \{ keys, quantity: promoQuantity, limit: PROMO_MAX_BAGS \};/);
});

test("a checkout whose payment could not be created gives the stock and promotional bags back at once", async () => {
  const db = fakeFirestore(stock());
  const failed = await reserve(db, [{ id: "enma-zen-dark-roast", quantity: 2 }], null, { ...claim(hanako), quantity: 2 });
  assert.equal(await releaseWithoutPayment(db, failed), true);
  assert.equal(db.store.get("inventory/enma-zen-dark-roast").held, 0);
  for (const [key, value] of db.store) if (key.startsWith("promoLedger/")) assert.equal(value.held, 0);
  assert.ok(await reserve(db, [{ id: "enma-zen-dark-roast", quantity: 2 }], null, { ...claim(hanako), quantity: 2 }), "the customer can try again");
  // A reservation with a PaymentIntent is never released this way (the customer may be paying it).
  const paying = await reserve(db, [{ id: "enma-zen-dark-roast", quantity: 1 }]);
  await attachPaymentIntent(db, paying, "pi_paying");
  assert.equal(await releaseWithoutPayment(db, paying), false);
});
