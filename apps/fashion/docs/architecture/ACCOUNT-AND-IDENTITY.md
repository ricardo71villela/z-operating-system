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

## Deliberately out of scope for this pass
- **Guest checkout.** A Cart without a Client is not supported —
  `emptyCart()` throws without one. If guest checkout is ever wanted, it
  is a real product decision (how does a guest Order later get claimed by
  an account?), not a default to slip in quietly.
- **Address book, saved payment methods.** Still nothing built. Next in
  line after this pass, per the original audit's priority order.
- **Order tracking / returns initiation flow.** `fashion.orders.status`
  exists (`confirmed`/`cancelled`) but there is no Return entity, no
  tracking-state machine, no UI. Still open.
- **Size/measurement profile.** Also still open — a separate, deeper
  concern tied to the size-grid gap already flagged (no concrete
  size-grid values exist yet for any Category, only the *requirement*
  that Clothing/Footwear/Sportswear carry a size — see DOMAIN-SKETCH.md
  Age Segment / MARKETS-AND-I18N.md).

## Open: canonical identity binding
`client_user_id` points directly at `auth.users(id)` — the same
local-identity-first pattern Z Find and Z Jobs already used for their own
human-identity fields (`find/profile`, `jobs/person` in
`20260809213000_zos_identity_bridge_v1.sql`) before either was registered
as a canonical `zos.persons` binding. Z Fashion is not yet a registered
`domain_code` in that bridge, the same situation the bridge migration's own
comment already notes for Z Mobility ("deliberately has no human binding
contract yet because it does not currently own a local human identity
model").

Registering Z Fashion as a supported `domain_code` (mirroring the
`find/profile` / `jobs/person` contracts) would let a Client's Wishlist,
Corner Follows, and Order history bind to the same canonical `zos.persons`
identity their Z Find or Z Jobs activity already uses — one person across
the whole ZOS ecosystem, not a Fashion-local identity island. Not done in
this pass, deliberately scoped smaller (the immediate gap was "Orders have
no owner at all," not "which identity system owns that owner"); worth
doing before Z Fashion's Client-facing account ships for real, not after.

## Status
Draft

## Last Updated
2026-08-21
