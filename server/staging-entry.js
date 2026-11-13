"use strict";
// A dedicated Render staging entrypoint. Never boot the payment application
// until the operator has provided explicit *sandbox-only* credentials.
// In its default state it only serves a passive configuration health check.
const http = require("node:http");
const required = [
  "STRIPE_SECRET_KEY",
  "STRIPE_INVENTORY_WEBHOOK_SECRET",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "INVENTORY_RECONCILE_TOKEN",
];
const hasAllCredentials = required.every((key) => Boolean(process.env[key]));
const sandboxStripeKey = /^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY || "");
const sandboxDatabaseConfirmed = process.env.FIREBASE_SANDBOX_CONFIRMED === "true";
const enabled = process.env.INVENTORY_ENABLED === "true";
const staging = process.env.INVENTORY_STAGING_ONLY === "true";

if (staging && enabled && hasAllCredentials && sandboxStripeKey && sandboxDatabaseConfirmed) {
  require("./index");
} else {
  const server = http.createServer((req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/health" || req.url === "/") {
      res.writeHead(200);
      res.end(JSON.stringify({ environment: "sandbox", paymentReady: false, inventoryEnabled: false }));
      return;
    }
    res.writeHead(503);
    res.end(JSON.stringify({ error: "SANDBOX_NOT_CONFIGURED" }));
  });
  server.listen(Number(process.env.PORT || 10000), "0.0.0.0");
}
