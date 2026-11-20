// 珈琲の定期便: what the final confirmation screen states (特定商取引法 第12条の6, 定期購入). Provisional wording
// (CEO, 2026-11-18): to be checked by a specialist before sign-ups reopen; set LEGAL_TEXT_REVIEWED to true then.
import { CHANGE_DEADLINE_DAY, FIRST_PRICE, MONTHLY_PRICES, SHIPPING_DAYS, monthLabel, yen } from "./coffeeSubscriptionAccount.js";

export const LEGAL_TEXT_REVIEWED = false;

export const FREQUENCIES = [1, 2, 3, 4];

// The same sentences as server/coffee-subscription-plan.js TERMS_JA (Stripe's page and the mails; a test checks they
// are equal). Drafts until reviewed (LEGAL_TEXT_REVIEWED).
export const REFUND_BUSINESS_DAYS = 7;
export const TERMS_JA = {
  term: "期間の定めのない定期購入です（解約されるまで毎月続きます）。最低継続回数はありません。",
  noFee: "解約手数料・違約金はありません。",
  refund: `初回の200gを発送する前に解約された場合は、初回分${FIRST_PRICE.toLocaleString("ja-JP")}円を全額、お支払いに使われたカードへ返金します（解約から${REFUND_BUSINESS_DAYS}営業日以内に手続きします）。発送後の解約では、初回分の返金はありません。`,
  returns: "食品のため、お客様のご都合による返品・交換はお受けしていません。商品に破損・不足・誤りがあった場合は、到着後7日以内に ryugecoffee@gmail.com へご連絡ください。確認のうえ、交換または返金いたします。",
  // Cancelling by email when the customer cannot sign in (server/coffee-subscription-email-cancel.js does what this says).
  emailCancel: "管理ページにログインできない場合は、ryugecoffee@gmail.com へ件名「定期便の解約希望」でご連絡いただいても解約できます。ご本人確認のため、ご登録のメールアドレスからのご連絡は送信元を確認します。送信元を確認できない場合や、別のアドレスからのご連絡の場合は、ご登録のメールアドレス・郵便番号・電話番号の下4桁をお尋ねします（送信元を確認できない場合のお尋ねは、ご登録のメールアドレス宛てにお送りします）。毎月1日9時のご請求より前に届いたご連絡は、その月のご請求より前の解約として扱います（当店の手続きが遅れてその月のご請求が発生した場合は、その月分を全額返金し、まだ発送していない分は発送しません。すでに発送した分のお支払い・返品は不要です）。",
  emailCancelShort: "ログインできない場合は ryugecoffee@gmail.com へのメールでも解約でき、1日9時より前に届いたご連絡はその月のご請求より前の解約として扱います。",
};

const addMonths = (key, n) => { const [y, m] = key.split("-").map(Number); const i = y * 12 + (m - 1) + n; return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`; };
// One year from the first monthly charge: the first delivery + 12 monthly charges (a reference: skips and changes alter it).
export function annualReferenceText(frequency, startMonth) {
  const end = addMonths(startMonth, 11);
  const total = FIRST_PRICE + MONTHLY_PRICES[frequency] * 12;
  const deliveries = 1 + frequency * 12;
  return `1年間の参考：お申し込み時の初回 ${FIRST_PRICE.toLocaleString("ja-JP")}円と、${monthLabel(startMonth)}〜${monthLabel(end)}の月額 ${MONTHLY_PRICES[frequency].toLocaleString("ja-JP")}円×12か月で、合計 ${total.toLocaleString("ja-JP")}円、お届けは合計${deliveries}回・${(deliveries * 200).toLocaleString("ja-JP")}gです（スキップや回数変更をされた場合は変わります。解約されるまで毎月続きます）。`;
}

export function confirmationRows(frequency, startMonth) {
  const days = SHIPPING_DAYS[frequency].map((d) => `${d}日`).join("・");
  return [
    ["商品・分量", `当店おまかせの珈琲豆 2種類（100g × 2袋 = 1回200g）を、月${frequency}回お届けします（月${frequency * 200}g）。`],
    ["初回のお支払い", `${yen(FIRST_PRICE)}（税込・送料込み）。お申し込み時にお支払いいただき、200gを1回お届けします。`],
    ["2回目以降のお支払い", `毎月 ${yen(MONTHLY_PRICES[frequency])}（税込・全国一律送料込み）。日割りはありません。`],
    ["2回目のご請求日", `${monthLabel(startMonth)}1日。以降、毎月1日に自動でお支払いいただきます。`],
    ["お支払い方法", "クレジットカード（Stripe の決済画面で入力します）。"],
    ["発送の時期", `初回：お支払い完了後、3営業日以内に発送します。\n2回目以降：毎月 ${days} に発送します（土日祝・休業日は翌営業日）。`],
    ["契約期間", TERMS_JA.term],
    ["1年間の参考", annualReferenceText(frequency, startMonth)],
    ["変更・スキップ", `配送回数の変更（月1〜4回）と月単位のスキップは、前月${CHANGE_DEADLINE_DAY}日までのお手続きで翌月分から反映します。${CHANGE_DEADLINE_DAY + 1}日以降は翌々月分からです。`],
    ["解約", `いつでも管理ページから解約できます。毎月1日のご請求（日本時間9時）より前に解約されると、その月以降のご請求はありません。${TERMS_JA.noFee}お支払い済みの月の分はお届けします（日割りの返金はありません）。${TERMS_JA.refund}${TERMS_JA.emailCancel}`],
    ["返品", TERMS_JA.returns],
    ["お届け地域", "日本国内のみ。お届け先は管理ページから変更できます（発送準備中・発送済みの荷物には反映されません）。"],
  ];
}

