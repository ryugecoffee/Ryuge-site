"use strict";
// Fixed-window limiters for the single sandbox instance (in-memory). They bound
// signature guessing, request storms and stock-holding abuse.
const net = require("node:net");

function createRateLimiter({ limit = 20, windowMs = 60 * 1000, clock = Date.now } = {}) {
  const hits = new Map();
  return function allow(key) {
    const now = clock();
    const entry = hits.get(key);
    if (!entry || now - entry.start >= windowMs) {
      if (hits.size > 5000) hits.clear();
      hits.set(key, { start: now, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}

// Render is fronted by Cloudflare, whose edge and Render's own proxy nodes rotate, so
// req.ip (last proxy hop) is not a stable client identity. Cloudflare overwrites
// CF-Connecting-IP with the address it received the request from, so clients cannot
// spoof it through the edge. Fall back to the proxy-derived address otherwise.
function clientKey(req) {
  const header = typeof req.get === "function" ? req.get("cf-connecting-ip") : undefined;
  const candidate = typeof header === "string" ? header.trim() : "";
  if (candidate && net.isIP(candidate)) return { key: "cf:" + candidate, source: "cf-connecting-ip" };
  return { key: "ip:" + (req.ip || "unknown"), source: "proxy-address" };
}

// Per-client limit plus a global ceiling, so a wrong or rotating client identity can
// never make the endpoint unlimited.
function rateLimitMiddleware(allowClient, allowGlobal = () => true) {
  return function limitRequests(req, res, next) {
    const { key, source } = clientKey(req);
    // Diagnostic only: which identity source is used (never the address itself).
    res.setHeader("X-RateLimit-Key-Source", source);
    if (!allowGlobal("global") || !allowClient(key)) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(429).json({ error: "RATE_LIMITED" });
    }
    return next();
  };
}

module.exports = { createRateLimiter, rateLimitMiddleware, clientKey };
