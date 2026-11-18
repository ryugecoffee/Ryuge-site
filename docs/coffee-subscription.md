# 珈琲の定期便: backend ① and what must be done before sign-ups reopen (2026-11-18)

Code: `server/coffee-subscription-plan.js` (rules), `-records.js` (Stripe events → Firestore), `-checkout.js`
(sign-up, off by default), `-stripe.js` (skips, changes, cancellation on Stripe), `-calendar.js` (closed days).
Verification against Stripe test mode: `server/coffee-subscription-stripe-e2e.js` (by hand, test-mode key only).

## State
- **Off.** `POST /coffee-subscription/checkout` answers 404 unless `COFFEE_SUBSCRIPTION_ENABLED=true` and the five price
  ids `STRIPE_PRICE_COFFEE_SUB_1..4` and `STRIPE_PRICE_COFFEE_SUB_FIRST` are set. No live prices exist.
- The store keeps sign-ups paused (`SUBSCRIPTIONS_PAUSED` in `src/productData.js`); the old plans' API answers 403.
- Webhook events of other subscriptions and of single orders are not touched (only `metadata.kind = coffee-subscription-v2`).

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
3. ② the customer's management page (frequency, skip, cancel, preference, email sign-in) and the 定期購入 confirmation
   screen required by law.
4. Live products and prices (¥3,000 / ¥5,800 / ¥8,550 / ¥11,200 monthly, ¥3,000 first) created by the CEO, their ids set
   on the payment server, then `COFFEE_SUBSCRIPTION_ENABLED=true`, then `SUBSCRIPTIONS_PAUSED` lifted in the store.
5. Run `server/coffee-subscription-stripe-e2e.js` once more with a test-mode key.

## Verified (Stripe test mode with test clocks + Firestore emulator, 57/57)
First payment only ¥3,000; monthly start (1st–15th → next month, 16th– → the month after) at 09:00 JST on the 1st;
skipped month not charged or shipped; frequency changes without pro-rating; cancellation (paid month, initial period,
with a schedule, before 09:00 on the 1st, in the draft hour); failed payments never shipped, late payment shipped once;
every event replayed twice at once and in reverse order without change; two changes at the same moment; one Checkout
page for simultaneous sign-ups; duplicate subscription never shipped to.
