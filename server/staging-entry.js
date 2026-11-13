"use strict";
// Disposable sandbox-only entrypoint. Never load the production Firebase app.
const http = require("node:http");
const required = [
  "STRIPE_SECRET_KEY",
  "STRIPE_INVENTORY_WEBHOOK_SECRET",
  "SANDBOX_REDIS_URL",
];
const hasAllCredentials = required.every((key) => Boolean(process.env[key]));
const testKeyOnly = /^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY || "");
const enabled = process.env.INVENTORY_ENABLED === "true";
const staging = process.env.INVENTORY_STAGING_ONLY === "true";

if (staging && enabled && hasAllCredentials && testKeyOnly) {
  require("./sandbox-checkout");
} else {
  // Safe mode prevents live Stripe/Firebase access and any checkout.
  http.createServer((req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/health" || req.url === "/") {
      res.writeHead(200);
      return res.end(JSON.stringify({
        environment: "sandbox",
        paymentReady: false,
        inventoryEnabled: false,
      }));
    }
    res.writeHead(503);
    res.end(JSON.stringify({ error: "SANDBOX_NOT_CONFIGURED" }));
  }).listen(Number(process.env.PORT || 10000), "0.0.0.0");
}
