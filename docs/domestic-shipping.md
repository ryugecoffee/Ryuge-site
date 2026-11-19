# Domestic shipping (CEO decision 2026-11-19)

Code: `server/domestic-shipping.js` (the only place the domestic fee is decided; `server/quote.js` uses it for both the
price shown and the payment). Storefront numbers: `src/lib/shippingPolicy.js` `DOMESTIC` (a test checks they are equal).

| Order | Method | Fee (once per order) |
|---|---|---|
| Coffee beans 100 g (catalog `clickpost: true`), 1–2 bags | クリックポスト (mailbox, tracked) | ¥250 everywhere in Japan, Hokkaido, Kyushu and Okinawa included (Japan Post: ¥240) |
| The same beans, 3–6 bags | ゆうパック 60 size from Kanagawa | Japan Post base rate by destination (table below) |
| The same beans, 7–15 bags | ゆうパック 80 size | idem |
| 16 bags or more | — | contact us (no payment) |
| Any other product in the order (drip bags, tea, wooden boxes) | unchanged | the earlier Honshu/Shikoku ¥250, Hokkaido/Kyushu ¥500, Okinawa ¥550 |
| 定期便 (100 g × 2 every delivery) | クリックポスト | included in the monthly price (unchanged) |
| International | unchanged | `server/international-rates.js` |

## Click Post (Japan Post, rates of 2026-10-01, read 2026-11-19)
¥240 nationwide; longest side ≤ 34 cm, three sides ≤ 60 cm, must fit a mailbox (thickness guide 3 cm), ≤ 2 kg; posted in a
mailbox (counter only if it cannot be posted, ≤ 3 cm); delivered to the mailbox; tracked; no compensation. Two bags side by
side are about 24 × 20 × 2.5 cm and 240 g. Source: post.japanpost.jp/service/send/domestic/delivery/clickpost/.

## Yu-Pack base rates from Kanagawa (2026-10-01; post.japanpost.jp/service/domestic/charge/list/yu-pack/14.html)
| Destination (Japan Post zone) | 60 | 80 |
|---|---|---|
| 神奈川県 | 840 | 1,150 |
| 東北・関東・信越・北陸・東海 | 970 | 1,320 |
| 近畿 | 1,090 | 1,440 |
| 中国・四国 | 1,270 | 1,580 |
| 九州 | 1,550 | 1,880 |
| 北海道 | 1,550 | 1,880 |
| 沖縄 | 1,600 | 1,990 |

Recommended: charge the base rate as above; the shop's own discounts (持込割引 −¥120 per parcel) cover the box (Japan
Post's 60 box ¥110). Box sizes: about 6 bags fit a 60 box (an estimate: to be checked with real bags).

**Until the CEO confirms this table (`YUPACK.confirmed = true` in `server/domestic-shipping.js`), orders of 3 bags or more
are refused before payment (`YUPACK_RATE_PENDING`, contact us).**
