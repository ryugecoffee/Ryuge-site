# International shipping (2026-11-17)

CEO policy: Japan Post tracked delivery; the customer pays the real rate minus RYUGE's subsidy
`min(floor(rate × 30%), 1,000 yen)`; 2–6 bags of coffee beans (max 600 g of coffee); 7+ bags → contact
(`ryugecoffee@gmail.com`); duties, import taxes and local fees are the buyer's; only countries whose shipping and
import conditions are confirmed can pay. The United States stays excluded. The amount is computed on the payment
server (`server/quote.js`, `server/international-rates.js`); the storefront only shows the server's quote.

## Service and rates
- **国際エアパケット (International Air Packet)**: tracked, up to 2 kg, label made in 国際郵便マイページサービス (electronic
  customs data is mandatory for all destinations). International ePacket (国際eパケット) no longer exists (ended 2023-09-30).
- Rate table "国際エアパケットの料金表（国際特定記録料370円を含む）", 100 g steps up to 2,000 g, zones 1–5:
  https://www.post.japanpost.jp/service/send/oversea/list/delivery/airpacket.html — read 2026-11-17.
- **Japan Post revises international rates on 2027-02-01** (notice of 2026-10-09:
  https://www.post.japanpost.jp/service/send/oversea/information/fee_revision_2027/). `RATES_VALID_UNTIL` stops the
  current table at 2027-02-01 00:00 JST: international checkout then asks customers to contact us until the new
  table is entered.
- Packed weight = 120 g per 100 g bag (beans + bag) + 150 g outer packaging. 2 bags = 390 g … 6 bags = 870 g.
  **The CEO should weigh a real 2-bag and 6-bag parcel once** and correct `weightG` / `PACKAGING_WEIGHT_G` if needed.

| Bags | Packed | Zone 1 (TW) rate → customer | Zone 2 (HK, SG) rate → customer |
|---|---|---|---|
| 2 | 390 g | ¥1,020 → ¥714 | ¥1,110 → ¥777 |
| 3 | 510 g | ¥1,220 → ¥854 | ¥1,350 → ¥945 |
| 4 | 630 g | ¥1,320 → ¥924 | ¥1,470 → ¥1,029 |
| 5 | 750 g | ¥1,420 → ¥994 | ¥1,590 → ¥1,113 |
| 6 | 870 g | ¥1,520 → ¥1,064 | ¥1,710 → ¥1,197 |

## Acceptance (Japan Post)
- 差出可否早見表 2026-10-23 (https://www.post.japanpost.jp/service/send/oversea/information/overview.pdf):
  airmail ○ for Taiwan, Hong Kong, Singapore, South Korea, United Kingdom.
- 国際郵便条件表 (https://www.post.japanpost.jp/cgi-kokusai/country.php?cid=…; TW 44, HK 42, SG 179, KR 49, GB 74):
  通常郵便物・航空扱い（国際エアパケットを含む） ◯ for TW, HK, SG; no coffee restriction found on these pages.

## Destinations
| Country | Decision | Reason (sources from the research of 2026-11-17) |
|---|---|---|
| Taiwan (TW) | **Enabled** | Personal-use food ≤ USD 1,000 and ≤ 6 kg needs no inspection application (MOHW/TFDA); roasted beans are not under plant quarantine; duty/business tax waived ≤ NT$2,000 (customs.gov.tw). |
| Hong Kong (HK) | **Enabled** | Free port, no duty; Japanese food restriction covers aquatic products/sea salt/seaweed from 10 prefectures only (Kanagawa not included). |
| Singapore (SG) | **Enabled** | Personal food parcels within limits need no SFA permit (processed food up to 5 kg); GST relief on consignments ≤ S$400 for sellers below the registration thresholds (IRAS). |
| South Korea (KR) | Not yet | Personal-use import limits for food and whether the buyer's personal customs code (개인통관고유부호) and food certificates are needed are unconfirmed. Enable after the CEO confirms; checkout may need a field for the code. |
| United Kingdom (GB) | Not yet | For consignments ≤ £135 the seller must charge UK VAT (no threshold for non-UK sellers); coffee is zero-rated, but registration/exemption must be confirmed first. |
| EU member states | Not yet | Import VAT on every parcel (IOSS or buyer-pays), EU flat duty €3 per item category from 2026-07-01, €2 handling fee and Product Identifier from 2026-11-01; Japan Post refuses B2C parcels to Germany (2026-11-04) and restricts IOSS mail to several states. Needs a per-country decision and possibly an IOSS/DDP provider. |
| United States (US) | Excluded | CEO decision. |

Adding a country: confirm acceptance and import conditions, add it to `INTERNATIONAL_COUNTRIES` (server) and
`INTERNATIONAL_COUNTRY_CODES` (src/lib/shippingPolicy.js); the tests require both lists to match and every enabled
country to have a rate for 2–6 bags.
