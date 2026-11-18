"use strict";

// 2026-11-18: tea cards in two columns (like the coffee cards), 折々 three across with the subscription larger,
// and the promotional badge reworded "季節のおすすめ" while the 2-bag limit stays (shown in the detail; enforced by
// the server as before).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(root, ...p), "utf8");
const data = () => import(path.join(root, "src", "productData.js"));

test("the badge reads as a seasonal pick; the 2-bag limit is stated in the detail in every language", async () => {
  const { PRODUCT_DATA, DETAIL_TEXT } = await data();
  const zen = PRODUCT_DATA.enma.find((p) => p.id === "enma-zen-dark-roast");
  assert.deepEqual(zen.promotion.label, { ja: "季節のおすすめ", en: "Seasonal pick", es: "Selección de temporada" });
  assert.equal(zen.promo, true, "still limited");
  assert.equal(DETAIL_TEXT.ja.promoNote, "この豆は、お一人様2袋までのご購入となります（これまでのご注文を含みます）。");
  for (const lang of ["en", "es"]) assert.match(DETAIL_TEXT[lang].promoNote, /2/, lang);
  assert.doesNotMatch(read("src", "productData.js"), /プロモ・お一人様|Promo · max|Promo · máx|プロモーション豆/);
  assert.doesNotMatch(read("src", "lib", "shippingPolicy.js"), /プロモーション豆|Promotional beans|granos promocionales/i);
  // The limit itself is unchanged: 2 bags in the cart, the product page and on the server.
  assert.match(read("src", "CartContext.jsx"), /const PROMO_MAX_BAGS = 2;/);
  assert.match(read("src", "pages", "ProductsPage.jsx"), /const PROMO_MAX_BAGS = 2;/);
  assert.match(read("src", "pages", "ProductsPage.jsx"), /\{activeItem\.promo && stockStatus\(activeItem\) !== "comingSoon" && \(\s*<p className="product-detail-promo-note">/);
  const { CATALOG } = require("./catalog");
  assert.equal(CATALOG["enma-zen-dark-roast"].promo, true);
});

test("tea: two columns on PC and phone, photo then information; coffee cards untouched", () => {
  const css = read("src", "App.css");
  const tea = css.slice(css.indexOf("2026-11-18 — Tea (木函) cards"), css.indexOf("2026-11-18 — 折々"));
  assert.match(tea, /\.products-woodbox-grid \{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(tea, /aspect-ratio: 4 \/ 5;/, "same photo ratio as the coffee cards");
  assert.match(tea, /-webkit-line-clamp: 3;/, "long descriptions are shortened on a phone");
  assert.doesNotMatch(tea, /\.products-enma|\.enma-/, "no coffee card rule in the tea block");
  const page = read("src", "pages", "ProductsPage.jsx");
  assert.match(page, /className="products-enma-static-card enma-product-card"/);
});

test("折々: three across and centred; the subscription is the featured, larger card; short paused badge", async () => {
  const css = read("src", "App.css");
  const oriori = css.slice(css.indexOf("2026-11-18 — 折々"), css.indexOf("2026-11-18 — 珈琲の定期便 (detail)"));
  assert.match(oriori, /flex-wrap: nowrap;\s*justify-content: center;/);
  assert.match(oriori, /\.oriori-service-card\.is-featured \{\s*flex-basis: 340px;/);
  assert.match(oriori, /\.oriori-service-card\.is-featured \{ flex: 1\.55 1 0; \}/);
  assert.match(oriori, /\.oriori-services-grid \.oriori-service-summary,/);
  const page = read("src", "pages", "ProductsPage.jsx");
  assert.match(page, /className=\{`oriori-service-card \$\{item\.subscription \? "is-featured" : ""\}`\}/);
  assert.match(page, /\{loc\(SUBSCRIPTIONS_PAUSED_SHORT_TEXT, lang\)\}/);
  const { PRODUCT_DATA, SUBSCRIPTIONS_PAUSED_SHORT_TEXT } = await data();
  assert.deepEqual(PRODUCT_DATA.oriori.map((p) => p.id), ["enma-cookie", "oriori-subscription", "oriori-apps"], "the subscription sits in the middle");
  assert.equal(SUBSCRIPTIONS_PAUSED_SHORT_TEXT.ja, "受付休止中");
});
