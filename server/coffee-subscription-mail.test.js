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
    "【お申し込み内容】", "・お届け内容：珈琲豆2種類・各100g", "・お届け回数：月3回", "・初回のお支払い：3,000円（税込・送料込み／決済済み）",
    "・初回発送：お支払い完了後、3営業日以内", "・月額料金：8,550円（税込・送料込み）", "・月額のお支払い開始：2026年12月1日",
    "初回のお支払いと、毎月のお支払いは別のものです。月額料金は上記の開始日から、毎月1日に自動決済されます。",
    "【ご契約の管理】", "https://ryuge.biz/subscription/manage", "最低継続回数や解約手数料はございません。",
    "詳しい条件は、お申し込み時の確認内容および当店の特定商取引法に基づく表記をご確認ください。", "龍華珈琲 / Ryuge Coffee"]) {
    assert.ok(m.text.includes(part), part);
  }
  for (const secret of ["鎌倉", "小町", "248-0006", "テスト 花子"]) assert.ok(!m.text.includes(secret), secret);
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
