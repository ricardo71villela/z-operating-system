# Z Fashion — Account & Client Identity

## Purpose
Registers the finding made while closing the "Conta do Cliente" gap in the
customer-side audit (2026-08-21): `fashion.carts` and `fashion.orders`
carried no Client identity at all until this pass — an Order could not be
attributed to anyone, so order history could never have existed even in
principle, regardless of what account UI got built on top. This document
records what was fixed now, and what remains open.

## What "Conta do Cliente" actually needs, restated
From the earlier architecture reflection (2026-08-21): measurement profile,
unified order/return history, Wishlist, following Corners, relevant
notifications. Of these, **Wishlist** and **Corner Follow** are genuinely
new domain concepts (`account.js`) — **order/return history** is not a new
concept at all once Client identity exists, it is a query over
`fashion.orders` filtered by `client_user_id` (via `cart_id`). Building a
separate "OrderHistory" domain module would have been inventing a second
source of truth for data `fashion.orders` already owns.

## What this pass fixed
- `cart.js`'s `emptyCart()` now requires `clientUserId` — a Cart is never
  anonymous. Mirrored in SQL: `fashion.carts.client_user_id`, `not null`,
  referencing `auth.users(id)` directly.
- `account.js`: Wishlist (`Client ↔ Product`) and Corner Follow
  (`Client ↔ Partner`), both idempotent-add, both scoped so a Client only
  ever sees their own entries. Mirrored in SQL as
  `fashion.wishlist_items` / `fashion.corner_follows`, primary-keyed on the
  pair so idempotency is structural, not just an application check.
- **Address book** (`address.js`, 2026-08-21) — the last direct checkout
  blocker from the original priority list. Shipping/billing Addresses,
  reusing `@zos/geography`'s country validation (the same check
  partner.js already runs), with default-exclusivity enforced both in
  `addAddress()` and, independently, a SQL trigger
  (`fashion_client_addresses_single_default`). RLS scoped so a Client only
  ever sees their own rows.

## Deliberately out of scope for this pass
- **Guest checkout.** A Cart without a Client is not supported —
  `emptyCart()` throws without one. If guest checkout is ever wanted, it
  is a real product decision (how does a guest Order later get claimed by
  an account?), not a default to slip in quietly.
- **Payment methods (saved cards, etc.).** Still open, but Stripe as the
  PSP is now decided and configured (`payment.js`, 2026-08-21) — see
  PAYMENT-STRIPE-STATUS.md. Saved/reusable payment methods specifically
  (a Client choosing a card at checkout without re-entering it) is a
  Stripe Payment Method / Customer feature this document's "going live"
  list doesn't detail yet, deferred until the real checkout API exists.
- **Client measurement profile.** Still open — distinct from the size-grid
  conversion tables themselves (resolved, `size-grid.js`, 2026-08-21): this
  is a Client saving their own measurements/preferred size once, not the
  conversion logic between systems.

## Resolved after this document was first written
- **Order tracking / Return initiation flow** (2026-08-21) — resolved via
  `shipment.js` (per-Partner fulfillment state machine) and `return.js`
  (Return request lifecycle, gated on the 14-day window and the Cosmetics
  seal exception). See ZOS-ALIGNMENT.md "Resolved" for the full writeup;
  not duplicated here.

## Resolved: canonical identity binding (2026-08-21)
`client_user_id` points at `auth.users(id)` — that local-identity-first
shape does not change (Cart/Wishlist/Corner Follows/Address all keep
referencing `auth.users(id)` directly, same as before). What changed:
Z Fashion is now a registered `domain_code` (`fashion` / `client`) in the
ZOS Identity Bridge, following the exact precedent Z Studio already set
(`20260817221500_zos_studio_identity_bridge_v1.sql`) rather than inventing
a new pattern — `20260821260000_zos_fashion_identity_bridge_v1.sql`
extends `platform_internal.register_local_person_identity()`,
`zos_api.ensure_current_identity_binding()`,
`zos_api.current_identity_bindings()`, and both `zos.registry_bindings`
RLS policies with the `fashion`/`client` case, `create or replace`
alongside Find/Jobs/Studio, never replacing their semantics.

A new `fashion.clients` table (id = `auth.users.id`, mirrors
`studio.accounts` exactly) is the anchor an `AFTER INSERT` trigger
(`fashion.register_client_identity()`) attaches to — it holds no
Fashion-specific data itself, Cart/Wishlist/Address stay exactly where
they already were. `public.zfashion_ensure_client()` (mirroring
`public.zstudio_ensure_account()`) is the one RPC a future Client-facing
surface calls, once, at first real engagement — it idempotently creates
the local `fashion.clients` row and links it through the bridge to the
caller's canonical `zos.persons` identity, returning that person id.

Not yet done, correctly out of scope for this pass: nothing in
`fashion-partner`'s API or any prototype actually calls
`zfashion_ensure_client()` yet, since no real Client-facing surface
exists to call it from (`fashion-web` is still unbuilt). The bridge is
ready; nothing invokes it in production yet — the same "configured, not
yet connected" shape as PAYMENT-STRIPE-STATUS.md.

## Status
Draft

## Last Updated
2026-08-21
