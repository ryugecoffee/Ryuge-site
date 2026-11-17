"use strict";

// International shipping (2026-11-17). Sources and per-country decisions: docs/international-shipping.md.
//
// Service: Japan Post International Air Packet (国際エアパケット): tracked, up to 2 kg, label made in 国際郵便マイページ.
// Rates: Japan Post's table "国際エアパケットの料金表（国際特定記録料370円を含む）", read from
// https://www.post.japanpost.jp/service/send/oversea/list/delivery/airpacket.html on 2026-11-17.
// Japan Post revises international rates on 2027-02-01 (notice of 2026-10-09): from then on this table is not used and
// checkout asks the customer to contact us, until the new table is entered here.
const INTERNATIONAL_RATES_VERSION = "japanpost-airpacket-read-2026-11-17";
const RATES_VALID_UNTIL = "2027-02-01T00:00:00+09:00";

// [maxPackedWeightG, yen]; zone 1: China, Korea, Taiwan; zone 2: rest of Asia; zone 3: Oceania, Canada, Mexico,
// Middle East, Europe.
const AIRPACKET = Object.freeze({
  1: [[100, 720], [200, 820], [300, 920], [400, 1020], [500, 1120], [600, 1220], [700, 1320], [800, 1420], [900, 1520], [1000, 1620],
    [1100, 1720], [1200, 1820], [1300, 1920], [1400, 2020], [1500, 2120], [1600, 2220], [1700, 2320], [1800, 2420], [1900, 2520], [2000, 2620]],
  2: [[100, 750], [200, 870], [300, 990], [400, 1110], [500, 1230], [600, 1350], [700, 1470], [800, 1590], [900, 1710], [1000, 1830],
    [1100, 1950], [1200, 2070], [1300, 2190], [1400, 2310], [1500, 2430], [1600, 2550], [1700, 2670], [1800, 2790], [1900, 2910], [2000, 3030]],
  3: [[100, 880], [200, 1060], [300, 1240], [400, 1420], [500, 1600], [600, 1780], [700, 1960], [800, 2140], [900, 2320], [1000, 2500],
    [1100, 2680], [1200, 2860], [1300, 3040], [1400, 3220], [1500, 3400], [1600, 3580], [1700, 3760], [1800, 3940], [1900, 4120], [2000, 4300]],
});

const RATE_TABLES = Object.freeze({ airpacket: AIRPACKET });

// Enabled destinations: Japan Post accepts airmail (incl. Air Packet) per its 差出可否早見表 of 2026-10-23 and the
// 国際郵便条件表 pages, and roasted coffee for personal use is allowed (see docs/international-shipping.md).
// Not enabled yet: United States (CEO), South Korea (personal customs code), United Kingdom (UK VAT registration),
// EU member states (import VAT/IOSS and the new duty/handling-fee/PID rules; Germany refuses B2C parcels).
const INTERNATIONAL_COUNTRIES = Object.freeze({
  TW: { service: "airpacket", zone: 1 },
  HK: { service: "airpacket", zone: 2 },
  SG: { service: "airpacket", zone: 2 },
});

module.exports = { INTERNATIONAL_RATES_VERSION, RATES_VALID_UNTIL, RATE_TABLES, INTERNATIONAL_COUNTRIES };
