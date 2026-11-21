"use strict";

// The "your order has shipped" mail (2026-11-21), for store orders (server/order-fulfillment.js) and 珈琲の定期便
// deliveries (server/coffee-subscription-fulfillment.js): the site says 「発送時にメールでお知らせします」.
// Sent at most once per order or delivery: shippingMails/{key} is created inside the same transaction that marks the
// parcel shipped (status "sending"), so a repeated or simultaneous "shipped" can never mail twice. A mail that failed
// is recorded as "failed" and may be sent again only from that state (one staff action, also once).
// Test orders (Stripe test mode, livemode false) never mail a customer: the record says "skipped_test".

const MAILS = "shippingMails";
const CONTACT = "ryugecoffee@gmail.com";

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

// A store order: what was bought, how it travels, the tracking link. No address in the mail (the customer knows it).
function orderShippedMail({ to, name, ref, items, method, trackingNumber, english = false }) {
  const m = METHODS[method] || { ja: method, en: method };
  if (english) {
    return { to, subject: "Ryuge Coffee: your order has shipped", text: [
      `Dear ${name || "customer"},`, "", "Thank you for your order. It has been shipped.", "",
      `Order: ${ref}`, ...items.map((i) => `- ${i.name} × ${i.quantity}`), "",
      `Shipping: ${m.en}`, ...(trackingNumber ? [`Tracking number: ${trackingNumber}`, trackingUrl(trackingNumber)] : []), "",
      `Questions: ${CONTACT}`, "", "Ryuge Coffee / 龍華珈琲"].join("\n") };
  }
  return { to, subject: "【龍華珈琲】ご注文の商品を発送しました", text: [
    `${name || "お客様"} 様`, "", "ご注文いただいた商品を発送しました。", "",
    `■ ご注文番号：${ref}`, ...items.map((i) => `・${i.name} × ${i.quantity}`), "",
    `■ 配送方法：${m.ja}`, ...(trackingNumber ? [`■ 追跡番号：${trackingNumber}`, trackingUrl(trackingNumber)] : []), "",
    `ご不明な点は ${CONTACT} までお問い合わせください。`, "", "龍華珈琲 / Ryuge Coffee"].join("\n") };
}

// A 珈琲の定期便 delivery.
function subscriptionShippedMail({ to, which, beans, method, trackingNumber }) {
  const m = METHODS[method] || { ja: method };
  return { to, subject: "【龍華珈琲】珈琲の定期便を発送しました", text: [
    "珈琲の定期便をご利用いただき、ありがとうございます。", `${which}のお届けを発送しました。`, "",
    ...(beans.length ? ["■ 今回の珈琲豆", ...beans.map((b) => `・${b}（100g）`), ""] : []),
    `■ 配送方法：${m.ja}`, ...(trackingNumber ? [`■ 追跡番号：${trackingNumber}`, trackingUrl(trackingNumber)] : []), "",
    "お届け予定の確認・回数の変更・スキップ・解約は管理ページから行えます。", "https://ryuge.biz/subscription/manage", "",
    `ご不明な点は ${CONTACT} までお問い合わせください。`, "", "龍華珈琲 / Ryuge Coffee"].join("\n") };
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

module.exports = { MAILS, METHODS, TRACKING_RE, trackingUrl, validMethod, validTracking, orderShippedMail, subscriptionShippedMail,
  readClaim, deliver, claimRetry, mailStatus, yen };
