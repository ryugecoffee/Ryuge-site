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
