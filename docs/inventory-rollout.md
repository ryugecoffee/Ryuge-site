# EC inventory rollout (draft; NOT enabled)

This PR is stacked on PR #3 and must NOT be merged into production before a dedicated Render/Firebase/Stripe test environment is ready.

## Current implementation
- Prepared bags are the only sellable units. Raw green-bean purchase weight is *not* sellable inventory.
- Firestore `inventory/{sku}`: `ready` (packed, unsold bags), `held` (pending payment), `sold` (cumulative paid sales).
- `inventoryReservations/{uuid}`: reserved item quantities + PaymentIntent ID.
- The server transaction reserves atomically; Stripe signed `payment_intent.succeeded` confirms the order and reduces stock. `payment_intent.canceled` releases the hold. Duplicate webhook deliveries are idempotent.
- Authenticated `POST /inventory/reconcile` reviews stale holds against Stripe, cancels only cancellable intents *before* releasing stock, and flags unresolved items. Run this with a secure scheduler; it is **not scheduled yet**.
- `GET /inventory/availability?ids=...` gives customer-visible available counts.
- Browser stock display is advisory; only server-side transaction prevents overselling.
- The inventory paths are gated by `INVENTORY_ENABLED=true`. Current behavior remains unchanged when disabled.
- Payment server canonical prices are provisional, fixed to the current product catalogue in `server/index.js`. A future sale/price management workflow must update prices on the payment server too.

## 2 kg example
Raw coffee beans 2,000g x 0.90 roasting yield = 1,800g roasted.
Plan up to 15 x 100g = 1,500g; 300g remains for sampling, losses, store and contingency.
**Do not seed 15 unless that many 100g bags have actually been packed and reserved for online sale.**
If only 5 bags are packed, initialize `ready:5, held:0, sold:0` for that SKU.

## Activation prerequisites (all mandatory)
1. Create a dedicated **test** Firestore project/collection and Stripe test-mode credentials. Point an isolated Render staging service there.
2. Add Render server environment variables `INVENTORY_ENABLED=true`, `STRIPE_INVENTORY_WEBHOOK_SECRET` and a random `INVENTORY_RECONCILE_TOKEN`. Keep the existing Stripe/Firebase credentials segregated. Do not put secrets in Vercel client variables.
3. Add a Stripe test-mode signed webhook endpoint: `POST https://<render-staging-host>/stripe-inventory-webhook`; subscribe to `payment_intent.succeeded` and `payment_intent.canceled`.
4. Seed test inventory documents explicitly; verify all sold-out/coming-soon products remain unavailable, no product price mismatches, and stock can never go below zero.
5. Run `node --test server/inventory.test.js`, build the frontend, test concurrent checkout attempts, duplicate and out-of-order webhooks, payment failure, canceled payment, retries, abandoned sessions, and two browsers ordering the final bag.
6. Deploy this same server version to Render staging before browser end-to-end testing. The Vercel PR preview alone does NOT deploy `server/index.js` to Render.
7. Configure a secure recurring reconciliation caller before enabling. Pending PaymentIntents must never release inventory without confirmed cancellation.
8. Audit existing one-time and subscription checkout flows, emails, and accounting. Current legacy `/order-complete` notification is browser-triggered, not a verified payment event; production migration must move fulfillment to a trusted payment completion event.
9. Only after explicit final review, configure real stock from physical packed bags and turn the production feature flag on.

## Limitations and TODO
- No live database, Stripe payment, or actual multi-browser checkout test has been executed in this PR.
- Store sales and raw-bean roasting ledger updates remain manual for now.
- There is no user-facing admin stock-adjustment UI. Do not expose an unauthenticated write endpoint.
- Full payment fulfillment idempotency / email delivery move to webhook is not finished.
- The checkout service has its own Render deployment. GitHub/Vercel preview success is not proof of server rollout.

## Factory → Render signed inventory API (preview only)
`POST /internal/factory/inventory-adjust` on the **sandbox** Render service only. It writes only to the
`inventoryPreview*` collections; official `inventory/{sku}` (incl. the provisional 15 bags) is never touched.

Two independent checks must both pass before any write:
1. **Service signature** — `X-Factory-Timestamp` (13-digit ms, ±5 min) and `X-Factory-Signature` =
   hex HMAC-SHA256(secret, `"POST\n/internal/factory/inventory-adjust\n" + timestamp + "\n" + rawBody`).
2. **CEO operation approval** — the signed JSON body has exactly
   `{sku, action: "stock_in"|"retail_sale", quantity 1..1000, requestId, approvedBy, approvedAt}`:
   `requestId` is the Factory approval record UUID (one approval = one operation, idempotent),
   `approvedBy` must equal Render's `FACTORY_CEO_USER_ID`, `approvedAt` (ms) must be ≤ 15 min old.

Responses: 200 `{ok, applied, remaining}` (`applied:false` = duplicate delivery), 401 bad/expired
signature, 403 `CEO_APPROVAL_REQUIRED|CEO_APPROVAL_EXPIRED`, 409 `OUT_OF_STOCK|INVENTORY_REQUEST_ID_CONFLICT`,
400 invalid, 413 body > 4 KB, 429 rate limited (20/min, in-memory), 404 when disabled.
Each applied request writes an audit record `inventoryPreviewAdjustments/{requestId}` (actor, before/after,
approvedAt, signedAt, channel).

Render sandbox env (server-side only; never in GitHub, Vercel client vars or logs):
`FIRESTORE_FACTORY_API_ENABLED=true`, `FACTORY_INVENTORY_HMAC_SECRET` (≥32 random bytes, same value as the
Factory server), `FACTORY_CEO_USER_ID` (CEO's Factory/Supabase user UUID).

## Emulator integration tests
Real Firestore transactions (concurrency, duplicate webhooks, cancellation, reconciliation after restart,
official stock untouched) run against the local emulator only:
```
npm ci --prefix server
npx firebase-tools@13.35.1 emulators:exec --only firestore --project demo-ryuge-inventory \
  "node --test server/inventory-firestore-emulator.test.js"
```

## Production blockers (as of 2026-11-15)
- `src/pages/ProductsPage.jsx` and `src/pages/CheckoutPage.jsx` call the **sandbox** Render URL. Switch to the
  production payment server before any production release.
- Real stock counts must be entered from physically packed bags; `inventory/enma-karamo` = 15 is provisional.
- `server/` still has `nodemailer` (<=10.1.3, `raw` option advisory; not used by our code) and
  `firebase-admin` 13 transitive advisories that require major upgrades; schedule and regression-test.

## Enabling the Factory bridge (sandbox / Preview only; CEO action)
Secrets are generated by the CEO locally and pasted only into provider dashboards; never into
GitHub, chat or logs.
1. Generate once: `openssl rand -hex 32` (64 hex chars).
2. Render `ryuge-inventory-sandbox` → Environment: `FACTORY_INVENTORY_HMAC_SECRET=<value>`,
   `FACTORY_CEO_USER_ID=<CEO Supabase auth user UUID>`, `FIRESTORE_FACTORY_API_ENABLED=true` → save (redeploys).
3. Vercel `ryuge-web-factory` → Environment Variables → **Preview** only (optionally scoped to branch
   `feature/ryuge-inventory-preview-bridge-20261115`): `FACTORY_INVENTORY_HMAC_SECRET=<same value>`,
   `RYUGE_PREVIEW_INVENTORY_BRIDGE_ENABLED=true`. Never set them for Production.
4. Apply Factory migration `20261115030000_ryuge_preview_inventory_approvals.sql` (two partial unique
   indexes on `factory_events`; no data change; existing triggers/indexes unaffected).
5. Check: unsigned `POST /internal/factory/inventory-adjust` must return 401 (enabled) instead of 404.

## Rate limiting
Clients are identified by `CF-Connecting-IP` (Render is behind Cloudflare; proxy hop addresses rotate),
falling back to the proxy address. Checkout: 10/min per client and 120/min global. Factory API: 20/min.
Responses on limited routes carry `X-RateLimit-Key-Source` (source name only, never the address).
