"use strict";

// The shop tells Factory (Jennifer) what needs attention (2026-11-22): new payments, shipping deadlines, stock, failed
// payments, shipping mails that could not be sent, store webhooks that failed.
//  - One event, one id, chosen from what it is about (e.g. order.paid:pi_…): a Stripe resend, a second sweep or a
//    retry never makes a second notice, here (factoryNotices/{id} is created once) or in Factory (it keeps the id).
//  - Kept here first, then sent: a notice is never lost while Factory is unreachable; unsent ones are retried with a
//    growing pause, up to a limit, then left as "failed" (visible in Firestore).
//  - Signed: X-Ryuge-Timestamp (13-digit ms) and X-Ryuge-Signature = hex HMAC-SHA256(FACTORY_NOTIFY_HMAC_SECRET,
//    "POST\n" + <URL path> + "\n" + timestamp + "\n" + body). The secret is separate from every other one.
//  - Nothing personal: no name, email, phone or street address; the order number, amounts, products, prefecture.
//  - Off unless FACTORY_NOTIFY_URL (https) and FACTORY_NOTIFY_HMAC_SECRET (≥ 32 bytes) are set: then nothing is kept.

const crypto = require("node:crypto");

const NOTICES = "factoryNotices";
const SITE_ID = "ryuge-coffee";
const MAX_ATTEMPTS = 12;
const ID_RE = /^[a-z_.]{3,40}:[A-Za-z0-9_:.-]{1,160}$/;
// What each kind of notice is: "info" (for the record) or "action" (someone should look).
const TYPES = Object.freeze({
  "order.paid": "info",
  "subscription.paid": "info",
  "deadline.soon": "action",
  "deadline.overdue": "action",
  "stock.low": "action",
  "stock.short": "action",
  "payment.failed": "action",
  "mail.failed": "action",
  "webhook.failed": "action",
});
// Fields a notice may carry (anything else is dropped before it is kept): never a name, email, phone or address.
const DATA_FIELDS = ["kind", "ref", "orderId", "shipmentId", "amount", "currency", "items", "prefecture", "countryCode", "shippingMethod",
  "shipBy", "date", "month", "label", "frequency", "sku", "product", "left", "attempt", "reason", "eventType", "skus", "livemode"];

function config(env = process.env) {
  const url = String(env.FACTORY_NOTIFY_URL || "");
  const secret = String(env.FACTORY_NOTIFY_HMAC_SECRET || "");
  let path = null;
  try { const u = new URL(url); if (u.protocol === "https:" || (u.protocol === "http:" && ["127.0.0.1", "localhost"].includes(u.hostname))) path = u.pathname; } catch { path = null; }
  return { enabled: Boolean(path) && Buffer.byteLength(secret, "utf8") >= 32, url, secret, path };
}

const signatureFor = (secret, path, timestamp, body) =>
  crypto.createHmac("sha256", secret).update(`POST\n${path}\n${timestamp}\n`, "utf8").update(body, "utf8").digest("hex");

function sanitize(data = {}) {
  const out = {};
  for (const k of DATA_FIELDS) {
    if (data[k] === undefined || data[k] === null) continue;
    const v = data[k];
    if (Array.isArray(v)) out[k] = v.slice(0, 20).map((x) => (x && typeof x === "object" ? { name: String(x.name || x.id || "").slice(0, 80), quantity: Number(x.quantity) || 0 } : String(x).slice(0, 80)));
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else out[k] = String(v).slice(0, 120);
  }
  return out;
}

// Keep a notice (once per id). Returns true when it was new.
async function record(db, { id, type, data, at = Date.now() }, env = process.env) {
  if (!config(env).enabled) return false;
  if (!TYPES[type] || !ID_RE.test(String(id || "")) || !String(id).startsWith(`${type}:`)) throw new Error("INVALID_NOTICE");
  try {
    await db.collection(NOTICES).doc(String(id).replace(/\//g, "_")).create({ id, type, severity: TYPES[type], data: sanitize(data), occurredAt: new Date(at),
      status: "pending", attempts: 0, nextAt: new Date(at), createdAt: new Date(at) });
    return true;
  } catch (error) {
    if (error?.code === 6 || /ALREADY_EXISTS|already exists/i.test(String(error?.message))) return false;
    throw error;
  }
}

// Send one kept notice. Factory answers 200 (kept) or 409 (already kept): both mean done.
async function sendOne(db, doc, { env = process.env, fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const c = config(env);
  const n = doc.data();
  const body = JSON.stringify({ eventId: n.id, siteId: SITE_ID, type: n.type, severity: n.severity, occurredAt: n.occurredAt?.toMillis ? n.occurredAt.toMillis() : Number(new Date(n.occurredAt)), data: n.data || {} });
  const timestamp = String(now);
  let ok = false;
  let status = 0;
  try {
    const res = await fetchImpl(c.url, { method: "POST", headers: { "Content-Type": "application/json", "X-Ryuge-Timestamp": timestamp,
      "X-Ryuge-Signature": signatureFor(c.secret, c.path, timestamp, body) }, body, signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined });
    status = res.status;
    ok = res.status === 200 || res.status === 409;
  } catch {
    ok = false;
  }
  const attempts = Number(n.attempts || 0) + 1;
  if (ok) await doc.ref.update({ status: "sent", sentAt: new Date(now), attempts, lastStatus: status });
  else {
    const pauseMs = Math.min(6 * 3600e3, 60e3 * 2 ** Math.min(attempts, 9));
    await doc.ref.update({ status: attempts >= MAX_ATTEMPTS ? "failed" : "pending", attempts, lastStatus: status, nextAt: new Date(now + pauseMs) });
  }
  return ok;
}

// Send what is due (a few at a time). Safe to run from several places: a notice already sent is skipped.
async function deliverDue(db, { env = process.env, fetchImpl = globalThis.fetch, now = Date.now(), limit = 20 } = {}) {
  if (!config(env).enabled) return { sent: 0, tried: 0 };
  const due = (await db.collection(NOTICES).where("status", "==", "pending").limit(100).get()).docs
    .filter((d) => { const t = d.data().nextAt; return (t?.toMillis ? t.toMillis() : Number(new Date(t))) <= now; }).slice(0, limit);
  let sent = 0;
  for (const doc of due) if (await sendOne(db, doc, { env, fetchImpl, now })) sent += 1;
  return { sent, tried: due.length };
}

// Keep, then try to send now (never throws: a notice must never break the payment or shipping that raised it).
async function notify(db, notice, { env = process.env, fetchImpl = globalThis.fetch, log = console } = {}) {
  try {
    if (!(await record(db, notice, env))) return false;
    const doc = await db.collection(NOTICES).doc(String(notice.id).replace(/\//g, "_")).get();
    await sendOne(db, doc, { env, fetchImpl, now: Date.now() });
    return true;
  } catch (error) {
    log.error("Factory notice failed:", notice?.type, String(error?.message || "").slice(0, 120));
    return false;
  }
}

module.exports = { NOTICES, SITE_ID, TYPES, MAX_ATTEMPTS, config, signatureFor, sanitize, record, sendOne, deliverDue, notify };
