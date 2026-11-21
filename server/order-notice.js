"use strict";

// The shop's "new order" mail (2026-11-21), in the order staff read it:
//   注文番号 / 注文日時 / お名前 / メールアドレス / 電話番号 / 配送先住所 / 注文商品・数量 / 商品代金・送料・合計 / 配送方法
// The address comes put together once (src/lib/addressFormat.js): no prefecture or building twice. A missing phone
// (orders from before the checkout asked for one in Japan) reads 未登録 and is never made up. Only the shop receives
// this mail; the customer's own receipt and the shop's shipping page are separate.

const yen = (n) => `¥${Number(n || 0).toLocaleString("ja-JP")}`;
const ref = (paymentIntentId) => (/^pi_[A-Za-z0-9]+$/.test(String(paymentIntentId || "")) ? `R-${paymentIntentId.slice(-8).toUpperCase()}` : null);
const jstText = (ms) => {
  const d = new Date(ms + 9 * 3600e3);
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日 ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};
const METHOD_TEXT = {
  letterpack_light: "レターパックライト",
  yupack: "ゆうパック",
  regional: "レターパックプラスまたはゆうパック（梱包を見て決める・地域別送料）",
  intl_air_packet: "国際エアパケット",
};

function orderNotice({ paymentIntentId, at = Date.now(), name, email, phone, addressText, items = [], shipping, total, couponCode, shippingMethod }) {
  const lines = (Array.isArray(items) ? items : []).map((i) => {
    const qty = Number(i.quantity) || 0;
    return { text: `・${i.title || i.name || i.id || ""} × ${qty}\u3000${yen((Number(i.price) || 0) * qty)}`, amount: (Number(i.price) || 0) * qty };
  });
  const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
  const discount = subtotal + (Number(shipping) || 0) - (Number(total) || 0);
  const r = ref(paymentIntentId);
  const text = [
    "新規注文が入りました。",
    "",
    `注文番号：${r ? `${r}（Stripe：${paymentIntentId}）` : "（不明）"}`,
    `注文日時：${jstText(at)}`,
    `お名前：${String(name || "").trim() || "（未入力）"}`,
    `メールアドレス：${String(email || "").trim() || "（未入力）"}`,
    `電話番号：${String(phone || "").trim() || "未登録"}`,
    "配送先住所：",
    ...(String(addressText || "").trim() ? String(addressText).split("\n").map((l) => `\u3000${l}`) : ["\u3000（未入力）"]),
    "",
    "【注文商品・数量】",
    ...lines.map((l) => l.text),
    "",
    `商品代金：${yen(subtotal)}`,
    `送料：${Number(shipping) === 0 ? "無料" : yen(shipping)}`,
    ...(discount > 0 ? [`割引：-${yen(discount)}${couponCode ? `（クーポン ${couponCode}）` : ""}`] : []),
    `合計：${yen(total)}`,
    `配送方法：${METHOD_TEXT[shippingMethod] || "（不明）"}`,
  ].join("\n");
  return { subject: `【新規注文】${String(name || "").trim() || "お客様"} 様より ${yen(total)}`, text };
}

module.exports = { orderNotice, METHOD_TEXT, ref };
