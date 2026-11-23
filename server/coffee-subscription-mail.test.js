"use strict";

// 2026-11-19: 珈琲の定期便 — the confirmation mail with the link to the customer's page: once per sign-up, whichever
// Stripe event comes last or how often; never for a duplicate subscription; only to the subscription's own email.
const test = require("node:test");
const assert = require("node:assert/strict");
const plan = require("./coffee-subscription-plan");
const records = require("./coffee-subscription-records");
const mail = require("./coffee-subscription-mail");
const { CALENDAR } = require("./coffee-subscription-calendar");

const CONFIG = { priceIds: { 1: "price_m1", 2: "price_m2", 3: "price_m3", 4: "price_m4" }, calendar: CALENDAR };
const jstAt = (y, m, d, h = 12) => Date.UTC(y, m - 1, d, h - 9);
const SITE = "https://ryuge.biz";

// In-memory Firestore: serialized transactions, reads before writes, create-once, merge, where (== and in).
function fakeFirestore() {
  const store = new Map();
  let lock = Promise.resolve();
  const snap = (key) => ({ id: key.split("/").pop(), exists: store.has(key), data: () => structuredClone(store.get(key)) });
  const merge = (a, b) => ({ ...(a || {}), ...structuredClone(b) });
  const doc = (name, id) => {
    const key = `${name}/${id}`;
    return { key, get: async () => snap(key), set: async (v, o) => { store.set(key, o?.merge ? merge(store.get(key), v) : structuredClone(v)); },
      update: async (v) => { store.set(key, merge(store.get(key), v)); },
      delete: async () => { store.delete(key); },
      create: async (v) => { if (store.has(key)) throw new Error("ALREADY_EXISTS"); store.set(key, structuredClone(v)); } };
  };
  const query = (name, filters) => ({
    where: (fld, op, v) => query(name, [...filters, [fld, op, v]]),
    limit: () => query(name, filters),
    get: async () => ({ docs: [...store.keys()].filter((k) => k.startsWith(name + "/") && k.split("/").length === 2).map(snap)
      .filter((s) => filters.every(([fld, op, v]) => (op === "in" ? v.includes(s.data()[fld]) : s.data()[fld] === v))) }),
  });
  return {
    store,
    collection: (name) => ({ doc: (id) => doc(name, id), add: async (v) => { const id = `auto${store.size}${Math.random().toString(16).slice(2, 8)}`; store.set(`${name}/${id}`, structuredClone(v)); return { id }; }, where: (fld, op, v) => query(name, [[fld, op, v]]), limit: () => query(name, []), get: () => query(name, []).get() }),
    async runTransaction(cb) {
      const run = lock.then(async () => {
        const writes = [];
        const tx = { get: async (ref) => { if (writes.length) throw new Error("READ_AFTER_WRITE"); return snap(ref.key); },
          create: (ref, v) => writes.push(() => { if (store.has(ref.key)) throw new Error("ALREADY_EXISTS"); store.set(ref.key, structuredClone(v)); }),
          set: (ref, v, o) => writes.push(() => store.set(ref.key, o?.merge ? merge(store.get(ref.key), v) : structuredClone(v))),
          update: (ref, v) => writes.push(() => { if (!store.has(ref.key)) throw new Error("NOT_FOUND"); store.set(ref.key, merge(store.get(ref.key), v)); }) };
        const r = await cb(tx);
        for (const w of writes) w();
        return r;
      });
      lock = run.catch(() => {});
      return run;
    },
  };
}

const ev = (type, object) => ({ type, data: { object } });
function events(sub, { email = `${sub}@example.com`, frequency = "2" } = {}) {
  const meta = { kind: records.KIND, frequency, startMonth: "2026-12" };
  const session = { id: `cs_${sub}`, mode: "subscription", subscription: sub, customer: `cus_${sub}`, livemode: false,
    customer_details: { email, name: "テスト 花子" }, metadata: { ...meta, preference: "" },
    collected_information: { shipping_details: { name: "テスト 花子", address: { postal_code: "248-0006", state: "神奈川県", city: "鎌倉市", line1: "小町9-9-9", country: "JP" } } } };
  const first = { id: `in_first_${sub}`, customer: `cus_${sub}`, livemode: false, billing_reason: "subscription_create", amount_paid: 3000, customer_email: email,
    status_transitions: { paid_at: jstAt(2026, 11, 10) / 1000 }, parent: { subscription_details: { subscription: sub, metadata: meta } },
    lines: { data: [{ type: "subscription", pricing: { price_details: { price: `price_m${frequency}` } }, period: { start: plan.billingStartUnix("2026-12"), end: plan.billingStartUnix("2027-01") } }] } };
  return { checkout: ev("checkout.session.completed", session), paid: ev("invoice.paid", first) };
}
// What the webhook does: record the event, then the mail.
async function deliver(db, event, mails, fail = false) {
  await records.handleEvent(db, event, CONFIG);
  return mail.sendWelcomeIfReady({ db, event, siteUrl: SITE, now: jstAt(2026, 11, 10), log: { error: () => {} },
    sendMail: async (m) => { if (fail) throw new Error("smtp down"); mails.push(m); } });
}

test("one mail per sign-up, whichever event comes last and however often", async () => {
  for (const order of [["checkout", "paid"], ["paid", "checkout"]]) {
    const db = fakeFirestore();
    const mails = [];
    const e = events("sub_mail001");
    const firstResult = await deliver(db, e[order[0]], mails);
    assert.equal(firstResult.sent, false, "half a sign-up: no mail yet");
    assert.equal((await deliver(db, e[order[1]], mails)).sent, true);
    await Promise.all([deliver(db, e.paid, mails), deliver(db, e.checkout, mails), deliver(db, e.paid, mails), deliver(db, e.checkout, mails)]);
    assert.equal(mails.length, 1, order.join(" → "));
    assert.equal(mails[0].to, "sub_mail001@example.com");
  }
});

test("the mail: the plan, the start, the link to the customer's page; no address", async () => {
  const db = fakeFirestore();
  const mails = [];
  const e = events("sub_mail002", { frequency: "3", email: " Hanako@Example.COM " });
  await deliver(db, e.checkout, mails);
  await deliver(db, e.paid, mails);
  const m = mails[0];
  assert.equal(m.to, "hanako@example.com");
  // The CEO's wording (2026-11-23), with the contract's own figures.
  assert.equal(m.subject, "【龍華珈琲】定期便のお申し込みを承りました");
  for (const part of ["このたびは、龍華珈琲の定期便にお申し込みいただき、誠にありがとうございます。", "お申し込みと初回のお支払いが完了いたしました。",
    "【お申し込み内容】", "・お届け内容：珈琲豆2種類・各100g", "・お届け回数：月3回", "・初回のお支払い：3,000円（税込・送料込み／",
    "・初回発送：お支払い完了後、3営業日以内", "・月額料金：8,550円（税込・送料込み）", "・月額のお支払い開始：2026年12月1日",
    "初回のお支払いと、毎月のお支払いは別のものです。月額料金は上記の開始日から、毎月1日に自動決済されます。",
    "【ご契約の管理】", "https://ryuge.biz/subscription/manage", "最低継続回数や解約手数料はございません。",
    "詳しい条件は、お申し込み時の確認内容および当店の特定商取引法に基づく表記をご確認ください。", "龍華珈琲 / Ryuge Coffee"]) {
    assert.ok(m.text.includes(part), part);
  }
  // The customer's own address and name never appear (the seller's address does, as the 特定商取引法 page states it).
  for (const secret of ["鎌倉市小町", "小町", "248-0006", "テスト 花子"]) assert.ok(!m.text.includes(secret), secret);
  // Added 2026-11-23: the payment day, the year's reference, the cancellation cut-off, cancelling by email, the refund
  // before the first delivery, the refund policy page, the contact address and the seller.
  assert.match(m.text, /・初回のお支払い：3,000円（税込・送料込み／\d{4}年\d{1,2}月\d{1,2}日 決済済み）/);
  for (const part of ["・1年間の参考：お申し込み時の初回 3,000円と、2026年12月〜2027年11月の月額 8,550円×12か月で、合計 105,600円",
    "【解約・返金について】", "・毎月1日9時（日本時間）のご請求より前に解約された場合、その月以降のご請求はございません。",
    "ryugecoffee@gmail.com へのメールでも解約でき", "件名は「定期便の解約希望」としてください。", "初回の200gを発送する前に解約された場合は、初回分3,000円を全額返金いたします。",
    "返品・返金ポリシーをご確認ください。https://ryuge.biz/refund", "ご不明な点は、ryugecoffee@gmail.com までお問い合わせください。",
    "毎月のお支払いを確認しましたら、金額・お支払い日・その月の発送予定をメールでお知らせいたします。",
    "販売業者：株式会社龍華", "所在地：〒247-0062 神奈川県鎌倉市山ノ内1543 円応寺", "電話番号：090-6312-1717"]) {
    assert.ok(m.text.includes(part), part);
  }
});

test("no mail for a duplicate subscription, for other events, or for the earlier plans", async () => {
  const db = fakeFirestore();
  const mails = [];
  const a = events("sub_mail003", { email: "same@example.com" });
  await deliver(db, a.checkout, mails);
  await deliver(db, a.paid, mails);
  const b = events("sub_mail004", { email: "same@example.com" });
  await deliver(db, b.checkout, mails);
  await deliver(db, b.paid, mails);
  assert.equal(mails.length, 1, "the second subscription for the same email gets no welcome");
  assert.equal(mail.subscriptionOfEvent(ev("invoice.paid", { ...a.paid.data.object, billing_reason: "subscription_cycle" })), null);
  assert.equal(mail.subscriptionOfEvent(ev("checkout.session.completed", { mode: "subscription", subscription: "sub_old", metadata: { plan: "old" } })), null);
  assert.equal(mail.subscriptionOfEvent(ev("payment_intent.succeeded", { id: "pi_1" })), null);
});

test("a failed mail is recorded, never retried in a loop, never breaks the webhook", async () => {
  const db = fakeFirestore();
  const mails = [];
  const e = events("sub_mail005");
  await deliver(db, e.checkout, mails);
  const r = await deliver(db, e.paid, mails, true);
  assert.deepEqual(r, { sent: false, reason: "MAIL_FAILED" });
  assert.equal(db.store.get(`${mail.MAILS}/sub_mail005_welcome`).status, "failed");
  assert.equal((await deliver(db, e.paid, mails)).reason, "ALREADY");
});

// The monthly payment notice (2026-11-23; 特定商取引法 第13条): once per paid month, after the webhook recorded it.
test("payment notice: once per paid month with amount, day, deliveries and the seller; never twice, never in test mode, never for a month in review", async () => {
  const db = fakeFirestore();
  const sent = [];
  const sendMail = async (m) => { sent.push(m); };
  const sub = "sub_mail010";
  const e = events(sub, { frequency: "2" });
  await deliver(db, e.checkout, []);
  await deliver(db, e.paid, []);
  const cycle = (over = {}) => ev("invoice.paid", { id: `in_dec_${sub}`, customer: `cus_${sub}`, livemode: true, billing_reason: "subscription_cycle", amount_paid: 5800,
    status_transitions: { paid_at: jstAt(2026, 12, 1, 10) / 1000 }, parent: { subscription_details: { subscription: sub, metadata: { kind: records.KIND, frequency: "2", startMonth: "2026-12" } } },
    lines: { data: [{ type: "subscription", pricing: { price_details: { price: "price_m2" } }, period: { start: plan.billingStartUnix("2026-12"), end: plan.billingStartUnix("2027-01") } }] }, ...over });
  // Before the webhook recorded the month, nothing is sent.
  assert.equal((await mail.sendMonthlyPaidNoticeIfReady({ db, event: cycle(), sendMail, siteUrl: "https://ryuge.biz" })).reason, "NOT_RECORDED");
  await records.handleEvent(db, cycle(), CONFIG, jstAt(2026, 12, 1, 10));
  const results = await Promise.all([1, 2, 3].map(() => mail.sendMonthlyPaidNoticeIfReady({ db, event: cycle(), sendMail, siteUrl: "https://ryuge.biz", now: jstAt(2026, 12, 1, 10) })));
  assert.equal(results.filter((r) => r.sent).length, 1, "a resent webhook never mails twice");
  assert.equal(sent.length, 1);
  const m = sent[0];
  assert.equal(m.to, `${sub}@example.com`);
  assert.equal(m.subject, "【龍華珈琲】定期便のお支払いを承りました（2026年12月分）");
  for (const part of ["2026年12月分のお支払いを確認いたしました。今月のお届けを、下記のとおり承りました。", "・契約番号：SUB-AIL010", "・お支払い金額：5,800円（税込・送料込み）",
    "・お支払い日：2026年12月1日", "・お届け内容：珈琲豆2種類・各100g（1回200g）を月2回", "・発送予定：12月7日・12月21日", "https://ryuge.biz/subscription/manage",
    "ご不明な点は、ryugecoffee@gmail.com までお問い合わせください。", "販売業者：株式会社龍華", "所在地：〒247-0062 神奈川県鎌倉市山ノ内1543 円応寺", "電話番号：090-6312-1717"]) {
    assert.ok(m.text.includes(part), part);
  }
  assert.doesNotMatch(m.text, /小町|248-0006|テスト 花子/, "no customer address or name");
  // Not a monthly payment: the sign-up invoice, a zero invoice, another subscription kind.
  for (const event of [e.paid, cycle({ amount_paid: 0 }), cycle({ billing_reason: "subscription_update" })]) {
    assert.equal((await mail.sendMonthlyPaidNoticeIfReady({ db, event, sendMail, siteUrl: "https://ryuge.biz" })).sent, false);
  }
  // Test mode: recorded as skipped, never mailed.
  const t = "sub_mail011";
  const te = events(t, { frequency: "1" });
  await deliver(db, te.checkout, []);
  await deliver(db, te.paid, []);
  const testCycle = ev("invoice.paid", { ...cycle().data.object, id: `in_dec_${t}`, customer: `cus_${t}`, livemode: false, amount_paid: 3000,
    parent: { subscription_details: { subscription: t, metadata: { kind: records.KIND, frequency: "1", startMonth: "2026-12" } } },
    lines: { data: [{ type: "subscription", pricing: { price_details: { price: "price_m1" } }, period: { start: plan.billingStartUnix("2026-12"), end: plan.billingStartUnix("2027-01") } }] } });
  await records.handleEvent(db, testCycle, CONFIG, jstAt(2026, 12, 1, 10));
  assert.equal((await mail.sendMonthlyPaidNoticeIfReady({ db, event: testCycle, sendMail, siteUrl: "https://ryuge.biz" })).reason, "TEST_MODE");
  assert.equal(sent.length, 1);
  // A month flagged for the CEO (e.g. charged although skipped): no notice until decided.
  db.store.set(`${records.MONTHS}/${sub}_2027-01`, { subscriptionId: sub, month: "2027-01", status: "paid", invoiceId: "in_jan", amount: 5800, needsReview: true, reviewReason: "CHARGED_SKIPPED_MONTH" });
  const jan = ev("invoice.paid", { ...cycle().data.object, id: "in_jan", lines: { data: [{ type: "subscription", pricing: { price_details: { price: "price_m2" } }, period: { start: plan.billingStartUnix("2027-01"), end: plan.billingStartUnix("2027-02") } }] } });
  assert.equal((await mail.sendMonthlyPaidNoticeIfReady({ db, event: jan, sendMail, siteUrl: "https://ryuge.biz" })).reason, "IN_REVIEW");
  // A mail that fails is recorded, never thrown to the webhook.
  db.store.delete(`${mail.MAILS}/${sub}_2026-12_paid`);
  const failed = await mail.sendMonthlyPaidNoticeIfReady({ db, event: cycle(), sendMail: async () => { throw new Error("smtp down"); }, siteUrl: "https://ryuge.biz", log: { error() {} } });
  assert.deepEqual(failed, { sent: false, reason: "MAIL_FAILED" });
  assert.equal(db.store.get(`${mail.MAILS}/${sub}_2026-12_paid`).status, "failed");
});
