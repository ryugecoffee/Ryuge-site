"use strict";

// 珈琲の定期便: the confirmation mail after sign-up, with the link to the customer's page (/subscription/manage).
// Sent once per subscription (coffeeSubscriptionMails/{sub}_welcome, created once in a transaction), when both halves of
// the sign-up are recorded, whichever Stripe event comes last: the contract from the Checkout page (email, plan) and the
// paid first delivery. Never for a duplicate subscription (the CEO decides; no mail promising deliveries). Only the
// subscription's own email receives it. The mail holds no address or payment details.

const plan = require("./coffee-subscription-plan");
const records = require("./coffee-subscription-records");

const MAILS = "coffeeSubscriptionMails";
const CONTACT = "ryugecoffee@gmail.com";
const yen = (n) => `${Number(n).toLocaleString("ja-JP")}円`;
const monthText = (m) => { const [y, mm] = String(m).split("-").map(Number); return `${y}年${mm}月`; };

// The subscription a Stripe event is about, for the events that complete a sign-up (null otherwise).
function subscriptionOfEvent(event) {
  const o = event?.data?.object;
  if (event?.type === "checkout.session.completed" && o?.mode === "subscription" && o.metadata?.kind === records.KIND) {
    return typeof o.subscription === "string" ? o.subscription : o.subscription?.id || null;
  }
  if (event?.type === "invoice.paid" && o?.billing_reason === "subscription_create") {
    const sub = records.invoiceSubscription(o);
    return sub.metadata?.kind === records.KIND ? sub.id : null;
  }
  return null;
}

function welcomeMail({ to, contract, siteUrl }) {
  const frequency = Number(contract.frequency);
  const days = (plan.SHIPPING_DAYS[frequency] || []).map((d) => `${d}日`).join("・");
  const lines = [
    "龍華珈琲の「珈琲の定期便」にお申し込みいただき、ありがとうございます。",
    "",
    "■ お申し込み内容",
    `・お届け：月${frequency}回（1回 100g×2種類＝200g。豆は店舗でおまかせして選びます）`,
    `・初回：200g・${yen(plan.FIRST_DELIVERY_PRICE)}（税込・送料込み、お支払い済み）。お支払いから3営業日以内に発送します。`,
    `・月額：${yen(plan.MONTHLY_PRICES[frequency])}（税込・全国一律送料込み）。毎月1日にご登録のカードへ請求します。`,
    `・月額のお支払い開始：${monthText(contract.startMonth)}1日`,
    `・2回目以降の発送：毎月 ${days}（土日祝・休業日は翌営業日）`,
    `・${plan.TERMS_JA.term}`,
    `・${plan.annualReferenceText(frequency, contract.startMonth)}`,
    "",
    "■ 管理ページ（お届け予定の確認、回数の変更、スキップ、お届け先・カードの変更、解約）",
    `${siteUrl}/subscription/manage`,
    "ご登録のメールアドレスを入力すると、ログイン用のリンクをお送りします。",
    `回数の変更・スキップは、前月${plan.CHANGE_DEADLINE_DAY}日までに管理ページから行ってください。`,
    "解約は管理ページからいつでもできます。毎月1日のご請求（日本時間9時）より前に解約されると、その月以降のご請求はありません。" + plan.TERMS_JA.noFee,
    "お支払い済みの月の分はお届けします（日割りの返金はありません）。" + plan.TERMS_JA.refund,
    plan.TERMS_JA.emailCancel,
    "",
    "■ 返品について",
    plan.TERMS_JA.returns,
    "",
    `ご不明な点は ${CONTACT} までお問い合わせください。`,
    "",
    "龍華珈琲 / Ryuge Coffee",
  ];
  return { to, subject: "【龍華珈琲】珈琲の定期便のお申し込みを承りました", text: lines.join("\n") };
}

// After a sign-up event has been recorded: the welcome mail, once, if the sign-up is now complete.
async function sendWelcomeIfReady({ db, event, sendMail, siteUrl, now = Date.now(), log = console }) {
  const subscriptionId = subscriptionOfEvent(event);
  if (!subscriptionId) return { sent: false, reason: "NOT_A_SIGN_UP" };
  const ref = db.collection(MAILS).doc(`${subscriptionId}_welcome`);
  const ready = await records.retryOnContention(() => db.runTransaction(async (tx) => {
    const [mail, contractSnap, first] = [await tx.get(ref), await tx.get(db.collection(records.SUBS).doc(subscriptionId)),
      await tx.get(db.collection(records.SHIPMENTS).doc(`${subscriptionId}_first`))];
    if (mail.exists) return { reason: "ALREADY" };
    const contract = contractSnap.exists ? contractSnap.data() : null;
    if (!contract?.checkoutSessionId || !records.normalizeEmail(contract.email) || !plan.MONTHLY_PRICES[Number(contract.frequency)] || !contract.startMonth) {
      return { reason: "WAITING_FOR_CHECKOUT" };
    }
    if (contract.duplicateOf) return { reason: "DUPLICATE_SUBSCRIPTION" };
    if (!first.exists) return { reason: "WAITING_FOR_PAYMENT" };
    tx.create(ref, { subscriptionId, kind: "welcome", status: "sending", createdAt: new Date(now) });
    return { contract };
  }));
  if (!ready.contract) return { sent: false, reason: ready.reason };
  try {
    await sendMail(welcomeMail({ to: records.normalizeEmail(ready.contract.email), contract: ready.contract, siteUrl }));
    await ref.update({ status: "sent", sentAt: new Date(now) });
    return { sent: true };
  } catch (error) {
    // Recorded for the shop (no retry loop through Stripe); the customer's page and Stripe's receipt still work.
    await ref.update({ status: "failed", failedAt: new Date(now) }).catch(() => {});
    log.error("Coffee subscription welcome mail failed:", String(error?.message || "").slice(0, 120));
    return { sent: false, reason: "MAIL_FAILED" };
  }
}

module.exports = { MAILS, subscriptionOfEvent, welcomeMail, sendWelcomeIfReady };
