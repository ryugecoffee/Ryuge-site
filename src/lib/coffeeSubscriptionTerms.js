// 珈琲の定期便: what the final confirmation screen states (特定商取引法 第12条の6, 定期購入).
// Internal final review (2026-11-20): checked the CAA's six display topics, current terms and checkout copy,
// and public subscription policies from PostCoffee, Tokyo Coffee and Blue Bottle Coffee.
// This flag records the shop's internal wording review; it does not certify legal compliance.
// Enrollment remains independently OFF in src/productData.js and on the payment server.
import { CHANGE_DEADLINE_DAY, FIRST_PRICE, MONTHLY_PRICES, SHIPPING_DAYS, monthLabel, yen } from "./coffeeSubscriptionAccount.js";

export const LEGAL_TEXT_REVIEWED = true;

export const FREQUENCIES = [1, 2, 3, 4];

// The same sentences as server/coffee-subscription-plan.js TERMS_JA (Stripe's page and the mails; a test checks they
// are equal). Drafts until reviewed (LEGAL_TEXT_REVIEWED).
export const REFUND_BUSINESS_DAYS = 7;
export const TERMS_JA = {
  term: "期間の定めのない定期購入です（解約のお手続きをいただくまで、毎月継続いたします）。最低継続回数はございません。",
  noFee: "解約手数料・違約金はございません。",
  refund: `初回の200gを発送する前に解約された場合は、初回分${FIRST_PRICE.toLocaleString("ja-JP")}円を全額返金いたします。返金はお支払い時のカードへ行い、解約受付から${REFUND_BUSINESS_DAYS}営業日以内に手続きいたします（カードへの反映時期は、カード会社によって異なります）。初回の発送後に解約された場合、初回分の返金はございません。`,
  returns: "食品のため、お客様のご都合による返品・交換はお受けしておりません。商品に破損・不足・誤りがございました場合は、到着後7日以内に ryugecoffee@gmail.com までご連絡ください。確認のうえ、交換または返金にて対応いたします。",
  // Cancelling by email when the customer cannot sign in (server/coffee-subscription-email-cancel.js does what this says).
  emailCancel: "管理ページにログインできない場合は、ryugecoffee@gmail.com へ件名「定期便の解約希望」でご連絡いただいても解約できます。ご本人確認のため、ご登録のメールアドレスからのご連絡は送信元を確認いたします。送信元を確認できない場合や、別のアドレスからのご連絡の場合は、ご登録のメールアドレス・郵便番号・電話番号の下4桁をお尋ねいたします（送信元を確認できない場合のお尋ねは、ご登録のメールアドレス宛てにお送りします）。毎月1日9時のご請求より前に届いたご連絡は、その月のご請求より前の解約として扱います（当店の手続きが遅れてその月のご請求が発生した場合は、その月分を全額返金し、まだ発送していない分は発送いたしません。すでに発送した分のお支払い・ご返品は不要です）。",
  // Stripe labels the time before the first monthly charge as a free trial; said plainly next to it (2026-11-21).
  stripeTrialLabel: "決済画面（Stripe）に表示される「○日間無料」「トライアル」は、月額のお支払いが始まる日までの期間を指すもので、無料のお試し期間ではございません。初回分3,000円は、お申し込み時にお支払いいただきます。",
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

// The final confirmation screen (2026-11-23): the first payment and the monthly price apart, the first 200 g apart from
// the monthly deliveries, the exact date of the first monthly charge, and cancellation and refunds in rows of their own.
export function confirmationRows(frequency, startMonth) {
  const days = SHIPPING_DAYS[frequency].map((d) => `${d}日`).join("・");
  return [
    ["商品・分量", "珈琲豆2種類・各100g（1回のお届けにつき200g）。季節や産地の個性に合わせて、当店がお選びいたします。"],
    ["初回のお届け", "200g（珈琲豆2種類・各100g）を1回。お支払い完了後、3営業日以内に発送いたします。"],
    ["毎月のお届け", `月${frequency}回・各回200g（月${frequency * 200}g）。毎月 ${days} に発送いたします（土日祝・休業日は翌営業日）。`],
    ["初回のお支払い", `${yen(FIRST_PRICE)}（税込・送料込み）。お申し込み時に、初回のお届け分としてお支払いいただきます。月額料金とは別のお支払いです。`],
    ["月額料金", `${yen(MONTHLY_PRICES[frequency])}／月（税込・全国一律送料込み）。毎月1日に、その月のお届け分を先払いでお支払いいただきます。日割りはございません。`],
    ["月額のお支払い開始日", `${monthLabel(startMonth)}1日（日本時間9時）。以後、毎月1日に自動決済されます。`],
    ["お支払い方法", "クレジットカード（Stripe の決済画面でご入力いただきます）。"],
    ["契約期間", TERMS_JA.term],
    ["1年間の参考", annualReferenceText(frequency, startMonth)],
    ["変更・スキップ", `配送回数の変更（月1〜4回）と月単位のスキップは、前月${CHANGE_DEADLINE_DAY}日までのお手続きで翌月分から反映いたします。${CHANGE_DEADLINE_DAY + 1}日以降のお手続きは、翌々月分からとなります。`],
    ["解約", `管理ページから、いつでもお手続きいただけます。毎月1日のご請求（日本時間9時）より前に解約された場合、その月以降のご請求はございません。お支払い済みの月の分は、予定どおりお届けいたします。${TERMS_JA.noFee}${TERMS_JA.emailCancel}`],
    ["返金", `${TERMS_JA.refund}お支払い済みの月額料金について、日割りでの返金はございません。`],
    ["返品", TERMS_JA.returns],
    ["お届け地域", "日本国内のみ。お届け先は管理ページから変更できます（発送準備中・発送済みのお荷物には反映されません）。"],
  ];
}

// The summary above the rows: what is paid today, what is paid every month and from when.
export function paymentSummary(frequency, startMonth) {
  return {
    today: { label: "本日のお支払い（初回分）", amount: yen(FIRST_PRICE), note: "初回200gのお届け分・税込・送料込み" },
    monthly: { label: "月額料金", amount: yen(MONTHLY_PRICES[frequency]), note: `月${frequency}回・各回200g・税込・送料込み` },
    start: { label: "月額のお支払い開始日", value: `${monthLabel(startMonth)}1日`, note: "以後、毎月1日に自動決済" },
  };
}
