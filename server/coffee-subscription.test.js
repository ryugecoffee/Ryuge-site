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
  assert.match(S.selectionNote.ja, /季節や仕入れの状況に合わせて当店がお選びいたします/);
  assert.equal(S.labels.ja.priceNote, "税込・全国一律送料込み");
  // The panel's points (2026-11-23 wording): nationwide one price, 1–4 deliveries, skips, cancelling, no minimum or fee, returns.
  const terms = S.terms.ja.join("\n");
  for (const part of ["全国一律・送料込み", "月1〜4回", "スキップ", "いつでもお手続き", "最低継続回数・解約手数料はございません", "返品・交換はお受けしておりません"]) {
    assert.ok(terms.includes(part), part);
  }
  assert.equal(S.billing.ja.length, 4);
  // The panel shows the first payment apart from the monthly price, the same amount the server charges.
  assert.equal(S.firstPrice, require("./coffee-subscription-plan").FIRST_DELIVERY_PRICE);
  for (const lang of ["ja", "en", "es"]) assert.ok(S.labels[lang].first && S.labels[lang].firstNote, `first payment label ${lang}`);
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

test("the store's panel states the decided conditions as the code does (2026-11-23); shipping is one price nationwide", async () => {
  const { COFFEE_SUBSCRIPTION: S } = await data();
  assert.equal(S.pendingNote.ja, "受付の再開時には、お申し込みの確認画面で、お支払い・発送・解約の条件をあらためてご案内いたします。");
  const texts = JSON.stringify(S);
  // The first payment apart from the monthly price, the start month rule, 先払い, the 25th for changes, 9:00 on the 1st for cancelling.
  const billing = S.billing.ja.join("\n");
  assert.match(billing, /初回分 3,000円（税込・送料込み）.*月額料金とは別のお支払い/);
  assert.match(billing, /1〜15日の場合は翌月から、16日以降の場合は翌々月から、毎月1日（日本時間9時）にその月のお届け分を先払い/);
  assert.match(billing, /前月25日までのお手続きで翌月分から/);
  assert.match(billing, /毎月1日のご請求（日本時間9時）より前に解約された場合、その月以降のご請求はございません/);
  assert.doesNotMatch(texts, /スキップ自由|解約自由|原則として/);
  assert.doesNotMatch(texts, /北海道|九州|沖縄|追加送料がかかり|基本送料|1,700|1700/);
  // Everywhere the store talks about subscription shipping: one price nationwide, shipping included.
  for (const file of [["src", "App.jsx"], ["src", "pages", "ShippingPage.jsx"], ["src", "lib", "seo.js"], ["api", "coffee-concierge.js"]]) {
    const text = read(...file);
    assert.doesNotMatch(text, /定期便は送料無料|Subscriptions ship free|envío gratis/, file.join("/"));
    assert.match(text, /定期便は全国一律・送料込み|one price nationwide/, file.join("/"));
  }
  // One-off orders (2026-11-19): 1–2 bags of beans ¥250 everywhere by Letter Pack Light, 3+ at the regional fee.
  assert.match(read("src", "App.jsx"), /コーヒー豆1〜2袋は全国一律 ¥250（レターパックライト）・3袋以上は本州・四国 ¥250／北海道・九州 ¥500／沖縄 ¥550/);
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

// What the customer reads, rendered: the store's final confirmation screen (all four plans), the legal notice (its
// subscription rows draw on the same TERMS_JA), the refund policy, Stripe's page and the confirmation mail.
async function customerTexts() {
  const fsx = require("node:fs");
  const pathx = require("node:path");
  const { pathToFileURL } = require("node:url");
  const readx = (...p) => fsx.readFileSync(pathx.join(__dirname, "..", ...p), "utf8");
  const { submitTerms } = require("./coffee-subscription-checkout");
  const T = await import(pathToFileURL(pathx.join(__dirname, "..", "src", "lib", "coffeeSubscriptionTerms.js")).href);
  const legal = readx("src", "pages", "LegalNotice.jsx");
  return {
    confirmation: [1, 2, 3, 4].map((f) => T.confirmationRows(f, "2027-01").map(([k, v]) => `${k}：${v}`).join("\n")).join("\n"),
    legal: legal.replace(/\$\{TERMS_JA\.(\w+)\}/g, (_, k) => T.TERMS_JA[k]).replace(/" \+ TERMS_JA\.(\w+)\]/g, (_, k) => `${T.TERMS_JA[k]}"]`)
      .replace(/\$\{CHANGE_DEADLINE_DAY\}/g, "25"),
    refundPolicy: readx("src", "pages", "RefundPolicy.jsx"),
    stripePage: [1, 2, 3, 4].map((f) => submitTerms("2027-01", f)).join("\n"),
  };
}

test("cancellation and refund wording is the same everywhere the customer reads it (2026-11-19)", async () => {
  const places = await customerTexts();
  for (const [name, text] of Object.entries(places)) {
    assert.match(text, /毎月1日(の|9時の)ご請求(（日本時間9時）)?より前/, `${name}: the cancellation cut-off`);
    assert.match(text, /初回(の)?200g(を|の)?発送(する)?前/, `${name}: the first delivery not yet shipped`);
    assert.match(text, /初回分3,000円を全額返金いたします。返金はお支払い時のカードへ行い、解約受付から7営業日以内に手続きいたします/, `${name}: the first payment refunded in full within 7 business days`);
    assert.match(text, /解約手数料・違約金はございません/, `${name}: no cancellation fee`);
    assert.doesNotMatch(text, /原則として返金/, `${name}: no "in principle" refund left`);
    // Cancelling by email when signing in is not possible (server/coffee-subscription-email-cancel.js does this).
    assert.match(text, /ryugecoffee@gmail\.com へ(件名「定期便の解約希望」でご連絡いただいても|のメールでも)解約でき/, `${name}: cancelling by email`);
    assert.match(text, /1日9時(のご請求)?より前に届いたご連絡は(、)?その月のご請求より前の解約として扱います/, `${name}: an email before 9:00 on the 1st counts`);
  }
  assert.doesNotMatch(places.refundPolicy, /既に決済が完了している注文についてはキャンセルできません/, "the old contradicting sentence is gone");
});

test("two different deadlines are never mixed: change/skip by the 25th of the previous month; cancel before 9:00 JST on the 1st", async () => {
  const plan = require("./coffee-subscription-plan");
  const places = await customerTexts();
  for (const [name, text] of Object.entries(places)) {
    for (const sentence of text.split(/[。\n]/)) {
      // The 25th belongs to changes and skips only, never to cancelling.
      if (/前月25日/.test(sentence)) assert.match(sentence, /変更|スキップ/, `${name}: "${sentence}"`);
      if (/前月25日/.test(sentence)) assert.doesNotMatch(sentence, /解約/, `${name}: "${sentence}"`);
      // A cancellation cut-off ("…より前に解約" / "解約は…まで") is always the 9:00 charge on the 1st.
      if (/(より前に解約|解約.*までに|解約の期限)/.test(sentence)) assert.match(sentence, /1日.*9時|9時.*1日/, `${name}: "${sentence}"`);
    }
  }
  // The code behind the words: a change asked on the 25th applies next month, on the 26th the month after.
  const jst = (y, m, d, h) => Date.UTC(y, m - 1, d, h - 9);
  assert.equal(plan.firstChangeableMonth(jst(2026, 11, 25, 23)), "2026-12");
  assert.equal(plan.firstChangeableMonth(jst(2026, 11, 26, 0)), "2027-01");
  // Cancelling before 9:00 on the 1st: that month is not charged; after it is paid: from the next month (the paid month ships).
  assert.equal(plan.cancellationFor(jst(2026, 12, 1, 8), null).firstUnchargedMonth, "2026-12");
  assert.equal(plan.cancellationFor(jst(2026, 12, 10, 12), { status: "paid" }).firstUnchargedMonth, "2027-01");
});

test("final confirmation items (特定商取引法 第12条の6) on the store's screen and next to Stripe's pay button, the same words", async () => {
  const pathx = require("node:path");
  const { pathToFileURL } = require("node:url");
  const plan = require("./coffee-subscription-plan");
  const { submitTerms } = require("./coffee-subscription-checkout");
  const { welcomeMail } = require("./coffee-subscription-mail");
  const T = await import(pathToFileURL(pathx.join(__dirname, "..", "src", "lib", "coffeeSubscriptionTerms.js")).href);
  // The sentences are the same on the store's screens and on Stripe's page / in the mails.
  assert.deepEqual({ ...T.TERMS_JA }, { ...plan.TERMS_JA });
  assert.equal(T.REFUND_BUSINESS_DAYS, plan.REFUND_BUSINESS_DAYS);
  for (const f of [1, 2, 3, 4]) {
    const rows = Object.fromEntries(T.confirmationRows(f, "2027-01"));
    for (const label of ["商品・分量", "初回のお届け", "毎月のお届け", "初回のお支払い", "月額料金", "月額のお支払い開始日", "お支払い方法", "契約期間", "1年間の参考", "変更・スキップ", "解約", "返金", "返品", "お届け地域"]) {
      assert.ok(rows[label], `${f}: ${label}`);
    }
    assert.equal(rows["返品"], plan.TERMS_JA.returns);
    assert.match(rows["契約期間"], /期間の定めのない定期購入です（解約のお手続きをいただくまで、毎月継続いたします）/);
    // The year from the first monthly charge: first payment + 12 monthly charges; the same figure on Stripe's page.
    const a = plan.annualReference(f, "2027-01");
    assert.equal(a.total, 3000 + plan.MONTHLY_PRICES[f] * 12);
    assert.equal(a.deliveries, 1 + 12 * f);
    assert.equal(rows["1年間の参考"], plan.annualReferenceText(f, "2027-01"));
    assert.ok(rows["1年間の参考"].includes(`合計 ${a.total.toLocaleString("ja-JP")}円`) && rows["1年間の参考"].includes("2027年1月〜2027年12月"));
    const stripe = submitTerms("2027-01", f);
    assert.ok(stripe.length <= 1200, `Stripe's limit: ${stripe.length}`);
    for (const part of [`月${f}回`, "100g×2袋", "3,000円", `月額${plan.MONTHLY_PRICES[f].toLocaleString("ja-JP")}円`, "毎月1日", "3営業日以内に発送", "2027年1月1日から", "先払い",
      plan.TERMS_JA.term, plan.annualReferenceText(f, "2027-01"), "前月25日", "毎月1日9時のご請求より前", plan.TERMS_JA.noFee, plan.TERMS_JA.refund, plan.TERMS_JA.returns]) {
      assert.ok(stripe.includes(part), `Stripe page, ${f}: ${part}`);
    }
    // The sign-up mail (CEO wording, 2026-11-23) states the figures and points to the full terms (the confirmation screen and
    // the legal notice) instead of repeating them; what it does state matches them.
    const mail = welcomeMail({ to: "a@example.com", contract: { frequency: f, startMonth: "2027-01" }, siteUrl: "https://ryuge.biz" }).text;
    for (const part of [`・お届け回数：月${f}回`, `・月額料金：${plan.MONTHLY_PRICES[f].toLocaleString("ja-JP")}円（税込・送料込み）`, "・月額のお支払い開始：2027年1月1日",
      "・初回のお支払い：3,000円", "最低継続回数や解約手数料はございません。", "特定商取引法に基づく表記をご確認ください"]) {
      assert.ok(mail.includes(part), `mail, ${f}: ${part}`);
    }
    assert.match(rows["月額のお支払い開始日"], /2027年1月1日/);
  }
  assert.equal(T.LEGAL_TEXT_REVIEWED, true, "internal legal text review completed without opening sign-ups");
});

test("the 9:00 JST cut-off on the 1st against Stripe's invoice: before it nothing is charged; after payment, from the next month", () => {
  const plan = require("./coffee-subscription-plan");
  const at = (h, m = 0, s = 0) => Date.UTC(2026, 11, 1, h - 9, m, s); // 2026-12-01, JST
  // 08:59:59: no December invoice exists yet → ends at 09:00, December never invoiced.
  const before = plan.cancellationFor(at(8, 59, 59), null);
  assert.deepEqual([before.action, before.cancelAt, before.firstUnchargedMonth], ["CANCEL_AT", plan.billingStartUnix("2026-12"), "2026-12"]);
  assert.equal(plan.billingStartUnix("2026-12"), at(9) / 1000, "the subscription renews at exactly 09:00 JST");
  // 09:00–about 10:00: December is a draft (not charged yet) → ends now, the draft is never charged.
  assert.deepEqual([plan.cancellationFor(at(9, 0, 1), { status: "draft" }).action, plan.cancellationFor(at(9, 30), { status: "draft" }).firstUnchargedMonth], ["CANCEL_NOW", "2026-12"]);
  // Finalized but unpaid (a failed card, Stripe retrying): the invoice is voided, December not charged or shipped.
  const open = plan.cancellationFor(at(10, 30), { status: "open", id: "in_x" });
  assert.deepEqual([open.action, open.voidInvoice, open.firstUnchargedMonth], ["VOID_AND_CANCEL_NOW", "in_x", "2026-12"]);
  // Paid: December ships, nothing from January.
  const paid = plan.cancellationFor(at(10, 30), { status: "paid" });
  assert.deepEqual([paid.action, paid.cancelAt, paid.firstUnchargedMonth, paid.lastChargedMonth], ["CANCEL_AT", plan.billingStartUnix("2027-01"), "2027-01", "2026-12"]);
});

test("final check 2026-11-20: the legal page states when the monthly charges start; every place moves deliveries off closed days alike", async () => {
  const fs = require("node:fs");
  const pathx = require("node:path");
  const plan = require("./coffee-subscription-plan");
  const { submitTerms } = require("./coffee-subscription-checkout");
  const legal = fs.readFileSync(pathx.join(__dirname, "..", "src", "pages", "LegalNotice.jsx"), "utf8");
  // The rule in words is the rule in the code: 1st–15th → next month, 16th or later → the month after.
  assert.match(legal, /お申し込み日（日本時間）が1〜15日の場合は翌月1日から、16日以降の場合は翌々月1日から/);
  const jst = (y, m, d) => Date.UTC(y, m - 1, d, 12 - 9);
  assert.deepEqual([plan.startMonthFor(jst(2026, 12, 15)), plan.startMonthFor(jst(2026, 12, 16))], ["2027-01", "2027-02"]);
  const places = await customerTexts();
  for (const [name, text] of Object.entries(places)) {
    if (/土日祝/.test(text)) assert.doesNotMatch(text, /土日祝は翌営業日/, `${name}: closed days (休業日) are named with weekends and holidays`);
  }
  for (const f of [1, 2, 3, 4]) {
    assert.match(submitTerms("2027-01", f), /土日祝・休業日は翌営業日/);
    assert.ok([...submitTerms("2027-01", f)].length <= 1200, "Stripe's limit");
  }
});
