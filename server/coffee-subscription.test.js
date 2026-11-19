"use strict";

// 2026-11-18: 珈琲の定期便 (CEO): one subscription, 1–4 deliveries a month, two coffees of 100 g each per delivery,
// a free-text coffee preference. Display and data only: sign-ups stay paused and nothing here starts one.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(root, ...p), "utf8");
const data = () => import(path.join(root, "src", "productData.js"));
const pref = () => import(path.join(root, "src", "lib", "subscriptionPreference.js"));

test("the CEO's prices and amounts: 1–4 deliveries, 200 g each, tax and shipping included, one price nationwide", async () => {
  const { COFFEE_SUBSCRIPTION: S, subscriptionFrequency } = await data();
  assert.deepEqual(S.frequencies.map((f) => [f.deliveriesPerMonth, f.priceNumber, f.gramsPerMonth]),
    [[1, 3000, 200], [2, 5800, 400], [3, 8550, 600], [4, 11200, 800]]);
  assert.equal(S.name.ja, "珈琲の定期便");
  assert.equal(S.perDelivery.ja, "100g × 2袋（1回 200g）");
  assert.match(S.lead.ja, /当店おまかせの珈琲豆を2種類/);
  assert.match(S.selectionNote.ja, /季節や仕入れの状況に合わせて当店が選びます/);
  assert.equal(S.labels.ja.priceNote, "税込・全国一律送料込み");
  assert.deepEqual(S.terms.ja, ["全国一律・送料込み（追加送料なし）", "配送回数は月1〜4回で途中変更できます", "スキップ自由", "解約自由", "最低継続回数なし", "国内配送のみ"]);
  assert.deepEqual(S.billing.ja, ["毎月、月初に月額を一括でお支払いいただきます", "配送回数の変更・スキップは、原則として翌月から反映されます", "変更の締切は前月25日です", "日割りの精算はありません"]);
  assert.equal(subscriptionFrequency("monthly-3").priceNumber, 8550);
  assert.equal(subscriptionFrequency("unknown").id, S.defaultFrequency, "an unknown choice falls back to the default");
  assert.equal(S.frequencyLabel.ja(2), "月2回");
});

test("the old plans are gone; one card in 折々 shows the new subscription; every text exists in ja, en and es", async () => {
  const { PRODUCT_DATA, COFFEE_SUBSCRIPTION: S } = await data();
  const card = PRODUCT_DATA.oriori.find((item) => item.id === "oriori-subscription");
  assert.equal(card.subscription, S);
  assert.equal(card.plans, undefined);
  assert.doesNotMatch(read("src", "productData.js"), /豆の定期便|珈琲袋定期便|禅の仕立て便/);
  for (const lang of ["ja", "en", "es"]) {
    for (const key of ["name", "cardSummary", "lead", "perDelivery", "selectionNote", "pendingNote"]) assert.ok(S[key][lang], `${key} ${lang}`);
    assert.equal(S.terms[lang].length, 6, `terms ${lang}`);
    assert.equal(S.billing[lang].length, 4, `billing ${lang}`);
    assert.ok(S.preference.label[lang] && S.preference.placeholder[lang] && S.preference.notes[lang].length === 3, `preference ${lang}`);
    assert.equal(S.manage.items[lang].length, 3, `manage ${lang}`);
    assert.ok(S.labels[lang].monthly && S.frequencyLabel[lang](1), `labels ${lang}`);
  }
  assert.equal(S.preference.label.ja, "珈琲の好み・ご希望（任意）");
  assert.equal(S.preference.placeholder.ja, "例：酸味が少なく、苦味のある珈琲が好きです。フルーティーな珈琲を試してみたいです。");
});

test("conditions not decided yet are announced later, never stated as fixed; shipping is one price nationwide", async () => {
  const { COFFEE_SUBSCRIPTION: S } = await data();
  assert.equal(S.pendingNote.ja, "発送日、初月のお支払いと初回のお届け、解約時のお取り扱いは、受付再開時にご案内します。");
  const texts = JSON.stringify(S);
  assert.doesNotMatch(texts, /発送日は|毎月\d+日(に|発送)|初回.{0,6}(\d+日|月末)/);
  assert.doesNotMatch(texts, /北海道|九州|沖縄|追加送料がかかり|基本送料|1,700|1700/);
  // Everywhere the store talks about subscription shipping: one price nationwide, shipping included.
  for (const file of [["src", "App.jsx"], ["src", "pages", "ShippingPage.jsx"], ["src", "lib", "seo.js"], ["api", "coffee-concierge.js"]]) {
    const text = read(...file);
    assert.doesNotMatch(text, /定期便は送料無料|Subscriptions ship free|envío gratis/, file.join("/"));
    assert.match(text, /定期便は全国一律・送料込み|one price nationwide/, file.join("/"));
  }
  // One-off orders (2026-11-19): 1–2 bags of beans ¥250 everywhere by Click Post, 3+ by Yu-Pack.
  assert.match(read("src", "App.jsx"), /コーヒー豆1〜2袋は全国一律 ¥250（クリックポスト）・3袋以上はゆうパック/);
});

test("preference comment: optional, at most 300 characters, cleaned, and refuses personal or payment details", async () => {
  const { PREFERENCE_MAX_LENGTH, normalizePreference, preferenceIssues, PREFERENCE_ISSUE_TEXT } = await pref();
  assert.equal(PREFERENCE_MAX_LENGTH, 300);
  assert.deepEqual(preferenceIssues(""), [], "empty is fine");
  assert.deepEqual(preferenceIssues("酸味が少なく、苦味のある珈琲が好きです。フルーティーな珈琲を試してみたいです。"), []);
  assert.deepEqual(preferenceIssues("深煎りを月に2回、100gずつがうれしいです"), [], "ordinary numbers are fine");
  assert.equal(normalizePreference("  苦味\u0000が好き\u200B\r\n\n\n\nです  "), "苦味が好き\n\nです");
  assert.deepEqual(preferenceIssues("あ".repeat(301)), ["TOO_LONG"]);
  assert.deepEqual(preferenceIssues("あ".repeat(300)), []);
  assert.deepEqual(preferenceIssues("カードは 4242 4242 4242 4242 です"), ["CARD_NUMBER"]);
  assert.deepEqual(preferenceIssues("hanako@example.com に連絡を"), ["EMAIL"]);
  assert.deepEqual(preferenceIssues("電話 090-1234-5678"), ["PHONE"]);
  assert.deepEqual(preferenceIssues("電話 ０９０ー１２３４ー５６７８"), ["PHONE"], "full-width digits too");
  assert.deepEqual(preferenceIssues("https://example.com を見て"), ["URL"]);
  for (const lang of ["ja", "en", "es"]) for (const code of ["TOO_LONG", "CARD_NUMBER", "EMAIL", "PHONE", "URL"]) assert.ok(PREFERENCE_ISSUE_TEXT[lang][code], `${lang} ${code}`);
});

test("the page: frequency switches price and amount; change, skip and cancel are information only; sign-up stays closed", () => {
  const detail = read("src", "components", "CoffeeSubscriptionDetail.jsx");
  assert.match(detail, /role="radiogroup"/);
  assert.match(detail, /onClick=\{\(\) => setFrequencyId\(option\.id\)\}/);
  assert.match(detail, /\{yen\(selected\.priceNumber\)\}/);
  assert.match(detail, /\{selected\.gramsPerMonth\}g/);
  assert.match(detail, /maxLength=\{PREFERENCE_MAX_LENGTH\}/);
  assert.match(detail, /disabled=\{SUBSCRIPTIONS_PAUSED\}/);
  // The manage section lists items with their status; no buttons or links there.
  const manage = detail.slice(detail.indexOf('<section className="coffee-sub-manage"'));
  assert.doesNotMatch(manage, /<button|<a |href=|onClick/);
  assert.match(manage, /SUB\.manage\.unavailable/);
  // The tea cards keep their information below the photo (own classes; the coffee cards are untouched).
  const page = read("src", "pages", "ProductsPage.jsx");
  assert.match(page, /className="woodbox-card-photo"[\s\S]*?className="woodbox-card-info"/);
  assert.match(page, /className="products-enma-static-card enma-product-card"/);
});
