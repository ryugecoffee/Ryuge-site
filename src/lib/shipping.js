/**
 * 送料計算モジュール（ESM）
 * - 国内: 1個¥200 / 2個以上無料 / 定期便無料
 * - 海外: 日本郵便EMS 5地帯区分 × 重量帯
 *
 * server/shipping.js (CJS) と同一ロジックを維持すること。
 */

/** 梱包材重量(g) */
export const PACKAGING_WEIGHT_G = 150;

/** 海外発送の最大重量(g) */
export const MAX_WEIGHT_G = 2000;

/**
 * EMS料金表
 * [最大重量g, [第1地帯, 第2地帯, 第3地帯, 第4地帯, 第5地帯]] 円
 * 出典: 日本郵便 EMS 料金表
 */
export const EMS_RATES = [
  [500,  [1450, 1900, 3150, 3900, 3600]],
  [600,  [1600, 2150, 3400, 4180, 3900]],
  [700,  [1750, 2400, 3650, 4460, 4200]],
  [800,  [1900, 2650, 3900, 4740, 4500]],
  [900,  [2050, 2900, 4150, 5020, 4800]],
  [1000, [2200, 3150, 4400, 5300, 5100]],
  [1250, [2500, 3500, 5000, 5990, 5850]],
  [1500, [2800, 3850, 5550, 6600, 6600]],
  [1750, [3100, 4200, 6150, 7290, 7350]],
  [2000, [3400, 4550, 6700, 7900, 8100]],
];

/**
 * 国コード(ISO 3166-1 alpha-2) → 地帯インデックス(0始まり)のマッピング
 * 0=第1地帯, 1=第2地帯, 2=第3地帯, 3=第4地帯, 4=第5地帯
 * ここに存在しない国コードは発送不可(UNSUPPORTED_COUNTRY)
 */
export const COUNTRY_ZONES = {
  // ── 第1地帯 ──────────────────────────────────────────
  CN: 0, KR: 0, TW: 0,

  // ── 第2地帯（アジア）────────────────────────────────
  SG: 1, TH: 1, VN: 1, MY: 1, PH: 1, ID: 1, IN: 1, HK: 1, MO: 1,
  BD: 1, LK: 1, NP: 1, MM: 1, KH: 1, LA: 1, BT: 1, MV: 1, PK: 1,
  MN: 1,

  // ── 第3地帯（欧州）──────────────────────────────────
  GB: 2, DE: 2, FR: 2, IT: 2, ES: 2, NL: 2, BE: 2, AT: 2, CH: 2,
  SE: 2, NO: 2, DK: 2, FI: 2, PT: 2, IE: 2, PL: 2, CZ: 2, HU: 2,
  RO: 2, GR: 2, HR: 2, SK: 2, BG: 2, SI: 2, LT: 2, LV: 2, EE: 2,
  LU: 2, MT: 2, CY: 2, IS: 2, RS: 2, MK: 2, BA: 2, ME: 2, AL: 2,
  MD: 2, UA: 2, BY: 2, RU: 2, GE: 2, AM: 2, AZ: 2,

  // ── 第3地帯（オセアニア）────────────────────────────
  AU: 2, NZ: 2, FJ: 2, PG: 2, WS: 2, TO: 2, VU: 2, SB: 2,

  // ── 第3地帯（北米: カナダ・メキシコ）──────────────
  CA: 2, MX: 2,

  // ── 第3地帯（中近東）────────────────────────────────
  AE: 2, SA: 2, QA: 2, KW: 2, BH: 2, OM: 2, JO: 2, IL: 2, TR: 2,
  IR: 2, IQ: 2, SY: 2, LB: 2, YE: 2, EG: 2,

  // ── 第4地帯（米国・海外領土）────────────────────────
  US: 3, GU: 3, PR: 3, VI: 3, AS: 3, MP: 3,

  // ── 第5地帯（中南米: メキシコ除く）──────────────────
  BR: 4, AR: 4, CL: 4, CO: 4, PE: 4, VE: 4, EC: 4, BO: 4, PY: 4,
  UY: 4, GT: 4, HN: 4, SV: 4, NI: 4, CR: 4, PA: 4, CU: 4, DO: 4,
  HT: 4, JM: 4, TT: 4, BB: 4, LC: 4, VC: 4, GD: 4, AG: 4, DM: 4,
  KN: 4, BS: 4, TC: 4, KY: 4, BZ: 4, SR: 4, GY: 4,

  // ── 第5地帯（アフリカ）──────────────────────────────
  ZA: 4, NG: 4, KE: 4, GH: 4, TZ: 4, ET: 4, MA: 4, DZ: 4,
  TN: 4, LY: 4, SD: 4, UG: 4, MZ: 4, MG: 4, CM: 4, CI: 4, ZM: 4,
  ZW: 4, SN: 4, AO: 4, RW: 4, BJ: 4, NE: 4, TD: 4, ML: 4, BF: 4,
  MR: 4, GM: 4, GW: 4, SL: 4, LR: 4, GN: 4, TG: 4, GA: 4, CG: 4,
  CD: 4, CF: 4, SO: 4, DJ: 4, ER: 4, NA: 4, BW: 4, LS: 4, SZ: 4,
  MW: 4, MU: 4, SC: 4, RE: 4, YT: 4,
};

/**
 * 商品ID → 単品重量(g) マッピング
 * productData.js の weightG と一致させること。
 */
export const PRODUCT_WEIGHT_G = {
  "enma-zen-dark":    200,
  "enma-ethiopia":    200,
  "enma-burundi-light": 200,
  "enma-colombia":    200,
  "enma-kenya":       200,
  "woodbox-geisha":   170,
  "woodbox-ecuador":  170,
  "enma-coffee-bag":  100,
  "woodbox-tea-bag":  120,
};

/**
 * 国コードから地帯インデックスを返す。
 * JP は null（国内扱い）、未定義国も null（発送不可）。
 * @param {string} countryCode
 * @returns {number|null}
 */
export function getZone(countryCode) {
  if (!countryCode || countryCode === "JP") return null;
  const z = COUNTRY_ZONES[countryCode];
  return z !== undefined ? z : null;
}

/**
 * カートアイテムの内容物重量合計(g)を計算する。
 * @param {Array} items
 * @returns {number}
 */
export function calcItemsWeightG(items) {
  return (items || []).reduce((sum, item) => {
    const perItem = PRODUCT_WEIGHT_G[item.id] || item.weightG || 0;
    return sum + perItem * Number(item.quantity || 0);
  }, 0);
}

/**
 * 送料を計算する。
 * @param {Array}  items       カートアイテム配列
 * @param {string} countryCode ISO 3166-1 alpha-2 / "JP"
 * @returns {number} 送料(円) | { error: string }
 *
 * エラーコード:
 *   "OVER_WEIGHT"         - 総重量 2,000g 超過
 *   "UNSUPPORTED_COUNTRY" - 配送不可の国
 */
export function calcShipping(items, countryCode = "JP") {
  const safeItems = Array.isArray(items) ? items : [];

  // ── 国内 ────────────────────────────────────────────
  if (!countryCode || countryCode === "JP") {
    const hasSubscription = safeItems.some((i) => i.category === "subscription");
    if (hasSubscription) return 0;
    const totalQty = safeItems.reduce((sum, i) => sum + Number(i.quantity || 0), 0);
    return totalQty <= 1 ? 200 : 0;
  }

  // ── 海外 ────────────────────────────────────────────
  const zone = getZone(countryCode);
  if (zone === null) return { error: "UNSUPPORTED_COUNTRY" };

  const contentWeightG = calcItemsWeightG(safeItems);
  const totalWeightG   = contentWeightG + PACKAGING_WEIGHT_G;

  if (totalWeightG > MAX_WEIGHT_G) return { error: "OVER_WEIGHT" };

  const row = EMS_RATES.find(([limit]) => totalWeightG <= limit);
  if (!row) return { error: "OVER_WEIGHT" }; // 念のため

  return row[1][zone];
}
