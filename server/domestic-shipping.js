"use strict";

// Domestic shipping (CEO decision 2026-11-19, final). One fee per order, decided here only (server/quote.js uses it for
// the price shown and for the payment itself).
//  - Coffee beans in 100 g bags (catalog `flatMail: true`), 1–2 bags: flat mail, 250 yen everywhere in Japan (Hokkaido,
//    Kyushu and Okinawa included). For now レターパックライト (CEO 2026-11-19: Japan Post 430 yen; 34 × 24.8 cm, ≤ 3 cm
//    thick, ≤ 4 kg; the shop pays the 180 yen difference). クリックポスト (240 yen) later, once its thin packing is
//    measured: change FLAT_MAIL only. Packing not measured yet: each parcel is checked before posting; a thicker one is
//    not forced (レターパックプラス or another way instead).
//  - The same beans, 3–15 bags: sent by ゆうパック; the customer pays the earlier regional fee (Honshu/Shikoku 250,
//    Hokkaido/Kyushu 500, Okinawa 550) and the shop pays the rest of Japan Post's rate. The fee never depends on the box.
//  - 16 bags or more: contact us (no payment): their box has not been measured. Counted in every order, with other
//    products too.
//  - Orders with any other product (drip bags, tea, wooden boxes): the earlier regional fee, unchanged.
// International shipping is not handled here and is unchanged (server/quote.js, server/international-rates.js).
// src/lib/shippingPolicy.js shows the same numbers (a test checks they agree). YUPACK_COST is Japan Post's rate, kept only
// to know what the shop pays (docs/domestic-shipping.md); it is never charged.

const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県",
  "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県",
  "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県",
  "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];

const FLAT_MAIL = Object.freeze({ method: "letterpack_light", fee: 250, japanPostCost: 430, maxBags: 2 });

// ゆうパック base rates from 神奈川県 (Japan Post, rates of 2026-10-01; post.japanpost.jp/service/domestic/charge/list/
// yu-pack/14.html, checked against Japan Post's rate API for all 47 prefectures on 2026-11-19). What the shop pays, by
// Japan Post's zones. Not charged to customers.
const YUPACK_COST = Object.freeze({
  version: "japanpost-yupack-2026-10-01-kanagawa",
  rates: Object.freeze({
    kanagawa: Object.freeze({ 60: 840, 80: 1150, 100: 1480 }),
    kanto_tohoku_shinetsu_hokuriku_tokai: Object.freeze({ 60: 970, 80: 1320, 100: 1650 }),
    kinki: Object.freeze({ 60: 1090, 80: 1440, 100: 1780 }),
    chugoku_shikoku: Object.freeze({ 60: 1270, 80: 1580, 100: 1960 }),
    kyushu: Object.freeze({ 60: 1550, 80: 1880, 100: 2220 }),
    hokkaido: Object.freeze({ 60: 1550, 80: 1880, 100: 2220 }),
    okinawa: Object.freeze({ 60: 1600, 80: 1990, 100: 2480 }),
  }),
});
// Bags of beans sent by post without asking (the largest order whose packing the shop will check before launch).
const MAX_BAGS = 15;

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

function regionalFee(prefecture) {
  if (prefecture === "沖縄県") return LEGACY_FEES.okinawa;
  return HOKKAIDO_KYUSHU.has(prefecture) ? LEGACY_FEES.hokkaidoKyushu : LEGACY_FEES.standard;
}

// items: priced items ({ quantity, flatMail }) -> { shipping, detail } or throws DomesticShippingError.
function domesticShipping(items, prefecture) {
  const p = validPrefecture(prefecture);
  if (!Array.isArray(items) || !items.length) throw new Error("INVALID_ITEMS"); // priceItems() already refuses an empty cart
  // 16 bags of beans or more: contact us, whatever else is in the order (a tea or 閻魔 珈琲袋 added never lifts the limit).
  const bags = items.filter((item) => item.flatMail === true).reduce((sum, item) => sum + item.quantity, 0);
  if (bags > MAX_BAGS) throw new DomesticShippingError("DOMESTIC_CONTACT_LARGE_ORDER", { contact: true });
  if (items.some((item) => item.flatMail !== true)) return { shipping: regionalFee(p), detail: { domestic: true, prefecture: p, method: "regional" } };
  if (bags <= FLAT_MAIL.maxBags) return { shipping: FLAT_MAIL.fee, detail: { domestic: true, prefecture: p, method: FLAT_MAIL.method, bags } };
  return { shipping: regionalFee(p), detail: { domestic: true, prefecture: p, method: "yupack", bags } };
}

module.exports = { PREFECTURES, FLAT_MAIL, YUPACK_COST, MAX_BAGS, ZONE_OF, LEGACY_FEES, DomesticShippingError, domesticShipping, regionalFee };
