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
const CONTACT_LINE = "ご不明な点は、ryugecoffee@gmail.com までお問い合わせください。";
// The seller, as on the 特定商取引法 page (src/pages/LegalNotice.jsx): stated in the payment notices (特定商取引法 第13条).
const SELLER_LINES = ["販売業者：株式会社龍華", "所在地：〒247-0062 神奈川県鎌倉市山ノ内1543 円応寺", "電話番号：090-6312-1717"];
const dayText = (ms) => { const d = new Date(Number(ms) + 9 * 3600e3); return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`; };

// A. The sign-up mail (CEO wording, 2026-11-23). The contract's own figures (server records), never the browser's.
function welcomeMail({ to, contract, siteUrl, paidAt = null }) {
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
    `・初回のお支払い：${yen(plan.FIRST_DELIVERY_PRICE)}（税込・送料込み／${paidAt ? `${dayText(paidAt)} ` : ""}決済済み）`,
    "・初回発送：お支払い完了後、3営業日以内",
    `・月額料金：${yen(plan.MONTHLY_PRICES[frequency])}（税込・送料込み）`,
    `・月額のお支払い開始：${monthText(contract.startMonth)}1日`,
    `・${plan.annualReferenceText(frequency, contract.startMonth)}`,
    "",
    "初回のお支払いと、毎月のお支払いは別のものです。月額料金は上記の開始日から、毎月1日に自動決済されます。",
    "毎月のお支払いを確認しましたら、金額・お支払い日・その月の発送予定をメールでお知らせいたします。",
    "",
    "【ご契約の管理】",
    "お届け回数の変更、スキップ、解約は、以下のページからお手続きいただけます。",
    `${siteUrl}/subscription/manage`,
    "",
    "最低継続回数や解約手数料はございません。",
    "詳しい条件は、お申し込み時の確認内容および当店の特定商取引法に基づく表記をご確認ください。",
    "",
    "【解約・返金について】",
    "・毎月1日9時（日本時間）のご請求より前に解約された場合、その月以降のご請求はございません。",
    `・${plan.TERMS_JA.emailCancelShort}件名は「定期便の解約希望」としてください。`,
    `・${plan.TERMS_JA.refund}`,
    `・返品・返金の詳しい条件は、返品・返金ポリシーをご確認ください。${siteUrl}/refund`,
    "",
    "これからお届けする一杯が、日々のひとときを豊かにするものでありますように。",
    "",
    CONTACT_LINE,
    "",
    SIGNATURE,
    ...SELLER_LINES,
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

// The refund line of the summary: what applies to this contract as it actually is.
function refundSummary({ firstRefund, monthRefund }) {
  if (firstRefund || monthRefund) return "ございます（下記のとおり）";
  return "ございません（初回分は発送済みのため返金の対象外です。お支払い済みの月額料金の日割り返金もございません）";
}

function cancelMail({ to, subscriptionId, acceptedAt, receivedAt = null, endsAt = null, firstUnchargedMonth, voidedMonth = null, upcoming = [], firstRefund = 0, monthRefund = null }) {
  // The day the contract ends: a cancellation that waits for the next 1st ends then (no charge that day); otherwise now.
  const ends = endsAt && endsAt > acceptedAt + 60_000 ? `${jstDay(endsAt)}（この日以降のご請求はございません）` : `${jstDay(acceptedAt)}（解約受付日に終了いたしました）`;
  const lines = [
    "龍華珈琲の定期便をご利用いただき、誠にありがとうございました。",
    "定期便の解約手続きを承りました。",
    "",
    "【解約内容】",
    `・契約番号：${contractRef(subscriptionId)}`,
    `・解約受付日：${jstDay(acceptedAt)}${receivedAt ? `（メールでのご依頼：${jstTime(receivedAt)} 受信）` : ""}`,
    `・契約終了日：${ends}`,
    `・今後の月額請求：ございません${firstUnchargedMonth ? `（${monthText(firstUnchargedMonth)}分以降のご請求はございません）` : ""}`,
    ...(voidedMonth ? [`・お支払いが完了していなかった${monthText(voidedMonth)}分のご請求は、取り消しました`] : []),
    `・今後のお届け：${upcomingText(upcoming)}`,
    `・ご返金：${refundSummary({ firstRefund, monthRefund })}`,
    "",
    ...refundLines({ firstRefund, monthRefund }),
    "これまで龍華珈琲をご利用いただき、心より御礼申し上げます。",
    "またいつか、珈琲を通じてお会いできましたら幸いです。",
    "",
    CONTACT_LINE,
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
    const at = first.data().createdAt;
    return { contract, paidAt: at?.toMillis ? at.toMillis() : at instanceof Date ? at.getTime() : now };
  }));
  if (!ready.contract) return { sent: false, reason: ready.reason };
  try {
    await sendMail(welcomeMail({ to: records.normalizeEmail(ready.contract.email), contract: ready.contract, siteUrl, paidAt: ready.paidAt }));
    await ref.update({ status: "sent", sentAt: new Date(now) });
    return { sent: true };
  } catch (error) {
    // Recorded for the shop (no retry loop through Stripe); the customer's page and Stripe's receipt still work.
    await ref.update({ status: "failed", failedAt: new Date(now) }).catch(() => {});
    log.error("Coffee subscription welcome mail failed:", String(error?.message || "").slice(0, 120));
    return { sent: false, reason: "MAIL_FAILED" };
  }
}

// The monthly payment notice (2026-11-23; 特定商取引法 第13条, 前払式通信販売): a month is paid on the 1st for deliveries
// later in the month, so once a month's charge is paid and recorded (server/coffee-subscription-records.js), the customer
// is told once: the payment accepted, the amount and day received, what is delivered, when it ships, and the seller.
// Once per contract and month (coffeeSubscriptionMails/{sub}_{month}_paid, created in a transaction). Never for a month
// flagged for the CEO (a second or unexpected charge, a duplicate subscription), never in Stripe test mode. It only reads
// what the webhook recorded; it never changes a charge or a delivery, and never fails the webhook.
const NO_NOTICE_REVIEWS = ["DUPLICATE_SUBSCRIPTION", "SECOND_PAID_INVOICE", "CHARGED_SKIPPED_MONTH", "UNKNOWN_PRICE"];
const msOf = (v) => (v?.toMillis ? v.toMillis() : v instanceof Date ? v.getTime() : Number(v) || 0);

function monthlyPaidMail({ to, subscriptionId, month, amount, paidAt, frequency, deliveries, siteUrl }) {
  const dated = deliveries.filter((d) => d.date).map((d) => shortDay(d.date));
  const pending = deliveries.length - dated.length;
  const lines = [
    "いつも龍華珈琲の定期便をご利用いただき、誠にありがとうございます。",
    `${monthText(month)}分のお支払いを確認いたしました。今月のお届けを、下記のとおり承りました。`,
    "",
    "【お支払い内容】",
    `・契約番号：${contractRef(subscriptionId)}`,
    `・お支払い金額：${yen(amount)}（税込・送料込み）`,
    `・お支払い日：${dayText(paidAt)}`,
    `・お届け内容：珈琲豆2種類・各100g（1回200g）を月${frequency}回`,
    `・発送予定：${dated.length ? dated.join("・") : "確定しだいメールでお知らせいたします"}${pending && dated.length ? `（ほか${pending}回は発送日を調整中です）` : ""}`,
    "",
    "発送の際は、あらためてメールでお知らせいたします。",
    "お届け回数の変更、スキップ、解約は、以下のページからお手続きいただけます。",
    `${siteUrl}/subscription/manage`,
    "",
    CONTACT_LINE,
    "",
    SIGNATURE,
    ...SELLER_LINES,
  ];
  return { to, subject: `【龍華珈琲】定期便のお支払いを承りました（${monthText(month)}分）`, text: lines.join("\n") };
}

async function sendMonthlyPaidNoticeIfReady({ db, event, sendMail, siteUrl, now = Date.now(), log = console }) {
  try {
    const invoice = event?.data?.object;
    if (event?.type !== "invoice.paid" || invoice?.billing_reason !== "subscription_cycle" || !(Number(invoice.amount_paid || 0) > 0)) return { sent: false, reason: "NOT_A_MONTHLY_PAYMENT" };
    const sub = records.invoiceSubscription(invoice);
    const line = records.subscriptionLine(invoice);
    if (!sub.id || sub.metadata?.kind !== records.KIND || !line) return { sent: false, reason: "NOT_A_MONTHLY_PAYMENT" };
    const month = plan.monthOf(Number(line.period.start) * 1000);
    const ref = db.collection(MAILS).doc(`${sub.id}_${month}_paid`);
    const ready = await records.retryOnContention(() => db.runTransaction(async (tx) => {
      const [mail, contractSnap, monthSnap] = [await tx.get(ref), await tx.get(db.collection(records.SUBS).doc(sub.id)),
        await tx.get(db.collection(records.MONTHS).doc(`${sub.id}_${month}`))];
      if (mail.exists) return { reason: "ALREADY" };
      const contract = contractSnap.exists ? contractSnap.data() : null;
      if (!contract || !records.normalizeEmail(contract.email)) return { reason: "NO_CONTRACT" };
      if (contract.duplicateOf) return { reason: "DUPLICATE_SUBSCRIPTION" };
      const m = monthSnap.exists ? monthSnap.data() : null;
      if (!m || m.status !== "paid" || m.invoiceId !== invoice.id) return { reason: "NOT_RECORDED" };
      if (m.needsReview && NO_NOTICE_REVIEWS.includes(m.reviewReason)) return { reason: "IN_REVIEW" };
      if (invoice.livemode === false) {
        tx.create(ref, { subscriptionId: sub.id, kind: "monthly_paid", month, status: "skipped_test", createdAt: new Date(now) });
        return { reason: "TEST_MODE" };
      }
      tx.create(ref, { subscriptionId: sub.id, kind: "monthly_paid", month, status: "sending", createdAt: new Date(now) });
      return { contract, monthDoc: m };
    }));
    if (!ready.contract) return { sent: false, reason: ready.reason };
    const shipments = await db.collection(records.SHIPMENTS).where("subscriptionId", "==", sub.id).get();
    const deliveries = shipments.docs.map((d) => d.data()).filter((s) => s.kind === "monthly" && s.month === month && s.status !== "cancelled_before_shipping")
      .sort((a, b) => Number(a.seq) - Number(b.seq)).map((s) => ({ date: s.status === "needs_review" ? null : s.plannedDate || null }));
    const message = monthlyPaidMail({ to: records.normalizeEmail(ready.contract.email), subscriptionId: sub.id, month, amount: Number(ready.monthDoc.amount),
      paidAt: msOf(ready.monthDoc.paidAt) || Number(invoice.status_transitions?.paid_at || 0) * 1000 || now,
      frequency: Number(ready.monthDoc.frequency || ready.contract.frequency), deliveries, siteUrl });
    try {
      await sendMail(message);
      await ref.update({ status: "sent", sentAt: new Date(now) });
      return { sent: true };
    } catch (error) {
      await ref.update({ status: "failed", failedAt: new Date(now) }).catch(() => {});
      log.error("Coffee subscription payment notice failed:", String(error?.message || "").slice(0, 120));
      return { sent: false, reason: "MAIL_FAILED" };
    }
  } catch (error) {
    log.error("Coffee subscription payment notice skipped:", String(error?.message || "").slice(0, 120));
    return { sent: false, reason: "ERROR" };
  }
}

module.exports = { MAILS, subscriptionOfEvent, welcomeMail, sendWelcomeIfReady, cancelMail, upcomingDeliveries, contractRef, monthlyPaidMail,
  sendMonthlyPaidNoticeIfReady };
