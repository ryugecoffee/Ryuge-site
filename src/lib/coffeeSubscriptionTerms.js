// 珈琲の定期便: what the final confirmation screen states (特定商取引法 第12条の6, 定期購入). Provisional wording
// (CEO, 2026-11-18): to be checked by a specialist before sign-ups reopen; set LEGAL_TEXT_REVIEWED to true then.
import { CHANGE_DEADLINE_DAY, FIRST_PRICE, MONTHLY_PRICES, SHIPPING_DAYS, monthLabel, yen } from "./coffeeSubscriptionAccount.js";

export const LEGAL_TEXT_REVIEWED = false;

export const FREQUENCIES = [1, 2, 3, 4];

export function confirmationRows(frequency, startMonth) {
  const days = SHIPPING_DAYS[frequency].map((d) => `${d}日`).join("・");
  return [
    ["商品・分量", `当店おまかせの珈琲豆 2種類（100g × 2袋 = 1回200g）を、月${frequency}回お届けします（月${frequency * 200}g）。`],
    ["初回のお支払い", `${yen(FIRST_PRICE)}（税込・送料込み）。お申し込み時にお支払いいただき、200gを1回お届けします。`],
    ["2回目以降のお支払い", `毎月 ${yen(MONTHLY_PRICES[frequency])}（税込・全国一律送料込み）。日割りはありません。`],
    ["2回目のご請求日", `${monthLabel(startMonth)}1日。以降、毎月1日に自動でお支払いいただきます。`],
    ["お支払い方法", "クレジットカード（Stripe の決済画面で入力します）。"],
    ["発送の時期", `初回：お支払い完了後、3営業日以内に発送します。\n2回目以降：毎月 ${days} に発送します（土日祝・休業日は翌営業日）。`],
    ["契約期間", "期間の定めはありません。最低継続回数もありません。"],
    ["変更・スキップ", `配送回数の変更（月1〜4回）と月単位のスキップは、前月${CHANGE_DEADLINE_DAY}日までのお手続きで翌月分から反映します。${CHANGE_DEADLINE_DAY + 1}日以降は翌々月分からです。`],
    ["解約", "いつでも管理ページから解約できます。毎月1日のご請求（日本時間9時）より前に解約されると、その月以降のご請求はありません。お支払い済みの月の分はお届けします（日割りの返金はありません）。初回の200gを発送する前に解約された場合、初回分は原則として返金します。"],
    ["お届け地域", "日本国内のみ。お届け先は管理ページから変更できます（発送準備中・発送済みの荷物には反映されません）。"],
  ];
}

