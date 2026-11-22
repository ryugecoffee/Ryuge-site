"use strict";

// The "your order has shipped" mail (2026-11-21), for store orders (server/order-fulfillment.js) and 珈琲の定期便
// deliveries (server/coffee-subscription-fulfillment.js): the site says 「発送時にメールでお知らせします」.
// Sent at most once per order or delivery: shippingMails/{key} is created inside the same transaction that marks the
// parcel shipped (status "sending"), so a repeated or simultaneous "shipped" can never mail twice. A mail that failed
// is recorded as "failed" and may be sent again only from that state (one staff action, also once).
// Test orders (Stripe test mode, livemode false) never mail a customer: the record says "skipped_test".

const MAILS = "shippingMails";

// Ways a parcel leaves the shop (CEO 2026-11-20/21). Domestic: レターパックライト (≤ 3 cm), レターパックプラス, ゆうパック,
// クリックポスト; international: 国際エアパケット. All tracked by 日本郵便.
const METHODS = Object.freeze({
  letterpack_light: { ja: "レターパックライト", en: "Letter Pack Light" },
  letterpack_plus: { ja: "レターパックプラス", en: "Letter Pack Plus" },
  yupack: { ja: "ゆうパック", en: "Yu-Pack" },
  clickpost: { ja: "クリックポスト", en: "Click Post" },
  intl_air_packet: { ja: "国際エアパケット", en: "Japan Post International Air Packet" },
});
const TRACKING_RE = /^[A-Za-z0-9-]{6,30}$/;
const trackingUrl = (number) => `https://trackings.post.japanpost.jp/services/srv/search/direct?reqCodeNo1=${encodeURIComponent(String(number).replace(/-/g, ""))}`;

function validMethod(method) {
  if (!Object.prototype.hasOwnProperty.call(METHODS, method)) { const e = new Error("INVALID_SHIPPING_METHOD"); e.code = "INVALID_SHIPPING_METHOD"; throw e; }
  return method;
}
function validTracking(value) {
  if (value === null || value === undefined || value === "") return null;
  const t = String(value).trim();
  if (!TRACKING_RE.test(t)) { const e = new Error("INVALID_TRACKING_NUMBER"); e.code = "INVALID_TRACKING_NUMBER"; throw e; }
  return t;
}

const yen = (n) => `${Number(n).toLocaleString("ja-JP")}円`;

// The customer's "shipped" mail (CEO wording, 2026-11-23): one text for store orders and 珈琲の定期便 deliveries.
// The tracking lines appear only when there is a tracking number. No address and no payment details.
const TRACKING_SERVICE_URL = "https://trackings.post.japanpost.jp/services/srv/search/";
const SIGNATURE = "龍華珈琲 / Ryuge Coffee";
// Accepts ms, a Date or a Firestore Timestamp; the shop's day in Japan.
const toMs = (v) => (v?.toMillis ? v.toMillis() : v instanceof Date ? v.getTime() : Number.isFinite(Number(v)) && v !== null && v !== undefined && v !== "" ? Number(v) : Date.now());
const jstDateJa = (at) => { const d = new Date(toMs(at) + 9 * 3600e3); return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`; };
const jstDateEn = (at) => new Date(toMs(at) + 9 * 3600e3).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

// What was shipped, as the mail names it: 珈琲豆 when every item is coffee beans, 珈琲 when every item is coffee (beans or
// drip bags), otherwise ご注文の品 (e.g. tea). Beans are counted in 袋, anything else in 点.
function goodsOf(items) {
  const kinds = items.map((i) => i.kind || "beans");
  if (kinds.every((k) => k === "beans")) return { noun: "珈琲豆", subjectNoun: "珈琲", coffee: true };
  if (kinds.every((k) => k === "beans" || k === "bag")) return { noun: "珈琲", subjectNoun: "珈琲", coffee: true };
  return { noun: "ご注文の品", subjectNoun: "ご注文の品", coffee: false };
}
const unitOf = (item) => ((item.kind || "beans") === "beans" ? "袋" : "点");

function shippedMailJa({ to, goods, productLines, quantityText, shippedAt, method, trackingNumber }) {
  const m = METHODS[method] || { ja: method };
  return { to, subject: `【龍華珈琲】${goods.subjectNoun}を発送いたしました`, text: [
    "いつも龍華珈琲をご利用いただき、誠にありがとうございます。",
    `本日、${goods.noun}を発送いたしました。`,
    "",
    "【発送内容】",
    ...productLines.map((line) => `・商品：${line}`),
    ...(quantityText ? [`・数量：${quantityText}`] : []),
    `・発送日：${jstDateJa(shippedAt)}`,
    `・配送方法：${m.ja}`,
    ...(trackingNumber ? [`・お問い合わせ番号：${trackingNumber}`] : []),
    "",
    ...(trackingNumber ? ["配送状況は、日本郵便の追跡サービスよりご確認いただけます。", TRACKING_SERVICE_URL, ""] : []),
    "お届けまで、今しばらくお待ちください。",
    goods.coffee ? "珈琲とともに、穏やかな時間をお過ごしいただけますように。" : "お届けの品とともに、穏やかな時間をお過ごしいただけますように。",
    "",
    SIGNATURE,
  ].join("\n") };
}

// A store order: what was bought, how it travels, the tracking number. items: [{ name, quantity, kind }].
function orderShippedMail({ to, items, method, trackingNumber, shippedAt, english = false }) {
  const goods = goodsOf(items);
  if (english) {
    const m = METHODS[method] || { en: method };
    return { to, subject: goods.coffee ? "Ryuge Coffee: your coffee has been shipped" : "Ryuge Coffee: your order has been shipped", text: [
      "Thank you for choosing Ryuge Coffee.", "Your order was shipped today.", "",
      "[Shipment]", ...items.map((i) => `- ${i.name} × ${i.quantity}`), `- Shipped on: ${jstDateEn(shippedAt)}`, `- Shipping: ${m.en}`,
      ...(trackingNumber ? [`- Tracking number: ${trackingNumber}`, "", "You can follow the parcel on Japan Post's tracking service:", trackingUrl(trackingNumber)] : []), "",
      "We hope it brings you a calm and pleasant moment.", "", "Ryuge Coffee / 龍華珈琲"].join("\n") };
  }
  const single = items.length === 1;
  const sameUnit = items.every((i) => unitOf(i) === unitOf(items[0]));
  const total = items.reduce((n, i) => n + Number(i.quantity || 0), 0);
  return shippedMailJa({ to, goods, method, trackingNumber, shippedAt,
    productLines: single ? [items[0].name] : items.map((i) => `${i.name}（${i.quantity}${unitOf(i)}）`),
    quantityText: single ? `${items[0].quantity}${unitOf(items[0])}` : `計${total}${sameUnit ? unitOf(items[0]) : "点"}` });
}

// A 珈琲の定期便 delivery: always two kinds of beans, 100 g each (two bags). which: 初回 / 12月分の1回目 …
function subscriptionShippedMail({ to, which, beans, method, trackingNumber, shippedAt }) {
  const label = `珈琲の定期便（${which}）`;
  return shippedMailJa({ to, goods: goodsOf([{ kind: "beans" }]), method, trackingNumber, shippedAt,
    productLines: [beans.length ? `${label} ${beans.join("・")}（各100g）` : `${label} 珈琲豆2種類（各100g）`],
    quantityText: `${beans.length || 2}袋` });
}

// Inside the "shipped" transaction (after its reads): claim the one mail for this parcel. Returns the write to do.
async function readClaim(tx, db, key) {
  const ref = db.collection(MAILS).doc(key);
  const snap = await tx.get(ref);
  return { exists: snap.exists, status: snap.exists ? snap.data().status : null,
    create: (fields) => { if (!snap.exists) tx.create(ref, { ...fields, status: fields.status || "sending", createdAt: new Date() }); } };
}

// After the transaction: send the claimed mail and record how it went. Never throws (the parcel is shipped either way).
async function deliver(db, key, message, sendMail, log = console) {
  const ref = db.collection(MAILS).doc(key);
  try {
    await sendMail(message);
    await ref.update({ status: "sent", sentAt: new Date() });
    return "sent";
  } catch (error) {
    await ref.update({ status: "failed", failedAt: new Date() }).catch(() => {});
    log.error("Shipping mail failed:", key, String(error?.message || "").slice(0, 120));
    return "failed";
  }
}

// A failed mail, sent again by staff: only from "failed", once (the state moves to "sending" in a transaction first).
async function claimRetry(db, key) {
  const ref = db.collection(MAILS).doc(key);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().status !== "failed") return false;
    tx.update(ref, { status: "sending", retriedAt: new Date() });
    return true;
  });
}

async function mailStatus(db, keys) {
  if (!keys.length) return {};
  const snaps = await Promise.all(keys.map((k) => db.collection(MAILS).doc(k).get()));
  return Object.fromEntries(snaps.map((s, i) => [keys[i], s.exists ? s.data().status : null]));
}

module.exports = { MAILS, METHODS, TRACKING_RE, TRACKING_SERVICE_URL, trackingUrl, validMethod, validTracking, orderShippedMail, subscriptionShippedMail, goodsOf,
  readClaim, deliver, claimRetry, mailStatus, yen };
