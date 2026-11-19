"use strict";

// Domestic shipping (CEO decision 2026-11-19). One fee per order, decided here only (server/quote.js uses it for the
// price shown and for the payment itself).
//  - Coffee beans in 100 g bags (catalog `clickpost: true`), 1–2 bags: クリックポスト, 250 yen everywhere in Japan
//    (Hokkaido, Kyushu and Okinawa included). Japan Post charges 240 yen (2026-10-01 rates; 2 bags side by side ≈
//    24 × 20 × 2.5 cm: longest side ≤ 34 cm, three sides ≤ 60 cm, fits a mailbox, ≤ 2 kg).
//  - The same beans, 3 bags or more: ゆうパック from Kanagawa at Japan Post's base rate for the destination and the box
//    size (YUPACK). Not charged until the CEO has confirmed the table (YUPACK.confirmed); until then the customer is
//    asked to contact us and no payment is possible. Too many bags for the largest box: contact us.
//  - Orders with any other product (drip bags, tea, wooden boxes): unchanged for now, the earlier regional fee
//    (Honshu/Shikoku 250, Hokkaido/Kyushu 500, Okinawa 550), until their packing is decided.
// International shipping is not handled here and is unchanged (server/quote.js, server/international-rates.js).
// src/lib/shippingPolicy.js shows the same numbers (a test checks they agree).

const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県",
  "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県",
  "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県",
  "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];

const CLICKPOST = Object.freeze({ fee: 250, japanPostCost: 240, maxBags: 2 });

// ゆうパック base rates from 神奈川県 (Japan Post, rates of 2026-10-01; post.japanpost.jp/service/domestic/charge/list/
// yu-pack/14.html, checked against Japan Post's rate API for all 47 prefectures on 2026-11-19). Zones are Japan Post's.
const YUPACK = Object.freeze({
  version: "japanpost-yupack-2026-10-01-kanagawa",
  confirmed: false, // CEO: confirm the table and the box sizes before any payment uses it
  sizes: Object.freeze([{ size: 60, maxBags: 6 }, { size: 80, maxBags: 15 }]),
  rates: Object.freeze({
    kanagawa: Object.freeze({ 60: 840, 80: 1150 }),
    kanto_tohoku_shinetsu_hokuriku_tokai: Object.freeze({ 60: 970, 80: 1320 }),
    kinki: Object.freeze({ 60: 1090, 80: 1440 }),
    chugoku_shikoku: Object.freeze({ 60: 1270, 80: 1580 }),
    kyushu: Object.freeze({ 60: 1550, 80: 1880 }),
    hokkaido: Object.freeze({ 60: 1550, 80: 1880 }),
    okinawa: Object.freeze({ 60: 1600, 80: 1990 }),
  }),
});

const ZONE_OF = (() => {
  const zones = {
    hokkaido: ["北海道"],
    kanagawa: ["神奈川県"],
    kanto_tohoku_shinetsu_hokuriku_tokai: ["青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県", "埼玉県",
      "千葉県", "東京都", "山梨県", "新潟県", "長野県", "富山県", "石川県", "福井県", "岐阜県", "静岡県", "愛知県", "三重県"],
    kinki: ["滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"],
    chugoku_shikoku: ["鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県"],
    kyushu: ["福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県"],
    okinawa: ["沖縄県"],
  };
  return Object.freeze(Object.fromEntries(Object.entries(zones).flatMap(([zone, list]) => list.map((p) => [p, zone]))));
})();

// The earlier regional fee, kept for orders with products other than 100 g bean bags.
const LEGACY_FEES = Object.freeze({ standard: 250, hokkaidoKyushu: 500, okinawa: 550 });
const HOKKAIDO_KYUSHU = new Set(["北海道", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県"]);

class DomesticShippingError extends Error {
  constructor(code, { contact = false } = {}) { super(code); this.code = code; this.contact = contact; }
}

function validPrefecture(prefecture) {
  const p = String(prefecture || "");
  if (!PREFECTURES.includes(p)) throw new DomesticShippingError("PREFECTURE_REQUIRED");
  return p;
}

// items: priced items ({ quantity, clickpost }) -> { shipping, detail } or throws DomesticShippingError.
function domesticShipping(items, prefecture, { yupack = YUPACK } = {}) {
  const p = validPrefecture(prefecture);
  if (!Array.isArray(items) || !items.length) throw new Error("INVALID_ITEMS"); // priceItems() already refuses an empty cart
  if (items.some((item) => item.clickpost !== true)) {
    const fee = p === "沖縄県" ? LEGACY_FEES.okinawa : HOKKAIDO_KYUSHU.has(p) ? LEGACY_FEES.hokkaidoKyushu : LEGACY_FEES.standard;
    return { shipping: fee, detail: { domestic: true, prefecture: p, method: "regional" } };
  }
  const bags = items.reduce((sum, item) => sum + item.quantity, 0);
  if (bags <= CLICKPOST.maxBags) return { shipping: CLICKPOST.fee, detail: { domestic: true, prefecture: p, method: "clickpost", bags } };
  const box = yupack.sizes.find((s) => bags <= s.maxBags);
  if (!box) throw new DomesticShippingError("DOMESTIC_CONTACT_LARGE_ORDER", { contact: true });
  // Never charge from a table the CEO has not confirmed (or one that has no rate): contact us instead of a payment.
  if (yupack.confirmed !== true) throw new DomesticShippingError("YUPACK_RATE_PENDING", { contact: true });
  const fee = yupack.rates[ZONE_OF[p]]?.[box.size];
  if (!Number.isSafeInteger(fee) || fee <= 0) throw new DomesticShippingError("SHIPPING_RATE_UNAVAILABLE", { contact: true });
  return { shipping: fee, detail: { domestic: true, prefecture: p, method: "yupack", size: box.size, bags, zone: ZONE_OF[p], ratesVersion: yupack.version } };
}

module.exports = { PREFECTURES, CLICKPOST, YUPACK, ZONE_OF, LEGACY_FEES, DomesticShippingError, domesticShipping };
