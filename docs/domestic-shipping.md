# Domestic shipping (CEO decision 2026-11-19, final)

Code: `server/domestic-shipping.js` (the only place the domestic fee is decided; `server/quote.js` uses it for both the
price shown and the payment). Storefront numbers: `src/lib/shippingPolicy.js` `DOMESTIC` (a test checks they are equal).

| Order | Method | Customer pays (once per order) |
|---|---|---|
| Coffee beans 100 g (catalog `clickpost: true`), 1–2 bags | クリックポスト (mailbox, tracked) | ¥250 everywhere, Hokkaido, Kyushu and Okinawa included |
| The same beans, 3–15 bags | ゆうパック | the earlier regional fee: Honshu/Shikoku ¥250, Hokkaido/Kyushu ¥500, Okinawa ¥550 (the shop pays the rest) |
| 16 bags or more | — | contact us (no payment; packing not measured) |
| Any other product in the order (drip bags, tea, wooden boxes) | unchanged | the same regional fee |
| 定期便 (100 g × 2 every delivery) | クリックポスト | included in the monthly price (unchanged) |
| International | unchanged | `server/international-rates.js` |

The customer's fee never depends on the box size or Japan Post's rate, so an unmeasured box can never make a wrong
charge; it only changes what the shop pays (below).

## What the shop pays (Japan Post, rates of 2026-10-01, read 2026-11-19)
- Click Post ¥240 nationwide: longest side ≤ 34 cm, three sides ≤ 60 cm, fits a mailbox (thickness guide 3 cm), ≤ 2 kg,
  smallest 14 × 9 cm. post.japanpost.jp/service/send/domestic/delivery/clickpost/
- Yu-Pack from Kanagawa (`YUPACK_COST`, reference only): post.japanpost.jp/service/domestic/charge/list/yu-pack/14.html

| Destination | 60 | 80 | 100 |
|---|---|---|---|
| 神奈川県 | 840 | 1,150 | 1,480 |
| 東北・関東・信越・北陸・東海 | 970 | 1,320 | 1,650 |
| 近畿 | 1,090 | 1,440 | 1,780 |
| 中国・四国 | 1,270 | 1,580 | 1,960 |
| 九州 / 北海道 | 1,550 | 1,880 | 2,220 |
| 沖縄 | 1,600 | 1,990 | 2,480 |

Discounts not assumed: 持込割引 −¥120 per parcel, 複数口 −¥60, ゆうパックスマホ割 −¥180.

## Break-even: the most the beans may cost (no cost data in the code)
Cheapest orders (the seasonal ¥1,000 bag, at most 2 per customer, then ¥1,300 bags), Stripe 3.6 %, packing assumed
(Click Post mailer ¥50, Japan Post boxes 60 ¥110 / 80 ¥160 / 100 ¥200). "Per bag" = what one bag of beans (green beans,
roasting, bag, label) may cost before the order loses money. The second figure is the next box size, in case the
smaller one does not fit.

| Bags | Goods | Worst destination | Customer fee | Japan Post | Per-bag ceiling (box / next box) |
|---|---|---|---|---|---|
| 1 | ¥1,000 | any | ¥250 | ¥240 | ¥915 |
| 2 | ¥2,000 | any | ¥250 | ¥240 | ¥939 |
| 3 | ¥3,300 | 九州・北海道・沖縄 | ¥500–550 | 60: ¥1,550–1,600 | **¥667** / 80: ¥520–541 |
| 3 | ¥3,300 | 中国・四国 | ¥250 | 60: ¥1,270 | ¥680 / ¥560 |
| 6 | ¥7,200 | 沖縄 | ¥550 | 60: ¥1,600 | ¥960 / ¥886 |
| 7 | ¥8,500 | 沖縄 | ¥550 | 80: ¥1,990 | ¥939 / 100: ¥863 |
| 15 | ¥18,900 | 沖縄 | ¥550 | 80: ¥1,990 | ¥1,106 / ¥1,071 |

The tightest case is 3 bags to Kyushu, Hokkaido or Okinawa: no loss while one bag costs at most about ¥667 (¥520 if it
needs an 80 box). Without the seasonal bags (3 × ¥1,300) the ceiling rises by about ¥200 per bag.

Bean cost could not be found (2026-11-19): nothing in the code or docs, and the shop's Google Drive has no purchase
prices for these beans. So no order is called profitable here; only the break-even above. In green-bean terms (assuming
18 % roasting loss, i.e. about 122 g of green beans per 100 g bag, and ¥50 for the bag and label — both assumptions),
3 bags to Kyushu/Hokkaido/Okinawa break even at about ¥5,000 per kg of green beans with a 60 box, about ¥3,850 per kg
with an 80 box. Check each bean's price per kg against these.

## Packing to check (not measured yet)
- Click Post, 2 bags: thickness ≤ 3 cm (the shop's own measurement), longest side ≤ 34 cm, length + width + thickness ≤
  60 cm, ≤ 2 kg (2 × 120 g + mailer), at least 14 × 9 cm, fits a mailbox slot.
- 3–6 bags in a 60 box and 7–15 in an 80 box: estimates. If they do not fit: the next box size (cost above), two parcels
  (複数口 −¥60 each), or, for 3–4 bags, レターパックプラス (¥600 nationwide, A4, hand delivery) — cheaper than any 60 box.
- 16+ bags: contact us until measured (`MAX_BAGS`).

**Not measured yet (2026-11-19): 6 bags in a 60 box, 15 bags in an 80 box.** Safe operation until they are:
1. The customer is never charged again or differently: the fee was fixed at payment (regional fee), whatever box is used.
2. Pack in whatever box the bags really fit; if it is larger, the shop pays the difference (see the ceilings above).
3. If an order does not fit one box, send it as two parcels (複数口 −¥60 each) rather than squeezing it.
4. To limit the risk until measured, `MAX_BAGS` can be lowered (e.g. to 6): larger orders are then asked to contact us
   before payment. One constant in `server/domestic-shipping.js` and `src/lib/shippingPolicy.js` (a test keeps them equal).
