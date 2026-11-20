"use strict";

// 珈琲の定期便: a cancellation the customer asked for by email because they could not sign in to /subscription/manage
// (TERMS_JA.emailCancel). Shop staff, signed in on the shipping page (/admin/subscription-shipping), enter it; it is
// checked here and carried out with the very steps of the customer's own cancellation (coffee-subscription-stripe.js
// cancelSubscription: Stripe stops charging, the first delivery's refund proposal, stock back), counted from when the
// email arrived:
//  - who: the registered email address finds the contract. An email sent from that address is the check (the staff
//    look at Gmail's sender check first); from any other address, the postal code and the last 4 digits of the phone,
//    as the customer wrote them, must match the contract. The answer is only "matches" or not: the stored details are
//    never shown, and what was entered is never kept (only which check was used).
//  - when: an email that arrived before 09:00 on the 1st counts as a cancellation before that month's charge. If the
//    charge happened anyway because the shop entered it later, that month's deliveries are stopped and its amount is
//    proposed for refund (by hand in Stripe, after the CEO's check). Never refunded automatically.
//  - once: one request id gives one cancellation; what the preview showed must still hold when it is confirmed.
// The registered address is mailed the confirmation; the shop is told of any refund proposal (contract number, amounts).

const plan = require("./coffee-subscription-plan");
const records = require("./coffee-subscription-records");
const ops = require("./coffee-subscription-stripe");

const REQUESTS = "coffeeSubscriptionEmailCancels";
const METHODS = ["registered_address", "details"];
const MAX_AGE_MS = 40 * 24 * 3600e3;
const REQUEST_RE = /^[A-Za-z0-9_-]{12,100}$/;

class EmailCancelError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}

const toDigits = (v) => String(v ?? "").replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/\D/g, "");
const contractRef = (id) => `SUB-${String(id).replace(/^sub_/, "").slice(-6).toUpperCase()}`;
const yen = (n) => `${Number(n).toLocaleString("ja-JP")}円`;
const monthText = (m) => { const [y, mm] = String(m).split("-").map(Number); return `${y}年${mm}月`; };
const jstText = (ms) => { const d = new Date(ms + 9 * 3600e3);
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日 ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };
const staffEmails = (env) => String(env.SHOP_STAFF_EMAILS || "").split(",").map((e) => e.trim()).filter((e) => /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(e));

function parse(body, now) {
  const email = records.normalizeEmail(body?.email);
  if (!/^[^\s@]{1,100}@[^\s@]{1,150}\.[^\s@]+$/.test(email)) throw new EmailCancelError("EMAIL_REQUIRED");
  const method = String(body?.method || "");
  if (!METHODS.includes(method)) throw new EmailCancelError("INVALID_METHOD");
  const postal = toDigits(body?.postalCode);
  const phone4 = toDigits(body?.phoneLast4);
  if (method === "details" && (postal.length !== 7 || phone4.length !== 4)) throw new EmailCancelError("DETAILS_REQUIRED");
  const receivedAt = Date.parse(String(body?.receivedAt || ""));
  if (!Number.isFinite(receivedAt) || receivedAt > now + 60_000 || receivedAt < now - MAX_AGE_MS) throw new EmailCancelError("INVALID_RECEIVED_AT");
  return { email, method, postal, phone4, receivedAt };
}

// The contract the registered address owns, if the check passes. One answer for "no such contract" and "does not match".
async function verifiedContract(db, input) {
  const key = records.emailKey(input.email);
  const owner = await db.collection(records.EMAILS).doc(key).get();
  const id = owner.exists ? owner.data().subscriptionId : null;
  const snap = id ? await db.collection(records.SUBS).doc(id).get() : null;
  const c = snap?.exists ? snap.data() : null;
  const ok = Boolean(c) && records.emailKey(c.email) === key && (input.method === "registered_address"
    || (toDigits(c.shipping?.postalCode) === input.postal && toDigits(c.shipping?.phone).slice(-4) === input.phone4));
  if (!ok) throw new EmailCancelError("NOT_VERIFIED", 404);
  return { id, contract: c };
}

function customerText({ receivedAt, firstUnchargedMonth, monthRefund, firstRefund }) {
  return [
    `定期便の解約を、メールでのご依頼（${jstText(receivedAt)} 受信）により受け付けました。${monthText(firstUnchargedMonth)}以降のご請求はありません。`,
    ...(monthRefund ? [`${monthText(monthRefund.month)}分のご請求（${yen(monthRefund.amount)}）は、ご依頼が1日9時のご請求より前に届いていたため、全額をお支払いのカードへ返金します（${plan.REFUND_BUSINESS_DAYS}営業日以内に手続きします）。この月の発送は行いません。`] : []),
    ...(firstRefund ? [`初回の200gは発送前のため発送を取りやめ、初回分${yen(firstRefund)}を全額、お支払いのカードへ返金します（${plan.REFUND_BUSINESS_DAYS}営業日以内に手続きします）。`] : []),
    plan.TERMS_JA.noFee,
  ].join("\n");
}

async function preview({ db, stripe, body, now }) {
  const input = parse(body, now);
  const { id, contract } = await verifiedContract(db, input);
  const p = await ops.cancellationPreview({ db, stripe, subscriptionId: id, now, requestedAt: input.receivedAt });
  // Already cancelled: nothing changes, unless the email makes a paid month refundable (cancelSubscription).
  const alreadyCancelled = Boolean(contract.cancelRequestedAt) && !(p.late && !contract.monthRefundProposal);
  return { ref: contractRef(id), alreadyCancelled, ended: p.ended, action: p.decision.action,
    endsAt: p.decision.cancelAt ? p.decision.cancelAt * 1000 : now, firstUnchargedMonth: p.late ? p.late.month : p.decision.firstUnchargedMonth,
    monthRefund: p.late ? { month: p.late.month, amount: p.late.amount } : null, firstRefund: p.refundProposalAmount, key: p.key };
}

async function confirm({ db, stripe, body, actor, now, sendMail = async () => {}, env = process.env, log = console }) {
  const input = parse(body, now);
  const requestId = String(body?.requestId || "");
  if (!REQUEST_RE.test(requestId)) throw new EmailCancelError("INVALID_REQUEST_ID");
  const key = String(body?.key || "");
  if (!key) throw new EmailCancelError("PREVIEW_REQUIRED");
  const { id, contract } = await verifiedContract(db, input);
  const ref = db.collection(REQUESTS).doc(requestId);
  const prior = await records.retryOnContention(() => db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return snap.data();
    tx.create(ref, { subscriptionId: id, ref: contractRef(id), method: input.method, receivedAt: new Date(input.receivedAt), by: actor,
      status: "running", createdAt: new Date(now) });
    return null;
  }));
  if (prior) {
    if (prior.subscriptionId !== id) throw new EmailCancelError("REQUEST_ID_CONFLICT", 409);
    if (prior.status === "done") return { ...prior.result, repeated: true };
    throw new EmailCancelError("REQUEST_IN_PROGRESS", 409);
  }
  let result;
  try {
    const r = await ops.cancelSubscription({ db, stripe, subscriptionId: id, now, expectKey: key, requestedAt: input.receivedAt, via: "email" });
    result = { ref: contractRef(id), alreadyCancelled: Boolean(r.duplicate), action: r.action, endsAt: r.cancelAt ? r.cancelAt * 1000 : now,
      firstUnchargedMonth: r.firstUnchargedMonth, firstRefund: r.refundProposal?.amount || 0,
      monthRefund: r.monthRefundProposal ? { month: r.monthRefundProposal.month, amount: r.monthRefundProposal.amount, shippedBefore: r.monthRefundProposal.shippedBefore } : null };
    result.customerText = customerText({ ...result, receivedAt: input.receivedAt });
    await ref.update({ status: "done", result, finishedAt: new Date(now) });
  } catch (error) {
    // Nothing is kept for a request that did not go through: the same request may be sent again.
    await ref.delete().catch(() => {});
    throw error;
  }
  if (!result.alreadyCancelled) {
    try {
      await sendMail({ to: records.normalizeEmail(contract.email), subject: "【龍華珈琲】定期便の解約を受け付けました", text: `${result.customerText}\n\n龍華珈琲 / Ryuge Coffee` });
    } catch (error) { log.error("Email cancellation: customer mail failed:", String(error?.message || "").slice(0, 120)); }
    const staff = staffEmails(env);
    if (staff.length && (result.firstRefund || result.monthRefund)) {
      const lines = [
        "メールでのご依頼による解約を受け付けました。返金の確認をお願いします。", "",
        `契約番号：${result.ref}`, `ご依頼の受信：${jstText(input.receivedAt)}`,
        ...(result.monthRefund ? [`返金の提案：${monthText(result.monthRefund.month)}分 ${yen(result.monthRefund.amount)}（1日9時より前に届いたご依頼の手続きが、請求の後になったため）`,
          `この月の発送：未発送の分は取りやめ済み（準備中だった分の在庫は戻しています）${result.monthRefund.shippedBefore ? `。すでに発送済み ${result.monthRefund.shippedBefore}件` : ""}`] : []),
        ...(result.firstRefund ? [`返金の提案：初回分 ${yen(result.firstRefund)}（初回発送前の解約）`] : []),
        "", `お客様には「${plan.REFUND_BUSINESS_DAYS}営業日以内に返金の手続き」とお伝えしています。CEOの確認後、Stripeで返金してください（自動では返金されません）。`,
      ];
      try {
        await sendMail({ to: staff.join(", "), subject: `【定期便・返金の確認】メールでの解約（${result.ref}）`, text: lines.join("\n") });
      } catch (error) { log.error("Email cancellation: staff notice failed:", String(error?.message || "").slice(0, 120)); }
    }
  }
  return result;
}

// Mounted by coffee-subscription-fulfillment.js after its staff sign-in check (req.staff is the signed-in staff member).
function addRoutes(router, { getDb, getStripe, sendMail, env, clock, log }) {
  const handle = (fn) => async (req, res) => {
    try {
      const stripe = getStripe?.();
      if (!stripe) throw new EmailCancelError("UNAVAILABLE", 503);
      return res.json(await fn({ db: getDb(), stripe, body: req.body || {}, actor: req.staff.actor, now: clock() }));
    } catch (error) {
      if (error instanceof EmailCancelError || error instanceof ops.PlanChangeError) return res.status(error.status || 400).json({ error: error.code });
      log.error("Email cancellation failed:", String(error?.message || "").slice(0, 120));
      return res.status(500).json({ error: "EMAIL_CANCEL_FAILED" });
    }
  };
  router.post("/email-cancel/preview", handle((a) => preview(a)));
  router.post("/email-cancel", handle((a) => confirm({ ...a, sendMail, env, log })));
}

module.exports = { REQUESTS, EmailCancelError, parse, verifiedContract, customerText, preview, confirm, addRoutes };
