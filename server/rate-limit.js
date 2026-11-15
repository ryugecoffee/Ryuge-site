"use strict";
// Fixed-window limiter per key (client address). In-memory is acceptable for the single
// sandbox instance: it bounds signature guessing, request storms and stock-holding abuse.
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

function rateLimitMiddleware(allow) {
  return function limitRequests(req, res, next) {
    if (!allow(req.ip || "unknown")) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(429).json({ error: "RATE_LIMITED" });
    }
    return next();
  };
}

module.exports = { createRateLimiter, rateLimitMiddleware };
