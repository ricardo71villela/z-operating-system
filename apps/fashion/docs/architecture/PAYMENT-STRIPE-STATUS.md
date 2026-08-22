# Z Fashion — Payment (Stripe): Status

## Purpose
Records the decision closing ponto 1 of the "o que falta" review
(2026-08-21): Payment had been the last direct checkout blocker,
deliberately left open in `ACCOUNT-AND-IDENTITY.md` pending a PSP
decision. Stripe is the chosen provider. This document records what was
configured now, and exactly what "going live" still requires — the same
"configured before the official connection" pattern already used by
Z Studio's platform billing adapters and Z Jobs's `billing.ts`.

## What "configured, not yet connected" means here
- `payment.js`: a `PaymentIntent` domain model whose status enum
  mirrors Stripe's own real `PaymentIntent` lifecycle exactly (not a
  Z Fashion-invented vocabulary needing a translation layer against
  Stripe's webhook payloads later) — `requires_payment_method →
  requires_confirmation → processing → succeeded/failed`, with
  `refunded` reachable only from `succeeded`.
- `fashion.orders` gained `stripe_payment_intent_id`,
  `stripe_customer_id`, `payment_status`, `payment_amount_minor_units` —
  mirrored by a SQL trigger enforcing the same transition graph
  independently.
- `fashion.stripe_webhook_events` — the standard idempotency table a
  real webhook handler needs, since Stripe's own delivery guarantee is
  at-least-once, never exactly-once.

## PCI-DSS boundary (non-negotiable, already enforced structurally)
No code or column added here ever receives, models, or stores raw card
data (number, CVC, expiry). `stripePaymentIntentId`/`stripeCustomerId`
are opaque Stripe-issued references — meaningless without a live Stripe
account to resolve them, never reconstructable into a card number on
their own. Real card capture happens client-side via Stripe.js/Elements,
which this repository does not need to touch at all — that is precisely
why PCI scope stays outside Z Fashion's own systems.

## What "going live" actually requires (not done here, deliberately)
1. **A real Client-facing checkout flow.** No `fashion-web` client
   surface exists yet (see `ZOS-ALIGNMENT.md`), and no API endpoint
   calls `stripe.paymentIntents.create()` yet — `payment.js` is pure
   domain logic with zero I/O, same discipline as every other module in
   `fashion-domain`. The API layer that actually calls the Stripe SDK is
   unbuilt, the same gap `insertShipment()`/`insertReturn()` already
   flagged for Order creation generally.
2. **Real credentials.** `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
   — test-mode keys first, live-mode keys only after a deliberate,
   separate go-live decision, never defaulted or assumed present.
3. **A webhook endpoint** that verifies Stripe's signature (using
   `STRIPE_WEBHOOK_SECRET`), checks `fashion.stripe_webhook_events` for
   the event id before acting, and calls `transition()` accordingly —
   `payment.js`'s `transition()` is ready to be called from it, but
   nothing calls it yet.
4. **A Stripe account for the ZOS organization**, in test mode initially
   — genuinely outside this repository's scope, a business/account-setup
   step, not a code change.
5. **Reconciling `stripeCustomerId` with the ZOS canonical identity
   question** already flagged in `ACCOUNT-AND-IDENTITY.md` — a Client's
   Stripe Customer id is a third identity reference alongside
   `auth.users` and the still-unregistered `zos.persons` binding; worth
   resolving together rather than adding a fourth reference later.

## Status
Configured, not connected

## Last Updated
2026-08-21
