"use strict";

// 珈琲の定期便 ②: the customer's own page (/subscription/manage) — sign-in by email and what the customer may change.
// Off (every route 404) unless COFFEE_SUBSCRIPTION_MANAGE_ENABLED=true and the monthly price ids are set; independent
// of the sign-up switch (COFFEE_SUBSCRIPTION_ENABLED). Only 珈琲の定期便 contracts (coffeeSubscriptions, kind v2) are
// reachable: the old plans' subscriptions are never read or changed here.
//
// Sign-in: the customer gives an email; if it owns a contract, a link valid for 15 minutes and usable once is mailed
// (only its SHA-256 is stored). The same answer is given whether or not the email is known. The link is exchanged for a
// session of 30 minutes (Authorization: Bearer; only its hash is stored). Limits: per connection (in memory) and per
// email (Firestore, across instances). Every request checks on the server that the session's email still owns the
// contract, so a session can only ever act on its own contract.
//
// Changes: frequency (from a month still changeable), skip and unskip a month, the coffee preference, the delivery
// address (Firestore and the Stripe customer kept the same; deliveries already being prepared or shipped are never
// changed), cancellation (a preview first, then the confirmed one), and Stripe's customer portal limited to the card
// and past invoices. Each change carries a request id: the same request sent twice is applied once.

const crypto = require("crypto");
const express = require("express");
const plan = require("./coffee-subscription-plan");
const records = require("./coffee-subscription-records");
const ops = require("./coffee-subscription-stripe");
const checkout = require("./coffee-subscription-checkout");
const subscriptionMail = require("./coffee-subscription-mail");
const { normalizePreference, preferenceIssues } = require("./coffee-subscription-preference");
const { CALENDAR } = require("./coffee-subscription-calendar");
const { createRateLimiter, clientKey } = require("./rate-limit");

const PATH = "/coffee-subscription/account";
const LOGINS = "coffeeSubscriptionLogins";
const SESSIONS = "coffeeSubscriptionSessions";
const LOGIN_LIMITS = "coffeeSubscriptionLoginLimits";
const REQUESTS = "coffeeSubscriptionRequests";
const AUDIT = "coffeeSubscriptionAudit";

const LOGIN_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 60 * 1000;
const EMAIL_LIMIT = { max: 3, windowMs: 15 * 60 * 1000 };
const PLAN_MONTHS_SHOWN = 6;
const CHANGE_MONTHS_AHEAD = 12;
// Shipment states that may no longer change (set by the shipping work, ④): their address stays as it was.
const FIXED_SHIPMENT_STATES = ["preparing", "shipped", "delivered"];

const PREFECTURES = ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県",
  "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府",
  "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県",
  "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"];

class AccountError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}

const hash = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const newToken = () => crypto.randomBytes(32).toString("base64url");
const contractRef = (id) => `SUB-${String(id).replace(/^sub_/, "").slice(-6).toUpperCase()}`;
const toMs = (v) => (v?.toMillis ? v.toMillis() : v instanceof Date ? v.getTime() : Number(v || 0));

function configFrom(env = process.env) {
  const base = checkout.configFrom({ ...env, COFFEE_SUBSCRIPTION_ENABLED: "true" });
  const pricesComplete = base.enabled; // all five price ids are set
  const portal = String(env.STRIPE_PORTAL_CONFIGURATION_ID || "");
  return { enabled: env.COFFEE_SUBSCRIPTION_MANAGE_ENABLED === "true" && pricesComplete, priceIds: base.priceIds, siteUrl: base.siteUrl,
    portalConfigurationId: /^bpc_[A-Za-z0-9]+$/.test(portal) ? portal : null, calendar: CALENDAR };
}

// ---- Validation -------------------------------------------------------------------------------------------------
const REQUEST_ID_RE = /^[A-Za-z0-9-]{16,64}$/;
function requestIdOf(body) {
  const id = String(body?.requestId || "");
  if (!REQUEST_ID_RE.test(id)) throw new AccountError("REQUEST_ID_REQUIRED");
  return id;
}
// eslint-disable-next-line no-control-regex -- control characters are exactly what is removed
const clean = (value, max) => String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max + 1);

// A Japanese delivery address. Returns the normalized address or throws ADDRESS_<FIELD>.
function validateAddress(input) {
  const a = {
    name: clean(input?.name, 60), postalCode: clean(input?.postalCode, 10).replace(/[^0-9]/g, ""), prefecture: clean(input?.prefecture, 10),
    city: clean(input?.city, 60), line1: clean(input?.line1, 100), line2: clean(input?.line2, 100), phone: clean(input?.phone, 20).replace(/[^0-9+]/g, ""),
  };
  if (!a.name || a.name.length > 60) throw new AccountError("ADDRESS_NAME");
  if (!/^\d{7}$/.test(a.postalCode)) throw new AccountError("ADDRESS_POSTAL_CODE");
  if (!PREFECTURES.includes(a.prefecture)) throw new AccountError("ADDRESS_PREFECTURE");
  if (!a.city || a.city.length > 60) throw new AccountError("ADDRESS_CITY");
  if (!a.line1 || a.line1.length > 100) throw new AccountError("ADDRESS_LINE1");
  if (a.line2.length > 100) throw new AccountError("ADDRESS_LINE2");
  if (!/^(0\d{9,10}|\+81\d{9,10})$/.test(a.phone)) throw new AccountError("ADDRESS_PHONE");
  a.postalCode = `${a.postalCode.slice(0, 3)}-${a.postalCode.slice(3)}`;
  return { ...a, country: "JP" };
}

// ---- Sign-in ----------------------------------------------------------------------------------------------------
// Counts sign-in mails per email in Firestore (shared by every server instance). Returns false when over the limit.
async function takeEmailAllowance(db, emailKey, now) {
  const ref = db.collection(LOGIN_LIMITS).doc(emailKey);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const recent = (snap.exists ? snap.data().sentAt || [] : []).map(toMs).filter((t) => t > now - EMAIL_LIMIT.windowMs);
    if (recent.length >= EMAIL_LIMIT.max) return false;
    tx.set(ref, { sentAt: [...recent, now].map((t) => new Date(t)), updatedAt: new Date(now) });
    return true;
  });
}

async function ownerContract(db, emailKey) {
  const owner = await db.collection(records.EMAILS).doc(emailKey).get();
  const subscriptionId = owner.exists ? owner.data().subscriptionId : null;
  if (!subscriptionId) return null;
  const contract = await db.collection(records.SUBS).doc(subscriptionId).get();
  if (!contract.exists || records.emailKey(contract.data().email) !== emailKey) return null;
  return { id: subscriptionId, data: contract.data() };
}

function loginMail({ to, link }) {
  return { to, subject: "【龍華珈琲】定期便 管理ページのログインリンク",
    text: ["龍華珈琲の定期便 管理ページへのログインリンクです。", "", link, "",
      "このリンクの有効期限は15分で、1回だけ使えます。", "お心当たりがない場合は、このメールを破棄してください。", "",
      "ご不明な点は、ryugecoffee@gmail.com までお問い合わせください。", "", "龍華珈琲 / Ryuge Coffee"].join("\n") };
}

async function requestLogin({ db, config, sendMail, email, now }) {
  const normalized = records.normalizeEmail(email);
  if (!/^[^\s@]{1,100}@[^\s@]{1,150}\.[^\s@]+$/.test(normalized)) throw new AccountError("EMAIL_REQUIRED");
  const emailKey = records.emailKey(normalized);
  // The same answer in every case below, so the page never tells whether an email has a contract.
  const contract = await ownerContract(db, emailKey);
  if (!contract) return { sent: false };
  if (!(await takeEmailAllowance(db, emailKey, now))) return { sent: false, limited: true };
  const token = newToken();
  await db.collection(LOGINS).doc(hash(token)).create({ emailKey, subscriptionId: contract.id, expiresAt: new Date(now + LOGIN_TTL_MS),
    usedAt: null, createdAt: new Date(now) });
  await sendMail(loginMail({ to: normalized, link: `${config.siteUrl}/subscription/manage#login=${token}` }));
  return { sent: true };
}

async function startSession({ db, token, now }) {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(String(token || ""))) throw new AccountError("LOGIN_LINK_INVALID", 401);
  const ref = db.collection(LOGINS).doc(hash(token));
  const sessionToken = newToken();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new AccountError("LOGIN_LINK_INVALID", 401);
    const login = snap.data();
    if (login.usedAt) throw new AccountError("LOGIN_LINK_USED", 401);
    if (toMs(login.expiresAt) <= now) throw new AccountError("LOGIN_LINK_EXPIRED", 401);
    tx.update(ref, { usedAt: new Date(now) });
    tx.create(db.collection(SESSIONS).doc(hash(sessionToken)), { emailKey: login.emailKey, subscriptionId: login.subscriptionId,
      expiresAt: new Date(now + SESSION_TTL_MS), createdAt: new Date(now) });
  });
  return { sessionToken, expiresAt: new Date(now + SESSION_TTL_MS).toISOString() };
}

// The session's contract, checked on every request: a live session whose email still owns that very contract.
async function authenticate({ db, header, now }) {
  const token = /^Bearer ([A-Za-z0-9_-]{40,64})$/.exec(String(header || ""))?.[1];
  if (!token) throw new AccountError("SIGN_IN_REQUIRED", 401);
  const snap = await db.collection(SESSIONS).doc(hash(token)).get();
  if (!snap.exists || toMs(snap.data().expiresAt) <= now) throw new AccountError("SESSION_EXPIRED", 401);
  const session = snap.data();
  const contract = await ownerContract(db, session.emailKey);
  if (!contract || contract.id !== session.subscriptionId) throw new AccountError("SESSION_EXPIRED", 401);
  return { sessionId: hash(token), subscriptionId: contract.id, contract: contract.data, emailKey: session.emailKey };
}

// ---- Idempotent changes -----------------------------------------------------------------------------------------
// A change runs once per request id; a repeat returns the first answer (or 409 while the first is still running).
async function once({ db, auth, requestId, action, now, run }) {
  const ref = db.collection(REQUESTS).doc(`${auth.subscriptionId}_${requestId}`);
  const prior = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return snap.data();
    tx.create(ref, { subscriptionId: auth.subscriptionId, action, status: "running", createdAt: new Date(now) });
    return null;
  });
  if (prior) {
    if (prior.action !== action) throw new AccountError("REQUEST_ID_REUSED", 409);
    if (prior.status === "done") return { ...prior.result, repeated: true };
    if (prior.status === "failed") throw new AccountError(prior.error || "FAILED", prior.httpStatus || 409);
    throw new AccountError("REQUEST_IN_PROGRESS", 409);
  }
  try {
    const result = await run();
    await ref.update({ status: "done", result, finishedAt: new Date() });
    await db.collection(AUDIT).add({ subscriptionId: auth.subscriptionId, action, requestId, session: auth.sessionId.slice(0, 12), at: new Date(now), result });
    return result;
  } catch (error) {
    const code = error?.code && /^[A-Z_]+$/.test(error.code) ? error.code : "FAILED";
    // A refusal is final for this request id; anything unexpected may be retried with the same id.
    if (error instanceof AccountError || error instanceof ops.PlanChangeError || error instanceof plan.PlanError) {
      await ref.update({ status: "failed", error: code, httpStatus: error.status || 400, finishedAt: new Date() });
    } else {
      await ref.delete();
    }
    throw error;
  }
}

// ---- What the page shows ----------------------------------------------------------------------------------------
async function summary({ db, auth, now, config }) {
  const c = auth.contract;
  const months = [];
  const changeable = plan.firstChangeableMonth(now);
  const thisMonth = plan.monthOf(now);
  const from = c.startMonth > thisMonth ? c.startMonth : thisMonth;
  const state = { startMonth: c.startMonth, frequency: c.frequency, changes: c.changes || {}, skips: c.skips || [], cancelFrom: c.firstUnchargedMonth || null };
  const monthDocs = await db.collection(records.MONTHS).where("subscriptionId", "==", auth.subscriptionId).get();
  const recorded = Object.fromEntries(monthDocs.docs.map((d) => [d.data().month, d.data()]));
  for (const m of plan.monthPlan(state, from, PLAN_MONTHS_SHOWN)) {
    const [y, mm] = m.month.split("-").map(Number);
    let dates = [];
    try { dates = m.skipped ? [] : plan.shippingDates(m.month, m.frequency, config.calendar); } catch { dates = []; }
    months.push({ month: m.month, frequency: m.frequency, skipped: m.skipped, amount: m.skipped ? 0 : plan.MONTHLY_PRICES[m.frequency],
      billingDate: `${y}-${String(mm).padStart(2, "0")}-01`, shippingDates: dates, changeable: m.month >= changeable,
      charge: recorded[m.month]?.status || null });
  }
  const shipmentDocs = await db.collection(records.SHIPMENTS).where("subscriptionId", "==", auth.subscriptionId).get();
  const shipments = shipmentDocs.docs.map((d) => d.data()).map((s) => ({ kind: s.kind, month: s.month, seq: s.seq, plannedDate: s.plannedDate || null,
    shipBy: s.shipBy || null, status: s.status })).sort((a, b) => String(a.plannedDate || a.shipBy || a.month).localeCompare(String(b.plannedDate || b.shipBy || b.month)));
  const changeDeadline = (() => { const prev = plan.addMonths(changeable, -1); return `${prev}-${String(plan.CHANGE_DEADLINE_DAY).padStart(2, "0")}`; })();
  return {
    status: c.status, startMonth: c.startMonth, frequency: c.frequencyNow || c.frequency, firstChangeableMonth: changeable, changeDeadline,
    months, shipments, preference: c.preference?.text || "", shipping: c.shipping || null, paymentIssue: c.paymentIssue === true,
    cancellation: c.cancelRequestedAt ? { requestedAt: toMs(c.cancelRequestedAt), endsAt: toMs(c.cancelAt), firstUnchargedMonth: c.firstUnchargedMonth || null,
      refundProposal: c.refundProposal ? { amount: c.refundProposal.amount, status: c.refundProposal.status } : null } : null,
    portalAvailable: Boolean(config.portalConfigurationId), prices: plan.MONTHLY_PRICES, firstPrice: plan.FIRST_DELIVERY_PRICE,
  };
}

function assertChangeable(auth) {
  if (auth.contract.cancelRequestedAt || ops.ENDED.includes(auth.contract.status)) throw new AccountError("SUBSCRIPTION_ENDING", 409);
  if (auth.contract.duplicateOf) throw new AccountError("UNDER_REVIEW", 409);
}

function validMonth(month, now) {
  const m = String(month || "");
  try { plan.parseMonth(m); } catch { throw new AccountError("INVALID_MONTH"); }
  if (m < plan.firstChangeableMonth(now)) throw new AccountError("CHANGE_DEADLINE_PASSED", 409);
  if (m > plan.addMonths(plan.monthOf(now), CHANGE_MONTHS_AHEAD)) throw new AccountError("TOO_FAR_AHEAD");
  return m;
}

// ---- Delivery address: Firestore and the Stripe customer stay the same ---------------------------------------------
// Firestore holds the address with a version; the Stripe customer gets the same address (and version in metadata).
// If two changes cross, the one recorded last is pushed to Stripe again, so both end with the latest address.
async function changeAddress({ db, stripe, auth, address, now }) {
  const ref = db.collection(records.SUBS).doc(auth.subscriptionId);
  const version = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const next = Number(snap.data().shippingVersion || 0) + 1;
    tx.update(ref, { shippingPending: { ...address, version: next }, shippingVersion: next, updatedAt: new Date(now) });
    return next;
  });
  for (let round = 0; round < 3; round++) {
    const current = (await ref.get()).data();
    const pending = current.shippingPending;
    if (!pending) return { version: current.shippingVersion };
    const { version: v, ...a } = pending;
    await stripe.customers.update(current.customerId, {
      shipping: { name: a.name, phone: a.phone, address: { postal_code: a.postalCode, state: a.prefecture, city: a.city, line1: a.line1, line2: a.line2 || "", country: "JP" } },
      metadata: { coffeeShippingVersion: String(v) } });
    const done = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const latest = snap.data().shippingPending;
      if (!latest || latest.version !== v) return false;
      tx.update(ref, { shipping: a, shippingPending: null, shippingSyncedVersion: v, shippingUpdatedAt: new Date(now), updatedAt: new Date(now) });
      return true;
    });
    if (done) break;
  }
  const shipments = await db.collection(records.SHIPMENTS).where("subscriptionId", "==", auth.subscriptionId).get();
  const states = shipments.docs.map((d) => d.data().status);
  return { version, appliesTo: states.filter((s) => s === "planned" || s === "needs_review" || s === "held").length,
    unchanged: states.filter((s) => FIXED_SHIPMENT_STATES.includes(s)).length };
}

// ---- Router -----------------------------------------------------------------------------------------------------
function createRouter({ getDb, getStripe, sendMail, env = process.env, clock = Date.now, log = console,
  loginLimiter = createRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 }), limiter = createRateLimiter({ limit: 60, windowMs: 60 * 1000 }) } = {}) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (!configFrom(env).enabled) return res.status(404).end();
    return next();
  });
  const handle = (fn) => async (req, res) => {
    const config = configFrom(env);
    try {
      return res.json(await fn({ req, db: getDb(), stripe: getStripe(), config, now: clock() }));
    } catch (error) {
      const known = error instanceof AccountError || error instanceof ops.PlanChangeError || error instanceof plan.PlanError;
      if (known) return res.status(error.status || 400).json({ error: error.code });
      log.error("coffee subscription account failed:", String(error?.message).slice(0, 160));
      return res.status(500).json({ error: "FAILED" });
    }
  };
  const authed = (fn) => handle(async (ctx) => {
    if (!limiter(clientKey(ctx.req).key)) throw new AccountError("RATE_LIMITED", 429);
    const auth = await authenticate({ db: ctx.db, header: ctx.req.get("authorization"), now: ctx.now });
    return fn({ ...ctx, auth });
  });
  const mail = async (message) => {
    try { await sendMail(message); } catch (error) { log.error("coffee subscription mail failed:", String(error?.message).slice(0, 120)); }
  };

  router.post("/login", handle(async ({ req, db, config, now }) => {
    if (!loginLimiter(clientKey(req).key)) throw new AccountError("RATE_LIMITED", 429);
    await requestLogin({ db, config, sendMail, email: req.body?.email, now });
    return { ok: true }; // the same answer whether or not the email has a contract
  }));
  router.post("/session", handle(async ({ req, db, now }) => {
    if (!loginLimiter(clientKey(req).key)) throw new AccountError("RATE_LIMITED", 429);
    return startSession({ db, token: req.body?.token, now });
  }));
  router.post("/logout", authed(async ({ req, db }) => {
    const token = /^Bearer (.+)$/.exec(String(req.get("authorization")))[1];
    await db.collection(SESSIONS).doc(hash(token)).delete();
    return { ok: true };
  }));
  router.get("/me", authed(async ({ db, auth, now, config }) => summary({ db, auth, now, config })));

  router.post("/plan", authed(async ({ req, db, stripe, auth, now, config }) => {
    assertChangeable(auth);
    const action = String(req.body?.action || "");
    if (!["skip", "unskip", "frequency"].includes(action)) throw new AccountError("INVALID_ACTION");
    const month = validMonth(req.body?.month, now);
    let request;
    if (action === "skip") request = { skip: month };
    else if (action === "unskip") {
      if (!(auth.contract.skips || []).includes(month)) throw new AccountError("NOT_SKIPPED", 409);
      request = { unskip: month };
    } else {
      let frequency;
      try { frequency = plan.validFrequency(req.body?.frequency); } catch { throw new AccountError("INVALID_FREQUENCY"); }
      request = { frequency, from: month };
    }
    const result = await once({ db, auth, requestId: requestIdOf(req.body), action: `plan.${action}`, now, run: async () => {
      await ops.requestPlanChange({ db, stripe, subscriptionId: auth.subscriptionId, request, config, now });
      return { ok: true, action, month, ...(request.frequency ? { frequency: request.frequency } : {}) };
    } });
    if (!result.repeated) {
      const what = action === "skip" ? `${month} のお届けをスキップ` : action === "unskip" ? `${month} のスキップを取り消し` : `${month} から月${request.frequency}回に変更`;
      await mail({ to: auth.contract.email, subject: "【龍華珈琲】定期便の変更を受け付けました", text: `定期便の変更を受け付けました: ${what}。\n管理ページ: ${config.siteUrl}/subscription/manage\n\nご不明な点は、ryugecoffee@gmail.com までお問い合わせください。\n\n龍華珈琲 / Ryuge Coffee` });
    }
    return result;
  }));

  router.put("/preference", authed(async ({ req, db, auth, now }) => {
    if (ops.ENDED.includes(auth.contract.status)) throw new AccountError("SUBSCRIPTION_ENDED", 409);
    const text = normalizePreference(req.body?.text || "");
    const issues = preferenceIssues(text);
    if (issues.length) throw new AccountError(`PREFERENCE_${issues[0]}`);
    return once({ db, auth, requestId: requestIdOf(req.body), action: "preference", now, run: async () => {
      await db.collection(records.SUBS).doc(auth.subscriptionId).update({ preference: { text, updatedAt: new Date(now) }, updatedAt: new Date(now) });
      return { ok: true, text };
    } });
  }));

  router.put("/address", authed(async ({ req, db, stripe, auth, now }) => {
    if (ops.ENDED.includes(auth.contract.status)) throw new AccountError("SUBSCRIPTION_ENDED", 409);
    const address = validateAddress(req.body?.address);
    const result = await once({ db, auth, requestId: requestIdOf(req.body), action: "address", now,
      run: async () => ({ ok: true, ...(await changeAddress({ db, stripe, auth, address, now })) }) });
    return result;
  }));

  router.get("/cancel", authed(async ({ db, stripe, auth, now }) => {
    if (auth.contract.cancelRequestedAt) return { alreadyRequested: true };
    const preview = await ops.cancellationPreview({ db, stripe, subscriptionId: auth.subscriptionId, now });
    const d = preview.decision;
    // The last month actually paid (from the records), whose deliveries still go out; none before the first monthly charge.
    const paid = (await db.collection(records.MONTHS).where("subscriptionId", "==", auth.subscriptionId).get()).docs
      .map((x) => x.data()).filter((m) => m.status === "paid" && m.month < d.firstUnchargedMonth).map((m) => m.month).sort();
    return { key: preview.key, action: d.action, endsAt: d.cancelAt ? d.cancelAt * 1000 : now, firstUnchargedMonth: d.firstUnchargedMonth,
      lastPaidMonth: paid.at(-1) || null, firstNotShipped: preview.firstNotShipped, refundProposalAmount: preview.refundProposalAmount };
  }));
  router.post("/cancel", authed(async ({ req, db, stripe, auth, now }) => {
    const key = String(req.body?.key || "");
    if (!key) throw new AccountError("CANCEL_PREVIEW_REQUIRED");
    const result = await once({ db, auth, requestId: requestIdOf(req.body), action: "cancel", now, run: async () => {
      const r = await ops.cancelSubscription({ db, stripe, subscriptionId: auth.subscriptionId, now, expectKey: key });
      return { ok: true, action: r.action, endsAt: r.cancelAt ? r.cancelAt * 1000 : now, firstUnchargedMonth: r.firstUnchargedMonth,
        refundProposal: r.refundProposal ? { amount: r.refundProposal.amount, status: r.refundProposal.status } : null,
        ...(r.duplicate ? { duplicate: true } : {}) };
    } });
    // One mail per cancellation: not for a repeated request, nor when the contract was already cancelled (e.g. by email).
    if (!result.repeated && !result.duplicate) {
      const upcoming = await subscriptionMail.upcomingDeliveries(db, auth.subscriptionId).catch(() => null);
      await mail(subscriptionMail.cancelMail({ to: auth.contract.email, subscriptionId: auth.subscriptionId, acceptedAt: now, endsAt: result.endsAt,
        firstUnchargedMonth: result.firstUnchargedMonth, voidedMonth: result.action === "VOID_AND_CANCEL_NOW" ? plan.monthOf(now) : null,
        upcoming, firstRefund: result.refundProposal?.amount || 0 }));
      // The shop is told at once, so the refund (by hand, after the CEO's check) is made within the stated days. Contract
      // number and amount only.
      if (result.refundProposal) {
        const staff = String(env.SHOP_STAFF_EMAILS || "").split(",").map((e) => e.trim()).filter((e) => /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(e));
        if (staff.length) await mail({ to: staff.join(", "), subject: `【定期便・返金の確認】初回発送前の解約（${contractRef(auth.subscriptionId)}）`,
          text: `初回の200gを発送する前に解約されました。発送は取りやめ済みです（準備中だった場合は在庫も戻しています）。\n\n契約番号：${contractRef(auth.subscriptionId)}\n返金の提案：初回分 ${result.refundProposal.amount.toLocaleString("ja-JP")}円（CEO承認待ち）\n\nお客様には「${plan.REFUND_BUSINESS_DAYS}営業日以内に返金の手続き」とお伝えしています。CEOの確認後、Stripeで返金してください（自動では返金されません）。` });
      }
    }
    return result;
  }));

  // Stripe's customer portal, limited by its configuration to the card and past invoices (no plan changes there).
  router.post("/portal", authed(async ({ stripe, auth, config }) => {
    if (!config.portalConfigurationId) throw new AccountError("PORTAL_NOT_CONFIGURED", 503);
    if (!auth.contract.customerId) throw new AccountError("NO_CUSTOMER", 409);
    await prepareCardChange({ stripe, subscriptionId: auth.subscriptionId, customerId: auth.contract.customerId });
    const session = await stripe.billingPortal.sessions.create({ customer: auth.contract.customerId, configuration: config.portalConfigurationId,
      return_url: `${config.siteUrl}/subscription/manage`, locale: "ja" });
    return { url: session.url };
  }));
  return router;
}

// Stripe Checkout gives the subscription its own card, and a subscription's own card is charged before the customer's
// default (verified in test mode, 2026-11-18): a card changed in the portal (the customer's default) would not be used.
// Before the portal opens, the subscription's card becomes the customer's default and the subscription's own is
// removed (in that order, so there is always a card), so the card the customer sets in the portal pays the next and
// any retried charge.
async function prepareCardChange({ stripe, subscriptionId, customerId }) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const own = typeof subscription.default_payment_method === "string" ? subscription.default_payment_method : subscription.default_payment_method?.id;
  if (!own || ops.ENDED.includes(subscription.status)) return { moved: false };
  await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: own } });
  await stripe.subscriptions.update(subscriptionId, { default_payment_method: "" });
  return { moved: true };
}

// The portal configuration the account page uses (made once per Stripe account; its id goes in
// STRIPE_PORTAL_CONFIGURATION_ID): the card and past invoices only. Address, plan changes and cancellation stay on
// Ryuge's own page, so they keep the shop's rules and Firestore and Stripe never disagree.
const PORTAL_CONFIGURATION = {
  business_profile: { headline: "龍華珈琲 定期便: お支払い方法と請求書" },
  features: {
    payment_method_update: { enabled: true },
    invoice_history: { enabled: true },
    customer_update: { enabled: false },
    subscription_cancel: { enabled: false },
    subscription_update: { enabled: false },
  },
};

module.exports = { PATH, configFrom, createRouter, requestLogin, startSession, authenticate, validateAddress, changeAddress, summary, once, prepareCardChange,
  AccountError, PORTAL_CONFIGURATION, LOGINS, SESSIONS, REQUESTS, AUDIT, LOGIN_LIMITS, LOGIN_TTL_MS, SESSION_TTL_MS, PREFECTURES };
