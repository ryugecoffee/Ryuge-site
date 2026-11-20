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
  for (const product of PRODUCT_DATA.enma.filter((p) => p.category === "beans")) assert.ok(product.roast.en in ROAST_LEVEL, `${product.id} roast ${product.roast.en}`);
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

test("the coffee bag is listed with the Enma beans; the hojicha bag is hidden but kept", async () => {
  const { PRODUCT_DATA } = await load();
  const enmaIds = PRODUCT_DATA.enma.map((p) => p.id);
  assert.ok(enmaIds.includes("enma-coffee-bag"));
  assert.ok(!PRODUCT_DATA.bag.some((p) => p.id === "enma-coffee-bag"), "listed once");
  const teaBag = PRODUCT_DATA.bag.find((p) => p.id === "woodbox-tea-bag");
  assert.ok(teaBag, "the hojicha bag data is kept");
  assert.equal(teaBag.hidden, true);
  assert.equal(teaBag.priceNumber, 2800);
  assert.equal(PRODUCT_DATA.bag.filter((p) => !p.hidden).length, 0, "no bag series left to show");
  const page = fs.readFileSync(path.join(__dirname, "..", "src", "pages", "ProductsPage.jsx"), "utf8");
  assert.match(page, /const listedBags = \(products\.bag \|\| \[\]\)\.filter\(\(item\) => !item\.hidden\);/);
  assert.match(page, /\[\.\.\.listedBags, \.\.\.products\.oriori\]\.map/);
  const concierge = fs.readFileSync(path.join(__dirname, "..", "api", "coffee-concierge.js"), "utf8");
  assert.match(concierge, /\(PRODUCT_DATA\.bag \|\| \[\]\)\.filter\(\(p\) => !p\.hidden\)/, "the concierge does not offer it");
});

test("Zen dark roast: notes shown as the roasting direction, not as a cupping result; teas on sale, capped by inventory", async () => {
  const { PRODUCT_DATA, DETAIL_TEXT, loc } = await load();
  const zen = PRODUCT_DATA.enma.find((p) => p.id === "enma-zen-dark-roast");
  assert.deepEqual(zen.flavorNotes.ja, ["ナッツ", "ハチミツ", "チョコレート"]);
  assert.equal(zen.flavorBasis, "direction");
  assert.match(loc(zen.summary, "ja"), /目指して/);
  for (const lang of LANGS) assert.ok(DETAIL_TEXT[lang].flavorDirection);
  for (const id of ["mokkan-oku-yame-hojicha", "mokkan-oku-yame-genmaicha"]) {
    const tea = PRODUCT_DATA.woodbox.find((p) => p.id === id);
    assert.equal(tea.comingSoon, false, `${id} on sale (CEO 2026-11-20), capped by inventory`);
    for (const lang of LANGS) assert.ok(loc(tea.ingredients, lang) && loc(tea.origin, lang), `${id} ${lang}`);
  }
  assert.match(loc(PRODUCT_DATA.woodbox.find((p) => p.id === "mokkan-oku-yame-hojicha").summary, "ja"), /一番茶.*浅く焙じた/);
  assert.match(loc(PRODUCT_DATA.woodbox.find((p) => p.id === "mokkan-oku-yame-genmaicha").summary, "ja"), /煎茶に、抹茶と炒り玄米/);
});

test("Mokkan teas: ingredients, variety, flavour, brewing and the farm as the CEO gave them; nothing unconfirmed", async () => {
  const { PRODUCT_DATA, DETAIL_TEXT, loc } = await load();
  const tea = (id) => PRODUCT_DATA.woodbox.find((p) => p.id === id);
  const genmai = tea("mokkan-oku-yame-genmaicha");
  const hoji = tea("mokkan-oku-yame-hojicha");
  assert.equal(loc(genmai.ingredients, "ja"), "煎茶・抹茶・炒り玄米");
  assert.equal(loc(hoji.ingredients, "ja"), "ほうじ茶");
  for (const t of [genmai, hoji]) {
    assert.equal(loc(t.variety, "ja"), "やぶきた");
    assert.equal(loc(t.origin, "ja"), "福岡県八女市");
    assert.equal(t.producer, undefined, "the farm is not named until it is confirmed (CEO)");
    assert.equal(t.farm, undefined);
    assert.equal(t.flavorBasis, "tea");
    assert.equal(t.comingSoon, false);
    for (const lang of LANGS) {
      const text = JSON.stringify(t);
      assert.doesNotMatch(text, /原島|Harashima|矢部|Yabe|1930|創業|founded|fundad|RAVE|有機|organic|orgánic|JAS|受賞|award|premio|認証|certif/i, `${t.id} ${lang}: unconfirmed claims`);
    }
  }
  const brew = (t, lang) => {
    const d = DETAIL_TEXT[lang];
    const { hot, cold } = t.brewing;
    return [d.hotAmounts(d.range(hot.leafG), hot.waterMl, d.range(hot.tempC)), d.steeps(hot.steepsSec),
      d.coldAmounts(d.range(cold.leafG), cold.waterL), d.coldTime(d.range(cold.hours))];
  };
  assert.deepEqual(brew(genmai, "ja"), ["茶葉 3〜5g・お湯 200ml（70〜80℃）", "1煎目 40秒・2煎目 10秒・3煎目 60秒", "茶葉 15g・水 1L", "冷蔵庫で3〜4時間"]);
  assert.deepEqual(brew(hoji, "ja"), ["茶葉 3〜5g・お湯 200ml（80℃）", "1煎目 30秒・2煎目 10秒・3煎目 60秒", "茶葉 10g・水 1L", "冷蔵庫で4〜8時間"]);
  assert.deepEqual(brew(hoji, "en"), ["3–5 g of tea, 200 ml of water at 80 °C", "1st infusion 30 s · 2nd infusion 10 s · 3rd infusion 60 s", "10 g of tea, 1 L of water", "4–8 hours in the fridge"]);
  assert.equal(brew(genmai, "es")[0], "3–5 g de té, 200 ml de agua a 70–80 °C");
});

test("木函のお茶: the CEO's own photos (IMG_5479 玄米茶, IMG_5480 ほうじ茶), with no location or camera data in the files", async () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const { PRODUCT_DATA } = await load();
  const image = (id) => PRODUCT_DATA.woodbox.find((p) => p.id === id).image;
  assert.equal(image("mokkan-oku-yame-genmaicha"), "/images/mokkan-oku-yame-genmaicha.jpg");
  assert.equal(image("mokkan-oku-yame-hojicha"), "/images/mokkan-oku-yame-hojicha.jpg");
  for (const id of ["mokkan-oku-yame-genmaicha", "mokkan-oku-yame-hojicha"]) {
    const file = fs.readFileSync(path.join(__dirname, "..", "public", "images", `${id}.jpg`));
    assert.deepEqual([file[0], file[1]], [0xff, 0xd8], `${id}: a JPEG`);
    assert.equal(file.indexOf(Buffer.from("Exif\0\0")), -1, `${id}: no EXIF block (no GPS position, no camera data)`);
  }
});
