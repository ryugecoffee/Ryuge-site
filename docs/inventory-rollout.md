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

## Production status (2026-11-15)
- Storefront builds pick the payment server by `VERCEL_ENV`: production keeps `https://ryuge-site.onrender.com`
  and the live key; previews/local use only the sandbox and a `pk_test_` key (`src/lib/paymentEnv.js`). The
  subscription API refuses a live key outside production.
- Production inventory stays OFF (`INVENTORY_ENABLED` unset): the storefront behaves as before (no gating).
  Turning it on requires real packed-bag counts entered by the CEO; `inventory/enma-karamo` = 15 is provisional.
- Factory → Render signed API currently targets the sandbox preview collections only.
- Legacy one-shot smoke runners that wrote to official collections were removed.
- Pending: nodemailer (<=10.1.3, unused `raw` option advisory) and firebase-admin 13 transitive advisories need
  major upgrades with regression tests.

## Production launch checklist (2026-11-17)
Code (PRs #5 → #6 → #7):
- #5 Every one-time checkout is priced from `server/catalog.js` (inventory on or off); only id and quantity come from
  the browser.
- #6 Paid orders are recorded in `orders/{paymentIntentId}` from the signed Stripe event (refunds too), whenever
  `STRIPE_INVENTORY_WEBHOOK_SECRET` is set.
- #7 Only products with `managedStock: true` (= `INVENTORY_MANAGED_SKUS` in the storefront) are stock-gated. Abandoned
  holds are reconciled in the background (on stock look-ups and checkouts, at most once a minute, and every 5 minutes):
  no external scheduler, and no composite Firestore index is needed.

Settings (CEO, production; secrets only in Stripe and Render, never in GitHub or chat):
1. Stripe (live): webhook endpoint `https://ryuge-site.onrender.com/stripe-inventory-webhook` with
   `payment_intent.succeeded`, `payment_intent.canceled`, `charge.refunded`.
2. Render (production): `STRIPE_INVENTORY_WEBHOOK_SECRET` = that endpoint's signing secret. Orders start being
   recorded; stock gating stays off.
3. Firestore (production): `inventory/{sku}` = `{ ready: <packed, unsold bags counted by the CEO>, held: 0, sold: 0 }`
   for every managed product. Never from green-bean weight. The provisional `enma-karamo = 15` must be replaced by the
   real count.
4. Render (production): `INVENTORY_ENABLED=true` (stock gating on). Check `/inventory/availability?ids=…` shows the
   counted numbers, then a real purchase of one bag.

## New beans and promotional beans (2026-11-17, PR #9)
- On sale with inventory on (`requiresInventory`): Brazil Amarelo Bourbon Natural (promo, ¥1,000), Ethiopia Jimma
  Washed G1 (¥1,300), Guatemala Quequesques Washed SHB (¥1,300), Peru Andes Blue Washed G1 (¥1,300). With inventory
  off they show "coming soon" and the server refuses them, so the sales cap always holds.
- Sales cap: `inventory/{sku}` = `{ ready: 15, held: 0, sold: 0 }` for each of the four (CEO: 15 bags each). `ready`
  is the number of 100 g bags that may be sold, not green-bean weight. The product pages say the beans are roasted and
  packed after the order and that the shipping date comes with the order confirmation; update this once real packed
  stock and shipping dates are confirmed.
- Promotional beans (`promo: true` in `server/catalog.js` and `src/productData.js`): at most 2 bags per order and per
  customer across orders, by e-mail and by delivery address (`promoLedger/{sha256}` = `{ held, bought }`, held with
  the stock in one transaction; released on cancel/abandon, counted as bought on payment). To change the promotional
  bean, move `promo: true` (and its ribbon) to another product in both files.
