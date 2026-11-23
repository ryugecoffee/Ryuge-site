"use strict";

// The customer's mails in the CEO's wording (2026-11-23): A. sign-up (coffee-subscription-mail.test.js), B. cancellation and
// C. shipped, for every state the wording depends on. Pure builders only: nothing is sent, no Stripe, no Firestore.
const test = require("node:test");
const assert = require("node:assert/strict");
const notice = require("./shipping-notice");
const subMail = require("./coffee-subscription-mail");

const SHIPPED_AT = Date.UTC(2026, 11, 5, 3); // 2026-12-05 12:00 JST
const ACCEPTED = Date.UTC(2026, 10, 23, 1); // 2026-11-23 10:00 JST
const NO_PERSONAL = /〒|様\n|0900000000|1-2-3/;

test("C. shipped (store order, coffee beans, with a tracking number): the CEO's text, every line", () => {
  const m = notice.orderShippedMail({ to: "a@example.com", ref: "R-1A2B3C4D", items: [{ name: "エチオピア ジンマ", quantity: 2, kind: "beans" }], method: "clickpost",
    trackingNumber: "1234-5678-9012", shippedAt: SHIPPED_AT });
  assert.equal(m.subject, "【龍華珈琲】珈琲を発送いたしました");
  assert.equal(m.text, [
    "いつも龍華珈琲をご利用いただき、誠にありがとうございます。",
    "本日、珈琲豆を発送いたしました。",
    "",
    "【発送内容】",
    "・ご注文番号：R-1A2B3C4D",
    "・商品：エチオピア ジンマ",
    "・数量：2袋",
    "・発送日：2026年12月5日",
    "・配送方法：クリックポスト",
    "・お問い合わせ番号：1234-5678-9012",
    "",
    "配送状況は、日本郵便の追跡サービスよりご確認いただけます。",
    "https://trackings.post.japanpost.jp/services/srv/search/",
    "",
    "お届けまで、今しばらくお待ちください。",
    "珈琲とともに、穏やかな時間をお過ごしいただけますように。",
    "",
    "ご不明な点は、ryugecoffee@gmail.com までお問い合わせください。",
    "",
    "龍華珈琲 / Ryuge Coffee",
  ].join("\n"));
});

test("C. shipped: no tracking number → no tracking lines; several items; tea is not called coffee; a resent mail keeps the ship day", () => {
  const plain = notice.orderShippedMail({ to: "a@example.com", items: [{ name: "ペルー", quantity: 1, kind: "beans" }, { name: "グアテマラ", quantity: 2, kind: "beans" }],
    method: "letterpack_light", trackingNumber: null, shippedAt: SHIPPED_AT });
  assert.doesNotMatch(plain.text, /お問い合わせ番号|追跡サービス|trackings\.post/);
  assert.match(plain.text, /・商品：ペルー（1袋）\n・商品：グアテマラ（2袋）\n・数量：計3袋\n・発送日：2026年12月5日\n・配送方法：レターパックライト\n\nお届けまで/);
  const tea = notice.orderShippedMail({ to: "a@example.com", items: [{ name: "奥八女 ほうじ茶", quantity: 1, kind: "tea" }, { name: "エチオピア ジンマ", quantity: 1, kind: "beans" }],
    method: "yupack", trackingNumber: "1111-2222-3333", shippedAt: SHIPPED_AT });
  assert.equal(tea.subject, "【龍華珈琲】ご注文の品を発送いたしました");
  assert.match(tea.text, /本日、ご注文の品を発送いたしました。/);
  assert.match(tea.text, /・数量：計2点/);
  assert.match(tea.text, /お届けの品とともに、穏やかな時間をお過ごしいただけますように。/);
  assert.doesNotMatch(tea.text, /珈琲豆を発送|珈琲とともに/);
  const firestoreTimestamp = { toMillis: () => SHIPPED_AT };
  assert.match(notice.orderShippedMail({ to: "x", items: [{ name: "A", quantity: 1, kind: "beans" }], method: "yupack", shippedAt: firestoreTimestamp }).text, /2026年12月5日/);
  for (const m of [plain, tea]) assert.doesNotMatch(m.text, NO_PERSONAL);
});

test("C. shipped: international orders get the same content in English", () => {
  const m = notice.orderShippedMail({ to: "a@example.com", items: [{ name: "Jimma", quantity: 2, kind: "beans" }], method: "intl_air_packet", trackingNumber: "RR123456789JP",
    shippedAt: SHIPPED_AT, english: true });
  assert.equal(m.subject, "Ryuge Coffee: your coffee has been shipped");
  assert.match(m.text, /Shipped on: December 5, 2026[\s\S]*Japan Post International Air Packet[\s\S]*Tracking number: RR123456789JP/);
});

test("C. shipped (珈琲の定期便): the two beans, 2 bags, which delivery", () => {
  const m = notice.subscriptionShippedMail({ to: "a@example.com", contract: "SUB-BCDEF9", which: "12月分・1回目", beans: ["ペルー", "グアテマラ"], method: "letterpack_plus", trackingNumber: "1111-2222-3333", shippedAt: SHIPPED_AT });
  assert.equal(m.subject, "【龍華珈琲】珈琲を発送いたしました");
  assert.match(m.text, /・契約番号：SUB-BCDEF9\n・商品：珈琲の定期便（12月分・1回目） ペルー・グアテマラ（各100g）\n・数量：2袋\n・発送日：2026年12月5日\n・配送方法：レターパックプラス\n・お問い合わせ番号：1111-2222-3333/);
  const unnamed = notice.subscriptionShippedMail({ to: "a@example.com", which: "初回", beans: [], method: "clickpost", trackingNumber: null, shippedAt: SHIPPED_AT });
  assert.match(unnamed.text, /・商品：珈琲の定期便（初回） 珈琲豆2種類（各100g）\n・数量：2袋/);
  assert.doesNotMatch(unnamed.text, /お問い合わせ番号/);
});

const cancel = (over = {}) => subMail.cancelMail({ to: "a@example.com", subscriptionId: "sub_1AbCdEf9", acceptedAt: ACCEPTED, firstUnchargedMonth: "2026-12", upcoming: [], ...over }).text;

test("B. cancelled before the first delivery shipped: the refund section, the CEO's text", () => {
  const m = subMail.cancelMail({ to: "a@example.com", subscriptionId: "sub_1AbCdEf9", acceptedAt: ACCEPTED, endsAt: Date.UTC(2026, 11, 1, 0), firstUnchargedMonth: "2026-12", upcoming: [], firstRefund: 3000 });
  assert.equal(m.subject, "【龍華珈琲】定期便の解約を承りました");
  assert.equal(m.text, [
    "龍華珈琲の定期便をご利用いただき、誠にありがとうございました。",
    "定期便の解約手続きを承りました。",
    "",
    "【解約内容】",
    "・契約番号：SUB-BCDEF9",
    "・解約受付日：2026年11月23日",
    "・契約終了日：2026年12月1日（この日以降のご請求はございません）",
    "・今後の月額請求：ございません（2026年12月分以降のご請求はございません）",
    "・今後のお届け：ございません",
    "・ご返金：ございます（下記のとおり）",
    "",
    "【ご返金について】",
    "初回分3,000円は全額返金いたします。",
    "返金はお支払い時のカードへ行い、解約受付から7営業日以内に手続きいたします。カードへの反映時期は、カード会社によって異なります。",
    "",
    "これまで龍華珈琲をご利用いただき、心より御礼申し上げます。",
    "またいつか、珈琲を通じてお会いできましたら幸いです。",
    "",
    "ご不明な点は、ryugecoffee@gmail.com までお問い合わせください。",
    "",
    "龍華珈琲 / Ryuge Coffee",
  ].join("\n"));
});

test("B. after the first delivery: no refund section; a paid month's deliveries listed; an unpaid month voided; email cancellations", () => {
  const shipped = cancel();
  assert.doesNotMatch(shipped, /【ご返金について】|返金いたします/, "no refund promised when none applies");
  assert.match(shipped, /・ご返金：ございません（初回分は発送済みのため返金の対象外です。お支払い済みの月額料金の日割り返金もございません）/);
  assert.match(shipped, /・契約終了日：2026年11月23日（解約受付日に終了いたしました）/, "ended now (no later end date given)");
  assert.match(cancel({ endsAt: Date.UTC(2027, 0, 1, 0), firstUnchargedMonth: "2027-01" }), /・契約終了日：2027年1月1日（この日以降のご請求はございません）/);
  assert.match(shipped, /・今後のお届け：ございません\n/);
  const paidMonth = cancel({ firstUnchargedMonth: "2027-01", upcoming: [{ date: "2026-12-05", status: "planned" }, { date: "2026-12-20", status: "preparing" }] });
  assert.match(paidMonth, /・今後の月額請求：ございません（2027年1月分以降のご請求はございません）/);
  assert.match(paidMonth, /・今後のお届け：お支払い済みの分として、あと2回お届けいたします（12月5日・12月20日（発送準備中）発送予定）。発送の際は、あらためてメールでお知らせいたします/);
  const review = cancel({ firstUnchargedMonth: "2027-01", upcoming: [{ date: null, status: "needs_review" }] });
  assert.match(review, /あと1回お届けいたします。うち1回は発送日を調整中です。/);
  const unknown = cancel({ upcoming: null });
  assert.match(unknown, /・今後のお届け：お支払い済みの月の分は、予定どおりお届けいたします。/, "records unreadable: the rule only, no dates invented");
  const voided = cancel({ voidedMonth: "2026-12" });
  assert.match(voided, /・お支払いが完了していなかった2026年12月分のご請求は、取り消しました/);
  const byEmail = cancel({ receivedAt: Date.UTC(2026, 10, 30, 22, 30), firstUnchargedMonth: "2026-12",
    monthRefund: { month: "2026-12", amount: 5800, shippedBefore: 1 } });
  assert.match(byEmail, /・解約受付日：2026年11月23日（メールでのご依頼：2026年12月1日 07:30 受信）/);
  assert.match(byEmail, /【ご返金について】\n2026年12月分のご請求（5,800円）は、ご依頼が毎月1日9時のご請求より前に届いていたため、全額返金いたします。この月のお届けのうち、すでに発送した1回分は、そのままお受け取りください/);
  assert.match(byEmail, /返金はお支払い時のカードへ行い、解約受付から7営業日以内に手続きいたします。/);
  for (const t of [shipped, paidMonth, voided, byEmail]) assert.doesNotMatch(t, NO_PERSONAL);
});

test("B. the deliveries still to come are read from the records: only open ones, by date", async () => {
  const docs = [
    { subscriptionId: "sub_x", status: "shipped", plannedDate: "2026-12-05" },
    { subscriptionId: "sub_x", status: "planned", plannedDate: "2026-12-20" },
    { subscriptionId: "sub_x", status: "preparing", plannedDate: "2026-12-12" },
    { subscriptionId: "sub_x", status: "cancelled_before_shipping", plannedDate: "2026-12-26" },
  ];
  const db = { collection: () => ({ where: () => ({ get: async () => ({ docs: docs.map((d) => ({ data: () => d })) }) }) }) };
  assert.deepEqual(await subMail.upcomingDeliveries(db, "sub_x"), [{ date: "2026-12-12", status: "preparing" }, { date: "2026-12-20", status: "planned" }]);
});
