"use strict";

// 珈琲の定期便: the confirmation mail after sign-up, with the link to the customer's page (/subscription/manage).
// Sent once per subscription (coffeeSubscriptionMails/{sub}_welcome, created once in a transaction), when both halves of
// the sign-up are recorded, whichever Stripe event comes last: the contract from the Checkout page (email, plan) and the
// paid first delivery. Never for a duplicate subscription (the CEO decides; no mail promising deliveries). Only the
// subscription's own email receives it. The mail holds no address or payment details.

const plan = require("./coffee-subscription-plan");
const records = require("./coffee-subscription-records");

const MAILS = "coffeeSubscriptionMails";
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

const SIGNATURE = "龍華珈琲 / Ryuge Coffee";

// A. The sign-up mail (CEO wording, 2026-11-23). The contract's own figures (server records), never the browser's.
function welcomeMail({ to, contract, siteUrl }) {
  const frequency = Number(contract.frequency);
  const lines = [
    "このたびは、龍華珈琲の定期便にお申し込みいただき、誠にありがとうございます。",
    "お申し込みと初回のお支払いが完了いたしました。",
    "",
    "龍華珈琲では、季節や産地ごとの個性を大切にしながら、珈琲豆をお選びしてお届けいたします。",
    "",
    "【お申し込み内容】",
    "・お届け内容：珈琲豆2種類・各100g",
    `・お届け回数：月${frequency}回`,
    `・初回のお支払い：${yen(plan.FIRST_DELIVERY_PRICE)}（税込・送料込み／決済済み）`,
    "・初回発送：お支払い完了後、3営業日以内",
    `・月額料金：${yen(plan.MONTHLY_PRICES[frequency])}（税込・送料込み）`,
    `・月額のお支払い開始：${monthText(contract.startMonth)}1日`,
    "",
    "初回のお支払いと、毎月のお支払いは別のものです。月額料金は上記の開始日から、毎月1日に自動決済されます。",
    "",
    "【ご契約の管理】",
    "お届け回数の変更、スキップ、解約は、以下のページからお手続きいただけます。",
    `${siteUrl}/subscription/manage`,
    "",
    "最低継続回数や解約手数料はございません。",
    "詳しい条件は、お申し込み時の確認内容および当店の特定商取引法に基づく表記をご確認ください。",
    "",
    "これからお届けする一杯が、日々のひとときを豊かにするものでありますように。",
    "",
    SIGNATURE,
  ];
  return { to, subject: "【龍華珈琲】定期便のお申し込みを承りました", text: lines.join("\n") };
}

// B. The cancellation mail (CEO wording, 2026-11-23), for a cancellation on the customer's page and one asked by email.
// Every line follows what was actually done (server records): the first month no longer charged, a voided unpaid
// invoice, the deliveries still to come (paid months), and a refund only when one was proposed.
const contractRef = (id) => `SUB-${String(id).replace(/^sub_/, "").slice(-6).toUpperCase()}`;
const jstDay = (ms) => { const d = new Date(ms + 9 * 3600e3); return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`; };
const jstTime = (ms) => { const d = new Date(ms + 9 * 3600e3); return `${jstDay(ms)} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };
const shortDay = (key) => { const [, m, d] = String(key).split("-").map(Number); return `${m}月${d}日`; };
const UPCOMING = ["planned", "held", "preparing", "needs_review"];

// The deliveries still to come after a cancellation (paid months only: a cancellation stops everything unpaid).
async function upcomingDeliveries(db, subscriptionId) {
  const snap = await db.collection(records.SHIPMENTS).where("subscriptionId", "==", subscriptionId).get();
  return snap.docs.map((d) => d.data()).filter((s) => UPCOMING.includes(s.status))
    .map((s) => ({ date: s.plannedDate || s.shipBy || null, status: s.status }))
    .sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999")));
}

function upcomingText(upcoming) {
  // Could not be read: nothing is promised beyond the rule itself.
  if (!Array.isArray(upcoming)) return "お支払い済みの月の分は、予定どおりお届けいたします。発送の際は、あらためてメールでお知らせいたします";
  if (!upcoming.length) return "ございません";
  const dated = upcoming.filter((u) => u.date && u.status !== "needs_review");
  const dates = dated.map((u) => `${shortDay(u.date)}${u.status === "preparing" ? "（発送準備中）" : ""}`).join("・");
  const pending = upcoming.length - dated.length;
  return `お支払い済みの分として、あと${upcoming.length}回お届けいたします${dates ? `（${dates}発送予定）` : ""}。`
    + `${pending ? `うち${pending}回は発送日を調整中です。` : ""}発送の際は、あらためてメールでお知らせいたします`;
}

function refundLines({ firstRefund, monthRefund }) {
  const lines = [];
  if (firstRefund) lines.push(`初回分${yen(firstRefund)}は全額返金いたします。`);
  if (monthRefund) {
    lines.push(`${monthText(monthRefund.month)}分のご請求（${yen(monthRefund.amount)}）は、ご依頼が毎月1日9時のご請求より前に届いていたため、全額返金いたします。`
      + (monthRefund.shippedBefore > 0
        ? `この月のお届けのうち、すでに発送した${monthRefund.shippedBefore}回分は、そのままお受け取りください（お支払い・ご返品は不要です）。まだ発送していない分は発送いたしません。`
        : "この月の発送はいたしません。"));
  }
  if (!lines.length) return [];
  return ["【ご返金について】", ...lines,
    `返金はお支払い時のカードへ行い、解約受付から${plan.REFUND_BUSINESS_DAYS}営業日以内に手続きいたします。カードへの反映時期は、カード会社によって異なります。`, ""];
}

function cancelMail({ to, subscriptionId, acceptedAt, receivedAt = null, firstUnchargedMonth, voidedMonth = null, upcoming = [], firstRefund = 0, monthRefund = null }) {
  const lines = [
    "龍華珈琲の定期便をご利用いただき、誠にありがとうございました。",
    "定期便の解約手続きを承りました。",
    "",
    "【解約内容】",
    `・契約番号：${contractRef(subscriptionId)}`,
    `・解約受付日：${jstDay(acceptedAt)}${receivedAt ? `（メールでのご依頼：${jstTime(receivedAt)} 受信）` : ""}`,
    `・今後の月額請求：ございません${firstUnchargedMonth ? `（${monthText(firstUnchargedMonth)}分以降のご請求はございません）` : ""}`,
    ...(voidedMonth ? [`・お支払いが完了していなかった${monthText(voidedMonth)}分のご請求は、取り消しました`] : []),
    `・今後のお届け：${upcomingText(upcoming)}`,
    "",
    ...refundLines({ firstRefund, monthRefund }),
    "これまで龍華珈琲をご利用いただき、心より御礼申し上げます。",
    "またいつか、珈琲を通じてお会いできましたら幸いです。",
    "",
    SIGNATURE,
  ];
  return { to, subject: "【龍華珈琲】定期便の解約を承りました", text: lines.join("\n") };
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

module.exports = { MAILS, subscriptionOfEvent, welcomeMail, sendWelcomeIfReady, cancelMail, upcomingDeliveries, contractRef };
