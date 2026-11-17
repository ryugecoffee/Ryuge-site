# Refunds and partial cancellations (design, 2026-11-17)

Core: `server/refunds.js`. Route and webhook: `server/index.js` (see "Wiring").

## What is refunded
- A request names lines (`{ id, quantity, shipped }`) and optionally the shipping. `shipped` must be stated for every
  line (the store keeps no shipping records yet; the CEO states it, and it is kept in the audit record).
- Line amounts are what the customer really paid: list price × quantity minus that line's share of the coupon (shared in
  proportion to list totals, largest remainder, so the lines add up to the order's subtotal exactly). k of the remaining
  units of a line are refunded proportionally; the last unit takes exactly the rest, so partial refunds always add up.
- Shipping is refunded at most once, the amount actually charged for it (after FREESHIP).
- Never more than ordered (refunded + in-flight ≤ ordered, per line), never more than the order total, never more than
  Stripe still holds on the charge.

## Stock
Given back only after Stripe reports the refund **succeeded**, in the same Firestore transaction that records it, and only:
- for units stated as not shipped,
- up to what the order's **paid stock reservation** actually took (orders paid while inventory was off took none),
- with the shared Brazil lot (`inventoryLots/brazil-amarelo-bourbon`) given back together with its products.
If the stock counters disagree (e.g. corrected by hand), the refund is kept, no stock is changed, and the order and the
refund are flagged for review.

## Flow and safety
1. **preview** (writes nothing): the order, what was already refunded, Stripe's charge, each line's amount and stock
   effect, and a `planHash`.
2. The CEO approves that preview.
3. **apply** with the `planHash`, the approval text and a trusted actor: refused with `PLAN_CHANGED` if anything changed
   since the preview (the order's refund ledger has a version bumped by every change). Records the approved refund
   (`orderRefunds/{id}`, status `approved`) and holds its units (in-flight) before Stripe is called.
4. Stripe refund with an idempotency key and `metadata.orderRefundId`. Answers:
   - succeeded → settled: ledger, stock and the refund record (`refunded`) in one transaction;
   - pending → `stripe_pending`, settled later by the webhook;
   - refused (4xx) → `failed`, the units are free again;
   - no answer (network, 5xx) → stays `approved`; **resume** looks the refund up at Stripe by `orderRefundId` first and
     creates it only if Stripe has none, so a refund is never made twice.
5. **Webhook** `charge.refunded` → `syncRefunds`: settles our refunds (idempotent), records refunds made elsewhere
   (Stripe dashboard) under `refundLedger.external` with `needsReview`, and **never gives stock back for them**. New
   refunds on such an order need `acknowledgeExternalRefunds`.

## Audit
`orderRefunds/{id}`: plan, amounts, approval text, actor, Stripe refund id, stock given back, review flags and every
status transition. The order keeps `refundLedger` (per line: refunded quantity, amount, units restocked; shipping;
in-flight; external refunds), `amountRefunded` and `status` (`partially_refunded` / `refunded`).

## Wiring
- `POST /internal/orders/refund` with `mode: "preview" | "apply" | "resume"`. **Off (404)** unless Render has
  `ORDER_ADMIN_TOKEN` (32+ random characters); the caller sends it in `X-Order-Admin-Token`. Rate limited. The actor
  recorded is set by the server (`ceo:order-admin-token`), never taken from the request. Remove the variable to switch
  it off again.
  - preview: `{ mode, orderId, lines: [{ id, quantity, shipped }], refundShipping, acknowledgeExternalRefunds }`
  - apply: the same plus `planHash` and `approval` (who approved, when); optional `refundId` (UUID) to make a resend safe
  - resume: `{ mode, refundId }`
- Webhook: `charge.refunded` (already subscribed) and, if added in Stripe, `charge.refund.updated` call
  `syncRefunds`. Without `charge.refund.updated`, a refund Stripe finishes later is settled by `resume`.
- Later, the Factory (Jennifer) signed CEO approval calls the same functions (like `server/factory-inventory-api.js`).

## Next
- Shipping records per line, so `shipped` can come from data instead of being stated.
