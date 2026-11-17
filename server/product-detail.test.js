"use strict";

// 2026-11-17: product details read naturally in each language (the Japanese site showed Origin, Process, Flavor Notes…).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const load = () => import(path.join(__dirname, "..", "src", "productData.js"));
const LANGS = ["ja", "en", "es"];
const DETAIL_FIELDS = ["origin", "producer", "altitude", "variety", "process", "drying", "grade", "harvest", "arrival"];

test("Japanese labels as the CEO specified; every label exists in every language", async () => {
  const { PRODUCT_SECTIONS, DETAIL_TEXT } = await load();
  assert.deepEqual(
    Object.fromEntries(["origin", "producer", "process", "variety", "grade", "altitude", "harvest", "weight", "price", "flavor"].map((k) => [k, PRODUCT_SECTIONS.ja.specLabels[k]])),
    { origin: "生産地", producer: "生産者", process: "精製方法", variety: "品種", grade: "等級", altitude: "標高", harvest: "収穫時期", weight: "内容量", price: "価格", flavor: "風味" },
  );
  for (const lang of LANGS) {
    for (const key of [...DETAIL_FIELDS, "roast"]) assert.ok(PRODUCT_SECTIONS[lang].specLabels[key], `${lang} label ${key}`);
    for (const key of Object.keys(DETAIL_TEXT.ja)) assert.ok(DETAIL_TEXT[lang][key], `${lang} text ${key}`);
  }
  for (const value of Object.values(PRODUCT_SECTIONS.ja.specLabels)) assert.doesNotMatch(value, /[A-Za-z]/, `Japanese label ${value}`);
});

test("every coffee, tea and bag on sale has its name, description and details in each language", async () => {
  const { PRODUCT_DATA, loc } = await load();
  const products = [...PRODUCT_DATA.enma, ...PRODUCT_DATA.woodbox.filter((p) => !p.archived), ...PRODUCT_DATA.bag];
  for (const product of products) {
    for (const lang of LANGS) {
      assert.ok(loc(product.title, lang), `${product.id} title ${lang}`);
      assert.ok(loc(product.summary, lang), `${product.id} summary ${lang}`);
      assert.ok(loc(product.weight, lang), `${product.id} weight ${lang}`);
      for (const field of DETAIL_FIELDS) {
        if (product[field] === undefined) continue;
        assert.equal(typeof product[field], "object", `${product.id}.${field} is translated`);
        assert.ok(loc(product[field], lang), `${product.id}.${field} ${lang}`);
      }
    }
    // Japanese values: no English words, except grades and variety codes kept as written (G1, SHB, NY2/3, 74158).
    for (const field of ["origin", "producer", "process", "variety", "drying", "arrival", "harvest"]) {
      if (product[field]) assert.doesNotMatch(loc(product[field], "ja"), /[A-Za-z]{3,}/, `${product.id}.${field} in Japanese`);
    }
    if (product.flavorNotes) for (const note of product.flavorNotes.ja) assert.doesNotMatch(note, /[A-Za-z]/, `${product.id} flavour ${note}`);
  }
});

test("the CEO's example translations, and roasts on the 4-step scale", async () => {
  const { PRODUCT_DATA, ROAST_LEVEL, loc } = await load();
  const byId = Object.fromEntries(PRODUCT_DATA.enma.map((p) => [p.id, p]));
  assert.deepEqual(byId["enma-karamo"].flavorNotes.ja, ["赤ぶどう", "白桃", "ダークチェリー"]);
  assert.equal(loc(byId["enma-karamo"].process, "ja"), "ナチュラル");
  assert.equal(loc(byId["enma-jimma"].process, "ja"), "ウォッシュド");
  assert.equal(loc(byId["enma-jimma"].process, "es"), "Lavado");
  for (const product of PRODUCT_DATA.enma) assert.ok(product.roast.en in ROAST_LEVEL, `${product.id} roast ${product.roast.en}`);
  // Made-to-order beans say so; they are never presented as shipping at once.
  for (const product of PRODUCT_DATA.enma.filter((p) => p.requiresInventory)) {
    assert.match(loc(product.notice, "ja"), /ご注文後に焙煎/, product.id);
  }
});

test("the product panel takes labels from the language, never hard-coded English", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "src", "pages", "ProductsPage.jsx"), "utf8");
  for (const english of ['"Origin"', '"Producer"', '"Process"', '"Variety"', '"Grade"', '"Altitude"', '"Harvest"', '"Weight"', '"Price"', '"Flavor Notes"', '"Drying"', '"Arrival"']) {
    assert.ok(!page.includes(english), `ProductsPage.jsx still has ${english}`);
  }
  assert.doesNotMatch(page, /flavorNotes\?\.en\?\.join/, "flavour notes follow the page language");
});
