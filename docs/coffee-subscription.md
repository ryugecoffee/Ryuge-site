# 珈琲の定期便: backend ①, the customer's page ② and what must be done before sign-ups reopen (2026-11-18)

Code: `server/coffee-subscription-plan.js` (rules), `-records.js` (Stripe events → Firestore), `-checkout.js`
(sign-up, off by default), `-stripe.js` (skips, changes, cancellation on Stripe), `-calendar.js` (closed days).
② the customer's page: `server/coffee-subscription-account.js` (API), `src/pages/SubscriptionApplyPage.jsx`
(`/subscription/apply`, the 定期購入 final confirmation), `src/pages/SubscriptionManagePage.jsx` (`/subscription/manage`).
Verification against Stripe test mode: `server/coffee-subscription-stripe-e2e.js` (by hand, test-mode key only).

## State
- **Off.** `POST /coffee-subscription/checkout` answers 404 unless `COFFEE_SUBSCRIPTION_ENABLED=true` and the five price
  ids `STRIPE_PRICE_COFFEE_SUB_1..4` and `STRIPE_PRICE_COFFEE_SUB_FIRST` are set. No live prices exist.
- The store keeps sign-ups paused (`SUBSCRIPTIONS_PAUSED` in `src/productData.js`); the old plans' API answers 403.
- Webhook events of other subscriptions and of single orders are not touched (only `metadata.kind = coffee-subscription-v2`).

## ② The customer's page (off: `COFFEE_SUBSCRIPTION_MANAGE_ENABLED` unset)
- Separate switch from sign-ups; every route under `/coffee-subscription/account` answers 404 while it is off.
- Sign-in: a link mailed to the subscription's email, valid 15 minutes, usable once (only its SHA-256 is stored); then
  a 30-minute session (Bearer, hash stored). The same answer whether or not the email is known. Limits: 10 sign-in
  requests per connection per 15 minutes; 3 mails per email per 15 minutes (Firestore, all instances). Each request
  checks that the session's email still owns the contract; only 珈琲の定期便 contracts are reachable (old plans never).
- Changes: frequency (from a changeable month), skip / unskip a month, the preference, the delivery address (name,
  postal code, prefecture, city, line 1–2, phone), cancellation (preview, then confirm with its key). Each change has a
  request id: sent twice, applied once. Confirmation mails go through the shop's mail account.
- Address: Firestore and the Stripe customer (shipping + `metadata.coffeeShippingVersion`) are written together; when
  two changes cross, the last one recorded is pushed to Stripe again. Deliveries being prepared or shipped (status set by
  the shipping work, ④) keep their address.
- Card and invoices: Stripe's customer portal with a configuration limited to the card and invoice history (no address,
  plan or cancellation there): `account.PORTAL_CONFIGURATION`, its id in `STRIPE_PORTAL_CONFIGURATION_ID`. Stripe
  refuses portal links to cancel or change the plan with this configuration (verified in test mode).
- Stripe Checkout gives the subscription its own card, which Stripe charges before the customer's default card (verified
  in test mode): a card changed in the portal would not be used. Before the portal opens, the subscription's card is
  made the customer's default and the subscription's own is removed (`prepareCardChange`); the next charge then uses
  the card set in the portal (verified: January paid with the new card).
- Verified in a browser (test mode): the portal opens with the shop's headline, lists past invoices (¥3,000 first,
  monthly amounts, paid), offers "add a card / use as default", and shows no cancel, plan change or address editing.
  Submitting a card from the verification environment is refused by Stripe because that environment's network proxy
  adds the server key to the browser's calls to api.stripe.com; the change itself was checked through the API.
- The final confirmation screen states everything of 特定商取引法 第12条の6 next to the button; the same terms are
  repeated next to Stripe's pay button (`custom_text`). The wording is provisional (`LEGAL_TEXT_REVIEWED = false`).

## Operating rules (CEO, 2026-11-18)
- Billing: the 1st of each month at 09:00 JST (00:00 UTC; Stripe counts months in UTC, so 00:00 JST would slide to
  the last day of the previous month after a 30-day month). Stripe makes the invoice as a draft and charges it about an
  hour later.
- **Payment failure**: Stripe's existing automatic retries are kept (Dashboard → Billing → Revenue recovery). The code
  assumes no number of retries or days. Unpaid months are never shipped. When Stripe finally ends the subscription
  (`customer.subscription.deleted`), its status and `endedReason` (e.g. `payment_failed`) are recorded.
- **Late payment**: after a payment completes, a delivery whose date has passed goes out from the next working day,
  within 3 working days (`shipBy`). Two late deliveries in a month, a late one reaching the next planned delivery, or
  one that cannot be scheduled are held as `needs_review` (month and contract flagged `LATE_DELIVERIES_OVERLAP` /
  `LATE_DELIVERY_UNSCHEDULABLE`). No delivery is made twice or before payment.
- **Duplicate subscription** (same email): no deliveries for the second one; flagged `DUPLICATE_SUBSCRIPTION` for the
  CEO. Nothing is cancelled or refunded automatically.
- **Cancellation before the first 200 g is shipped**: the first delivery is stopped and ¥3,000 is proposed for refund
  (`refundProposal`, `awaiting_ceo_approval`). Nothing is refunded automatically. After shipping: decided case by case
  under the refund policy (`docs/refunds.md`).
- **Closed days**: Saturdays, Sundays and public holidays; extra closures (year-end, …) go in `CLOSURES`. Shipping dates
  on a closed day move to the next working day. Holidays are listed for 2026–2027 and must be extended every year.

## Required before sign-ups reopen (each needs CEO approval)
1. **Stripe webhook events**: add `checkout.session.expired` (frees the email reservation when a Checkout page expires;
   without it a new sign-up for that email waits up to 30 minutes), and make sure `checkout.session.completed`,
   `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated` and `customer.subscription.deleted` are sent
   to `/stripe-inventory-webhook`.
2. **Real Checkout in a browser (not yet verified)**: pay one test-mode Checkout page with a test card and check: ¥3,000
   today, the subscription trialing until 09:00 JST on the 1st of the start month, the shipping address and preference
   recorded, one first delivery. (Checkout's amount due today and every later step were verified through the API; the
   page itself could not be opened from the verification environment.)
3. ② the customer's management page and the 定期購入 confirmation screen: built (this PR), off until approved.
4. Live products and prices (¥3,000 / ¥5,800 / ¥8,550 / ¥11,200 monthly, ¥3,000 first) created by the CEO, their ids set
   on the payment server, then `COFFEE_SUBSCRIPTION_ENABLED=true`, then `SUBSCRIPTIONS_PAUSED` lifted in the store.
5. Run `server/coffee-subscription-stripe-e2e.js` once more with a test-mode key (with Customer portal write, so the
   card portal is checked too).
6. The final confirmation screen's wording checked by a specialist; then `LEGAL_TEXT_REVIEWED = true`
   (`src/lib/coffeeSubscriptionTerms.js`).
7. The customer portal configuration created in live mode (`account.PORTAL_CONFIGURATION`) and its id set as
   `STRIPE_PORTAL_CONFIGURATION_ID`; then `COFFEE_SUBSCRIPTION_MANAGE_ENABLED=true` (CEO approval).
8. A link to `/subscription/manage` where customers will find it (the confirmation mail and the store), once open.

## Verified (Stripe test mode with test clocks + Firestore emulator, 57/57)
First payment only ¥3,000; monthly start (1st–15th → next month, 16th– → the month after) at 09:00 JST on the 1st;
skipped month not charged or shipped; frequency changes without pro-rating; cancellation (paid month, initial period,
with a schedule, before 09:00 on the 1st, in the draft hour); failed payments never shipped, late payment shipped once;
every event replayed twice at once and in reverse order without change; two changes at the same moment; one Checkout
page for simultaneous sign-ups; duplicate subscription never shipped to.
