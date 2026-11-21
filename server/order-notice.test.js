"use strict";

// 2026-11-21: the shop's new-order mail — fields in order, the address once, the phone (or 未登録), never invented.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { orderNotice } = require("./order-notice");

const root = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(root, ...p), "utf8");
const fmt = () => import(pathToFileURL(path.join(root, "src", "lib", "addressFormat.js")).href);
const AT = Date.UTC(2026, 10, 21, 5, 5); // 14:05 JST

test("new-order mail: 注文番号 → 日時 → お名前 → メール → 電話 → 住所 → 商品 → 代金・送料・合計 → 配送方法; the reported duplicates gone", async () => {
  const { addressText } = await fmt();
  // As the reported order came in: 広島県 chosen and typed again, the building in both lines.
  const address = addressText({ countryCode: "JP", postalCode: "7300011", prefecture: "広島県", line1: "広島県広島市中区基町1-2-3 リュウゲマンション101", line2: "リュウゲマンション101" });
  const { subject, text } = orderNotice({ paymentIntentId: "pi_3TestAbcdEFGH1234", at: AT, name: "龍華 花子", email: "hanako@example.com", phone: "090-1234-5678",
    addressText: address, items: [{ title: "閻魔 エチオピア ジンマ", quantity: 2, price: 1500 }, { title: "木函\u3000奥八女ほうじ茶", quantity: 1, price: 2800 }],
    shipping: 250, total: 6050, shippingMethod: "regional" });
  assert.equal(subject, "【新規注文】龍華 花子 様より ¥6,050");
  const order = ["注文番号：R-EFGH1234（Stripe：pi_3TestAbcdEFGH1234）", "注文日時：2026年11月21日 14:05", "お名前：龍華 花子", "メールアドレス：hanako@example.com",
    "電話番号：090-1234-5678", "配送先住所：", "〒730-0011", "広島県広島市中区基町1-2-3", "リュウゲマンション101", "【注文商品・数量】",
    "閻魔 エチオピア ジンマ × 2\u3000¥3,000", "木函\u3000奥八女ほうじ茶 × 1\u3000¥2,800", "商品代金：¥5,800", "送料：¥250", "合計：¥6,050", "配送方法：レターパックプラスまたはゆうパック"];
  let from = 0;
  for (const piece of order) {
    const at = text.indexOf(piece, from);
    assert.ok(at >= 0, `in order: ${piece}\n${text}`);
    from = at + piece.length;
  }
  assert.equal(text.split("広島県").length - 1, 1, "the prefecture once");
  assert.equal(text.split("リュウゲマンション101").length - 1, 1, "the building once");
});

test("a missing phone reads 未登録; a coupon shows as a discount; international keeps its one line and method", async () => {
  const { addressText } = await fmt();
  const old = orderNotice({ paymentIntentId: "pi_3Old12345678", at: AT, name: "Old", email: "o@example.com", phone: "", addressText: "〒100-0001\n東京都 千代田区1-1",
    items: [{ name: "閻魔 珈琲袋", quantity: 1, price: 2400 }], shipping: 250, total: 2410, couponCode: "WELCOME", shippingMethod: "regional" });
  assert.match(old.text, /電話番号：未登録/);
  assert.doesNotMatch(old.text, /電話番号：0\d/, "never a made-up number");
  assert.match(old.text, /割引：-¥240（クーポン WELCOME）\n合計：¥2,410/);
  const intl = orderNotice({ paymentIntentId: "pi_3Intl1234567", at: AT, name: "Buyer", email: "b@example.com", phone: "+886 912 345 678",
    addressText: addressText({ countryCode: "TW", line1: "No. 1", city: "Taipei", postalCode: "100", countryName: "Taiwan" }),
    items: [{ title: "Beans", quantity: 2, price: 1500 }], shipping: 1200, total: 4200, shippingMethod: "intl_air_packet" });
  assert.match(intl.text, /配送先住所：\n\u3000No\. 1, Taipei, 100, Taiwan\n/);
  assert.match(intl.text, /配送方法：国際エアパケット/);
  // No payment id (an older storefront build): said so, nothing guessed.
  assert.match(orderNotice({ at: AT, items: [], total: 0, shipping: 0 }).text, /注文番号：（不明）[\s\S]*電話番号：未登録[\s\S]*配送方法：（不明）/);
});

test("the checkout asks for a phone in Japan too, checks it, gives it to Stripe and the shop's mail; the address goes in parts", () => {
  const checkout = read("src", "pages", "CheckoutPage.jsx");
  assert.match(checkout, /type="tel" placeholder=\{t\.phoneJa\} value=\{phone\} autoComplete="tel" inputMode="tel"\n\s+onChange=\{\(e\) => setPhone\(e\.target\.value\)\} required/);
  assert.match(checkout, /const domesticPhone = isInternational \? null : japanesePhone\(phone\);\n\s+if \(!isInternational && !domesticPhone\) \{\n\s+setError\(t\.phoneInvalid\);/);
  assert.match(checkout, /\.\.\.\(isInternational \? \(phone \? \{ phone \} : \{\}\) : \{ phone: domesticPhone \}\)/, "Stripe keeps it (and the order record copies it)");
  for (const field of ["line1:", "line2:", "phone:         isInternational ? phone : domesticPhone", "paymentIntentId,", "shippingMethod:"]) assert.ok(checkout.includes(field), field);
  for (const lang of ["電話番号（配送の連絡用）", "Phone number (for delivery)", "Teléfono (para la entrega)"]) assert.ok(checkout.includes(lang), lang);
  for (const msg of ["0から始まる10〜11桁", "10–11 digits starting with 0", "10–11 dígitos que empiecen por 0"]) assert.ok(checkout.includes(msg), msg);
  // The promotional-bean identity still uses the same one-line address as before (no change to its keys).
  assert.match(checkout, /body: JSON\.stringify\(\{ \.\.\.quoteRequest, email, name, address: finalAddress,/);
  // The order record takes the phone from Stripe's billing details, as given; a missing one stays empty (shown 未登録).
  assert.match(read("server", "orders.js"), /phone: String\(billing\.phone \|\| ""\)/);
});

test("the phone stays out of lists and Factory: only the shop's mail and the label on request show it", () => {
  assert.match(read("server", "factory-refund-api.js"), /const \{ phone: _phone, \.\.\.rest \} = c;[\s\S]*customer: customerForFactory\(o\.customer\)/);
  const list = read("server", "order-fulfillment.js");
  const workList = list.slice(list.indexOf("async function workList"), list.indexOf("async function orderAddress"));
  assert.doesNotMatch(workList, /phone/, "the work list never carries a phone");
  assert.match(read("src", "components", "OrderShippingPanel.jsx"), /電話番号：\{address\.phone \|\| PHONE_MISSING\.ja\}/);
});
