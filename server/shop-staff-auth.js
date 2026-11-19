"use strict";

// Sign-in of the shop's staff for the shipping page (/admin/subscription-shipping), 2026-11-19.
// Ryuge-site has no staff accounts (single tasks use one-off tokens), and a shared token kept in a browser can be copied
// and never expires. Instead, the same pattern as the customers' page (②):
//  - only addresses listed in SHOP_STAFF_EMAILS may sign in; a link is mailed to that address (15 minutes, once; only its
//    SHA-256 is stored), the same answer whether or not the address is listed;
//  - the link gives a session (Bearer, its SHA-256 stored) of SESSION_TTL; every request checks on the server that the
//    session is alive and that its address is still listed (removing an address ends its sessions at once);
//  - signing out deletes the session on the server.
// Records hold a key of the address (SHA-256), never the address. Off unless COFFEE_SUBSCRIPTION_FULFILLMENT_ENABLED=true
// and at least one valid address is listed.

const crypto = require("crypto");
const express = require("express");
const { createRateLimiter, clientKey } = require("./rate-limit");

const LOGINS = "shopStaffLogins";
const SESSIONS = "shopStaffSessions";
const LIMITS = "shopStaffLoginLimits";
const LOGIN_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // a packing session; then sign in again
const EMAIL_LIMIT = { max: 3, windowMs: 15 * 60 * 1000 };
const EMAIL_RE = /^[^\s@,]{1,100}@[^\s@,]{1,150}\.[^\s@,]+$/;

class StaffAuthError extends Error { constructor(code, status = 400) { super(code); this.code = code; this.status = status; } }
const sha = (v) => crypto.createHash("sha256").update(String(v)).digest("hex");
const newToken = () => crypto.randomBytes(32).toString("base64url");
const toMs = (v) => (v?.toMillis ? v.toMillis() : v instanceof Date ? v.getTime() : Number(v || 0));
const normalize = (email) => String(email || "").trim().toLowerCase();

function configFrom(env = process.env) {
  const staff = String(env.SHOP_STAFF_EMAILS || "").split(",").map(normalize).filter((e) => EMAIL_RE.test(e));
  return { enabled: env.COFFEE_SUBSCRIPTION_FULFILLMENT_ENABLED === "true" && staff.length > 0, staffKeys: new Set(staff.map(sha)),
    siteUrl: String(env.SITE_URL || "https://ryuge.biz").replace(/\/+$/, "") };
}

async function takeAllowance(db, key, now) {
  const ref = db.collection(LIMITS).doc(key);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const recent = (snap.exists ? snap.data().sentAt || [] : []).map(toMs).filter((t) => t > now - EMAIL_LIMIT.windowMs);
    if (recent.length >= EMAIL_LIMIT.max) return false;
    tx.set(ref, { sentAt: [...recent, now].map((t) => new Date(t)), updatedAt: new Date(now) });
    return true;
  });
}

async function requestLogin({ db, config, sendMail, email, linkPath, now }) {
  const address = normalize(email);
  if (!EMAIL_RE.test(address)) throw new StaffAuthError("EMAIL_REQUIRED");
  const key = sha(address);
  if (!config.staffKeys.has(key)) return { sent: false };
  if (!(await takeAllowance(db, key, now))) return { sent: false };
  const token = newToken();
  await db.collection(LOGINS).doc(sha(token)).create({ staffKey: key, expiresAt: new Date(now + LOGIN_TTL_MS), usedAt: null, createdAt: new Date(now) });
  await sendMail({ to: address, subject: "【龍華珈琲】定期便 発送管理のログインリンク",
    text: ["定期便 発送管理ページへのログインリンクです。", "", `${config.siteUrl}${linkPath}#login=${token}`, "",
      "有効期限は15分で、1回だけ使えます。ログイン後は2時間有効です。", "お心当たりがない場合は、このメールを破棄してください。"].join("\n") });
  return { sent: true };
}

async function startSession({ db, config, token, now }) {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(String(token || ""))) throw new StaffAuthError("LOGIN_LINK_INVALID", 401);
  const ref = db.collection(LOGINS).doc(sha(token));
  const sessionToken = newToken();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new StaffAuthError("LOGIN_LINK_INVALID", 401);
    const login = snap.data();
    if (login.usedAt) throw new StaffAuthError("LOGIN_LINK_USED", 401);
    if (toMs(login.expiresAt) <= now) throw new StaffAuthError("LOGIN_LINK_EXPIRED", 401);
    if (!config.staffKeys.has(login.staffKey)) throw new StaffAuthError("LOGIN_LINK_INVALID", 401);
    tx.update(ref, { usedAt: new Date(now) });
    tx.create(db.collection(SESSIONS).doc(sha(sessionToken)), { staffKey: login.staffKey, expiresAt: new Date(now + SESSION_TTL_MS), createdAt: new Date(now) });
  });
  return { sessionToken, expiresAt: new Date(now + SESSION_TTL_MS).toISOString() };
}

const bearer = (header) => /^Bearer ([A-Za-z0-9_-]{40,64})$/.exec(String(header || ""))?.[1] || null;

// The signed-in staff member, checked on the server for every request.
async function authenticate({ db, config, header, now }) {
  const token = bearer(header);
  if (!token) throw new StaffAuthError("SIGN_IN_REQUIRED", 401);
  const snap = await db.collection(SESSIONS).doc(sha(token)).get();
  if (!snap.exists || toMs(snap.data().expiresAt) <= now || !config.staffKeys.has(snap.data().staffKey)) throw new StaffAuthError("SESSION_EXPIRED", 401);
  return { sessionId: sha(token), staffKey: snap.data().staffKey, actor: `shop-staff:${snap.data().staffKey.slice(0, 12)}` };
}

async function endSession({ db, header }) {
  const token = bearer(header);
  if (token) await db.collection(SESSIONS).doc(sha(token)).delete();
  return { signedOut: true };
}

// Routes /auth/login, /auth/session (POST: start, DELETE: sign out) and a guard for everything after it.
function createAuth({ getDb, sendMail, env = process.env, clock = Date.now, linkPath, log = console,
  loginLimiter = createRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 }) } = {}) {
  const router = express.Router();
  const fail = (res, error) => {
    if (error instanceof StaffAuthError) return res.status(error.status).json({ error: error.code });
    log.error("Staff sign-in failed:", error.message);
    return res.status(500).json({ error: "FAILED" });
  };
  router.post("/auth/login", async (req, res) => {
    if (!loginLimiter(clientKey(req).key)) return res.status(429).json({ error: "RATE_LIMITED" });
    try {
      await requestLogin({ db: getDb(), config: configFrom(env), sendMail, email: req.body?.email, linkPath, now: clock() });
      return res.json({ ok: true }); // the same answer whether or not the address is listed or a mail was sent
    } catch (error) { return fail(res, error); }
  });
  router.post("/auth/session", async (req, res) => {
    if (!loginLimiter(clientKey(req).key)) return res.status(429).json({ error: "RATE_LIMITED" });
    try { return res.json(await startSession({ db: getDb(), config: configFrom(env), token: req.body?.token, now: clock() })); } catch (error) { return fail(res, error); }
  });
  router.delete("/auth/session", async (req, res) => {
    try { return res.json(await endSession({ db: getDb(), header: req.headers.authorization })); } catch (error) { return fail(res, error); }
  });
  const guard = async (req, res, next) => {
    try {
      req.staff = await authenticate({ db: getDb(), config: configFrom(env), header: req.headers.authorization, now: clock() });
      return next();
    } catch (error) { return fail(res, error); }
  };
  return { router, guard };
}

module.exports = { LOGINS, SESSIONS, LIMITS, LOGIN_TTL_MS, SESSION_TTL_MS, StaffAuthError, configFrom, requestLogin, startSession, authenticate,
  endSession, createAuth };
